"""Tests for CLI adapters (Claude, Gemini, Codex)."""

import json
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

    def test_handles_none_messages_value(self, adapter):
        """Handles data where 'messages' key exists but value is None.

        This tests the fix for the bug where data.get('messages', [])
        returns None (not []) when the key exists but value is None.
        The fix uses data.get('messages') or [] to correctly fall back.
        """
        data = {
            "session_id": "test-none-messages",
            "messages": None,  # Key exists but value is None
        }
        # Should not raise TypeError: 'NoneType' object is not iterable
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-none-messages"
        assert info.message_count == 0
        assert info.model is None

    def test_handles_missing_messages_key(self, adapter):
        """Handles data without 'messages' key at all."""
        data = {
            "session_id": "test-no-messages",
            # No 'messages' key
        }
        # Should not raise KeyError or TypeError
        info = adapter.extract_session_info(data)
        assert info.session_id == "test-no-messages"
        assert info.message_count == 0


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


class TestCodexAdapterFindSessionsErrorHandling:
    """Tests for CodexAdapter.find_sessions_for_repo error handling and logging.

    These tests verify that:
    1. JSON decode errors are logged at debug level (common with malformed files)
    2. OS errors are logged at warning level (permission issues, etc.)
    3. The method continues processing other files after errors
    """

    @pytest.fixture
    def adapter(self):
        return CodexAdapter()

    def test_logs_json_decode_error_at_debug_level(self, adapter, tmp_path, monkeypatch, caplog):
        """JSON decode errors from parse_session_file are logged at debug level.

        Note: parse_session_file handles per-line JSON errors internally for JSONL files.
        This test verifies logging when the method itself raises JSONDecodeError, which can
        happen if we mock it to do so (simulating a future scenario or corrupted file).
        """
        import logging

        # Create directory structure
        sessions_dir = tmp_path / ".codex" / "sessions" / "2026" / "01" / "09"
        sessions_dir.mkdir(parents=True)

        # Create session file
        session_file = sessions_dir / "test.jsonl"
        session_file.write_text('{"type": "session_meta"}\n')

        # Mock parse_session_file to raise JSONDecodeError (simulating a corrupted file)
        def mock_parse_that_raises(file_path):
            raise json.JSONDecodeError("Test error", "doc", 0)

        monkeypatch.setattr(
            adapter,
            "get_sessions_dir",
            lambda repo_path: tmp_path / ".codex" / "sessions"
        )
        monkeypatch.setattr(adapter, "parse_session_file", mock_parse_that_raises)

        with caplog.at_level(logging.DEBUG):
            result = adapter.find_sessions_for_repo("/any/path")

        # Should log the error at debug level
        assert any(
            "Skipping malformed Codex session file" in record.message
            and record.levelno == logging.DEBUG
            for record in caplog.records
        )
        # Should return empty list (no valid sessions)
        assert result == []

    def test_continues_after_json_error(self, adapter, tmp_path, monkeypatch):
        """Continues processing after encountering invalid JSON."""
        import json

        # Create directory structure
        sessions_dir = tmp_path / ".codex" / "sessions" / "2026" / "01" / "09"
        sessions_dir.mkdir(parents=True)

        # Create valid test path
        test_path = tmp_path / "my-project"
        test_path.mkdir(parents=True, exist_ok=True)
        resolved_path = str(test_path.resolve())

        # Create invalid session file
        invalid_session = sessions_dir / "invalid.jsonl"
        invalid_session.write_text("not json\n")

        # Create valid session file that matches
        valid_session = sessions_dir / "valid.jsonl"
        valid_session.write_text(
            f'{{"type": "session_meta", "payload": {{"cwd": "{resolved_path}"}}}}\n'
        )

        # Monkey-patch get_sessions_dir
        monkeypatch.setattr(
            adapter,
            "get_sessions_dir",
            lambda repo_path: tmp_path / ".codex" / "sessions"
        )

        result = adapter.find_sessions_for_repo(str(test_path))

        # Should still find the valid session
        assert len(result) == 1
        assert result[0] == valid_session

    def test_logs_os_error_at_warning_level(self, adapter, tmp_path, monkeypatch, caplog):
        """OS errors (permissions, etc.) are logged at warning level."""
        import logging

        # Create directory structure
        sessions_dir = tmp_path / ".codex" / "sessions" / "2026" / "01" / "09"
        sessions_dir.mkdir(parents=True)

        # Create session file
        session_file = sessions_dir / "test.jsonl"
        session_file.write_text('{"type": "session_meta", "payload": {}}\n')

        # Mock parse_session_file to raise OSError
        def mock_parse_that_raises(file_path):
            raise OSError("Permission denied")

        monkeypatch.setattr(
            adapter,
            "get_sessions_dir",
            lambda repo_path: tmp_path / ".codex" / "sessions"
        )
        monkeypatch.setattr(adapter, "parse_session_file", mock_parse_that_raises)

        with caplog.at_level(logging.WARNING):
            result = adapter.find_sessions_for_repo("/any/path")

        # Should log the error at warning level
        assert any(
            "Failed to read Codex session file" in record.message
            and record.levelno == logging.WARNING
            for record in caplog.records
        )
        assert result == []


class TestCodexAdapterResumeIdFromFile:
    """Tests for CodexAdapter.get_resume_id_from_file method.

    This tests the implementation that reads the internal session ID from
    the session file, falling back to filename extraction when necessary.
    """

    @pytest.fixture
    def adapter(self):
        return CodexAdapter()

    def test_returns_internal_session_id_when_available(self, adapter, tmp_path):
        """Returns internal session ID from session_meta payload."""
        import json

        # Create valid session file with internal session ID
        session_file = tmp_path / "rollout-2026-01-01T13-20-18-dummy.jsonl"
        entries = [
            {
                "type": "session_meta",
                "payload": {
                    "id": "internal-uuid-12345678-abcd-efgh-ijkl-mnopqrstuvwx",
                    "cwd": "/test/path",
                }
            }
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        result = adapter.get_resume_id_from_file(
            session_file,
            "rollout-2026-01-01T13-20-18-019b775b-1dc2-7bf1-9681-db60a06cb4cb"
        )

        # Should return the internal session ID, not the filename-based one
        assert result == "internal-uuid-12345678-abcd-efgh-ijkl-mnopqrstuvwx"

    def test_falls_back_when_no_internal_id(self, adapter, tmp_path):
        """Falls back to filename extraction when internal ID is missing."""
        import json

        # Create valid session file without internal session ID
        session_file = tmp_path / "test.jsonl"
        entries = [
            {
                "type": "session_meta",
                "payload": {"cwd": "/test/path"}  # No "id" field
            }
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        result = adapter.get_resume_id_from_file(
            session_file,
            "rollout-2026-01-01T13-20-18-019b775b-1dc2-7bf1-9681-db60a06cb4cb"
        )

        # Should fall back to filename UUID extraction
        assert result == "019b775b-1dc2-7bf1-9681-db60a06cb4cb"

    def test_falls_back_when_session_id_is_none(self, adapter, tmp_path):
        """Falls back when session_id exists but is None."""
        import json

        session_file = tmp_path / "test.jsonl"
        entries = [
            {
                "type": "session_meta",
                "payload": {
                    "id": None,  # Explicitly None
                    "cwd": "/test/path"
                }
            }
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        result = adapter.get_resume_id_from_file(
            session_file,
            "rollout-2026-01-01T13-20-18-abcd1234-5678-9012-3456-789012345678"
        )

        # Should fall back to filename UUID extraction
        assert result == "abcd1234-5678-9012-3456-789012345678"

    def test_falls_back_when_payload_is_none(self, adapter, tmp_path):
        """Falls back when payload is None."""
        import json

        session_file = tmp_path / "test.jsonl"
        entries = [
            {
                "type": "session_meta",
                "payload": None
            }
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        result = adapter.get_resume_id_from_file(
            session_file,
            "rollout-2026-01-01T13-20-18-11112222-3333-4444-5555-666677778888"
        )

        # Should fall back to filename UUID extraction
        assert result == "11112222-3333-4444-5555-666677778888"

    def test_falls_back_for_empty_file(self, adapter, tmp_path):
        """Falls back when file is empty."""
        session_file = tmp_path / "empty.jsonl"
        session_file.write_text("")

        result = adapter.get_resume_id_from_file(
            session_file,
            "rollout-2026-01-01T13-20-18-aaaabbbb-cccc-dddd-eeee-ffffffffffff"
        )

        # Should fall back to filename UUID extraction
        assert result == "aaaabbbb-cccc-dddd-eeee-ffffffffffff"

    def test_logs_json_decode_error_at_debug_level(self, adapter, tmp_path, caplog, monkeypatch):
        """JSON decode errors are logged at debug level.

        Note: parse_session_file handles per-line JSON errors internally for JSONL files.
        This test verifies logging when the method itself raises JSONDecodeError, which can
        happen if we mock it to do so (simulating a corrupted file or future scenario).
        """
        import logging

        # Create session file
        session_file = tmp_path / "test.jsonl"
        session_file.write_text('{"type": "session_meta"}\n')

        # Mock parse_session_file to raise JSONDecodeError
        def mock_parse_that_raises(file_path):
            raise json.JSONDecodeError("Test error", "doc", 0)

        monkeypatch.setattr(adapter, "parse_session_file", mock_parse_that_raises)

        with caplog.at_level(logging.DEBUG):
            result = adapter.get_resume_id_from_file(
                session_file,
                "rollout-2026-01-01T13-20-18-12345678-1234-5678-9abc-def012345678"
            )

        # Should log the error at debug level
        assert any(
            "Failed to parse Codex session file" in record.message
            and record.levelno == logging.DEBUG
            for record in caplog.records
        )
        # Should fall back to filename UUID extraction
        assert result == "12345678-1234-5678-9abc-def012345678"

    def test_logs_os_error_at_warning_level(self, adapter, tmp_path, caplog):
        """OS errors are logged at warning level."""
        import logging

        # Create nonexistent path
        session_file = tmp_path / "nonexistent" / "session.jsonl"

        with caplog.at_level(logging.WARNING):
            result = adapter.get_resume_id_from_file(
                session_file,
                "rollout-2026-01-01T13-20-18-deadbeef-cafe-babe-1234-567890abcdef"
            )

        # Should log the error at warning level
        assert any(
            "Failed to read Codex session file" in record.message
            and record.levelno == logging.WARNING
            for record in caplog.records
        )
        # Should fall back to filename UUID extraction
        assert result == "deadbeef-cafe-babe-1234-567890abcdef"

    def test_falls_back_for_no_session_meta(self, adapter, tmp_path):
        """Falls back when file has no session_meta entry."""
        import json

        session_file = tmp_path / "no_meta.jsonl"
        entries = [
            {"type": "event_msg", "payload": {"type": "user_message"}},
            {"type": "turn_context", "payload": {"model": "o1"}},
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        result = adapter.get_resume_id_from_file(
            session_file,
            "rollout-2026-01-01T13-20-18-99998888-7777-6666-5555-444433332222"
        )

        # Should fall back to filename UUID extraction
        assert result == "99998888-7777-6666-5555-444433332222"

    def test_falls_back_when_no_uuid_in_filename(self, adapter, tmp_path):
        """Falls back to session_id as-is when no UUID pattern found."""
        import json

        session_file = tmp_path / "simple.jsonl"
        session_file.write_text("")  # Empty file

        result = adapter.get_resume_id_from_file(
            session_file,
            "no-uuid-here"  # No UUID pattern in this filename
        )

        # Should return as-is since no UUID pattern matches
        assert result == "no-uuid-here"

    def test_prefers_internal_id_over_filename_uuid(self, adapter, tmp_path):
        """When both are available, prefers internal ID from file."""
        import json

        session_file = tmp_path / "test.jsonl"
        entries = [
            {
                "type": "session_meta",
                "payload": {
                    "id": "preferred-internal-id",
                    "cwd": "/test/path"
                }
            }
        ]
        with open(session_file, "w") as f:
            for entry in entries:
                f.write(json.dumps(entry) + "\n")

        # Even with a valid UUID in filename, should prefer internal ID
        result = adapter.get_resume_id_from_file(
            session_file,
            "rollout-2026-01-01T13-20-18-12345678-1234-5678-9abc-def012345678"
        )

        assert result == "preferred-internal-id"


class TestGeminiAdapterResumeIdErrorHandling:
    """Tests for GeminiAdapter.get_resume_id_from_file error handling and logging.

    These tests verify that:
    1. JSON decode errors are logged at debug level
    2. OS errors are logged at warning level
    3. The method falls back to filename-based ID extraction
    """

    @pytest.fixture
    def adapter(self):
        return GeminiAdapter()

    def test_logs_json_decode_error_at_debug_level(self, adapter, tmp_path, caplog):
        """JSON decode errors are logged at debug level."""
        import logging

        # Create invalid session file
        session_file = tmp_path / "invalid.json"
        session_file.write_text("not valid json")

        with caplog.at_level(logging.DEBUG):
            result = adapter.get_resume_id_from_file(session_file, "session-2025-12-15T21-28-a51b3ff5")

        # Should log the error
        assert any(
            "Failed to parse Gemini session file" in record.message
            and record.levelno == logging.DEBUG
            for record in caplog.records
        )
        # Should fall back to filename extraction
        assert result == "a51b3ff5"

    def test_logs_os_error_at_warning_level(self, adapter, tmp_path, monkeypatch, caplog):
        """OS errors are logged at warning level."""
        import logging

        # Create nonexistent path
        session_file = tmp_path / "nonexistent" / "session.json"

        with caplog.at_level(logging.WARNING):
            result = adapter.get_resume_id_from_file(session_file, "session-2025-12-15T21-28-abc123")

        # Should log the error at warning level
        assert any(
            "Failed to read Gemini session file" in record.message
            and record.levelno == logging.WARNING
            for record in caplog.records
        )
        # Should fall back to filename extraction
        assert result == "abc123"

    def test_returns_internal_session_id_when_available(self, adapter, tmp_path):
        """Returns internal session ID from file when available."""
        import json

        # Create valid session file with internal session ID
        session_file = tmp_path / "session.json"
        session_file.write_text(json.dumps({
            "sessionId": "full-uuid-from-file-12345678",
            "messages": []
        }))

        result = adapter.get_resume_id_from_file(session_file, "session-2025-12-15T21-28-short")

        # Should return the internal session ID, not the filename-based one
        assert result == "full-uuid-from-file-12345678"

    def test_falls_back_when_no_internal_id(self, adapter, tmp_path):
        """Falls back to filename extraction when internal ID is missing."""
        import json

        # Create valid session file without internal session ID
        session_file = tmp_path / "session.json"
        session_file.write_text(json.dumps({
            "messages": []
        }))

        result = adapter.get_resume_id_from_file(session_file, "session-2025-12-15T21-28-fallback")

        # Should fall back to filename extraction
        assert result == "fallback"


class TestGeminiAdapterParseSessionFile:
    """Tests for GeminiAdapter.parse_session_file edge cases."""

    @pytest.fixture
    def adapter(self):
        return GeminiAdapter()

    def test_parses_valid_session_file(self, adapter, tmp_path):
        """Parses a valid session file with all fields."""
        session_file = tmp_path / "session.json"
        session_file.write_text(json.dumps({
            "sessionId": "test-session-id",
            "projectHash": "abc123",
            "startTime": "2025-01-01T10:00:00Z",
            "lastUpdated": "2025-01-01T11:00:00Z",
            "summary": "Test session",
            "messages": [
                {"type": "user", "content": "Hello"},
                {"type": "gemini", "content": "Hi there", "model": "gemini-2.0-flash"},
            ]
        }))

        result = adapter.parse_session_file(session_file)

        assert result["session_id"] == "test-session-id"
        assert result["project_hash"] == "abc123"
        assert result["start_time"] == "2025-01-01T10:00:00Z"
        assert result["last_updated"] == "2025-01-01T11:00:00Z"
        assert result["summary"] == "Test session"
        assert result["format"] == "json"
        assert len(result["messages"]) == 2

    def test_handles_missing_fields(self, adapter, tmp_path):
        """Handles session file with missing fields."""
        session_file = tmp_path / "session.json"
        session_file.write_text(json.dumps({
            "messages": []
        }))

        result = adapter.parse_session_file(session_file)

        assert result["session_id"] is None
        assert result["project_hash"] is None
        assert result["start_time"] is None
        assert result["last_updated"] is None
        assert result["summary"] is None
        assert result["messages"] == []
        assert result["format"] == "json"

    def test_handles_null_values(self, adapter, tmp_path):
        """Handles session file with explicit null values."""
        session_file = tmp_path / "session.json"
        session_file.write_text(json.dumps({
            "sessionId": None,
            "projectHash": None,
            "startTime": None,
            "lastUpdated": None,
            "summary": None,
            "messages": None
        }))

        result = adapter.parse_session_file(session_file)

        assert result["session_id"] is None
        assert result["project_hash"] is None
        assert result["start_time"] is None
        assert result["last_updated"] is None
        assert result["summary"] is None
        # messages should default to empty list when None
        assert result["messages"] == []

    def test_handles_empty_file(self, adapter, tmp_path):
        """Handles empty JSON object."""
        session_file = tmp_path / "session.json"
        session_file.write_text("{}")

        result = adapter.parse_session_file(session_file)

        assert result["session_id"] is None
        assert result["messages"] == []
        assert result["format"] == "json"


class TestGeminiAdapterExtractSessionInfo:
    """Tests for GeminiAdapter.extract_session_info edge cases."""

    @pytest.fixture
    def adapter(self):
        return GeminiAdapter()

    def test_extracts_info_from_complete_data(self, adapter):
        """Extracts session info from complete data."""
        data = {
            "session_id": "test-id",
            "summary": "Test summary",
            "start_time": "2025-01-01T10:00:00Z",
            "last_updated": "2025-01-01T11:00:00Z",
            "messages": [
                {"type": "user", "content": "Hello"},
                {"type": "gemini", "content": "Hi", "model": "gemini-2.0-flash"},
                {"type": "gemini", "content": "More", "model": "gemini-2.0-flash"},
            ]
        }

        info = adapter.extract_session_info(data)

        assert info.session_id == "test-id"
        assert info.title == "Test summary"
        assert info.model == "gemini-2.0-flash"
        assert info.start_time == "2025-01-01T10:00:00Z"
        assert info.end_time == "2025-01-01T11:00:00Z"
        assert info.message_count == 3  # 1 user + 2 gemini

    def test_handles_empty_messages(self, adapter):
        """Handles session with no messages."""
        data = {
            "session_id": "test-id",
            "messages": []
        }

        info = adapter.extract_session_info(data)

        assert info.session_id == "test-id"
        assert info.message_count == 0
        assert info.model is None

    def test_handles_missing_messages_key(self, adapter):
        """Handles session data without messages key."""
        data = {
            "session_id": "test-id"
        }

        info = adapter.extract_session_info(data)

        assert info.session_id == "test-id"
        assert info.message_count == 0

    def test_handles_none_values(self, adapter):
        """Handles session data with None values."""
        data = {
            "session_id": None,
            "summary": None,
            "start_time": None,
            "last_updated": None,
            "messages": None
        }

        info = adapter.extract_session_info(data)

        # Should not raise, return sensible defaults
        assert info.session_id is None
        assert info.title is None
        assert info.message_count == 0

    def test_counts_only_user_and_gemini_messages(self, adapter):
        """Only counts user and gemini message types."""
        data = {
            "session_id": "test-id",
            "messages": [
                {"type": "user", "content": "Hello"},
                {"type": "gemini", "content": "Hi"},
                {"type": "system", "content": "System message"},  # Should not count
                {"type": "error", "content": "Error"},  # Should not count
                {"type": "user", "content": "More"},
            ]
        }

        info = adapter.extract_session_info(data)

        assert info.message_count == 3  # 2 user + 1 gemini

    def test_finds_model_from_first_gemini_message(self, adapter):
        """Finds model from first gemini message that has one."""
        data = {
            "session_id": "test-id",
            "messages": [
                {"type": "user", "content": "Hello"},
                {"type": "gemini", "content": "Hi"},  # No model
                {"type": "gemini", "content": "More", "model": "gemini-2.0-flash"},
            ]
        }

        info = adapter.extract_session_info(data)

        assert info.model == "gemini-2.0-flash"

    def test_handles_messages_without_type(self, adapter):
        """Handles messages missing the type field."""
        data = {
            "session_id": "test-id",
            "messages": [
                {"content": "No type field"},
                {"type": "user", "content": "Valid"},
            ]
        }

        info = adapter.extract_session_info(data)

        # Should only count the one with valid type
        assert info.message_count == 1


class TestGeminiAdapterBuildCommandEdgeCases:
    """Tests for edge cases in GeminiAdapter command building."""

    @pytest.fixture
    def adapter(self):
        return GeminiAdapter()

    def test_build_interactive_ignores_session_id(self, adapter):
        """session_id parameter is ignored since Gemini doesn't support it."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            session_id="custom-session-id"
        )

        # Should not include session ID anywhere
        assert "custom-session-id" not in cmd
        assert "--session-id" not in cmd

    def test_build_interactive_ignores_disallowed_tools(self, adapter):
        """disallowed_tools parameter is ignored by Gemini."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            disallowed_tools=["Bash", "Write"]
        )

        # Should not include disallowed tools
        assert "--disallowed-tools" not in cmd
        assert "Bash" not in cmd

    def test_build_interactive_ignores_max_turns(self, adapter):
        """max_turns parameter is ignored since Gemini doesn't support it."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            max_turns=10
        )

        # Should not include max-turns
        assert "--max-turns" not in cmd
        assert "10" not in cmd

    def test_build_headless_ignores_system_prompt(self, adapter):
        """system_prompt parameter is not used in Gemini headless."""
        cmd = adapter.build_headless_command(
            "Test prompt",
            "/path/to/project",
            system_prompt="Custom system prompt"
        )

        # Should not include system prompt
        assert "Custom system prompt" not in cmd

    def test_build_headless_with_all_options(self, adapter):
        """Builds headless command with all supported options."""
        cmd = adapter.build_headless_command(
            "Analyze the code",
            "/path/to/project",
            resume_session="full-uuid",
            allowed_tools=["Read", "Grep"],
            permission_mode="bypassPermissions",
            model="gemini-2.5-pro",
            output_format="json",
        )

        assert cmd[0] == adapter.command_name
        assert "-o" in cmd
        assert "json" in cmd
        assert "--resume" in cmd
        assert "full-uuid" in cmd
        assert "--approval-mode" in cmd
        assert "yolo" in cmd
        assert cmd.count("--allowed-tools") == 2
        assert "--model" in cmd
        assert "gemini-2.5-pro" in cmd
        # Prompt should be at the end
        assert cmd[-1] == "Analyze the code"

    def test_build_interactive_with_model(self, adapter):
        """Builds interactive command with model option."""
        cmd = adapter.build_interactive_command(
            "/path/to/project",
            model="gemini-2.5-pro"
        )

        assert "--model" in cmd
        idx = cmd.index("--model")
        assert cmd[idx + 1] == "gemini-2.5-pro"


class TestGeminiAdapterGetResumeSessionId:
    """Tests for GeminiAdapter.get_resume_session_id edge cases."""

    @pytest.fixture
    def adapter(self):
        return GeminiAdapter()

    def test_extracts_from_standard_format(self, adapter):
        """Extracts UUID from standard session-YYYY-MM-DDTHH-MM-uuid format."""
        result = adapter.get_resume_session_id("session-2025-12-15T21-28-a51b3ff5")
        assert result == "a51b3ff5"

    def test_handles_single_segment(self, adapter):
        """Handles session ID with no hyphens."""
        result = adapter.get_resume_session_id("simplesessionid")
        assert result == "simplesessionid"

    def test_handles_multiple_hyphens(self, adapter):
        """Handles session ID with many hyphens, takes last segment."""
        result = adapter.get_resume_session_id("a-b-c-d-e-f-lastpart")
        assert result == "lastpart"

    def test_handles_trailing_hyphen(self, adapter):
        """Handles session ID with trailing hyphen."""
        result = adapter.get_resume_session_id("session-id-")
        assert result == ""

    def test_handles_empty_string(self, adapter):
        """Handles empty session ID."""
        result = adapter.get_resume_session_id("")
        assert result == ""

    def test_handles_just_hyphen(self, adapter):
        """Handles session ID that is just a hyphen."""
        result = adapter.get_resume_session_id("-")
        assert result == ""


class TestGeminiAdapterPathEncoding:
    """Tests for GeminiAdapter path encoding methods."""

    @pytest.fixture
    def adapter(self):
        return GeminiAdapter()

    def test_encode_path_is_deterministic(self, adapter):
        """Same path produces same hash."""
        path = "/home/user/project"
        hash1 = adapter.encode_path(path)
        hash2 = adapter.encode_path(path)
        assert hash1 == hash2

    def test_encode_path_normalizes_paths(self, adapter):
        """Paths are normalized before hashing."""
        # These should produce different hashes since they resolve differently
        # in the test environment
        hash1 = adapter.encode_path("/home/user/project")
        hash2 = adapter.encode_path("/home/user/./project")

        # Both paths normalize to the same thing
        assert hash1 == hash2

    def test_encode_path_different_paths_different_hashes(self, adapter):
        """Different paths produce different hashes."""
        hash1 = adapter.encode_path("/home/user/project1")
        hash2 = adapter.encode_path("/home/user/project2")
        assert hash1 != hash2

    def test_get_sessions_dir_structure(self, adapter):
        """Sessions directory has correct structure."""
        sessions_dir = adapter.get_sessions_dir("/home/user/project")

        # Should end with /chats
        assert sessions_dir.name == "chats"
        # Parent should be the hash
        parent = sessions_dir.parent
        assert len(parent.name) == 64  # SHA256 hex length
        # Grandparent should be "tmp"
        assert parent.parent.name == "tmp"
        # Should be under ~/.gemini
        assert parent.parent.parent == Path.home() / ".gemini"


class TestCodexAdapterGetResumeSessionIdEdgeCases:
    """Tests for CodexAdapter.get_resume_session_id edge cases.

    These tests verify the regex pattern handles various UUID formats
    and edge cases correctly.
    """

    @pytest.fixture
    def adapter(self):
        return CodexAdapter()

    def test_handles_uppercase_uuid(self, adapter):
        """Handles uppercase UUID characters (re.IGNORECASE)."""
        session_id = "rollout-2026-01-01T13-20-18-019B775B-1DC2-7BF1-9681-DB60A06CB4CB"
        result = adapter.get_resume_session_id(session_id)
        assert result == "019B775B-1DC2-7BF1-9681-DB60A06CB4CB"

    def test_handles_mixed_case_uuid(self, adapter):
        """Handles mixed case UUID characters."""
        session_id = "rollout-2026-01-01T13-20-18-019b775B-1dc2-7BF1-9681-db60A06CB4cb"
        result = adapter.get_resume_session_id(session_id)
        assert result == "019b775B-1dc2-7BF1-9681-db60A06CB4cb"

    def test_uuid_with_only_numbers(self, adapter):
        """Handles UUID with only numeric characters."""
        session_id = "rollout-2026-01-01T13-20-18-01234567-1234-5678-9012-345678901234"
        result = adapter.get_resume_session_id(session_id)
        assert result == "01234567-1234-5678-9012-345678901234"

    def test_uuid_at_end_with_trailing_whitespace_not_matched(self, adapter):
        """UUID must be at end of string - trailing whitespace means no match."""
        session_id = "rollout-2026-01-01T13-20-18-019b775b-1dc2-7bf1-9681-db60a06cb4cb "
        result = adapter.get_resume_session_id(session_id)
        # Falls back to returning as-is since UUID pattern requires $ anchor
        assert result == session_id

    def test_empty_string(self, adapter):
        """Handles empty string gracefully."""
        result = adapter.get_resume_session_id("")
        assert result == ""

    def test_uuid_only(self, adapter):
        """Handles standalone UUID."""
        session_id = "019b775b-1dc2-7bf1-9681-db60a06cb4cb"
        result = adapter.get_resume_session_id(session_id)
        assert result == session_id

    def test_short_uuid_like_string_not_matched(self, adapter):
        """Does not match UUID-like strings that are too short."""
        # Missing last segment length
        session_id = "rollout-2026-01-01T13-20-18-019b775b-1dc2-7bf1-9681-db60a0"
        result = adapter.get_resume_session_id(session_id)
        # Falls back to as-is
        assert result == session_id

    def test_uuid_with_invalid_hex_chars_not_matched(self, adapter):
        """Does not match UUIDs containing non-hex characters."""
        # 'z' is not a valid hex character
        session_id = "rollout-2026-01-01T13-20-18-019z775b-1dc2-7bf1-9681-db60a06cb4cb"
        result = adapter.get_resume_session_id(session_id)
        # Falls back to as-is
        assert result == session_id
