"""
Storage utilities for transcript-first architecture.

Claude Code stores transcripts in:
~/.claude/projects/{encoded-path}/{session-uuid}.jsonl

We store sidecar metadata in:
~/.clump/projects/{encoded-path}/{session-uuid}.json

The encoded-path uses Claude's format: path with slashes replaced by dashes.
e.g., /home/user/projects/myapp -> -home-user-projects-myapp
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Any, TypedDict, Optional
from dataclasses import dataclass, field


class RepoInfo(TypedDict):
    """Repository info stored in repos.json."""
    id: int
    owner: str
    name: str
    local_path: str


@dataclass
class EntityLink:
    """A link to a GitHub issue or PR."""
    kind: str  # "issue" or "pr"
    number: int


@dataclass
class SessionMetadata:
    """
    Sidecar metadata for a session.

    Stored in ~/.clump/projects/{encoded-path}/{session-uuid}.json
    """
    session_id: str
    title: Optional[str] = None
    summary: Optional[str] = None
    repo_path: Optional[str] = None
    entities: list[EntityLink] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    starred: bool = False
    created_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "title": self.title,
            "summary": self.summary,
            "repo_path": self.repo_path,
            "entities": [{"kind": e.kind, "number": e.number} for e in self.entities],
            "tags": self.tags,
            "starred": self.starred,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "SessionMetadata":
        entities = [
            EntityLink(kind=e["kind"], number=e["number"])
            for e in data.get("entities", [])
        ]
        return cls(
            session_id=data.get("session_id", ""),
            title=data.get("title"),
            summary=data.get("summary"),
            repo_path=data.get("repo_path"),
            entities=entities,
            tags=data.get("tags", []),
            starred=data.get("starred", False),
            created_at=data.get("created_at"),
        )


@dataclass
class DiscoveredSession:
    """A session discovered from Claude's transcript files."""
    session_id: str  # UUID from filename
    encoded_path: str  # Directory name (encoded working directory)
    transcript_path: Path  # Full path to JSONL file
    modified_at: datetime  # File modification time
    file_size: int  # File size in bytes
    metadata: Optional[SessionMetadata] = None  # Sidecar metadata if exists


# ==========================================
# Directory and Path Utilities
# ==========================================

def get_clump_dir() -> Path:
    """Get the main clump data directory (~/.clump/)."""
    clump_dir = Path.home() / ".clump"
    clump_dir.mkdir(parents=True, exist_ok=True)
    return clump_dir


def get_clump_projects_dir() -> Path:
    """Get the clump projects directory (~/.clump/projects/)."""
    projects_dir = get_clump_dir() / "projects"
    projects_dir.mkdir(parents=True, exist_ok=True)
    return projects_dir


def get_claude_projects_dir() -> Path:
    """Get Claude's projects directory (~/.claude/projects/)."""
    return Path.home() / ".claude" / "projects"


def encode_path(local_path: str) -> str:
    """
    Encode a local path using Claude's format.

    Replaces slashes with dashes.
    e.g., /home/user/projects/myapp -> -home-user-projects-myapp
    """
    normalized = str(Path(local_path).resolve())
    return normalized.replace("/", "-")


def decode_path(encoded: str) -> str:
    """
    Decode an encoded path back to the original format.

    Note: This is lossy - we can't distinguish between original dashes
    and encoded slashes. Returns best-effort path.
    """
    # Remove leading dash if present (from root /)
    if encoded.startswith("-"):
        return "/" + encoded[1:].replace("-", "/")
    return encoded.replace("-", "/")


def get_clump_session_dir(encoded_path: str) -> Path:
    """
    Get the clump directory for a specific encoded path.

    Returns ~/.clump/projects/{encoded-path}/ and creates it if needed.
    """
    session_dir = get_clump_projects_dir() / encoded_path
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir


def get_repo_db_path(local_path: str) -> Path:
    """
    Get the database path for a specific repo.

    Returns ~/.clump/projects/{encoded-path}/data.db and creates directory if needed.
    """
    encoded = encode_path(local_path)
    session_dir = get_clump_session_dir(encoded)
    return session_dir / "data.db"


# ==========================================
# Session Discovery
# ==========================================

def is_subsession(session_id: str) -> bool:
    """Check if a session ID represents a subsession (spawned by Task tool)."""
    # Agent subsessions have IDs like "agent-a1b2c3d" instead of full UUIDs
    return session_id.startswith("agent-")


def discover_sessions(
    repo_path: Optional[str] = None,
    include_subsessions: bool = False,
) -> list[DiscoveredSession]:
    """
    Discover all Claude sessions from ~/.claude/projects/.

    Args:
        repo_path: Optional path to filter sessions by repo.
                   If None, returns all sessions.
        include_subsessions: Whether to include agent subsessions spawned by
                            the Task tool. Defaults to False.

    Returns:
        List of DiscoveredSession objects, sorted by modification time (newest first).
    """
    claude_projects = get_claude_projects_dir()

    if not claude_projects.exists():
        return []

    sessions: list[DiscoveredSession] = []

    # If filtering by repo, only look in that directory
    if repo_path:
        encoded = encode_path(repo_path)
        project_dirs = [claude_projects / encoded] if (claude_projects / encoded).exists() else []
    else:
        project_dirs = [d for d in claude_projects.iterdir() if d.is_dir()]

    for project_dir in project_dirs:
        encoded_path = project_dir.name

        # Find all JSONL files in this project directory
        for jsonl_file in project_dir.glob("*.jsonl"):
            session_id = jsonl_file.stem  # filename without extension

            # Skip subsessions unless explicitly requested
            if not include_subsessions and is_subsession(session_id):
                continue

            try:
                stat = jsonl_file.stat()
                modified_at = datetime.fromtimestamp(stat.st_mtime)
                file_size = stat.st_size
            except OSError:
                continue

            # Try to load sidecar metadata
            metadata = get_session_metadata(encoded_path, session_id)

            sessions.append(DiscoveredSession(
                session_id=session_id,
                encoded_path=encoded_path,
                transcript_path=jsonl_file,
                modified_at=modified_at,
                file_size=file_size,
                metadata=metadata,
            ))

    # Sort by modification time, newest first
    sessions.sort(key=lambda s: s.modified_at, reverse=True)

    return sessions


def get_session_metadata(encoded_path: str, session_id: str) -> Optional[SessionMetadata]:
    """
    Read sidecar metadata for a session.

    Args:
        encoded_path: The encoded path directory name
        session_id: The session UUID

    Returns:
        SessionMetadata if sidecar exists, None otherwise.
    """
    sidecar_path = get_clump_projects_dir() / encoded_path / f"{session_id}.json"

    if not sidecar_path.exists():
        return None

    try:
        with open(sidecar_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return SessionMetadata.from_dict(data)
    except (json.JSONDecodeError, IOError, KeyError):
        return None


def save_session_metadata(encoded_path: str, session_id: str, metadata: SessionMetadata) -> None:
    """
    Save sidecar metadata for a session.

    Args:
        encoded_path: The encoded path directory name
        session_id: The session UUID
        metadata: The metadata to save
    """
    sidecar_dir = get_clump_projects_dir() / encoded_path
    sidecar_dir.mkdir(parents=True, exist_ok=True)

    sidecar_path = sidecar_dir / f"{session_id}.json"

    with open(sidecar_path, 'w', encoding='utf-8') as f:
        json.dump(metadata.to_dict(), f, indent=2)


def delete_session_metadata(encoded_path: str, session_id: str) -> bool:
    """
    Delete sidecar metadata for a session.

    Returns True if the file existed and was deleted.
    """
    sidecar_path = get_clump_projects_dir() / encoded_path / f"{session_id}.json"

    if sidecar_path.exists():
        sidecar_path.unlink()
        return True
    return False


def match_encoded_path_to_repo(encoded_path: str) -> Optional[RepoInfo]:
    """
    Try to match an encoded path to a known repo.

    Args:
        encoded_path: The encoded path directory name

    Returns:
        RepoInfo if a matching repo is found, None otherwise.
    """
    repos = load_repos()

    # Compare encoded versions to handle paths with dashes correctly
    # (decoding is lossy since dashes and slashes both become dashes when encoded)
    for repo in repos:
        repo_encoded = encode_path(repo["local_path"])
        if repo_encoded == encoded_path:
            return repo

    return None


def get_repos_json_path() -> Path:
    """Get the repos registry file path (~/.clump/repos.json)."""
    return get_clump_dir() / "repos.json"


def get_config_json_path() -> Path:
    """Get the global config file path (~/.clump/config.json)."""
    return get_clump_dir() / "config.json"


# ==========================================
# Repos Registry Operations
# ==========================================

def load_repos() -> list[RepoInfo]:
    """Load the repos registry from repos.json."""
    path = get_repos_json_path()
    if not path.exists():
        return []

    try:
        with open(path) as f:
            data = json.load(f)
            return data.get("repos", [])
    except (json.JSONDecodeError, IOError):
        return []


def save_repos(repos: list[RepoInfo]) -> None:
    """Save the repos registry to repos.json."""
    path = get_repos_json_path()
    with open(path, "w") as f:
        json.dump({"repos": repos}, f, indent=2)


def get_next_repo_id() -> int:
    """Get the next available repo ID."""
    repos = load_repos()
    if not repos:
        return 1
    return max(r["id"] for r in repos) + 1


def add_repo(owner: str, name: str, local_path: str) -> RepoInfo:
    """
    Add a new repo to the registry.

    Returns the created repo info with assigned ID.
    """
    repos = load_repos()

    # Check for duplicate path
    normalized_path = str(Path(local_path).resolve())
    for repo in repos:
        if str(Path(repo["local_path"]).resolve()) == normalized_path:
            raise ValueError(f"Repository at {local_path} already exists")

    new_id = get_next_repo_id()
    repo_info: RepoInfo = {
        "id": new_id,
        "owner": owner,
        "name": name,
        "local_path": normalized_path,
    }
    repos.append(repo_info)
    save_repos(repos)

    return repo_info


def get_repo_by_id(repo_id: int) -> RepoInfo | None:
    """Get a repo by its ID."""
    repos = load_repos()
    for repo in repos:
        if repo["id"] == repo_id:
            return repo
    return None


def get_repo_by_path(local_path: str) -> RepoInfo | None:
    """Get a repo by its local path."""
    normalized_path = str(Path(local_path).resolve())
    repos = load_repos()
    for repo in repos:
        if str(Path(repo["local_path"]).resolve()) == normalized_path:
            return repo
    return None


def delete_repo(repo_id: int) -> bool:
    """
    Delete a repo from the registry.

    Note: This does NOT delete the repo's session metadata - use delete_repo_data for that.
    Returns True if the repo was found and deleted.
    """
    repos = load_repos()
    original_count = len(repos)
    repos = [r for r in repos if r["id"] != repo_id]

    if len(repos) < original_count:
        save_repos(repos)
        return True
    return False


def delete_repo_data(local_path: str) -> bool:
    """
    Delete a repo's data directory.

    This removes the ~/.clump/projects/{encoded-path}/ directory and all its contents.
    Returns True if the directory existed and was deleted.
    """
    import shutil

    encoded = encode_path(local_path)
    repo_dir = get_clump_projects_dir() / encoded
    if repo_dir.exists():
        shutil.rmtree(repo_dir)
        return True
    return False


# ==========================================
# Config Operations
# ==========================================

def load_config() -> dict:
    """Load global config from config.json."""
    path = get_config_json_path()
    if not path.exists():
        return {}

    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_config(config: dict) -> None:
    """Save global config to config.json."""
    path = get_config_json_path()
    with open(path, "w") as f:
        json.dump(config, f, indent=2)


def get_config_value(key: str, default: Any = None) -> Any:
    """Get a config value by key."""
    config = load_config()
    return config.get(key, default)


def set_config_value(key: str, value: Any) -> None:
    """Set a config value."""
    config = load_config()
    config[key] = value
    save_config(config)
