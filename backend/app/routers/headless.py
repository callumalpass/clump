"""
Headless session routes using Claude Code's -p (non-interactive) mode.

Provides structured JSON output and streaming for programmatic sessions.
Sessions are stored in per-repo databases at ~/.clump/projects/{hash}/data.db.
"""

import asyncio
from uuid import uuid4
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json

from app.database import get_repo_db
from app.db_helpers import get_repo_or_404
from app.models import Session, SessionStatus
from app.services.headless_analyzer import headless_analyzer, SessionMessage
from app.services.event_manager import event_manager, EventType

router = APIRouter()


class HeadlessSessionCreate(BaseModel):
    """Request to create a headless session."""

    repo_id: int
    prompt: str
    kind: str = "custom"
    title: str = "Headless Session"

    # Claude Code configuration
    permission_mode: str | None = None
    allowed_tools: list[str] | None = None
    disallowed_tools: list[str] | None = None
    max_turns: int | None = None
    model: str | None = None
    system_prompt: str | None = None

    # Session management
    resume_session: str | None = None


class HeadlessSessionResponse(BaseModel):
    """Response from a completed headless session."""

    session_id: int
    claude_session_id: str
    result: str
    success: bool
    cost_usd: float
    duration_ms: int
    error: str | None = None


@router.post("/headless/run", response_model=HeadlessSessionResponse)
async def run_headless_session(data: HeadlessSessionCreate):
    """
    Run a headless Claude Code session and return the complete result.

    This is a blocking endpoint that waits for the session to complete.
    For streaming results, use POST /headless/run/stream instead.
    """
    repo = get_repo_or_404(data.repo_id)

    # Generate session ID upfront so we can track it as "active" during execution
    claude_session_id = str(uuid4())

    async with get_repo_db(repo["local_path"]) as db:
        # Create session record with the session ID already set
        session = Session(
            repo_id=repo["id"],
            kind=data.kind,
            title=data.title,
            prompt=data.prompt,
            status=SessionStatus.RUNNING.value,
            claude_session_id=claude_session_id,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

        # Register session as running for reliable status tracking
        headless_analyzer.register_running(claude_session_id)

        # Emit session created event
        await event_manager.emit(EventType.SESSION_CREATED, {
            "session_id": claude_session_id,
            "repo_path": repo["local_path"],
            "title": data.title,
            "is_active": True,
        })

        try:
            # Run headless session with our pre-generated session ID
            result = await headless_analyzer.analyze(
                prompt=data.prompt,
                working_dir=repo["local_path"],
                session_id=claude_session_id,
                allowed_tools=data.allowed_tools,
                disallowed_tools=data.disallowed_tools,
                permission_mode=data.permission_mode,
                max_turns=data.max_turns,
                model=data.model,
                system_prompt=data.system_prompt,
                resume_session=data.resume_session,
            )

            # Update session record
            session.status = (
                SessionStatus.COMPLETED.value if result.success else SessionStatus.FAILED.value
            )
            session.transcript = result.result
            await db.commit()

            return HeadlessSessionResponse(
                session_id=session.id,
                claude_session_id=claude_session_id,
                result=result.result,
                success=result.success,
                cost_usd=result.cost_usd,
                duration_ms=result.duration_ms,
                error=result.error,
            )

        except Exception as e:
            session.status = SessionStatus.FAILED.value
            await db.commit()
            raise HTTPException(status_code=500, detail=str(e))

        finally:
            # Always unregister when done
            headless_analyzer.unregister_running(claude_session_id)

            # Emit session completed event
            await event_manager.emit(EventType.SESSION_COMPLETED, {
                "session_id": claude_session_id,
                "repo_path": repo["local_path"],
            })


@router.post("/headless/run/stream")
async def run_headless_session_stream(data: HeadlessSessionCreate):
    """
    Run a headless Claude Code session with streaming results.

    Returns a stream of newline-delimited JSON messages as the session progresses.
    Each message is a SessionMessage with type, content, and metadata.
    """
    repo = get_repo_or_404(data.repo_id)

    # Generate session ID upfront so we can track it as "active" during execution
    claude_session_id = str(uuid4())

    # Create session record outside the generator
    async with get_repo_db(repo["local_path"]) as db:
        session = Session(
            repo_id=repo["id"],
            kind=data.kind,
            title=data.title,
            prompt=data.prompt,
            status=SessionStatus.RUNNING.value,
            claude_session_id=claude_session_id,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        session_id = session.id

    # Register session as running BEFORE the generator starts
    headless_analyzer.register_running(claude_session_id)

    # Emit session created event (must be done before returning StreamingResponse)
    await event_manager.emit(EventType.SESSION_CREATED, {
        "session_id": claude_session_id,
        "repo_path": repo["local_path"],
        "title": data.title,
        "is_active": True,
    })

    async def generate():
        """Generate streaming response."""
        full_result = ""
        success = False

        try:
            async for msg in headless_analyzer.analyze_stream(
                prompt=data.prompt,
                working_dir=repo["local_path"],
                session_id=claude_session_id,
                allowed_tools=data.allowed_tools,
                disallowed_tools=data.disallowed_tools,
                permission_mode=data.permission_mode,
                max_turns=data.max_turns,
                model=data.model,
                system_prompt=data.system_prompt,
                resume_session=data.resume_session,
            ):
                if msg.type == "result" and msg.subtype == "success":
                    full_result = msg.content or ""
                    success = True

                # Yield message as JSON
                yield json.dumps({
                    "type": msg.type,
                    "subtype": msg.subtype,
                    "content": msg.content,
                    "session_id": claude_session_id,
                    "cost_usd": msg.cost_usd,
                    "duration_ms": msg.duration_ms,
                }) + "\n"

            # Update session record
            async with get_repo_db(repo["local_path"]) as db:
                from sqlalchemy import select
                result = await db.execute(select(Session).where(Session.id == session_id))
                session = result.scalar_one_or_none()
                if session:
                    session.status = (
                        SessionStatus.COMPLETED.value if success else SessionStatus.FAILED.value
                    )
                    session.transcript = full_result
                    await db.commit()

        except Exception as e:
            yield json.dumps({
                "type": "error",
                "content": str(e),
            }) + "\n"

            async with get_repo_db(repo["local_path"]) as db:
                from sqlalchemy import select
                result = await db.execute(select(Session).where(Session.id == session_id))
                session = result.scalar_one_or_none()
                if session:
                    session.status = SessionStatus.FAILED.value
                    await db.commit()

        finally:
            # Always unregister when generator completes
            headless_analyzer.unregister_running(claude_session_id)

            # Emit session completed event
            await event_manager.emit(EventType.SESSION_COMPLETED, {
                "session_id": claude_session_id,
                "repo_path": repo["local_path"],
            })

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/headless/running")
async def list_running_sessions():
    """List currently running headless sessions."""
    return {"running": headless_analyzer.list_running()}


@router.delete("/headless/{session_id}")
async def cancel_headless_session(session_id: str):
    """Cancel a running headless session."""
    cancelled = await headless_analyzer.cancel(session_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Session not found or already completed")
    return {"status": "cancelled"}
