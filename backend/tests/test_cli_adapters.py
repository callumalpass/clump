"""Tests for CLI adapters (Claude, Gemini, Codex)."""

import pytest
from pathlib import Path
from unittest.mock import patch

from app.cli import (
    CLIAdapter,
    CLICapabilities,
    CLIType,
    SessionDiscoveryConfig,
    SessionInfo,
    get_adapter,
    get_all_adapters,
    get_default_adapter,
    is_cli_installed,
    get_cli_info,
)
from app.cli.claude_adapter import ClaudeAdapter
from app.cli.gemini_adapter import GeminiAdapter
from app.cli.codex_adapter import CodexAdapter


class TestCLIType:
    """Tests for CLIType enum."""

    def test_cli_types_exist(self):
        """All expected CLI types exist."""
        assert CLIType.CLAUDE == "claude"
        assert CLIType.GEMINI == "gemini"
        assert CLIType.CODEX == "codex"

    def test_cli_type_values(self):
        """CLI types have correct string values."""
        assert CLIType.CLAUDE.value == "claude"
        assert CLIType.GEMINI.value == "gemini"
        assert CLIType.CODEX.value == "codex"


class TestCLIRegistry:
    """Tests for CLI adapter registry functions."""

    def test_get_adapter_by_enum(self):
        """Can get adapter by CLIType enum."""
        adapter = get_adapter(CLIType.CLAUDE)
        assert isinstance(adapter, ClaudeAdapter)

    def test_get_adapter_by_string(self):
        """Can get adapter by string value."""
        adapter = get_adapter("claude")
        assert isinstance(adapter, ClaudeAdapter)

    def test_get_adapter_gemini(self):
        """Can get Gemini adapter."""
        adapter = get_adapter(CLIType.GEMINI)
        assert isinstance(adapter, GeminiAdapter)

    def test_get_adapter_codex(self):
        """Can get Codex adapter."""
        adapter = get_adapter(CLIType.CODEX)
        assert isinstance(adapter, CodexAdapter)

    def test_get_adapter_invalid_type(self):
        """Raises ValueError for invalid CLI type."""
        with pytest.raises(ValueError, match="Unknown CLI type"):
            get_adapter("invalid")

    def test_get_default_adapter(self):
        """Default adapter is Claude."""
        adapter = get_default_adapter()
        assert isinstance(adapter, ClaudeAdapter)
        assert adapter.cli_type == CLIType.CLAUDE

    def test_get_all_adapters(self):
        """get_all_adapters returns all three adapters."""
        adapters = get_all_adapters()
        assert len(adapters) == 3
        types = {a.cli_type for a in adapters}
        assert types == {CLIType.CLAUDE, CLIType.GEMINI, CLIType.CODEX}

    def test_adapter_singleton(self):
        """Same adapter instance is returned for same type."""
        adapter1 = get_adapter(CLIType.CLAUDE)
        adapter2 = get_adapter(CLIType.CLAUDE)
        assert adapter1 is adapter2

    def test_get_cli_info(self):
        """get_cli_info returns info for all CLIs."""
        info = get_cli_info()
        assert len(info) == 3

        # Check structure
        for cli in info:
            assert "type" in cli
            assert "name" in cli
            assert "command" in cli
            assert "installed" in cli
            assert "capabilities" in cli

            caps = cli["capabilities"]
            assert "headless" in caps
            assert "resume" in caps
            assert "session_id" in caps


class TestClaudeAdapter:
    """Tests for Claude Code adapter."""

    @pytest.fixture
    def adapter(self):
        return ClaudeAdapter()

    def test_cli_type(self, adapter):
        """Has correct CLI type."""
        assert adapter.cli_type == CLIType.CLAUDE

    def test_display_name(self, adapter):
        """Has correct display name."""
        assert adapter.display_name == "Claude Code"

    def test_capabilities(self, adapter):
        """Has expected capabilities."""
        caps = adapter.capabilities
        assert caps.supports_headless is True
        assert caps.supports_resume is True
        assert caps.supports_session_id is True
        assert caps.supports_tool_allowlist is True
        assert caps.supports_permission_modes is True
        assert caps.supports_max_turns is True
        assert caps.output_format == "stream-json"

    def test_discovery_config(self, adapter):
        """Has correct discovery config."""
        config = adapter.discovery_config
        assert config.base_dir == Path.home() / ".claude"
        assert config.file_extension == "jsonl"
        assert config.uses_project_hash is True

    def test_encode_path(self, adapter):
        """Encodes paths correctly."""
        encoded = adapter.encode_path("/home/user/project")
        assert encoded == "-home-user-project"

    def test_decode_path(self, adapter):
        """Decodes paths correctly."""
        decoded = adapter.decode_path("-home-user-project")
        assert decoded == "/home/user/project"

    def test_build_interactive_command_basic(self, adapter):
        """Builds basic interactive command."""
        cmd = adapter.build_interactive_command("/path/to/project")
        assert cmd[0] == adapter.command_name
        # Should not have resume or session-id flags
        assert "--resume" not in cmd
        assert "--session-id" not in cmd

    def test_build_interactive_command_with_session_id(self, adapter):
        """Builds interactive command with session ID."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            session_id="test-session-123"
        )
        assert "--session-id" in cmd
        idx = cmd.index("--session-id")
        assert cmd[idx + 1] == "test-session-123"

    def test_build_interactive_command_with_resume(self, adapter):
        """Builds interactive command with resume."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            resume_session="session-to-resume"
        )
        assert "--resume" in cmd
        idx = cmd.index("--resume")
        assert cmd[idx + 1] == "session-to-resume"

    def test_build_interactive_command_with_allowed_tools(self, adapter):
        """Builds command with allowed tools."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            allowed_tools=["Read", "Write", "Bash"]
        )
        assert "--allowedTools" in cmd
        idx = cmd.index("--allowedTools")
        assert cmd[idx + 1] == "Read,Write,Bash"

    def test_build_interactive_command_bypass_permissions(self, adapter):
        """Bypass permissions adds correct flag."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            permission_mode="bypassPermissions"
        )
        assert "--dangerously-skip-permissions" in cmd
        assert "--permission-mode" not in cmd

    def test_build_headless_command_basic(self, adapter):
        """Builds basic headless command."""
        cmd = adapter.build_headless_command(
            "Analyze this code",
            "/path/to/project"
        )
        assert cmd[0] == adapter.command_name
        assert "-p" in cmd
        assert "Analyze this code" in cmd
        assert "--output-format" in cmd
        assert "--verbose" in cmd

    def test_build_headless_command_with_system_prompt(self, adapter):
        """Builds headless command with system prompt."""
        cmd = adapter.build_headless_command(
            "Do something",
            "/path/to/project",
            system_prompt="You are a code reviewer."
        )
        assert "--append-system-prompt" in cmd
        idx = cmd.index("--append-system-prompt")
        assert cmd[idx + 1] == "You are a code reviewer."

    def test_get_resume_session_id(self, adapter):
        """Resume session ID is unchanged for Claude."""
        assert adapter.get_resume_session_id("abc-123") == "abc-123"


class TestGeminiAdapter:
    """Tests for Gemini CLI adapter."""

    @pytest.fixture
    def adapter(self):
        return GeminiAdapter()

    def test_cli_type(self, adapter):
        """Has correct CLI type."""
        assert adapter.cli_type == CLIType.GEMINI

    def test_display_name(self, adapter):
        """Has correct display name."""
        assert adapter.display_name == "Gemini CLI"

    def test_capabilities(self, adapter):
        """Has expected capabilities."""
        caps = adapter.capabilities
        assert caps.supports_headless is True
        assert caps.supports_resume is True
        assert caps.supports_session_id is False  # Gemini doesn't support custom session IDs
        assert caps.supports_tool_allowlist is True
        assert caps.supports_permission_modes is True
        assert caps.supports_max_turns is False  # Gemini doesn't have max turns
        assert caps.output_format == "stream-json"

    def test_discovery_config(self, adapter):
        """Has correct discovery config."""
        config = adapter.discovery_config
        assert config.base_dir == Path.home() / ".gemini"
        assert config.file_extension == "json"
        assert config.uses_project_hash is True

    def test_encode_path_uses_sha256(self, adapter):
        """Encodes paths using SHA256."""
        encoded = adapter.encode_path("/home/user/project")
        # SHA256 produces 64 character hex string
        assert len(encoded) == 64
        assert all(c in "0123456789abcdef" for c in encoded)

    def test_decode_path_returns_none(self, adapter):
        """Decoding SHA256 paths returns None (irreversible)."""
        decoded = adapter.decode_path("abcdef1234567890")
        assert decoded is None

    def test_permission_mode_mapping(self, adapter):
        """Permission modes map correctly to Gemini approval modes."""
        assert adapter._map_permission_mode("default") == "default"
        assert adapter._map_permission_mode("plan") == "default"
        assert adapter._map_permission_mode("acceptEdits") == "auto_edit"
        assert adapter._map_permission_mode("bypassPermissions") == "yolo"

    def test_build_interactive_command_basic(self, adapter):
        """Builds basic interactive command."""
        cmd = adapter.build_interactive_command("/path/to/project")
        assert cmd[0] == adapter.command_name

    def test_build_interactive_command_with_resume(self, adapter):
        """Builds interactive command with resume."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            resume_session="full-uuid-here"
        )
        assert "--resume" in cmd
        idx = cmd.index("--resume")
        assert cmd[idx + 1] == "full-uuid-here"

    def test_build_interactive_command_with_allowed_tools(self, adapter):
        """Gemini uses separate --allowed-tools flags for each tool."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            allowed_tools=["Read", "Write"]
        )
        # Gemini uses --allowed-tools (with hyphen), once per tool
        tool_count = cmd.count("--allowed-tools")
        assert tool_count == 2

    def test_build_interactive_command_bypass_permissions(self, adapter):
        """Bypass permissions maps to yolo mode."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            permission_mode="bypassPermissions"
        )
        assert "--approval-mode" in cmd
        idx = cmd.index("--approval-mode")
        assert cmd[idx + 1] == "yolo"

    def test_build_headless_command_basic(self, adapter):
        """Builds basic headless command with prompt at end."""
        cmd = adapter.build_headless_command(
            "Analyze this",
            "/path/to/project"
        )
        assert cmd[0] == adapter.command_name
        assert "-o" in cmd
        # Prompt should be at the end
        assert cmd[-1] == "Analyze this"

    def test_get_resume_session_id(self, adapter):
        """Extracts short UUID from filename-style session ID."""
        result = adapter.get_resume_session_id("session-2025-12-15T21-28-a51b3ff5")
        assert result == "a51b3ff5"


class TestCodexAdapter:
    """Tests for Codex CLI adapter."""

    @pytest.fixture
    def adapter(self):
        return CodexAdapter()

    def test_cli_type(self, adapter):
        """Has correct CLI type."""
        assert adapter.cli_type == CLIType.CODEX

    def test_display_name(self, adapter):
        """Has correct display name."""
        assert adapter.display_name == "Codex CLI"

    def test_capabilities(self, adapter):
        """Has expected capabilities."""
        caps = adapter.capabilities
        assert caps.supports_headless is True
        assert caps.supports_resume is True
        assert caps.supports_session_id is False  # Codex auto-generates IDs
        assert caps.supports_tool_allowlist is False  # Uses sandbox modes
        assert caps.supports_permission_modes is True
        assert caps.supports_max_turns is False
        assert caps.output_format == "json"

    def test_discovery_config(self, adapter):
        """Has correct discovery config."""
        config = adapter.discovery_config
        assert config.base_dir == Path.home() / ".codex"
        assert config.file_extension == "jsonl"
        assert config.date_based_dirs is True

    def test_encode_path(self, adapter):
        """Codex uses date-based paths, not project path encoding."""
        encoded = adapter.encode_path("/home/user/project")
        # Codex returns YYYY/MM/DD format for the current date
        # Verify it matches a date pattern
        import re
        assert re.match(r"\d{4}/\d{2}/\d{2}", encoded)

    def test_permission_mode_to_approval(self, adapter):
        """Permission modes map correctly to Codex approval policies."""
        assert adapter._map_permission_mode("default") == "untrusted"
        assert adapter._map_permission_mode("plan") == "untrusted"
        assert adapter._map_permission_mode("acceptEdits") == "on-failure"
        assert adapter._map_permission_mode("bypassPermissions") == "never"

    def test_permission_mode_to_sandbox(self, adapter):
        """Permission modes map correctly to Codex sandbox modes."""
        assert adapter._map_permission_to_sandbox("default") == "workspace-write"
        assert adapter._map_permission_to_sandbox("plan") == "read-only"
        assert adapter._map_permission_to_sandbox("acceptEdits") == "workspace-write"
        assert adapter._map_permission_to_sandbox("bypassPermissions") == "danger-full-access"

    def test_build_interactive_command_basic(self, adapter):
        """Builds basic interactive command."""
        cmd = adapter.build_interactive_command("/path/to/project")
        assert cmd[0] == adapter.command_name

    def test_build_interactive_command_with_resume(self, adapter):
        """Resume uses 'resume' subcommand."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            resume_session="session-uuid"
        )
        # Codex uses: codex resume <session-id>
        assert "resume" in cmd
        assert "session-uuid" in cmd

    def test_build_interactive_command_working_dir(self, adapter):
        """Working directory is passed with -C flag."""
        cmd = adapter.build_interactive_command("/path/to/project")
        assert "-C" in cmd
        idx = cmd.index("-C")
        assert cmd[idx + 1] == "/path/to/project"

    def test_build_headless_command_uses_exec(self, adapter):
        """Headless mode uses 'exec' subcommand."""
        cmd = adapter.build_headless_command(
            "Do something",
            "/path/to/project"
        )
        assert cmd[0] == adapter.command_name
        assert "exec" in cmd
        assert "--json" in cmd
        # Prompt at end
        assert cmd[-1] == "Do something"


class TestSessionInfo:
    """Tests for SessionInfo dataclass."""

    def test_creates_with_minimal_fields(self):
        """Can create with just session_id."""
        info = SessionInfo(session_id="test-123")
        assert info.session_id == "test-123"
        assert info.title is None
        assert info.message_count == 0

    def test_creates_with_all_fields(self):
        """Can create with all fields."""
        info = SessionInfo(
            session_id="test-123",
            title="Test Session",
            model="claude-3-opus",
            start_time="2025-01-01T00:00:00Z",
            end_time="2025-01-01T01:00:00Z",
            message_count=10,
            cwd="/home/user/project",
            git_branch="main",
            cli_version="1.0.0",
        )
        assert info.session_id == "test-123"
        assert info.title == "Test Session"
        assert info.model == "claude-3-opus"
        assert info.message_count == 10


class TestCLICapabilities:
    """Tests for CLICapabilities dataclass."""

    def test_default_values(self):
        """Default values are sensible."""
        caps = CLICapabilities()
        assert caps.supports_headless is True
        assert caps.supports_resume is True
        assert caps.supports_session_id is True
        assert caps.supports_tool_allowlist is True
        assert caps.supports_permission_modes is True
        assert caps.supports_max_turns is True
        assert caps.output_format == "stream-json"

    def test_custom_values(self):
        """Can override default values."""
        caps = CLICapabilities(
            supports_session_id=False,
            supports_max_turns=False,
            output_format="json"
        )
        assert caps.supports_session_id is False
        assert caps.supports_max_turns is False
        assert caps.output_format == "json"


class TestAdapterPathMethods:
    """Tests for adapter path handling methods."""

    def test_get_sessions_dir_claude(self):
        """Claude sessions dir uses encoded path."""
        adapter = ClaudeAdapter()
        sessions_dir = adapter.get_sessions_dir("/home/user/project")
        expected = Path.home() / ".claude" / "projects" / "-home-user-project"
        assert sessions_dir == expected

    def test_get_sessions_dir_gemini(self):
        """Gemini sessions dir uses hash and chats subdirectory."""
        adapter = GeminiAdapter()
        sessions_dir = adapter.get_sessions_dir("/home/user/project")
        # Should be ~/.gemini/tmp/{hash}/chats
        assert sessions_dir.parts[-1] == "chats"
        assert sessions_dir.parts[-3] == "tmp"

    def test_get_sidecar_path(self):
        """Sidecar path is in clump directory."""
        adapter = ClaudeAdapter()
        sidecar = adapter.get_sidecar_path("session-123", "/home/user/project")
        # Should be ~/.clump/projects/{encoded}/session-123.json
        assert sidecar.suffix == ".json"
        assert sidecar.stem == "session-123"
        assert ".clump" in str(sidecar)
