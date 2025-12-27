"""
Tests for the settings router API endpoints.

Tests cover:
- GET /settings/github-token (check token status)
- POST /settings/github-token (set token)
- DELETE /settings/github-token (remove token)
- GET /settings/claude (get Claude Code settings)
- PUT /settings/claude (update Claude Code settings)
- POST /settings/claude/reset (reset Claude settings to defaults)
"""

import pytest
import os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.routers.settings import router
from app.config import DEFAULT_ALLOWED_TOOLS


@pytest.fixture
def app():
    """Create a test FastAPI app with the settings router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_empty_config():
    """Mock an empty config file."""
    with patch('app.routers.settings.load_config', return_value={}), \
         patch('app.routers.settings.save_config'):
        yield


@pytest.fixture
def mock_settings():
    """Create a mock settings object."""
    mock = MagicMock()
    mock.github_token = ""
    mock.claude_permission_mode = "acceptEdits"
    mock.claude_max_turns = 10
    mock.claude_model = "sonnet"
    mock.claude_headless_mode = False
    mock.claude_output_format = "stream-json"
    mock.claude_mcp_github = False
    mock.get_allowed_tools.return_value = DEFAULT_ALLOWED_TOOLS
    mock.get_disallowed_tools.return_value = []
    return mock


class TestGitHubTokenEndpoints:
    """Tests for GitHub token management endpoints."""

    def test_get_github_token_status_not_configured(self, client):
        """Test getting token status when no token is set."""
        with patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {}, clear=True):
            mock_settings.github_token = ""

            response = client.get("/settings/github-token")

            assert response.status_code == 200
            data = response.json()
            assert data["configured"] is False
            assert data["masked_token"] is None

    def test_get_github_token_status_configured_from_settings(self, client):
        """Test getting token status when token is configured via settings."""
        with patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {}, clear=True):
            mock_settings.github_token = "ghp_1234567890abcdefghij"

            response = client.get("/settings/github-token")

            assert response.status_code == 200
            data = response.json()
            assert data["configured"] is True
            assert data["masked_token"] == "ghp_...ghij"

    def test_get_github_token_status_configured_from_env(self, client):
        """Test getting token status when token is in environment."""
        # Token is 24 chars: "ghp_environmentoken1234"
        # Last 4 chars: "1234"
        with patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {"GITHUB_TOKEN": "ghp_environmentoken1234"}):
            mock_settings.github_token = ""

            response = client.get("/settings/github-token")

            assert response.status_code == 200
            data = response.json()
            assert data["configured"] is True
            assert data["masked_token"] == "ghp_...1234"

    def test_get_github_token_short_token(self, client):
        """Test getting token status with a token shorter than 8 characters."""
        with patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {}, clear=True):
            mock_settings.github_token = "short"

            response = client.get("/settings/github-token")

            assert response.status_code == 200
            data = response.json()
            assert data["configured"] is False

    def test_set_github_token_valid_ghp(self, client):
        """Test setting a valid GitHub PAT (ghp_ prefix)."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {}, clear=True), \
             patch('app.services.github_client.GitHubClient'), \
             patch.object(__import__('app.services.github_client', fromlist=['github_client']), 'github_client', MagicMock()):
            mock_settings.reload = MagicMock()

            response = client.post(
                "/settings/github-token",
                json={"token": "ghp_validtoken1234567890"}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["configured"] is True
            assert data["masked_token"] == "ghp_...7890"
            mock_save.assert_called_once()

    def test_set_github_token_valid_pat(self, client):
        """Test setting a valid GitHub PAT (github_pat_ prefix)."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {}, clear=True), \
             patch('app.services.github_client.GitHubClient'), \
             patch.object(__import__('app.services.github_client', fromlist=['github_client']), 'github_client', MagicMock()):
            mock_settings.reload = MagicMock()

            response = client.post(
                "/settings/github-token",
                json={"token": "github_pat_validtoken1234567890"}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["configured"] is True
            assert data["masked_token"] == "gith...7890"

    def test_set_github_token_empty(self, client):
        """Test setting an empty token returns error."""
        response = client.post(
            "/settings/github-token",
            json={"token": ""}
        )

        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()

    def test_set_github_token_whitespace_only(self, client):
        """Test setting whitespace-only token returns error."""
        response = client.post(
            "/settings/github-token",
            json={"token": "   "}
        )

        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()

    def test_set_github_token_invalid_format(self, client):
        """Test setting a token with invalid format."""
        response = client.post(
            "/settings/github-token",
            json={"token": "invalid_token_format"}
        )

        assert response.status_code == 400
        assert "format" in response.json()["detail"].lower()

    def test_set_github_token_trims_whitespace(self, client):
        """Test that token whitespace is trimmed."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {}, clear=True), \
             patch('app.services.github_client.GitHubClient'), \
             patch.object(__import__('app.services.github_client', fromlist=['github_client']), 'github_client', MagicMock()):
            mock_settings.reload = MagicMock()

            response = client.post(
                "/settings/github-token",
                json={"token": "  ghp_validtoken1234567890  "}
            )

            assert response.status_code == 200
            # Verify saved config has trimmed token
            saved_config = mock_save.call_args[0][0]
            assert saved_config["github_token"] == "ghp_validtoken1234567890"

    def test_set_github_token_updates_environment(self, client):
        """Test that setting token updates the environment variable."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config'), \
             patch('app.routers.settings.settings') as mock_settings, \
             patch('app.services.github_client.GitHubClient'), \
             patch.object(__import__('app.services.github_client', fromlist=['github_client']), 'github_client', MagicMock()):
            mock_settings.reload = MagicMock()
            env_backup = os.environ.get("GITHUB_TOKEN")

            try:
                response = client.post(
                    "/settings/github-token",
                    json={"token": "ghp_validtoken1234567890"}
                )

                assert response.status_code == 200
                assert os.environ.get("GITHUB_TOKEN") == "ghp_validtoken1234567890"
            finally:
                # Clean up
                if env_backup:
                    os.environ["GITHUB_TOKEN"] = env_backup
                elif "GITHUB_TOKEN" in os.environ:
                    del os.environ["GITHUB_TOKEN"]

    def test_remove_github_token(self, client):
        """Test removing the GitHub token."""
        with patch('app.routers.settings.load_config', return_value={"github_token": "ghp_test"}), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {"GITHUB_TOKEN": "ghp_test"}):
            mock_settings.reload = MagicMock()

            response = client.delete("/settings/github-token")

            assert response.status_code == 200
            assert response.json()["status"] == "removed"

            # Verify token was removed from saved config
            saved_config = mock_save.call_args[0][0]
            assert "github_token" not in saved_config

    def test_remove_github_token_not_in_env(self, client):
        """Test removing token when it's not in environment."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config'), \
             patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {}, clear=True):
            mock_settings.reload = MagicMock()

            response = client.delete("/settings/github-token")

            assert response.status_code == 200
            assert response.json()["status"] == "removed"


class TestClaudeSettingsEndpoints:
    """Tests for Claude Code settings endpoints."""

    def test_get_claude_settings_defaults(self, client, mock_settings):
        """Test getting Claude settings with defaults."""
        with patch('app.routers.settings.settings', mock_settings):
            response = client.get("/settings/claude")

            assert response.status_code == 200
            data = response.json()
            assert data["permission_mode"] == "acceptEdits"
            assert data["max_turns"] == 10
            assert data["model"] == "sonnet"
            assert data["headless_mode"] is False
            assert data["output_format"] == "stream-json"
            assert data["mcp_github"] is False
            assert data["allowed_tools"] == DEFAULT_ALLOWED_TOOLS
            assert data["disallowed_tools"] == []
            assert data["default_allowed_tools"] == DEFAULT_ALLOWED_TOOLS

    def test_get_claude_settings_custom_values(self, client):
        """Test getting Claude settings with custom values."""
        mock_settings = MagicMock()
        mock_settings.claude_permission_mode = "bypassPermissions"
        mock_settings.claude_max_turns = 25
        mock_settings.claude_model = "opus"
        mock_settings.claude_headless_mode = True
        mock_settings.claude_output_format = "json"
        mock_settings.claude_mcp_github = True
        mock_settings.get_allowed_tools.return_value = ["Read", "Write"]
        mock_settings.get_disallowed_tools.return_value = ["Bash"]

        with patch('app.routers.settings.settings', mock_settings):
            response = client.get("/settings/claude")

            assert response.status_code == 200
            data = response.json()
            assert data["permission_mode"] == "bypassPermissions"
            assert data["max_turns"] == 25
            assert data["model"] == "opus"
            assert data["headless_mode"] is True
            assert data["output_format"] == "json"
            assert data["mcp_github"] is True
            assert data["allowed_tools"] == ["Read", "Write"]
            assert data["disallowed_tools"] == ["Bash"]

    def test_update_claude_settings_full(self, client):
        """Test updating all Claude settings."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings:
            mock_settings.reload = MagicMock()

            response = client.put(
                "/settings/claude",
                json={
                    "permission_mode": "plan",
                    "allowed_tools": ["Read", "Glob", "Grep"],
                    "disallowed_tools": ["Bash"],
                    "max_turns": 20,
                    "model": "opus",
                    "headless_mode": True,
                    "output_format": "json",
                    "mcp_github": True,
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert data["permission_mode"] == "plan"
            assert data["allowed_tools"] == ["Read", "Glob", "Grep"]
            assert data["disallowed_tools"] == ["Bash"]
            assert data["max_turns"] == 20
            assert data["model"] == "opus"
            assert data["headless_mode"] is True
            assert data["output_format"] == "json"
            assert data["mcp_github"] is True

            # Verify config was saved
            mock_save.assert_called_once()
            saved_config = mock_save.call_args[0][0]
            assert saved_config["claude_permission_mode"] == "plan"
            assert saved_config["claude_max_turns"] == 20
            assert saved_config["claude_model"] == "opus"
            assert saved_config["claude_headless_mode"] is True
            assert saved_config["claude_output_format"] == "json"
            assert saved_config["claude_mcp_github"] is True
            assert saved_config["claude_allowed_tools"] == "Read,Glob,Grep"
            assert saved_config["claude_disallowed_tools"] == "Bash"

    def test_update_claude_settings_partial(self, client):
        """Test updating only some Claude settings."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings:
            mock_settings.reload = MagicMock()

            response = client.put(
                "/settings/claude",
                json={
                    "permission_mode": "acceptEdits",
                    "allowed_tools": [],
                    "disallowed_tools": [],
                    "max_turns": 15,
                    "model": "sonnet",
                    "headless_mode": False,
                    "output_format": "stream-json",
                    "mcp_github": False,
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert data["max_turns"] == 15
            # Empty allowed_tools returns defaults
            assert data["allowed_tools"] == DEFAULT_ALLOWED_TOOLS

    def test_update_claude_settings_empty_tools_removes_from_config(self, client):
        """Test that empty allowed_tools removes the key from config."""
        with patch('app.routers.settings.load_config', return_value={
            "claude_allowed_tools": "Read,Write"
        }), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings:
            mock_settings.reload = MagicMock()

            response = client.put(
                "/settings/claude",
                json={
                    "permission_mode": "acceptEdits",
                    "allowed_tools": [],
                    "disallowed_tools": [],
                    "max_turns": 10,
                    "model": "sonnet",
                    "headless_mode": False,
                    "output_format": "stream-json",
                    "mcp_github": False,
                }
            )

            assert response.status_code == 200

            # Verify empty tools are removed from config
            saved_config = mock_save.call_args[0][0]
            assert "claude_allowed_tools" not in saved_config
            assert "claude_disallowed_tools" not in saved_config

    def test_update_claude_settings_reloads_settings(self, client):
        """Test that updating settings triggers a reload."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config'), \
             patch('app.routers.settings.settings') as mock_settings:
            mock_settings.reload = MagicMock()

            response = client.put(
                "/settings/claude",
                json={
                    "permission_mode": "acceptEdits",
                    "allowed_tools": [],
                    "disallowed_tools": [],
                    "max_turns": 10,
                    "model": "sonnet",
                    "headless_mode": False,
                    "output_format": "stream-json",
                    "mcp_github": False,
                }
            )

            assert response.status_code == 200
            mock_settings.reload.assert_called_once()

    def test_update_claude_settings_invalid_permission_mode(self, client):
        """Test that invalid permission mode is rejected."""
        response = client.put(
            "/settings/claude",
            json={
                "permission_mode": "invalid_mode",
                "allowed_tools": [],
                "disallowed_tools": [],
                "max_turns": 10,
                "model": "sonnet",
                "headless_mode": False,
                "output_format": "stream-json",
                "mcp_github": False,
            }
        )

        assert response.status_code == 422  # Validation error

    def test_update_claude_settings_invalid_output_format(self, client):
        """Test that invalid output format is rejected."""
        response = client.put(
            "/settings/claude",
            json={
                "permission_mode": "acceptEdits",
                "allowed_tools": [],
                "disallowed_tools": [],
                "max_turns": 10,
                "model": "sonnet",
                "headless_mode": False,
                "output_format": "invalid_format",
                "mcp_github": False,
            }
        )

        assert response.status_code == 422  # Validation error

    def test_reset_claude_settings(self, client):
        """Test resetting Claude settings to defaults."""
        with patch('app.routers.settings.load_config', return_value={
            "claude_permission_mode": "bypassPermissions",
            "claude_allowed_tools": "Read,Write",
            "claude_disallowed_tools": "Bash",
            "claude_max_turns": 50,
            "claude_model": "opus",
            "claude_headless_mode": True,
            "claude_output_format": "json",
            "claude_mcp_github": True,
            "other_setting": "preserved",
        }), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {
                 "CLAUDE_PERMISSION_MODE": "bypassPermissions",
                 "CLAUDE_MAX_TURNS": "50",
             }):
            mock_settings.reload = MagicMock()

            response = client.post("/settings/claude/reset")

            assert response.status_code == 200
            assert response.json()["status"] == "reset"

            # Verify Claude settings were removed from config
            saved_config = mock_save.call_args[0][0]
            assert "claude_permission_mode" not in saved_config
            assert "claude_allowed_tools" not in saved_config
            assert "claude_disallowed_tools" not in saved_config
            assert "claude_max_turns" not in saved_config
            assert "claude_model" not in saved_config
            assert "claude_headless_mode" not in saved_config
            assert "claude_output_format" not in saved_config
            assert "claude_mcp_github" not in saved_config
            # Other settings should be preserved
            assert saved_config["other_setting"] == "preserved"

    def test_reset_claude_settings_clears_env_vars(self, client):
        """Test that reset clears environment variables."""
        env_vars = {
            "CLAUDE_PERMISSION_MODE": "plan",
            "CLAUDE_ALLOWED_TOOLS": "Read",
            "CLAUDE_DISALLOWED_TOOLS": "Write",
            "CLAUDE_MAX_TURNS": "20",
            "CLAUDE_MODEL": "opus",
            "CLAUDE_HEADLESS_MODE": "true",
            "CLAUDE_OUTPUT_FORMAT": "json",
            "CLAUDE_MCP_GITHUB": "true",
        }

        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config'), \
             patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, env_vars):
            mock_settings.reload = MagicMock()

            # Verify env vars are set before reset
            assert os.environ.get("CLAUDE_PERMISSION_MODE") == "plan"

            response = client.post("/settings/claude/reset")

            assert response.status_code == 200
            # Verify env vars are cleared
            assert os.environ.get("CLAUDE_PERMISSION_MODE") is None
            assert os.environ.get("CLAUDE_ALLOWED_TOOLS") is None
            assert os.environ.get("CLAUDE_MAX_TURNS") is None

    def test_reset_claude_settings_empty_config(self, client):
        """Test resetting when no Claude settings exist."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {}, clear=True):
            mock_settings.reload = MagicMock()

            response = client.post("/settings/claude/reset")

            assert response.status_code == 200
            assert response.json()["status"] == "reset"
            mock_save.assert_called_once()

    def test_reset_claude_settings_reloads(self, client):
        """Test that reset triggers settings reload."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config'), \
             patch('app.routers.settings.settings') as mock_settings, \
             patch.dict(os.environ, {}, clear=True):
            mock_settings.reload = MagicMock()

            response = client.post("/settings/claude/reset")

            assert response.status_code == 200
            mock_settings.reload.assert_called_once()


class TestSettingsValidation:
    """Tests for settings validation edge cases."""

    def test_update_claude_settings_negative_max_turns(self, client):
        """Test that negative max_turns is handled."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config'), \
             patch('app.routers.settings.settings') as mock_settings:
            mock_settings.reload = MagicMock()

            # Pydantic might allow negative integers by default
            response = client.put(
                "/settings/claude",
                json={
                    "permission_mode": "acceptEdits",
                    "allowed_tools": [],
                    "disallowed_tools": [],
                    "max_turns": -5,
                    "model": "sonnet",
                    "headless_mode": False,
                    "output_format": "stream-json",
                    "mcp_github": False,
                }
            )

            # This test documents current behavior - adjust if validation is added
            assert response.status_code == 200

    def test_update_claude_settings_large_max_turns(self, client):
        """Test large max_turns value."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config'), \
             patch('app.routers.settings.settings') as mock_settings:
            mock_settings.reload = MagicMock()

            response = client.put(
                "/settings/claude",
                json={
                    "permission_mode": "acceptEdits",
                    "allowed_tools": [],
                    "disallowed_tools": [],
                    "max_turns": 1000,
                    "model": "sonnet",
                    "headless_mode": False,
                    "output_format": "stream-json",
                    "mcp_github": False,
                }
            )

            assert response.status_code == 200
            assert response.json()["max_turns"] == 1000

    def test_update_claude_settings_empty_model(self, client):
        """Test empty model string."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config'), \
             patch('app.routers.settings.settings') as mock_settings:
            mock_settings.reload = MagicMock()

            response = client.put(
                "/settings/claude",
                json={
                    "permission_mode": "acceptEdits",
                    "allowed_tools": [],
                    "disallowed_tools": [],
                    "max_turns": 10,
                    "model": "",
                    "headless_mode": False,
                    "output_format": "stream-json",
                    "mcp_github": False,
                }
            )

            # Empty string is allowed - the app handles defaults elsewhere
            assert response.status_code == 200

    def test_update_claude_settings_tools_with_special_chars(self, client):
        """Test tools with special characters in names."""
        with patch('app.routers.settings.load_config', return_value={}), \
             patch('app.routers.settings.save_config') as mock_save, \
             patch('app.routers.settings.settings') as mock_settings:
            mock_settings.reload = MagicMock()

            response = client.put(
                "/settings/claude",
                json={
                    "permission_mode": "acceptEdits",
                    "allowed_tools": ["Bash(git add:*)", "Bash(npm run:*)"],
                    "disallowed_tools": ["Bash(rm:*)"],
                    "max_turns": 10,
                    "model": "sonnet",
                    "headless_mode": False,
                    "output_format": "stream-json",
                    "mcp_github": False,
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert "Bash(git add:*)" in data["allowed_tools"]
            assert "Bash(rm:*)" in data["disallowed_tools"]

            # Verify they're joined correctly
            saved_config = mock_save.call_args[0][0]
            assert saved_config["claude_allowed_tools"] == "Bash(git add:*),Bash(npm run:*)"
