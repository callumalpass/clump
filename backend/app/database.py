"""
Per-repo database management.

Each repository has its own SQLite database at ~/.clump/projects/{hash}/data.db.
This module provides:
- Engine/session factory management per repo
- Lazy initialization of databases
- Context managers for getting database sessions
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker, AsyncEngine
from sqlalchemy.orm import DeclarativeBase

from app.storage import get_repo_db_path


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


# Cache of engines per repo path
_engines: dict[str, AsyncEngine] = {}
_session_factories: dict[str, async_sessionmaker[AsyncSession]] = {}
_initialized_dbs: set[str] = set()  # Track which DBs have been initialized


def _get_engine(local_path: str) -> AsyncEngine:
    """Get or create an engine for a repo's database."""
    if local_path not in _engines:
        db_path = get_repo_db_path(local_path)
        db_url = f"sqlite+aiosqlite:///{db_path}"
        _engines[local_path] = create_async_engine(db_url, echo=False)

    return _engines[local_path]


def _get_session_factory(local_path: str) -> async_sessionmaker[AsyncSession]:
    """Get or create a session factory for a repo's database."""
    if local_path not in _session_factories:
        engine = _get_engine(local_path)
        _session_factories[local_path] = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False
        )

    return _session_factories[local_path]


async def init_repo_db(local_path: str) -> None:
    """
    Initialize the database for a specific repo.

    Creates all tables if they don't exist.
    Caches initialization status to avoid repeated schema checks.
    """
    if local_path in _initialized_dbs:
        return  # Already initialized this session

    engine = _get_engine(local_path)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    _initialized_dbs.add(local_path)


@asynccontextmanager
async def get_repo_db(local_path: str) -> AsyncGenerator[AsyncSession, None]:
    """
    Get a database session for a specific repo.

    Usage:
        async with get_repo_db("/path/to/repo") as db:
            result = await db.execute(...)
    """
    # Ensure DB is initialized (idempotent)
    await init_repo_db(local_path)

    session_factory = _get_session_factory(local_path)
    async with session_factory() as session:
        yield session


async def close_all_engines() -> None:
    """Close all database engines. Call on shutdown."""
    for engine in _engines.values():
        await engine.dispose()
    _engines.clear()
    _session_factories.clear()


def clear_engine_cache(local_path: str | None = None) -> None:
    """
    Clear the engine cache for a specific repo or all repos.

    Useful after deleting a repo's database file.
    """
    if local_path is None:
        _engines.clear()
        _session_factories.clear()
        _initialized_dbs.clear()
    else:
        _engines.pop(local_path, None)
        _session_factories.pop(local_path, None)
        _initialized_dbs.discard(local_path)
