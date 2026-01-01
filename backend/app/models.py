"""
SQLAlchemy models for per-repo databases.

Note: Repo information is stored in ~/.clump/repos.json, not in the database.
These models are for the per-repo data stored in ~/.clump/projects/{hash}/data.db.
"""

from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, Index, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    """Return current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)


class SessionKind(str, Enum):
    ISSUE = "issue"
    PR = "pr"
    CODEBASE = "codebase"
    CUSTOM = "custom"


class SessionStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class CLITypeEnum(str, Enum):
    """CLI tool type for sessions."""
    CLAUDE = "claude"
    GEMINI = "gemini"
    CODEX = "codex"


class ActionType(str, Enum):
    COMMENT = "comment"
    LABEL = "label"
    CLOSE = "close"
    BRANCH = "branch"
    PR = "pr"


class Session(Base):
    """An AI coding CLI session (Claude Code, Gemini, Codex)."""
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    repo_id: Mapped[int] = mapped_column(Integer, index=True)  # References repos.json entry
    kind: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(500))
    prompt: Mapped[str] = mapped_column(Text)
    transcript: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default=SessionStatus.RUNNING.value, index=True)
    process_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    claude_session_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    cli_type: Mapped[str] = mapped_column(
        String(20), default=CLITypeEnum.CLAUDE.value, index=True
    )  # Which CLI tool created this session
    scheduled_job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # ID of schedule that created this
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)  # Total cost from headless sessions
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Duration from headless sessions
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    actions: Mapped[list["Action"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    entities: Mapped[list["SessionEntity"]] = relationship(back_populates="session", cascade="all, delete-orphan")

    # Composite indexes for common query patterns
    __table_args__ = (
        Index('idx_session_repo_status', 'repo_id', 'status'),
        Index('idx_session_repo_created', 'repo_id', 'created_at'),
    )


class Action(Base):
    """An action taken during a session (comment, label, etc)."""
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(50))
    payload: Mapped[str] = mapped_column(Text)  # JSON
    status: Mapped[str] = mapped_column(String(50), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    session: Mapped["Session"] = relationship(back_populates="actions")


class Tag(Base):
    """A custom tag for organizing issues within a repo."""
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    repo_id: Mapped[int] = mapped_column(Integer)  # References repos.json entry
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color e.g. #ff0000
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    issue_tags: Mapped[list["IssueTag"]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class IssueTag(Base):
    """Junction table linking tags to issues."""
    __tablename__ = "issue_tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), index=True)
    repo_id: Mapped[int] = mapped_column(Integer, index=True)  # References repos.json entry
    issue_number: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    tag: Mapped["Tag"] = relationship(back_populates="issue_tags")

    # Composite index for common query pattern: get tags for a specific issue in a repo
    __table_args__ = (
        Index('idx_issue_tag_repo_issue', 'repo_id', 'issue_number'),
    )


class SessionEntity(Base):
    """Junction table linking sessions to issues/PRs (many-to-many)."""
    __tablename__ = "session_entities"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(Integer)  # References repos.json entry
    entity_kind: Mapped[str] = mapped_column(String(50))  # "issue" or "pr"
    entity_number: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    session: Mapped["Session"] = relationship(back_populates="entities")


class ScheduledJobStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"


class ScheduledJobTargetType(str, Enum):
    ISSUES = "issues"
    PRS = "prs"
    CODEBASE = "codebase"
    CUSTOM = "custom"


class JobRunStatus(str, Enum):
    """Status of a scheduled job run."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ScheduledJob(Base):
    """A scheduled job configuration for automated sessions."""
    __tablename__ = "scheduled_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    repo_id: Mapped[int] = mapped_column(Integer, index=True)  # References repos.json entry

    # Job configuration
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default=ScheduledJobStatus.ACTIVE.value, index=True)

    # Schedule (cron format)
    cron_expression: Mapped[str] = mapped_column(String(100))  # e.g., "0 9 * * 1-5"
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")

    # Target configuration
    target_type: Mapped[str] = mapped_column(String(50))  # "issues", "prs", "codebase", "custom"
    filter_query: Mapped[str | None] = mapped_column(Text, nullable=True)  # e.g., "state:open label:needs-triage"
    command_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g., "issue/root-cause"
    custom_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)  # For custom target_type
    max_items: Mapped[int] = mapped_column(Integer, default=10)  # Max items per run
    only_new: Mapped[bool] = mapped_column(Integer, default=False)  # Only process items not seen before

    # Claude configuration
    permission_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    allowed_tools: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    max_turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Execution tracking
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    last_run_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationship to runs
    runs: Mapped[list["ScheduledJobRun"]] = relationship(back_populates="job", cascade="all, delete-orphan")

    # Composite index for finding active jobs for a repo
    __table_args__ = (
        Index('idx_scheduled_job_repo_status', 'repo_id', 'status'),
    )


class ScheduledJobRun(Base):
    """A single execution of a scheduled job."""
    __tablename__ = "scheduled_job_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("scheduled_jobs.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(Integer)  # References repos.json entry

    # Run status
    status: Mapped[str] = mapped_column(String(50))  # pending, running, completed, failed
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
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
