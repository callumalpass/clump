# Scheduled Session System

## Overview

Automatically run Claude Code sessions on a schedule - for example, triage new issues every morning, or run security reviews on new PRs.

## Use Cases

1. **Daily Issue Triage**: Run `root-cause` analysis on all issues labeled `needs-triage` each morning
2. **PR Review**: Automatically run `security-review` on new PRs when they're opened
3. **Weekly Codebase Check**: Run a codebase-wide analysis weekly
4. **Periodic Health Checks**: Run tests or lint checks on a schedule

## Architecture

### Backend

#### 1. New Database Table: `scheduled_jobs`

```python
# models.py
class ScheduledJobStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"

class ScheduledJob(Base):
    """A scheduled job configuration."""
    __tablename__ = "scheduled_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    repo_id: Mapped[int] = mapped_column(Integer)

    # Job configuration
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default=ScheduledJobStatus.ACTIVE.value)

    # Schedule (cron format)
    cron_expression: Mapped[str] = mapped_column(String(100))  # e.g., "0 9 * * 1-5"
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")

    # Target configuration
    target_type: Mapped[str] = mapped_column(String(50))  # "issues", "prs", "codebase", "custom"
    filter_query: Mapped[str | None] = mapped_column(Text, nullable=True)  # e.g., "state:open label:needs-triage"
    command_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g., "issue/root-cause"
    custom_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)  # For custom target_type
    max_items: Mapped[int] = mapped_column(Integer, default=10)  # Max items per run

    # Claude configuration
    permission_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    allowed_tools: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    max_turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Execution tracking
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_run_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to runs
    runs: Mapped[list["ScheduledJobRun"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class ScheduledJobRun(Base):
    """A single execution of a scheduled job."""
    __tablename__ = "scheduled_job_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("scheduled_jobs.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(Integer)

    # Run status
    status: Mapped[str] = mapped_column(String(50))  # pending, running, completed, failed
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Items processed
    items_found: Mapped[int] = mapped_column(Integer, default=0)
    items_processed: Mapped[int] = mapped_column(Integer, default=0)
    items_skipped: Mapped[int] = mapped_column(Integer, default=0)
    items_failed: Mapped[int] = mapped_column(Integer, default=0)

    # Details
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    session_ids: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of created session IDs

    job: Mapped["ScheduledJob"] = relationship(back_populates="runs")
```

#### 2. Scheduler Service

```python
# services/scheduler.py
import asyncio
from datetime import datetime, timedelta
from croniter import croniter
import pytz

class SchedulerService:
    """Background service that runs scheduled jobs."""

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self):
        """Start the scheduler background task."""
        if self._running:
            return

        self._running = True
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        """Stop the scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run_loop(self):
        """Main scheduler loop - check for due jobs every minute."""
        while self._running:
            try:
                await self._check_and_run_due_jobs()
            except Exception as e:
                print(f"Scheduler error: {e}")

            # Wait 60 seconds before next check
            await asyncio.sleep(60)

    async def _check_and_run_due_jobs(self):
        """Find and execute any jobs that are due."""
        now = datetime.utcnow()

        # Query for active jobs where next_run_at <= now
        jobs = await self._get_due_jobs(now)

        for job in jobs:
            # Run each job concurrently (but with concurrency limit)
            asyncio.create_task(self._execute_job(job))

    async def _execute_job(self, job: ScheduledJob):
        """Execute a single scheduled job."""
        # Create run record
        run = ScheduledJobRun(
            job_id=job.id,
            repo_id=job.repo_id,
            status="running",
        )
        # Save run record...

        try:
            # Get items to process based on target_type and filter
            items = await self._get_target_items(job)
            run.items_found = len(items)

            # Process each item (with concurrency limit)
            session_ids = []
            for item in items[:job.max_items]:
                try:
                    session_id = await self._process_item(job, item)
                    session_ids.append(session_id)
                    run.items_processed += 1
                except Exception as e:
                    run.items_failed += 1
                    print(f"Failed to process item: {e}")

            run.status = "completed"
            run.session_ids = json.dumps(session_ids)

        except Exception as e:
            run.status = "failed"
            run.error_message = str(e)

        finally:
            run.completed_at = datetime.utcnow()
            # Update job with next run time
            job.last_run_at = run.started_at
            job.last_run_status = run.status
            job.next_run_at = self._calculate_next_run(job)
            job.run_count += 1
            # Save changes...

    async def _get_target_items(self, job: ScheduledJob) -> list:
        """Get items to process based on job configuration."""
        if job.target_type == "issues":
            return await self._get_issues(job)
        elif job.target_type == "prs":
            return await self._get_prs(job)
        elif job.target_type == "codebase":
            return [{"type": "codebase"}]  # Single item for codebase jobs
        elif job.target_type == "custom":
            return [{"type": "custom"}]  # Single item - runs custom_prompt
        return []

    async def _process_item(self, job: ScheduledJob, item: dict) -> str:
        """Process a single item - create a headless session."""
        # Determine prompt: either from command template or custom_prompt
        if job.target_type == "custom":
            prompt = job.custom_prompt
        else:
            command = await get_command(job.command_id)
            prompt = build_prompt_from_template(command.template, item)

        # Run headless session
        entities = []
        if item.get("number"):
            entities = [{"kind": job.target_type.rstrip("s"), "number": item.get("number")}]

        result = await headless_analyzer.run(
            repo_id=job.repo_id,
            prompt=prompt,
            permission_mode=job.permission_mode,
            allowed_tools=json.loads(job.allowed_tools) if job.allowed_tools else None,
            max_turns=job.max_turns,
            model=job.model,
            entities=entities,
        )

        return result.session_id

    async def _get_issues(self, job: ScheduledJob) -> list:
        """Get issues matching the filter query."""
        # Parse filter_query like "state:open label:needs-triage"
        filters = parse_filter_query(job.filter_query)

        # Fetch from GitHub API
        issues = await github_client.list_issues(
            repo_id=job.repo_id,
            state=filters.get("state", "open"),
            labels=filters.get("labels"),
        )

        # Filter out issues that already have recent sessions
        # (avoid re-analyzing the same issue multiple times)
        return await self._filter_already_processed(issues, job)

    def _calculate_next_run(self, job: ScheduledJob) -> datetime:
        """Calculate the next run time based on cron expression."""
        tz = pytz.timezone(job.timezone)
        now = datetime.now(tz)
        cron = croniter(job.cron_expression, now)
        next_run = cron.get_next(datetime)
        return next_run.astimezone(pytz.UTC).replace(tzinfo=None)


# Global scheduler instance
scheduler = SchedulerService()
```

#### 3. New Router: `routers/schedules.py`

```python
router = APIRouter()

class ScheduledJobCreate(BaseModel):
    name: str
    description: str | None = None
    cron_expression: str
    timezone: str = "UTC"
    target_type: str  # "issues", "prs", "codebase"
    filter_query: str | None = None
    command_id: str
    max_items: int = 10
    permission_mode: str | None = None
    allowed_tools: list[str] | None = None
    max_turns: int | None = None
    model: str | None = None

class ScheduledJobResponse(BaseModel):
    id: int
    name: str
    status: str
    cron_expression: str
    timezone: str
    target_type: str
    filter_query: str | None
    command_id: str
    next_run_at: str | None
    last_run_at: str | None
    last_run_status: str | None
    run_count: int

@router.get("/repos/{repo_id}/schedules")
async def list_scheduled_jobs(repo_id: int) -> list[ScheduledJobResponse]:
    """List all scheduled jobs for a repository."""
    ...

@router.post("/repos/{repo_id}/schedules")
async def create_scheduled_job(repo_id: int, data: ScheduledJobCreate) -> ScheduledJobResponse:
    """Create a new scheduled job."""
    # Validate cron expression
    try:
        croniter(data.cron_expression)
    except Exception:
        raise HTTPException(400, "Invalid cron expression")

    # Create job and calculate first run time
    ...

@router.get("/repos/{repo_id}/schedules/{job_id}")
async def get_scheduled_job(repo_id: int, job_id: int) -> ScheduledJobResponse:
    """Get details of a scheduled job."""
    ...

@router.patch("/repos/{repo_id}/schedules/{job_id}")
async def update_scheduled_job(repo_id: int, job_id: int, data: ScheduledJobUpdate):
    """Update a scheduled job."""
    ...

@router.delete("/repos/{repo_id}/schedules/{job_id}")
async def delete_scheduled_job(repo_id: int, job_id: int):
    """Delete a scheduled job."""
    ...

@router.post("/repos/{repo_id}/schedules/{job_id}/run")
async def trigger_job_now(repo_id: int, job_id: int):
    """Manually trigger a job to run immediately."""
    ...

@router.post("/repos/{repo_id}/schedules/{job_id}/pause")
async def pause_job(repo_id: int, job_id: int):
    """Pause a scheduled job."""
    ...

@router.post("/repos/{repo_id}/schedules/{job_id}/resume")
async def resume_job(repo_id: int, job_id: int):
    """Resume a paused job."""
    ...

@router.get("/repos/{repo_id}/schedules/{job_id}/runs")
async def list_job_runs(repo_id: int, job_id: int, limit: int = 20):
    """List execution history for a job."""
    ...
```

#### 4. Lifespan Integration

```python
# main.py
from app.services.scheduler import scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await scheduler.start()
    yield
    # Shutdown
    await scheduler.stop()

app = FastAPI(lifespan=lifespan)
```

### Frontend

#### 1. New Component: `ScheduleList.tsx`

```typescript
interface ScheduleListProps {
  repoId: number;
}

export function ScheduleList({ repoId }: ScheduleListProps) {
  const { schedules, loading, createSchedule, deleteSchedule, triggerNow } = useSchedules(repoId);
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium">Scheduled Jobs</h2>
        <button
          onClick={() => setIsCreating(true)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          New Schedule
        </button>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : schedules.length === 0 ? (
        <EmptyState
          title="No scheduled jobs"
          description="Create a schedule to automatically run analyses on issues or PRs"
        />
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onTrigger={() => triggerNow(schedule.id)}
              onDelete={() => deleteSchedule(schedule.id)}
              onEdit={() => setEditingId(schedule.id)}
            />
          ))}
        </div>
      )}

      {isCreating && (
        <ScheduleCreateModal
          repoId={repoId}
          onClose={() => setIsCreating(false)}
          onCreate={createSchedule}
        />
      )}
    </div>
  );
}
```

#### 2. Schedule Card Component

```typescript
function ScheduleCard({ schedule, onTrigger, onDelete, onEdit }: ScheduleCardProps) {
  const nextRun = schedule.next_run_at
    ? formatRelativeTime(new Date(schedule.next_run_at))
    : 'Not scheduled';

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            {schedule.name}
            <StatusBadge status={schedule.status} />
          </h3>
          <p className="text-sm text-gray-400 mt-1">{schedule.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onTrigger} title="Run now">
            <PlayIcon className="w-4 h-4" />
          </button>
          <button onClick={onEdit} title="Edit">
            <EditIcon className="w-4 h-4" />
          </button>
          <button onClick={onDelete} title="Delete">
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm text-gray-400">
        <span title="Cron expression">
          <ClockIcon className="w-4 h-4 inline mr-1" />
          {describeCron(schedule.cron_expression)}
        </span>
        <span>
          <TargetIcon className="w-4 h-4 inline mr-1" />
          {schedule.target_type}
        </span>
        <span>
          Next: {nextRun}
        </span>
      </div>

      {schedule.last_run_at && (
        <div className="mt-2 text-xs text-gray-500">
          Last run: {formatRelativeTime(new Date(schedule.last_run_at))}
          {' '}
          <span className={schedule.last_run_status === 'completed' ? 'text-green-400' : 'text-red-400'}>
            ({schedule.last_run_status})
          </span>
        </div>
      )}
    </div>
  );
}
```

#### 3. Schedule Create Modal

```typescript
function ScheduleCreateModal({ repoId, onClose, onCreate }: Props) {
  const { commands } = useCommands();
  const [form, setForm] = useState({
    name: '',
    description: '',
    cron_expression: '0 9 * * 1-5', // Default: 9am weekdays
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    target_type: 'issues',
    filter_query: 'state:open label:needs-triage',
    command_id: '',
    max_items: 10,
  });

  // Cron presets for easy selection
  const cronPresets = [
    { label: 'Every morning at 9am (weekdays)', value: '0 9 * * 1-5' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every day at midnight', value: '0 0 * * *' },
    { label: 'Every Monday at 9am', value: '0 9 * * 1' },
  ];

  return (
    <Modal title="Create Scheduled Job" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Input label="Name" value={form.name} onChange={...} />
        <Textarea label="Description" value={form.description} onChange={...} />

        <Select label="Schedule" value={form.cron_expression}>
          {cronPresets.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>

        <Select label="Target" value={form.target_type}>
          <option value="issues">Issues</option>
          <option value="prs">Pull Requests</option>
          <option value="codebase">Codebase</option>
        </Select>

        <Input
          label="Filter"
          value={form.filter_query}
          placeholder="state:open label:needs-triage"
        />

        <Select label="Command" value={form.command_id}>
          {commands[form.target_type.replace('s', '')]?.map(cmd => (
            <option key={cmd.id} value={cmd.id}>{cmd.name}</option>
          ))}
        </Select>

        <Input
          label="Max items per run"
          type="number"
          value={form.max_items}
          min={1}
          max={50}
        />

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="bg-blue-600">Create</button>
        </div>
      </form>
    </Modal>
  );
}
```

### UI Integration

Add "Schedules" to the Settings modal or as a new tab:

```typescript
// Option 1: In Settings modal, add a new section
<SettingsSection title="Scheduled Jobs">
  <ScheduleList repoId={selectedRepo.id} />
</SettingsSection>

// Option 2: As a sub-tab under Sessions
<Tab label="Schedules">
  <ScheduleList repoId={selectedRepo.id} />
</Tab>
```

## Filter Query Syntax

Support GitHub-like filter syntax:

```
state:open                    # Issue state
label:bug                     # Single label
label:bug,enhancement         # Multiple labels (OR)
-label:wontfix                # Exclude label
author:username               # By author
assignee:none                 # Unassigned
created:>2024-01-01           # Date filters
updated:<7d                   # Relative dates
```

## Implementation Order

1. **Phase 1**: Database models + basic CRUD API
2. **Phase 2**: Scheduler service with cron parsing
3. **Phase 3**: Integration with headless analyzer
4. **Phase 4**: Frontend list/create UI
5. **Phase 5**: Run history and monitoring
6. **Phase 6**: Filter query parsing

## Files to Create/Modify

**New Files:**
- `backend/app/services/scheduler.py`
- `backend/app/routers/schedules.py`
- `frontend/src/components/ScheduleList.tsx`
- `frontend/src/components/ScheduleCard.tsx`
- `frontend/src/components/ScheduleCreateModal.tsx`
- `frontend/src/hooks/useSchedules.ts`

**Modify:**
- `backend/app/models.py` - Add ScheduledJob, ScheduledJobRun
- `backend/app/main.py` - Add schedules router, scheduler lifespan
- `frontend/src/components/Settings.tsx` - Add schedules section

**Dependencies:**
- `croniter` - Cron expression parsing
- `pytz` - Timezone handling

## Future Enhancements

- Webhook triggers (run on GitHub events like issue opened)
- Conditional execution (only if condition met)
- Job dependencies (run B after A completes)
- Slack/email notifications on completion/failure
- Rate limiting to avoid API limits
- Job templates for common patterns
