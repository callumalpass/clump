"""
CLI adapter registry.

Provides factory functions for getting CLI adapters by type,
and utilities for working with all registered adapters.
"""

import shutil
from typing import Optional

from app.cli.base import CLIAdapter, CLIType
from app.cli.claude_adapter import ClaudeAdapter
from app.cli.codex_adapter import CodexAdapter
from app.cli.gemini_adapter import GeminiAdapter

# Singleton adapter instances (adapters are stateless)
_adapters: dict[CLIType, CLIAdapter] = {}


def get_adapter(cli_type: CLIType | str) -> CLIAdapter:
    """
    Get or create an adapter for the specified CLI type.

    Args:
        cli_type: The CLI type (CLIType enum or string value).

    Returns:
        The adapter instance for the specified CLI type.

    Raises:
        ValueError: If the CLI type is not recognized.
    """
    # Convert string to enum if needed
    if isinstance(cli_type, str):
        try:
            cli_type = CLIType(cli_type)
        except ValueError:
            raise ValueError(f"Unknown CLI type: {cli_type}")

    # Create adapter if not cached
    if cli_type not in _adapters:
        if cli_type == CLIType.CLAUDE:
            _adapters[cli_type] = ClaudeAdapter()
        elif cli_type == CLIType.GEMINI:
            _adapters[cli_type] = GeminiAdapter()
        elif cli_type == CLIType.CODEX:
            _adapters[cli_type] = CodexAdapter()
        else:
            raise ValueError(f"Unknown CLI type: {cli_type}")

    return _adapters[cli_type]


def get_default_adapter() -> CLIAdapter:
    """
    Get the default CLI adapter (Claude Code).

    Returns:
        The Claude Code adapter instance.
    """
    return get_adapter(CLIType.CLAUDE)


def get_all_adapters() -> list[CLIAdapter]:
    """
    Get all registered CLI adapters.

    Returns:
        List of all adapter instances.
    """
    return [get_adapter(t) for t in CLIType]


def is_cli_installed(cli_type: CLIType | str) -> bool:
    """
    Check if a CLI tool is installed and available on PATH.

    Args:
        cli_type: The CLI type to check.

    Returns:
        True if the CLI command is found on PATH.
    """
    adapter = get_adapter(cli_type)
    return shutil.which(adapter.command_name) is not None


def get_installed_adapters() -> list[CLIAdapter]:
    """
    Get adapters for all installed CLI tools.

    Returns:
        List of adapters for CLIs that are installed.
    """
    return [a for a in get_all_adapters() if is_cli_installed(a.cli_type)]


def get_adapter_by_command(command: str) -> Optional[CLIAdapter]:
    """
    Get an adapter by its command name.

    Args:
        command: The CLI command name (e.g., 'claude', 'gemini', 'codex').

    Returns:
        The adapter for the command, or None if not found.
    """
    for adapter in get_all_adapters():
        if adapter.command_name == command:
            return adapter
    return None


def get_cli_info() -> list[dict]:
    """
    Get information about all CLI tools for the API.

    Returns:
        List of dicts with CLI info including:
        - type: CLI type string
        - name: Display name
        - command: Command name
        - installed: Whether the CLI is installed
        - capabilities: Dict of capability flags
    """
    result = []
    for adapter in get_all_adapters():
        caps = adapter.capabilities
        result.append(
            {
                "type": adapter.cli_type.value,
                "name": adapter.display_name,
                "command": adapter.command_name,
                "installed": is_cli_installed(adapter.cli_type),
                "capabilities": {
                    "headless": caps.supports_headless,
                    "resume": caps.supports_resume,
                    "session_id": caps.supports_session_id,
                    "tool_allowlist": caps.supports_tool_allowlist,
                    "permission_modes": caps.supports_permission_modes,
                    "max_turns": caps.supports_max_turns,
                },
            }
        )
    return result
