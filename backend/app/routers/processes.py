"""
PTY process routes with WebSocket support.

Processes are ephemeral and stored in memory.
Sessions (the persistent records) are stored in per-repo databases.
"""

import asyncio

# Default terminal dimensions (standard VT100 size)
DEFAULT_TERMINAL_ROWS = 24
DEFAULT_TERMINAL_COLS = 80

from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.database import get_repo_db
from app.db_helpers import get_repo_or_404
from app.models import Session, SessionStatus, SessionEntity
from app.services.session_manager import process_manager
from app.storage import load_repos, get_repo_by_id

router = APIRouter()


class EntityInput(BaseModel):
    kind: str  # "issue" or "pr"
    number: int


class ProcessCreate(BaseModel):
    repo_id: int
    prompt: str | None = None
    kind: str = "custom"
    entities: list[EntityInput] = []  # Linked issues/PRs
    title: str = "New Session"

    # Claude Code configuration overrides
    permission_mode: str | None = None
    allowed_tools: list[str] | None = None
    disallowed_tools: list[str] | None = None
    max_turns: int | None = None
    model: str | None = None
    resume_session: str | None = None


class ProcessResponse(BaseModel):
    id: str
    working_dir: str
    created_at: str
    session_id: int | None
    claude_session_id: str | None = None


class ProcessListResponse(BaseModel):
    processes: list[ProcessResponse]


@router.post("/processes", response_model=ProcessResponse)
async def create_process(data: ProcessCreate):
    """Create a new PTY process running Claude Code."""
    repo = get_repo_or_404(data.repo_id)

    async with get_repo_db(repo["local_path"]) as db:
        # Create session record
        session = Session(
            repo_id=repo["id"],
            kind=data.kind,
            title=data.title,
            prompt=data.prompt or "",
            status=SessionStatus.RUNNING.value,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

        # Create entity links
        for entity in data.entities:
            session_entity = SessionEntity(
                session_id=session.id,
                repo_id=repo["id"],
                entity_kind=entity.kind,
                entity_number=entity.number,
            )
            db.add(session_entity)

        if data.entities:
            await db.commit()

        # Create PTY process with Claude Code configuration
        try:
            process = await process_manager.create_process(
                working_dir=repo["local_path"],
                initial_prompt=data.prompt,
                session_id=session.id,
                allowed_tools=data.allowed_tools,
                disallowed_tools=data.disallowed_tools,
                permission_mode=data.permission_mode,
                max_turns=data.max_turns,
                model=data.model,
                resume_session=data.resume_session,
            )
        except ValueError as e:
            # Working directory doesn't exist or other validation error
            session.status = SessionStatus.FAILED.value
            await db.commit()
            raise HTTPException(status_code=400, detail=str(e))

        # Link process to session
        session.process_id = process.id
        await db.commit()

        return ProcessResponse(
            id=process.id,
            working_dir=process.working_dir,
            created_at=process.created_at.isoformat(),
            session_id=session.id,
            claude_session_id=process.claude_session_id,
        )


@router.get("/processes", response_model=ProcessListResponse)
async def list_processes():
    """List all active PTY processes."""
    # First, check for dead processes and update their session status
    dead_process_info = await process_manager.get_dead_process_info()

    for session_id, transcript, claude_session_id, working_dir in dead_process_info:
        # Find the repo by working_dir
        repo = None
        for r in load_repos():
            if r["local_path"] == working_dir:
                repo = r
                break

        if repo and session_id:
            async with get_repo_db(repo["local_path"]) as db:
                result = await db.execute(
                    select(Session).where(Session.id == session_id)
                )
                session = result.scalar_one_or_none()
                if session and session.status == SessionStatus.RUNNING.value:
                    session.status = SessionStatus.COMPLETED.value
                    session.transcript = transcript
                    session.completed_at = datetime.utcnow()
                    if claude_session_id:
                        session.claude_session_id = claude_session_id
                    await db.commit()

    # Now list only actually running processes
    processes = await process_manager.list_processes()
    return ProcessListResponse(
        processes=[
            ProcessResponse(
                id=p.id,
                working_dir=p.working_dir,
                created_at=p.created_at.isoformat(),
                session_id=p.session_id,
                claude_session_id=p.claude_session_id,
            )
            for p in processes
        ]
    )


@router.delete("/processes/{process_id}")
async def kill_process(process_id: str):
    """Kill a PTY process."""
    process = await process_manager.get_process(process_id)
    if not process:
        raise HTTPException(status_code=404, detail="Process not found")

    # Update session status if linked
    if process.session_id and process.working_dir:
        # Find the repo by working_dir
        repo = None
        for r in load_repos():
            if r["local_path"] == process.working_dir:
                repo = r
                break

        if repo:
            async with get_repo_db(repo["local_path"]) as db:
                result = await db.execute(
                    select(Session).where(Session.id == process.session_id)
                )
                session = result.scalar_one_or_none()
                if session:
                    session.status = SessionStatus.COMPLETED.value
                    session.transcript = process.transcript
                    if process.claude_session_id:
                        session.claude_session_id = process.claude_session_id
                    await db.commit()

    await process_manager.kill(process_id)
    return {"status": "killed"}


@router.get("/processes/{process_id}/transcript")
async def get_transcript(process_id: str):
    """Get the current transcript for a process."""
    process = await process_manager.get_process(process_id)
    if not process:
        raise HTTPException(status_code=404, detail="Process not found")

    return {"transcript": process.transcript}


@router.websocket("/processes/{process_id}/ws")
async def process_websocket(websocket: WebSocket, process_id: str):
    """
    WebSocket endpoint for terminal I/O.

    Receives: JSON messages with type "input" or "resize"
    Sends: Raw terminal output bytes (base64 encoded)
    """
    await websocket.accept()

    process = await process_manager.get_process(process_id)
    if not process:
        await websocket.close(code=4004, reason="Process not found")
        return

    # Queue for sending data to client
    output_queue: asyncio.Queue[bytes] = asyncio.Queue()

    def on_output(data: bytes):
        try:
            output_queue.put_nowait(data)
        except asyncio.QueueFull:
            pass

    process_manager.subscribe(process_id, on_output)

    # Send existing transcript
    if process.transcript:
        await websocket.send_bytes(process.transcript.encode())

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
                    await process_manager.write(process_id, message.get("data", ""))

                elif message.get("type") == "resize":
                    rows = message.get("rows", DEFAULT_TERMINAL_ROWS)
                    cols = message.get("cols", DEFAULT_TERMINAL_COLS)
                    await process_manager.resize(process_id, rows, cols)

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
        process_manager.unsubscribe(process_id, on_output)
        send_task.cancel()
        receive_task.cancel()
