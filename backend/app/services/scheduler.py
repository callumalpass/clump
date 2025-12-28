"""
Scheduler service for running scheduled jobs.

Runs in a background loop, checking for due jobs every minute and executing them.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from croniter import croniter
import pytz
from sqlalchemy import select

from app.database import get_repo_db
from app.models import ScheduledJob, ScheduledJobRun, ScheduledJobStatus, JobRunStatus, Session, SessionStatus
from app.storage import load_repos, get_repo_by_id, encode_path, SessionMetadata, EntityLink, save_session_metadata
from app.services.headless_analyzer import headless_analyzer
from app.services.github_client import GitHubClient
from app.services.event_manager import event_manager, EventType
from app.routers.commands import find_command_file, parse_command_file

logger = logging.getLogger(__name__)


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


def parse_filter_query(filter_query: str | None) -> dict:
    """
    Parse a GitHub-style filter query into parameters.

    Supports:
        state:open
        label:bug
        label:bug,enhancement (multiple labels OR)
        -label:wontfix (exclude)

    Returns:
        Empty dict if filter_query is None, empty, or whitespace-only.
        Otherwise returns dict with state, labels, and exclude_labels.
    """
    if not filter_query or not filter_query.strip():
        return {}

    filters: dict = {
        "state": "open",
        "labels": [],
        "exclude_labels": [],
    }

    state_prefix = "state:"
    label_prefix = "label:"
    exclude_label_prefix = "-label:"

    parts = filter_query.split()
    for part in parts:
        if part.startswith(state_prefix):
            value = part[len(state_prefix) :]
            if value:  # Only set if non-empty
                filters["state"] = value
        elif part.startswith(label_prefix):
            labels = [label for label in part[len(label_prefix) :].split(",") if label]
            filters["labels"].extend(labels)
        elif part.startswith(exclude_label_prefix):
            labels = [
                label for label in part[len(exclude_label_prefix) :].split(",") if label
            ]
            filters["exclude_labels"].extend(labels)

    return filters


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
        self._check_interval = 60  # Check every 60 seconds

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
                # Skip if already running
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

    async def _get_target_items(self, job: ScheduledJob, repo: dict) -> list:
        """Get items to process based on job configuration."""
        if job.target_type == "issues":
            return await self._get_issues(job, repo)
        elif job.target_type == "prs":
            return await self._get_prs(job, repo)
        elif job.target_type == "codebase":
            return [{"type": "codebase"}]
        elif job.target_type == "custom":
            return [{"type": "custom"}]
        return []

    async def _get_issues(self, job: ScheduledJob, repo: dict) -> list:
        """Get issues matching the filter query."""
        filters = parse_filter_query(job.filter_query)

        client = GitHubClient()
        issues, _ = client.list_issues(
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

        return [
            {
                "type": "issue",
                "number": issue.number,
                "title": issue.title,
                "body": issue.body,
            }
            for issue in issues
        ]

    async def _get_prs(self, job: ScheduledJob, repo: dict) -> list:
        """Get PRs matching the filter query."""
        filters = parse_filter_query(job.filter_query)

        client = GitHubClient()
        prs, _ = client.list_prs(
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
            )
            db.add(session)
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
        # Check if already running before doing any DB work
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

            # Double-check after DB query (in case of race)
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
