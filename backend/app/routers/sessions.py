"""
Session CRUD and search routes.
"""

from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.db_helpers import get_session_or_404
from app.models import Session, SessionStatus, Repo, SessionEntity
from app.services.session_manager import process_manager
from app.services.transcript_parser import parse_transcript, transcript_to_dict
from sqlalchemy.orm import selectinload

router = APIRouter()


class SessionEntityResponse(BaseModel):
    id: int
    kind: str
    number: int

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: int
    repo_id: int
    repo_name: str | None = None
    kind: str
    entities: list[SessionEntityResponse] = []
    title: str
    prompt: str
    transcript: str
    summary: str | None
    status: str
    process_id: str | None
    claude_session_id: str | None = None  # Claude Code CLI session ID for resume
    created_at: str
    completed_at: str | None

    class Config:
        from_attributes = True


def _session_to_response(session: Session, repo: Repo | None) -> SessionResponse:
    """Convert a Session model to SessionResponse."""
    return SessionResponse(
        id=session.id,
        repo_id=session.repo_id,
        repo_name=f"{repo.owner}/{repo.name}" if repo else None,
        kind=session.kind,
        entities=[
            SessionEntityResponse(id=e.id, kind=e.entity_kind, number=e.entity_number)
            for e in session.entities
        ],
        title=session.title,
        prompt=session.prompt,
        transcript=session.transcript,
        summary=session.summary,
        status=session.status,
        process_id=session.process_id,
        claude_session_id=session.claude_session_id,
        created_at=session.created_at.isoformat(),
        completed_at=session.completed_at.isoformat() if session.completed_at else None,
    )


class SessionUpdate(BaseModel):
    summary: str | None = None
    status: str | None = None


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    total: int


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    repo_id: int | None = None,
    kind: str | None = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List sessions with optional filtering and search."""
    query = select(Session).options(selectinload(Session.entities)).order_by(Session.created_at.desc())

    if repo_id:
        query = query.where(Session.repo_id == repo_id)
    if kind:
        query = query.where(Session.kind == kind)
    if status:
        query = query.where(Session.status == status)
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Session.title.ilike(search_term),
                Session.prompt.ilike(search_term),
                Session.transcript.ilike(search_term),
                Session.summary.ilike(search_term),
            )
        )

    # Get total count
    count_result = await db.execute(select(Session.id).where(query.whereclause) if query.whereclause is not None else select(Session.id))
    total = len(count_result.all())

    # Apply pagination
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    sessions = result.scalars().all()

    # Get repo names
    repo_ids = {s.repo_id for s in sessions}
    repo_result = await db.execute(select(Repo).where(Repo.id.in_(repo_ids)))
    repos = {r.id: r for r in repo_result.scalars().all()}

    return SessionListResponse(
        sessions=[
            _session_to_response(s, repos.get(s.repo_id))
            for s in sessions
        ],
        total=total,
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a single session."""
    session = await get_session_or_404(db, session_id)

    # Get repo name
    repo_result = await db.execute(select(Repo).where(Repo.id == session.repo_id))
    repo = repo_result.scalar_one_or_none()

    return _session_to_response(session, repo)


@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: int,
    data: SessionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a session (summary, status)."""
    session = await get_session_or_404(db, session_id)

    if data.summary is not None:
        session.summary = data.summary
    if data.status is not None:
        session.status = data.status
        if data.status == SessionStatus.COMPLETED.value:
            session.completed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(session)

    # Get repo name
    repo_result = await db.execute(select(Repo).where(Repo.id == session.repo_id))
    repo = repo_result.scalar_one_or_none()

    return _session_to_response(session, repo)


class ContinueResponse(BaseModel):
    """Response from continuing a session - includes full process data."""
    id: str
    working_dir: str
    created_at: str
    session_id: int
    claude_session_id: str | None = None


@router.post("/sessions/{session_id}/continue", response_model=ContinueResponse)
async def continue_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Continue an existing session by resuming its Claude conversation.

    This creates a new PTY process that resumes the Claude conversation,
    but keeps the same session record (no duplicates).
    """
    session = await get_session_or_404(db, session_id)

    if not session.claude_session_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot continue: no Claude session ID available"
        )

    # Get the repo for the working directory
    repo_result = await db.execute(select(Repo).where(Repo.id == session.repo_id))
    repo = repo_result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Create new PTY process that resumes the Claude conversation
    process = await process_manager.create_process(
        working_dir=repo.local_path,
        initial_prompt=None,  # No new prompt, just resuming
        session_id=session.id,
        resume_session=session.claude_session_id,
    )

    # Update the session to link to this new process and set status to running
    session.process_id = process.id
    session.status = SessionStatus.RUNNING.value
    session.completed_at = None  # Clear completed time since we're resuming
    await db.commit()

    # Return full process data so frontend can add it directly to state
    return ContinueResponse(
        id=process.id,
        working_dir=process.working_dir,
        created_at=process.created_at.isoformat(),
        session_id=session.id,
        claude_session_id=process.claude_session_id,
    )


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a session."""
    session = await get_session_or_404(db, session_id)

    await db.delete(session)
    await db.commit()
    return {"status": "deleted"}


class TranscriptMessage(BaseModel):
    """A message in the parsed transcript."""
    uuid: str
    role: str
    content: str
    timestamp: str
    thinking: str | None = None
    tool_uses: list[dict[str, Any]] = []


class ParsedTranscriptResponse(BaseModel):
    """Parsed Claude Code transcript."""
    session_id: str
    messages: list[TranscriptMessage]
    total_cost_usd: float = 0.0
    total_duration_ms: int = 0


@router.get("/sessions/{session_id}/transcript")
async def get_session_transcript(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Get the parsed transcript for a session.

    Reads Claude Code's JSONL transcript file and returns structured messages.
    Falls back to raw transcript if JSONL not available.
    """
    session = await get_session_or_404(db, session_id)

    # Get the repo for working directory
    repo_result = await db.execute(select(Repo).where(Repo.id == session.repo_id))
    repo = repo_result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Try to get Claude session ID from session or currently running process
    claude_session_id = session.claude_session_id

    if not claude_session_id and session.process_id:
        # Check if there's an active process with the claude_session_id
        active_process = await process_manager.get_process(session.process_id)
        if active_process:
            claude_session_id = active_process.claude_session_id

    if not claude_session_id:
        # No Claude session ID available - return raw transcript
        return {
            "type": "raw",
            "transcript": session.transcript or "",
        }

    # Try to parse the JSONL transcript
    parsed = parse_transcript(claude_session_id, repo.local_path)

    if parsed:
        return {
            "type": "parsed",
            "transcript": transcript_to_dict(parsed),
        }
    else:
        # JSONL not found - return raw transcript
        return {
            "type": "raw",
            "transcript": session.transcript or "",
        }


class AddEntityRequest(BaseModel):
    kind: str  # "issue" or "pr"
    number: int


@router.post("/sessions/{session_id}/entities", response_model=SessionEntityResponse)
async def add_entity_to_session(
    session_id: int,
    data: AddEntityRequest,
    db: AsyncSession = Depends(get_db),
):
    """Add an issue or PR to a session."""
    session = await get_session_or_404(db, session_id)

    # Check if already linked
    for entity in session.entities:
        if entity.entity_kind == data.kind and entity.entity_number == data.number:
            raise HTTPException(
                status_code=400,
                detail=f"{data.kind.capitalize()} #{data.number} is already linked to this session"
            )

    # Create the link
    entity = SessionEntity(
        session_id=session.id,
        repo_id=session.repo_id,
        entity_kind=data.kind,
        entity_number=data.number,
    )
    db.add(entity)
    await db.commit()
    await db.refresh(entity)

    return SessionEntityResponse(id=entity.id, kind=entity.entity_kind, number=entity.entity_number)


@router.delete("/sessions/{session_id}/entities/{entity_id}")
async def remove_entity_from_session(
    session_id: int,
    entity_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Remove an issue or PR link from a session."""
    session = await get_session_or_404(db, session_id)

    # Find the entity
    entity = None
    for e in session.entities:
        if e.id == entity_id:
            entity = e
            break

    if not entity:
        raise HTTPException(status_code=404, detail="Entity link not found")

    await db.delete(entity)
    await db.commit()

    return {"status": "deleted"}
