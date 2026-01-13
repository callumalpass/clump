"""
Parse AI coding CLI transcripts into structured conversation data.

Supports multiple CLI tools:
- Claude Code: ~/.claude/projects/<encoded-path>/<session-id>.jsonl (JSONL format)
- Gemini CLI: ~/.gemini/tmp/<project-hash>/chats/<session-id>.json (JSON format)
- Codex CLI: ~/.codex/sessions/<year>/<month>/<day>/<session-id>.jsonl (JSONL format)
- Copilot CLI: ~/.copilot/session-state/* (JSON/JSONL format, best-effort)

Each CLI has a different transcript format, but all are normalized to the same
ParsedTranscript structure for consistent handling in the application.
"""

import json
import logging
import re
from pathlib import Path
from dataclasses import dataclass, field

from app.storage import encode_path, get_claude_projects_dir

logger = logging.getLogger(__name__)


def _parse_tool_arguments(arguments) -> dict:
    """
    Parse tool arguments into a dict.

    Handles the case where arguments can be:
    - A dict (normal case)
    - A JSON-encoded string (Codex sometimes does this)
    - None (missing)
    - Other types (fallback to empty dict)
    """
    if arguments is None:
        return {}
    if isinstance(arguments, dict):
        return arguments
    if isinstance(arguments, str):
        try:
            parsed = json.loads(arguments)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
        # If it's a string but not valid JSON dict, return as single-value dict
        return {"input": arguments}
    return {}


def _extract_gemini_function_response(response: dict) -> tuple[str, bool]:
    """Extract output text and error flag from a Gemini functionResponse payload."""
    payload = response.get("response") if isinstance(response, dict) else None
    error = False
    output = ""
    if isinstance(payload, dict):
        if payload.get("error"):
            error = True
            output = str(payload.get("error"))
        elif "output" in payload:
            output = payload.get("output")
        elif "content" in payload:
            output = payload.get("content")
        else:
            output = payload
    elif payload is not None:
        output = payload
    else:
        output = response.get("output") if isinstance(response, dict) else response
    if isinstance(output, str):
        return output, error
    try:
        return json.dumps(output), error
    except TypeError:
        return str(output), error


def _extract_gemini_tool_result(content: object) -> tuple[str, bool]:
    """Best-effort extraction of tool output text from Gemini PartListUnion values."""
    if content is None:
        return "", False
    if isinstance(content, str):
        return content, False
    if isinstance(content, dict):
        if "functionResponse" in content:
            response = content.get("functionResponse") or {}
            if isinstance(response, dict):
                return _extract_gemini_function_response(response)
        if content.get("type") == "functionResponse":
            return _extract_gemini_function_response(content)
        for key in ("output", "content", "text"):
            value = content.get(key)
            if isinstance(value, str):
                return value, bool(content.get("error"))
        try:
            return json.dumps(content), bool(content.get("error"))
        except TypeError:
            return str(content), bool(content.get("error"))
    if isinstance(content, list):
        parts = []
        error = False
        for item in content:
            text, is_error = _extract_gemini_tool_result(item)
            if text:
                parts.append(text)
            error = error or is_error
        return "\n".join(parts), error
    return str(content), False


def _normalize_codex_tool_output(output: object) -> str:
    """Normalize Codex tool output payloads into a displayable string."""
    if output is None:
        return ""
    if isinstance(output, str):
        return output
    if isinstance(output, dict):
        if "content" in output:
            return str(output.get("content") or "")
        if "output" in output:
            return str(output.get("output") or "")
        if "error" in output:
            return str(output.get("error") or "")
        try:
            return json.dumps(output)
        except TypeError:
            return str(output)
    try:
        return json.dumps(output)
    except TypeError:
        return str(output)


@dataclass
class ToolUse:
    """A tool invocation by the assistant."""
    id: str
    name: str
    input: dict
    spawned_agent_id: str | None = None  # Agent ID if this tool spawned a subsession
    result: str | None = None  # Tool result content (populated from subsequent user message)
    result_is_error: bool = False  # Whether the result was an error


@dataclass
class ToolResult:
    """Result from a tool invocation."""
    tool_use_id: str
    content: str
    is_error: bool = False


@dataclass
class TokenUsage:
    """Token usage for a message."""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0


@dataclass
class TranscriptMessage:
    """A single message in the conversation."""
    uuid: str
    role: str  # "user" or "assistant"
    content: str  # Text content
    timestamp: str
    thinking: str | None = None  # Claude's thinking (if extended thinking enabled)
    tool_uses: list[ToolUse] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)
    model: str | None = None  # Model used for this response
    usage: TokenUsage | None = None  # Token usage for this message


@dataclass
class ParsedTranscript:
    """A fully parsed conversation transcript."""
    session_id: str
    messages: list[TranscriptMessage]
    summary: str | None = None  # Session summary/title
    model: str | None = None  # Primary model used
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cache_read_tokens: int = 0
    total_cache_creation_tokens: int = 0
    start_time: str | None = None
    end_time: str | None = None
    cli_version: str | None = None
    git_branch: str | None = None


def _find_tool_use_by_id(
    messages: list["TranscriptMessage"], tool_use_id: str
) -> ToolUse | None:
    """
    Find a ToolUse by its ID, searching backwards through messages.

    Returns the matching ToolUse or None if not found.
    """
    for msg in reversed(messages):
        if msg.role == "assistant":
            for tool_use in msg.tool_uses:
                if tool_use.id == tool_use_id:
                    return tool_use
    return None


def extract_agent_id(content: list) -> str | None:
    """
    Extract agentId from tool_result content blocks.

    When Claude uses Skill/Task tool, the result includes a line like:
    "agentId: a01393b (for resuming to continue this agent's work if needed)"
    """
    for item in content:
        if isinstance(item, dict) and item.get('type') == 'text':
            text = item.get('text') or ''
            # Look for pattern: "agentId: XXXXXXX" (7-char hex)
            match = re.search(r'agentId:\s*([a-f0-9]{7})', text)
            if match:
                return match.group(1)
    return None


def find_transcript_file(session_id: str, working_dir: str) -> Path | None:
    """
    Find the JSONL transcript file for a given session ID.

    Claude stores transcripts in ~/.claude/projects/<encoded-path>/<session-id>.jsonl
    """
    claude_projects_dir = get_claude_projects_dir()

    if not claude_projects_dir.exists():
        return None

    # The project directory name is the path with slashes replaced by dashes
    # e.g., /home/user/projects/myapp -> -home-user-projects-myapp
    encoded = encode_path(working_dir)
    project_dir = claude_projects_dir / encoded

    if not project_dir.exists():
        # Try finding it by searching all project dirs
        for d in claude_projects_dir.iterdir():
            if d.is_dir():
                transcript_file = d / f"{session_id}.jsonl"
                if transcript_file.exists():
                    return transcript_file
        return None

    transcript_file = project_dir / f"{session_id}.jsonl"
    if transcript_file.exists():
        return transcript_file

    return None


def parse_transcript(session_id: str, working_dir: str) -> ParsedTranscript | None:
    """
    Parse a Claude Code session transcript from JSONL format.

    This is a convenience function that finds the transcript file and parses it.
    For non-Claude CLIs, use parse_transcript_file() directly with the transcript path.

    Args:
        session_id: The Claude session UUID
        working_dir: The working directory where the session was run

    Returns:
        ParsedTranscript with structured messages, or None if not found
    """
    transcript_file = find_transcript_file(session_id, working_dir)

    if not transcript_file:
        return None

    return _parse_claude_transcript(transcript_file, session_id)


def parse_transcript_file(
    transcript_path: Path,
    session_id: str,
    cli_type: str = "claude",
) -> ParsedTranscript | None:
    """
    Parse a transcript file from any CLI type.

    Args:
        transcript_path: Path to the transcript file
        session_id: The session UUID
        cli_type: The CLI type ("claude", "gemini", "codex", "copilot")

    Returns:
        ParsedTranscript with structured messages, or None if parsing fails
    """
    if not transcript_path.exists():
        return None

    if cli_type == "gemini":
        return _parse_gemini_transcript(transcript_path, session_id)
    elif cli_type == "codex":
        return _parse_codex_transcript(transcript_path, session_id)
    elif cli_type == "copilot":
        return _parse_copilot_transcript(transcript_path, session_id)
    else:
        # Default to Claude parser
        return _parse_claude_transcript(transcript_path, session_id)


def _parse_claude_transcript(transcript_path: Path, session_id: str) -> ParsedTranscript | None:
    """Parse a Claude JSONL transcript file."""
    messages: list[TranscriptMessage] = []
    total_input = 0
    total_output = 0
    total_cache_read = 0
    total_cache_read = 0
    total_cache_creation = 0
    summary = None
    primary_model = None
    start_time = None
    end_time = None
    cli_version = None
    git_branch = None

    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                entry_type = entry.get('type')

                # Capture summary
                if entry_type == 'summary':
                    summary = entry.get('summary')
                    continue

                # Skip non-message entries
                if entry_type not in ('user', 'assistant'):
                    continue

                # Capture metadata from first message
                if not cli_version:
                    cli_version = entry.get('version')
                if not git_branch:
                    git_branch = entry.get('gitBranch')

                timestamp = entry.get('timestamp', '')
                if timestamp:
                    if not start_time:
                        start_time = timestamp
                    end_time = timestamp

                # Use `or {}` to handle None values (key exists but value is None)
                message_data = entry.get('message') or {}
                # Use `or entry_type` to handle None values (key exists but value is None)
                role = message_data.get('role') or entry_type
                # Use `or []` to handle None values (key exists but value is None)
                content_parts = message_data.get('content') or []

                # Handle user messages
                if role == 'user':
                    # User content is usually a string
                    if isinstance(content_parts, str):
                        text_content = content_parts
                    elif isinstance(content_parts, list):
                        # Could be list of content blocks
                        text_parts = []
                        for part in content_parts:
                            if isinstance(part, dict):
                                if part.get('type') == 'text':
                                    text_parts.append(part.get('text', ''))
                                elif part.get('type') == 'tool_result':
                                    # Tool results in user messages - extract content and match to tool_use
                                    tool_use_id = part.get('tool_use_id')
                                    # Use `or []` to handle None values (key exists but value is None)
                                    tool_content = part.get('content') or []
                                    is_error = part.get('is_error', False)

                                    # Extract the result content as a string
                                    result_text = None
                                    if isinstance(tool_content, str):
                                        result_text = tool_content
                                    elif isinstance(tool_content, list):
                                        # Content is array of blocks - can be text or image
                                        text_parts_inner = []
                                        image_data_url = None
                                        for item in tool_content:
                                            if isinstance(item, dict):
                                                if item.get('type') == 'text':
                                                    text_parts_inner.append(item.get('text', ''))
                                                elif item.get('type') == 'image':
                                                    # Image block - extract base64 data as data URL
                                                    # Use `or {}` to handle None values (key exists but value is None)
                                                    source = item.get('source') or {}
                                                    if source.get('type') == 'base64':
                                                        media_type = source.get('media_type', 'image/png')
                                                        data = source.get('data', '')
                                                        if data:
                                                            # Store as data URL for frontend to render
                                                            image_data_url = f"data:{media_type};base64,{data}"
                                        # Combine text and image data if both present
                                        if text_parts_inner and image_data_url:
                                            # Include both text and image, separated by newline
                                            result_text = '\n'.join(text_parts_inner) + '\n' + image_data_url
                                        elif image_data_url:
                                            result_text = image_data_url
                                        elif text_parts_inner:
                                            result_text = '\n'.join(text_parts_inner)

                                        # Also check for spawned agent
                                        agent_id = extract_agent_id(tool_content)
                                        if agent_id and tool_use_id:
                                            tool_use = _find_tool_use_by_id(messages, tool_use_id)
                                            if tool_use:
                                                tool_use.spawned_agent_id = agent_id

                                    # Match result to the corresponding tool_use
                                        if tool_use_id:
                                            tool_use = _find_tool_use_by_id(messages, tool_use_id)
                                            if tool_use:
                                                tool_use.result = result_text
                                                tool_use.result_is_error = is_error
                                elif part.get('type') == 'image':
                                    source = part.get('source') or {}
                                    if isinstance(source, dict) and source.get('type') == 'base64':
                                        media_type = source.get('media_type', 'image/png')
                                        data = source.get('data', '')
                                        if data:
                                            data_url = f"data:{media_type};base64,{data}"
                                            text_parts.append(f"![image]({data_url})")
                                        else:
                                            text_parts.append("[image]")
                                    else:
                                        text_parts.append("[image]")
                            elif isinstance(part, str):
                                text_parts.append(part)
                        text_content = '\n'.join(text_parts)
                    else:
                        text_content = str(content_parts) if content_parts else ''

                    if text_content.strip():
                        messages.append(TranscriptMessage(
                            uuid=entry.get('uuid', ''),
                            role='user',
                            content=text_content,
                            timestamp=timestamp,
                        ))

                # Handle assistant messages
                elif role == 'assistant':
                    text_content = ''
                    thinking_content = ''
                    tool_uses = []

                    if isinstance(content_parts, list):
                        for part in content_parts:
                            if not isinstance(part, dict):
                                continue

                            part_type = part.get('type')

                            if part_type == 'text':
                                text_content += part.get('text', '')
                            elif part_type == 'thinking':
                                # Extended thinking content
                                thinking_content += part.get('thinking', '')
                            elif part_type == 'tool_use':
                                tool_uses.append(ToolUse(
                                    id=part.get('id', ''),
                                    name=part.get('name', ''),
                                    # Use `or {}` to handle None values (key exists but value is None)
                                    input=part.get('input') or {},
                                ))
                            elif part_type == 'image':
                                source = part.get('source') or {}
                                if isinstance(source, dict) and source.get('type') == 'base64':
                                    media_type = source.get('media_type', 'image/png')
                                    data = source.get('data', '')
                                    if data:
                                        data_url = f"data:{media_type};base64,{data}"
                                        if text_content:
                                            text_content += "\n"
                                        text_content += f"![image]({data_url})"

                    # Only add if there's actual content
                    if text_content.strip() or tool_uses:
                        # Get model and usage info
                        model = message_data.get('model')
                        if model and not primary_model:
                            primary_model = model

                        usage_data = message_data.get('usage') or {}
                        usage = None
                        if usage_data:
                            # Use `or 0` to handle None values (key exists but value is None)
                            input_tokens = usage_data.get('input_tokens', 0) or 0
                            output_tokens = usage_data.get('output_tokens', 0) or 0
                            cache_read = usage_data.get('cache_read_input_tokens', 0) or 0
                            cache_creation = usage_data.get('cache_creation_input_tokens', 0) or 0

                            usage = TokenUsage(
                                input_tokens=input_tokens,
                                output_tokens=output_tokens,
                                cache_read_tokens=cache_read,
                                cache_creation_tokens=cache_creation,
                            )

                            total_input += input_tokens
                            total_output += output_tokens
                            total_cache_read += cache_read
                            total_cache_creation += cache_creation

                        messages.append(TranscriptMessage(
                            uuid=entry.get('uuid', ''),
                            role='assistant',
                            content=text_content,
                            timestamp=timestamp,
                            thinking=thinking_content if thinking_content else None,
                            tool_uses=tool_uses,
                            model=model,
                            usage=usage,
                        ))

    except OSError as e:
        logger.warning("Failed to read transcript file %s: %s", transcript_path, e)
        return None

    return ParsedTranscript(
        session_id=session_id,
        messages=messages,
        summary=summary,
        model=primary_model,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        total_cache_read_tokens=total_cache_read,
        total_cache_creation_tokens=total_cache_creation,
        start_time=start_time,
        end_time=end_time,
        cli_version=cli_version,
        git_branch=git_branch,
    )


def _parse_gemini_transcript(transcript_path: Path, session_id: str) -> ParsedTranscript | None:
    """
    Parse a Gemini JSON transcript file.

    Gemini stores sessions as single JSON files with structure:
    - summary: Session summary/title
    - messages: Array of message objects with type, content, timestamp
    - startTime/lastUpdated: Timestamps

    Gemini message content can include:
    - text: Plain text content
    - functionCall: Tool invocation with name and args
    - functionResponse: Tool results
    - usage: Token usage metadata
    """
    messages: list[TranscriptMessage] = []
    summary = None
    primary_model = None
    start_time = None
    end_time = None
    total_input = 0
    total_output = 0
    total_cache_read = 0

    # Map tool_use_id to ToolUse for attaching results
    pending_tool_uses: dict[str, ToolUse] = {}

    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        summary = data.get("summary")
        start_time = data.get("startTime")
        end_time = data.get("lastUpdated")

        # Use `or []` to handle None values (key exists but value is None)
        for msg in data.get("messages") or []:
            msg_type = msg.get("type")
            timestamp = msg.get("timestamp", "")

            if msg_type == "user":
                content = msg.get("content", "")
                tool_results_in_msg = []

                # Handle both string and list content
                if isinstance(content, str):
                    text_content = content
                elif isinstance(content, list):
                    text_parts = []
                    for part in content:
                        if isinstance(part, dict):
                            part_type = part.get("type", "")
                            if part_type == "text":
                                text_parts.append(part.get("text", ""))
                            elif part_type == "functionResponse" or "functionResponse" in part:
                                func_resp = part.get("functionResponse") or part
                                func_id = func_resp.get("id") or ""
                                func_name = func_resp.get("name") or ""
                                result_text, result_is_error = _extract_gemini_function_response(func_resp)

                                match_key = func_id or func_name
                                if match_key and match_key in pending_tool_uses:
                                    tool_use = pending_tool_uses[match_key]
                                    if tool_use.result is None:
                                        tool_use.result = result_text
                                        tool_use.result_is_error = result_is_error
                                elif func_name:
                                    for tool_use in pending_tool_uses.values():
                                        if tool_use.name == func_name and tool_use.result is None:
                                            tool_use.result = result_text
                                            tool_use.result_is_error = result_is_error
                                            break

                                tool_results_in_msg.append(ToolResult(
                                    tool_use_id=match_key or func_name,
                                    content=result_text,
                                    is_error=result_is_error,
                                ))
                        elif isinstance(part, str):
                            text_parts.append(part)
                    text_content = "\n".join(text_parts)
                else:
                    text_content = str(content) if content else ""

                if text_content.strip():
                    messages.append(TranscriptMessage(
                        uuid=msg.get("id", ""),
                        role="user",
                        content=text_content,
                        timestamp=timestamp,
                        tool_results=tool_results_in_msg,
                    ))

            elif msg_type == "gemini":
                content = msg.get("content", "")
                model = msg.get("model")
                if model and not primary_model:
                    primary_model = model

                usage = None
                tokens = msg.get("tokens") or {}
                if tokens:
                    input_tokens = tokens.get("input") or 0
                    output_tokens = tokens.get("output") or 0
                    cache_read = tokens.get("cached") or 0
                    usage = TokenUsage(
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        cache_read_tokens=cache_read,
                    )
                    total_input += input_tokens
                    total_output += output_tokens
                    total_cache_read += cache_read
                else:
                    usage_data = msg.get("usage") or {}
                    if usage_data:
                        # Use `or 0` at the end to handle None values from both keys
                        input_tokens = usage_data.get("promptTokenCount") or usage_data.get("input_tokens") or 0
                        output_tokens = usage_data.get("candidatesTokenCount") or usage_data.get("output_tokens") or 0
                        usage = TokenUsage(
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                        )
                        total_input += input_tokens
                        total_output += output_tokens

                # Handle content that could be string or list
                text_content = ""
                thinking_content = ""
                tool_uses = []

                thoughts = msg.get("thoughts") or []
                if isinstance(thoughts, list):
                    thought_parts = []
                    for thought in thoughts:
                        if not isinstance(thought, dict):
                            continue
                        subject = thought.get("subject") or ""
                        description = thought.get("description") or ""
                        if subject or description:
                            thought_parts.append(f"{subject}: {description}".strip(": "))
                    if thought_parts:
                        thinking_content += "\n".join(thought_parts)

                tool_calls = msg.get("toolCalls") or msg.get("tool_calls") or []
                if isinstance(tool_calls, list):
                    for call in tool_calls:
                        if not isinstance(call, dict):
                            continue
                        tool_id = call.get("id") or call.get("callId") or call.get("name") or ""
                        tool_use = ToolUse(
                            id=str(tool_id),
                            name=call.get("name", ""),
                            input=_parse_tool_arguments(call.get("args") or call.get("input")),
                        )
                        result = call.get("result")
                        if result is None and isinstance(call.get("resultDisplay"), str):
                            result = call.get("resultDisplay")
                        result_text, result_is_error = _extract_gemini_tool_result(result)
                        if result_text:
                            tool_use.result = result_text
                        status = str(call.get("status") or "").lower()
                        tool_use.result_is_error = result_is_error or status in {"error", "failed", "cancelled"}
                        tool_uses.append(tool_use)
                        match_key = tool_use.id or tool_use.name
                        if match_key:
                            pending_tool_uses[match_key] = tool_use

                if isinstance(content, str):
                    text_content = content
                elif isinstance(content, list):
                    text_parts = []
                    for part in content:
                        if isinstance(part, dict):
                            part_type = part.get("type", "")

                            if part_type == "text":
                                text_parts.append(part.get("text", ""))

                            elif part_type == "thinking" or "thinking" in part:
                                # Gemini thinking/reasoning
                                # Use `or` to handle None values (key exists but value is None)
                                thinking_content += part.get("thinking") or part.get("text") or ""

                            elif part_type == "functionCall" or "functionCall" in part:
                                # Tool invocation
                                func_call = part.get("functionCall", part)
                                # Use `or` to handle None values (key exists but value is None)
                                tool_id = func_call.get("id") or func_call.get("name") or ""
                                tool_use = ToolUse(
                                    id=tool_id,
                                    name=func_call.get("name", ""),
                                    # Use `or {}` to handle None values (key exists but value is None)
                                    input=func_call.get("args") or {},
                                )
                                tool_uses.append(tool_use)
                                if tool_id:
                                    pending_tool_uses[tool_id] = tool_use

                        elif isinstance(part, str):
                            text_parts.append(part)
                    text_content = "\n".join(text_parts)

                if text_content.strip() or tool_uses:
                    messages.append(TranscriptMessage(
                        uuid=msg.get("id", ""),
                        role="assistant",
                        content=text_content,
                        timestamp=timestamp,
                        thinking=thinking_content if thinking_content else None,
                        tool_uses=tool_uses,
                        model=model,
                        usage=usage,
                    ))

    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Failed to parse Gemini transcript %s: %s", transcript_path, e)
        return None

    return ParsedTranscript(
        session_id=session_id,
        messages=messages,
        summary=summary,
        model=primary_model,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        total_cache_read_tokens=total_cache_read,
        total_cache_creation_tokens=0,
        start_time=start_time,
        end_time=end_time,
        cli_version=None,
        git_branch=None,
    )


def _parse_codex_transcript(transcript_path: Path, session_id: str) -> ParsedTranscript | None:
    """
    Parse a Codex JSONL transcript file.

    Codex uses JSONL format with different entry types:
    - session_meta: Session metadata (cwd, timestamp, git info)
    - response_item: User/assistant messages and function calls
    - turn_context: Model info for the turn
    - usage: Token usage data

    Codex response_item content can include:
    - input_text: User text input
    - output_text: Assistant text output
    - function_call: Tool invocation
    - function_call_output: Tool results
    """
    messages: list[TranscriptMessage] = []
    primary_model = None
    start_time = None
    end_time = None
    git_branch = None
    cli_version = None
    user_message_count = 0
    total_input = 0
    total_output = 0

    # Map tool call IDs to ToolUse objects for attaching results
    pending_tool_uses: dict[str, ToolUse] = {}

    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                entry_type = entry.get('type')
                timestamp = entry.get('timestamp', '')

                if entry_type == 'session_meta':
                    # Use `or {}` to handle None values (key exists but value is None)
                    payload = entry.get('payload') or {}
                    start_time = payload.get('timestamp')
                    cli_version = payload.get('cli_version') or payload.get('codexVersion')
                    git_info = payload.get('git') or {}
                    if git_info:
                        git_branch = git_info.get('branch')

                elif entry_type == 'turn_context':
                    # Use `or {}` to handle None values (key exists but value is None)
                    payload = entry.get('payload') or {}
                    model = payload.get('model')
                    if model and not primary_model:
                        primary_model = model

                    # Token usage may be in turn_context
                    # Use `or {}` to handle None values (key exists but value is None)
                    usage_data = payload.get('usage') or {}
                    if usage_data:
                        # Use `or 0` at the end to handle None values from both keys
                        total_input += usage_data.get('input_tokens') or usage_data.get('prompt_tokens') or 0
                        total_output += usage_data.get('output_tokens') or usage_data.get('completion_tokens') or 0

                elif entry_type == 'usage':
                    # Standalone usage entry
                    # Use `or {}` to handle None values (key exists but value is None)
                    payload = entry.get('payload') or {}
                    # Use `or 0` at the end to handle None values from both keys
                    total_input += payload.get('input_tokens') or payload.get('prompt_tokens') or 0
                    total_output += payload.get('output_tokens') or payload.get('completion_tokens') or 0

                elif entry_type == 'compacted':
                    payload = entry.get('payload') or {}
                    compacted_message = payload.get('message') or ""
                    if compacted_message:
                        messages.append(TranscriptMessage(
                            uuid="",
                            role="assistant",
                            content=str(compacted_message),
                            timestamp=timestamp,
                            model=primary_model,
                        ))
                        if timestamp:
                            end_time = timestamp

                elif entry_type == 'response_item':
                    # Use `or {}` to handle None values (key exists but value is None)
                    payload = entry.get('payload') or {}
                    role = payload.get('role')
                    item_type = payload.get('type', '')

                    if timestamp:
                        end_time = timestamp

                    # Handle function_call entries (tool invocations)
                    if item_type in {'function_call', 'custom_tool_call', 'local_shell_call', 'web_search_call'}:
                        # Use `or` to handle None values (key exists but value is None)
                        tool_id = payload.get('call_id') or payload.get('id') or ''
                        tool_name = payload.get('name', '') or item_type
                        tool_input = {}
                        if item_type == 'function_call':
                            tool_input = _parse_tool_arguments(payload.get('arguments'))
                        elif item_type == 'custom_tool_call':
                            tool_input = _parse_tool_arguments(payload.get('input'))
                        else:
                            action = payload.get('action') or {}
                            tool_input = action if isinstance(action, dict) else {"action": action}
                            if item_type == 'local_shell_call':
                                tool_name = payload.get('name') or 'local_shell'
                            if item_type == 'web_search_call':
                                tool_name = payload.get('name') or 'web_search'

                        tool_use = ToolUse(
                            id=tool_id,
                            name=tool_name,
                            input=tool_input,
                        )
                        match_key = tool_id or tool_name
                        if match_key:
                            pending_tool_uses[match_key] = tool_use

                        # Add to most recent assistant message or create one
                        if messages and messages[-1].role == 'assistant':
                            messages[-1].tool_uses.append(tool_use)
                        else:
                            messages.append(TranscriptMessage(
                                uuid=payload.get('id', ''),
                                role='assistant',
                                content='',
                                timestamp=timestamp,
                                tool_uses=[tool_use],
                                model=primary_model,
                            ))
                        continue

                    # Handle function_call_output entries (tool results)
                    if item_type in {'function_call_output', 'custom_tool_call_output'}:
                        call_id = payload.get('call_id', '')
                        output = _normalize_codex_tool_output(payload.get('output'))

                        # Attach result to the matching tool_use
                        if call_id and call_id in pending_tool_uses:
                            pending_tool_uses[call_id].result = output
                            pending_tool_uses[call_id].result_is_error = payload.get('is_error', False)
                        continue

                    if role == 'user':
                        user_message_count += 1
                        # Skip the first user message (environment context)
                        if user_message_count == 1:
                            continue

                        # Use `or []` to handle None values (key exists but value is None)
                        content_parts = payload.get('content') or []
                        text_parts = []
                        tool_results = []

                        for c in content_parts:
                            if isinstance(c, dict):
                                c_type = c.get('type', '')
                                if c_type == 'input_text':
                                    text = c.get('text', '')
                                    if text and not text.startswith('<environment_context>'):
                                        text_parts.append(text)
                                elif c_type in {'function_call_output', 'custom_tool_call_output'}:
                                    # Tool result in user message
                                    call_id = c.get('call_id', '')
                                    output = _normalize_codex_tool_output(c.get('output'))
                                    if call_id and call_id in pending_tool_uses:
                                        pending_tool_uses[call_id].result = output
                                        pending_tool_uses[call_id].result_is_error = c.get('is_error', False)
                                    tool_results.append(ToolResult(
                                        tool_use_id=call_id,
                                        content=output,
                                        is_error=c.get('is_error', False),
                                    ))

                        text_content = '\n'.join(text_parts)

                        if text_content.strip() or tool_results:
                            messages.append(TranscriptMessage(
                                uuid=payload.get('id', ''),
                                role='user',
                                content=text_content,
                                timestamp=timestamp,
                                tool_results=tool_results,
                            ))

                    elif role == 'assistant':
                        # Use `or []` to handle None values (key exists but value is None)
                        content_parts = payload.get('content') or []
                        text_parts = []
                        thinking_content = ""
                        tool_uses = []

                        for c in content_parts:
                            if isinstance(c, dict):
                                c_type = c.get('type', '')
                                if c_type == 'output_text':
                                    text_parts.append(c.get('text', ''))
                                elif c_type == 'thinking' or c_type == 'reasoning':
                                    # Use `or` to handle None values (key exists but value is None)
                                    thinking_content += c.get('text') or c.get('thinking') or ''
                                elif c_type == 'function_call':
                                    # Use `or` to handle None values (key exists but value is None)
                                    tool_id = c.get('call_id') or c.get('id') or ''
                                    tool_use = ToolUse(
                                        id=tool_id,
                                        name=c.get('name', ''),
                                        # Parse arguments - can be dict, JSON string, or None
                                        input=_parse_tool_arguments(c.get('arguments')),
                                    )
                                    tool_uses.append(tool_use)
                                    pending_tool_uses[tool_id] = tool_use

                        text_content = '\n'.join(text_parts)

                        # Get per-message usage if available
                        usage = None
                        # Use `or {}` to handle None values (key exists but value is None)
                        msg_usage = payload.get('usage') or {}
                        if msg_usage:
                            # Use `or 0` at the end to handle None values from both keys
                            input_tokens = msg_usage.get('input_tokens') or msg_usage.get('prompt_tokens') or 0
                            output_tokens = msg_usage.get('output_tokens') or msg_usage.get('completion_tokens') or 0
                            usage = TokenUsage(
                                input_tokens=input_tokens,
                                output_tokens=output_tokens,
                            )

                        if text_content.strip() or tool_uses:
                            messages.append(TranscriptMessage(
                                uuid=payload.get('id', ''),
                                role='assistant',
                                content=text_content,
                                timestamp=timestamp,
                                thinking=thinking_content if thinking_content else None,
                                tool_uses=tool_uses,
                                model=primary_model,
                                usage=usage,
                            ))

    except OSError as e:
        logger.warning("Failed to parse Codex transcript %s: %s", transcript_path, e)
        return None

    return ParsedTranscript(
        session_id=session_id,
        messages=messages,
        summary=None,  # Codex doesn't have session summaries
        model=primary_model,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        total_cache_read_tokens=0,
        total_cache_creation_tokens=0,
        start_time=start_time,
        end_time=end_time,
        cli_version=cli_version,
        git_branch=git_branch,
    )


def _normalize_copilot_role(value: str | None) -> str | None:
    """Normalize Copilot role labels to user/assistant."""
    if not value:
        return None
    lowered = value.lower()
    if "user" in lowered or "human" in lowered:
        return "user"
    if "assistant" in lowered or "copilot" in lowered or "ai" in lowered:
        return "assistant"
    return None


def _extract_copilot_text(content: object) -> str:
    """Extract text from Copilot content blocks."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        part_type = content.get("type")
        if part_type in ("text", "input_text", "output_text") and isinstance(content.get("text"), str):
            return content.get("text") or ""
        for key in ("text", "content", "message", "value", "body", "prompt", "response", "output", "parts"):
            value = content.get(key)
            if isinstance(value, str):
                return value
            if isinstance(value, (dict, list)):
                nested = _extract_copilot_text(value)
                if nested:
                    return nested
        parts = content.get("parts")
        if isinstance(parts, list):
            nested = _extract_copilot_text(parts)
            if nested:
                return nested
        return ""
    if isinstance(content, list):
        parts = [_extract_copilot_text(item) for item in content]
        return "\n".join([p for p in parts if p])
    return ""


def _extract_copilot_timestamp(entry: dict) -> str:
    """Extract a timestamp from a Copilot entry."""
    for key in ("timestamp", "created_at", "createdAt", "time", "ts", "updated_at", "updatedAt"):
        value = entry.get(key)
        if isinstance(value, str):
            return value
    return ""


def _extract_copilot_tool_uses(entry: dict) -> list[ToolUse]:
    """Extract tool calls from a Copilot entry."""
    tool_calls = (
        entry.get("tool_calls")
        or entry.get("toolCalls")
        or entry.get("tool_calls_v2")
        or entry.get("toolCallsV2")
        or entry.get("function_calls")
        or entry.get("functionCalls")
        or entry.get("tools")
        or entry.get("actions")
    )
    if isinstance(tool_calls, dict):
        tool_calls = [tool_calls]
    if not isinstance(tool_calls, list):
        return []

    tool_uses: list[ToolUse] = []
    for call in tool_calls:
        if not isinstance(call, dict):
            continue
        tool_id = (
            call.get("id")
            or call.get("call_id")
            or call.get("tool_call_id")
            or call.get("toolCallId")
            or call.get("name")
            or call.get("tool_name")
            or ""
        )
        tool_use = ToolUse(
            id=str(tool_id),
            name=call.get("name") or call.get("tool") or "",
            input=_parse_tool_arguments(call.get("arguments") or call.get("args") or call.get("input")),
        )
        output = call.get("result") or call.get("output") or call.get("tool_result") or call.get("toolResult")
        if isinstance(output, str):
            tool_use.result = output
        tool_uses.append(tool_use)
    return tool_uses


def _extract_copilot_usage(entry: dict) -> TokenUsage | None:
    """Extract token usage from a Copilot entry."""
    usage = entry.get("usage") or entry.get("token_usage") or entry.get("tokenUsage")
    if not isinstance(usage, dict):
        return None
    input_tokens = (
        usage.get("input_tokens")
        or usage.get("prompt_tokens")
        or usage.get("inputTokens")
        or usage.get("promptTokens")
        or 0
    )
    output_tokens = (
        usage.get("output_tokens")
        or usage.get("completion_tokens")
        or usage.get("outputTokens")
        or usage.get("completionTokens")
        or 0
    )
    cache_read = usage.get("cache_read_tokens") or usage.get("cacheReadTokens") or 0
    cache_create = usage.get("cache_creation_tokens") or usage.get("cacheCreationTokens") or 0
    return TokenUsage(
        input_tokens=input_tokens or 0,
        output_tokens=output_tokens or 0,
        cache_read_tokens=cache_read or 0,
        cache_creation_tokens=cache_create or 0,
    )


def _parse_copilot_transcript(transcript_path: Path, session_id: str) -> ParsedTranscript | None:
    """
    Parse a Copilot session transcript (JSON or JSONL).

    Copilot's storage format is not publicly documented, so this parser is
    best-effort and relies on common field names.
    """
    messages: list[TranscriptMessage] = []
    summary = None
    primary_model = None
    start_time = None
    end_time = None
    cli_version = None
    git_branch = None
    total_input = 0
    total_output = 0
    total_cache_read = 0
    total_cache_creation = 0

    try:
        if transcript_path.suffix == ".jsonl":
            entries: list[dict] = []
            with open(transcript_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(entry, dict):
                        entries.append(entry)
        else:
            with open(transcript_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                summary = data.get("summary") or data.get("title")
                primary_model = data.get("model") or data.get("modelId") or data.get("model_name")
                start_time = data.get("start_time") or data.get("created_at") or data.get("createdAt")
                end_time = data.get("end_time") or data.get("updated_at") or data.get("updatedAt")
                cli_version = data.get("cli_version")
                git_branch = data.get("git_branch")

                for meta_key in ("session", "state", "metadata"):
                    meta = data.get(meta_key)
                    if isinstance(meta, dict):
                        summary = summary or meta.get("summary") or meta.get("title")
                        primary_model = primary_model or meta.get("model") or meta.get("modelId")
                        start_time = start_time or meta.get("start_time") or meta.get("created_at")
                        end_time = end_time or meta.get("end_time") or meta.get("updated_at")
                        cli_version = cli_version or meta.get("cli_version") or meta.get("version")
                        git_branch = git_branch or meta.get("git_branch") or meta.get("branch")

                for key in ("messages", "timeline", "events", "history", "items", "conversation"):
                    if isinstance(data.get(key), list):
                        entries = data.get(key)
                        break
                else:
                    entries = []
            elif isinstance(data, list):
                entries = data
            else:
                entries = []

        for idx, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue

            payload = entry.get("payload")
            if isinstance(payload, dict) and entry.get("type"):
                entry = {"_entry_type": entry.get("type"), **payload}

            role = _normalize_copilot_role(
                entry.get("role")
                or entry.get("type")
                or entry.get("_entry_type")
                or entry.get("speaker")
                or entry.get("author")
            )

            if role is None:
                prompt = entry.get("prompt") or entry.get("input")
                response = entry.get("response") or entry.get("output")
                if isinstance(prompt, str):
                    messages.append(TranscriptMessage(
                        uuid=str(entry.get("id") or f"{session_id}-p{idx}"),
                        role="user",
                        content=prompt,
                        timestamp=_extract_copilot_timestamp(entry),
                    ))
                if isinstance(response, str):
                    messages.append(TranscriptMessage(
                        uuid=str(entry.get("id") or f"{session_id}-r{idx}"),
                        role="assistant",
                        content=response,
                        timestamp=_extract_copilot_timestamp(entry),
                        model=primary_model,
                    ))
                continue

            content = (
                entry.get("content")
                or entry.get("text")
                or entry.get("message")
                or entry.get("body")
                or entry.get("output")
                or entry.get("input")
            )
            text_content = _extract_copilot_text(content)
            timestamp = _extract_copilot_timestamp(entry)
            if timestamp:
                if not start_time:
                    start_time = timestamp
                end_time = timestamp

            model = entry.get("model") or entry.get("modelId") or entry.get("model_name") or primary_model
            if model and not primary_model:
                primary_model = model

            usage = _extract_copilot_usage(entry)
            if usage:
                total_input += usage.input_tokens
                total_output += usage.output_tokens
                total_cache_read += usage.cache_read_tokens
                total_cache_creation += usage.cache_creation_tokens

            tool_uses = _extract_copilot_tool_uses(entry) if role == "assistant" else []

            if text_content.strip() or tool_uses:
                messages.append(TranscriptMessage(
                    uuid=str(entry.get("id") or f"{session_id}-{idx}"),
                    role=role,
                    content=text_content,
                    timestamp=timestamp,
                    tool_uses=tool_uses,
                    model=model,
                    usage=usage,
                ))

    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Failed to parse Copilot transcript %s: %s", transcript_path, e)
        return None

    return ParsedTranscript(
        session_id=session_id,
        messages=messages,
        summary=summary,
        model=primary_model,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        total_cache_read_tokens=total_cache_read,
        total_cache_creation_tokens=total_cache_creation,
        start_time=start_time,
        end_time=end_time,
        cli_version=cli_version,
        git_branch=git_branch,
    )


def transcript_to_dict(transcript: ParsedTranscript) -> dict:
    """Convert a ParsedTranscript to a JSON-serializable dict."""
    return {
        'session_id': transcript.session_id,
        'messages': [
            {
                'uuid': msg.uuid,
                'role': msg.role,
                'content': msg.content,
                'timestamp': msg.timestamp,
                'thinking': msg.thinking,
                'tool_uses': [
                    {
                        'id': t.id,
                        'name': t.name,
                        'input': t.input,
                        'spawned_agent_id': t.spawned_agent_id,
                        'result': t.result,
                        'result_is_error': t.result_is_error,
                    }
                    for t in msg.tool_uses
                ],
                'tool_results': [
                    {
                        'tool_use_id': r.tool_use_id,
                        'content': r.content,
                        'is_error': r.is_error,
                    }
                    for r in msg.tool_results
                ],
                'model': msg.model,
                'usage': {
                    'input_tokens': msg.usage.input_tokens,
                    'output_tokens': msg.usage.output_tokens,
                    'cache_read_tokens': msg.usage.cache_read_tokens,
                    'cache_creation_tokens': msg.usage.cache_creation_tokens,
                } if msg.usage else None,
            }
            for msg in transcript.messages
        ],
        'summary': transcript.summary,
        'model': transcript.model,
        'total_input_tokens': transcript.total_input_tokens,
        'total_output_tokens': transcript.total_output_tokens,
        'total_cache_read_tokens': transcript.total_cache_read_tokens,
        'total_cache_creation_tokens': transcript.total_cache_creation_tokens,
        'start_time': transcript.start_time,
        'end_time': transcript.end_time,
        'cli_version': transcript.cli_version,
        'git_branch': transcript.git_branch,
    }
