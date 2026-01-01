"""
Per-repo database management.

Each repository has its own SQLite database at ~/.clump/projects/{hash}/data.db.
This module provides:
- Engine/session factory management per repo
- Lazy initialization of databases
- Context managers for getting database sessions

Performance optimizations:
- WAL mode for better read/write concurrency
- Optimized SQLite pragmas for performance
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker, AsyncEngine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool

from app.storage import get_repo_db_path


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


# Cache of engines per repo path
_engines: dict[str, AsyncEngine] = {}
_session_factories: dict[str, async_sessionmaker[AsyncSession]] = {}
_initialized_dbs: set[str] = set()  # Track which DBs have been initialized


def _set_sqlite_pragmas(dbapi_conn, connection_record):
    """Set SQLite pragmas for optimal performance on each connection."""
    cursor = dbapi_conn.cursor()
    # WAL mode for better read/write concurrency
    cursor.execute("PRAGMA journal_mode=WAL")
    # Synchronous NORMAL is safe with WAL and faster than FULL
    cursor.execute("PRAGMA synchronous=NORMAL")
    # Increase cache size (negative = KB, so -64000 = 64MB)
    cursor.execute("PRAGMA cache_size=-64000")
    # Store temp tables in memory
    cursor.execute("PRAGMA temp_store=MEMORY")
    # Enable memory-mapped I/O (256MB)
    cursor.execute("PRAGMA mmap_size=268435456")
    cursor.close()


def _get_engine(local_path: str) -> AsyncEngine:
    """Get or create an engine for a repo's database."""
    if local_path not in _engines:
        db_path = get_repo_db_path(local_path)
        db_url = f"sqlite+aiosqlite:///{db_path}"

        # Use StaticPool for SQLite to maintain a single connection per engine
        # This works well with aiosqlite's async nature and avoids connection churn
        engine = create_async_engine(
            db_url,
            echo=False,
            poolclass=StaticPool,
            connect_args={
                "timeout": 30,  # Wait up to 30s for locks
                "check_same_thread": False,  # Required for async
            },
        )

        # Register event listener to set pragmas on each new connection
        event.listen(engine.sync_engine, "connect", _set_sqlite_pragmas)

        _engines[local_path] = engine

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


def _run_migrations(conn) -> None:
    """
    Run schema migrations for existing databases.

    These are idempotent - they check if columns exist before adding.
    Called synchronously within run_sync().
    """
    from sqlalchemy import text

    # Migration: Add only_new column to scheduled_jobs
    try:
        conn.execute(text(
            "ALTER TABLE scheduled_jobs ADD COLUMN only_new INTEGER DEFAULT 0"
        ))
    except Exception:
        pass  # Column already exists

    # Migration: Add scheduled_job_id column to sessions
    try:
        conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN scheduled_job_id INTEGER"
        ))
    except Exception:
        pass  # Column already exists

    # Migration: Add cost_usd column to sessions (for headless session cost tracking)
    try:
        conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN cost_usd REAL"
        ))
    except Exception:
        pass  # Column already exists

    # Migration: Add duration_ms column to sessions (for headless session duration tracking)
    try:
        conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN duration_ms INTEGER"
        ))
    except Exception:
        pass  # Column already exists

    # Migration: Add cli_type column to sessions (for multi-CLI support)
    try:
        conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN cli_type VARCHAR(20) DEFAULT 'claude'"
        ))
    except Exception:
        pass  # Column already exists

    # Create index on cli_type for filtering
    try:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_sessions_cli_type ON sessions(cli_type)"
        ))
    except Exception:
        pass  # Index already exists


async def init_repo_db(local_path: str) -> None:
    """
    Initialize the database for a specific repo.

    Creates all tables if they don't exist, then runs migrations.
    Caches initialization status to avoid repeated schema checks.
    """
    if local_path in _initialized_dbs:
        return  # Already initialized this session

    engine = _get_engine(local_path)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Run migrations for any new columns
        await conn.run_sync(_run_migrations)

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
