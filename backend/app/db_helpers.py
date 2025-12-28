"""
Database helper functions for common query patterns.

This module provides utilities for:
- Looking up repos from the registry
- Getting database sessions for repos
- Common database queries
"""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_repo_db
from app.models import Session
from app.storage import get_repo_by_id, RepoInfo


def get_repo_or_404(repo_id: int) -> RepoInfo:
    """
    Fetch a repository from the registry or raise HTTP 404 if not found.

    Args:
        repo_id: Repository ID to look up

    Returns:
        The RepoInfo dict

    Raises:
        HTTPException: 404 if repository not found
    """
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


async def get_session_or_404(db: AsyncSession, session_id: int) -> Session:
    """
    Fetch a session by ID or raise HTTP 404 if not found.

    Eager loads the session's entities relationship.

    Args:
        db: Database session for the specific repo
        session_id: Session ID to look up

    Returns:
        The Session model instance with entities loaded

    Raises:
        HTTPException: 404 if session not found
    """
    result = await db.execute(
        select(Session)
        .options(selectinload(Session.entities))
        .where(Session.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


async def get_session_with_repo_or_404(
    session_id: int, repo_id: int, db: AsyncSession
) -> tuple[Session, RepoInfo]:
    """
    Fetch a session and verify it belongs to the specified repo.

    This is useful when you have both repo_id and session_id in the path.
    The caller is responsible for providing a valid database session from
    the appropriate repo context.

    Args:
        session_id: Session ID to look up
        repo_id: Repository ID the session should belong to
        db: Active database session for the repo

    Returns:
        Tuple of (Session, RepoInfo)

    Raises:
        HTTPException: 404 if session or repo not found
    """
    repo = get_repo_or_404(repo_id)

    session = await get_session_or_404(db, session_id)

    # Verify the session belongs to this repo
    if session.repo_id != repo_id:
        raise HTTPException(status_code=404, detail="Session not found in this repository")

    return session, repo
