"""Tests for app.services.transcript_parser module."""

import pytest
from app.services.transcript_parser import (
    ToolUse,
    ToolResult,
    TokenUsage,
    TranscriptMessage,
    ParsedTranscript,
    transcript_to_dict,
    extract_agent_id,
)


class TestToolUse:
    """Tests for ToolUse dataclass."""

    def test_creates_tool_use(self):
        """Can create a ToolUse with required fields."""
        tool = ToolUse(id="123", name="Read", input={"file": "test.py"})
        assert tool.id == "123"
        assert tool.name == "Read"
        assert tool.input == {"file": "test.py"}


class TestToolResult:
    """Tests for ToolResult dataclass."""

    def test_creates_tool_result(self):
        """Can create a ToolResult with required fields."""
        result = ToolResult(tool_use_id="123", content="file contents")
        assert result.tool_use_id == "123"
        assert result.content == "file contents"
        assert result.is_error is False

    def test_creates_error_result(self):
        """Can create a ToolResult marked as error."""
        result = ToolResult(tool_use_id="123", content="not found", is_error=True)
        assert result.is_error is True


class TestTokenUsage:
    """Tests for TokenUsage dataclass."""

    def test_default_values(self):
        """TokenUsage has zero defaults for all fields."""
        usage = TokenUsage()
        assert usage.input_tokens == 0
        assert usage.output_tokens == 0
        assert usage.cache_read_tokens == 0
        assert usage.cache_creation_tokens == 0

    def test_custom_values(self):
        """Can set custom token values."""
        usage = TokenUsage(
            input_tokens=100,
            output_tokens=50,
            cache_read_tokens=25,
            cache_creation_tokens=10
        )
        assert usage.input_tokens == 100
        assert usage.output_tokens == 50


class TestTranscriptMessage:
    """Tests for TranscriptMessage dataclass."""

    def test_creates_user_message(self):
        """Can create a user message."""
        msg = TranscriptMessage(
            uuid="abc123",
            role="user",
            content="Hello",
            timestamp="2025-01-01T00:00:00Z"
        )
        assert msg.role == "user"
        assert msg.content == "Hello"
        assert msg.tool_uses == []
        assert msg.thinking is None

    def test_creates_assistant_message_with_tools(self):
        """Can create an assistant message with tool uses."""
        tool = ToolUse(id="t1", name="Read", input={})
        msg = TranscriptMessage(
            uuid="abc123",
            role="assistant",
            content="Let me read that file.",
            timestamp="2025-01-01T00:00:00Z",
            tool_uses=[tool],
            model="claude-sonnet-4-20250514"
        )
        assert msg.role == "assistant"
        assert len(msg.tool_uses) == 1
        assert msg.tool_uses[0].name == "Read"
        assert msg.model == "claude-sonnet-4-20250514"


class TestParsedTranscript:
    """Tests for ParsedTranscript dataclass."""

    def test_creates_empty_transcript(self):
        """Can create a transcript with no messages."""
        transcript = ParsedTranscript(session_id="sess-123", messages=[])
        assert transcript.session_id == "sess-123"
        assert transcript.messages == []
        assert transcript.total_input_tokens == 0

    def test_creates_transcript_with_metadata(self):
        """Can create a transcript with all metadata fields."""
        transcript = ParsedTranscript(
            session_id="sess-123",
            messages=[],
            summary="Test session",
            model="claude-sonnet-4-20250514",
            total_input_tokens=1000,
            total_output_tokens=500,
            start_time="2025-01-01T00:00:00Z",
            end_time="2025-01-01T01:00:00Z",
            cli_version="1.0.0",
            git_branch="main"
        )
        assert transcript.summary == "Test session"
        assert transcript.model == "claude-sonnet-4-20250514"
        assert transcript.total_input_tokens == 1000


class TestTranscriptToDict:
    """Tests for transcript_to_dict function."""

    def test_converts_empty_transcript(self):
        """Converts an empty transcript to dict."""
        transcript = ParsedTranscript(session_id="sess-123", messages=[])
        result = transcript_to_dict(transcript)

        assert result["session_id"] == "sess-123"
        assert result["messages"] == []
        assert result["total_input_tokens"] == 0
        assert result["summary"] is None

    def test_converts_message_with_usage(self):
        """Converts a message with token usage."""
        usage = TokenUsage(input_tokens=100, output_tokens=50)
        msg = TranscriptMessage(
            uuid="msg-1",
            role="assistant",
            content="Hello",
            timestamp="2025-01-01T00:00:00Z",
            usage=usage
        )
        transcript = ParsedTranscript(
            session_id="sess-123",
            messages=[msg],
            total_input_tokens=100,
            total_output_tokens=50
        )
        result = transcript_to_dict(transcript)

        assert len(result["messages"]) == 1
        assert result["messages"][0]["usage"]["input_tokens"] == 100
        assert result["messages"][0]["usage"]["output_tokens"] == 50

    def test_converts_message_with_tool_uses(self):
        """Converts a message with tool uses."""
        tool = ToolUse(id="t1", name="Grep", input={"pattern": "test"})
        msg = TranscriptMessage(
            uuid="msg-1",
            role="assistant",
            content="Searching...",
            timestamp="2025-01-01T00:00:00Z",
            tool_uses=[tool]
        )
        transcript = ParsedTranscript(session_id="sess-123", messages=[msg])
        result = transcript_to_dict(transcript)

        assert len(result["messages"][0]["tool_uses"]) == 1
        assert result["messages"][0]["tool_uses"][0]["name"] == "Grep"
        assert result["messages"][0]["tool_uses"][0]["input"] == {"pattern": "test"}

    def test_handles_none_usage(self):
        """Handles messages without token usage."""
        msg = TranscriptMessage(
            uuid="msg-1",
            role="user",
            content="Hello",
            timestamp="2025-01-01T00:00:00Z"
        )
        transcript = ParsedTranscript(session_id="sess-123", messages=[msg])
        result = transcript_to_dict(transcript)

        assert result["messages"][0]["usage"] is None

    def test_converts_message_with_tool_results(self):
        """Converts a message with tool results."""
        tool_result = ToolResult(
            tool_use_id="t1",
            content="File contents here",
            is_error=False
        )
        msg = TranscriptMessage(
            uuid="msg-1",
            role="user",
            content="",
            timestamp="2025-01-01T00:00:00Z",
            tool_results=[tool_result]
        )
        transcript = ParsedTranscript(session_id="sess-123", messages=[msg])
        result = transcript_to_dict(transcript)

        assert len(result["messages"][0]["tool_results"]) == 1
        assert result["messages"][0]["tool_results"][0]["tool_use_id"] == "t1"
        assert result["messages"][0]["tool_results"][0]["content"] == "File contents here"
        assert result["messages"][0]["tool_results"][0]["is_error"] is False

    def test_converts_message_with_error_tool_result(self):
        """Converts a message with an error tool result."""
        tool_result = ToolResult(
            tool_use_id="t2",
            content="Error: File not found",
            is_error=True
        )
        msg = TranscriptMessage(
            uuid="msg-2",
            role="user",
            content="",
            timestamp="2025-01-01T00:00:00Z",
            tool_results=[tool_result]
        )
        transcript = ParsedTranscript(session_id="sess-123", messages=[msg])
        result = transcript_to_dict(transcript)

        assert len(result["messages"][0]["tool_results"]) == 1
        assert result["messages"][0]["tool_results"][0]["tool_use_id"] == "t2"
        assert result["messages"][0]["tool_results"][0]["is_error"] is True

    def test_converts_message_with_multiple_tool_results(self):
        """Converts a message with multiple tool results."""
        results = [
            ToolResult(tool_use_id="t1", content="Result 1", is_error=False),
            ToolResult(tool_use_id="t2", content="Result 2", is_error=False),
            ToolResult(tool_use_id="t3", content="Error 3", is_error=True),
        ]
        msg = TranscriptMessage(
            uuid="msg-3",
            role="user",
            content="",
            timestamp="2025-01-01T00:00:00Z",
            tool_results=results
        )
        transcript = ParsedTranscript(session_id="sess-123", messages=[msg])
        result = transcript_to_dict(transcript)

        assert len(result["messages"][0]["tool_results"]) == 3
        assert result["messages"][0]["tool_results"][0]["tool_use_id"] == "t1"
        assert result["messages"][0]["tool_results"][1]["tool_use_id"] == "t2"
        assert result["messages"][0]["tool_results"][2]["tool_use_id"] == "t3"
        assert result["messages"][0]["tool_results"][2]["is_error"] is True

    def test_converts_message_with_empty_tool_results(self):
        """Converts a message with empty tool results list."""
        msg = TranscriptMessage(
            uuid="msg-4",
            role="assistant",
            content="Response text",
            timestamp="2025-01-01T00:00:00Z",
            tool_results=[]
        )
        transcript = ParsedTranscript(session_id="sess-123", messages=[msg])
        result = transcript_to_dict(transcript)

        assert result["messages"][0]["tool_results"] == []


class TestExtractAgentId:
    """Tests for extract_agent_id function."""

    def test_extracts_agent_id_from_text_block(self):
        """Extracts agent ID from a text content block."""
        content = [
            {
                "type": "text",
                "text": "Task completed successfully.\n\nagentId: a01393b (for resuming to continue this agent's work if needed)"
            }
        ]
        result = extract_agent_id(content)
        assert result == "a01393b"

    def test_extracts_agent_id_from_multiple_blocks(self):
        """Extracts agent ID when it appears in one of multiple blocks."""
        content = [
            {"type": "text", "text": "First block without agent ID"},
            {"type": "text", "text": "Second block with agentId: b2c4d5e here"},
            {"type": "text", "text": "Third block"}
        ]
        result = extract_agent_id(content)
        assert result == "b2c4d5e"

    def test_returns_none_for_empty_list(self):
        """Returns None when content list is empty."""
        result = extract_agent_id([])
        assert result is None

    def test_returns_none_when_no_agent_id(self):
        """Returns None when no agent ID is present."""
        content = [
            {"type": "text", "text": "Some output without any agent identifier"}
        ]
        result = extract_agent_id(content)
        assert result is None

    def test_returns_none_for_non_text_blocks(self):
        """Returns None when content only has non-text blocks."""
        content = [
            {"type": "image", "data": "base64data"},
            {"type": "tool_use", "id": "123"}
        ]
        result = extract_agent_id(content)
        assert result is None

    def test_returns_first_agent_id_found(self):
        """Returns the first agent ID if multiple are present."""
        content = [
            {"type": "text", "text": "First agentId: abc1234"},
            {"type": "text", "text": "Second agentId: def5678"}
        ]
        result = extract_agent_id(content)
        assert result == "abc1234"

    def test_handles_agent_id_with_extra_whitespace(self):
        """Handles agent ID with varying whitespace after colon."""
        content = [
            {"type": "text", "text": "agentId:   f1e2d3c"}
        ]
        result = extract_agent_id(content)
        assert result == "f1e2d3c"

    def test_handles_agent_id_at_start_of_text(self):
        """Handles agent ID at the start of text content."""
        content = [
            {"type": "text", "text": "agentId: 1234567 followed by other text"}
        ]
        result = extract_agent_id(content)
        assert result == "1234567"

    def test_handles_agent_id_at_end_of_text(self):
        """Handles agent ID at the end of text content."""
        content = [
            {"type": "text", "text": "Some text before agentId: 7654321"}
        ]
        result = extract_agent_id(content)
        assert result == "7654321"

    def test_ignores_malformed_agent_id_too_short(self):
        """Ignores agent IDs that are too short (less than 7 chars)."""
        content = [
            {"type": "text", "text": "agentId: abc12"}  # Only 5 chars
        ]
        result = extract_agent_id(content)
        assert result is None

    def test_ignores_malformed_agent_id_too_long(self):
        """Only captures exactly 7 hex characters."""
        content = [
            {"type": "text", "text": "agentId: abcdef123456"}  # Too long
        ]
        result = extract_agent_id(content)
        # Should match only the first 7 hex chars
        assert result == "abcdef1"

    def test_ignores_non_hex_characters(self):
        """Does not match agent IDs with non-hex characters."""
        content = [
            {"type": "text", "text": "agentId: ghijklm"}  # Not hex
        ]
        result = extract_agent_id(content)
        assert result is None

    def test_case_insensitive_hex(self):
        """Matches lowercase hex characters only (per the regex)."""
        content = [
            {"type": "text", "text": "agentId: ABCDEF1"}  # Uppercase
        ]
        result = extract_agent_id(content)
        # Current regex only matches lowercase, so this should return None
        assert result is None

    def test_handles_missing_text_key(self):
        """Handles text blocks missing the 'text' key gracefully."""
        content = [
            {"type": "text"}  # No 'text' key
        ]
        result = extract_agent_id(content)
        assert result is None

    def test_handles_none_text_value(self):
        """Handles text blocks with None text value gracefully."""
        content = [
            {"type": "text", "text": None}
        ]
        # Function should handle None text values without raising TypeError
        result = extract_agent_id(content)
        assert result is None

    def test_handles_non_dict_items_in_content(self):
        """Handles non-dict items in content list gracefully."""
        content = [
            "just a string",
            123,
            {"type": "text", "text": "agentId: 1234abc"}
        ]
        result = extract_agent_id(content)
        assert result == "1234abc"


class TestFindTranscriptFile:
    """Tests for find_transcript_file function."""

    def test_returns_none_when_claude_dir_missing(self, tmp_path, monkeypatch):
        """Returns None when ~/.claude/projects directory doesn't exist."""
        from app.services.transcript_parser import find_transcript_file

        # Set home to a directory without .claude/projects
        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = find_transcript_file("session-123", "/some/working/dir")
        assert result is None

    def test_finds_transcript_in_encoded_path(self, tmp_path, monkeypatch):
        """Finds transcript file using encoded path matching."""
        from app.services.transcript_parser import find_transcript_file

        # Create the directory structure
        claude_dir = tmp_path / ".claude" / "projects"
        encoded_path = "-home-user-projects-myapp"
        project_dir = claude_dir / encoded_path
        project_dir.mkdir(parents=True)

        # Create a transcript file
        transcript_file = project_dir / "session-abc.jsonl"
        transcript_file.write_text('{"type": "user"}\n')

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = find_transcript_file("session-abc", "/home/user/projects/myapp")
        assert result is not None
        assert result.name == "session-abc.jsonl"

    def test_finds_transcript_by_searching_all_dirs(self, tmp_path, monkeypatch):
        """Falls back to searching all project directories."""
        from app.services.transcript_parser import find_transcript_file

        # Create a transcript in a different encoded path
        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-different-encoded-path"
        project_dir.mkdir(parents=True)

        transcript_file = project_dir / "session-xyz.jsonl"
        transcript_file.write_text('{"type": "user"}\n')

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        # Use a working_dir that doesn't match the encoded path
        result = find_transcript_file("session-xyz", "/some/other/path")
        assert result is not None
        assert result.name == "session-xyz.jsonl"

    def test_returns_none_when_file_not_found(self, tmp_path, monkeypatch):
        """Returns None when transcript file doesn't exist."""
        from app.services.transcript_parser import find_transcript_file

        # Create the projects directory but no transcript file
        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-home-user-projects-myapp"
        project_dir.mkdir(parents=True)

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = find_transcript_file("nonexistent-session", "/home/user/projects/myapp")
        assert result is None


class TestParseTranscript:
    """Tests for parse_transcript function."""

    def test_returns_none_when_file_not_found(self, tmp_path, monkeypatch):
        """Returns None when transcript file doesn't exist."""
        from app.services.transcript_parser import parse_transcript

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("nonexistent", "/some/path")
        assert result is None

    def test_parses_empty_file(self, tmp_path, monkeypatch):
        """Parses an empty transcript file."""
        from app.services.transcript_parser import parse_transcript

        # Create the directory structure and empty file
        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript_file = project_dir / "session-empty.jsonl"
        transcript_file.write_text("")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-empty", "/test/project")
        assert result is not None
        assert result.session_id == "session-empty"
        assert result.messages == []

    def test_parses_user_message(self, tmp_path, monkeypatch):
        """Parses a simple user message."""
        from app.services.transcript_parser import parse_transcript
        import json

        # Create transcript file
        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-user.jsonl"
        transcript.write_text(json.dumps({
            "type": "user",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "message": {
                "role": "user",
                "content": "Hello, Claude!"
            }
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-user", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].role == "user"
        assert result.messages[0].content == "Hello, Claude!"
        assert result.messages[0].uuid == "msg-1"

    def test_parses_user_message_with_list_content(self, tmp_path, monkeypatch):
        """Parses user message with list-style content blocks."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-list.jsonl"
        transcript.write_text(json.dumps({
            "type": "user",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "message": {
                "role": "user",
                "content": [
                    {"type": "text", "text": "First part"},
                    {"type": "text", "text": "Second part"}
                ]
            }
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-list", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert "First part" in result.messages[0].content
        assert "Second part" in result.messages[0].content

    def test_parses_assistant_message_with_tool_uses(self, tmp_path, monkeypatch):
        """Parses assistant message with tool uses."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-tools.jsonl"
        transcript.write_text(json.dumps({
            "type": "assistant",
            "uuid": "msg-2",
            "timestamp": "2025-01-01T10:01:00Z",
            "message": {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Let me read that file."},
                    {"type": "tool_use", "id": "tool-1", "name": "Read", "input": {"file_path": "/test.py"}}
                ],
                "model": "claude-3-opus"
            }
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-tools", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].role == "assistant"
        assert result.messages[0].content == "Let me read that file."
        assert len(result.messages[0].tool_uses) == 1
        assert result.messages[0].tool_uses[0].name == "Read"
        assert result.messages[0].tool_uses[0].id == "tool-1"

    def test_parses_assistant_message_with_thinking(self, tmp_path, monkeypatch):
        """Parses assistant message with extended thinking."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-thinking.jsonl"
        transcript.write_text(json.dumps({
            "type": "assistant",
            "uuid": "msg-2",
            "timestamp": "2025-01-01T10:01:00Z",
            "message": {
                "role": "assistant",
                "content": [
                    {"type": "thinking", "thinking": "I should consider the options..."},
                    {"type": "text", "text": "Here is my response."}
                ]
            }
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-thinking", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].thinking == "I should consider the options..."
        assert result.messages[0].content == "Here is my response."

    def test_parses_summary_entry(self, tmp_path, monkeypatch):
        """Parses summary entry from transcript."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-summary.jsonl"
        lines = [
            json.dumps({"type": "summary", "summary": "Debugging session for login issue"}),
            json.dumps({
                "type": "user",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {"role": "user", "content": "Help me fix login"}
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-summary", "/test/project")
        assert result is not None
        assert result.summary == "Debugging session for login issue"

    def test_aggregates_token_usage(self, tmp_path, monkeypatch):
        """Aggregates token usage across all assistant messages."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-tokens.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "First response"}],
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": 50,
                        "cache_read_input_tokens": 10,
                        "cache_creation_input_tokens": 5
                    }
                }
            }),
            json.dumps({
                "type": "assistant",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:01:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Second response"}],
                    "usage": {
                        "input_tokens": 200,
                        "output_tokens": 75,
                        "cache_read_input_tokens": 20,
                        "cache_creation_input_tokens": 10
                    }
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-tokens", "/test/project")
        assert result is not None
        assert result.total_input_tokens == 300
        assert result.total_output_tokens == 125
        assert result.total_cache_read_tokens == 30
        assert result.total_cache_creation_tokens == 15

    def test_captures_time_range(self, tmp_path, monkeypatch):
        """Captures start and end times from messages."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-times.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T09:00:00Z",
                "message": {"role": "user", "content": "Start"}
            }),
            json.dumps({
                "type": "assistant",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T09:30:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "End"}]
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-times", "/test/project")
        assert result is not None
        assert result.start_time == "2025-01-01T09:00:00Z"
        assert result.end_time == "2025-01-01T09:30:00Z"

    def test_captures_metadata(self, tmp_path, monkeypatch):
        """Captures version and git branch metadata."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-meta.jsonl"
        transcript.write_text(json.dumps({
            "type": "user",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "version": "1.2.3",
            "gitBranch": "feature/new-stuff",
            "message": {"role": "user", "content": "Hello"}
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-meta", "/test/project")
        assert result is not None
        assert result.cli_version == "1.2.3"
        assert result.git_branch == "feature/new-stuff"

    def test_captures_primary_model(self, tmp_path, monkeypatch):
        """Captures the first model seen as primary model."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-model.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "First"}],
                    "model": "claude-3-opus-20240229"
                }
            }),
            json.dumps({
                "type": "assistant",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:01:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Second"}],
                    "model": "claude-3-sonnet-20240229"
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-model", "/test/project")
        assert result is not None
        assert result.model == "claude-3-opus-20240229"  # First model seen

    def test_skips_invalid_json_lines(self, tmp_path, monkeypatch):
        """Skips lines that aren't valid JSON."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-invalid.jsonl"
        lines = [
            "not valid json",
            json.dumps({
                "type": "user",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {"role": "user", "content": "Valid message"}
            }),
            "{truncated json...",
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-invalid", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].content == "Valid message"

    def test_skips_empty_lines(self, tmp_path, monkeypatch):
        """Skips empty lines in the transcript."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-empty-lines.jsonl"
        lines = [
            "",
            "   ",
            json.dumps({
                "type": "user",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {"role": "user", "content": "Message after blanks"}
            }),
            "",
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-empty-lines", "/test/project")
        assert result is not None
        assert len(result.messages) == 1

    def test_skips_whitespace_only_user_messages(self, tmp_path, monkeypatch):
        """Skips user messages that only contain whitespace."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-ws.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {"role": "user", "content": "   "}
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:01:00Z",
                "message": {"role": "user", "content": "Real content"}
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-ws", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].content == "Real content"

    def test_links_spawned_agent_to_tool_use(self, tmp_path, monkeypatch):
        """Links spawned agent ID from tool result to the tool use."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-agent.jsonl"
        lines = [
            # Assistant uses Task tool
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "Let me search for that."},
                        {"type": "tool_use", "id": "task-123", "name": "Task", "input": {"prompt": "search"}}
                    ]
                }
            }),
            # User message with tool result containing agentId
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:01:00Z",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "task-123",
                            "content": [
                                {"type": "text", "text": "Search complete.\n\nagentId: abc1234 (for resuming)"}
                            ]
                        }
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-agent", "/test/project")
        assert result is not None
        assert len(result.messages) == 1  # Only assistant message (tool result is internal)
        assert result.messages[0].tool_uses[0].spawned_agent_id == "abc1234"

    def test_handles_user_message_string_content(self, tmp_path, monkeypatch):
        """Handles user message where content is a plain string."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-str.jsonl"
        transcript.write_text(json.dumps({
            "type": "user",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "message": {
                "role": "user",
                "content": "Just a plain string"  # String instead of list
            }
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-str", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].content == "Just a plain string"

    def test_ignores_non_message_entry_types(self, tmp_path, monkeypatch):
        """Ignores entry types that aren't user/assistant/summary."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-misc.jsonl"
        lines = [
            json.dumps({"type": "init", "version": "1.0"}),
            json.dumps({"type": "config", "settings": {}}),
            json.dumps({
                "type": "user",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {"role": "user", "content": "Actual message"}
            }),
            json.dumps({"type": "result", "status": "done"}),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-misc", "/test/project")
        assert result is not None
        assert len(result.messages) == 1

    def test_parses_tool_result_with_image_only(self, tmp_path, monkeypatch):
        """Parses tool result containing only an image."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-img.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "read-123",
                            "name": "Read",
                            "input": {"file_path": "/test/image.png"}
                        }
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "read-123",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/png",
                                        "data": "iVBORw0KGgo="
                                    }
                                }
                            ]
                        }
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-img", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].tool_uses[0].result == "data:image/png;base64,iVBORw0KGgo="

    def test_parses_tool_result_with_text_and_image(self, tmp_path, monkeypatch):
        """Parses tool result containing both text and image - preserves both."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-mixed.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "read-456",
                            "name": "Read",
                            "input": {"file_path": "/test/image.png"}
                        }
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "read-456",
                            "content": [
                                {"type": "text", "text": "Image metadata: 800x600 PNG"},
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/png",
                                        "data": "iVBORw0KGgo="
                                    }
                                }
                            ]
                        }
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-mixed", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        # Both text and image should be preserved
        tool_result = result.messages[0].tool_uses[0].result
        assert "Image metadata: 800x600 PNG" in tool_result
        assert "data:image/png;base64,iVBORw0KGgo=" in tool_result

    def test_parses_tool_result_with_multiple_text_and_image(self, tmp_path, monkeypatch):
        """Parses tool result with multiple text blocks and an image."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-multi.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "read-789",
                            "name": "Read",
                            "input": {"file_path": "/test/image.png"}
                        }
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "read-789",
                            "content": [
                                {"type": "text", "text": "File: image.png"},
                                {"type": "text", "text": "Size: 800x600"},
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/jpeg",
                                        "data": "/9j/4AAQ="
                                    }
                                }
                            ]
                        }
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-multi", "/test/project")
        assert result is not None
        tool_result = result.messages[0].tool_uses[0].result
        # All text blocks should be combined
        assert "File: image.png" in tool_result
        assert "Size: 800x600" in tool_result
        # Image should also be present
        assert "data:image/jpeg;base64,/9j/4AAQ=" in tool_result


class TestTranscriptToDictComplete:
    """Additional tests for transcript_to_dict edge cases."""

    def test_converts_message_with_spawned_agent_id(self):
        """Converts tool use with spawned_agent_id correctly."""
        tool = ToolUse(id="t1", name="Task", input={"prompt": "search"}, spawned_agent_id="abc1234")
        msg = TranscriptMessage(
            uuid="msg-1",
            role="assistant",
            content="Searching...",
            timestamp="2025-01-01T00:00:00Z",
            tool_uses=[tool]
        )
        transcript = ParsedTranscript(session_id="sess-123", messages=[msg])
        result = transcript_to_dict(transcript)

        assert result["messages"][0]["tool_uses"][0]["spawned_agent_id"] == "abc1234"

    def test_converts_message_with_thinking(self):
        """Converts message with thinking content."""
        msg = TranscriptMessage(
            uuid="msg-1",
            role="assistant",
            content="Response",
            timestamp="2025-01-01T00:00:00Z",
            thinking="Let me think about this..."
        )
        transcript = ParsedTranscript(session_id="sess-123", messages=[msg])
        result = transcript_to_dict(transcript)

        assert result["messages"][0]["thinking"] == "Let me think about this..."

    def test_converts_all_metadata_fields(self):
        """Converts all metadata fields correctly."""
        transcript = ParsedTranscript(
            session_id="sess-123",
            messages=[],
            summary="A test session",
            model="claude-3-opus",
            total_input_tokens=1000,
            total_output_tokens=500,
            total_cache_read_tokens=100,
            total_cache_creation_tokens=50,
            start_time="2025-01-01T00:00:00Z",
            end_time="2025-01-01T01:00:00Z",
            cli_version="1.2.3",
            git_branch="main"
        )
        result = transcript_to_dict(transcript)

        assert result["summary"] == "A test session"
        assert result["model"] == "claude-3-opus"
        assert result["total_input_tokens"] == 1000
        assert result["total_output_tokens"] == 500
        assert result["total_cache_read_tokens"] == 100
        assert result["total_cache_creation_tokens"] == 50
        assert result["start_time"] == "2025-01-01T00:00:00Z"
        assert result["end_time"] == "2025-01-01T01:00:00Z"
        assert result["cli_version"] == "1.2.3"
        assert result["git_branch"] == "main"


# ==========================================
# Gemini Transcript Parsing Tests
# ==========================================

class TestParseGeminiTranscript:
    """Tests for parsing Gemini CLI JSON transcripts."""

    def test_parses_empty_gemini_session(self, tmp_path, monkeypatch):
        """Parses an empty Gemini session file."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        # Create Gemini session structure
        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-empty.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-empty",
            "messages": [],
            "startTime": "2025-01-01T10:00:00Z"
        }))

        result = parse_transcript_file(session_file, "session-empty", cli_type=CLIType.GEMINI.value)
        assert result is not None
        assert result.session_id == "session-empty"
        assert result.messages == []

    def test_parses_gemini_user_message(self, tmp_path):
        """Parses Gemini user messages."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-user.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-user",
            "messages": [
                {
                    "type": "user",
                    "content": "Hello, Gemini!",
                    "timestamp": "2025-01-01T10:00:00Z"
                }
            ],
            "startTime": "2025-01-01T10:00:00Z"
        }))

        result = parse_transcript_file(session_file, "session-user", cli_type=CLIType.GEMINI.value)
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].role == "user"
        assert result.messages[0].content == "Hello, Gemini!"

    def test_parses_gemini_assistant_message(self, tmp_path):
        """Parses Gemini assistant messages (type='gemini')."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-assistant.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-assistant",
            "messages": [
                {
                    "type": "gemini",
                    "content": [{"type": "text", "text": "Hello! How can I help?"}],
                    "model": "gemini-2.0-flash",
                    "timestamp": "2025-01-01T10:00:00Z"
                }
            ],
            "startTime": "2025-01-01T10:00:00Z"
        }))

        result = parse_transcript_file(session_file, "session-assistant", cli_type=CLIType.GEMINI.value)
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].role == "assistant"
        assert "Hello! How can I help?" in result.messages[0].content
        assert result.model == "gemini-2.0-flash"

    def test_parses_gemini_function_calls(self, tmp_path):
        """Parses Gemini function calls (tool uses)."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-tools.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-tools",
            "messages": [
                {
                    "type": "gemini",
                    "content": [
                        {"type": "text", "text": "Let me read that file."},
                        {
                            "type": "functionCall",
                            "id": "call-123",
                            "name": "read_file",
                            "args": {"path": "/test.py"}
                        }
                    ],
                    "model": "gemini-2.0-flash",
                    "timestamp": "2025-01-01T10:00:00Z"
                }
            ],
            "startTime": "2025-01-01T10:00:00Z"
        }))

        result = parse_transcript_file(session_file, "session-tools", cli_type=CLIType.GEMINI.value)
        assert result is not None
        assert len(result.messages) == 1
        assert len(result.messages[0].tool_uses) == 1
        assert result.messages[0].tool_uses[0].name == "read_file"
        assert result.messages[0].tool_uses[0].input == {"path": "/test.py"}

    def test_parses_gemini_summary(self, tmp_path):
        """Parses Gemini session summary."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-summary.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-summary",
            "summary": "Debugging a Python script",
            "messages": [
                {
                    "type": "user",
                    "content": "Help me fix this bug",
                    "timestamp": "2025-01-01T10:00:00Z"
                }
            ],
            "startTime": "2025-01-01T10:00:00Z"
        }))

        result = parse_transcript_file(session_file, "session-summary", cli_type=CLIType.GEMINI.value)
        assert result is not None
        assert result.summary == "Debugging a Python script"

    def test_parses_gemini_timestamps(self, tmp_path):
        """Parses Gemini session timestamps."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-times.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-times",
            "startTime": "2025-01-01T10:00:00Z",
            "lastUpdated": "2025-01-01T11:30:00Z",
            "messages": []
        }))

        result = parse_transcript_file(session_file, "session-times", cli_type=CLIType.GEMINI.value)
        assert result is not None
        assert result.start_time == "2025-01-01T10:00:00Z"
        assert result.end_time == "2025-01-01T11:30:00Z"


# ==========================================
# Codex Transcript Parsing Tests
# ==========================================

class TestParseCodexTranscript:
    """Tests for parsing Codex CLI JSONL transcripts."""

    def test_parses_empty_codex_session(self, tmp_path):
        """Parses an empty Codex session file."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-empty.jsonl"
        session_file.write_text(json.dumps({
            "type": "session_meta",
            "payload": {"timestamp": "2025-01-15T10:00:00Z"}
        }) + "\n")

        result = parse_transcript_file(session_file, "session-empty", cli_type=CLIType.CODEX.value)
        assert result is not None
        assert result.session_id == "session-empty"
        assert result.messages == []

    def test_parses_codex_user_message(self, tmp_path):
        """Parses Codex user messages (skipping environment context)."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-user.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            # First user message is environment context (skipped)
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:00Z",
                "payload": {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "<environment_context>...</environment_context>"}]
                }
            }),
            # Real user message
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:01Z",
                "payload": {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Hello, Codex!"}]
                }
            })
        ]
        session_file.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(session_file, "session-user", cli_type=CLIType.CODEX.value)
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].role == "user"
        assert "Hello, Codex!" in result.messages[0].content

    def test_parses_codex_assistant_message(self, tmp_path):
        """Parses Codex assistant messages."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-assistant.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:01Z",
                "payload": {
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "I can help with that!"}]
                }
            }),
            json.dumps({
                "type": "turn_context",
                "payload": {"model": "o3-mini"}
            })
        ]
        session_file.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(session_file, "session-assistant", cli_type=CLIType.CODEX.value)
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].role == "assistant"
        assert "I can help with that!" in result.messages[0].content
        assert result.model == "o3-mini"

    def test_parses_codex_function_calls(self, tmp_path):
        """Parses Codex function calls (tool uses)."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-tools.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:01Z",
                "payload": {
                    "role": "assistant",
                    "content": [
                        {"type": "output_text", "text": "Let me read the file."},
                        {
                            "type": "function_call",
                            "id": "call-456",
                            "name": "shell",
                            "arguments": "{\"command\": \"cat /test.py\"}"
                        }
                    ]
                }
            })
        ]
        session_file.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(session_file, "session-tools", cli_type=CLIType.CODEX.value)
        assert result is not None
        assert len(result.messages) == 1
        assert len(result.messages[0].tool_uses) == 1
        assert result.messages[0].tool_uses[0].name == "shell"

    def test_parses_codex_session_meta(self, tmp_path):
        """Parses Codex session metadata."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-meta.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {
                    "timestamp": "2025-01-15T10:00:00Z",
                    "cwd": "/home/user/project",
                    "codexVersion": "0.5.0"
                }
            })
        ]
        session_file.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(session_file, "session-meta", cli_type=CLIType.CODEX.value)
        assert result is not None
        assert result.start_time == "2025-01-15T10:00:00Z"

    def test_skips_codex_environment_context(self, tmp_path):
        """Skips Codex environment context messages."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-env.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            # Environment context (should be skipped for title extraction)
            json.dumps({
                "type": "response_item",
                "payload": {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "<environment_context>...</environment_context>"}]
                }
            }),
            # Real user message
            json.dumps({
                "type": "response_item",
                "payload": {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Help me with this code"}]
                }
            })
        ]
        session_file.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(session_file, "session-env", cli_type=CLIType.CODEX.value)
        assert result is not None
        # Should have both messages (we parse all, title extraction skips env context)
        assert len(result.messages) >= 1

    def test_handles_codex_multiple_turns(self, tmp_path):
        """Parses Codex session with multiple conversation turns."""
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-multi.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            # Environment context (first user message, skipped)
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:00Z",
                "payload": {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "<environment_context>...</environment_context>"}]
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:01Z",
                "payload": {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "First message"}]
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:02Z",
                "payload": {
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "First response"}]
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:03Z",
                "payload": {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Second message"}]
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:04Z",
                "payload": {
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "Second response"}]
                }
            })
        ]
        session_file.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(session_file, "session-multi", cli_type=CLIType.CODEX.value)
        assert result is not None
        assert len(result.messages) == 4
        assert result.messages[0].role == "user"
        assert result.messages[1].role == "assistant"
        assert result.messages[2].role == "user"
        assert result.messages[3].role == "assistant"


# ==========================================
# _find_tool_use_by_id Tests
# ==========================================

class TestFindToolUseById:
    """Tests for the _find_tool_use_by_id helper function."""

    def test_finds_tool_use_in_single_message(self):
        """Finds a tool use in a single assistant message."""
        from app.services.transcript_parser import _find_tool_use_by_id, TranscriptMessage, ToolUse

        tool = ToolUse(id="tool-123", name="Read", input={"file": "test.py"})
        messages = [
            TranscriptMessage(
                uuid="msg-1",
                role="assistant",
                content="Let me read that.",
                timestamp="2025-01-01T10:00:00Z",
                tool_uses=[tool],
            )
        ]

        result = _find_tool_use_by_id(messages, "tool-123")

        assert result is not None
        assert result.id == "tool-123"
        assert result.name == "Read"

    def test_finds_tool_use_in_multiple_messages(self):
        """Finds a tool use across multiple assistant messages."""
        from app.services.transcript_parser import _find_tool_use_by_id, TranscriptMessage, ToolUse

        tool1 = ToolUse(id="tool-1", name="Read", input={})
        tool2 = ToolUse(id="tool-2", name="Write", input={})
        messages = [
            TranscriptMessage(
                uuid="msg-1",
                role="assistant",
                content="First",
                timestamp="2025-01-01T10:00:00Z",
                tool_uses=[tool1],
            ),
            TranscriptMessage(
                uuid="msg-2",
                role="user",
                content="User input",
                timestamp="2025-01-01T10:01:00Z",
            ),
            TranscriptMessage(
                uuid="msg-3",
                role="assistant",
                content="Second",
                timestamp="2025-01-01T10:02:00Z",
                tool_uses=[tool2],
            ),
        ]

        result = _find_tool_use_by_id(messages, "tool-1")

        assert result is not None
        assert result.id == "tool-1"
        assert result.name == "Read"

    def test_finds_most_recent_tool_use(self):
        """When searching backwards, finds the most recent matching tool use."""
        from app.services.transcript_parser import _find_tool_use_by_id, TranscriptMessage, ToolUse

        # Same ID in two different messages - should find the later one (due to reverse search)
        tool1 = ToolUse(id="same-id", name="First", input={})
        tool2 = ToolUse(id="same-id", name="Second", input={})
        messages = [
            TranscriptMessage(
                uuid="msg-1",
                role="assistant",
                content="First",
                timestamp="2025-01-01T10:00:00Z",
                tool_uses=[tool1],
            ),
            TranscriptMessage(
                uuid="msg-2",
                role="assistant",
                content="Second",
                timestamp="2025-01-01T10:01:00Z",
                tool_uses=[tool2],
            ),
        ]

        result = _find_tool_use_by_id(messages, "same-id")

        assert result is not None
        # Should find the second one (most recent) due to reverse iteration
        assert result.name == "Second"

    def test_returns_none_when_not_found(self):
        """Returns None when tool use ID is not found."""
        from app.services.transcript_parser import _find_tool_use_by_id, TranscriptMessage, ToolUse

        tool = ToolUse(id="existing-id", name="Read", input={})
        messages = [
            TranscriptMessage(
                uuid="msg-1",
                role="assistant",
                content="Message",
                timestamp="2025-01-01T10:00:00Z",
                tool_uses=[tool],
            )
        ]

        result = _find_tool_use_by_id(messages, "nonexistent-id")

        assert result is None

    def test_returns_none_for_empty_messages(self):
        """Returns None when message list is empty."""
        from app.services.transcript_parser import _find_tool_use_by_id

        result = _find_tool_use_by_id([], "any-id")

        assert result is None

    def test_skips_user_messages(self):
        """Only searches assistant messages, skipping user messages."""
        from app.services.transcript_parser import _find_tool_use_by_id, TranscriptMessage, ToolUse

        # Tool use in user message should not be found
        tool = ToolUse(id="tool-in-user-msg", name="Read", input={})
        messages = [
            TranscriptMessage(
                uuid="msg-1",
                role="user",
                content="User",
                timestamp="2025-01-01T10:00:00Z",
                tool_uses=[tool],  # Even if tool_uses is populated, user messages are skipped
            )
        ]

        result = _find_tool_use_by_id(messages, "tool-in-user-msg")

        assert result is None

    def test_finds_tool_use_among_multiple_tools_in_one_message(self):
        """Finds correct tool when message has multiple tool uses."""
        from app.services.transcript_parser import _find_tool_use_by_id, TranscriptMessage, ToolUse

        tool1 = ToolUse(id="first", name="Read", input={})
        tool2 = ToolUse(id="second", name="Write", input={})
        tool3 = ToolUse(id="third", name="Bash", input={})
        messages = [
            TranscriptMessage(
                uuid="msg-1",
                role="assistant",
                content="Multiple tools",
                timestamp="2025-01-01T10:00:00Z",
                tool_uses=[tool1, tool2, tool3],
            )
        ]

        result = _find_tool_use_by_id(messages, "second")

        assert result is not None
        assert result.id == "second"
        assert result.name == "Write"

    def test_handles_messages_with_no_tool_uses(self):
        """Handles messages that have empty tool_uses list."""
        from app.services.transcript_parser import _find_tool_use_by_id, TranscriptMessage, ToolUse

        tool = ToolUse(id="target", name="Read", input={})
        messages = [
            TranscriptMessage(
                uuid="msg-1",
                role="assistant",
                content="No tools",
                timestamp="2025-01-01T10:00:00Z",
                tool_uses=[],
            ),
            TranscriptMessage(
                uuid="msg-2",
                role="assistant",
                content="Has tools",
                timestamp="2025-01-01T10:01:00Z",
                tool_uses=[tool],
            ),
        ]

        result = _find_tool_use_by_id(messages, "target")

        assert result is not None
        assert result.id == "target"


# ==========================================
# Tool Result Linking Tests
# ==========================================

class TestToolResultLinking:
    """Tests for linking tool results to tool uses during transcript parsing."""

    def test_links_text_result_to_tool_use(self, tmp_path, monkeypatch):
        """Links a text tool result to its corresponding tool use."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-link.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "Reading file..."},
                        {"type": "tool_use", "id": "read-1", "name": "Read", "input": {"path": "/test.py"}}
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "read-1",
                            "content": [{"type": "text", "text": "def hello(): pass"}]
                        }
                    ]
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-link", "/test/project")

        assert result is not None
        assert len(result.messages) == 1  # Only assistant message
        assert result.messages[0].tool_uses[0].result == "def hello(): pass"
        assert result.messages[0].tool_uses[0].result_is_error is False

    def test_links_error_result_to_tool_use(self, tmp_path, monkeypatch):
        """Links an error tool result to its corresponding tool use."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-error.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": "read-err", "name": "Read", "input": {"path": "/nonexistent"}}
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "read-err",
                            "is_error": True,
                            "content": [{"type": "text", "text": "Error: File not found"}]
                        }
                    ]
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-error", "/test/project")

        assert result is not None
        assert result.messages[0].tool_uses[0].result == "Error: File not found"
        assert result.messages[0].tool_uses[0].result_is_error is True

    def test_links_multiple_results_to_multiple_tools(self, tmp_path, monkeypatch):
        """Links multiple tool results to their corresponding tool uses."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-multi-tools.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": "tool-a", "name": "Read", "input": {}},
                        {"type": "tool_use", "id": "tool-b", "name": "Grep", "input": {}},
                        {"type": "tool_use", "id": "tool-c", "name": "Bash", "input": {}}
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": "tool-a", "content": [{"type": "text", "text": "Result A"}]},
                        {"type": "tool_result", "tool_use_id": "tool-b", "content": [{"type": "text", "text": "Result B"}]},
                        {"type": "tool_result", "tool_use_id": "tool-c", "is_error": True, "content": [{"type": "text", "text": "Error C"}]}
                    ]
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-multi-tools", "/test/project")

        assert result is not None
        tools = result.messages[0].tool_uses
        assert len(tools) == 3
        assert tools[0].result == "Result A"
        assert tools[0].result_is_error is False
        assert tools[1].result == "Result B"
        assert tools[1].result_is_error is False
        assert tools[2].result == "Error C"
        assert tools[2].result_is_error is True

    def test_links_string_result_content(self, tmp_path, monkeypatch):
        """Links tool result when content is a string instead of list."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-str-result.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": "tool-str", "name": "Bash", "input": {}}
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": "tool-str", "content": "Plain string result"}
                    ]
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-str-result", "/test/project")

        assert result is not None
        assert result.messages[0].tool_uses[0].result == "Plain string result"

    def test_unmatched_tool_result_does_not_crash(self, tmp_path, monkeypatch):
        """Tool result with non-matching ID is handled gracefully."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-unmatched.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": "real-id", "name": "Read", "input": {}}
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": "wrong-id", "content": [{"type": "text", "text": "Orphan result"}]}
                    ]
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-unmatched", "/test/project")

        assert result is not None
        # Tool use should not have result populated since IDs don't match
        assert result.messages[0].tool_uses[0].result is None

    def test_tool_result_without_tool_use_id(self, tmp_path, monkeypatch):
        """Tool result without tool_use_id is handled gracefully."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-no-id.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": "some-id", "name": "Read", "input": {}}
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "content": [{"type": "text", "text": "Result without ID"}]}
                    ]
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-no-id", "/test/project")

        assert result is not None
        # Should not crash, tool use result remains None
        assert result.messages[0].tool_uses[0].result is None

    def test_links_result_across_multiple_turns(self, tmp_path, monkeypatch):
        """Links tool result to tool use from earlier conversation turn."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-turns.jsonl"
        lines = [
            # First turn: assistant uses tool
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "Let me read that."},
                        {"type": "tool_use", "id": "earlier-tool", "name": "Read", "input": {}}
                    ]
                }
            }),
            # First turn: tool result
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": "earlier-tool", "content": [{"type": "text", "text": "File contents"}]}
                    ]
                }
            }),
            # Second turn: user asks follow-up
            json.dumps({
                "type": "user",
                "uuid": "msg-3",
                "timestamp": "2025-01-01T10:01:00Z",
                "message": {
                    "role": "user",
                    "content": "Can you modify it?"
                }
            }),
            # Second turn: assistant responds
            json.dumps({
                "type": "assistant",
                "uuid": "msg-4",
                "timestamp": "2025-01-01T10:01:01Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Sure, I'll edit it."}]
                }
            })
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-turns", "/test/project")

        assert result is not None
        # Find the assistant message with tool uses
        assistant_msg_with_tools = [m for m in result.messages if m.tool_uses]
        assert len(assistant_msg_with_tools) == 1
        assert assistant_msg_with_tools[0].tool_uses[0].result == "File contents"


# ==========================================
# ToolUse Dataclass Tests
# ==========================================

class TestToolUseDataclass:
    """Additional tests for ToolUse dataclass."""

    def test_default_values(self):
        """Test ToolUse default values."""
        from app.services.transcript_parser import ToolUse

        tool = ToolUse(id="test", name="Read", input={})

        assert tool.id == "test"
        assert tool.name == "Read"
        assert tool.input == {}
        assert tool.spawned_agent_id is None
        assert tool.result is None
        assert tool.result_is_error is False

    def test_with_all_fields(self):
        """Test ToolUse with all fields populated."""
        from app.services.transcript_parser import ToolUse

        tool = ToolUse(
            id="full-tool",
            name="Task",
            input={"prompt": "search for files"},
            spawned_agent_id="abc1234",
            result="Found 5 files",
            result_is_error=False,
        )

        assert tool.id == "full-tool"
        assert tool.name == "Task"
        assert tool.input == {"prompt": "search for files"}
        assert tool.spawned_agent_id == "abc1234"
        assert tool.result == "Found 5 files"
        assert tool.result_is_error is False

    def test_error_result(self):
        """Test ToolUse with error result."""
        from app.services.transcript_parser import ToolUse

        tool = ToolUse(
            id="err-tool",
            name="Bash",
            input={"command": "rm -rf /"},
            result="Permission denied",
            result_is_error=True,
        )

        assert tool.result == "Permission denied"
        assert tool.result_is_error is True

    def test_empty_result_string(self):
        """Test ToolUse with empty string result (not None)."""
        from app.services.transcript_parser import ToolUse

        tool = ToolUse(
            id="empty-tool",
            name="Bash",
            input={},
            result="",
            result_is_error=False,
        )

        assert tool.result == ""
        assert tool.result_is_error is False


class TestParseClaudeTranscriptNoneHandling:
    """Tests for None value handling in _parse_claude_transcript.

    These tests verify that the parser correctly handles edge cases where
    JSON keys exist but have None values instead of expected dictionaries.
    This is important because `dict.get('key', {})` returns None (not {})
    when the key exists with value None.
    """

    def test_handles_none_message_value(self, tmp_path, monkeypatch):
        """Parser handles entry where 'message' key exists but value is None."""
        from app.services.transcript_parser import parse_transcript
        import json

        # Create the directory structure
        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        # Create transcript with None message value
        transcript = project_dir / "session-none-msg.jsonl"
        transcript.write_text(json.dumps({
            "type": "user",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "message": None  # Key exists but value is None
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        # Should not raise AttributeError
        result = parse_transcript("session-none-msg", "/test/project")
        assert result is not None
        assert result.session_id == "session-none-msg"
        # Message with None content should be skipped (no text content)
        assert len(result.messages) == 0

    def test_handles_none_message_with_valid_messages(self, tmp_path, monkeypatch):
        """Parser handles mix of None message and valid messages."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-mixed-none.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": None  # None message
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:01:00Z",
                "message": {
                    "role": "user",
                    "content": "Valid message"
                }
            }),
            json.dumps({
                "type": "assistant",
                "uuid": "msg-3",
                "timestamp": "2025-01-01T10:02:00Z",
                "message": None  # Another None message
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-mixed-none", "/test/project")
        assert result is not None
        # Only the valid message should be parsed
        assert len(result.messages) == 1
        assert result.messages[0].content == "Valid message"

    def test_handles_none_usage_value(self, tmp_path, monkeypatch):
        """Parser handles entry where 'usage' key exists but value is None."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-none-usage.jsonl"
        transcript.write_text(json.dumps({
            "type": "assistant",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "Hello!"}],
                "usage": None  # Key exists but value is None
            }
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        # Should not raise any errors
        result = parse_transcript("session-none-usage", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].content == "Hello!"
        # Usage should be None when the value is None
        assert result.messages[0].usage is None
        # Total tokens should still be 0
        assert result.total_input_tokens == 0
        assert result.total_output_tokens == 0

    def test_handles_none_usage_with_valid_usage(self, tmp_path, monkeypatch):
        """Parser handles mix of None usage and valid usage values."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-mixed-usage.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "First response"}],
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": 50
                    }
                }
            }),
            json.dumps({
                "type": "assistant",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:01:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Second response"}],
                    "usage": None  # None usage
                }
            }),
            json.dumps({
                "type": "assistant",
                "uuid": "msg-3",
                "timestamp": "2025-01-01T10:02:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Third response"}],
                    "usage": {
                        "input_tokens": 80,
                        "output_tokens": 40
                    }
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-mixed-usage", "/test/project")
        assert result is not None
        assert len(result.messages) == 3

        # First message has usage
        assert result.messages[0].usage is not None
        assert result.messages[0].usage.input_tokens == 100

        # Second message has None usage
        assert result.messages[1].usage is None

        # Third message has usage
        assert result.messages[2].usage is not None
        assert result.messages[2].usage.input_tokens == 80

        # Total should only count valid usage values
        assert result.total_input_tokens == 180
        assert result.total_output_tokens == 90

    def test_handles_empty_message_dict(self, tmp_path, monkeypatch):
        """Parser handles entry where 'message' is an empty dict."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-empty-dict.jsonl"
        transcript.write_text(json.dumps({
            "type": "user",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "message": {}  # Empty dict
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-empty-dict", "/test/project")
        assert result is not None
        # Empty dict means no content, so message should be skipped
        assert len(result.messages) == 0

    def test_handles_missing_message_key(self, tmp_path, monkeypatch):
        """Parser handles entry where 'message' key is missing entirely."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-no-message.jsonl"
        transcript.write_text(json.dumps({
            "type": "user",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z"
            # 'message' key is missing entirely
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-no-message", "/test/project")
        assert result is not None
        # Missing message key means no content
        assert len(result.messages) == 0


class TestClaudeParserNoneUsageValues:
    """Tests for Claude parser handling None values in usage fields.

    When usage data has keys with null values (e.g., "input_tokens": null),
    dict.get('input_tokens', 0) returns None (not 0). The parser must
    handle this to avoid TypeError when doing arithmetic.
    """

    def test_handles_none_input_tokens(self, tmp_path, monkeypatch):
        """Parser handles null input_tokens in usage data."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-null-input.jsonl"
        transcript.write_text(json.dumps({
            "type": "assistant",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "Hello"}],
                "usage": {
                    "input_tokens": None,
                    "output_tokens": 50
                }
            }
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-null-input", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].usage is not None
        assert result.messages[0].usage.input_tokens == 0
        assert result.messages[0].usage.output_tokens == 50

    def test_handles_none_output_tokens(self, tmp_path, monkeypatch):
        """Parser handles null output_tokens in usage data."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-null-output.jsonl"
        transcript.write_text(json.dumps({
            "type": "assistant",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "Hello"}],
                "usage": {
                    "input_tokens": 100,
                    "output_tokens": None
                }
            }
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-null-output", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].usage is not None
        assert result.messages[0].usage.input_tokens == 100
        assert result.messages[0].usage.output_tokens == 0

    def test_handles_all_none_usage_values(self, tmp_path, monkeypatch):
        """Parser handles all null values in usage data."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-all-null.jsonl"
        transcript.write_text(json.dumps({
            "type": "assistant",
            "uuid": "msg-1",
            "timestamp": "2025-01-01T10:00:00Z",
            "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "Hello"}],
                "usage": {
                    "input_tokens": None,
                    "output_tokens": None,
                    "cache_read_input_tokens": None,
                    "cache_creation_input_tokens": None
                }
            }
        }) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-all-null", "/test/project")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].usage is not None
        assert result.messages[0].usage.input_tokens == 0
        assert result.messages[0].usage.output_tokens == 0
        assert result.messages[0].usage.cache_read_tokens == 0
        assert result.messages[0].usage.cache_creation_tokens == 0
        # Totals should also be correct
        assert result.total_input_tokens == 0
        assert result.total_output_tokens == 0

    def test_handles_mixed_none_and_valid_usage(self, tmp_path, monkeypatch):
        """Parser handles mix of null and valid values in usage data."""
        from app.services.transcript_parser import parse_transcript
        import json

        claude_dir = tmp_path / ".claude" / "projects"
        project_dir = claude_dir / "-test-project"
        project_dir.mkdir(parents=True)

        transcript = project_dir / "session-mixed.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "First"}],
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": None
                    }
                }
            }),
            json.dumps({
                "type": "assistant",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:01:00Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Second"}],
                    "usage": {
                        "input_tokens": None,
                        "output_tokens": 75
                    }
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        monkeypatch.setattr('pathlib.Path.home', lambda: tmp_path)

        result = parse_transcript("session-mixed", "/test/project")
        assert result is not None
        assert len(result.messages) == 2
        # First message: 100 input, 0 output
        assert result.messages[0].usage.input_tokens == 100
        assert result.messages[0].usage.output_tokens == 0
        # Second message: 0 input, 75 output
        assert result.messages[1].usage.input_tokens == 0
        assert result.messages[1].usage.output_tokens == 75
        # Totals should be accumulated correctly
        assert result.total_input_tokens == 100
        assert result.total_output_tokens == 75


class TestGeminiParserNoneUsageValues:
    """Tests for Gemini parser handling None values in usage fields."""

    def test_handles_none_token_counts(self, tmp_path):
        """Parser handles null token counts in Gemini usage data."""
        from app.services.transcript_parser import parse_transcript_file
        import json

        transcript = tmp_path / "session.json"
        transcript.write_text(json.dumps({
            "summary": "Test session",
            "startTime": "2025-01-01T10:00:00Z",
            "messages": [
                {
                    "id": "msg-1",
                    "type": "gemini",
                    "timestamp": "2025-01-01T10:00:00Z",
                    "content": "Hello",
                    "usage": {
                        "promptTokenCount": None,
                        "candidatesTokenCount": None
                    }
                }
            ]
        }))

        result = parse_transcript_file(transcript, "session-test", cli_type="gemini")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].usage is not None
        assert result.messages[0].usage.input_tokens == 0
        assert result.messages[0].usage.output_tokens == 0
        assert result.total_input_tokens == 0
        assert result.total_output_tokens == 0

    def test_handles_fallback_to_alternative_keys(self, tmp_path):
        """Parser uses alternative keys when primary ones are null."""
        from app.services.transcript_parser import parse_transcript_file
        import json

        transcript = tmp_path / "session.json"
        transcript.write_text(json.dumps({
            "summary": "Test session",
            "startTime": "2025-01-01T10:00:00Z",
            "messages": [
                {
                    "id": "msg-1",
                    "type": "gemini",
                    "timestamp": "2025-01-01T10:00:00Z",
                    "content": "Hello",
                    "usage": {
                        "promptTokenCount": None,
                        "input_tokens": 150,
                        "candidatesTokenCount": None,
                        "output_tokens": 80
                    }
                }
            ]
        }))

        result = parse_transcript_file(transcript, "session-test", cli_type="gemini")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].usage.input_tokens == 150
        assert result.messages[0].usage.output_tokens == 80


class TestCodexParserNoneUsageValues:
    """Tests for Codex parser handling None values in usage fields."""

    def test_handles_none_in_turn_context_usage(self, tmp_path):
        """Parser handles null values in turn_context usage."""
        from app.services.transcript_parser import parse_transcript_file
        import json

        transcript = tmp_path / "session.jsonl"
        lines = [
            json.dumps({
                "type": "turn_context",
                "payload": {
                    "model": "gpt-4",
                    "usage": {
                        "input_tokens": None,
                        "output_tokens": None
                    }
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(transcript, "session-test", cli_type="codex")
        assert result is not None
        assert result.total_input_tokens == 0
        assert result.total_output_tokens == 0

    def test_handles_none_in_standalone_usage_entry(self, tmp_path):
        """Parser handles null values in standalone usage entries."""
        from app.services.transcript_parser import parse_transcript_file
        import json

        transcript = tmp_path / "session.jsonl"
        lines = [
            json.dumps({
                "type": "usage",
                "payload": {
                    "input_tokens": None,
                    "prompt_tokens": None,
                    "output_tokens": None,
                    "completion_tokens": None
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(transcript, "session-test", cli_type="codex")
        assert result is not None
        assert result.total_input_tokens == 0
        assert result.total_output_tokens == 0

    def test_handles_none_in_response_item_usage(self, tmp_path):
        """Parser handles null values in response_item usage."""
        from app.services.transcript_parser import parse_transcript_file
        import json

        transcript = tmp_path / "session.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {
                    "timestamp": "2025-01-01T10:00:00Z",
                    "cwd": "/test"
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-01T10:00:00Z",
                "payload": {
                    "id": "msg-1",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Hello"}]
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-01T10:01:00Z",
                "payload": {
                    "id": "msg-2",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "Hi there"}],
                    "usage": {
                        "input_tokens": None,
                        "output_tokens": None
                    }
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(transcript, "session-test", cli_type="codex")
        assert result is not None
        # Should have 2 messages (skips first user message which is env context)
        assert len(result.messages) == 1
        assert result.messages[0].role == "assistant"
        assert result.messages[0].usage is not None
        assert result.messages[0].usage.input_tokens == 0
        assert result.messages[0].usage.output_tokens == 0

    def test_handles_fallback_keys_with_none(self, tmp_path):
        """Parser uses fallback keys when primary keys are null."""
        from app.services.transcript_parser import parse_transcript_file
        import json

        transcript = tmp_path / "session.jsonl"
        lines = [
            json.dumps({
                "type": "turn_context",
                "payload": {
                    "model": "gpt-4",
                    "usage": {
                        "input_tokens": None,
                        "prompt_tokens": 200,
                        "output_tokens": None,
                        "completion_tokens": 100
                    }
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(transcript, "session-test", cli_type="codex")
        assert result is not None
        assert result.total_input_tokens == 200
        assert result.total_output_tokens == 100


# ==========================================
# None Value Handling Tests
# ==========================================

class TestNoneValueHandling:
    """Tests for handling None values in transcript data.

    These tests verify the fix for the bug where dict.get('key', {}) would
    return None instead of {} when the key exists but has a None value.
    The fix uses `or {}` pattern: dict.get('key') or {}
    """

    def test_claude_image_with_none_source(self, tmp_path):
        """Handles image block where 'source' key is explicitly None.

        This tests the fix at transcript_parser.py:285 for:
            source = item.get('source') or {}

        When 'source' is None, should not crash on source.get('type').
        """
        from app.services.transcript_parser import parse_transcript_file
        import json

        session_dir = tmp_path / "projects" / "-test-repo" / "sessions"
        session_dir.mkdir(parents=True)

        # Create JSONL with image content block that has source: null
        transcript = session_dir / "test-session.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "tool-123",
                            "content": [
                                {
                                    "type": "image",
                                    "source": None  # This would crash before the fix
                                }
                            ]
                        }
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        # Should not raise AttributeError: 'NoneType' object has no attribute 'get'
        result = parse_transcript_file(transcript, "test-session", cli_type="claude")
        assert result is not None

    def test_gemini_function_response_with_none_response(self, tmp_path):
        """Handles function response where 'response' key is explicitly None.

        This tests the fix at transcript_parser.py:469 for:
            response = func_resp.get("response") or {}

        When 'response' is None, should not crash on response.get('output').
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-none-resp.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-none-resp",
            "messages": [
                {
                    "type": "user",
                    "content": [
                        {
                            "type": "functionResponse",
                            "name": "read_file",
                            "response": None  # This would crash before the fix
                        }
                    ],
                    "timestamp": "2025-01-01T10:00:00Z"
                }
            ],
            "startTime": "2025-01-01T10:00:00Z"
        }))

        # Should not raise AttributeError
        result = parse_transcript_file(session_file, "session-none-resp", cli_type=CLIType.GEMINI.value)
        assert result is not None

    def test_gemini_function_response_with_none_functionResponse_key(self, tmp_path):
        """Handles when 'functionResponse' key exists but is None.

        This tests the fix at transcript_parser.py:466 for:
            func_resp = part.get("functionResponse") or part

        When the functionResponse key is None, should fall back to part itself.
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-none-funcresp.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-none-funcresp",
            "messages": [
                {
                    "type": "user",
                    "content": [
                        {
                            "type": "functionResponse",
                            "functionResponse": None,  # Explicitly None
                            "name": "read_file",
                            "response": {"output": "file contents"}
                        }
                    ],
                    "timestamp": "2025-01-01T10:00:00Z"
                }
            ],
            "startTime": "2025-01-01T10:00:00Z"
        }))

        # Should not crash and should fall back to using part itself
        result = parse_transcript_file(session_file, "session-none-funcresp", cli_type=CLIType.GEMINI.value)
        assert result is not None

    def test_codex_session_meta_with_none_payload(self, tmp_path):
        """Handles session_meta entry where 'payload' key is explicitly None.

        This tests the fix at transcript_parser.py:633 for:
            payload = entry.get('payload') or {}

        When 'payload' is None, should not crash on payload.get('timestamp').
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-none-payload.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": None  # This would crash before the fix
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise AttributeError
        result = parse_transcript_file(session_file, "session-none-payload", cli_type=CLIType.CODEX.value)
        assert result is not None

    def test_codex_session_meta_with_none_git(self, tmp_path):
        """Handles session_meta where 'git' key is explicitly None.

        This tests the fix at transcript_parser.py:635 for:
            git_info = payload.get('git') or {}

        When 'git' is None, should not crash on git_info.get('branch').
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-none-git.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {
                    "timestamp": "2025-01-15T10:00:00Z",
                    "git": None  # This would crash before the fix
                }
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise AttributeError
        result = parse_transcript_file(session_file, "session-none-git", cli_type=CLIType.CODEX.value)
        assert result is not None
        assert result.git_branch is None  # Should be None, not crash

    def test_codex_turn_context_with_none_payload(self, tmp_path):
        """Handles turn_context entry where 'payload' key is explicitly None.

        This tests the fix at transcript_parser.py:641 for:
            payload = entry.get('payload') or {}
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-turn-none.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            json.dumps({
                "type": "turn_context",
                "payload": None  # This would crash before the fix
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise AttributeError
        result = parse_transcript_file(session_file, "session-turn-none", cli_type=CLIType.CODEX.value)
        assert result is not None

    def test_codex_usage_with_none_payload(self, tmp_path):
        """Handles usage entry where 'payload' key is explicitly None.

        This tests the fix at transcript_parser.py:657 for:
            payload = entry.get('payload') or {}
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-usage-none.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            json.dumps({
                "type": "usage",
                "payload": None  # This would crash before the fix
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise AttributeError
        result = parse_transcript_file(session_file, "session-usage-none", cli_type=CLIType.CODEX.value)
        assert result is not None
        # Token counts should be 0 when payload is None
        assert result.total_input_tokens == 0
        assert result.total_output_tokens == 0

    def test_codex_response_item_with_none_payload(self, tmp_path):
        """Handles response_item entry where 'payload' key is explicitly None.

        This tests the fix at transcript_parser.py:664 for:
            payload = entry.get('payload') or {}
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-resp-none.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:01:00Z",
                "payload": None  # This would crash before the fix
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise AttributeError
        result = parse_transcript_file(session_file, "session-resp-none", cli_type=CLIType.CODEX.value)
        assert result is not None

    def test_valid_image_source_still_works(self, tmp_path):
        """Verify valid image source processing still works after the fix.

        This is a regression test to ensure the fix doesn't break normal behavior.
        """
        from app.services.transcript_parser import parse_transcript_file
        import json

        session_dir = tmp_path / "projects" / "-test-repo" / "sessions"
        session_dir.mkdir(parents=True)

        transcript = session_dir / "test-session.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "tool-123",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "tool-123",
                            "name": "screenshot",
                            "input": {}
                        }
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "tool-123",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/png",
                                        "data": "iVBORw0KGgo="  # Minimal base64
                                    }
                                }
                            ]
                        }
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        result = parse_transcript_file(transcript, "test-session", cli_type="claude")
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].tool_uses[0].result is not None
        # Should contain a data URL
        assert "data:image/png;base64," in result.messages[0].tool_uses[0].result

    def test_valid_gemini_function_response_still_works(self, tmp_path):
        """Verify valid Gemini function responses still work after the fix.

        This is a regression test to ensure the fix doesn't break normal behavior.
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-valid.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-valid",
            "messages": [
                {
                    "type": "gemini",
                    "content": [
                        {
                            "type": "functionCall",
                            "id": "call-1",
                            "name": "read_file",
                            "args": {"path": "/test.py"}
                        }
                    ],
                    "model": "gemini-2.0-flash",
                    "timestamp": "2025-01-01T10:00:00Z"
                },
                {
                    "type": "user",
                    "content": [
                        {
                            "type": "functionResponse",
                            "name": "read_file",
                            "response": {
                                "output": "print('hello')"
                            }
                        }
                    ],
                    "timestamp": "2025-01-01T10:00:01Z"
                }
            ],
            "startTime": "2025-01-01T10:00:00Z"
        }))

        result = parse_transcript_file(session_file, "session-valid", cli_type=CLIType.GEMINI.value)
        assert result is not None
        assert len(result.messages) == 1
        assert result.messages[0].tool_uses[0].result == "print('hello')"

    def test_claude_message_content_with_none_value(self, tmp_path):
        """Handles Claude message where 'content' key is explicitly None.

        This tests the fix at transcript_parser.py:251 for:
            content_parts = message_data.get('content') or []

        When 'content' is None, should not raise TypeError on iteration.
        """
        from app.services.transcript_parser import parse_transcript_file
        import json

        transcript = tmp_path / "test-session.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "user",
                    "content": None  # This would crash before the fix
                }
            }),
            json.dumps({
                "type": "assistant",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "assistant",
                    "content": None  # This would crash before the fix
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        # Should not raise TypeError: 'NoneType' object is not iterable
        result = parse_transcript_file(transcript, "test-session", cli_type="claude")
        assert result is not None
        # No messages should be added since content is None
        assert len(result.messages) == 0

    def test_claude_tool_result_content_with_none_value(self, tmp_path):
        """Handles Claude tool_result where 'content' key is explicitly None.

        This tests the fix at transcript_parser.py:269 for:
            tool_content = part.get('content') or []

        When 'content' is None, should not raise TypeError on iteration.
        """
        from app.services.transcript_parser import parse_transcript_file
        import json

        transcript = tmp_path / "test-session.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "uuid": "msg-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "tool-123",
                            "name": "read_file",
                            "input": {"path": "test.py"}
                        }
                    ]
                }
            }),
            json.dumps({
                "type": "user",
                "uuid": "msg-2",
                "timestamp": "2025-01-01T10:00:01Z",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "tool-123",
                            "content": None  # This would crash before the fix
                        }
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines) + "\n")

        # Should not raise TypeError: 'NoneType' object is not iterable
        result = parse_transcript_file(transcript, "test-session", cli_type="claude")
        assert result is not None
        # The assistant message should be present
        assert len(result.messages) == 1
        assert result.messages[0].role == "assistant"
        # Tool result should be None since content was None
        assert result.messages[0].tool_uses[0].result is None

    def test_gemini_messages_list_with_none_value(self, tmp_path):
        """Handles Gemini session where 'messages' key is explicitly None.

        This tests the fix at transcript_parser.py:449 for:
            for msg in data.get("messages") or []:

        When 'messages' is None, should not raise TypeError on iteration.
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        gemini_dir = tmp_path / ".gemini" / "tmp" / "abc123" / "chats"
        gemini_dir.mkdir(parents=True)

        session_file = gemini_dir / "session-none-messages.json"
        session_file.write_text(json.dumps({
            "sessionId": "session-none-messages",
            "messages": None,  # This would crash before the fix
            "startTime": "2025-01-01T10:00:00Z"
        }))

        # Should not raise TypeError: 'NoneType' object is not iterable
        result = parse_transcript_file(session_file, "session-none-messages", cli_type=CLIType.GEMINI.value)
        assert result is not None
        assert len(result.messages) == 0

    def test_codex_user_content_with_none_value(self, tmp_path):
        """Handles Codex user response_item where 'content' key is explicitly None.

        This tests the fix at transcript_parser.py:713 for:
            content_parts = payload.get('content') or []

        When 'content' is None, should not raise TypeError on iteration.
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-user-none-content.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"cwd": "/home/user/project", "timestamp": "2025-01-15T10:00:00Z"}
            }),
            # First user message (environment context - will be skipped)
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:00Z",
                "payload": {
                    "id": "env-1",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "<environment_context>..."}]
                }
            }),
            # Second user message with content: null
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:01Z",
                "payload": {
                    "id": "msg-1",
                    "role": "user",
                    "content": None  # This would crash before the fix
                }
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise TypeError: 'NoneType' object is not iterable
        result = parse_transcript_file(session_file, "session-user-none-content", cli_type=CLIType.CODEX.value)
        assert result is not None
        # No user messages should be added (first is env context, second has None content)
        assert len(result.messages) == 0

    def test_codex_assistant_content_with_none_value(self, tmp_path):
        """Handles Codex assistant response_item where 'content' key is explicitly None.

        This tests the fix at transcript_parser.py:750 for:
            content_parts = payload.get('content') or []

        When 'content' is None, should not raise TypeError on iteration.
        """
        from app.services.transcript_parser import parse_transcript_file
        from app.cli import CLIType
        import json

        codex_dir = tmp_path / ".codex" / "sessions" / "2025" / "01" / "15"
        codex_dir.mkdir(parents=True)

        session_file = codex_dir / "session-assistant-none-content.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"cwd": "/home/user/project", "timestamp": "2025-01-15T10:00:00Z"}
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:01Z",
                "payload": {
                    "id": "msg-1",
                    "role": "assistant",
                    "content": None  # This would crash before the fix
                }
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise TypeError: 'NoneType' object is not iterable
        result = parse_transcript_file(session_file, "session-assistant-none-content", cli_type=CLIType.CODEX.value)
        assert result is not None
        # No messages should be added since content is None (no text_content or tool_uses)
        assert len(result.messages) == 0
