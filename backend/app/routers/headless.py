"""
Headless session routes using Claude Code's -p (non-interactive) mode.

Provides structured JSON output and streaming for programmatic sessions.
"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import json

from app.database import get_db
from app.db_helpers import get_repo_or_404
from app.models import Session, SessionStatus
from app.services.headless_analyzer import headless_analyzer, SessionMessage

router = APIRouter()


class HeadlessSessionCreate(BaseModel):
    """Request to create a headless session."""

    repo_id: int
    prompt: str
    kind: str = "custom"
    entity_id: str | None = None
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
async def run_headless_session(
    data: HeadlessSessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Run a headless Claude Code session and return the complete result.

    This is a blocking endpoint that waits for the session to complete.
    For streaming results, use POST /headless/run/stream instead.
    """
    repo = await get_repo_or_404(db, data.repo_id)

    # Create session record
    session = Session(
        repo_id=repo.id,
        kind=data.kind,
        entity_id=data.entity_id,
        title=data.title,
        prompt=data.prompt,
        status=SessionStatus.RUNNING.value,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    try:
        # Run headless session
        result = await headless_analyzer.analyze(
            prompt=data.prompt,
            working_dir=repo.local_path,
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
        session.claude_session_id = result.session_id
        await db.commit()

        return HeadlessSessionResponse(
            session_id=session.id,
            claude_session_id=result.session_id,
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


@router.post("/headless/run/stream")
async def run_headless_session_stream(
    data: HeadlessSessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Run a headless Claude Code session with streaming results.

    Returns a stream of newline-delimited JSON messages as the session progresses.
    Each message is a SessionMessage with type, content, and metadata.
    """
    repo = await get_repo_or_404(db, data.repo_id)

    # Create session record
    session = Session(
        repo_id=repo.id,
        kind=data.kind,
        entity_id=data.entity_id,
        title=data.title,
        prompt=data.prompt,
        status=SessionStatus.RUNNING.value,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    async def generate():
        """Generate streaming response."""
        full_result = ""
        claude_session_id = ""
        success = False

        try:
            async for msg in headless_analyzer.analyze_stream(
                prompt=data.prompt,
                working_dir=repo.local_path,
                allowed_tools=data.allowed_tools,
                disallowed_tools=data.disallowed_tools,
                permission_mode=data.permission_mode,
                max_turns=data.max_turns,
                model=data.model,
                system_prompt=data.system_prompt,
                resume_session=data.resume_session,
            ):
                # Track session ID and result
                if msg.session_id:
                    claude_session_id = msg.session_id
                if msg.type == "result" and msg.subtype == "success":
                    full_result = msg.content or ""
                    success = True

                # Yield message as JSON
                yield json.dumps({
                    "type": msg.type,
                    "subtype": msg.subtype,
                    "content": msg.content,
                    "session_id": msg.session_id,
                    "cost_usd": msg.cost_usd,
                    "duration_ms": msg.duration_ms,
                }) + "\n"

            # Update session record
            async with db.begin():
                session.status = (
                    SessionStatus.COMPLETED.value if success else SessionStatus.FAILED.value
                )
                session.transcript = full_result
                session.claude_session_id = claude_session_id

        except Exception as e:
            yield json.dumps({
                "type": "error",
                "content": str(e),
            }) + "\n"

            async with db.begin():
                session.status = SessionStatus.FAILED.value

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
