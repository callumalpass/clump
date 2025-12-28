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
