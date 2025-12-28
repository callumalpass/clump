"""
PTY process routes with WebSocket support.

Processes are ephemeral and stored in memory.
Sessions (the persistent records) are stored in per-repo databases.
"""

import asyncio

# Default terminal dimensions (standard VT100 size)
DEFAULT_TERMINAL_ROWS = 24
DEFAULT_TERMINAL_COLS = 80

from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.database import get_repo_db
from app.db_helpers import get_repo_or_404
from app.models import Session, SessionStatus, SessionEntity
from app.services.session_manager import process_manager
from app.services.event_manager import event_manager, EventType
from app.storage import (
    get_repo_by_path,
    encode_path,
    save_session_metadata,
    SessionMetadata,
    EntityLink,
    load_repos,
)

router = APIRouter()


async def _emit_counts_changed():
    """Emit counts_changed event with current session counts per repo."""
    from app.services.headless_analyzer import headless_analyzer

    repos = load_repos()
    processes = await process_manager.list_processes()

    # Get active session IDs
    active_session_ids = {
        proc.claude_session_id
        for proc in processes
        if proc.claude_session_id
    }
    active_session_ids.update(headless_analyzer.list_running())

    # Build counts dict keyed by repo_id
    counts = {}
    for repo in repos:
        encoded = encode_path(repo["local_path"])
        # Count processes in this repo
        repo_processes = [
            p for p in processes
            if encode_path(p.working_dir) == encoded
        ]
        counts[str(repo["id"])] = {
            "repo_id": repo["id"],
            "total": len(repo_processes),  # Will be updated by frontend from session list
            "active": len(repo_processes),
        }

    await event_manager.emit_counts_changed(counts)


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
        # Create session record - need to commit to get auto-generated ID
        session = Session(
            repo_id=repo["id"],
            kind=data.kind,
            title=data.title,
            prompt=data.prompt or "",
            status=SessionStatus.RUNNING.value,
        )
        db.add(session)
        await db.flush()  # Get session.id without full commit

        # Create entity links (will be committed with final commit)
        for entity in data.entities:
            session_entity = SessionEntity(
                session_id=session.id,
                repo_id=repo["id"],
                entity_kind=entity.kind,
                entity_number=entity.number,
            )
            db.add(session_entity)

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

        # Link process to session and commit all changes at once
        session.process_id = process.id
        await db.commit()

        # Create sidecar metadata with entity links for transcript-first architecture
        # This ensures the session is linked to issues/PRs immediately
        if data.entities and process.claude_session_id:
            encoded = encode_path(repo["local_path"])
            metadata = SessionMetadata(
                session_id=process.claude_session_id,
                title=data.title,
                repo_path=repo["local_path"],
                entities=[
                    EntityLink(kind=e.kind, number=e.number)
                    for e in data.entities
                ],
                created_at=datetime.now(timezone.utc).isoformat(),
            )
            save_session_metadata(encoded, process.claude_session_id, metadata)

        response = ProcessResponse(
            id=process.id,
            working_dir=process.working_dir,
            created_at=process.created_at.isoformat(),
            session_id=session.id,
            claude_session_id=process.claude_session_id,
        )

        # Emit WebSocket events for real-time updates
        await event_manager.emit(EventType.SESSION_CREATED, {
            "session_id": process.claude_session_id,
            "repo_path": repo["local_path"],
            "title": data.title,
            "is_active": True,
        })
        await event_manager.emit(EventType.PROCESS_STARTED, {
            "process_id": process.id,
            "session_id": process.claude_session_id,
            "working_dir": process.working_dir,
        })
        # Emit counts changed (triggers frontend to refresh counts)
        await _emit_counts_changed()

        return response


@router.get("/processes", response_model=ProcessListResponse)
async def list_processes():
    """List all active PTY processes."""
    # First, check for dead processes and update their session status
    dead_process_info = await process_manager.get_dead_process_info()
    had_dead_processes = False

    for session_id, transcript, claude_session_id, working_dir in dead_process_info:
        repo = get_repo_by_path(working_dir)

        if repo and session_id:
            async with get_repo_db(repo["local_path"]) as db:
                result = await db.execute(
                    select(Session).where(Session.id == session_id)
                )
                session = result.scalar_one_or_none()
                if session and session.status == SessionStatus.RUNNING.value:
                    session.status = SessionStatus.COMPLETED.value
                    session.transcript = transcript
                    session.completed_at = datetime.now(timezone.utc)
                    if claude_session_id:
                        session.claude_session_id = claude_session_id
                    await db.commit()
                    had_dead_processes = True

                    # Emit events for the completed session
                    await event_manager.emit(EventType.PROCESS_ENDED, {
                        "session_id": claude_session_id,
                        "working_dir": working_dir,
                    })
                    await event_manager.emit(EventType.SESSION_COMPLETED, {
                        "session_id": claude_session_id,
                        "repo_path": repo["local_path"],
                        "end_time": datetime.now(timezone.utc).isoformat(),
                    })

    # Emit counts changed if any processes ended
    if had_dead_processes:
        await _emit_counts_changed()

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

    # Capture info before killing
    claude_session_id = process.claude_session_id
    working_dir = process.working_dir

    # Update session status if linked
    if process.session_id and process.working_dir:
        repo = get_repo_by_path(process.working_dir)

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

    # Emit events after killing
    await event_manager.emit(EventType.PROCESS_ENDED, {
        "process_id": process_id,
        "session_id": claude_session_id,
        "working_dir": working_dir,
    })
    if claude_session_id:
        repo = get_repo_by_path(working_dir) if working_dir else None
        await event_manager.emit(EventType.SESSION_COMPLETED, {
            "session_id": claude_session_id,
            "repo_path": repo["local_path"] if repo else None,
            "end_time": datetime.now(timezone.utc).isoformat(),
        })
    await _emit_counts_changed()

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
