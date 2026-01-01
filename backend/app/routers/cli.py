"""
CLI router.

Provides API endpoints for managing and querying CLI tool information.
"""

from fastapi import APIRouter

from app.cli.registry import get_cli_info, is_cli_installed
from app.cli.base import CLIType
from app.config import settings

router = APIRouter(prefix="/cli", tags=["cli"])


@router.get("/available")
async def list_available_clis():
    """
    List all available CLI tools and their capabilities.

    Returns information about each supported CLI including:
    - Whether it's installed
    - Its capabilities (headless, resume, etc.)
    - The command name
    """
    clis = get_cli_info()

    # Add default CLI info
    return {
        "clis": clis,
        "default_cli": settings.default_cli,
    }


@router.get("/{cli_type}/installed")
async def check_cli_installed(cli_type: str):
    """
    Check if a specific CLI is installed.

    Args:
        cli_type: The CLI type to check (claude, gemini, codex)

    Returns:
        Whether the CLI is installed
    """
    try:
        cli_enum = CLIType(cli_type)
        installed = is_cli_installed(cli_enum)
        return {"cli_type": cli_type, "installed": installed}
    except ValueError:
        return {"cli_type": cli_type, "installed": False, "error": "Unknown CLI type"}


@router.get("/settings")
async def get_cli_settings():
    """
    Get CLI-related settings.

    Returns:
        Settings for all CLI tools
    """
    return {
        "default_cli": settings.default_cli,
        "claude": {
            "command": settings.claude_command,
            "permission_mode": settings.claude_permission_mode,
            "model": settings.claude_model,
            "max_turns": settings.claude_max_turns,
        },
        "gemini": {
            "command": settings.gemini_command,
        },
        "codex": {
            "command": settings.codex_command,
        },
    }
