"""
Terminal session routes with WebSocket support.
"""

import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Repo, Analysis, AnalysisStatus
from app.services.session_manager import session_manager

router = APIRouter()


class SessionCreate(BaseModel):
    repo_id: int
    prompt: str | None = None
    analysis_type: str = "custom"
    entity_id: str | None = None
    title: str = "New Analysis"

    # Claude Code configuration overrides
    permission_mode: str | None = None  # "default", "plan", "acceptEdits", "bypassPermissions"
    allowed_tools: list[str] | None = None
    disallowed_tools: list[str] | None = None
    max_turns: int | None = None
    model: str | None = None  # "sonnet", "opus", "haiku"
    resume_session: str | None = None  # Claude Code session ID to resume


class SessionResponse(BaseModel):
    id: str
    working_dir: str
    created_at: str
    analysis_id: int | None
    claude_session_id: str | None = None  # Claude Code's internal session ID


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new terminal session running Claude Code."""
    # Get repo
    result = await db.execute(select(Repo).where(Repo.id == data.repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Create analysis record
    analysis = Analysis(
        repo_id=repo.id,
        type=data.analysis_type,
        entity_id=data.entity_id,
        title=data.title,
        prompt=data.prompt or "",
        status=AnalysisStatus.RUNNING.value,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    # Create PTY session with Claude Code configuration
    session = await session_manager.create_session(
        working_dir=repo.local_path,
        initial_prompt=data.prompt,
        analysis_id=analysis.id,
        allowed_tools=data.allowed_tools,
        disallowed_tools=data.disallowed_tools,
        permission_mode=data.permission_mode,
        max_turns=data.max_turns,
        model=data.model,
        resume_session=data.resume_session,
    )

    # Link session to analysis
    analysis.session_id = session.id
    await db.commit()

    return SessionResponse(
        id=session.id,
        working_dir=session.working_dir,
        created_at=session.created_at.isoformat(),
        analysis_id=analysis.id,
        claude_session_id=session.claude_session_id,
    )


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions():
    """List all active terminal sessions."""
    sessions = await session_manager.list_sessions()
    return SessionListResponse(
        sessions=[
            SessionResponse(
                id=s.id,
                working_dir=s.working_dir,
                created_at=s.created_at.isoformat(),
                analysis_id=s.analysis_id,
                claude_session_id=s.claude_session_id,
            )
            for s in sessions
        ]
    )


@router.delete("/sessions/{session_id}")
async def kill_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Kill a terminal session."""
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update analysis status if linked
    if session.analysis_id:
        result = await db.execute(
            select(Analysis).where(Analysis.id == session.analysis_id)
        )
        analysis = result.scalar_one_or_none()
        if analysis:
            analysis.status = AnalysisStatus.COMPLETED.value
            analysis.transcript = session.transcript
            # Save Claude Code session ID for resume support
            if session.claude_session_id:
                analysis.claude_session_id = session.claude_session_id
            await db.commit()

    await session_manager.kill(session_id)
    return {"status": "killed"}


@router.get("/sessions/{session_id}/transcript")
async def get_transcript(session_id: str):
    """Get the current transcript for a session."""
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"transcript": session.transcript}


@router.websocket("/sessions/{session_id}/ws")
async def session_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for terminal I/O.

    Receives: JSON messages with type "input" or "resize"
    Sends: Raw terminal output bytes (base64 encoded)
    """
    await websocket.accept()

    session = await session_manager.get_session(session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    # Queue for sending data to client
    output_queue: asyncio.Queue[bytes] = asyncio.Queue()

    def on_output(data: bytes):
        try:
            output_queue.put_nowait(data)
        except asyncio.QueueFull:
            pass

    session_manager.subscribe(session_id, on_output)

    # Send existing transcript
    if session.transcript:
        await websocket.send_bytes(session.transcript.encode())

    async def send_output():
        """Task to send output to client."""
        while True:
            try:
                data = await output_queue.get()
                await websocket.send_bytes(data)
            except Exception:
                break

    async def receive_input():
        """Task to receive input from client."""
        while True:
            try:
                message = await websocket.receive_json()

                if message.get("type") == "input":
                    await session_manager.write(session_id, message.get("data", ""))

                elif message.get("type") == "resize":
                    rows = message.get("rows", 24)
                    cols = message.get("cols", 80)
                    await session_manager.resize(session_id, rows, cols)

            except WebSocketDisconnect:
                break
            except Exception:
                break

    # Run both tasks concurrently
    send_task = asyncio.create_task(send_output())
    receive_task = asyncio.create_task(receive_input())

    try:
        await asyncio.gather(send_task, receive_task, return_exceptions=True)
    finally:
        session_manager.unsubscribe(session_id, on_output)
        send_task.cancel()
        receive_task.cancel()
