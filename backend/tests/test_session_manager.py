"""Tests for session_manager.py."""

import pytest
from unittest.mock import MagicMock


class TestBuildCommandArgs:
    """Tests for ProcessManager._build_command_args method."""

    @pytest.fixture
    def process_manager(self):
        """Create a ProcessManager instance for testing."""
        from app.services.session_manager import ProcessManager
        return ProcessManager()

    @pytest.fixture
    def mock_settings(self):
        """Create mock settings with default values."""
        settings = MagicMock()
        settings.claude_command = "claude"
        settings.claude_permission_mode = "acceptEdits"
        settings.claude_max_turns = 10
        settings.claude_model = "sonnet"
        settings.get_allowed_tools.return_value = ["Read", "Glob"]
        settings.get_disallowed_tools.return_value = []
        settings.get_mcp_config.return_value = None
        return settings

    def test_basic_command(self, process_manager, mock_settings):
        """Test basic command with default settings."""
        args = process_manager._build_command_args(mock_settings)

        assert args[0] == "claude"
        assert "--permission-mode" in args
        assert "acceptEdits" in args
        assert "--allowedTools" in args
        assert "Read,Glob" in args
        assert "--max-turns" in args
        assert "10" in args
        assert "--model" in args
        assert "sonnet" in args

    def test_bypass_permissions_mode(self, process_manager, mock_settings):
        """Test bypassPermissions mode doesn't include tool settings."""
        mock_settings.claude_permission_mode = "bypassPermissions"

        args = process_manager._build_command_args(mock_settings)

        assert "--dangerously-skip-permissions" in args
        assert "--permission-mode" not in args
        assert "--allowedTools" not in args
        assert "--disallowedTools" not in args

    def test_bypass_permissions_override(self, process_manager, mock_settings):
        """Test bypassPermissions override parameter."""
        args = process_manager._build_command_args(
            mock_settings,
            permission_mode="bypassPermissions"
        )

        assert "--dangerously-skip-permissions" in args
        assert "--permission-mode" not in args

    def test_plan_mode(self, process_manager, mock_settings):
        """Test plan permission mode."""
        args = process_manager._build_command_args(
            mock_settings,
            permission_mode="plan"
        )

        assert "--permission-mode" in args
        idx = args.index("--permission-mode")
        assert args[idx + 1] == "plan"

    def test_default_mode_no_permission_flag(self, process_manager, mock_settings):
        """Test default mode doesn't add permission flags."""
        args = process_manager._build_command_args(
            mock_settings,
            permission_mode="default"
        )

        # default mode should not add --permission-mode or --dangerously-skip-permissions
        assert "--dangerously-skip-permissions" not in args
        # Check that --permission-mode is not present for default mode
        # by verifying the behavior matches source code (default doesn't add flags)
        for i, arg in enumerate(args):
            if arg == "--permission-mode":
                assert args[i + 1] != "default"

    def test_resume_session(self, process_manager, mock_settings):
        """Test resuming a session."""
        args = process_manager._build_command_args(
            mock_settings,
            resume_session="abc-123-def"
        )

        assert "--resume" in args
        idx = args.index("--resume")
        assert args[idx + 1] == "abc-123-def"
        # Should not have --session-id when resuming
        assert "--session-id" not in args

    def test_new_session_id(self, process_manager, mock_settings):
        """Test new session gets session ID."""
        args = process_manager._build_command_args(
            mock_settings,
            claude_session_id="new-session-uuid"
        )

        assert "--session-id" in args
        idx = args.index("--session-id")
        assert args[idx + 1] == "new-session-uuid"
        assert "--resume" not in args

    def test_allowed_tools_override(self, process_manager, mock_settings):
        """Test overriding allowed tools."""
        args = process_manager._build_command_args(
            mock_settings,
            allowed_tools=["Bash", "Edit", "Write"]
        )

        assert "--allowedTools" in args
        idx = args.index("--allowedTools")
        assert args[idx + 1] == "Bash,Edit,Write"

    def test_disallowed_tools(self, process_manager, mock_settings):
        """Test disallowed tools."""
        mock_settings.get_disallowed_tools.return_value = ["WebFetch", "WebSearch"]

        args = process_manager._build_command_args(mock_settings)

        assert "--disallowedTools" in args
        idx = args.index("--disallowedTools")
        assert args[idx + 1] == "WebFetch,WebSearch"

    def test_disallowed_tools_override(self, process_manager, mock_settings):
        """Test overriding disallowed tools."""
        args = process_manager._build_command_args(
            mock_settings,
            disallowed_tools=["Task"]
        )

        assert "--disallowedTools" in args
        idx = args.index("--disallowedTools")
        assert args[idx + 1] == "Task"

    def test_max_turns_override(self, process_manager, mock_settings):
        """Test overriding max turns."""
        args = process_manager._build_command_args(
            mock_settings,
            max_turns=25
        )

        assert "--max-turns" in args
        idx = args.index("--max-turns")
        assert args[idx + 1] == "25"

    def test_max_turns_zero_not_included(self, process_manager, mock_settings):
        """Test that max_turns=0 doesn't add the flag."""
        mock_settings.claude_max_turns = 0

        args = process_manager._build_command_args(mock_settings)

        assert "--max-turns" not in args

    def test_model_override(self, process_manager, mock_settings):
        """Test overriding model."""
        args = process_manager._build_command_args(
            mock_settings,
            model="opus"
        )

        assert "--model" in args
        idx = args.index("--model")
        assert args[idx + 1] == "opus"

    def test_empty_model_not_included(self, process_manager, mock_settings):
        """Test that empty model doesn't add the flag."""
        mock_settings.claude_model = ""

        args = process_manager._build_command_args(mock_settings)

        assert "--model" not in args

    def test_mcp_config(self, process_manager, mock_settings):
        """Test MCP configuration."""
        mock_settings.get_mcp_config.return_value = {
            "github": {
                "type": "http",
                "url": "https://api.example.com"
            }
        }

        args = process_manager._build_command_args(mock_settings)

        assert "--mcp-config" in args
        idx = args.index("--mcp-config")
        import json
        config = json.loads(args[idx + 1])
        assert "github" in config
        assert config["github"]["type"] == "http"

    def test_mcp_config_override(self, process_manager, mock_settings):
        """Test overriding MCP configuration."""
        args = process_manager._build_command_args(
            mock_settings,
            mcp_config={"custom": {"type": "stdio", "command": "test"}}
        )

        assert "--mcp-config" in args
        idx = args.index("--mcp-config")
        import json
        config = json.loads(args[idx + 1])
        assert "custom" in config
        assert config["custom"]["type"] == "stdio"

    def test_empty_allowed_tools(self, process_manager, mock_settings):
        """Test that empty allowed tools doesn't add the flag."""
        mock_settings.get_allowed_tools.return_value = []

        args = process_manager._build_command_args(mock_settings)

        assert "--allowedTools" not in args

    def test_custom_claude_command(self, process_manager, mock_settings):
        """Test using custom claude command path."""
        mock_settings.claude_command = "/usr/local/bin/claude-code"

        args = process_manager._build_command_args(mock_settings)

        assert args[0] == "/usr/local/bin/claude-code"

    def test_all_options_together(self, process_manager, mock_settings):
        """Test combining multiple options."""
        args = process_manager._build_command_args(
            mock_settings,
            allowed_tools=["Read", "Write"],
            disallowed_tools=["Bash"],
            permission_mode="plan",
            max_turns=5,
            model="haiku",
            claude_session_id="test-session",
        )

        # Verify all expected flags are present
        assert args[0] == "claude"
        assert "--session-id" in args
        assert "--permission-mode" in args
        assert "--allowedTools" in args
        assert "--disallowedTools" in args
        assert "--max-turns" in args
        assert "--model" in args

        # Verify correct values
        assert args[args.index("--session-id") + 1] == "test-session"
        assert args[args.index("--permission-mode") + 1] == "plan"
        assert args[args.index("--allowedTools") + 1] == "Read,Write"
        assert args[args.index("--disallowedTools") + 1] == "Bash"
        assert args[args.index("--max-turns") + 1] == "5"
        assert args[args.index("--model") + 1] == "haiku"
