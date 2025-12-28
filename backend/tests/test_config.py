"""Tests for app.config module."""

import pytest
import os
from unittest.mock import patch, MagicMock
from app.config import Settings, DEFAULT_ALLOWED_TOOLS


class TestSettingsGet:
    """Tests for Settings._get method."""

    def test_returns_env_var_first(self):
        """Environment variable takes highest priority."""
        with patch.dict(os.environ, {"TEST_KEY": "env_value"}):
            settings = Settings()
            settings._clump_config = {"test_key": "config_value"}
            settings._env_file = {"TEST_KEY": "env_file_value"}

            result = settings._get("test_key", "default", "TEST_KEY")

            assert result == "env_value"

    def test_returns_clump_config_second(self):
        """Clump config is used when env var not set."""
        with patch.dict(os.environ, {}, clear=False):
            # Ensure TEST_KEY_2 is not in environ
            os.environ.pop("TEST_KEY_2", None)
            settings = Settings()
            settings._clump_config = {"test_key": "config_value"}
            settings._env_file = {"TEST_KEY_2": "env_file_value"}

            result = settings._get("test_key", "default", "TEST_KEY_2")

            assert result == "config_value"

    def test_returns_env_file_third(self):
        """Env file is used when env var and clump config not set."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("TEST_KEY_3", None)
            settings = Settings()
            settings._clump_config = {}
            settings._env_file = {"TEST_KEY_3": "env_file_value"}

            result = settings._get("other_key", "default", "TEST_KEY_3")

            assert result == "env_file_value"

    def test_returns_default_last(self):
        """Default is used when nothing else is set."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NONEXISTENT_KEY", None)
            settings = Settings()
            settings._clump_config = {}
            settings._env_file = {}

            result = settings._get("nonexistent_key", "my_default", "NONEXISTENT_KEY")

            assert result == "my_default"

    def test_uses_uppercase_key_for_env_by_default(self):
        """Uses uppercase of key as env_key if not specified."""
        with patch.dict(os.environ, {"MY_SETTING": "from_env"}):
            settings = Settings()
            settings._clump_config = {}
            settings._env_file = {}

            result = settings._get("my_setting", "default")

            assert result == "from_env"


class TestSettingsGetBool:
    """Tests for Settings._get_bool method."""

    def test_returns_true_for_bool_true(self):
        """Returns True when value is boolean True."""
        settings = Settings()
        settings._clump_config = {"test_bool": True}

        result = settings._get_bool("test_bool", False)

        assert result is True

    def test_returns_false_for_bool_false(self):
        """Returns False when value is boolean False."""
        settings = Settings()
        settings._clump_config = {"test_bool": False}

        result = settings._get_bool("test_bool", True)

        assert result is False

    def test_returns_true_for_string_true(self):
        """Returns True for string 'true'."""
        settings = Settings()
        settings._clump_config = {"test_bool": "true"}

        result = settings._get_bool("test_bool", False)

        assert result is True

    def test_returns_true_for_string_TRUE(self):
        """Returns True for string 'TRUE' (case insensitive)."""
        settings = Settings()
        settings._clump_config = {"test_bool": "TRUE"}

        result = settings._get_bool("test_bool", False)

        assert result is True

    def test_returns_true_for_string_1(self):
        """Returns True for string '1'."""
        settings = Settings()
        settings._clump_config = {"test_bool": "1"}

        result = settings._get_bool("test_bool", False)

        assert result is True

    def test_returns_true_for_string_yes(self):
        """Returns True for string 'yes'."""
        settings = Settings()
        settings._clump_config = {"test_bool": "yes"}

        result = settings._get_bool("test_bool", False)

        assert result is True

    def test_returns_true_for_string_YES(self):
        """Returns True for string 'YES' (case insensitive)."""
        settings = Settings()
        settings._clump_config = {"test_bool": "YES"}

        result = settings._get_bool("test_bool", False)

        assert result is True

    def test_returns_false_for_string_false(self):
        """Returns False for string 'false'."""
        settings = Settings()
        settings._clump_config = {"test_bool": "false"}

        result = settings._get_bool("test_bool", True)

        assert result is False

    def test_returns_false_for_string_0(self):
        """Returns False for string '0'."""
        settings = Settings()
        settings._clump_config = {"test_bool": "0"}

        result = settings._get_bool("test_bool", True)

        assert result is False

    def test_returns_false_for_string_no(self):
        """Returns False for string 'no'."""
        settings = Settings()
        settings._clump_config = {"test_bool": "no"}

        result = settings._get_bool("test_bool", True)

        assert result is False

    def test_returns_false_for_empty_string(self):
        """Returns False for empty string."""
        settings = Settings()
        settings._clump_config = {"test_bool": ""}

        result = settings._get_bool("test_bool", True)

        assert result is False

    def test_returns_true_for_integer_1(self):
        """Returns True for integer 1."""
        settings = Settings()
        settings._clump_config = {"test_bool": 1}

        result = settings._get_bool("test_bool", False)

        assert result is True

    def test_returns_false_for_integer_0(self):
        """Returns False for integer 0."""
        settings = Settings()
        settings._clump_config = {"test_bool": 0}

        result = settings._get_bool("test_bool", True)

        assert result is False

    def test_returns_default_for_nonexistent_key(self):
        """Returns default when key doesn't exist."""
        settings = Settings()
        settings._clump_config = {}

        result = settings._get_bool("nonexistent", True)

        assert result is True


class TestSettingsGetInt:
    """Tests for Settings._get_int method."""

    def test_returns_int_value(self):
        """Returns integer value directly."""
        settings = Settings()
        settings._clump_config = {"test_int": 42}

        result = settings._get_int("test_int", 0)

        assert result == 42

    def test_converts_string_to_int(self):
        """Converts string to integer."""
        settings = Settings()
        settings._clump_config = {"test_int": "123"}

        result = settings._get_int("test_int", 0)

        assert result == 123

    def test_converts_negative_string_to_int(self):
        """Converts negative string to integer."""
        settings = Settings()
        settings._clump_config = {"test_int": "-42"}

        result = settings._get_int("test_int", 0)

        assert result == -42

    def test_returns_default_for_invalid_string(self):
        """Returns default for non-numeric string."""
        settings = Settings()
        settings._clump_config = {"test_int": "not_a_number"}

        result = settings._get_int("test_int", 99)

        assert result == 99

    def test_returns_default_for_float_string(self):
        """Returns default for float string (not valid int)."""
        settings = Settings()
        settings._clump_config = {"test_int": "3.14"}

        result = settings._get_int("test_int", 99)

        assert result == 99

    def test_returns_default_for_empty_string(self):
        """Returns default for empty string."""
        settings = Settings()
        settings._clump_config = {"test_int": ""}

        result = settings._get_int("test_int", 99)

        assert result == 99

    def test_returns_default_for_none(self):
        """Returns default for None value."""
        settings = Settings()
        settings._clump_config = {"test_int": None}

        result = settings._get_int("test_int", 99)

        assert result == 99

    def test_returns_default_for_nonexistent_key(self):
        """Returns default when key doesn't exist."""
        settings = Settings()
        settings._clump_config = {}

        result = settings._get_int("nonexistent", 42)

        assert result == 42

    def test_converts_float_to_int(self):
        """Converts float value to integer."""
        settings = Settings()
        settings._clump_config = {"test_int": 3.9}

        result = settings._get_int("test_int", 0)

        assert result == 3


class TestSettingsReload:
    """Tests for Settings.reload method."""

    def test_reload_updates_clump_config(self):
        """Reload refreshes clump config from file."""
        settings = Settings()
        original_config = settings._clump_config.copy()

        with patch("app.config._load_clump_config", return_value={"new_key": "new_value"}):
            settings.reload()

        assert settings._clump_config == {"new_key": "new_value"}

    def test_reload_updates_env_file(self):
        """Reload refreshes env file values."""
        settings = Settings()

        with patch("app.config._load_env_file", return_value={"NEW_VAR": "value"}):
            settings.reload()

        assert settings._env_file == {"NEW_VAR": "value"}


class TestClaudePermissionMode:
    """Tests for claude_permission_mode property."""

    def test_returns_valid_mode(self):
        """Returns valid permission mode."""
        settings = Settings()
        settings._clump_config = {"claude_permission_mode": "plan"}

        assert settings.claude_permission_mode == "plan"

    def test_returns_default_for_invalid_mode(self):
        """Returns 'acceptEdits' for invalid mode."""
        settings = Settings()
        settings._clump_config = {"claude_permission_mode": "invalid_mode"}

        assert settings.claude_permission_mode == "acceptEdits"

    def test_all_valid_modes(self):
        """Tests all valid permission modes."""
        valid_modes = ["default", "plan", "acceptEdits", "bypassPermissions"]
        settings = Settings()

        for mode in valid_modes:
            settings._clump_config = {"claude_permission_mode": mode}
            assert settings.claude_permission_mode == mode


class TestClaudeOutputFormat:
    """Tests for claude_output_format property."""

    def test_returns_valid_format(self):
        """Returns valid output format."""
        settings = Settings()
        settings._clump_config = {"claude_output_format": "json"}

        assert settings.claude_output_format == "json"

    def test_returns_default_for_invalid_format(self):
        """Returns 'stream-json' for invalid format."""
        settings = Settings()
        settings._clump_config = {"claude_output_format": "invalid_format"}

        assert settings.claude_output_format == "stream-json"

    def test_all_valid_formats(self):
        """Tests all valid output formats."""
        valid_formats = ["text", "json", "stream-json"]
        settings = Settings()

        for fmt in valid_formats:
            settings._clump_config = {"claude_output_format": fmt}
            assert settings.claude_output_format == fmt


class TestGetAllowedTools:
    """Tests for Settings.get_allowed_tools method."""

    def test_returns_defaults_when_empty(self):
        """When claude_allowed_tools is empty, returns DEFAULT_ALLOWED_TOOLS."""
        with patch.object(Settings, 'claude_allowed_tools', ""):
            settings = Settings()
            result = settings.get_allowed_tools()
            assert result == DEFAULT_ALLOWED_TOOLS

    def test_parses_comma_separated_tools(self):
        """Parses a comma-separated list of tools."""
        with patch.object(Settings, 'claude_allowed_tools', "Read,Glob,Grep"):
            settings = Settings()
            result = settings.get_allowed_tools()
            assert result == ["Read", "Glob", "Grep"]

    def test_strips_whitespace(self):
        """Strips whitespace around tool names."""
        with patch.object(Settings, 'claude_allowed_tools', "  Read  ,  Glob  ,  Grep  "):
            settings = Settings()
            result = settings.get_allowed_tools()
            assert result == ["Read", "Glob", "Grep"]

    def test_handles_single_tool(self):
        """Handles a single tool without commas."""
        with patch.object(Settings, 'claude_allowed_tools', "Read"):
            settings = Settings()
            result = settings.get_allowed_tools()
            assert result == ["Read"]

    def test_handles_bash_patterns(self):
        """Handles Bash patterns with colons and wildcards."""
        with patch.object(Settings, 'claude_allowed_tools', "Read,Bash(git:*),Glob"):
            settings = Settings()
            result = settings.get_allowed_tools()
            assert result == ["Read", "Bash(git:*)", "Glob"]


class TestGetDisallowedTools:
    """Tests for Settings.get_disallowed_tools method."""

    def test_returns_empty_list_when_not_set(self):
        """Returns empty list when no tools are disallowed."""
        with patch.object(Settings, 'claude_disallowed_tools', ""):
            settings = Settings()
            result = settings.get_disallowed_tools()
            assert result == []

    def test_parses_comma_separated_tools(self):
        """Parses a comma-separated list of disallowed tools."""
        with patch.object(Settings, 'claude_disallowed_tools', "Write,Edit"):
            settings = Settings()
            result = settings.get_disallowed_tools()
            assert result == ["Write", "Edit"]

    def test_strips_whitespace(self):
        """Strips whitespace around tool names."""
        with patch.object(Settings, 'claude_disallowed_tools', "  Write  ,  Edit  "):
            settings = Settings()
            result = settings.get_disallowed_tools()
            assert result == ["Write", "Edit"]


class TestGetMcpConfig:
    """Tests for Settings.get_mcp_config method."""

    def test_returns_none_when_no_mcp_configured(self):
        """Returns None when no MCP servers are configured."""
        with patch.object(Settings, 'claude_mcp_github', False), \
             patch.object(Settings, 'claude_mcp_servers', ""):
            settings = Settings()
            result = settings.get_mcp_config()
            assert result is None

    def test_adds_github_mcp_when_enabled(self):
        """Adds GitHub MCP server when enabled and token is present."""
        with patch.object(Settings, 'github_token', "test-token"), \
             patch.object(Settings, 'claude_mcp_github', True), \
             patch.object(Settings, 'claude_mcp_servers', ""):
            settings = Settings()
            result = settings.get_mcp_config()
            assert result is not None
            assert "github" in result
            assert result["github"]["type"] == "http"
            assert "Bearer test-token" in result["github"]["headers"]["Authorization"]

    def test_parses_additional_mcp_servers(self):
        """Parses additional MCP servers from JSON string."""
        with patch.object(Settings, 'claude_mcp_github', False), \
             patch.object(Settings, 'claude_mcp_servers', '{"sentry": {"type": "sse", "url": "https://example.com"}}'):
            settings = Settings()
            result = settings.get_mcp_config()
            assert result is not None
            assert "sentry" in result
            assert result["sentry"]["type"] == "sse"

    def test_handles_invalid_mcp_json_gracefully(self):
        """Handles invalid JSON in mcp_servers without raising."""
        with patch.object(Settings, 'claude_mcp_github', False), \
             patch.object(Settings, 'claude_mcp_servers', "not valid json"):
            settings = Settings()
            result = settings.get_mcp_config()
            # Should return None since no valid servers parsed
            assert result is None
