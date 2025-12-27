"""
Analysis CRUD and search routes.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Analysis, AnalysisStatus, Repo

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
            AnalysisResponse(
                id=a.id,
                repo_id=a.repo_id,
                repo_name=f"{repos[a.repo_id].owner}/{repos[a.repo_id].name}" if a.repo_id in repos else None,
                type=a.type,
                entity_id=a.entity_id,
                title=a.title,
                prompt=a.prompt,
                transcript=a.transcript,
                summary=a.summary,
                status=a.status,
                session_id=a.session_id,
                claude_session_id=a.claude_session_id,
                created_at=a.created_at.isoformat(),
                completed_at=a.completed_at.isoformat() if a.completed_at else None,
            )
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
