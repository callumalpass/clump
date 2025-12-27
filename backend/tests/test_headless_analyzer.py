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


class TestHeadlessAnalyzerBuildCommand:
    """Tests for HeadlessAnalyzer._build_command method."""

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
        settings.get_allowed_tools.return_value = ["Read", "Glob"]
        settings.get_disallowed_tools.return_value = []
        return settings

    def test_basic_command(self, analyzer, mock_settings):
        """Test basic command building."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test prompt", "/home/user/project")

        assert cmd[0] == "claude"
        assert "-p" in cmd
        assert "Test prompt" in cmd
        assert "--output-format" in cmd
        assert "stream-json" in cmd

    def test_permission_mode_accept_edits(self, analyzer, mock_settings):
        """Test acceptEdits permission mode."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path")

        assert "--permission-mode" in cmd
        idx = cmd.index("--permission-mode")
        assert cmd[idx + 1] == "acceptEdits"

    def test_permission_mode_bypass(self, analyzer, mock_settings):
        """Test bypassPermissions mode."""
        mock_settings.claude_permission_mode = "bypassPermissions"

        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path")

        assert "--dangerously-skip-permissions" in cmd
        assert "--permission-mode" not in cmd

    def test_permission_mode_plan(self, analyzer, mock_settings):
        """Test plan permission mode."""
        mock_settings.claude_permission_mode = "plan"

        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path")

        assert "--permission-mode" in cmd
        idx = cmd.index("--permission-mode")
        assert cmd[idx + 1] == "plan"

    def test_session_id_option(self, analyzer, mock_settings):
        """Test adding session_id."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path", session_id="my-session-id")

        assert "--session-id" in cmd
        idx = cmd.index("--session-id")
        assert cmd[idx + 1] == "my-session-id"

    def test_resume_session_option(self, analyzer, mock_settings):
        """Test resuming a session."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path", resume_session="prev-session")

        assert "--resume" in cmd
        idx = cmd.index("--resume")
        assert cmd[idx + 1] == "prev-session"

    def test_allowed_tools(self, analyzer, mock_settings):
        """Test allowed tools are included."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path")

        assert "--allowedTools" in cmd
        idx = cmd.index("--allowedTools")
        assert cmd[idx + 1] == "Read,Glob"

    def test_allowed_tools_override(self, analyzer, mock_settings):
        """Test overriding allowed tools."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command(
                "Test", "/path",
                allowed_tools=["Bash", "Write"]
            )

        assert "--allowedTools" in cmd
        idx = cmd.index("--allowedTools")
        assert cmd[idx + 1] == "Bash,Write"

    def test_disallowed_tools(self, analyzer, mock_settings):
        """Test disallowed tools are included."""
        mock_settings.get_disallowed_tools.return_value = ["Edit", "Bash"]

        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path")

        assert "--disallowedTools" in cmd
        idx = cmd.index("--disallowedTools")
        assert cmd[idx + 1] == "Edit,Bash"

    def test_max_turns(self, analyzer, mock_settings):
        """Test max turns setting."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path")

        assert "--max-turns" in cmd
        idx = cmd.index("--max-turns")
        assert cmd[idx + 1] == "10"

    def test_max_turns_override(self, analyzer, mock_settings):
        """Test overriding max turns."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path", max_turns=5)

        assert "--max-turns" in cmd
        idx = cmd.index("--max-turns")
        assert cmd[idx + 1] == "5"

    def test_max_turns_zero_excluded(self, analyzer, mock_settings):
        """Test that max_turns=0 is excluded (unlimited)."""
        mock_settings.claude_max_turns = 0

        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path")

        assert "--max-turns" not in cmd

    def test_model_setting(self, analyzer, mock_settings):
        """Test model setting."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path")

        assert "--model" in cmd
        idx = cmd.index("--model")
        assert cmd[idx + 1] == "sonnet"

    def test_model_override(self, analyzer, mock_settings):
        """Test overriding model."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command("Test", "/path", model="opus")

        assert "--model" in cmd
        idx = cmd.index("--model")
        assert cmd[idx + 1] == "opus"

    def test_system_prompt(self, analyzer, mock_settings):
        """Test adding system prompt."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command(
                "Test", "/path",
                system_prompt="You are a code reviewer."
            )

        assert "--append-system-prompt" in cmd
        idx = cmd.index("--append-system-prompt")
        assert cmd[idx + 1] == "You are a code reviewer."

    def test_output_format_override(self, analyzer, mock_settings):
        """Test overriding output format."""
        with patch("app.services.headless_analyzer.settings", mock_settings):
            cmd = analyzer._build_command(
                "Test", "/path",
                output_format="json"
            )

        assert "--output-format" in cmd
        idx = cmd.index("--output-format")
        assert cmd[idx + 1] == "json"


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


class TestHeadlessAnalyzerRunningSessionsManagement:
    """Tests for running sessions tracking."""

    @pytest.fixture
    def analyzer(self):
        """Create HeadlessAnalyzer instance."""
        from app.services.headless_analyzer import HeadlessAnalyzer
        return HeadlessAnalyzer()

    def test_list_running_empty(self, analyzer):
        """Test list_running with no sessions."""
        assert analyzer.list_running() == []

    def test_list_running_with_sessions(self, analyzer):
        """Test list_running with sessions."""
        analyzer._running_sessions["session-1"] = MagicMock()
        analyzer._running_sessions["session-2"] = MagicMock()

        running = analyzer.list_running()

        assert len(running) == 2
        assert "session-1" in running
        assert "session-2" in running


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


class TestGlobalAnalyzerInstance:
    """Tests for the global headless_analyzer instance."""

    def test_global_instance_exists(self):
        """Test that global instance is created."""
        from app.services.headless_analyzer import headless_analyzer, HeadlessAnalyzer

        assert headless_analyzer is not None
        assert isinstance(headless_analyzer, HeadlessAnalyzer)
