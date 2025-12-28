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
            claude_code_version="1.0.0",
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
        assert result.claude_code_version == "1.2.3"
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
            claude_code_version="1.2.3",
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
        assert result["claude_code_version"] == "1.2.3"
        assert result["git_branch"] == "main"
