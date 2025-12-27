"""
SQLAlchemy models for per-repo databases.

Note: Repo information is stored in ~/.clump/repos.json, not in the database.
These models are for the per-repo data stored in ~/.clump/projects/{hash}/data.db.
"""

from datetime import datetime
from enum import Enum
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SessionKind(str, Enum):
    ISSUE = "issue"
    PR = "pr"
    CODEBASE = "codebase"
    CUSTOM = "custom"


class SessionStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ActionType(str, Enum):
    COMMENT = "comment"
    LABEL = "label"
    CLOSE = "close"
    BRANCH = "branch"
    PR = "pr"


class Session(Base):
    """A Claude Code session (formerly Analysis)."""
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    repo_id: Mapped[int] = mapped_column(Integer)  # References repos.json entry
    kind: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(500))
    prompt: Mapped[str] = mapped_column(Text)
    transcript: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default=SessionStatus.RUNNING.value)
    process_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    claude_session_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    actions: Mapped[list["Action"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    entities: Mapped[list["SessionEntity"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class Action(Base):
    """An action taken during a session (comment, label, etc)."""
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(50))
    payload: Mapped[str] = mapped_column(Text)  # JSON
    status: Mapped[str] = mapped_column(String(50), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="actions")


class Tag(Base):
    """A custom tag for organizing issues within a repo."""
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    repo_id: Mapped[int] = mapped_column(Integer)  # References repos.json entry
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color e.g. #ff0000
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    issue_tags: Mapped[list["IssueTag"]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class IssueTag(Base):
    """Junction table linking tags to issues."""
    __tablename__ = "issue_tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(Integer)  # References repos.json entry
    issue_number: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    tag: Mapped["Tag"] = relationship(back_populates="issue_tags")


class SessionEntity(Base):
    """Junction table linking sessions to issues/PRs (many-to-many)."""
    __tablename__ = "session_entities"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(Integer)  # References repos.json entry
    entity_kind: Mapped[str] = mapped_column(String(50))  # "issue" or "pr"
    entity_number: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="entities")
