"""
Session routes using transcript-first architecture.

Sessions are discovered from Claude's JSONL files in ~/.claude/projects/
with optional sidecar metadata stored in ~/.clump/projects/
"""

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, TypedDict

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.database import get_repo_db
from app.models import Session, SessionStatus
from app.schemas import (
    SessionSummaryResponse,
    SessionDetailResponse,
    SessionListResponse,
    SessionMetadataResponse,
    SessionMetadataUpdate,
    ContinueSessionRequest,
    EntityLinkResponse,
    AddEntityRequest,
    TranscriptMessageResponse,
    ToolUseResponse,
    TokenUsageResponse,
    SubsessionDetailResponse,
    RepoSessionCount,
    SessionCountsResponse,
)
from app.storage import (
    discover_sessions,
    get_session_metadata,
    save_session_metadata,
    delete_session_metadata,
    encode_path,
    decode_path,
    match_encoded_path_to_repo,
    load_repos,
    SessionMetadata,
    EntityLink,
    DiscoveredSession,
    get_claude_projects_dir,
)
from app.services.transcript_parser import parse_transcript, ParsedTranscript, TranscriptMessage
from app.services.session_manager import process_manager
from app.services.event_manager import event_manager, EventType

# Session discovery cache with TTL
# This avoids redundant filesystem scans when polling frequently
_session_cache: dict[str, tuple[list, float]] = {}  # key -> (sessions, timestamp)
SESSION_CACHE_TTL = 5.0  # seconds (increased from 2s to reduce filesystem I/O)


class QuickScanResult(TypedDict):
    """Result of a quick transcript scan for summary info."""

    title: Optional[str]
    model: Optional[str]
    start_time: Optional[str]
    end_time: Optional[str]
    message_count: int


router = APIRouter()


def _get_cached_sessions(repo_path: Optional[str] = None) -> list[DiscoveredSession]:
    """
    Get sessions with caching to avoid redundant filesystem scans.

    Uses a simple TTL cache keyed by repo_path.
    """
    global _session_cache

    cache_key = repo_path or "__all__"
    now = time.time()

    # Check if we have a valid cache entry
    if cache_key in _session_cache:
        cached_sessions, cached_time = _session_cache[cache_key]
        if now - cached_time < SESSION_CACHE_TTL:
            return cached_sessions

    # Cache miss or expired - fetch fresh data
    sessions = discover_sessions(repo_path=repo_path)

    # Update cache
    _session_cache[cache_key] = (sessions, now)

    # Clean up old cache entries (keep cache size bounded)
    if len(_session_cache) > 100:
        cutoff = now - SESSION_CACHE_TTL * 10  # Remove entries older than 10x TTL
        _session_cache = {
            k: v for k, v in _session_cache.items()
            if v[1] > cutoff
        }

    return sessions


def invalidate_session_cache(repo_path: Optional[str] = None) -> None:
    """
    Invalidate session cache.

    Call this when sessions are created, deleted, or modified.
    """
    global _session_cache
    if repo_path:
        cache_key = repo_path
        _session_cache.pop(cache_key, None)
        _session_cache.pop("__all__", None)  # Also invalidate global cache
    else:
        _session_cache.clear()


def _get_running_headless_session_ids() -> set[str]:
    """
    Get session IDs of headless sessions that are currently running.

    Uses the headless analyzer's in-memory tracking for reliable real-time status.
    """
    from app.services.headless_analyzer import headless_analyzer
    return set(headless_analyzer.list_running())


def _message_to_response(msg: TranscriptMessage) -> TranscriptMessageResponse:
    """Convert a TranscriptMessage to a TranscriptMessageResponse."""
    tool_uses = [
        ToolUseResponse(
            id=t.id,
            name=t.name,
            input=t.input,
            spawned_agent_id=t.spawned_agent_id,
        )
        for t in msg.tool_uses
    ]
    usage = None
    if msg.usage:
        usage = TokenUsageResponse(
            input_tokens=msg.usage.input_tokens,
            output_tokens=msg.usage.output_tokens,
            cache_read_tokens=msg.usage.cache_read_tokens,
            cache_creation_tokens=msg.usage.cache_creation_tokens,
        )
    return TranscriptMessageResponse(
        uuid=msg.uuid,
        role=msg.role,
        content=msg.content,
        timestamp=msg.timestamp,
        thinking=msg.thinking,
        tool_uses=tool_uses,
        model=msg.model,
        usage=usage,
    )


def _entities_to_response(entities: list[EntityLink]) -> list[EntityLinkResponse]:
    """Convert a list of EntityLink to EntityLinkResponse objects."""
    return [EntityLinkResponse(kind=e.kind, number=e.number) for e in entities]


def _build_metadata_response(
    session_id: str, metadata: Optional[SessionMetadata]
) -> SessionMetadataResponse:
    """Build a SessionMetadataResponse from SessionMetadata, handling None case."""
    if metadata:
        return SessionMetadataResponse(
            session_id=session_id,
            title=metadata.title,
            summary=metadata.summary,
            repo_path=metadata.repo_path,
            entities=_entities_to_response(metadata.entities),
            tags=metadata.tags,
            starred=metadata.starred,
            created_at=metadata.created_at,
            scheduled_job_id=metadata.scheduled_job_id,
        )
    return SessionMetadataResponse(session_id=session_id)


def _get_pending_sessions(
    active_session_ids: set[str],
    discovered_session_ids: set[str],
    repo_path: Optional[str] = None,
) -> list[SessionSummaryResponse]:
    """
    Get synthetic session summaries for active processes that don't have JSONL files yet.

    These are "pending" sessions - the process has started but Claude hasn't created
    the transcript file yet. We synthesize a minimal session summary from process info
    and sidecar metadata.
    """
    from app.services.session_manager import process_manager
    from datetime import datetime

    pending = []

    # Get all processes synchronously (we're called from async context but this is safe)
    for proc in process_manager.processes.values():
        session_id = proc.claude_session_id
        if not session_id:
            continue

        # Skip if already discovered (has JSONL file)
        if session_id in discovered_session_ids:
            continue

        # Skip if not active
        if session_id not in active_session_ids:
            continue

        # Filter by repo_path if specified
        if repo_path:
            encoded_filter = encode_path(repo_path)
            encoded_proc = encode_path(proc.working_dir)
            if encoded_filter != encoded_proc:
                continue

        # Try to get sidecar metadata (saved immediately on process creation)
        encoded_path = encode_path(proc.working_dir)
        metadata = get_session_metadata(encoded_path, session_id)

        # Build entities list from metadata
        entities = []
        title = None
        starred = False
        tags = []
        scheduled_job_id = None

        if metadata:
            entities = _entities_to_response(metadata.entities)
            title = metadata.title
            starred = metadata.starred
            tags = metadata.tags
            scheduled_job_id = metadata.scheduled_job_id

        # Get repo name if possible
        repo_name = _get_repo_name(encoded_path)

        pending.append(SessionSummaryResponse(
            session_id=session_id,
            encoded_path=encoded_path,
            repo_path=proc.working_dir,
            repo_name=repo_name,
            title=title or "Starting...",
            model=proc.model or None,
            start_time=proc.created_at.isoformat(),
            end_time=None,
            message_count=0,
            # Use local time to match discover_sessions (which uses file mtime in local time)
            modified_at=datetime.now().isoformat(),
            file_size=0,
            entities=entities,
            tags=tags,
            starred=starred,
            scheduled_job_id=scheduled_job_id,
            is_active=True,
        ))

    return pending


def _get_pending_headless_sessions(
    discovered_session_ids: set[str],
    repo_path: Optional[str] = None,
) -> list[SessionSummaryResponse]:
    """
    Get synthetic session summaries for running headless sessions that don't have JSONL files yet.

    Uses in-memory tracking from the headless analyzer for reliable real-time status,
    and sidecar metadata for session info.
    """
    from app.services.headless_analyzer import headless_analyzer

    pending = []
    running_ids = set(headless_analyzer.list_running())

    # Only process sessions that are running but not yet discovered
    pending_ids = running_ids - discovered_session_ids
    if not pending_ids:
        return pending

    repos = load_repos()

    # Filter to specific repo if provided
    if repo_path:
        repos = [r for r in repos if r["local_path"] == repo_path]

    for repo in repos:
        encoded_path = encode_path(repo["local_path"])
        repo_name = f"{repo['owner']}/{repo['name']}" if repo.get('owner') and repo.get('name') else None

        for session_id in pending_ids:
            # Try to get sidecar metadata if it exists
            metadata = get_session_metadata(encoded_path, session_id)

            # Only include if metadata exists for this repo (means session belongs to this repo)
            if metadata:
                entities = _entities_to_response(metadata.entities)

                pending.append(SessionSummaryResponse(
                    session_id=session_id,
                    encoded_path=encoded_path,
                    repo_path=repo["local_path"],
                    repo_name=repo_name,
                    title=metadata.title or "Running...",
                    model=None,
                    start_time=metadata.created_at,
                    end_time=None,
                    message_count=0,
                    # Use local time to match discover_sessions (which uses file mtime in local time)
                    modified_at=datetime.now().isoformat(),
                    file_size=0,
                    entities=entities,
                    tags=metadata.tags,
                    starred=metadata.starred,
                    scheduled_job_id=metadata.scheduled_job_id,
                    is_active=True,
                ))

    return pending


def _get_repo_name(encoded_path: str) -> Optional[str]:
    """Try to get repo name (owner/name) from encoded path."""
    repo = match_encoded_path_to_repo(encoded_path)
    if repo:
        return f"{repo['owner']}/{repo['name']}"
    return None


def _find_session_by_id(
    sessions: list[DiscoveredSession], session_id: str
) -> Optional[DiscoveredSession]:
    """Find a session by its ID from a list of discovered sessions."""
    return next((s for s in sessions if s.session_id == session_id), None)


def _quick_scan_transcript(transcript_path: Path) -> QuickScanResult:
    """
    Quickly scan a transcript file for summary info without full parsing.
    """
    result: QuickScanResult = {
        "title": None,
        "model": None,
        "start_time": None,
        "end_time": None,
        "message_count": 0,
    }

    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            first_user_message = None
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                entry_type = entry.get('type')
                timestamp = entry.get('timestamp')

                if entry_type == 'summary':
                    result["title"] = entry.get('summary')

                if entry_type in ('user', 'assistant'):
                    result["message_count"] += 1

                    if timestamp:
                        if not result["start_time"]:
                            result["start_time"] = timestamp
                        result["end_time"] = timestamp

                    # Capture first user message for title fallback
                    if entry_type == 'user' and not first_user_message:
                        msg = entry.get('message', {})
                        content = msg.get('content', '')
                        if isinstance(content, str):
                            first_user_message = content[:100]
                        elif isinstance(content, list):
                            for part in content:
                                if isinstance(part, dict) and part.get('type') == 'text':
                                    first_user_message = part.get('text', '')[:100]
                                    break

                    # Capture model
                    if entry_type == 'assistant' and not result["model"]:
                        msg = entry.get('message', {})
                        result["model"] = msg.get('model')

            # Use first user message as title if no summary
            if not result["title"] and first_user_message:
                result["title"] = first_user_message

    except OSError:
        # File access issues (permissions, file doesn't exist, etc.)
        # Return defaults - the session will show with minimal info
        pass

    return result


def _session_to_summary(
    session: DiscoveredSession,
    active_session_ids: set[str]
) -> SessionSummaryResponse:
    """Convert a DiscoveredSession to SessionSummaryResponse."""
    repo_path = decode_path(session.encoded_path)
    repo_name = _get_repo_name(session.encoded_path)

    # Quick scan for transcript info
    scan = _quick_scan_transcript(session.transcript_path)

    # Check if this session is currently active
    is_active = session.session_id in active_session_ids

    # Get metadata info
    entities = []
    tags = []
    starred = False
    scheduled_job_id = None
    if session.metadata:
        entities = _entities_to_response(session.metadata.entities)
        tags = session.metadata.tags
        starred = session.metadata.starred
        scheduled_job_id = session.metadata.scheduled_job_id
        # Use metadata title if available
        if session.metadata.title:
            scan["title"] = session.metadata.title

    return SessionSummaryResponse(
        session_id=session.session_id,
        encoded_path=session.encoded_path,
        repo_path=repo_path,
        repo_name=repo_name,
        title=scan["title"],
        model=scan["model"],
        start_time=scan["start_time"],
        end_time=scan["end_time"],
        message_count=scan["message_count"],
        modified_at=session.modified_at.isoformat(),
        file_size=session.file_size,
        entities=entities,
        tags=tags,
        starred=starred,
        scheduled_job_id=scheduled_job_id,
        is_active=is_active,
    )


def _parsed_to_detail(
    session_id: str,
    encoded_path: str,
    parsed: ParsedTranscript,
    metadata: Optional[SessionMetadata],
    is_active: bool,
) -> SessionDetailResponse:
    """Convert ParsedTranscript to SessionDetailResponse."""
    repo_path = decode_path(encoded_path)
    repo_name = _get_repo_name(encoded_path)

    # Convert messages
    messages = [_message_to_response(msg) for msg in parsed.messages]

    return SessionDetailResponse(
        session_id=session_id,
        encoded_path=encoded_path,
        repo_path=repo_path,
        repo_name=repo_name,
        messages=messages,
        summary=parsed.summary,
        model=parsed.model,
        total_input_tokens=parsed.total_input_tokens,
        total_output_tokens=parsed.total_output_tokens,
        total_cache_read_tokens=parsed.total_cache_read_tokens,
        total_cache_creation_tokens=parsed.total_cache_creation_tokens,
        start_time=parsed.start_time,
        end_time=parsed.end_time,
        claude_code_version=parsed.claude_code_version,
        git_branch=parsed.git_branch,
        metadata=_build_metadata_response(session_id, metadata),
        is_active=is_active,
    )


# ==========================================
# List Sessions
# ==========================================

@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    repo_path: Optional[str] = None,
    starred: Optional[bool] = None,
    has_entities: Optional[bool] = None,
    search: Optional[str] = None,
    sort: Optional[str] = Query(default="updated", regex="^(created|updated|messages)$"),
    order: Optional[str] = Query(default="desc", regex="^(asc|desc)$"),
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    """
    List all discovered sessions.

    Sessions are discovered from Claude's ~/.claude/projects/ directory.
    Also includes "pending" sessions from active processes that don't have
    transcript files yet (Claude is still starting up).

    Optional filtering by repo path, starred status, or search term.

    Uses caching to avoid redundant filesystem scans when polling frequently.
    """
    sessions = _get_cached_sessions(repo_path=repo_path)

    # Get active session IDs from running processes
    active_processes = await process_manager.list_processes()
    active_session_ids = {
        proc.claude_session_id
        for proc in active_processes
        if proc.claude_session_id
    }

    # Also include headless sessions that are currently running (e.g., scheduled jobs)
    running_headless_ids = _get_running_headless_session_ids()
    active_session_ids.update(running_headless_ids)

    # Track which sessions we've discovered (have JSONL files)
    discovered_session_ids = {s.session_id for s in sessions}

    # Convert to summaries
    summaries = [_session_to_summary(s, active_session_ids) for s in sessions]

    # Add pending sessions (active processes without JSONL files yet)
    pending = _get_pending_sessions(active_session_ids, discovered_session_ids, repo_path)
    summaries.extend(pending)

    # Add pending headless sessions (running in database but no JSONL file yet)
    pending_headless = _get_pending_headless_sessions(discovered_session_ids, repo_path)
    summaries.extend(pending_headless)

    # Sort based on the requested field and order
    reverse = order == "desc"
    if sort == "created":
        summaries.sort(key=lambda s: s.start_time or "", reverse=reverse)
    elif sort == "messages":
        summaries.sort(key=lambda s: s.message_count or 0, reverse=reverse)
    else:  # default to "updated"
        summaries.sort(key=lambda s: s.modified_at or "", reverse=reverse)

    # Apply filters
    if starred is not None:
        summaries = [s for s in summaries if s.starred == starred]

    if has_entities is not None:
        if has_entities:
            summaries = [s for s in summaries if len(s.entities) > 0]
        else:
            summaries = [s for s in summaries if len(s.entities) == 0]

    if search:
        search_lower = search.lower()
        summaries = [
            s for s in summaries
            if (s.title and search_lower in s.title.lower()) or
               (s.repo_path and search_lower in s.repo_path.lower()) or
               (s.repo_name and search_lower in s.repo_name.lower())
        ]

    total = len(summaries)

    # Apply pagination
    summaries = summaries[offset:offset + limit]

    return SessionListResponse(sessions=summaries, total=total)


# ==========================================
# Session Counts Per Repo
# ==========================================

@router.get("/sessions/counts", response_model=SessionCountsResponse)
async def get_session_counts():
    """
    Get session counts for all repos.

    Returns total and active session counts per repo.
    Useful for showing badges in the repo selector.
    """
    repos = load_repos()

    # Get active session IDs from running processes
    active_processes = await process_manager.list_processes()
    active_session_ids = {
        proc.claude_session_id
        for proc in active_processes
        if proc.claude_session_id
    }

    # Also include headless sessions that are currently running (e.g., scheduled jobs)
    running_headless_ids = _get_running_headless_session_ids()
    active_session_ids.update(running_headless_ids)

    counts = []
    for repo in repos:
        # Discover sessions for this repo (use cached)
        sessions = _get_cached_sessions(repo_path=repo["local_path"])

        # Count active sessions
        active_count = sum(
            1 for s in sessions if s.session_id in active_session_ids
        )

        # Also count pending sessions (active processes without JSONL files yet)
        discovered_ids = {s.session_id for s in sessions}
        for proc in active_processes:
            if proc.claude_session_id and proc.claude_session_id not in discovered_ids:
                encoded_filter = encode_path(repo["local_path"])
                encoded_proc = encode_path(proc.working_dir)
                if encoded_filter == encoded_proc:
                    active_count += 1

        # Also count pending headless sessions (running in database but no JSONL file yet)
        pending_headless = _get_pending_headless_sessions(discovered_ids, repo["local_path"])
        active_count += len(pending_headless)

        counts.append(RepoSessionCount(
            repo_id=repo["id"],
            total=len(sessions) + len(pending_headless),
            active=active_count,
        ))

    return SessionCountsResponse(counts=counts)


# ==========================================
# Get Session Detail
# ==========================================

@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str):
    """
    Get full session detail with transcript.

    The session_id is the UUID from the JSONL filename.
    For pending sessions (no JSONL file yet), returns minimal data from process info.
    """
    # Find the session (use cached for performance)
    sessions = _get_cached_sessions()
    session = _find_session_by_id(sessions, session_id)

    # Check if this is an active process
    active_processes = await process_manager.list_processes()
    active_process = next(
        (proc for proc in active_processes if proc.claude_session_id == session_id),
        None
    )

    if not session:
        # No JSONL file - check if this is a pending session from an active process
        if not active_process:
            raise HTTPException(status_code=404, detail="Session not found")

        # This is a pending session - return minimal data from process
        encoded_path = encode_path(active_process.working_dir)
        metadata = get_session_metadata(encoded_path, session_id)

        repo_name = _get_repo_name(encoded_path)

        return SessionDetailResponse(
            session_id=session_id,
            encoded_path=encoded_path,
            repo_path=active_process.working_dir,
            repo_name=repo_name,
            messages=[],  # No messages yet
            summary=None,
            model=active_process.model or None,
            total_input_tokens=0,
            total_output_tokens=0,
            total_cache_read_tokens=0,
            total_cache_creation_tokens=0,
            start_time=active_process.created_at.isoformat(),
            end_time=None,
            claude_code_version=None,
            git_branch=None,
            metadata=_build_metadata_response(session_id, metadata),
            is_active=True,
        )

    # Parse the full transcript
    repo_path = decode_path(session.encoded_path)
    parsed = parse_transcript(session_id, repo_path)

    if not parsed:
        raise HTTPException(status_code=500, detail="Failed to parse transcript")

    is_active = active_process is not None

    return _parsed_to_detail(
        session_id=session_id,
        encoded_path=session.encoded_path,
        parsed=parsed,
        metadata=session.metadata,
        is_active=is_active,
    )


# ==========================================
# Get Subsession Detail
# ==========================================

@router.get("/sessions/{session_id}/subsession/{agent_id}", response_model=SubsessionDetailResponse)
async def get_subsession(session_id: str, agent_id: str):
    """
    Get subsession (spawned agent) transcript detail.

    The agent_id is the 7-char hex ID from the spawned agent.
    The session_id is the parent session UUID (used to locate the project directory).
    """
    # Find the parent session to get the encoded_path
    sessions = discover_sessions(include_subsessions=True)
    parent_session = _find_session_by_id(sessions, session_id)

    if not parent_session:
        raise HTTPException(status_code=404, detail="Parent session not found")

    # The subsession file is in the same directory as the parent
    subsession_id = f"agent-{agent_id}"
    repo_path = decode_path(parent_session.encoded_path)

    # Parse the subsession transcript
    parsed = parse_transcript(subsession_id, repo_path)

    if not parsed:
        raise HTTPException(status_code=404, detail="Subsession not found")

    # Convert messages
    messages = [_message_to_response(msg) for msg in parsed.messages]

    return SubsessionDetailResponse(
        agent_id=agent_id,
        parent_session_id=session_id,
        encoded_path=parent_session.encoded_path,
        repo_path=repo_path,
        messages=messages,
        summary=parsed.summary,
        model=parsed.model,
        total_input_tokens=parsed.total_input_tokens,
        total_output_tokens=parsed.total_output_tokens,
        total_cache_read_tokens=parsed.total_cache_read_tokens,
        total_cache_creation_tokens=parsed.total_cache_creation_tokens,
        start_time=parsed.start_time,
        end_time=parsed.end_time,
    )


# ==========================================
# Update Session Metadata
# ==========================================

@router.patch("/sessions/{session_id}", response_model=SessionMetadataResponse)
async def update_session_metadata(session_id: str, data: SessionMetadataUpdate):
    """
    Update session sidecar metadata.

    Creates the sidecar file if it doesn't exist.
    """
    # Find the session (use cached for performance)
    sessions = _get_cached_sessions()
    session = _find_session_by_id(sessions, session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load or create metadata
    metadata = session.metadata or SessionMetadata(
        session_id=session_id,
        repo_path=decode_path(session.encoded_path),
    )

    # Update fields
    if data.title is not None:
        metadata.title = data.title
    if data.summary is not None:
        metadata.summary = data.summary
    if data.tags is not None:
        metadata.tags = data.tags
    if data.starred is not None:
        metadata.starred = data.starred

    # Save
    save_session_metadata(session.encoded_path, session_id, metadata)

    # Emit session updated event
    await event_manager.emit(EventType.SESSION_UPDATED, {
        "session_id": session_id,
        "repo_path": decode_path(session.encoded_path),
        "changes": {
            "title": metadata.title,
            "starred": metadata.starred,
            "tags": metadata.tags,
        },
    })

    return _build_metadata_response(session_id, metadata)


# ==========================================
# Entity Management
# ==========================================

@router.post("/sessions/{session_id}/entities", response_model=EntityLinkResponse)
async def add_entity_to_session(session_id: str, data: AddEntityRequest):
    """Add an issue or PR link to a session."""
    # Find the session (use cached for performance)
    sessions = _get_cached_sessions()
    session = _find_session_by_id(sessions, session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load or create metadata
    metadata = session.metadata or SessionMetadata(
        session_id=session_id,
        repo_path=decode_path(session.encoded_path),
    )

    # Check if already linked
    for e in metadata.entities:
        if e.kind == data.kind and e.number == data.number:
            raise HTTPException(
                status_code=400,
                detail=f"{data.kind.capitalize()} #{data.number} is already linked"
            )

    # Add the link
    metadata.entities.append(EntityLink(kind=data.kind, number=data.number))

    # Save
    save_session_metadata(session.encoded_path, session_id, metadata)

    # Emit session updated event
    await event_manager.emit(EventType.SESSION_UPDATED, {
        "session_id": session_id,
        "repo_path": decode_path(session.encoded_path),
        "changes": {
            "entities": [{"kind": e.kind, "number": e.number} for e in metadata.entities],
        },
    })

    return EntityLinkResponse(kind=data.kind, number=data.number)


@router.delete("/sessions/{session_id}/entities/{entity_idx}")
async def remove_entity_from_session(session_id: str, entity_idx: int):
    """
    Remove an entity link from a session.

    entity_idx is the index in the entities array (0-based).
    """
    # Find the session (use cached for performance)
    sessions = _get_cached_sessions()
    session = _find_session_by_id(sessions, session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.metadata:
        raise HTTPException(status_code=404, detail="No metadata for session")

    if entity_idx < 0 or entity_idx >= len(session.metadata.entities):
        raise HTTPException(status_code=404, detail="Entity link not found")

    # Remove the entity
    session.metadata.entities.pop(entity_idx)

    # Save
    save_session_metadata(session.encoded_path, session_id, session.metadata)

    # Emit session updated event
    await event_manager.emit(EventType.SESSION_UPDATED, {
        "session_id": session_id,
        "repo_path": decode_path(session.encoded_path),
        "changes": {
            "entities": [{"kind": e.kind, "number": e.number} for e in session.metadata.entities],
        },
    })

    return {"status": "deleted"}


# ==========================================
# Continue Session
# ==========================================

@router.post("/sessions/{session_id}/continue")
async def continue_session(session_id: str, data: ContinueSessionRequest = None):
    """
    Continue an existing session by resuming its Claude conversation.

    Creates a new PTY process that resumes the Claude conversation.
    Optionally sends a new message to Claude after resuming.
    """
    # Find the session (use cached for performance)
    sessions = _get_cached_sessions()
    session = _find_session_by_id(sessions, session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Try to get repo path from matched repo first (more reliable)
    # Fall back to decoded path if no match
    matched_repo = match_encoded_path_to_repo(session.encoded_path)
    if matched_repo:
        repo_path = matched_repo["local_path"]
    else:
        repo_path = decode_path(session.encoded_path)

    # Get prompt from request if provided
    initial_prompt = data.prompt if data else None

    # Create new PTY process that resumes the Claude conversation
    try:
        process = await process_manager.create_process(
            working_dir=repo_path,
            initial_prompt=initial_prompt,
            session_id=None,  # No DB session ID in new model
            resume_session=session_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot continue session: {e}"
        )

    return {
        "id": process.id,
        "working_dir": process.working_dir,
        "created_at": process.created_at.isoformat(),
        "claude_session_id": process.claude_session_id,
    }


# ==========================================
# Delete Session
# ==========================================

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """
    Delete a session's transcript file and sidecar metadata.

    This permanently removes both:
    - The transcript file (~/.claude/projects/{path}/{session_id}.jsonl)
    - The sidecar metadata (~/.clump/projects/{path}/{session_id}.json)

    Cannot delete sessions that are currently running.
    """
    # Find the session (use cached for performance)
    sessions = _get_cached_sessions()
    session = _find_session_by_id(sessions, session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if session is currently active
    active_processes = await process_manager.list_processes()
    for proc in active_processes:
        if proc.claude_session_id == session_id:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete an active session. Stop the process first."
            )

    # Delete the transcript file
    transcript_deleted = False
    if session.transcript_path.exists():
        try:
            session.transcript_path.unlink()
            transcript_deleted = True
        except OSError as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete transcript file: {e}"
            )

    # Delete sidecar metadata
    metadata_deleted = delete_session_metadata(session.encoded_path, session_id)

    # Invalidate cache after deletion
    invalidate_session_cache()

    # Emit session deleted event
    await event_manager.emit(EventType.SESSION_DELETED, {
        "session_id": session_id,
        "repo_path": decode_path(session.encoded_path),
    })

    return {
        "status": "deleted",
        "transcript_deleted": transcript_deleted,
        "metadata_deleted": metadata_deleted,
    }
