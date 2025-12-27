"""Tests for app.services.transcript_parser module."""

import pytest
from app.services.transcript_parser import (
    ToolUse,
    ToolResult,
    TokenUsage,
    TranscriptMessage,
    ParsedTranscript,
    transcript_to_dict,
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
