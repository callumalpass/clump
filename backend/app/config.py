from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path
from typing import Literal


# Compute absolute path for database
_BASE_DIR = Path(__file__).parent.parent
_DB_PATH = _BASE_DIR / "claude_code_hub.db"


# Default tools to auto-approve for issue analysis
DEFAULT_ALLOWED_TOOLS = [
    "Read",
    "Glob",
    "Grep",
    "Bash(git status:*)",
    "Bash(git log:*)",
    "Bash(git diff:*)",
    "Bash(git show:*)",
]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # GitHub
    github_token: str = ""

    # Database - use absolute path
    database_url: str = f"sqlite+aiosqlite:///{_DB_PATH}"

    # Server
    host: str = "127.0.0.1"
    port: int = 8000

    # Claude Code - Basic
    claude_command: str = "claude"

    # Claude Code - Permission Control
    # Permission mode: "default", "plan" (read-only), "acceptEdits", "bypassPermissions"
    claude_permission_mode: Literal["default", "plan", "acceptEdits", "bypassPermissions"] = "acceptEdits"

    # Comma-separated list of tools to auto-approve (e.g., "Read,Glob,Grep,Bash(git:*)")
    # If empty, uses DEFAULT_ALLOWED_TOOLS
    claude_allowed_tools: str = ""

    # Tools to explicitly disable
    claude_disallowed_tools: str = ""

    # Maximum agentic turns (0 = unlimited)
    claude_max_turns: int = 10

    # Model to use (sonnet, opus, haiku)
    claude_model: str = "sonnet"

    # Claude Code - Session Management
    # Whether to use headless mode (-p flag) for programmatic execution
    claude_headless_mode: bool = False

    # Output format for headless mode: "text", "json", "stream-json"
    claude_output_format: Literal["text", "json", "stream-json"] = "stream-json"

    # Claude Code - MCP Servers
    # Enable GitHub MCP server for direct GitHub integration
    claude_mcp_github: bool = False

    # Additional MCP servers (JSON string)
    # Example: '{"sentry": {"type": "sse", "url": "https://mcp.sentry.dev/mcp"}}'
    claude_mcp_servers: str = ""

    # Paths
    base_dir: Path = Path(__file__).parent.parent.parent

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def get_allowed_tools(self) -> list[str]:
        """Get list of allowed tools, using defaults if not specified."""
        if self.claude_allowed_tools:
            return [t.strip() for t in self.claude_allowed_tools.split(",")]
        return DEFAULT_ALLOWED_TOOLS

    def get_disallowed_tools(self) -> list[str]:
        """Get list of disallowed tools."""
        if self.claude_disallowed_tools:
            return [t.strip() for t in self.claude_disallowed_tools.split(",")]
        return []

    def get_mcp_config(self) -> dict | None:
        """
        Get MCP server configuration for Claude Code.

        Returns a dict suitable for --mcp-config flag or None if no MCP configured.
        """
        import json

        servers = {}

        # Add GitHub MCP if enabled
        if self.claude_mcp_github and self.github_token:
            servers["github"] = {
                "type": "http",
                "url": "https://api.githubcopilot.com/mcp/",
                "headers": {
                    "Authorization": f"Bearer {self.github_token}"
                }
            }

        # Parse additional MCP servers
        if self.claude_mcp_servers:
            try:
                additional = json.loads(self.claude_mcp_servers)
                servers.update(additional)
            except json.JSONDecodeError:
                pass

        return servers if servers else None


settings = Settings()
