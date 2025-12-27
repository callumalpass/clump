"""
Settings routes for managing configuration like GitHub PAT and Claude Code settings.

Settings are stored in ~/.clump/config.json for persistence.
"""

import os
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings, DEFAULT_ALLOWED_TOOLS
from app.storage import load_config, save_config

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
    """Set GitHub token (saves to ~/.clump/config.json)."""
    token = request.token.strip()

    if not token:
        raise HTTPException(status_code=400, detail="Token cannot be empty")

    # Validate token format (basic check)
    if not (token.startswith("ghp_") or token.startswith("github_pat_")):
        raise HTTPException(
            status_code=400,
            detail="Invalid token format. Should start with 'ghp_' or 'github_pat_'"
        )

    # Save to config.json
    config = load_config()
    config["github_token"] = token
    save_config(config)

    # Update runtime environment
    os.environ["GITHUB_TOKEN"] = token

    # Reload the GitHub client with new token
    try:
        from app.services.github_client import GitHubClient
        import app.services.github_client as gh_module
        gh_module.github_client = GitHubClient(token)
    except Exception as e:
        print(f"Warning: Failed to reload GitHub client: {e}")

    # Reload settings
    settings.reload()

    masked = f"{token[:4]}...{token[-4:]}"
    return GitHubTokenStatus(configured=True, masked_token=masked)


@router.delete("/settings/github-token")
async def remove_github_token():
    """Remove GitHub token."""
    config = load_config()
    config.pop("github_token", None)
    save_config(config)

    if "GITHUB_TOKEN" in os.environ:
        del os.environ["GITHUB_TOKEN"]

    settings.reload()
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
    """Update Claude Code settings (saves to ~/.clump/config.json)."""
    config = load_config()

    # Update settings
    config["claude_permission_mode"] = new_settings.permission_mode
    config["claude_max_turns"] = new_settings.max_turns
    config["claude_model"] = new_settings.model
    config["claude_headless_mode"] = new_settings.headless_mode
    config["claude_output_format"] = new_settings.output_format
    config["claude_mcp_github"] = new_settings.mcp_github

    # Handle tools lists
    if new_settings.allowed_tools:
        config["claude_allowed_tools"] = ",".join(new_settings.allowed_tools)
    else:
        config.pop("claude_allowed_tools", None)

    if new_settings.disallowed_tools:
        config["claude_disallowed_tools"] = ",".join(new_settings.disallowed_tools)
    else:
        config.pop("claude_disallowed_tools", None)

    save_config(config)

    # Reload settings to pick up changes
    settings.reload()

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
    config = load_config()

    # Remove all Claude settings
    keys_to_remove = [
        "claude_permission_mode",
        "claude_allowed_tools",
        "claude_disallowed_tools",
        "claude_max_turns",
        "claude_model",
        "claude_headless_mode",
        "claude_output_format",
        "claude_mcp_github",
    ]

    for key in keys_to_remove:
        config.pop(key, None)

    save_config(config)

    # Also clear environment variables if set
    env_keys = [
        "CLAUDE_PERMISSION_MODE",
        "CLAUDE_ALLOWED_TOOLS",
        "CLAUDE_DISALLOWED_TOOLS",
        "CLAUDE_MAX_TURNS",
        "CLAUDE_MODEL",
        "CLAUDE_HEADLESS_MODE",
        "CLAUDE_OUTPUT_FORMAT",
        "CLAUDE_MCP_GITHUB",
    ]
    for key in env_keys:
        os.environ.pop(key, None)

    settings.reload()
    return {"status": "reset"}
