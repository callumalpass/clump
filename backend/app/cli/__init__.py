"""
CLI Adapter Package.

Provides a unified interface for interacting with different AI coding CLI tools:
- Claude Code (Anthropic)
- Gemini CLI (Google)
- Codex CLI (OpenAI)

Each CLI has its own adapter that implements the CLIAdapter interface,
handling command building, session discovery, and output parsing.
"""

from app.cli.base import (
    CLIAdapter,
    CLICapabilities,
    CLIType,
    SessionDiscoveryConfig,
    SessionInfo,
)
from app.cli.registry import get_adapter, get_all_adapters, get_default_adapter, is_cli_installed, get_cli_info

__all__ = [
    "CLIAdapter",
    "CLICapabilities",
    "CLIType",
    "SessionDiscoveryConfig",
    "SessionInfo",
    "get_adapter",
    "get_all_adapters",
    "get_default_adapter",
    "is_cli_installed",
    "get_cli_info",
]
