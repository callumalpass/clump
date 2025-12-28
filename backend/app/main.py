"""
Clump - Local command center for running AI analyses through Claude Code.

Per-repo data is stored in ~/.clump/projects/{hash}/data.db.
Global configuration is stored in ~/.clump/config.json.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import close_all_engines
from app.storage import get_clump_dir
from app.routers import github, processes, sessions, settings, headless, tags, commands, hooks, schedules, stats
from app.services.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifespan.

    - On startup: Ensure ~/.clump/ directory exists, start scheduler
    - On shutdown: Stop scheduler, close all database connections
    """
    # Ensure clump directory structure exists
    get_clump_dir()

    # Start the scheduler service
    await scheduler.start()

    yield

    # Stop the scheduler
    await scheduler.stop()

    # Cleanup on shutdown
    await close_all_engines()


app = FastAPI(
    title="Clump",
    description="Local command center for running AI analyses through Claude Code",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(github.router, prefix="/api", tags=["github"])
app.include_router(processes.router, prefix="/api", tags=["processes"])
app.include_router(sessions.router, prefix="/api", tags=["sessions"])
app.include_router(settings.router, prefix="/api", tags=["settings"])
app.include_router(headless.router, prefix="/api", tags=["headless"])
app.include_router(tags.router, prefix="/api", tags=["tags"])
app.include_router(commands.router, prefix="/api", tags=["commands"])
app.include_router(hooks.router, prefix="/api", tags=["hooks"])
app.include_router(schedules.router, prefix="/api", tags=["schedules"])
app.include_router(stats.router, prefix="/api", tags=["stats"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
