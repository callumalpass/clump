"""
Session routes using transcript-first architecture.

Sessions are discovered from Claude's JSONL files in ~/.claude/projects/
with optional sidecar metadata stored in ~/.clump/projects/
"""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.schemas import (
    SessionSummaryResponse,
    SessionDetailResponse,
    SessionListResponse,
    SessionMetadataResponse,
    SessionMetadataUpdate,
    EntityLinkResponse,
    AddEntityRequest,
    TranscriptMessageResponse,
    ToolUseResponse,
    TokenUsageResponse,
    SubsessionDetailResponse,
)
from app.storage import (
    discover_sessions,
    get_session_metadata,
    save_session_metadata,
    encode_path,
    decode_path,
    match_encoded_path_to_repo,
    SessionMetadata,
    EntityLink,
    DiscoveredSession,
    get_claude_projects_dir,
)
from app.services.transcript_parser import parse_transcript, ParsedTranscript
from app.services.session_manager import process_manager

router = APIRouter()


def _entities_to_response(entities: list[EntityLink]) -> list[EntityLinkResponse]:
    """Convert a list of EntityLink to EntityLinkResponse objects."""
    return [EntityLinkResponse(kind=e.kind, number=e.number) for e in entities]


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

        if metadata:
            entities = _entities_to_response(metadata.entities)
            title = metadata.title
            starred = metadata.starred
            tags = metadata.tags

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
            modified_at=datetime.utcnow().isoformat(),
            file_size=0,
            entities=entities,
            tags=tags,
            starred=starred,
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


def _quick_scan_transcript(transcript_path: Path) -> dict:
    """
    Quickly scan a transcript file for summary info without full parsing.

    Returns dict with: title, model, start_time, end_time, message_count
    """
    import json

    result = {
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
    if session.metadata:
        entities = _entities_to_response(session.metadata.entities)
        tags = session.metadata.tags
        starred = session.metadata.starred
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
    messages = []
    for msg in parsed.messages:
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
        messages.append(TranscriptMessageResponse(
            uuid=msg.uuid,
            role=msg.role,
            content=msg.content,
            timestamp=msg.timestamp,
            thinking=msg.thinking,
            tool_uses=tool_uses,
            model=msg.model,
            usage=usage,
        ))

    # Build metadata response
    if metadata:
        meta_response = SessionMetadataResponse(
            session_id=session_id,
            title=metadata.title,
            summary=metadata.summary,
            repo_path=metadata.repo_path,
            entities=_entities_to_response(metadata.entities),
            tags=metadata.tags,
            starred=metadata.starred,
            created_at=metadata.created_at,
        )
    else:
        meta_response = SessionMetadataResponse(session_id=session_id)

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
        metadata=meta_response,
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
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    """
    List all discovered sessions.

    Sessions are discovered from Claude's ~/.claude/projects/ directory.
    Also includes "pending" sessions from active processes that don't have
    transcript files yet (Claude is still starting up).

    Optional filtering by repo path, starred status, or search term.
    """
    sessions = discover_sessions(repo_path=repo_path)

    # Get active session IDs from running processes
    active_processes = await process_manager.list_processes()
    active_session_ids = {
        proc.claude_session_id
        for proc in active_processes
        if proc.claude_session_id
    }

    # Track which sessions we've discovered (have JSONL files)
    discovered_session_ids = {s.session_id for s in sessions}

    # Convert to summaries
    summaries = [_session_to_summary(s, active_session_ids) for s in sessions]

    # Add pending sessions (active processes without JSONL files yet)
    pending = _get_pending_sessions(active_session_ids, discovered_session_ids, repo_path)
    summaries.extend(pending)

    # Re-sort by modified_at (pending sessions are at the top since they're newest)
    summaries.sort(key=lambda s: s.modified_at or "", reverse=True)

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
# Get Session Detail
# ==========================================

@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str):
    """
    Get full session detail with transcript.

    The session_id is the UUID from the JSONL filename.
    For pending sessions (no JSONL file yet), returns minimal data from process info.
    """
    # Find the session by scanning all projects
    sessions = discover_sessions()
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

        # Build minimal response for pending session
        meta_response = SessionMetadataResponse(session_id=session_id)
        if metadata:
            meta_response = SessionMetadataResponse(
                session_id=session_id,
                title=metadata.title,
                summary=metadata.summary,
                repo_path=metadata.repo_path,
                entities=_entities_to_response(metadata.entities),
                tags=metadata.tags,
                starred=metadata.starred,
                created_at=metadata.created_at,
            )

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
            metadata=meta_response,
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

    # Convert messages (same logic as main sessions)
    messages = []
    for msg in parsed.messages:
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
        messages.append(TranscriptMessageResponse(
            uuid=msg.uuid,
            role=msg.role,
            content=msg.content,
            timestamp=msg.timestamp,
            thinking=msg.thinking,
            tool_uses=tool_uses,
            model=msg.model,
            usage=usage,
        ))

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
    # Find the session
    sessions = discover_sessions()
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

    return SessionMetadataResponse(
        session_id=session_id,
        title=metadata.title,
        summary=metadata.summary,
        repo_path=metadata.repo_path,
        entities=_entities_to_response(metadata.entities),
        tags=metadata.tags,
        starred=metadata.starred,
        created_at=metadata.created_at,
    )


# ==========================================
# Entity Management
# ==========================================

@router.post("/sessions/{session_id}/entities", response_model=EntityLinkResponse)
async def add_entity_to_session(session_id: str, data: AddEntityRequest):
    """Add an issue or PR link to a session."""
    # Find the session
    sessions = discover_sessions()
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

    return EntityLinkResponse(kind=data.kind, number=data.number)


@router.delete("/sessions/{session_id}/entities/{entity_idx}")
async def remove_entity_from_session(session_id: str, entity_idx: int):
    """
    Remove an entity link from a session.

    entity_idx is the index in the entities array (0-based).
    """
    # Find the session
    sessions = discover_sessions()
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

    return {"status": "deleted"}


# ==========================================
# Continue Session
# ==========================================

@router.post("/sessions/{session_id}/continue")
async def continue_session(session_id: str):
    """
    Continue an existing session by resuming its Claude conversation.

    Creates a new PTY process that resumes the Claude conversation.
    """
    # Find the session
    sessions = discover_sessions()
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

    # Create new PTY process that resumes the Claude conversation
    try:
        process = await process_manager.create_process(
            working_dir=repo_path,
            initial_prompt=None,  # No new prompt, just resuming
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
