"""
Analysis CRUD and search routes.
"""

from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Analysis, AnalysisStatus, Repo
from app.services.session_manager import session_manager
from app.services.transcript_parser import parse_transcript, transcript_to_dict

router = APIRouter()


class AnalysisResponse(BaseModel):
    id: int
    repo_id: int
    repo_name: str | None = None
    type: str
    entity_id: str | None
    title: str
    prompt: str
    transcript: str
    summary: str | None
    status: str
    session_id: str | None
    claude_session_id: str | None = None  # Claude Code CLI session ID for resume
    created_at: str
    completed_at: str | None

    class Config:
        from_attributes = True


def _analysis_to_response(analysis: Analysis, repo: Repo | None) -> AnalysisResponse:
    """Convert an Analysis model to AnalysisResponse."""
    return AnalysisResponse(
        id=analysis.id,
        repo_id=analysis.repo_id,
        repo_name=f"{repo.owner}/{repo.name}" if repo else None,
        type=analysis.type,
        entity_id=analysis.entity_id,
        title=analysis.title,
        prompt=analysis.prompt,
        transcript=analysis.transcript,
        summary=analysis.summary,
        status=analysis.status,
        session_id=analysis.session_id,
        claude_session_id=analysis.claude_session_id,
        created_at=analysis.created_at.isoformat(),
        completed_at=analysis.completed_at.isoformat() if analysis.completed_at else None,
    )


class AnalysisUpdate(BaseModel):
    summary: str | None = None
    status: str | None = None


class AnalysisListResponse(BaseModel):
    analyses: list[AnalysisResponse]
    total: int


@router.get("/analyses", response_model=AnalysisListResponse)
async def list_analyses(
    repo_id: int | None = None,
    type: str | None = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List analyses with optional filtering and search."""
    query = select(Analysis).order_by(Analysis.created_at.desc())

    if repo_id:
        query = query.where(Analysis.repo_id == repo_id)
    if type:
        query = query.where(Analysis.type == type)
    if status:
        query = query.where(Analysis.status == status)
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Analysis.title.ilike(search_term),
                Analysis.prompt.ilike(search_term),
                Analysis.transcript.ilike(search_term),
                Analysis.summary.ilike(search_term),
            )
        )

    # Get total count
    count_result = await db.execute(select(Analysis.id).where(query.whereclause) if query.whereclause is not None else select(Analysis.id))
    total = len(count_result.all())

    # Apply pagination
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    analyses = result.scalars().all()

    # Get repo names
    repo_ids = {a.repo_id for a in analyses}
    repo_result = await db.execute(select(Repo).where(Repo.id.in_(repo_ids)))
    repos = {r.id: r for r in repo_result.scalars().all()}

    return AnalysisListResponse(
        analyses=[
            _analysis_to_response(a, repos.get(a.repo_id))
            for a in analyses
        ],
        total=total,
    )


@router.get("/analyses/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a single analysis."""
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Get repo name
    repo_result = await db.execute(select(Repo).where(Repo.id == analysis.repo_id))
    repo = repo_result.scalar_one_or_none()

    return _analysis_to_response(analysis, repo)


@router.patch("/analyses/{analysis_id}", response_model=AnalysisResponse)
async def update_analysis(
    analysis_id: int,
    data: AnalysisUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an analysis (summary, status)."""
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if data.summary is not None:
        analysis.summary = data.summary
    if data.status is not None:
        analysis.status = data.status
        if data.status == AnalysisStatus.COMPLETED.value:
            analysis.completed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(analysis)

    # Get repo name
    repo_result = await db.execute(select(Repo).where(Repo.id == analysis.repo_id))
    repo = repo_result.scalar_one_or_none()

    return _analysis_to_response(analysis, repo)


class ContinueResponse(BaseModel):
    """Response from continuing an analysis - includes full session data."""
    id: str
    working_dir: str
    created_at: str
    analysis_id: int
    claude_session_id: str | None = None


@router.post("/analyses/{analysis_id}/continue", response_model=ContinueResponse)
async def continue_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Continue an existing analysis by resuming its Claude session.

    This creates a new PTY session that resumes the Claude conversation,
    but keeps the same analysis record (no duplicates).
    """
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if not analysis.claude_session_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot continue: no Claude session ID available"
        )

    # Get the repo for the working directory
    repo_result = await db.execute(select(Repo).where(Repo.id == analysis.repo_id))
    repo = repo_result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Create new PTY session that resumes the Claude conversation
    session = await session_manager.create_session(
        working_dir=repo.local_path,
        initial_prompt=None,  # No new prompt, just resuming
        analysis_id=analysis.id,
        resume_session=analysis.claude_session_id,
    )

    # Update the analysis to link to this new session and set status to running
    analysis.session_id = session.id
    analysis.status = AnalysisStatus.RUNNING.value
    analysis.completed_at = None  # Clear completed time since we're resuming
    await db.commit()

    # Return full session data so frontend can add it directly to state
    return ContinueResponse(
        id=session.id,
        working_dir=session.working_dir,
        created_at=session.created_at.isoformat(),
        analysis_id=analysis.id,
        claude_session_id=session.claude_session_id,
    )


@router.delete("/analyses/{analysis_id}")
async def delete_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete an analysis."""
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    await db.delete(analysis)
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


@router.get("/analyses/{analysis_id}/transcript")
async def get_analysis_transcript(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Get the parsed transcript for an analysis.

    Reads Claude Code's JSONL transcript file and returns structured messages.
    Falls back to raw transcript if JSONL not available.
    """
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Get the repo for working directory
    repo_result = await db.execute(select(Repo).where(Repo.id == analysis.repo_id))
    repo = repo_result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Try to get Claude session ID from analysis or currently running session
    claude_session_id = analysis.claude_session_id

    if not claude_session_id:
        # No Claude session ID available - return raw transcript
        return {
            "type": "raw",
            "transcript": analysis.transcript or "",
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
            "transcript": analysis.transcript or "",
        }
