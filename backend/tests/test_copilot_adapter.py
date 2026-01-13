"""Tests for Copilot CLI adapter."""

import pytest
from pathlib import Path
from app.cli import CLIType
from app.cli.copilot_adapter import CopilotAdapter


class TestCopilotAdapter:
    """Tests for GitHub Copilot CLI adapter."""

    @pytest.fixture
    def adapter(self):
        return CopilotAdapter()

    def test_cli_type(self, adapter):
        """Has correct CLI type."""
        assert adapter.cli_type == CLIType.COPILOT

    def test_display_name(self, adapter):
        """Has correct display name."""
        assert adapter.display_name == "GitHub Copilot CLI"

    def test_capabilities(self, adapter):
        """Has expected capabilities."""
        caps = adapter.capabilities
        assert caps.supports_headless is True
        assert caps.supports_resume is True
        assert caps.supports_session_id is False
        assert caps.supports_tool_allowlist is True
        assert caps.supports_permission_modes is True
        assert caps.supports_max_turns is False
        assert caps.output_format == "text"

    def test_discovery_config(self, adapter):
        """Has correct discovery config."""
        config = adapter.discovery_config
        assert config.base_dir == Path.home() / ".copilot"
        assert config.session_pattern == "session-state/**/*"
        assert config.file_extension == "json"
        assert config.uses_project_hash is False

    def test_build_interactive_command_basic(self, adapter):
        """Builds basic interactive command."""
        cmd = adapter.build_interactive_command("/path/to/project")
        assert cmd[0] == adapter.command_name

    def test_build_interactive_command_with_resume(self, adapter):
        """Builds interactive command with resume."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            resume_session="session-123"
        )
        assert "--resume" in cmd
        idx = cmd.index("--resume")
        assert cmd[idx + 1] == "session-123"

    def test_build_interactive_command_bypass_permissions(self, adapter):
        """Bypass permissions uses --yolo flag."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            permission_mode="bypassPermissions"
        )
        assert "--yolo" in cmd
        assert "--allow-all-tools" not in cmd  # Verified removal

    def test_build_interactive_command_accept_edits(self, adapter):
        """Accept edits allows 'write' tool."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            permission_mode="acceptEdits"
        )
        assert "--allow-tool" in cmd
        idx = cmd.index("--allow-tool")
        assert cmd[idx + 1] == "write"

    def test_build_interactive_command_with_allowed_tools(self, adapter):
        """Builds command with allowed tools."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            allowed_tools=["Read", "Bash"]
        )
        # Assuming normalize_tool handles casing/mapping
        # Bash -> shell usually in copilot adapter logic
        assert "--allow-tool" in cmd
        assert "shell" in cmd  # Normalized Bash -> shell
        assert "Read" in cmd or "read" in cmd # Depending on logic, let's check exact

    def test_build_interactive_command_normalization(self, adapter):
        """Tests tool name normalization."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            allowed_tools=["bash", "bash(command)"]
        )
        assert "shell" in cmd
        assert "shell(command)" in cmd

    def test_build_headless_command_basic(self, adapter):
        """Builds basic headless command."""
        cmd = adapter.build_headless_command(
            "Analyze this",
            "/path/to/project"
        )
        assert cmd[0] == adapter.command_name
        assert "--prompt" in cmd
        assert "Analyze this" in cmd
