"""
Router for managing scheduled jobs.

Schedule definitions are stored in <REPO>/.clump/schedules/{id}.json.
Runtime state (last_run, next_run, run_count) is stored in SQLite.
"""

import json
from datetime import datetime, timezone
from typing import Any, Optional

from croniter import croniter
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
import pytz
from sqlalchemy import select, desc

from app.database import get_repo_db
from app.models import ScheduledJob, ScheduledJobRun, ScheduledJobStatus
from app.storage import (
    get_repo_by_id,
    ScheduleDefinition,
    get_schedule_definition,
    save_schedule_definition,
    delete_schedule_definition,
    list_schedule_definitions,
    generate_schedule_id,
)
from app.services.scheduler import scheduler, calculate_next_run

router = APIRouter()


def safe_json_loads(data: str | None) -> list[Any] | dict[str, Any] | None:
    """Safely parse a JSON string, returning None on failure or empty input."""
    if not data:
        return None
    try:
        return json.loads(data)
    except json.JSONDecodeError:
        return None


def safe_json_dumps(data: list[Any] | dict[str, Any] | None) -> str | None:
    """Safely serialize data to JSON, returning None for empty input."""
    if not data:
        return None
    return json.dumps(data)


class ScheduledJobCreate(BaseModel):
    """Request body for creating a scheduled job."""
    name: str
    description: Optional[str] = None
    cron_expression: str
    timezone: str = "UTC"
    target_type: str  # "issues", "prs", "codebase", "custom"
    filter_query: Optional[str] = Field(
        default=None,
        description=(
            "GitHub-style filter query for selecting issues/PRs. "
            "GitHub filters: state:open|closed, label:name, -label:name. "
            "Sidecar metadata filters: priority:critical|high|medium|low, "
            "difficulty:trivial|easy|medium|hard|complex, risk:low|medium|high, "
            "type:bug|feature|refactor|docs|chore|question, "
            "sidecar-status:open|in_progress|completed|wontfix, "
            "affected-area:name. "
            "All filters support comma-separated values (OR logic) and negation (-prefix). "
            "Example: 'state:open priority:high,critical -type:docs'"
        )
    )
    command_id: Optional[str] = None
    custom_prompt: Optional[str] = None
    max_items: int = 10
    only_new: bool = False  # Only process items not seen before
    permission_mode: Optional[str] = None
    allowed_tools: Optional[list[str]] = None
    max_turns: Optional[int] = None
    model: Optional[str] = None
    cli_type: Optional[str] = None  # claude, gemini, codex

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

    @field_validator("cli_type")
    @classmethod
    def validate_cli_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        valid = {"claude", "gemini", "codex"}
        if v not in valid:
            raise ValueError(f"cli_type must be one of: {valid}")
        return v


class ScheduledJobUpdate(BaseModel):
    """Request body for updating a scheduled job."""
    name: Optional[str] = None
    description: Optional[str] = None
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    target_type: Optional[str] = None
    filter_query: Optional[str] = Field(
        default=None,
        description=(
            "GitHub-style filter query for selecting issues/PRs. "
            "GitHub filters: state:open|closed, label:name, -label:name. "
            "Sidecar metadata filters: priority:critical|high|medium|low, "
            "difficulty:trivial|easy|medium|hard|complex, risk:low|medium|high, "
            "type:bug|feature|refactor|docs|chore|question, "
            "sidecar-status:open|in_progress|completed|wontfix, "
            "affected-area:name. "
            "All filters support comma-separated values (OR logic) and negation (-prefix). "
            "Example: 'state:open priority:high,critical -type:docs'"
        )
    )
    command_id: Optional[str] = None
    custom_prompt: Optional[str] = None
    max_items: Optional[int] = None
    only_new: Optional[bool] = None  # Only process items not seen before
    permission_mode: Optional[str] = None
    allowed_tools: Optional[list[str]] = None
    max_turns: Optional[int] = None
    model: Optional[str] = None
    cli_type: Optional[str] = None  # claude, gemini, codex

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

    @field_validator("cli_type")
    @classmethod
    def validate_cli_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        valid = {"claude", "gemini", "codex"}
        if v not in valid:
            raise ValueError(f"cli_type must be one of: {valid}")
        return v


class ScheduledJobResponse(BaseModel):
    """Response model for a scheduled job."""
    model_config = ConfigDict(from_attributes=True)

    id: str  # Schedule ID (slug)
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
    only_new: bool
    permission_mode: Optional[str]
    allowed_tools: Optional[list[str]]
    max_turns: Optional[int]
    model: Optional[str]
    cli_type: Optional[str]
    next_run_at: Optional[str]
    last_run_at: Optional[str]
    last_run_status: Optional[str]
    run_count: int
    created_at: Optional[str]
    updated_at: Optional[str]


class ScheduledJobRunResponse(BaseModel):
    """Response model for a job run."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    schedule_id: str  # Changed from job_id
    status: str
    started_at: str
    completed_at: Optional[str]
    items_found: int
    items_processed: int
    items_skipped: int
    items_failed: int
    error_message: Optional[str]
    session_ids: Optional[list[str]]


class ScheduledJobRunsResponse(BaseModel):
    """Paginated response for job runs."""
    runs: list[ScheduledJobRunResponse]
    total: int


def definition_to_response(
    definition: ScheduleDefinition,
    runtime: Optional[ScheduledJob] = None,
) -> ScheduledJobResponse:
    """Merge a schedule definition with runtime state into a response."""
    return ScheduledJobResponse(
        id=definition.id,
        name=definition.name,
        description=definition.description,
        status=definition.status,
        cron_expression=definition.cron_expression,
        timezone=definition.timezone,
        target_type=definition.target_type,
        filter_query=definition.filter_query,
        command_id=definition.command_id,
        custom_prompt=definition.custom_prompt,
        max_items=definition.max_items,
        only_new=definition.only_new,
        permission_mode=definition.permission_mode,
        allowed_tools=definition.allowed_tools,
        max_turns=definition.max_turns,
        model=definition.model,
        cli_type=definition.cli_type,
        next_run_at=runtime.next_run_at.isoformat() + "Z" if runtime and runtime.next_run_at else None,
        last_run_at=runtime.last_run_at.isoformat() + "Z" if runtime and runtime.last_run_at else None,
        last_run_status=runtime.last_run_status if runtime else None,
        run_count=runtime.run_count if runtime else 0,
        created_at=runtime.created_at.isoformat() if runtime else None,
        updated_at=runtime.updated_at.isoformat() if runtime else None,
    )


def run_to_response(run: ScheduledJobRun, schedule_id: str) -> ScheduledJobRunResponse:
    """Convert a ScheduledJobRun model to response."""
    return ScheduledJobRunResponse(
        id=run.id,
        schedule_id=schedule_id,
        status=run.status,
        started_at=run.started_at.isoformat() + "Z",
        completed_at=run.completed_at.isoformat() + "Z" if run.completed_at else None,
        items_found=run.items_found,
        items_processed=run.items_processed,
        items_skipped=run.items_skipped,
        items_failed=run.items_failed,
        error_message=run.error_message,
        session_ids=safe_json_loads(run.session_ids),
    )


async def get_or_create_runtime(
    db,
    repo_id: int,
    schedule_id: str,
    definition: ScheduleDefinition,
) -> ScheduledJob:
    """Get or create runtime state for a schedule."""
    # Try to find existing runtime by schedule_id
    result = await db.execute(
        select(ScheduledJob).where(
            ScheduledJob.repo_id == repo_id,
            ScheduledJob.name == schedule_id,  # Using name field to store schedule_id for now
        )
    )
    runtime = result.scalar_one_or_none()

    if not runtime:
        # Create new runtime state
        next_run = calculate_next_run(definition.cron_expression, definition.timezone)
        runtime = ScheduledJob(
            repo_id=repo_id,
            name=schedule_id,  # Store schedule_id in name field
            description=definition.description,
            cron_expression=definition.cron_expression,
            timezone=definition.timezone,
            target_type=definition.target_type,
            filter_query=definition.filter_query,
            command_id=definition.command_id,
            custom_prompt=definition.custom_prompt,
            max_items=definition.max_items,
            only_new=definition.only_new,
            permission_mode=definition.permission_mode,
            allowed_tools=safe_json_dumps(definition.allowed_tools),
            max_turns=definition.max_turns,
            model=definition.model,
            cli_type=definition.cli_type,
            status=definition.status,
            next_run_at=next_run,
        )
        db.add(runtime)
        await db.commit()
        await db.refresh(runtime)

    return runtime


@router.get("/repos/{repo_id}/schedules", response_model=list[ScheduledJobResponse])
async def list_scheduled_jobs(repo_id: int) -> list[ScheduledJobResponse]:
    """List all scheduled jobs for a repository."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Load definitions from JSON
    definitions = list_schedule_definitions(repo["local_path"])

    # Load runtime state from SQLite
    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(ScheduledJob.repo_id == repo_id)
        )
        runtimes = {job.name: job for job in result.scalars().all()}

    # Merge definitions with runtime
    responses = []
    for defn in definitions:
        runtime = runtimes.get(defn.id)
        responses.append(definition_to_response(defn, runtime))

    # Sort by name
    responses.sort(key=lambda x: x.name)
    return responses


@router.post("/repos/{repo_id}/schedules", response_model=ScheduledJobResponse)
async def create_scheduled_job(repo_id: int, data: ScheduledJobCreate) -> ScheduledJobResponse:
    """Create a new scheduled job."""
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

    # Generate unique schedule ID with retry on race condition
    max_retries = 5
    base_schedule_id = generate_schedule_id(data.name, repo["local_path"])
    schedule_id = base_schedule_id

    for attempt in range(max_retries):
        # Create definition
        definition = ScheduleDefinition(
            id=schedule_id,
            name=data.name,
            description=data.description,
            status="active",
            cron_expression=data.cron_expression,
            timezone=data.timezone,
            target_type=data.target_type,
            filter_query=data.filter_query,
            command_id=data.command_id,
            custom_prompt=data.custom_prompt,
            max_items=data.max_items,
            only_new=data.only_new,
            permission_mode=data.permission_mode,
            allowed_tools=data.allowed_tools,
            max_turns=data.max_turns,
            model=data.model,
            cli_type=data.cli_type,
        )

        try:
            # Save to JSON with atomic creation
            save_schedule_definition(repo["local_path"], definition, create_new=True)
            break
        except FileExistsError:
            # Race condition: another request created a file with the same ID
            # Regenerate the ID with a suffix using the base ID
            schedule_id = f"{base_schedule_id}-{attempt + 2}"
            if attempt == max_retries - 1:
                raise HTTPException(
                    status_code=409,
                    detail="Failed to create schedule: too many concurrent requests with the same name"
                )

    # Create runtime state in SQLite
    async with get_repo_db(repo["local_path"]) as db:
        runtime = await get_or_create_runtime(db, repo_id, schedule_id, definition)
        return definition_to_response(definition, runtime)


@router.get("/repos/{repo_id}/schedules/{schedule_id}", response_model=ScheduledJobResponse)
async def get_scheduled_job(repo_id: int, schedule_id: str) -> ScheduledJobResponse:
    """Get details of a scheduled job."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Load definition from JSON
    definition = get_schedule_definition(repo["local_path"], schedule_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    # Load runtime from SQLite
    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.repo_id == repo_id,
                ScheduledJob.name == schedule_id,
            )
        )
        runtime = result.scalar_one_or_none()

    return definition_to_response(definition, runtime)


@router.patch("/repos/{repo_id}/schedules/{schedule_id}", response_model=ScheduledJobResponse)
async def update_scheduled_job(
    repo_id: int,
    schedule_id: str,
    data: ScheduledJobUpdate,
) -> ScheduledJobResponse:
    """Update a scheduled job."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Load existing definition
    definition = get_schedule_definition(repo["local_path"], schedule_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    # Update definition fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(definition, field):
            setattr(definition, field, value)

    # Validate that the updated definition is still valid
    if definition.target_type == "custom":
        if not definition.custom_prompt and not definition.command_id:
            raise HTTPException(
                status_code=400,
                detail="custom_prompt or command_id is required when target_type is 'custom'"
            )
    else:
        if not definition.command_id:
            raise HTTPException(
                status_code=400,
                detail="command_id is required when target_type is not 'custom'"
            )

    # Validate target_type
    valid_target_types = {"issues", "prs", "codebase", "custom"}
    if definition.target_type not in valid_target_types:
        raise HTTPException(
            status_code=400,
            detail=f"target_type must be one of: {valid_target_types}"
        )

    # Save updated definition
    save_schedule_definition(repo["local_path"], definition)

    # Update runtime state (create if doesn't exist)
    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.repo_id == repo_id,
                ScheduledJob.name == schedule_id,
            )
        )
        runtime = result.scalar_one_or_none()

        if not runtime:
            # Create runtime if it doesn't exist
            runtime = await get_or_create_runtime(db, repo_id, schedule_id, definition)

        if runtime:
            # Sync definition fields to runtime
            runtime.description = definition.description
            runtime.cron_expression = definition.cron_expression
            runtime.timezone = definition.timezone
            runtime.target_type = definition.target_type
            runtime.filter_query = definition.filter_query
            runtime.command_id = definition.command_id
            runtime.custom_prompt = definition.custom_prompt
            runtime.max_items = definition.max_items
            runtime.only_new = definition.only_new
            runtime.permission_mode = definition.permission_mode
            runtime.allowed_tools = safe_json_dumps(definition.allowed_tools)
            runtime.max_turns = definition.max_turns
            runtime.model = definition.model
            runtime.cli_type = definition.cli_type
            runtime.status = definition.status
            runtime.updated_at = datetime.now(timezone.utc)

            # Recalculate next run if cron or timezone changed
            if "cron_expression" in update_data or "timezone" in update_data:
                runtime.next_run_at = calculate_next_run(definition.cron_expression, definition.timezone)

            await db.commit()
            await db.refresh(runtime)

    return definition_to_response(definition, runtime)


@router.delete("/repos/{repo_id}/schedules/{schedule_id}")
async def delete_scheduled_job(repo_id: int, schedule_id: str) -> dict:
    """Delete a scheduled job."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Verify definition exists before attempting delete
    definition = get_schedule_definition(repo["local_path"], schedule_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    # Delete runtime state from SQLite first (can be rolled back)
    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.repo_id == repo_id,
                ScheduledJob.name == schedule_id,
            )
        )
        runtime = result.scalar_one_or_none()

        if runtime:
            await db.delete(runtime)
            await db.commit()

    # Delete JSON definition (after SQLite succeeds)
    # If this fails, the schedule will be orphaned in JSON but not in SQLite
    # which is safer than the reverse (can be manually cleaned up)
    deleted = delete_schedule_definition(repo["local_path"], schedule_id)
    if not deleted:
        # This shouldn't happen since we checked above, but handle it gracefully
        raise HTTPException(
            status_code=500,
            detail="Failed to delete schedule definition file"
        )

    return {"status": "deleted", "id": schedule_id}


@router.post("/repos/{repo_id}/schedules/{schedule_id}/run")
async def trigger_job_now(repo_id: int, schedule_id: str) -> dict:
    """Manually trigger a job to run immediately."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Verify definition exists
    definition = get_schedule_definition(repo["local_path"], schedule_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    # Get runtime state (need the int ID for scheduler)
    async with get_repo_db(repo["local_path"]) as db:
        runtime = await get_or_create_runtime(db, repo_id, schedule_id, definition)
        job_id = runtime.id

    run, error = await scheduler.trigger_job(job_id, repo_id)

    if error == "already_running":
        raise HTTPException(status_code=409, detail="Job is already running")

    if not run:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    return {"status": "triggered", "id": schedule_id}


@router.post("/repos/{repo_id}/schedules/{schedule_id}/pause")
async def pause_job(repo_id: int, schedule_id: str) -> ScheduledJobResponse:
    """Pause a scheduled job."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Load and update definition
    definition = get_schedule_definition(repo["local_path"], schedule_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    definition.status = "paused"
    save_schedule_definition(repo["local_path"], definition)

    # Update runtime
    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.repo_id == repo_id,
                ScheduledJob.name == schedule_id,
            )
        )
        runtime = result.scalar_one_or_none()

        if runtime:
            runtime.status = ScheduledJobStatus.PAUSED.value
            runtime.updated_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(runtime)

    return definition_to_response(definition, runtime)


@router.post("/repos/{repo_id}/schedules/{schedule_id}/resume")
async def resume_job(repo_id: int, schedule_id: str) -> ScheduledJobResponse:
    """Resume a paused job."""
    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Load and update definition
    definition = get_schedule_definition(repo["local_path"], schedule_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    definition.status = "active"
    save_schedule_definition(repo["local_path"], definition)

    # Update runtime
    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.repo_id == repo_id,
                ScheduledJob.name == schedule_id,
            )
        )
        runtime = result.scalar_one_or_none()

        if runtime:
            runtime.status = ScheduledJobStatus.ACTIVE.value
            runtime.next_run_at = calculate_next_run(definition.cron_expression, definition.timezone)
            runtime.updated_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(runtime)

    return definition_to_response(definition, runtime)


@router.get("/repos/{repo_id}/schedules/{schedule_id}/runs", response_model=ScheduledJobRunsResponse)
async def list_job_runs(
    repo_id: int,
    schedule_id: str,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
) -> ScheduledJobRunsResponse:
    """List execution history for a job with pagination."""
    from sqlalchemy import func

    repo = get_repo_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Verify definition exists
    definition = get_schedule_definition(repo["local_path"], schedule_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Scheduled job not found")

    async with get_repo_db(repo["local_path"]) as db:
        # Get runtime to find job_id
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.repo_id == repo_id,
                ScheduledJob.name == schedule_id,
            )
        )
        runtime = result.scalar_one_or_none()

        if not runtime:
            return ScheduledJobRunsResponse(runs=[], total=0)

        job_id = runtime.id

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
            runs=[run_to_response(run, schedule_id) for run in runs],
            total=total,
        )
