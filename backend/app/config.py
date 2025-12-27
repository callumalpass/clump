from pydantic_settings import BaseSettings
from pathlib import Path


# Compute absolute path for database
_BASE_DIR = Path(__file__).parent.parent
_DB_PATH = _BASE_DIR / "claude_code_hub.db"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # GitHub
    github_token: str = ""

    # Database - use absolute path
    database_url: str = f"sqlite+aiosqlite:///{_DB_PATH}"

    # Server
    host: str = "127.0.0.1"
    port: int = 8000

    # Claude Code
    claude_command: str = "claude"
    claude_skip_permissions: bool = True  # Use --dangerously-skip-permissions

    # Paths
    base_dir: Path = Path(__file__).parent.parent.parent

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
