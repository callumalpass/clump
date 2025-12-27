"""
Parse Claude Code JSONL transcripts into structured conversation data.

Claude Code stores session transcripts in ~/.claude/projects/<project-path>/<session-id>.jsonl
Each line is a JSON object representing a message or event.
"""

import json
import os
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class ToolUse:
    """A tool invocation by the assistant."""
    id: str
    name: str
    input: dict


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
    thinking: Optional[str] = None  # Claude's thinking (if extended thinking enabled)
    tool_uses: list[ToolUse] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)
    model: Optional[str] = None  # Model used for this response
    usage: Optional[TokenUsage] = None  # Token usage for this message


@dataclass
class ParsedTranscript:
    """A fully parsed conversation transcript."""
    session_id: str
    messages: list[TranscriptMessage]
    summary: Optional[str] = None  # Session summary/title
    model: Optional[str] = None  # Primary model used
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cache_read_tokens: int = 0
    total_cache_creation_tokens: int = 0
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    claude_code_version: Optional[str] = None
    git_branch: Optional[str] = None


def find_transcript_file(session_id: str, working_dir: str) -> Optional[Path]:
    """
    Find the JSONL transcript file for a given session ID.

    Claude stores transcripts in ~/.claude/projects/<encoded-path>/<session-id>.jsonl
    """
    claude_projects_dir = Path.home() / ".claude" / "projects"

    if not claude_projects_dir.exists():
        return None

    # The project directory name is the path with slashes replaced by dashes
    # e.g., /home/user/projects/myapp -> -home-user-projects-myapp
    encoded_path = working_dir.replace("/", "-")
    project_dir = claude_projects_dir / encoded_path

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


def parse_transcript(session_id: str, working_dir: str) -> Optional[ParsedTranscript]:
    """
    Parse a Claude Code session transcript from JSONL format.

    Args:
        session_id: The Claude session UUID
        working_dir: The working directory where the session was run

    Returns:
        ParsedTranscript with structured messages, or None if not found
    """
    transcript_file = find_transcript_file(session_id, working_dir)

    if not transcript_file:
        return None

    messages: list[TranscriptMessage] = []
    total_input = 0
    total_output = 0
    total_cache_read = 0
    total_cache_creation = 0
    summary = None
    primary_model = None
    start_time = None
    end_time = None
    claude_code_version = None
    git_branch = None

    try:
        with open(transcript_file, 'r', encoding='utf-8') as f:
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
                if not claude_code_version:
                    claude_code_version = entry.get('version')
                if not git_branch:
                    git_branch = entry.get('gitBranch')

                timestamp = entry.get('timestamp', '')
                if timestamp:
                    if not start_time:
                        start_time = timestamp
                    end_time = timestamp

                message_data = entry.get('message', {})
                role = message_data.get('role', entry_type)
                content_parts = message_data.get('content', [])

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
                                    # Tool results in user messages
                                    pass
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
                                    input=part.get('input', {}),
                                ))

                    # Only add if there's actual content
                    if text_content.strip() or tool_uses:
                        # Get model and usage info
                        model = message_data.get('model')
                        if model and not primary_model:
                            primary_model = model

                        usage_data = message_data.get('usage', {})
                        usage = None
                        if usage_data:
                            input_tokens = usage_data.get('input_tokens', 0)
                            output_tokens = usage_data.get('output_tokens', 0)
                            cache_read = usage_data.get('cache_read_input_tokens', 0)
                            cache_creation = usage_data.get('cache_creation_input_tokens', 0)

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

    except Exception as e:
        print(f"Error parsing transcript: {e}")
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
        claude_code_version=claude_code_version,
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
                    {'id': t.id, 'name': t.name, 'input': t.input}
                    for t in msg.tool_uses
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
        'claude_code_version': transcript.claude_code_version,
        'git_branch': transcript.git_branch,
    }
