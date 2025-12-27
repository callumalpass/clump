"""Tests for app.config module."""

import pytest
from unittest.mock import patch
from app.config import Settings, DEFAULT_ALLOWED_TOOLS


class TestGetAllowedTools:
    """Tests for Settings.get_allowed_tools method."""

    def test_returns_defaults_when_empty(self):
        """When claude_allowed_tools is empty, returns DEFAULT_ALLOWED_TOOLS."""
        settings = Settings(claude_allowed_tools="")
        result = settings.get_allowed_tools()
        assert result == DEFAULT_ALLOWED_TOOLS

    def test_parses_comma_separated_tools(self):
        """Parses a comma-separated list of tools."""
        settings = Settings(claude_allowed_tools="Read,Glob,Grep")
        result = settings.get_allowed_tools()
        assert result == ["Read", "Glob", "Grep"]

    def test_strips_whitespace(self):
        """Strips whitespace around tool names."""
        settings = Settings(claude_allowed_tools="  Read  ,  Glob  ,  Grep  ")
        result = settings.get_allowed_tools()
        assert result == ["Read", "Glob", "Grep"]

    def test_handles_single_tool(self):
        """Handles a single tool without commas."""
        settings = Settings(claude_allowed_tools="Read")
        result = settings.get_allowed_tools()
        assert result == ["Read"]

    def test_handles_bash_patterns(self):
        """Handles Bash patterns with colons and wildcards."""
        settings = Settings(claude_allowed_tools="Read,Bash(git:*),Glob")
        result = settings.get_allowed_tools()
        assert result == ["Read", "Bash(git:*)", "Glob"]


class TestGetDisallowedTools:
    """Tests for Settings.get_disallowed_tools method."""

    def test_returns_empty_list_when_not_set(self):
        """Returns empty list when no tools are disallowed."""
        settings = Settings(claude_disallowed_tools="")
        result = settings.get_disallowed_tools()
        assert result == []

    def test_parses_comma_separated_tools(self):
        """Parses a comma-separated list of disallowed tools."""
        settings = Settings(claude_disallowed_tools="Write,Edit")
        result = settings.get_disallowed_tools()
        assert result == ["Write", "Edit"]

    def test_strips_whitespace(self):
        """Strips whitespace around tool names."""
        settings = Settings(claude_disallowed_tools="  Write  ,  Edit  ")
        result = settings.get_disallowed_tools()
        assert result == ["Write", "Edit"]


class TestGetMcpConfig:
    """Tests for Settings.get_mcp_config method."""

    def test_returns_none_when_no_mcp_configured(self):
        """Returns None when no MCP servers are configured."""
        settings = Settings(claude_mcp_github=False, claude_mcp_servers="")
        result = settings.get_mcp_config()
        assert result is None

    def test_adds_github_mcp_when_enabled(self):
        """Adds GitHub MCP server when enabled and token is present."""
        settings = Settings(
            github_token="test-token",
            claude_mcp_github=True,
            claude_mcp_servers=""
        )
        result = settings.get_mcp_config()
        assert result is not None
        assert "github" in result
        assert result["github"]["type"] == "http"
        assert "Bearer test-token" in result["github"]["headers"]["Authorization"]

    def test_parses_additional_mcp_servers(self):
        """Parses additional MCP servers from JSON string."""
        settings = Settings(
            claude_mcp_github=False,
            claude_mcp_servers='{"sentry": {"type": "sse", "url": "https://example.com"}}'
        )
        result = settings.get_mcp_config()
        assert result is not None
        assert "sentry" in result
        assert result["sentry"]["type"] == "sse"

    def test_handles_invalid_mcp_json_gracefully(self):
        """Handles invalid JSON in mcp_servers without raising."""
        settings = Settings(
            claude_mcp_github=False,
            claude_mcp_servers="not valid json"
        )
        result = settings.get_mcp_config()
        # Should return None since no valid servers parsed
        assert result is None
