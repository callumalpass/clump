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
    get_installed_adapters,
    get_adapter_by_command,
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


class TestCLIInstalledChecks:
    """Tests for is_cli_installed and related functions."""

    def test_is_cli_installed_returns_bool(self):
        """is_cli_installed returns a boolean."""
        result = is_cli_installed(CLIType.CLAUDE)
        assert isinstance(result, bool)

    def test_is_cli_installed_accepts_string(self):
        """is_cli_installed accepts string CLI type."""
        result = is_cli_installed("claude")
        assert isinstance(result, bool)

    def test_is_cli_installed_with_valid_command(self):
        """is_cli_installed returns True when command is found on PATH."""
        # 'python' should be installed in any test environment
        with patch("shutil.which", return_value="/usr/bin/python"):
            result = is_cli_installed(CLIType.CLAUDE)
            assert result is True

    def test_is_cli_installed_with_missing_command(self):
        """is_cli_installed returns False when command not found."""
        with patch("shutil.which", return_value=None):
            result = is_cli_installed(CLIType.CLAUDE)
            assert result is False

    def test_is_cli_installed_checks_correct_command_name(self):
        """is_cli_installed checks the adapter's command_name."""
        # Verify it calls shutil.which with the correct command
        with patch("shutil.which") as mock_which:
            mock_which.return_value = None
            is_cli_installed(CLIType.CLAUDE)
            mock_which.assert_called_once_with("claude")

        with patch("shutil.which") as mock_which:
            mock_which.return_value = None
            is_cli_installed(CLIType.GEMINI)
            mock_which.assert_called_once_with("gemini")

        with patch("shutil.which") as mock_which:
            mock_which.return_value = None
            is_cli_installed(CLIType.CODEX)
            mock_which.assert_called_once_with("codex")


class TestGetInstalledAdapters:
    """Tests for get_installed_adapters function."""

    def test_returns_empty_list_when_none_installed(self):
        """Returns empty list when no CLIs are installed."""
        with patch("app.cli.registry.shutil.which", return_value=None):
            result = get_installed_adapters()
            assert result == []

    def test_returns_all_when_all_installed(self):
        """Returns all adapters when all CLIs are installed."""
        with patch("app.cli.registry.shutil.which", return_value="/usr/bin/cmd"):
            result = get_installed_adapters()
            assert len(result) == 3
            types = {a.cli_type for a in result}
            assert types == {CLIType.CLAUDE, CLIType.GEMINI, CLIType.CODEX}

    def test_returns_only_installed_adapters(self):
        """Returns only adapters for installed CLIs."""
        def which_side_effect(cmd):
            if cmd == "claude":
                return "/usr/bin/claude"
            return None

        with patch("app.cli.registry.shutil.which", side_effect=which_side_effect):
            result = get_installed_adapters()
            assert len(result) == 1
            assert result[0].cli_type == CLIType.CLAUDE

    def test_returns_adapters_not_just_types(self):
        """Returns actual adapter instances, not just types."""
        with patch("app.cli.registry.shutil.which", return_value="/usr/bin/cmd"):
            result = get_installed_adapters()
            for adapter in result:
                assert isinstance(adapter, CLIAdapter)


class TestGetAdapterByCommand:
    """Tests for get_adapter_by_command function."""

    def test_returns_claude_adapter_for_claude_command(self):
        """Returns ClaudeAdapter for 'claude' command."""
        adapter = get_adapter_by_command("claude")
        assert adapter is not None
        assert isinstance(adapter, ClaudeAdapter)
        assert adapter.cli_type == CLIType.CLAUDE

    def test_returns_gemini_adapter_for_gemini_command(self):
        """Returns GeminiAdapter for 'gemini' command."""
        adapter = get_adapter_by_command("gemini")
        assert adapter is not None
        assert isinstance(adapter, GeminiAdapter)
        assert adapter.cli_type == CLIType.GEMINI

    def test_returns_codex_adapter_for_codex_command(self):
        """Returns CodexAdapter for 'codex' command."""
        adapter = get_adapter_by_command("codex")
        assert adapter is not None
        assert isinstance(adapter, CodexAdapter)
        assert adapter.cli_type == CLIType.CODEX

    def test_returns_none_for_unknown_command(self):
        """Returns None for unknown command names."""
        adapter = get_adapter_by_command("unknown-cli")
        assert adapter is None

    def test_returns_none_for_empty_string(self):
        """Returns None for empty command string."""
        adapter = get_adapter_by_command("")
        assert adapter is None

    def test_returns_none_for_similar_but_wrong_command(self):
        """Returns None for commands similar to but not matching any CLI."""
        # These might seem like they should match, but they don't
        assert get_adapter_by_command("Claude") is None  # Case matters
        assert get_adapter_by_command("claude-code") is None
        assert get_adapter_by_command("gemini-cli") is None

    def test_command_matching_is_exact(self):
        """Command matching is exact, not substring or fuzzy."""
        # These contain valid commands as substrings but shouldn't match
        assert get_adapter_by_command("my-claude") is None
        assert get_adapter_by_command("claude ") is None
        assert get_adapter_by_command(" claude") is None


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

    def test_encode_path_with_underscores(self, adapter):
        """Encodes paths with underscores correctly.

        Claude's format replaces both slashes and underscores with dashes.
        This must match storage.encode_path behavior for consistent session discovery.
        """
        encoded = adapter.encode_path("/home/user/my_project")
        assert encoded == "-home-user-my-project"
        assert "_" not in encoded

    def test_decode_path(self, adapter):
        """Decodes paths correctly."""
        decoded = adapter.decode_path("-home-user-project")
        assert decoded == "/home/user/project"

    def test_decode_path_without_leading_dash(self, adapter):
        """Decodes paths without leading dash as relative paths.

        This tests the fix for the bug where paths without a leading dash
        were incorrectly getting a '/' prefix added. The behavior must match
        storage.decode_path for consistency.
        """
        decoded = adapter.decode_path("home-user-project")
        # Should NOT add leading slash - this is a relative path
        assert decoded == "home/user/project"
        # Verify it doesn't start with slash
        assert not decoded.startswith("/")

    def test_decode_path_single_component(self, adapter):
        """Decodes single component path."""
        decoded = adapter.decode_path("-project")
        assert decoded == "/project"

    def test_decode_path_matches_storage_behavior(self, adapter):
        """Ensures decode_path matches storage.decode_path behavior.

        Both functions must produce identical results for session discovery
        and path matching to work correctly across the codebase.
        """
        from app.storage import decode_path as storage_decode_path

        test_cases = [
            "-home-user-project",
            "-home-user-my-project",
            "relative-path",
            "-single",
        ]

        for encoded in test_cases:
            adapter_result = adapter.decode_path(encoded)
            storage_result = storage_decode_path(encoded)
            assert adapter_result == storage_result, (
                f"Mismatch for '{encoded}': "
                f"adapter={adapter_result}, storage={storage_result}"
            )

    def test_encode_decode_consistency(self, adapter):
        """Tests that encode and decode are consistent for absolute paths.

        Note: The encoding is lossy for paths containing dashes or underscores,
        so we test with a path that doesn't have those characters.
        """
        original = "/home/user/project"
        encoded = adapter.encode_path(original)
        decoded = adapter.decode_path(encoded)
        assert decoded == original

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


class TestCodexAdapterSessionDiscovery:
    """Tests for Codex adapter session discovery methods."""

    @pytest.fixture
    def adapter(self):
        return CodexAdapter()

    def test_get_sessions_dir_codex(self, adapter):
        """Codex sessions dir is ~/.codex/sessions."""
        sessions_dir = adapter.get_sessions_dir("/any/path")
        expected = Path.home() / ".codex" / "sessions"
        assert sessions_dir == expected

    def test_get_resume_session_id_extracts_uuid(self, adapter):
        """Extracts UUID from Codex session filename."""
        # Codex filenames look like: rollout-2026-01-01T13-20-18-019b775b-1dc2-7bf1-9681-db60a06cb4cb
        session_id = "rollout-2026-01-01T13-20-18-019b775b-1dc2-7bf1-9681-db60a06cb4cb"
        result = adapter.get_resume_session_id(session_id)
        assert result == "019b775b-1dc2-7bf1-9681-db60a06cb4cb"

    def test_get_resume_session_id_handles_simple_uuid(self, adapter):
        """Returns simple UUID unchanged."""
        session_id = "019b775b-1dc2-7bf1-9681-db60a06cb4cb"
        result = adapter.get_resume_session_id(session_id)
        assert result == "019b775b-1dc2-7bf1-9681-db60a06cb4cb"

    def test_get_resume_session_id_fallback(self, adapter):
        """Returns as-is when no UUID pattern found."""
        session_id = "no-uuid-here"
        result = adapter.get_resume_session_id(session_id)
        assert result == "no-uuid-here"

    def test_find_sessions_for_repo_empty(self, adapter, tmp_path, monkeypatch):
        """Returns empty list when sessions dir doesn't exist."""
        # Monkey-patch get_sessions_dir to use tmp_path
        monkeypatch.setattr(
            adapter,
            "get_sessions_dir",
            lambda repo_path: tmp_path / ".codex" / "sessions"
        )
        result = adapter.find_sessions_for_repo("/home/user/project")
        assert result == []

    def test_find_sessions_for_repo_with_matching_session(self, adapter, tmp_path, monkeypatch):
        """Finds sessions that match the repo path."""
        import json

        # Create directory structure: sessions/2026/01/09/session.jsonl
        sessions_dir = tmp_path / ".codex" / "sessions" / "2026" / "01" / "09"
        sessions_dir.mkdir(parents=True)

        # Create a session file with matching cwd
        # Use absolute resolved path to match how the adapter normalizes paths
        repo_path = tmp_path / "my-project"
        repo_path.mkdir(parents=True, exist_ok=True)
        resolved_path = str(repo_path.resolve())

        session_file = sessions_dir / "test-session.jsonl"
        session_data = {
            "type": "session_meta",
            "payload": {"cwd": resolved_path}
        }
        session_file.write_text(json.dumps(session_data) + "\n")

        # Monkey-patch get_sessions_dir to use tmp_path
        monkeypatch.setattr(
            adapter,
            "get_sessions_dir",
            lambda rp: tmp_path / ".codex" / "sessions"
        )

        result = adapter.find_sessions_for_repo(str(repo_path))

        assert len(result) == 1
        assert result[0] == session_file

    def test_find_sessions_for_repo_excludes_non_matching(self, adapter, tmp_path, monkeypatch):
        """Excludes sessions that don't match the repo path."""
        import json

        # Create directory structure: sessions/2026/01/09/session.jsonl
        sessions_dir = tmp_path / ".codex" / "sessions" / "2026" / "01" / "09"
        sessions_dir.mkdir(parents=True)

        # Create a session file with DIFFERENT cwd
        session_file = sessions_dir / "other-session.jsonl"
        session_data = {
            "type": "session_meta",
            "payload": {"cwd": "/different/project"}
        }
        session_file.write_text(json.dumps(session_data) + "\n")

        # Monkey-patch get_sessions_dir to use tmp_path
        monkeypatch.setattr(
            adapter,
            "get_sessions_dir",
            lambda repo_path: tmp_path / ".codex" / "sessions"
        )

        result = adapter.find_sessions_for_repo("/home/user/project")
        assert len(result) == 0

    def test_find_sessions_glob_pattern_has_four_levels(self, adapter, tmp_path, monkeypatch):
        """Verifies the glob pattern correctly uses year/month/day/file structure."""
        import json

        # Create directory structure with exactly 4 levels as expected by Codex
        sessions_dir = tmp_path / ".codex" / "sessions" / "2026" / "01" / "09"
        sessions_dir.mkdir(parents=True)

        # Also create a 3-level structure to ensure it's NOT matched
        wrong_dir = tmp_path / ".codex" / "sessions" / "2026" / "01"
        wrong_session = wrong_dir / "wrong.jsonl"
        wrong_session.write_text('{"type": "session_meta", "payload": {"cwd": "/test/path"}}\n')

        # Create correct 4-level session with matching path
        test_path = tmp_path / "test-project"
        test_path.mkdir(parents=True, exist_ok=True)
        resolved_path = str(test_path.resolve())

        correct_session = sessions_dir / "correct.jsonl"
        correct_session.write_text(
            f'{{"type": "session_meta", "payload": {{"cwd": "{resolved_path}"}}}}\n'
        )

        # Monkey-patch get_sessions_dir
        monkeypatch.setattr(
            adapter,
            "get_sessions_dir",
            lambda repo_path: tmp_path / ".codex" / "sessions"
        )

        result = adapter.find_sessions_for_repo(str(test_path))

        # Should find the correct session (4-level path)
        assert len(result) == 1
        assert result[0] == correct_session

    def test_find_sessions_for_repo_handles_parse_errors(self, adapter, tmp_path, monkeypatch):
        """Gracefully handles sessions with invalid JSON."""
        # Create directory structure
        sessions_dir = tmp_path / ".codex" / "sessions" / "2026" / "01" / "09"
        sessions_dir.mkdir(parents=True)

        # Create session file with invalid JSON
        invalid_session = sessions_dir / "invalid.jsonl"
        invalid_session.write_text("not valid json\n")

        # Monkey-patch get_sessions_dir
        monkeypatch.setattr(
            adapter,
            "get_sessions_dir",
            lambda repo_path: tmp_path / ".codex" / "sessions"
        )

        # Should not raise, just return empty list
        result = adapter.find_sessions_for_repo("/any/path")
        assert result == []


class TestClaudeAdapterExtractSessionInfo:
    """Tests for ClaudeAdapter.extract_session_info None handling.

    These tests verify the fix for the bug where entry.get('message', {})
    returns None (not {}) when the key exists with value None. The fix uses
    entry.get('message') or {} to correctly fall back to empty dict.
    """

    @pytest.fixture
    def adapter(self):
        return ClaudeAdapter()

    def test_handles_none_message_value(self, adapter):
        """Handles entries where 'message' key exists but value is None."""
        data = {
            "session_id": "test-123",
            "messages": [
                {
                    "type": "assistant",
                    "timestamp": "2025-01-01T00:00:00Z",
                    "message": None,  # Key exists but value is None
                },
            ],
        }
        # Should not raise AttributeError
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-123"
        assert info.model is None  # No model found due to None message

    def test_handles_mixed_none_and_valid_messages(self, adapter):
        """Handles mix of None and valid message values."""
        data = {
            "session_id": "test-456",
            "messages": [
                {
                    "type": "assistant",
                    "timestamp": "2025-01-01T00:00:00Z",
                    "message": None,
                },
                {
                    "type": "assistant",
                    "timestamp": "2025-01-01T00:01:00Z",
                    "message": {"model": "claude-sonnet-4-20250514"},
                },
            ],
        }
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-456"
        assert info.model == "claude-sonnet-4-20250514"

    def test_handles_missing_message_key(self, adapter):
        """Handles entries without 'message' key at all."""
        data = {
            "session_id": "test-789",
            "messages": [
                {
                    "type": "assistant",
                    "timestamp": "2025-01-01T00:00:00Z",
                    # No 'message' key at all
                },
            ],
        }
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-789"
        assert info.model is None

    def test_handles_empty_message_dict(self, adapter):
        """Handles entries with empty message dict."""
        data = {
            "session_id": "test-empty",
            "messages": [
                {
                    "type": "assistant",
                    "timestamp": "2025-01-01T00:00:00Z",
                    "message": {},  # Empty dict, no model
                },
            ],
        }
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-empty"
        assert info.model is None


class TestCodexAdapterParseSessionFileNoneHandling:
    """Tests for CodexAdapter.parse_session_file None handling.

    These tests verify the fix for the bug where entry.get('payload', {})
    returns None (not {}) when the key exists with value None. The fix uses
    entry.get('payload') or {} to correctly fall back to empty dict.
    """

    @pytest.fixture
    def adapter(self):
        return CodexAdapter()

    def test_handles_none_payload_in_session_meta(self, adapter, tmp_path):
        """Handles session_meta entry where payload is explicitly None."""
        import json

        # Create a test session file with None payload
        session_file = tmp_path / "test_session.jsonl"
        entries = [
            {"type": "session_meta", "payload": None},  # Key exists but value is None
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        # Should not raise AttributeError
        result = adapter.parse_session_file(session_file)
        assert result["format"] == "jsonl"
        assert len(result["messages"]) == 1
        # Metadata should be missing/None due to None payload
        assert result.get("session_id") is None
        assert result.get("cwd") is None

    def test_handles_none_git_in_payload(self, adapter, tmp_path):
        """Handles session_meta entry where git is explicitly None."""
        import json

        session_file = tmp_path / "test_session.jsonl"
        entries = [
            {
                "type": "session_meta",
                "payload": {
                    "id": "test-session-123",
                    "timestamp": "2025-01-01T00:00:00Z",
                    "cwd": "/test/path",
                    "cli_version": "1.0.0",
                    "git": None,  # Key exists but value is None
                }
            },
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        # Should not raise AttributeError
        result = adapter.parse_session_file(session_file)
        assert result["session_id"] == "test-session-123"
        assert result["cwd"] == "/test/path"
        # git_branch should not be present when git is None
        assert result.get("git_branch") is None

    def test_handles_valid_payload_with_git(self, adapter, tmp_path):
        """Handles normal session_meta with valid payload and git info."""
        import json

        session_file = tmp_path / "test_session.jsonl"
        entries = [
            {
                "type": "session_meta",
                "payload": {
                    "id": "test-session-456",
                    "timestamp": "2025-01-02T12:00:00Z",
                    "cwd": "/home/user/project",
                    "cli_version": "2.0.0",
                    "git": {
                        "branch": "feature/test",
                        "commit": "abc123",
                    }
                }
            },
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        result = adapter.parse_session_file(session_file)
        assert result["session_id"] == "test-session-456"
        assert result["cwd"] == "/home/user/project"
        assert result["git_branch"] == "feature/test"

    def test_handles_missing_payload_key(self, adapter, tmp_path):
        """Handles session_meta entry without payload key at all."""
        import json

        session_file = tmp_path / "test_session.jsonl"
        entries = [
            {"type": "session_meta"},  # No payload key
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        # Should not raise KeyError or AttributeError
        result = adapter.parse_session_file(session_file)
        assert result["format"] == "jsonl"
        assert result.get("session_id") is None


class TestCodexAdapterExtractSessionInfoNoneHandling:
    """Tests for CodexAdapter.extract_session_info None handling.

    These tests verify the fix for the bug where entry.get('payload', {})
    returns None (not {}) when the key exists with value None.
    """

    @pytest.fixture
    def adapter(self):
        return CodexAdapter()

    def test_handles_none_payload_in_event_msg(self, adapter):
        """Handles event_msg entry where payload is explicitly None."""
        data = {
            "session_id": "test-123",
            "messages": [
                {
                    "type": "event_msg",
                    "payload": None,  # Key exists but value is None
                    "timestamp": "2025-01-01T00:00:00Z",
                },
            ],
        }
        # Should not raise AttributeError
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-123"
        assert info.message_count == 0  # No user messages counted

    def test_handles_none_payload_in_turn_context(self, adapter):
        """Handles turn_context entry where payload is explicitly None."""
        data = {
            "session_id": "test-456",
            "messages": [
                {
                    "type": "turn_context",
                    "payload": None,  # Key exists but value is None
                    "timestamp": "2025-01-01T00:00:00Z",
                },
            ],
        }
        # Should not raise AttributeError
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-456"
        assert info.model is None

    def test_handles_mixed_none_and_valid_payloads(self, adapter):
        """Handles mix of None and valid payload values."""
        data = {
            "session_id": "test-789",
            "messages": [
                {
                    "type": "event_msg",
                    "payload": None,  # None payload
                    "timestamp": "2025-01-01T00:00:00Z",
                },
                {
                    "type": "event_msg",
                    "payload": {"type": "user_message"},  # Valid payload
                    "timestamp": "2025-01-01T00:01:00Z",
                },
                {
                    "type": "turn_context",
                    "payload": {"model": "o1-preview"},  # Valid payload
                    "timestamp": "2025-01-01T00:02:00Z",
                },
            ],
        }
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-789"
        assert info.message_count == 1  # Only one user_message
        assert info.model == "o1-preview"

    def test_handles_missing_payload_key(self, adapter):
        """Handles entries without payload key at all."""
        data = {
            "session_id": "test-no-payload",
            "messages": [
                {
                    "type": "event_msg",
                    # No payload key
                    "timestamp": "2025-01-01T00:00:00Z",
                },
                {
                    "type": "turn_context",
                    # No payload key
                    "timestamp": "2025-01-01T00:01:00Z",
                },
            ],
        }
        # Should not raise KeyError or AttributeError
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-no-payload"
        assert info.message_count == 0
        assert info.model is None

    def test_handles_empty_payload_dict(self, adapter):
        """Handles entries with empty payload dict."""
        data = {
            "session_id": "test-empty-payload",
            "messages": [
                {
                    "type": "event_msg",
                    "payload": {},  # Empty dict
                    "timestamp": "2025-01-01T00:00:00Z",
                },
                {
                    "type": "turn_context",
                    "payload": {},  # Empty dict, no model
                    "timestamp": "2025-01-01T00:01:00Z",
                },
            ],
        }
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-empty-payload"
        assert info.message_count == 0
        assert info.model is None

    def test_extracts_end_time_correctly(self, adapter):
        """Correctly tracks end_time from timestamps."""
        data = {
            "session_id": "test-timestamps",
            "start_time": "2025-01-01T00:00:00Z",
            "messages": [
                {
                    "type": "event_msg",
                    "payload": {"type": "user_message"},
                    "timestamp": "2025-01-01T00:01:00Z",
                },
                {
                    "type": "turn_context",
                    "payload": {"model": "gpt-4"},
                    "timestamp": "2025-01-01T00:02:00Z",
                },
                {
                    "type": "event_msg",
                    "payload": {"type": "completion"},
                    "timestamp": "2025-01-01T00:03:00Z",
                },
            ],
        }
        info = adapter.extract_session_info(data)
        assert info.end_time == "2025-01-01T00:03:00Z"
