"""
Database helper functions for common query patterns.
"""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Analysis, Repo


async def get_repo_or_404(db: AsyncSession, repo_id: int) -> Repo:
    """
    Fetch a repository by ID or raise HTTP 404 if not found.

    Args:
        db: Database session
        repo_id: Repository ID to look up

    Returns:
        The Repo model instance

    Raises:
        HTTPException: 404 if repository not found
    """
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


async def get_analysis_or_404(db: AsyncSession, analysis_id: int) -> Analysis:
    """
    Fetch an analysis by ID or raise HTTP 404 if not found.

    Args:
        db: Database session
        analysis_id: Analysis ID to look up

    Returns:
        The Analysis model instance

    Raises:
        HTTPException: 404 if analysis not found
    """
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis
