"""
Settings routes for managing configuration like GitHub PAT and Claude Code settings.
"""

import os
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings, DEFAULT_ALLOWED_TOOLS

router = APIRouter()


class GitHubTokenRequest(BaseModel):
    token: str


class GitHubTokenStatus(BaseModel):
    configured: bool
    masked_token: str | None = None


class ClaudeCodeSettings(BaseModel):
    """Claude Code configuration settings."""

    permission_mode: Literal["default", "plan", "acceptEdits", "bypassPermissions"] = "acceptEdits"
    allowed_tools: list[str] = []
    disallowed_tools: list[str] = []
    max_turns: int = 10
    model: str = "sonnet"
    headless_mode: bool = False
    output_format: Literal["text", "json", "stream-json"] = "stream-json"
    mcp_github: bool = False


class ClaudeCodeSettingsResponse(BaseModel):
    """Response with current Claude Code settings."""

    permission_mode: str
    allowed_tools: list[str]
    disallowed_tools: list[str]
    max_turns: int
    model: str
    headless_mode: bool
    output_format: str
    mcp_github: bool
    default_allowed_tools: list[str]  # For UI to show defaults


def get_env_path() -> Path:
    """Get the .env file path."""
    # settings.py is at backend/app/routers/settings.py
    # .env is at backend/.env
    return Path(__file__).parent.parent.parent / ".env"


def read_env_file() -> dict[str, str]:
    """Read existing .env file."""
    env_path = get_env_path()
    env_vars = {}

    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip()

    return env_vars


def write_env_file(env_vars: dict[str, str]):
    """Write .env file."""
    env_path = get_env_path()

    with open(env_path, "w") as f:
        for key, value in env_vars.items():
            f.write(f"{key}={value}\n")


@router.get("/settings/github-token", response_model=GitHubTokenStatus)
async def get_github_token_status():
    """Check if GitHub token is configured."""
    token = settings.github_token or os.environ.get("GITHUB_TOKEN", "")

    if token and len(token) > 8:
        masked = f"{token[:4]}...{token[-4:]}"
        return GitHubTokenStatus(configured=True, masked_token=masked)

    return GitHubTokenStatus(configured=False)


@router.post("/settings/github-token", response_model=GitHubTokenStatus)
async def set_github_token(request: GitHubTokenRequest):
    """Set GitHub token (saves to .env file)."""
    token = request.token.strip()

    if not token:
        raise HTTPException(status_code=400, detail="Token cannot be empty")

    # Validate token format (basic check)
    if not (token.startswith("ghp_") or token.startswith("github_pat_")):
        raise HTTPException(
            status_code=400,
            detail="Invalid token format. Should start with 'ghp_' or 'github_pat_'"
        )

    # Read existing env vars
    env_vars = read_env_file()

    # Update token
    env_vars["GITHUB_TOKEN"] = token

    # Write back
    write_env_file(env_vars)

    # Update runtime settings
    os.environ["GITHUB_TOKEN"] = token

    # Reload the GitHub client with new token (deferred to avoid blocking)
    try:
        from app.services.github_client import GitHubClient
        import app.services.github_client as gh_module
        gh_module.github_client = GitHubClient(token)
    except Exception as e:
        print(f"Warning: Failed to reload GitHub client: {e}")

    masked = f"{token[:4]}...{token[-4:]}"
    return GitHubTokenStatus(configured=True, masked_token=masked)


@router.delete("/settings/github-token")
async def remove_github_token():
    """Remove GitHub token."""
    env_vars = read_env_file()

    if "GITHUB_TOKEN" in env_vars:
        del env_vars["GITHUB_TOKEN"]
        write_env_file(env_vars)

    if "GITHUB_TOKEN" in os.environ:
        del os.environ["GITHUB_TOKEN"]

    return {"status": "removed"}


# ============================================
# Claude Code Settings
# ============================================


@router.get("/settings/claude", response_model=ClaudeCodeSettingsResponse)
async def get_claude_settings():
    """Get current Claude Code settings."""
    return ClaudeCodeSettingsResponse(
        permission_mode=settings.claude_permission_mode,
        allowed_tools=settings.get_allowed_tools(),
        disallowed_tools=settings.get_disallowed_tools(),
        max_turns=settings.claude_max_turns,
        model=settings.claude_model,
        headless_mode=settings.claude_headless_mode,
        output_format=settings.claude_output_format,
        mcp_github=settings.claude_mcp_github,
        default_allowed_tools=DEFAULT_ALLOWED_TOOLS,
    )


@router.put("/settings/claude", response_model=ClaudeCodeSettingsResponse)
async def update_claude_settings(new_settings: ClaudeCodeSettings):
    """Update Claude Code settings (saves to .env file)."""
    env_vars = read_env_file()

    # Update settings
    env_vars["CLAUDE_PERMISSION_MODE"] = new_settings.permission_mode
    env_vars["CLAUDE_MAX_TURNS"] = str(new_settings.max_turns)
    env_vars["CLAUDE_MODEL"] = new_settings.model
    env_vars["CLAUDE_HEADLESS_MODE"] = str(new_settings.headless_mode).lower()
    env_vars["CLAUDE_OUTPUT_FORMAT"] = new_settings.output_format
    env_vars["CLAUDE_MCP_GITHUB"] = str(new_settings.mcp_github).lower()

    # Handle tools lists
    if new_settings.allowed_tools:
        env_vars["CLAUDE_ALLOWED_TOOLS"] = ",".join(new_settings.allowed_tools)
    elif "CLAUDE_ALLOWED_TOOLS" in env_vars:
        del env_vars["CLAUDE_ALLOWED_TOOLS"]

    if new_settings.disallowed_tools:
        env_vars["CLAUDE_DISALLOWED_TOOLS"] = ",".join(new_settings.disallowed_tools)
    elif "CLAUDE_DISALLOWED_TOOLS" in env_vars:
        del env_vars["CLAUDE_DISALLOWED_TOOLS"]

    write_env_file(env_vars)

    # Update runtime environment
    os.environ["CLAUDE_PERMISSION_MODE"] = new_settings.permission_mode
    os.environ["CLAUDE_MAX_TURNS"] = str(new_settings.max_turns)
    os.environ["CLAUDE_MODEL"] = new_settings.model
    os.environ["CLAUDE_HEADLESS_MODE"] = str(new_settings.headless_mode).lower()
    os.environ["CLAUDE_OUTPUT_FORMAT"] = new_settings.output_format
    os.environ["CLAUDE_MCP_GITHUB"] = str(new_settings.mcp_github).lower()

    if new_settings.allowed_tools:
        os.environ["CLAUDE_ALLOWED_TOOLS"] = ",".join(new_settings.allowed_tools)
    elif "CLAUDE_ALLOWED_TOOLS" in os.environ:
        del os.environ["CLAUDE_ALLOWED_TOOLS"]

    if new_settings.disallowed_tools:
        os.environ["CLAUDE_DISALLOWED_TOOLS"] = ",".join(new_settings.disallowed_tools)
    elif "CLAUDE_DISALLOWED_TOOLS" in os.environ:
        del os.environ["CLAUDE_DISALLOWED_TOOLS"]

    # Note: Settings object uses pydantic-settings which reads from env on init
    # To pick up changes, we'd need to reinitialize the settings object
    # For now, the env vars are updated and will be used on next session creation

    return ClaudeCodeSettingsResponse(
        permission_mode=new_settings.permission_mode,
        allowed_tools=new_settings.allowed_tools or DEFAULT_ALLOWED_TOOLS,
        disallowed_tools=new_settings.disallowed_tools,
        max_turns=new_settings.max_turns,
        model=new_settings.model,
        headless_mode=new_settings.headless_mode,
        output_format=new_settings.output_format,
        mcp_github=new_settings.mcp_github,
        default_allowed_tools=DEFAULT_ALLOWED_TOOLS,
    )


@router.post("/settings/claude/reset")
async def reset_claude_settings():
    """Reset Claude Code settings to defaults."""
    env_vars = read_env_file()

    # Remove all Claude settings
    keys_to_remove = [
        "CLAUDE_PERMISSION_MODE",
        "CLAUDE_ALLOWED_TOOLS",
        "CLAUDE_DISALLOWED_TOOLS",
        "CLAUDE_MAX_TURNS",
        "CLAUDE_MODEL",
        "CLAUDE_HEADLESS_MODE",
        "CLAUDE_OUTPUT_FORMAT",
        "CLAUDE_MCP_GITHUB",
    ]

    for key in keys_to_remove:
        env_vars.pop(key, None)
        os.environ.pop(key, None)

    write_env_file(env_vars)

    return {"status": "reset"}
