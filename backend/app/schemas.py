"""
Pydantic schemas for the transcript-first API.

Sessions are discovered from Claude's JSONL files in ~/.claude/projects/
with optional sidecar metadata stored in ~/.clump/projects/
"""

from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel


# ==========================================
# Entity Links
# ==========================================

class EntityLinkResponse(BaseModel):
    """A link to a GitHub issue or PR."""
    kind: str  # "issue" or "pr"
    number: int


class AddEntityRequest(BaseModel):
    """Request to add an entity link."""
    kind: str  # "issue" or "pr"
    number: int


# ==========================================
# Session Metadata
# ==========================================

class SessionMetadataResponse(BaseModel):
    """Sidecar metadata for a session."""
    session_id: str
    title: Optional[str] = None
    summary: Optional[str] = None
    repo_path: Optional[str] = None
    entities: list[EntityLinkResponse] = []
    tags: list[str] = []
    starred: bool = False
    created_at: Optional[str] = None
    scheduled_job_id: Optional[int] = None  # ID of schedule that created this session


class SessionMetadataUpdate(BaseModel):
    """Request to update session metadata."""
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    starred: Optional[bool] = None


class ContinueSessionRequest(BaseModel):
    """Request to continue a session with an optional message."""
    prompt: Optional[str] = None  # Message to send to Claude after resuming


# ==========================================
# Session Summary (for list view)
# ==========================================

class SessionSummaryResponse(BaseModel):
    """Lightweight session info for list views."""
    session_id: str  # UUID from filename
    encoded_path: str  # Directory name (encoded working directory)
    repo_path: str  # Decoded working directory path
    repo_name: Optional[str] = None  # owner/name if matched to known repo

    # From transcript parsing (quick scan)
    title: Optional[str] = None  # From metadata or first user message
    model: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_seconds: Optional[int] = None  # Session duration in seconds
    message_count: int = 0

    # File info
    modified_at: str
    file_size: int

    # From sidecar metadata
    entities: list[EntityLinkResponse] = []
    tags: list[str] = []
    starred: bool = False
    scheduled_job_id: Optional[int] = None  # ID of schedule that created this session

    # Status (derived from file or active process)
    is_active: bool = False


class SessionListResponse(BaseModel):
    """Response for listing sessions."""
    sessions: list[SessionSummaryResponse]
    total: int


class RepoSessionCount(BaseModel):
    """Session count for a single repo."""
    repo_id: int
    total: int
    active: int


class SessionCountsResponse(BaseModel):
    """Response for session counts across all repos."""
    counts: list[RepoSessionCount]


# ==========================================
# Session Detail (full transcript)
# ==========================================

class ToolUseResponse(BaseModel):
    """A tool use in a message."""
    id: str
    name: str
    input: dict[str, Any]
    spawned_agent_id: Optional[str] = None  # Agent ID if this tool spawned a subsession


class TokenUsageResponse(BaseModel):
    """Token usage for a message."""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0


class TranscriptMessageResponse(BaseModel):
    """A single message in the conversation."""
    uuid: str
    role: str  # "user" or "assistant"
    content: str
    timestamp: str
    thinking: Optional[str] = None
    tool_uses: list[ToolUseResponse] = []
    model: Optional[str] = None
    usage: Optional[TokenUsageResponse] = None


class SessionDetailResponse(BaseModel):
    """Full session detail with transcript."""
    session_id: str
    encoded_path: str
    repo_path: str
    repo_name: Optional[str] = None

    # Transcript data
    messages: list[TranscriptMessageResponse]
    summary: Optional[str] = None
    model: Optional[str] = None

    # Token totals
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cache_read_tokens: int = 0
    total_cache_creation_tokens: int = 0

    # Timestamps
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_seconds: Optional[int] = None  # Session duration in seconds

    # Version info
    claude_code_version: Optional[str] = None
    git_branch: Optional[str] = None

    # Sidecar metadata
    metadata: SessionMetadataResponse

    # Status
    is_active: bool = False


# ==========================================
# Subsession Detail
# ==========================================

class SubsessionDetailResponse(BaseModel):
    """Full subsession (spawned agent) transcript detail."""
    agent_id: str  # The 7-char hex ID
    parent_session_id: str  # The parent session UUID
    encoded_path: str  # Directory name
    repo_path: str  # Decoded working directory

    # Transcript data
    messages: list[TranscriptMessageResponse]
    summary: Optional[str] = None
    model: Optional[str] = None

    # Token totals
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cache_read_tokens: int = 0
    total_cache_creation_tokens: int = 0

    # Timestamps
    start_time: Optional[str] = None
    end_time: Optional[str] = None
