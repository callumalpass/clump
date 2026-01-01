"""
Scheduler service for running scheduled jobs.

Runs in a background loop, checking for due jobs every minute and executing them.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional, TypedDict
from uuid import uuid4

from croniter import croniter
import pytz
from sqlalchemy import select

from app.database import get_repo_db
from app.models import ScheduledJob, ScheduledJobRun, ScheduledJobStatus, JobRunStatus, Session, SessionStatus, SessionEntity
from app.storage import load_repos, get_repo_by_id, encode_path, SessionMetadata, EntityLink, save_session_metadata, get_issue_metadata
from app.services.headless_analyzer import headless_analyzer
from app.services.github_client import GitHubClient
from app.services.event_manager import event_manager, EventType
from app.routers.commands import find_command_file, parse_command_file

logger = logging.getLogger(__name__)

# Scheduler configuration constants
SCHEDULER_CHECK_INTERVAL_SECONDS = 60  # How often to check for due jobs


class FilterParams(TypedDict):
    """Typed dictionary for parsed filter query parameters."""

    # GitHub filters
    state: str
    labels: list[str]
    exclude_labels: list[str]
    # Sidecar metadata filters
    priority: list[str]
    exclude_priority: list[str]
    difficulty: list[str]
    exclude_difficulty: list[str]
    risk: list[str]
    exclude_risk: list[str]
    type: list[str]
    exclude_type: list[str]
    sidecar_status: list[str]
    exclude_sidecar_status: list[str]
    affected_areas: list[str]
    exclude_affected_areas: list[str]


def calculate_next_run(cron_expression: str, timezone_str: str) -> datetime:
    """Calculate the next run time for a cron expression.

    Args:
        cron_expression: A valid cron expression (e.g., "0 9 * * *")
        timezone_str: IANA timezone name (e.g., "America/New_York")

    Returns:
        The next run time as a naive UTC datetime (for database storage)
    """
    try:
        tz = pytz.timezone(timezone_str)
    except pytz.UnknownTimeZoneError:
        tz = pytz.UTC

    now = datetime.now(tz)
    cron = croniter(cron_expression, now)
    next_run = cron.get_next(datetime)

    # Convert to UTC for storage
    return next_run.astimezone(pytz.UTC).replace(tzinfo=None)


def parse_filter_query(filter_query: str | None) -> FilterParams:
    """
    Parse a GitHub-style filter query into parameters.

    Supports GitHub filters:
        state:open
        label:bug
        label:bug,enhancement (multiple labels OR)
        -label:wontfix (exclude)

    Supports sidecar metadata filters:
        priority:high,critical
        difficulty:easy,medium
        risk:low,medium
        type:bug,feature
        sidecar-status:open,in_progress
        affected-area:backend,frontend
        -priority:low (exclude)
        -difficulty:complex (exclude)
        etc.

    Returns:
        FilterParams with all filter fields.
        Returns default values (state="open", empty lists) if filter_query is None,
        empty, or whitespace-only.
    """
    filters: FilterParams = {
        # GitHub filters
        "state": "open",
        "labels": [],
        "exclude_labels": [],
        # Sidecar metadata filters
        "priority": [],
        "exclude_priority": [],
        "difficulty": [],
        "exclude_difficulty": [],
        "risk": [],
        "exclude_risk": [],
        "type": [],
        "exclude_type": [],
        "sidecar_status": [],
        "exclude_sidecar_status": [],
        "affected_areas": [],
        "exclude_affected_areas": [],
    }

    if not filter_query or not filter_query.strip():
        return filters

    # Define prefix mappings: (prefix, filter_key, is_exclude)
    prefix_mappings = [
        # GitHub filters
        ("state:", "state", False),
        ("-label:", "exclude_labels", True),
        ("label:", "labels", True),
        # Sidecar filters (check exclude prefixes first)
        ("-priority:", "exclude_priority", True),
        ("priority:", "priority", True),
        ("-difficulty:", "exclude_difficulty", True),
        ("difficulty:", "difficulty", True),
        ("-risk:", "exclude_risk", True),
        ("risk:", "risk", True),
        ("-type:", "exclude_type", True),
        ("type:", "type", True),
        ("-sidecar-status:", "exclude_sidecar_status", True),
        ("sidecar-status:", "sidecar_status", True),
        ("-affected-area:", "exclude_affected_areas", True),
        ("affected-area:", "affected_areas", True),
    ]

    parts = filter_query.split()
    for part in parts:
        for prefix, key, is_list in prefix_mappings:
            if part.startswith(prefix):
                value = part[len(prefix):]
                if value:
                    if is_list:
                        values = [v for v in value.split(",") if v]
                        filters[key].extend(values)
                    else:
                        filters[key] = value
                break  # Stop checking prefixes once matched

    return filters


def has_sidecar_filters(filters: FilterParams) -> bool:
    """Check if any sidecar metadata filters are active."""
    sidecar_keys = [
        "priority", "exclude_priority",
        "difficulty", "exclude_difficulty",
        "risk", "exclude_risk",
        "type", "exclude_type",
        "sidecar_status", "exclude_sidecar_status",
        "affected_areas", "exclude_affected_areas",
    ]
    return any(filters.get(key) for key in sidecar_keys)


def filter_issues_by_sidecar(
    issues: list[dict],
    filters: FilterParams,
    encoded_path: str,
) -> list[dict]:
    """
    Filter issues by sidecar metadata.

    Args:
        issues: List of issue dicts with 'number' key
        filters: Parsed filter parameters
        encoded_path: Encoded repo path for loading sidecar metadata

    Returns:
        Filtered list of issues. Issues without sidecar data are excluded
        when any sidecar filter is active.
    """
    if not has_sidecar_filters(filters):
        return issues

    filtered = []
    for issue in issues:
        metadata = get_issue_metadata(encoded_path, issue["number"])

        # Exclude issues without sidecar data when sidecar filters are active
        if metadata is None:
            continue

        # Check each sidecar filter
        # Priority filter
        if filters["priority"]:
            if not metadata.priority or metadata.priority not in filters["priority"]:
                continue
        if filters["exclude_priority"]:
            if metadata.priority and metadata.priority in filters["exclude_priority"]:
                continue

        # Difficulty filter
        if filters["difficulty"]:
            if not metadata.difficulty or metadata.difficulty not in filters["difficulty"]:
                continue
        if filters["exclude_difficulty"]:
            if metadata.difficulty and metadata.difficulty in filters["exclude_difficulty"]:
                continue

        # Risk filter
        if filters["risk"]:
            if not metadata.risk or metadata.risk not in filters["risk"]:
                continue
        if filters["exclude_risk"]:
            if metadata.risk and metadata.risk in filters["exclude_risk"]:
                continue

        # Type filter
        if filters["type"]:
            if not metadata.type or metadata.type not in filters["type"]:
                continue
        if filters["exclude_type"]:
            if metadata.type and metadata.type in filters["exclude_type"]:
                continue

        # Sidecar status filter
        if filters["sidecar_status"]:
            if not metadata.status or metadata.status not in filters["sidecar_status"]:
                continue
        if filters["exclude_sidecar_status"]:
            if metadata.status and metadata.status in filters["exclude_sidecar_status"]:
                continue

        # Affected areas filter (check if any filter value matches any affected area)
        if filters["affected_areas"]:
            issue_areas = metadata.affected_areas or []
            if not any(area in issue_areas for area in filters["affected_areas"]):
                continue
        if filters["exclude_affected_areas"]:
            issue_areas = metadata.affected_areas or []
            if any(area in issue_areas for area in filters["exclude_affected_areas"]):
                continue

        filtered.append(issue)

    return filtered


def get_command_template(command_id: str, category: str, repo_path: str | None) -> str | None:
    """Get a command's template by ID and category."""
    file_path, source = find_command_file(command_id, category, repo_path)

    if not file_path:
        return None

    cmd = parse_command_file(file_path, category, source)
    return cmd.template if cmd else None


def build_prompt_from_template(template: str, context: dict) -> str:
    """Build a prompt by substituting template variables."""
    result = template
    for key, value in context.items():
        placeholder = "{{" + key + "}}"
        result = result.replace(placeholder, str(value) if value else "")
    return result


class SchedulerService:
    """Background service that runs scheduled jobs."""

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._running_jobs: set[int] = set()  # Track currently executing job IDs
        self._running_jobs_lock = asyncio.Lock()  # Protect access to _running_jobs
        self._check_interval = SCHEDULER_CHECK_INTERVAL_SECONDS

    async def start(self):
        """Start the scheduler background task."""
        if self._running:
            return

        # Clean up any orphaned sessions from previous runs
        await self._cleanup_orphaned_sessions()

        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Scheduler service started")

    async def _cleanup_orphaned_sessions(self):
        """
        Mark any sessions with status=RUNNING as FAILED on startup.

        These are orphaned sessions from a previous server run that never completed.
        Since in-memory tracking is lost on restart, we can't tell if they're actually
        running, so we mark them as failed.
        """
        repos = load_repos()
        total_cleaned = 0

        for repo in repos:
            try:
                async with get_repo_db(repo["local_path"]) as db:
                    result = await db.execute(
                        select(Session).where(Session.status == SessionStatus.RUNNING.value)
                    )
                    orphaned = result.scalars().all()

                    for session in orphaned:
                        session.status = SessionStatus.FAILED.value
                        session.completed_at = datetime.now(timezone.utc)
                        total_cleaned += 1

                    if orphaned:
                        await db.commit()
                        logger.info(f"Cleaned up {len(orphaned)} orphaned sessions in {repo['local_path']}")

            except Exception as e:
                logger.error(f"Error cleaning up orphaned sessions for {repo.get('local_path', 'unknown')}: {e}")

        if total_cleaned:
            logger.info(f"Total orphaned sessions cleaned up: {total_cleaned}")

    async def stop(self):
        """Stop the scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Scheduler service stopped")

    async def _run_loop(self):
        """Main scheduler loop - check for due jobs every minute."""
        while self._running:
            try:
                await self._check_and_run_due_jobs()
            except Exception as e:
                logger.error(f"Scheduler error: {e}", exc_info=True)

            # Wait before next check
            await asyncio.sleep(self._check_interval)

    async def _check_and_run_due_jobs(self):
        """Find and execute any jobs that are due."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        repos = load_repos()

        for repo in repos:
            try:
                await self._check_repo_jobs(repo, now)
            except Exception as e:
                logger.error(f"Error checking jobs for repo {repo['id']}: {e}")

    async def _check_repo_jobs(self, repo: dict, now: datetime):
        """Check and run due jobs for a specific repo."""
        async with get_repo_db(repo["local_path"]) as db:
            # Query for active jobs where next_run_at <= now
            result = await db.execute(
                select(ScheduledJob).where(
                    ScheduledJob.repo_id == repo["id"],
                    ScheduledJob.status == ScheduledJobStatus.ACTIVE.value,
                    ScheduledJob.next_run_at <= now,
                )
            )
            due_jobs = result.scalars().all()

            for job in due_jobs:
                # Skip if already running (check under lock)
                async with self._running_jobs_lock:
                    if job.id in self._running_jobs:
                        continue
                    # Run job in background (don't await)
                    self._running_jobs.add(job.id)
                asyncio.create_task(self._execute_job_safe(job.id, repo))

    async def _execute_job_safe(self, job_id: int, repo: dict):
        """Execute a job with error handling."""
        try:
            await self._execute_job(job_id, repo)
        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}", exc_info=True)
        finally:
            async with self._running_jobs_lock:
                self._running_jobs.discard(job_id)

    async def _execute_job(self, job_id: int, repo: dict):
        """Execute a single scheduled job."""
        async with get_repo_db(repo["local_path"]) as db:
            # Re-fetch job within this session to ensure it's attached
            result = await db.execute(
                select(ScheduledJob).where(ScheduledJob.id == job_id)
            )
            job = result.scalar_one_or_none()
            if not job:
                logger.warning(f"Job {job_id} not found, skipping execution")
                return

            logger.info(f"Executing job {job.id}: {job.name}")

            # Update next_run_at immediately to prevent duplicate runs
            job.next_run_at = self._calculate_next_run(job)
            await db.commit()

            # Create run record
            run = ScheduledJobRun(
                job_id=job.id,
                repo_id=job.repo_id,
                status=JobRunStatus.RUNNING.value,
            )
            db.add(run)
            await db.commit()
            await db.refresh(run)

            try:
                # Get items to process
                items = await self._get_target_items(job, repo)
                run.items_found = len(items)

                # Process each item (with limit)
                session_ids = []
                items_to_process = items[:job.max_items]

                for item in items_to_process:
                    try:
                        session_id = await self._process_item(job, repo, item)
                        if session_id:
                            session_ids.append(session_id)
                            run.items_processed += 1
                    except Exception as e:
                        run.items_failed += 1
                        logger.error(f"Failed to process item in job {job.id}: {e}")

                run.status = JobRunStatus.COMPLETED.value
                run.session_ids = json.dumps(session_ids)

            except Exception as e:
                run.status = JobRunStatus.FAILED.value
                run.error_message = str(e)
                logger.error(f"Job {job.id} execution failed: {e}")

            finally:
                run.completed_at = datetime.now(timezone.utc)

                # Update job with next run time
                job.last_run_at = run.started_at
                job.last_run_status = run.status
                job.next_run_at = self._calculate_next_run(job)
                job.run_count += 1

                await db.commit()

        logger.info(f"Job {job.id} completed: {run.status}")

    async def _get_processed_entities(self, job: ScheduledJob, repo: dict, entity_kind: str) -> set[int]:
        """Get entity numbers that have already been processed by this job."""
        async with get_repo_db(repo["local_path"]) as db:
            # Find all sessions created by this job, then get their entities
            result = await db.execute(
                select(SessionEntity.entity_number)
                .join(Session, SessionEntity.session_id == Session.id)
                .where(
                    Session.scheduled_job_id == job.id,
                    SessionEntity.entity_kind == entity_kind,
                )
            )
            return set(result.scalars().all())

    async def _get_target_items(self, job: ScheduledJob, repo: dict) -> list:
        """Get items to process based on job configuration."""
        if job.target_type == "issues":
            items = await self._get_issues(job, repo)
            if job.only_new:
                processed = await self._get_processed_entities(job, repo, "issue")
                items = [i for i in items if i["number"] not in processed]
            return items
        elif job.target_type == "prs":
            items = await self._get_prs(job, repo)
            if job.only_new:
                processed = await self._get_processed_entities(job, repo, "pr")
                items = [i for i in items if i["number"] not in processed]
            return items
        elif job.target_type == "codebase":
            return [{"type": "codebase"}]
        elif job.target_type == "custom":
            return [{"type": "custom"}]
        return []

    async def _get_issues(self, job: ScheduledJob, repo: dict) -> list:
        """Get all issues matching the filter query (GitHub + sidecar filters)."""
        filters = parse_filter_query(job.filter_query)

        client = GitHubClient()
        issues = client.list_all_issues(
            owner=repo["owner"],
            name=repo["name"],
            state=filters.get("state", "open"),
            labels=filters.get("labels") or None,
        )

        # Filter out excluded labels
        exclude_labels = filters.get("exclude_labels", [])
        if exclude_labels:
            issues = [
                i for i in issues
                if not any(label in i.labels for label in exclude_labels)
            ]

        # Convert to dicts for further processing
        issue_dicts = [
            {
                "type": "issue",
                "number": issue.number,
                "title": issue.title,
                "body": issue.body,
            }
            for issue in issues
        ]

        # Apply sidecar metadata filters
        encoded_path = encode_path(repo["local_path"])
        issue_dicts = filter_issues_by_sidecar(issue_dicts, filters, encoded_path)

        return issue_dicts

    async def _get_prs(self, job: ScheduledJob, repo: dict) -> list:
        """Get all PRs matching the filter query."""
        filters = parse_filter_query(job.filter_query)

        client = GitHubClient()
        prs = client.list_all_prs(
            owner=repo["owner"],
            name=repo["name"],
            state=filters.get("state", "open"),
        )

        return [
            {
                "type": "pr",
                "number": pr.number,
                "title": pr.title,
                "body": pr.body,
                "head_ref": pr.head_ref,
                "base_ref": pr.base_ref,
            }
            for pr in prs
        ]

    async def _process_item(self, job: ScheduledJob, repo: dict, item: dict) -> str | None:
        """Process a single item - create a headless session."""
        # Determine prompt
        if job.target_type == "custom":
            # Custom can use either a general command or a custom prompt
            if job.command_id:
                template = get_command_template(job.command_id, "general", repo["local_path"])
                if template:
                    prompt = template
                else:
                    prompt = job.custom_prompt
            else:
                prompt = job.custom_prompt

            if not prompt:
                logger.warning(f"Job {job.id} has no custom_prompt or valid command_id")
                return None
        else:
            # Get command template
            if not job.command_id:
                logger.warning(f"Job {job.id} has no command_id")
                return None

            # Determine category from target_type
            category = "issue" if job.target_type == "issues" else "pr"
            template = get_command_template(job.command_id, category, repo["local_path"])

            if not template:
                logger.warning(f"Command {job.command_id} not found for job {job.id}")
                return None

            prompt = build_prompt_from_template(template, item)

        # Parse allowed tools if set
        allowed_tools = None
        if job.allowed_tools:
            try:
                allowed_tools = json.loads(job.allowed_tools)
            except json.JSONDecodeError:
                pass

        # Determine title and entities for this session
        entities = []
        title = job.name
        kind = "custom"

        if item.get("type") == "issue":
            entities.append(EntityLink(kind="issue", number=item["number"]))
            title = f"{job.name}: Issue #{item['number']}"
            kind = "issue"
        elif item.get("type") == "pr":
            entities.append(EntityLink(kind="pr", number=item["number"]))
            title = f"{job.name}: PR #{item['number']}"
            kind = "pr"

        # Generate session ID upfront so it appears as "active" during execution
        session_id = str(uuid4())

        # Create database session record before running
        async with get_repo_db(repo["local_path"]) as db:
            session = Session(
                repo_id=repo["id"],
                kind=kind,
                title=title,
                prompt=prompt,
                status=SessionStatus.RUNNING.value,
                claude_session_id=session_id,
                scheduled_job_id=job.id,  # Link session to the schedule that created it
            )
            db.add(session)
            await db.commit()
            await db.refresh(session)

            # Create SessionEntity records to track which entities this session processed
            for entity in entities:
                session_entity = SessionEntity(
                    session_id=session.id,
                    repo_id=repo["id"],
                    entity_kind=entity.kind,
                    entity_number=entity.number,
                )
                db.add(session_entity)
            await db.commit()

        # Save session metadata sidecar BEFORE running so it shows in session list
        encoded_path = encode_path(repo["local_path"])
        metadata = SessionMetadata(
            session_id=session_id,
            title=title,
            repo_path=repo["local_path"],
            entities=entities,
            created_at=datetime.now(timezone.utc).isoformat(),
            scheduled_job_id=job.id,  # Link session to the schedule that created it
        )
        save_session_metadata(encoded_path, session_id, metadata)

        # Register session as running BEFORE starting (belt and suspenders with analyze_stream tracking)
        headless_analyzer.register_running(session_id)

        # Emit session created event
        await event_manager.emit(EventType.SESSION_CREATED, {
            "session_id": session_id,
            "repo_path": repo["local_path"],
            "title": title,
            "is_active": True,
        })

        try:
            # Run headless session with our pre-generated session ID
            result = await headless_analyzer.analyze(
                prompt=prompt,
                working_dir=repo["local_path"],
                session_id=session_id,
                permission_mode=job.permission_mode,
                allowed_tools=allowed_tools,
                max_turns=job.max_turns,
                model=job.model,
            )

            # Update session status
            async with get_repo_db(repo["local_path"]) as db:
                db_result = await db.execute(
                    select(Session).where(Session.claude_session_id == session_id)
                )
                db_session = db_result.scalar_one_or_none()
                if db_session:
                    db_session.status = (
                        SessionStatus.COMPLETED.value if result.success else SessionStatus.FAILED.value
                    )
                    db_session.transcript = result.result
                    db_session.completed_at = datetime.now(timezone.utc)
                    await db.commit()

            if result.success:
                return session_id
            else:
                logger.warning(f"Session failed for job {job.id}: {result.error}")
                return None

        except Exception as e:
            # Update session status to failed
            async with get_repo_db(repo["local_path"]) as db:
                db_result = await db.execute(
                    select(Session).where(Session.claude_session_id == session_id)
                )
                db_session = db_result.scalar_one_or_none()
                if db_session:
                    db_session.status = SessionStatus.FAILED.value
                    db_session.completed_at = datetime.now(timezone.utc)
                    await db.commit()
            logger.error(f"Session error for job {job.id}: {e}")
            return None

        finally:
            # Always unregister when done (success, failure, or exception)
            headless_analyzer.unregister_running(session_id)

            # Emit session completed event
            await event_manager.emit(EventType.SESSION_COMPLETED, {
                "session_id": session_id,
                "repo_path": repo["local_path"],
            })

    def _calculate_next_run(self, job: ScheduledJob) -> datetime:
        """Calculate the next run time based on cron expression."""
        return calculate_next_run(job.cron_expression, job.timezone)

    async def trigger_job(self, job_id: int, repo_id: int) -> tuple[Optional[ScheduledJobRun], Optional[str]]:
        """Manually trigger a job to run immediately.

        Returns a tuple of (run_record, error_message).
        If the job is already running, returns (None, "already_running").
        """
        # Check if already running before doing any DB work (under lock)
        async with self._running_jobs_lock:
            if job_id in self._running_jobs:
                return None, "already_running"

        repo = get_repo_by_id(repo_id)
        if not repo:
            return None, None

        async with get_repo_db(repo["local_path"]) as db:
            result = await db.execute(
                select(ScheduledJob).where(ScheduledJob.id == job_id)
            )
            job = result.scalar_one_or_none()

            if not job:
                return None, None

            # Check and add under lock to prevent race conditions
            async with self._running_jobs_lock:
                if job.id in self._running_jobs:
                    return None, "already_running"
                # Execute immediately in background
                self._running_jobs.add(job.id)

            asyncio.create_task(self._execute_job_safe(job.id, repo))

            # Return a pending run record
            return ScheduledJobRun(
                job_id=job.id,
                repo_id=job.repo_id,
                status=JobRunStatus.PENDING.value,
            ), None


# Global scheduler instance
scheduler = SchedulerService()
