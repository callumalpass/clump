"""
Router for managing scheduled jobs.
"""

from datetime import datetime, timezone
from typing import Optional

from croniter import croniter
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, field_validator
import pytz
from sqlalchemy import select, desc

from app.database import get_repo_db
from app.models import ScheduledJob, ScheduledJobRun, ScheduledJobStatus, ScheduledJobTargetType
from app.storage import get_repo_by_id
from app.services.scheduler import scheduler

router = APIRouter()


class ScheduledJobCreate(BaseModel):
    """Request body for creating a scheduled job."""
    name: str
    description: Optional[str] = None
    cron_expression: str
    timezone: str = "UTC"
    target_type: str  # "issues", "prs", "codebase", "custom"
    filter_query: Optional[str] = None
    command_id: Optional[str] = None
    custom_prompt: Optional[str] = None
    max_items: int = 10
    permission_mode: Optional[str] = None
    allowed_tools: Optional[list[str]] = None
    max_turns: Optional[int] = None
    model: Optional[str] = None

    @field_validator("cron_expression")
    @classmethod
    def validate_cron(cls, v: str) -> str:
        try:
            croniter(v)
        except (ValueError, KeyError) as e:
            raise ValueError(f"Invalid cron expression: {e}")
        return v

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        try:
            pytz.timezone(v)
        except pytz.UnknownTimeZoneError:
            raise ValueError(f"Unknown timezone: {v}")
        return v

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, v: str) -> str:
        valid = {"issues", "prs", "codebase", "custom"}
        if v not in valid:
            raise ValueError(f"target_type must be one of: {valid}")
        return v


class ScheduledJobUpdate(BaseModel):
    """Request body for updating a scheduled job."""
    name: Optional[str] = None
    description: Optional[str] = None
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    target_type: Optional[str] = None
    filter_query: Optional[str] = None
    command_id: Optional[str] = None
    custom_prompt: Optional[str] = None
    max_items: Optional[int] = None
    permission_mode: Optional[str] = None
    allowed_tools: Optional[list[str]] = None
    max_turns: Optional[int] = None
    model: Optional[str] = None

    @field_validator("cron_expression")
    @classmethod
    def validate_cron(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        try:
            croniter(v)
        except (ValueError, KeyError) as e:
            raise ValueError(f"Invalid cron expression: {e}")
        return v

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        try:
            pytz.timezone(v)
        except pytz.UnknownTimeZoneError:
            raise ValueError(f"Unknown timezone: {v}")
        return v


class ScheduledJobResponse(BaseModel):
    """Response model for a scheduled job."""
    id: int
    name: str
    description: Optional[str]
    status: str
    cron_expression: str
    timezone: str
    target_type: str
    filter_query: Optional[str]
    command_id: Optional[str]
    custom_prompt: Optional[str]
    max_items: int
    permission_mode: Optional[str]
    allowed_tools: Optional[list[str]]
    max_turns: Optional[int]
    model: Optional[str]
    next_run_at: Optional[str]
    last_run_at: Optional[str]
    last_run_status: Optional[str]
    run_count: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class ScheduledJobRunResponse(BaseModel):
    """Response model for a job run."""
    id: int
    job_id: int
    status: str
    started_at: str
    completed_at: Optional[str]
    items_found: int
    items_processed: int
    items_skipped: int
    items_failed: int
    error_message: Optional[str]
    session_ids: Optional[list[str]]

    class Config:
        from_attributes = True


class ScheduledJobRunsResponse(BaseModel):
    """Paginated response for job runs."""
    runs: list[ScheduledJobRunResponse]
    total: int


def job_to_response(job: ScheduledJob) -> ScheduledJobResponse:
    """Convert a ScheduledJob model to response."""
    import json

    allowed_tools = None
    if job.allowed_tools:
        try:
            allowed_tools = json.loads(job.allowed_tools)
        except json.JSONDecodeError:
            pass

    return ScheduledJobResponse(
        id=job.id,
        name=job.name,
        description=job.description,
        status=job.status,
        cron_expression=job.cron_expression,
        timezone=job.timezone,
        target_type=job.target_type,
        filter_query=job.filter_query,
        command_id=job.command_id,
        custom_prompt=job.custom_prompt,
        max_items=job.max_items,
        permission_mode=job.permission_mode,
        allowed_tools=allowed_tools,
        max_turns=job.max_turns,
        model=job.model,
        next_run_at=job.next_run_at.isoformat() + "Z" if job.next_run_at else None,
        last_run_at=job.last_run_at.isoformat() + "Z" if job.last_run_at else None,
        last_run_status=job.last_run_status,
        run_count=job.run_count,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
    )


def run_to_response(run: ScheduledJobRun) -> ScheduledJobRunResponse:
    """Convert a ScheduledJobRun model to response."""
    import json

    session_ids = None
    if run.session_ids:
        try:
            session_ids = json.loads(run.session_ids)
        except json.JSONDecodeError:
            pass

    return ScheduledJobRunResponse(
        id=run.id,
        job_id=run.job_id,
        status=run.status,
        started_at=run.started_at.isoformat(),
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
        items_found=run.items_found,
        items_processed=run.items_processed,
        items_skipped=run.items_skipped,
        items_failed=run.items_failed,
        error_message=run.error_message,
        session_ids=session_ids,
    )


def calculate_next_run(cron_expression: str, timezone_str: str) -> datetime:
    """Calculate the next run time for a cron expression."""
    try:
        tz = pytz.timezone(timezone_str)
    except pytz.UnknownTimeZoneError:
        tz = pytz.UTC

    now = datetime.now(tz)
    cron = croniter(cron_expression, now)
    next_run = cron.get_next(datetime)

    # Convert to UTC for storage
    return next_run.astimezone(pytz.UTC).replace(tzinfo=None)


@router.get("/repos/{repo_id}/schedules", response_model=list[ScheduledJobResponse])
async def list_scheduled_jobs(repo_id: int) -> list[ScheduledJobResponse]:
    """List all scheduled jobs for a repository."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob)
            .where(ScheduledJob.repo_id == repo_id)
            .order_by(desc(ScheduledJob.created_at))
        )
        jobs = result.scalars().all()

        return [job_to_response(job) for job in jobs]


@router.post("/repos/{repo_id}/schedules", response_model=ScheduledJobResponse)
async def create_scheduled_job(repo_id: int, data: ScheduledJobCreate) -> ScheduledJobResponse:
    """Create a new scheduled job."""
    import json

    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Validate that either command_id or custom_prompt is provided
    if data.target_type == "custom":
        if not data.custom_prompt:
            raise HTTPException(
                status_code=400,
                detail="custom_prompt is required when target_type is 'custom'"
            )
    else:
        if not data.command_id:
            raise HTTPException(
                status_code=400,
                detail="command_id is required when target_type is not 'custom'"
            )

    # Calculate first run time
    next_run = calculate_next_run(data.cron_expression, data.timezone)

    async with get_repo_db(repo["local_path"]) as db:
        job = ScheduledJob(
            repo_id=repo_id,
            name=data.name,
            description=data.description,
            cron_expression=data.cron_expression,
            timezone=data.timezone,
            target_type=data.target_type,
            filter_query=data.filter_query,
            command_id=data.command_id,
            custom_prompt=data.custom_prompt,
            max_items=data.max_items,
            permission_mode=data.permission_mode,
            allowed_tools=json.dumps(data.allowed_tools) if data.allowed_tools else None,
            max_turns=data.max_turns,
            model=data.model,
            next_run_at=next_run,
        )

        db.add(job)
        await db.commit()
        await db.refresh(job)

        return job_to_response(job)


@router.get("/repos/{repo_id}/schedules/{job_id}", response_model=ScheduledJobResponse)
async def get_scheduled_job(repo_id: int, job_id: int) -> ScheduledJobResponse:
    """Get details of a scheduled job."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.repo_id == repo_id,
            )
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(status_code=404, detail="Scheduled job not found")

        return job_to_response(job)


@router.patch("/repos/{repo_id}/schedules/{job_id}", response_model=ScheduledJobResponse)
async def update_scheduled_job(
    repo_id: int,
    job_id: int,
    data: ScheduledJobUpdate,
) -> ScheduledJobResponse:
    """Update a scheduled job."""
    import json

    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.repo_id == repo_id,
            )
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(status_code=404, detail="Scheduled job not found")

        # Update fields
        update_data = data.model_dump(exclude_unset=True)

        if "allowed_tools" in update_data:
            update_data["allowed_tools"] = json.dumps(update_data["allowed_tools"]) if update_data["allowed_tools"] else None

        for field, value in update_data.items():
            setattr(job, field, value)

        # Recalculate next run if cron or timezone changed
        if "cron_expression" in update_data or "timezone" in update_data:
            job.next_run_at = calculate_next_run(job.cron_expression, job.timezone)

        job.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(job)

        return job_to_response(job)


@router.delete("/repos/{repo_id}/schedules/{job_id}")
async def delete_scheduled_job(repo_id: int, job_id: int) -> dict:
    """Delete a scheduled job."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.repo_id == repo_id,
            )
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(status_code=404, detail="Scheduled job not found")

        await db.delete(job)
        await db.commit()

        return {"status": "deleted", "id": job_id}


@router.post("/repos/{repo_id}/schedules/{job_id}/run")
async def trigger_job_now(repo_id: int, job_id: int) -> dict:
    """Manually trigger a job to run immediately."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    run, error = await scheduler.trigger_job(job_id, repo_id)

    if error == "already_running":
        raise HTTPException(status_code=409, detail="Job is already running")

    if not run:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    return {"status": "triggered", "job_id": job_id}


@router.post("/repos/{repo_id}/schedules/{job_id}/pause")
async def pause_job(repo_id: int, job_id: int) -> ScheduledJobResponse:
    """Pause a scheduled job."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.repo_id == repo_id,
            )
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(status_code=404, detail="Scheduled job not found")

        job.status = ScheduledJobStatus.PAUSED.value
        job.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(job)

        return job_to_response(job)


@router.post("/repos/{repo_id}/schedules/{job_id}/resume")
async def resume_job(repo_id: int, job_id: int) -> ScheduledJobResponse:
    """Resume a paused job."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.repo_id == repo_id,
            )
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(status_code=404, detail="Scheduled job not found")

        job.status = ScheduledJobStatus.ACTIVE.value
        job.next_run_at = calculate_next_run(job.cron_expression, job.timezone)
        job.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(job)

        return job_to_response(job)


@router.get("/repos/{repo_id}/schedules/{job_id}/runs", response_model=ScheduledJobRunsResponse)
async def list_job_runs(
    repo_id: int,
    job_id: int,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
) -> ScheduledJobRunsResponse:
    """List execution history for a job with pagination."""
    from sqlalchemy import func

    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    async with get_repo_db(repo["local_path"]) as db:
        # Get total count
        count_result = await db.execute(
            select(func.count()).select_from(ScheduledJobRun).where(ScheduledJobRun.job_id == job_id)
        )
        total = count_result.scalar() or 0

        # Get paginated runs
        result = await db.execute(
            select(ScheduledJobRun)
            .where(ScheduledJobRun.job_id == job_id)
            .order_by(desc(ScheduledJobRun.started_at))
            .offset(offset)
            .limit(limit)
        )
        runs = result.scalars().all()

        return ScheduledJobRunsResponse(
            runs=[run_to_response(run) for run in runs],
            total=total,
        )
