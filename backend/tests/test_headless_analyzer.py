"""Tests for headless_analyzer.py."""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
import asyncio


class TestSessionMessage:
    """Tests for SessionMessage dataclass."""

    def test_default_values(self):
        """Test SessionMessage with minimal required fields."""
        from app.services.headless_analyzer import SessionMessage

        msg = SessionMessage(type="assistant")

        assert msg.type == "assistant"
        assert msg.subtype is None
        assert msg.content is None
        assert msg.session_id is None
        assert msg.cost_usd is None
        assert msg.duration_ms is None
        assert msg.raw == {}

    def test_full_initialization(self):
        """Test SessionMessage with all fields."""
        from app.services.headless_analyzer import SessionMessage

        raw_data = {"key": "value"}
        msg = SessionMessage(
            type="result",
            subtype="success",
            content="Analysis complete",
            session_id="abc-123",
            cost_usd=0.05,
            duration_ms=5000,
            raw=raw_data,
        )

        assert msg.type == "result"
        assert msg.subtype == "success"
        assert msg.content == "Analysis complete"
        assert msg.session_id == "abc-123"
        assert msg.cost_usd == 0.05
        assert msg.duration_ms == 5000
        assert msg.raw == raw_data


class TestSessionResult:
    """Tests for SessionResult dataclass."""

    def test_minimal_success_result(self):
        """Test minimal successful SessionResult."""
        from app.services.headless_analyzer import SessionResult

        result = SessionResult(
            session_id="test-123",
            result="Done",
            success=True,
        )

        assert result.session_id == "test-123"
        assert result.result == "Done"
        assert result.success is True
        assert result.cost_usd == 0.0
        assert result.duration_ms == 0
        assert result.turns == 0
        assert result.messages == []
        assert result.error is None

    def test_error_result(self):
        """Test SessionResult with error."""
        from app.services.headless_analyzer import SessionResult

        result = SessionResult(
            session_id="",
            result="",
            success=False,
            error="Command failed",
        )

        assert result.success is False
        assert result.error == "Command failed"

    def test_full_result(self):
        """Test SessionResult with all fields populated."""
        from app.services.headless_analyzer import SessionResult, SessionMessage

        messages = [
            SessionMessage(type="system", subtype="init"),
            SessionMessage(type="assistant", content="Working..."),
            SessionMessage(type="result", subtype="success", content="Done"),
        ]

        result = SessionResult(
            session_id="full-test",
            result="Analysis complete",
            success=True,
            cost_usd=0.12,
            duration_ms=15000,
            turns=3,
            messages=messages,
        )

        assert result.cost_usd == 0.12
        assert result.duration_ms == 15000
        assert result.turns == 3
        assert len(result.messages) == 3


class TestHeadlessAnalyzerParseMessage:
    """Tests for HeadlessAnalyzer._parse_message method."""

    @pytest.fixture
    def analyzer(self):
        """Create HeadlessAnalyzer instance."""
        from app.services.headless_analyzer import HeadlessAnalyzer
        return HeadlessAnalyzer()

    def test_parse_system_message(self, analyzer):
        """Test parsing system init message."""
        data = {
            "type": "system",
            "subtype": "init",
            "session_id": "abc-123",
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "system"
        assert msg.subtype == "init"
        assert msg.session_id == "abc-123"

    def test_parse_assistant_message_string_content(self, analyzer):
        """Test parsing assistant message with string content."""
        data = {
            "type": "assistant",
            "message": {
                "content": "Hello, I can help you."
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        assert msg.content == "Hello, I can help you."

    def test_parse_assistant_message_list_content(self, analyzer):
        """Test parsing assistant message with list of content blocks."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "First part. "},
                    {"type": "text", "text": "Second part."},
                    {"type": "tool_use", "name": "Read"},
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        assert msg.content == "First part.  Second part."

    def test_parse_result_success(self, analyzer):
        """Test parsing successful result message."""
        data = {
            "type": "result",
            "subtype": "success",
            "result": "Analysis complete: no issues found.",
            "session_id": "result-123",
            "total_cost_usd": 0.05,
            "duration_ms": 3000,
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "result"
        assert msg.subtype == "success"
        assert msg.content == "Analysis complete: no issues found."
        assert msg.session_id == "result-123"
        assert msg.cost_usd == 0.05
        assert msg.duration_ms == 3000

    def test_parse_error_message(self, analyzer):
        """Test parsing error message."""
        data = {
            "type": "error",
            "subtype": "error",
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "error"
        assert msg.subtype == "error"

    def test_parse_unknown_message(self, analyzer):
        """Test parsing unknown message type."""
        data = {
            "custom_field": "value",
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "unknown"
        assert msg.raw == data

    def test_raw_data_preserved(self, analyzer):
        """Test that raw data is always preserved."""
        data = {
            "type": "assistant",
            "extra_field": "extra_value",
            "nested": {"a": 1},
        }

        msg = analyzer._parse_message(data)

        assert msg.raw == data

    def test_parse_assistant_message_with_none_message(self, analyzer):
        """Test parsing assistant message when 'message' key is None.

        This tests the fix for the bug where data.get("message", {}).get(...)
        would fail with AttributeError if 'message' exists but is None.
        """
        data = {
            "type": "assistant",
            "message": None,  # Key exists but value is None
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        assert msg.content == ""  # Should default to empty string

    def test_parse_assistant_message_without_message_key(self, analyzer):
        """Test parsing assistant message when 'message' key is missing."""
        data = {
            "type": "assistant",
            # No 'message' key at all
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        assert msg.content == ""  # Should default to empty string

    def test_parse_assistant_message_with_none_content(self, analyzer):
        """Test parsing assistant message when 'content' is None."""
        data = {
            "type": "assistant",
            "message": {
                "content": None,
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        # When content is None, it should stay as None (not converted to string)
        assert msg.content is None

    def test_parse_assistant_message_with_empty_content_list(self, analyzer):
        """Test parsing assistant message with empty content list."""
        data = {
            "type": "assistant",
            "message": {
                "content": [],
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        assert msg.content == ""  # Empty list should result in empty string

    def test_parse_assistant_message_with_non_text_blocks_only(self, analyzer):
        """Test parsing assistant message with only non-text content blocks."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "tool_use", "name": "Read"},
                    {"type": "image", "source": "base64data"},
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        assert msg.content == ""  # No text blocks, so empty string

    def test_parse_assistant_message_with_empty_message_dict(self, analyzer):
        """Test parsing assistant message with empty message dict."""
        data = {
            "type": "assistant",
            "message": {},  # Empty dict
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        assert msg.content == ""  # Should default to empty string

    def test_parse_result_with_none_result(self, analyzer):
        """Test parsing result message when 'result' is None."""
        data = {
            "type": "result",
            "subtype": "success",
            "result": None,
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "result"
        assert msg.subtype == "success"
        assert msg.content is None

    def test_parse_result_without_result_key(self, analyzer):
        """Test parsing result message when 'result' key is missing."""
        data = {
            "type": "result",
            "subtype": "success",
            # No 'result' key
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "result"
        assert msg.content == ""  # Should default to empty string

    def test_parse_assistant_mixed_content_blocks(self, analyzer):
        """Test parsing assistant message with mixed content block types."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "thinking", "thinking": "Let me think..."},
                    {"type": "text", "text": "Here is the answer."},
                    {"type": "tool_use", "id": "abc", "name": "Bash"},
                    {"type": "text", "text": " More text."},
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        assert msg.content == "Here is the answer.  More text."

    def test_parse_assistant_content_block_missing_text(self, analyzer):
        """Test parsing content blocks that are missing the 'text' key."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text"},  # Missing 'text' key
                    {"type": "text", "text": "Valid text"},
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        # First block contributes empty string, second contributes "Valid text"
        assert msg.content == " Valid text"

    def test_parse_assistant_content_block_with_none_text(self, analyzer):
        """Test parsing content blocks where 'text' key exists but is None.

        This tests the fix for a bug where block.get("text", "") would return
        None (not the default "") when the key exists with value None, causing
        a TypeError in str.join().
        """
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": None},  # text key exists but is None
                    {"type": "text", "text": "Valid text"},
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        # First block contributes empty string (None -> ""), second contributes "Valid text"
        assert msg.content == " Valid text"

    def test_parse_assistant_content_block_with_all_none_text(self, analyzer):
        """Test parsing content blocks where all 'text' values are None."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": None},
                    {"type": "text", "text": None},
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        # Both blocks contribute empty strings
        assert msg.content == " "


class TestHeadlessAnalyzerRunningSessionsManagement:
    """Tests for running sessions tracking."""

    @pytest.fixture
    def analyzer(self):
        """Create HeadlessAnalyzer instance."""
        from app.services.headless_analyzer import HeadlessAnalyzer
        return HeadlessAnalyzer()

    @pytest.mark.asyncio
    async def test_list_running_empty(self, analyzer):
        """Test list_running with no sessions."""
        assert await analyzer.list_running() == []

    @pytest.mark.asyncio
    async def test_list_running_with_sessions(self, analyzer):
        """Test list_running with sessions."""
        analyzer._running_sessions["session-1"] = MagicMock()
        analyzer._running_sessions["session-2"] = MagicMock()

        running = await analyzer.list_running()

        assert len(running) == 2
        assert "session-1" in running
        assert "session-2" in running

    @pytest.mark.asyncio
    async def test_register_running_adds_session(self, analyzer):
        """Test that register_running adds session ID to tracking set."""
        await analyzer.register_running("test-session-123")

        assert "test-session-123" in analyzer._active_session_ids
        running = await analyzer.list_running()
        assert "test-session-123" in running

    @pytest.mark.asyncio
    async def test_unregister_running_removes_session(self, analyzer):
        """Test that unregister_running removes session ID from tracking set."""
        analyzer._active_session_ids.add("session-to-remove")

        await analyzer.unregister_running("session-to-remove")

        assert "session-to-remove" not in analyzer._active_session_ids

    @pytest.mark.asyncio
    async def test_unregister_running_handles_nonexistent_session(self, analyzer):
        """Test that unregister_running handles non-existent session gracefully."""
        # Should not raise an error
        await analyzer.unregister_running("nonexistent-session")

        assert "nonexistent-session" not in analyzer._active_session_ids

    @pytest.mark.asyncio
    async def test_list_running_combines_both_tracking_mechanisms(self, analyzer):
        """Test that list_running combines _running_sessions and _active_session_ids."""
        # Add session via subprocess tracking
        analyzer._running_sessions["process-session"] = MagicMock()
        # Add session via explicit registration
        await analyzer.register_running("registered-session")

        running = await analyzer.list_running()

        assert len(running) == 2
        assert "process-session" in running
        assert "registered-session" in running

    @pytest.mark.asyncio
    async def test_list_running_deduplicates_sessions(self, analyzer):
        """Test that list_running deduplicates sessions in both tracking mechanisms."""
        # Add same session to both tracking mechanisms
        analyzer._running_sessions["shared-session"] = MagicMock()
        analyzer._active_session_ids.add("shared-session")

        running = await analyzer.list_running()

        # Should only appear once
        assert running.count("shared-session") == 1

    @pytest.mark.asyncio
    async def test_concurrent_register_unregister(self, analyzer):
        """Test that concurrent register/unregister operations are thread-safe."""
        # This test verifies the lock prevents race conditions
        import asyncio

        async def register_task(session_id: str):
            await analyzer.register_running(session_id)
            await asyncio.sleep(0.001)  # Simulate some work

        async def unregister_task(session_id: str):
            await asyncio.sleep(0.001)  # Let register happen first
            await analyzer.unregister_running(session_id)

        # Run many concurrent operations
        tasks = []
        for i in range(50):
            session_id = f"session-{i}"
            tasks.append(register_task(session_id))
            tasks.append(unregister_task(session_id))

        await asyncio.gather(*tasks)

        # All sessions should be unregistered after the operations
        running = await analyzer.list_running()
        assert len(running) == 0


class TestHeadlessAnalyzerCancel:
    """Tests for HeadlessAnalyzer.cancel method."""

    @pytest.fixture
    def analyzer(self):
        """Create HeadlessAnalyzer instance."""
        from app.services.headless_analyzer import HeadlessAnalyzer
        return HeadlessAnalyzer()

    @pytest.mark.asyncio
    async def test_cancel_nonexistent_session(self, analyzer):
        """Test canceling a session that doesn't exist."""
        result = await analyzer.cancel("nonexistent")
        assert result is False

    @pytest.mark.asyncio
    async def test_cancel_existing_session(self, analyzer):
        """Test canceling an existing session."""
        mock_process = MagicMock()
        mock_process.terminate = MagicMock()
        mock_process.wait = AsyncMock()

        analyzer._running_sessions["test-session"] = mock_process

        result = await analyzer.cancel("test-session")

        assert result is True
        mock_process.terminate.assert_called_once()
        mock_process.wait.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_cancel_timeout_falls_back_to_kill(self, analyzer):
        """Test that cancel falls back to kill on timeout."""
        mock_process = MagicMock()
        mock_process.terminate = MagicMock()
        mock_process.kill = MagicMock()

        async def slow_wait():
            await asyncio.sleep(10)

        mock_process.wait = slow_wait
        analyzer._running_sessions["slow-session"] = mock_process

        result = await analyzer.cancel("slow-session")

        assert result is True
        mock_process.terminate.assert_called_once()
        mock_process.kill.assert_called_once()

    @pytest.mark.asyncio
    async def test_cancel_removes_from_running_sessions(self, analyzer):
        """Test that cancel atomically removes session from tracking.

        This tests the fix for the race condition where a session could be
        retrieved but removed by another coroutine before terminate() was called.
        By using pop() instead of get(), we atomically retrieve and remove.
        """
        mock_process = MagicMock()
        mock_process.terminate = MagicMock()
        mock_process.wait = AsyncMock()

        analyzer._running_sessions["atomic-test"] = mock_process

        result = await analyzer.cancel("atomic-test")

        assert result is True
        # Session should be removed from _running_sessions
        assert "atomic-test" not in analyzer._running_sessions

    @pytest.mark.asyncio
    async def test_cancel_removes_from_active_session_ids(self, analyzer):
        """Test that cancel also removes session from _active_session_ids.

        Sessions can be tracked in both _running_sessions and _active_session_ids.
        Cancel should clean up both to prevent stale entries.
        """
        mock_process = MagicMock()
        mock_process.terminate = MagicMock()
        mock_process.wait = AsyncMock()

        session_id = "dual-tracked-session"
        analyzer._running_sessions[session_id] = mock_process
        analyzer._active_session_ids.add(session_id)

        result = await analyzer.cancel(session_id)

        assert result is True
        assert session_id not in analyzer._running_sessions
        assert session_id not in analyzer._active_session_ids

    @pytest.mark.asyncio
    async def test_cancel_only_active_session_ids(self, analyzer):
        """Test canceling a session that exists only in _active_session_ids.

        If a session is registered via register_running but the process hasn't
        been stored yet (or has already exited), cancel should still return True
        since we successfully stopped tracking the session as running.
        """
        session_id = "only-registered"
        analyzer._active_session_ids.add(session_id)

        result = await analyzer.cancel(session_id)

        # Returns True because the session was removed from active tracking
        assert result is True
        # The session_id should be removed from _active_session_ids
        assert session_id not in analyzer._active_session_ids

    @pytest.mark.asyncio
    async def test_cancel_idempotent(self, analyzer):
        """Test that canceling the same session twice is safe.

        The second cancel should return False since the session was already removed.
        """
        mock_process = MagicMock()
        mock_process.terminate = MagicMock()
        mock_process.wait = AsyncMock()

        analyzer._running_sessions["idempotent-test"] = mock_process

        first_result = await analyzer.cancel("idempotent-test")
        second_result = await analyzer.cancel("idempotent-test")

        assert first_result is True
        assert second_result is False
        # terminate should only be called once
        mock_process.terminate.assert_called_once()

    @pytest.mark.asyncio
    async def test_cancel_concurrent_safety(self, analyzer):
        """Test that concurrent cancels on the same session are safe.

        Only one cancel should succeed in terminating the process.
        This tests the atomicity of the pop() operation under the lock.
        """
        mock_process = MagicMock()
        mock_process.terminate = MagicMock()
        mock_process.wait = AsyncMock()

        analyzer._running_sessions["concurrent-test"] = mock_process
        analyzer._active_session_ids.add("concurrent-test")

        # Launch multiple concurrent cancels
        results = await asyncio.gather(
            analyzer.cancel("concurrent-test"),
            analyzer.cancel("concurrent-test"),
            analyzer.cancel("concurrent-test"),
        )

        # Only one should succeed
        assert results.count(True) == 1
        assert results.count(False) == 2
        # terminate should only be called once
        mock_process.terminate.assert_called_once()
        # Session should be fully cleaned up
        assert "concurrent-test" not in analyzer._running_sessions
        assert "concurrent-test" not in analyzer._active_session_ids

    @pytest.mark.asyncio
    async def test_cancel_returns_false_for_unknown_session(self, analyzer):
        """Test that canceling an unknown session returns False.

        If the session was never registered or tracked, cancel should return False.
        """
        result = await analyzer.cancel("never-existed")

        assert result is False
        # Ensure no side effects
        assert "never-existed" not in analyzer._running_sessions
        assert "never-existed" not in analyzer._active_session_ids

    @pytest.mark.asyncio
    async def test_cancel_in_both_tracking_mechanisms(self, analyzer):
        """Test canceling a session that exists in both tracking mechanisms.

        When a session is in both _running_sessions and _active_session_ids,
        cancel should remove from both and return True.
        """
        mock_process = MagicMock()
        mock_process.terminate = MagicMock()
        mock_process.wait = AsyncMock()

        session_id = "in-both"
        analyzer._running_sessions[session_id] = mock_process
        analyzer._active_session_ids.add(session_id)

        result = await analyzer.cancel(session_id)

        assert result is True
        assert session_id not in analyzer._running_sessions
        assert session_id not in analyzer._active_session_ids
        mock_process.terminate.assert_called_once()

    @pytest.mark.asyncio
    async def test_cancel_after_process_already_removed(self, analyzer):
        """Test canceling when process was removed but session still in active_ids.

        This simulates the case where analyze_stream finished (removing from
        _running_sessions) but the caller hasn't called unregister_running yet.
        """
        session_id = "process-gone"
        # Session is in active_ids but not in _running_sessions
        analyzer._active_session_ids.add(session_id)
        # Ensure it's not in _running_sessions
        assert session_id not in analyzer._running_sessions

        result = await analyzer.cancel(session_id)

        # Should still return True since we removed from active tracking
        assert result is True
        assert session_id not in analyzer._active_session_ids


class TestHeadlessAnalyzerAnalyzeStream:
    """Tests for HeadlessAnalyzer.analyze_stream method."""

    @pytest.fixture
    def analyzer(self):
        """Create HeadlessAnalyzer instance."""
        from app.services.headless_analyzer import HeadlessAnalyzer
        return HeadlessAnalyzer()

    @pytest.fixture
    def mock_settings(self):
        """Create mock settings."""
        settings = MagicMock()
        settings.claude_command = "claude"
        settings.claude_output_format = "stream-json"
        settings.claude_permission_mode = "acceptEdits"
        settings.claude_max_turns = 10
        settings.claude_model = "sonnet"
        settings.get_allowed_tools.return_value = []
        settings.get_disallowed_tools.return_value = []
        return settings

    @pytest.mark.asyncio
    async def test_analyze_stream_success(self, analyzer, mock_settings):
        """Test successful streaming analysis."""
        json_output = [
            b'{"type": "system", "subtype": "init"}\n',
            b'{"type": "assistant", "message": {"content": "Working"}}\n',
            b'{"type": "result", "subtype": "success", "result": "Done"}\n',
        ]

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.wait = AsyncMock()

        async def readline_generator():
            for line in json_output:
                yield line
            yield b''

        gen = readline_generator()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline = lambda: gen.__anext__()
        mock_process.stderr = MagicMock()
        mock_process.stderr.read = AsyncMock(return_value=b'')

        with patch("app.services.headless_analyzer.settings", mock_settings):
            with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_process)):
                messages = []
                async for msg in analyzer.analyze_stream("Test", "/path"):
                    messages.append(msg)

        assert len(messages) == 3
        assert messages[0].type == "system"
        assert messages[1].type == "assistant"
        assert messages[2].type == "result"

    @pytest.mark.asyncio
    async def test_analyze_stream_non_json_output(self, analyzer, mock_settings):
        """Test handling non-JSON output gracefully."""
        output = [
            b'Not valid JSON\n',
            b'{"type": "result", "subtype": "success"}\n',
        ]

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.wait = AsyncMock()

        async def readline_generator():
            for line in output:
                yield line
            yield b''

        gen = readline_generator()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline = lambda: gen.__anext__()
        mock_process.stderr = MagicMock()
        mock_process.stderr.read = AsyncMock(return_value=b'')

        with patch("app.services.headless_analyzer.settings", mock_settings):
            with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_process)):
                messages = []
                async for msg in analyzer.analyze_stream("Test", "/path"):
                    messages.append(msg)

        assert len(messages) == 2
        assert messages[0].type == "text"
        assert "Not valid JSON" in messages[0].content
        assert messages[1].type == "result"

    @pytest.mark.asyncio
    async def test_analyze_stream_error_output(self, analyzer, mock_settings):
        """Test handling stderr output on non-zero exit."""
        mock_process = MagicMock()
        mock_process.returncode = 1
        mock_process.wait = AsyncMock()

        async def readline_generator():
            yield b''

        gen = readline_generator()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline = lambda: gen.__anext__()
        mock_process.stderr = MagicMock()
        mock_process.stderr.read = AsyncMock(return_value=b'Error: command not found')

        with patch("app.services.headless_analyzer.settings", mock_settings):
            with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_process)):
                messages = []
                async for msg in analyzer.analyze_stream("Test", "/path"):
                    messages.append(msg)

        assert len(messages) == 1
        assert messages[0].type == "error"
        assert "Error: command not found" in messages[0].content

    @pytest.mark.asyncio
    async def test_analyze_stream_cleans_up_session(self, analyzer, mock_settings):
        """Test that session is removed from running sessions after completion."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.wait = AsyncMock()

        async def readline_generator():
            yield b''

        gen = readline_generator()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline = lambda: gen.__anext__()
        mock_process.stderr = MagicMock()
        mock_process.stderr.read = AsyncMock(return_value=b'')

        with patch("app.services.headless_analyzer.settings", mock_settings):
            with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_process)):
                async for _ in analyzer.analyze_stream("Test", "/path", session_id="cleanup-test"):
                    pass

        assert "cleanup-test" not in analyzer._running_sessions

    @pytest.mark.asyncio
    async def test_analyze_stream_stores_asyncio_process(self, analyzer, mock_settings):
        """Test that analyze_stream stores asyncio.subprocess.Process, not subprocess.Popen.

        This test validates the type annotation: _running_sessions should store
        asyncio.subprocess.Process objects from asyncio.create_subprocess_exec,
        not subprocess.Popen from the synchronous subprocess module.
        """
        import asyncio.subprocess as async_subprocess

        mock_process = MagicMock(spec=async_subprocess.Process)
        mock_process.returncode = 0
        mock_process.wait = AsyncMock()

        async def readline_generator():
            # Check the process type while it's stored in _running_sessions
            assert "type-check-session" in analyzer._running_sessions
            stored_process = analyzer._running_sessions["type-check-session"]
            # The stored process should be the mock we provided (simulating asyncio.subprocess.Process)
            assert stored_process is mock_process
            yield b''

        gen = readline_generator()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline = lambda: gen.__anext__()
        mock_process.stderr = MagicMock()
        mock_process.stderr.read = AsyncMock(return_value=b'')

        with patch("app.services.headless_analyzer.settings", mock_settings):
            with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_process)):
                async for _ in analyzer.analyze_stream("Test", "/path", session_id="type-check-session"):
                    pass


class TestHeadlessAnalyzerAnalyze:
    """Tests for HeadlessAnalyzer.analyze method."""

    @pytest.fixture
    def analyzer(self):
        """Create HeadlessAnalyzer instance."""
        from app.services.headless_analyzer import HeadlessAnalyzer
        return HeadlessAnalyzer()

    @pytest.mark.asyncio
    async def test_analyze_returns_success_result(self, analyzer):
        """Test analyze returns successful SessionResult."""
        from app.services.headless_analyzer import SessionMessage

        async def mock_stream(*args, **kwargs):
            yield SessionMessage(type="system", subtype="init")
            yield SessionMessage(type="assistant", content="Working...")
            yield SessionMessage(
                type="result",
                subtype="success",
                content="Analysis complete",
                session_id="test-session",
                cost_usd=0.05,
                duration_ms=2000,
            )

        with patch.object(analyzer, "analyze_stream", mock_stream):
            result = await analyzer.analyze("Test prompt", "/path")

        assert result.success is True
        assert result.session_id == "test-session"
        assert result.result == "Analysis complete"
        assert result.cost_usd == 0.05
        assert result.duration_ms == 2000
        assert len(result.messages) == 3

    @pytest.mark.asyncio
    async def test_analyze_returns_error_result(self, analyzer):
        """Test analyze returns error SessionResult."""
        from app.services.headless_analyzer import SessionMessage

        async def mock_stream(*args, **kwargs):
            yield SessionMessage(type="system", subtype="init")
            yield SessionMessage(type="error", content="Claude error occurred")

        with patch.object(analyzer, "analyze_stream", mock_stream):
            result = await analyzer.analyze("Test prompt", "/path")

        assert result.success is False
        assert result.error == "Claude error occurred"

    @pytest.mark.asyncio
    async def test_analyze_unknown_error(self, analyzer):
        """Test analyze with no result or error message."""
        from app.services.headless_analyzer import SessionMessage

        async def mock_stream(*args, **kwargs):
            yield SessionMessage(type="system", subtype="init")

        with patch.object(analyzer, "analyze_stream", mock_stream):
            result = await analyzer.analyze("Test prompt", "/path")

        assert result.success is False
        assert result.error == "Unknown error"


class TestHeadlessAnalyzerWithCLIType:
    """Tests for HeadlessAnalyzer with different CLI types."""

    @pytest.fixture
    def analyzer(self):
        """Create HeadlessAnalyzer instance."""
        from app.services.headless_analyzer import HeadlessAnalyzer
        return HeadlessAnalyzer()

    @pytest.mark.asyncio
    async def test_analyze_stream_with_string_cli_type(self, analyzer):
        """Test analyze_stream accepts string CLI type and converts to enum."""
        from app.cli import CLIType

        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.wait = AsyncMock()

        async def readline_generator():
            yield b'{"type": "result", "subtype": "success", "result": "Done"}\n'
            yield b''

        gen = readline_generator()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline = lambda: gen.__anext__()
        mock_process.stderr = MagicMock()
        mock_process.stderr.read = AsyncMock(return_value=b'')

        with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_process)):
            messages = []
            # Pass string "claude" instead of CLIType.CLAUDE
            async for msg in analyzer.analyze_stream("Test", "/path", cli_type="claude"):
                messages.append(msg)

        assert len(messages) == 1
        assert messages[0].type == "result"

    @pytest.mark.asyncio
    async def test_analyze_stream_unsupported_cli_yields_error(self, analyzer):
        """Test analyze_stream yields error for CLI without headless support."""
        # Create a mock adapter that doesn't support headless
        mock_adapter = MagicMock()
        mock_adapter.capabilities.supports_headless = False
        mock_adapter.display_name = "MockCLI"

        with patch("app.services.headless_analyzer.get_adapter", return_value=mock_adapter):
            messages = []
            async for msg in analyzer.analyze_stream("Test", "/path"):
                messages.append(msg)

        assert len(messages) == 1
        assert messages[0].type == "error"
        assert "does not support headless mode" in messages[0].content


class TestHeadlessAnalyzerParseMessageEdgeCases:
    """Additional edge case tests for _parse_message method."""

    @pytest.fixture
    def analyzer(self):
        """Create HeadlessAnalyzer instance."""
        from app.services.headless_analyzer import HeadlessAnalyzer
        return HeadlessAnalyzer()

    def test_parse_message_with_numeric_content(self, analyzer):
        """Test parsing message where content value is a number (edge case)."""
        data = {
            "type": "assistant",
            "message": {
                "content": 12345  # Numeric content instead of string/list
            },
        }

        msg = analyzer._parse_message(data)

        # Numeric content should not cause an error
        assert msg.type == "assistant"
        # Numeric content is converted to string for consistency
        assert msg.content == "12345"

    def test_parse_message_with_nested_content_blocks(self, analyzer):
        """Test parsing assistant message with deeply nested content."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "First."},
                    {"type": "text", "text": "Second."},
                    {"type": "text", "text": "Third."},
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        assert msg.content == "First. Second. Third."

    def test_parse_message_result_with_cost_and_duration_zero(self, analyzer):
        """Test parsing result with zero cost and duration values."""
        data = {
            "type": "result",
            "subtype": "success",
            "result": "Done",
            "total_cost_usd": 0.0,
            "duration_ms": 0,
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "result"
        assert msg.cost_usd == 0.0
        assert msg.duration_ms == 0

    def test_parse_message_with_whitespace_text_content(self, analyzer):
        """Test parsing message with whitespace-only text blocks."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "   "},
                    {"type": "text", "text": "Valid"},
                    {"type": "text", "text": "\n\t"},
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        # All text blocks are joined with space
        assert "Valid" in msg.content

    def test_parse_message_with_non_dict_content_blocks(self, analyzer):
        """Test parsing message with non-dict items in content list (malformed data)."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "Valid text"},
                    None,  # Non-dict: should be skipped
                    "string block",  # Non-dict: should be skipped
                    123,  # Non-dict: should be skipped
                    {"type": "text", "text": "More valid text"},
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        # Only valid dict blocks with type="text" should be included
        assert msg.content == "Valid text More valid text"

    def test_parse_message_with_all_malformed_content_blocks(self, analyzer):
        """Test parsing message where all content blocks are malformed."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    None,
                    "string",
                    42,
                    [],
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        # No valid text blocks, so content should be empty
        assert msg.content == ""

    def test_parse_message_with_boolean_content(self, analyzer):
        """Test parsing message where content value is a boolean."""
        data = {
            "type": "assistant",
            "message": {
                "content": True  # Boolean content
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        # Boolean content is converted to string
        assert msg.content == "True"

    def test_parse_message_with_dict_content_missing_text_key(self, analyzer):
        """Test parsing message with dict blocks missing the text key."""
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text"},  # Missing "text" key
                    {"type": "text", "text": "Has text"},
                    {"type": "image", "url": "http://example.com"},  # Wrong type
                ]
            },
        }

        msg = analyzer._parse_message(data)

        assert msg.type == "assistant"
        # Only the block with both type="text" and a text key is included
        # The first block with missing text returns "" from .get("text", "")
        assert msg.content == " Has text"


class TestGlobalAnalyzerInstance:
    """Tests for the global headless_analyzer instance."""

    def test_global_instance_exists(self):
        """Test that global instance is created."""
        from app.services.headless_analyzer import headless_analyzer, HeadlessAnalyzer

        assert headless_analyzer is not None
        assert isinstance(headless_analyzer, HeadlessAnalyzer)
