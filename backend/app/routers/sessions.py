"""
Session routes using transcript-first architecture.

Sessions are discovered from Claude's JSONL files in ~/.claude/projects/
with optional sidecar metadata stored in ~/.clump/projects/
"""

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
)
from app.storage import (
    discover_sessions,
    get_session_metadata,
    save_session_metadata,
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


def _get_repo_name(encoded_path: str) -> Optional[str]:
    """Try to get repo name (owner/name) from encoded path."""
    repo = match_encoded_path_to_repo(encoded_path)
    if repo:
        return f"{repo['owner']}/{repo['name']}"
    return None


def _quick_scan_transcript(transcript_path) -> dict:
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

    except Exception:
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
        entities = [
            EntityLinkResponse(kind=e.kind, number=e.number)
            for e in session.metadata.entities
        ]
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
            ToolUseResponse(id=t.id, name=t.name, input=t.input)
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
            entities=[
                EntityLinkResponse(kind=e.kind, number=e.number)
                for e in metadata.entities
            ],
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

    # Convert to summaries
    summaries = [_session_to_summary(s, active_session_ids) for s in sessions]

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
    """
    # Find the session by scanning all projects
    sessions = discover_sessions()
    session = None
    for s in sessions:
        if s.session_id == session_id:
            session = s
            break

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Parse the full transcript
    repo_path = decode_path(session.encoded_path)
    parsed = parse_transcript(session_id, repo_path)

    if not parsed:
        raise HTTPException(status_code=500, detail="Failed to parse transcript")

    # Check if active
    active_processes = await process_manager.list_processes()
    is_active = any(
        proc.claude_session_id == session_id
        for proc in active_processes
    )

    return _parsed_to_detail(
        session_id=session_id,
        encoded_path=session.encoded_path,
        parsed=parsed,
        metadata=session.metadata,
        is_active=is_active,
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
    session = None
    for s in sessions:
        if s.session_id == session_id:
            session = s
            break

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
        entities=[
            EntityLinkResponse(kind=e.kind, number=e.number)
            for e in metadata.entities
        ],
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
    session = None
    for s in sessions:
        if s.session_id == session_id:
            session = s
            break

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
    session = None
    for s in sessions:
        if s.session_id == session_id:
            session = s
            break

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
    session = None
    for s in sessions:
        if s.session_id == session_id:
            session = s
            break

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    repo_path = decode_path(session.encoded_path)

    # Create new PTY process that resumes the Claude conversation
    process = await process_manager.create_process(
        working_dir=repo_path,
        initial_prompt=None,  # No new prompt, just resuming
        session_id=None,  # No DB session ID in new model
        resume_session=session_id,
    )

    return {
        "id": process.id,
        "working_dir": process.working_dir,
        "created_at": process.created_at.isoformat(),
        "claude_session_id": process.claude_session_id,
    }
