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


class Repo(Base):
    __tablename__ = "repos"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    local_path: Mapped[str] = mapped_column(String(1024))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sessions: Mapped[list["Session"]] = relationship(back_populates="repo")
    tags: Mapped[list["Tag"]] = relationship(back_populates="repo", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id"))
    kind: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(500))
    prompt: Mapped[str] = mapped_column(Text)
    transcript: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default=SessionStatus.RUNNING.value)
    process_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Internal PTY process ID
    claude_session_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Claude Code CLI session ID for resume
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    repo: Mapped["Repo"] = relationship(back_populates="sessions")
    actions: Mapped[list["Action"]] = relationship(back_populates="session")
    entities: Mapped[list["SessionEntity"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class Action(Base):
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    type: Mapped[str] = mapped_column(String(50))
    payload: Mapped[str] = mapped_column(Text)  # JSON
    status: Mapped[str] = mapped_column(String(50), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="actions")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id"))
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color e.g. #ff0000
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    repo: Mapped["Repo"] = relationship(back_populates="tags")
    issue_tags: Mapped[list["IssueTag"]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class IssueTag(Base):
    __tablename__ = "issue_tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id"))
    issue_number: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    tag: Mapped["Tag"] = relationship(back_populates="issue_tags")


class SessionEntity(Base):
    """Junction table linking sessions to issues/PRs (many-to-many)."""
    __tablename__ = "session_entities"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id"))
    entity_kind: Mapped[str] = mapped_column(String(50))  # "issue" or "pr"
    entity_number: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="entities")
