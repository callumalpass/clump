"""
Settings routes for managing configuration like GitHub PAT.
"""

import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


class GitHubTokenRequest(BaseModel):
    token: str


class GitHubTokenStatus(BaseModel):
    configured: bool
    masked_token: str | None = None


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
