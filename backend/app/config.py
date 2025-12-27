"""
Application settings.

Settings can be configured via:
1. Environment variables (highest priority)
2. ~/.clump/config.json
3. Backend .env file
4. Default values

The ~/.clump/config.json is the recommended place for persistent settings.
"""

import json
import os
from pathlib import Path
from typing import Literal


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


def _get_clump_config_path() -> Path:
    """Get the path to ~/.clump/config.json."""
    return Path.home() / ".clump" / "config.json"


def _load_clump_config() -> dict:
    """Load config from ~/.clump/config.json."""
    path = _get_clump_config_path()
    if not path.exists():
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def _save_clump_config(config: dict) -> None:
    """Save config to ~/.clump/config.json."""
    path = _get_clump_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(config, f, indent=2)


def _get_env_file_path() -> Path:
    """Get the backend .env file path."""
    return Path(__file__).parent.parent / ".env"


def _load_env_file() -> dict[str, str]:
    """Load settings from .env file."""
    env_path = _get_env_file_path()
    env_vars = {}

    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip()

    return env_vars


class Settings:
    """
    Application settings with layered configuration.

    Priority (highest to lowest):
    1. Environment variables
    2. ~/.clump/config.json
    3. .env file
    4. Default values
    """

    def __init__(self):
        # Load config sources
        self._clump_config = _load_clump_config()
        self._env_file = _load_env_file()

    def _get(self, key: str, default=None, env_key: str | None = None):
        """Get a config value from the layered config sources."""
        # Check environment variable first
        env_key = env_key or key.upper()
        if env_key in os.environ:
            return os.environ[env_key]

        # Check clump config
        if key in self._clump_config:
            return self._clump_config[key]

        # Check .env file
        if env_key in self._env_file:
            return self._env_file[env_key]

        return default

    def _get_bool(self, key: str, default: bool = False, env_key: str | None = None) -> bool:
        """Get a boolean config value."""
        value = self._get(key, default, env_key)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes")
        return bool(value)

    def _get_int(self, key: str, default: int = 0, env_key: str | None = None) -> int:
        """Get an integer config value."""
        value = self._get(key, default, env_key)
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    # ==========================================
    # GitHub Settings
    # ==========================================

    @property
    def github_token(self) -> str:
        return self._get("github_token", "", "GITHUB_TOKEN") or ""

    # ==========================================
    # Server Settings
    # ==========================================

    @property
    def host(self) -> str:
        return self._get("host", "127.0.0.1", "HOST") or "127.0.0.1"

    @property
    def port(self) -> int:
        return self._get_int("port", 8000, "PORT")

    # ==========================================
    # Claude Code Settings
    # ==========================================

    @property
    def claude_command(self) -> str:
        return self._get("claude_command", "claude", "CLAUDE_COMMAND") or "claude"

    @property
    def claude_permission_mode(self) -> Literal["default", "plan", "acceptEdits", "bypassPermissions"]:
        mode = self._get("claude_permission_mode", "acceptEdits", "CLAUDE_PERMISSION_MODE")
        if mode in ("default", "plan", "acceptEdits", "bypassPermissions"):
            return mode  # type: ignore
        return "acceptEdits"

    @property
    def claude_allowed_tools(self) -> str:
        return self._get("claude_allowed_tools", "", "CLAUDE_ALLOWED_TOOLS") or ""

    @property
    def claude_disallowed_tools(self) -> str:
        return self._get("claude_disallowed_tools", "", "CLAUDE_DISALLOWED_TOOLS") or ""

    @property
    def claude_max_turns(self) -> int:
        return self._get_int("claude_max_turns", 10, "CLAUDE_MAX_TURNS")

    @property
    def claude_model(self) -> str:
        return self._get("claude_model", "sonnet", "CLAUDE_MODEL") or "sonnet"

    @property
    def claude_headless_mode(self) -> bool:
        return self._get_bool("claude_headless_mode", False, "CLAUDE_HEADLESS_MODE")

    @property
    def claude_output_format(self) -> Literal["text", "json", "stream-json"]:
        fmt = self._get("claude_output_format", "stream-json", "CLAUDE_OUTPUT_FORMAT")
        if fmt in ("text", "json", "stream-json"):
            return fmt  # type: ignore
        return "stream-json"

    @property
    def claude_mcp_github(self) -> bool:
        return self._get_bool("claude_mcp_github", False, "CLAUDE_MCP_GITHUB")

    @property
    def claude_mcp_servers(self) -> str:
        return self._get("claude_mcp_servers", "", "CLAUDE_MCP_SERVERS") or ""

    # ==========================================
    # Paths
    # ==========================================

    @property
    def base_dir(self) -> Path:
        return Path(__file__).parent.parent.parent

    # ==========================================
    # Helper Methods
    # ==========================================

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
        """Get MCP server configuration for Claude Code."""
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

    def reload(self) -> None:
        """Reload config from files."""
        self._clump_config = _load_clump_config()
        self._env_file = _load_env_file()


# Singleton instance
settings = Settings()
