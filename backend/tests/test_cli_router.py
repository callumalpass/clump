"""
Tests for the CLI router.

Tests cover:
- list_available_clis endpoint for listing CLI tools and capabilities
- check_cli_installed endpoint for checking CLI installation status
- get_cli_settings endpoint for retrieving CLI settings
- Error handling for invalid CLI types
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.cli.base import CLIType


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


class TestListAvailableClis:
    """Tests for GET /api/cli/available endpoint."""

    def test_returns_clis_list(self, client):
        """Returns a list of CLIs with their info."""
        response = client.get("/api/cli/available")

        assert response.status_code == 200
        data = response.json()
        assert "clis" in data
        assert isinstance(data["clis"], list)

    def test_returns_default_cli(self, client):
        """Returns the default CLI setting."""
        response = client.get("/api/cli/available")

        assert response.status_code == 200
        data = response.json()
        assert "default_cli" in data

    def test_clis_have_required_fields(self, client):
        """Each CLI entry has the required fields."""
        response = client.get("/api/cli/available")

        assert response.status_code == 200
        data = response.json()

        required_fields = {"type", "name", "command", "installed", "capabilities"}
        for cli in data["clis"]:
            assert required_fields.issubset(set(cli.keys())), f"Missing fields in CLI: {cli}"

    def test_clis_capabilities_have_required_fields(self, client):
        """Each CLI's capabilities have the required fields."""
        response = client.get("/api/cli/available")

        assert response.status_code == 200
        data = response.json()

        # These match the field names in get_cli_info() from registry.py
        capability_fields = {
            "headless",
            "resume",
            "session_id",
            "tool_allowlist",
            "permission_modes",
            "max_turns",
        }
        for cli in data["clis"]:
            caps = cli["capabilities"]
            for field in capability_fields:
                assert field in caps, f"Missing capability {field} in CLI {cli['type']}"

    def test_includes_all_cli_types(self, client):
        """Returns info for all supported CLI types."""
        response = client.get("/api/cli/available")

        assert response.status_code == 200
        data = response.json()

        cli_types = {cli["type"] for cli in data["clis"]}
        expected_types = {"claude", "gemini", "codex"}
        assert cli_types == expected_types

    def test_installed_is_boolean(self, client):
        """The installed field is always a boolean."""
        response = client.get("/api/cli/available")

        assert response.status_code == 200
        data = response.json()

        for cli in data["clis"]:
            assert isinstance(cli["installed"], bool)


class TestCheckCliInstalled:
    """Tests for GET /api/cli/{cli_type}/installed endpoint."""

    def test_returns_installed_status_for_claude(self, client):
        """Returns installation status for claude CLI."""
        response = client.get("/api/cli/claude/installed")

        assert response.status_code == 200
        data = response.json()
        assert data["cli_type"] == "claude"
        assert "installed" in data
        assert isinstance(data["installed"], bool)

    def test_returns_installed_status_for_gemini(self, client):
        """Returns installation status for gemini CLI."""
        response = client.get("/api/cli/gemini/installed")

        assert response.status_code == 200
        data = response.json()
        assert data["cli_type"] == "gemini"
        assert "installed" in data
        assert isinstance(data["installed"], bool)

    def test_returns_installed_status_for_codex(self, client):
        """Returns installation status for codex CLI."""
        response = client.get("/api/cli/codex/installed")

        assert response.status_code == 200
        data = response.json()
        assert data["cli_type"] == "codex"
        assert "installed" in data
        assert isinstance(data["installed"], bool)

    def test_returns_error_for_unknown_cli_type(self, client):
        """Returns error for unknown CLI type."""
        response = client.get("/api/cli/unknown/installed")

        assert response.status_code == 200
        data = response.json()
        assert data["cli_type"] == "unknown"
        assert data["installed"] is False
        assert "error" in data
        assert data["error"] == "Unknown CLI type"

    def test_handles_empty_cli_type(self, client):
        """Handles empty CLI type gracefully."""
        # This will actually hit /api/cli//installed which becomes /api/cli/installed
        # The router should handle this appropriately
        # Actually this will likely return a 404 since the path won't match
        response = client.get("/api/cli//installed")
        # Empty string path segment is typically 404 or hits a different route
        assert response.status_code in (200, 404, 307)

    def test_returns_false_for_invalid_cli_type(self, client):
        """Returns installed=False for invalid CLI types."""
        response = client.get("/api/cli/invalid-cli-type/installed")

        assert response.status_code == 200
        data = response.json()
        assert data["installed"] is False

    @patch("app.routers.cli.is_cli_installed")
    def test_calls_is_cli_installed_correctly(self, mock_installed, client):
        """Calls is_cli_installed with correct CLI enum."""
        mock_installed.return_value = True

        response = client.get("/api/cli/claude/installed")

        assert response.status_code == 200
        mock_installed.assert_called_once_with(CLIType.CLAUDE)

    @patch("app.routers.cli.is_cli_installed")
    def test_returns_true_when_cli_installed(self, mock_installed, client):
        """Returns installed=True when CLI is installed."""
        mock_installed.return_value = True

        response = client.get("/api/cli/claude/installed")

        assert response.status_code == 200
        data = response.json()
        assert data["installed"] is True

    @patch("app.routers.cli.is_cli_installed")
    def test_returns_false_when_cli_not_installed(self, mock_installed, client):
        """Returns installed=False when CLI is not installed."""
        mock_installed.return_value = False

        response = client.get("/api/cli/claude/installed")

        assert response.status_code == 200
        data = response.json()
        assert data["installed"] is False


class TestGetCliSettings:
    """Tests for GET /api/cli/settings endpoint."""

    def test_returns_default_cli_setting(self, client):
        """Returns default_cli in settings."""
        response = client.get("/api/cli/settings")

        assert response.status_code == 200
        data = response.json()
        assert "default_cli" in data

    def test_returns_claude_settings(self, client):
        """Returns claude-specific settings."""
        response = client.get("/api/cli/settings")

        assert response.status_code == 200
        data = response.json()
        assert "claude" in data

        claude_settings = data["claude"]
        assert "command" in claude_settings
        assert "permission_mode" in claude_settings
        assert "model" in claude_settings
        assert "max_turns" in claude_settings

    def test_returns_gemini_settings(self, client):
        """Returns gemini-specific settings."""
        response = client.get("/api/cli/settings")

        assert response.status_code == 200
        data = response.json()
        assert "gemini" in data

        gemini_settings = data["gemini"]
        assert "command" in gemini_settings

    def test_returns_codex_settings(self, client):
        """Returns codex-specific settings."""
        response = client.get("/api/cli/settings")

        assert response.status_code == 200
        data = response.json()
        assert "codex" in data

        codex_settings = data["codex"]
        assert "command" in codex_settings

    @patch("app.routers.cli.settings")
    def test_returns_configured_default_cli(self, mock_settings, client):
        """Returns the configured default CLI."""
        mock_settings.default_cli = "gemini"
        mock_settings.claude_command = "claude"
        mock_settings.claude_permission_mode = "default"
        mock_settings.claude_model = "sonnet"
        mock_settings.claude_max_turns = 10
        mock_settings.gemini_command = "gemini"
        mock_settings.codex_command = "codex"

        response = client.get("/api/cli/settings")

        assert response.status_code == 200
        data = response.json()
        assert data["default_cli"] == "gemini"

    @patch("app.routers.cli.settings")
    def test_returns_configured_claude_command(self, mock_settings, client):
        """Returns the configured claude command."""
        mock_settings.default_cli = "claude"
        mock_settings.claude_command = "/custom/path/to/claude"
        mock_settings.claude_permission_mode = "default"
        mock_settings.claude_model = "sonnet"
        mock_settings.claude_max_turns = 10
        mock_settings.gemini_command = "gemini"
        mock_settings.codex_command = "codex"

        response = client.get("/api/cli/settings")

        assert response.status_code == 200
        data = response.json()
        assert data["claude"]["command"] == "/custom/path/to/claude"

    @patch("app.routers.cli.settings")
    def test_returns_configured_permission_mode(self, mock_settings, client):
        """Returns the configured permission mode."""
        mock_settings.default_cli = "claude"
        mock_settings.claude_command = "claude"
        mock_settings.claude_permission_mode = "plan"
        mock_settings.claude_model = "sonnet"
        mock_settings.claude_max_turns = 10
        mock_settings.gemini_command = "gemini"
        mock_settings.codex_command = "codex"

        response = client.get("/api/cli/settings")

        assert response.status_code == 200
        data = response.json()
        assert data["claude"]["permission_mode"] == "plan"

    @patch("app.routers.cli.settings")
    def test_returns_configured_max_turns(self, mock_settings, client):
        """Returns the configured max turns."""
        mock_settings.default_cli = "claude"
        mock_settings.claude_command = "claude"
        mock_settings.claude_permission_mode = "default"
        mock_settings.claude_model = "sonnet"
        mock_settings.claude_max_turns = 50
        mock_settings.gemini_command = "gemini"
        mock_settings.codex_command = "codex"

        response = client.get("/api/cli/settings")

        assert response.status_code == 200
        data = response.json()
        assert data["claude"]["max_turns"] == 50


class TestCliRouterIntegration:
    """Integration tests for CLI router endpoints."""

    def test_available_and_installed_are_consistent(self, client):
        """The installed status in /available matches /installed endpoints."""
        # Get list of all CLIs
        available_response = client.get("/api/cli/available")
        assert available_response.status_code == 200
        available_data = available_response.json()

        # Check each CLI's installed status matches individual endpoint
        for cli in available_data["clis"]:
            cli_type = cli["type"]
            installed_response = client.get(f"/api/cli/{cli_type}/installed")
            assert installed_response.status_code == 200
            installed_data = installed_response.json()

            assert cli["installed"] == installed_data["installed"], \
                f"Mismatch for {cli_type}: /available says {cli['installed']}, " \
                f"/installed says {installed_data['installed']}"

    def test_settings_default_cli_is_valid_type(self, client):
        """The default CLI in settings is a valid CLI type."""
        # Get settings
        settings_response = client.get("/api/cli/settings")
        assert settings_response.status_code == 200
        settings_data = settings_response.json()

        # Get available CLIs
        available_response = client.get("/api/cli/available")
        assert available_response.status_code == 200
        available_data = available_response.json()

        # Check default CLI is one of the available types
        cli_types = {cli["type"] for cli in available_data["clis"]}
        assert settings_data["default_cli"] in cli_types

    def test_all_endpoints_are_accessible(self, client):
        """All CLI router endpoints are accessible."""
        endpoints = [
            "/api/cli/available",
            "/api/cli/settings",
            "/api/cli/claude/installed",
            "/api/cli/gemini/installed",
            "/api/cli/codex/installed",
        ]

        for endpoint in endpoints:
            response = client.get(endpoint)
            assert response.status_code == 200, f"Endpoint {endpoint} returned {response.status_code}"
