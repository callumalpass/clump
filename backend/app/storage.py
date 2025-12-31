"""
Storage utilities for transcript-first architecture.

Claude Code stores transcripts in:
~/.claude/projects/{encoded-path}/{session-uuid}.jsonl

We store sidecar metadata in:
~/.clump/projects/{encoded-path}/{session-uuid}.json

Issue metadata is stored in (checked in order):
1. {repo-path}/.clump/issues/{issue-number}.json  (primary - works with Claude sandbox)
2. ~/.clump/projects/{encoded-path}/issues/{issue-number}.json  (fallback)

The encoded-path uses Claude's format: path with slashes replaced by dashes.
e.g., /home/user/projects/myapp -> -home-user-projects-myapp

Performance optimizations:
- Parallel filesystem scanning using thread pool
- Batched I/O operations for session discovery
"""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from datetime import datetime
from typing import Any, TypedDict, Optional
from dataclasses import dataclass, field


# Thread pool for parallel filesystem operations
_fs_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="fs_scan")


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
    scheduled_job_id: Optional[int] = None  # ID of schedule that created this session

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
            "scheduled_job_id": self.scheduled_job_id,
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
            scheduled_job_id=data.get("scheduled_job_id"),
        )


@dataclass
class IssueMetadata:
    """
    Sidecar metadata for a GitHub issue.

    Primary location: {repo-path}/.clump/issues/{issue-number}.json
    Fallback: ~/.clump/projects/{encoded-path}/issues/{issue-number}.json

    This allows Claude to directly write issue analysis and metadata.
    """
    issue_number: int

    # Local status (track issue progress without GitHub)
    status: Optional[str] = None        # "open" | "in_progress" | "completed" | "wontfix"

    # Tags (synced from database for Claude visibility)
    tags: list[str] = field(default_factory=list)  # e.g., ["backend", "urgent"]

    # Assessments (independent per-issue evaluations)
    priority: Optional[str] = None      # "critical" | "high" | "medium" | "low"
    difficulty: Optional[str] = None    # "trivial" | "easy" | "medium" | "hard" | "complex"
    risk: Optional[str] = None          # "low" | "medium" | "high"

    # Categorical
    type: Optional[str] = None          # "bug" | "feature" | "refactor" | "docs" | "chore" | "question"
    affected_areas: list[str] = field(default_factory=list)  # e.g., ["auth", "api", "frontend"]

    # Analysis content
    ai_summary: Optional[str] = None    # One-line AI-generated summary
    notes: Optional[str] = None         # Free-form analysis/notes
    root_cause: Optional[str] = None    # For bugs - underlying cause
    suggested_fix: Optional[str] = None # Brief fix approach

    # Meta
    analyzed_at: Optional[str] = None   # ISO timestamp of last analysis
    analyzed_by: Optional[str] = None   # Model that analyzed (e.g., "claude-sonnet-4")

    def to_dict(self) -> dict:
        return {
            "issue_number": self.issue_number,
            "status": self.status,
            "tags": self.tags,
            "priority": self.priority,
            "difficulty": self.difficulty,
            "risk": self.risk,
            "type": self.type,
            "affected_areas": self.affected_areas,
            "ai_summary": self.ai_summary,
            "notes": self.notes,
            "root_cause": self.root_cause,
            "suggested_fix": self.suggested_fix,
            "analyzed_at": self.analyzed_at,
            "analyzed_by": self.analyzed_by,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "IssueMetadata":
        return cls(
            issue_number=data.get("issue_number", 0),
            status=data.get("status"),
            tags=data.get("tags", []),
            priority=data.get("priority"),
            difficulty=data.get("difficulty"),
            risk=data.get("risk"),
            type=data.get("type"),
            affected_areas=data.get("affected_areas", []),
            ai_summary=data.get("ai_summary"),
            notes=data.get("notes"),
            root_cause=data.get("root_cause"),
            suggested_fix=data.get("suggested_fix"),
            analyzed_at=data.get("analyzed_at"),
            analyzed_by=data.get("analyzed_by"),
        )


@dataclass
class PRMetadata:
    """
    Sidecar metadata for a GitHub pull request.

    Primary location: {repo-path}/.clump/prs/{pr-number}.json
    Fallback: ~/.clump/projects/{encoded-path}/prs/{pr-number}.json

    This allows Claude to directly write PR analysis and metadata.
    """
    pr_number: int

    # Local status (track PR progress without GitHub)
    status: Optional[str] = None            # "open" | "reviewing" | "approved" | "merged" | "closed"

    # Tags (synced from database for Claude visibility)
    tags: list[str] = field(default_factory=list)  # e.g., ["needs-review", "urgent"]

    # Assessments
    risk: Optional[str] = None              # "low" | "medium" | "high"
    complexity: Optional[str] = None        # "trivial" | "simple" | "moderate" | "complex"
    review_priority: Optional[str] = None   # "critical" | "high" | "medium" | "low"

    # Review findings
    security_concerns: list[str] = field(default_factory=list)  # Security issues found
    test_coverage: Optional[str] = None     # "good" | "partial" | "missing"
    breaking_changes: bool = False          # Has breaking changes?

    # Categorical
    change_type: Optional[str] = None       # "feature" | "bugfix" | "refactor" | "docs" | "chore"
    affected_areas: list[str] = field(default_factory=list)  # e.g., ["auth", "api", "frontend"]

    # Analysis content
    ai_summary: Optional[str] = None        # One-line AI-generated summary
    review_notes: Optional[str] = None      # Code review notes/feedback
    suggested_improvements: Optional[str] = None  # Suggestions for improvement

    # Meta
    analyzed_at: Optional[str] = None       # ISO timestamp of last analysis
    analyzed_by: Optional[str] = None       # Model that analyzed

    def to_dict(self) -> dict:
        return {
            "pr_number": self.pr_number,
            "status": self.status,
            "tags": self.tags,
            "risk": self.risk,
            "complexity": self.complexity,
            "review_priority": self.review_priority,
            "security_concerns": self.security_concerns,
            "test_coverage": self.test_coverage,
            "breaking_changes": self.breaking_changes,
            "change_type": self.change_type,
            "affected_areas": self.affected_areas,
            "ai_summary": self.ai_summary,
            "review_notes": self.review_notes,
            "suggested_improvements": self.suggested_improvements,
            "analyzed_at": self.analyzed_at,
            "analyzed_by": self.analyzed_by,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "PRMetadata":
        return cls(
            pr_number=data.get("pr_number", 0),
            status=data.get("status"),
            tags=data.get("tags", []),
            risk=data.get("risk"),
            complexity=data.get("complexity"),
            review_priority=data.get("review_priority"),
            security_concerns=data.get("security_concerns", []),
            test_coverage=data.get("test_coverage"),
            breaking_changes=data.get("breaking_changes", False),
            change_type=data.get("change_type"),
            affected_areas=data.get("affected_areas", []),
            ai_summary=data.get("ai_summary"),
            review_notes=data.get("review_notes"),
            suggested_improvements=data.get("suggested_improvements"),
            analyzed_at=data.get("analyzed_at"),
            analyzed_by=data.get("analyzed_by"),
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

    @property
    def repo_path(self) -> str:
        """Decode the encoded_path to get the original repository path."""
        return decode_path(self.encoded_path)


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

    Replaces slashes and underscores with dashes.
    e.g., /home/user/projects/my_app -> -home-user-projects-my-app
    """
    normalized = str(Path(local_path).resolve())
    return normalized.replace("/", "-").replace("_", "-")


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


def _scan_project_dir(
    project_dir: Path,
    include_subsessions: bool,
    clump_projects_dir: Path,
) -> list[DiscoveredSession]:
    """
    Scan a single project directory for sessions.

    This is designed to be called in parallel from a thread pool.
    """
    sessions: list[DiscoveredSession] = []
    encoded_path = project_dir.name

    # Batch stat all JSONL files in this directory
    try:
        jsonl_files = list(project_dir.glob("*.jsonl"))
    except OSError:
        return sessions

    for jsonl_file in jsonl_files:
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

        # Try to load sidecar metadata (inline to avoid function call overhead)
        metadata = None
        sidecar_path = clump_projects_dir / encoded_path / f"{session_id}.json"
        if sidecar_path.exists():
            try:
                with open(sidecar_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    metadata = SessionMetadata.from_dict(data)
            except (json.JSONDecodeError, IOError, KeyError):
                pass

        sessions.append(DiscoveredSession(
            session_id=session_id,
            encoded_path=encoded_path,
            transcript_path=jsonl_file,
            modified_at=modified_at,
            file_size=file_size,
            metadata=metadata,
        ))

    return sessions


def discover_sessions(
    repo_path: Optional[str] = None,
    include_subsessions: bool = False,
) -> list[DiscoveredSession]:
    """
    Discover all Claude sessions from ~/.claude/projects/.

    Uses parallel filesystem scanning for improved performance on large
    project directories.

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

    # If filtering by repo, only look in that directory
    if repo_path:
        encoded = encode_path(repo_path)
        project_dirs = [claude_projects / encoded] if (claude_projects / encoded).exists() else []
    else:
        try:
            project_dirs = [d for d in claude_projects.iterdir() if d.is_dir()]
        except OSError:
            return []

    # For single directory, scan directly without thread pool overhead
    if len(project_dirs) <= 1:
        if not project_dirs:
            return []
        clump_projects_dir = get_clump_projects_dir()
        sessions = _scan_project_dir(project_dirs[0], include_subsessions, clump_projects_dir)
        sessions.sort(key=lambda s: s.modified_at, reverse=True)
        return sessions

    # For multiple directories, scan in parallel using thread pool
    clump_projects_dir = get_clump_projects_dir()

    # Submit all directory scans to the thread pool
    futures = [
        _fs_executor.submit(_scan_project_dir, project_dir, include_subsessions, clump_projects_dir)
        for project_dir in project_dirs
    ]

    # Collect all results
    all_sessions: list[DiscoveredSession] = []
    for future in futures:
        try:
            sessions = future.result(timeout=30)  # 30s timeout per directory
            all_sessions.extend(sessions)
        except Exception:
            # Skip directories that fail to scan
            continue

    # Sort by modification time, newest first
    all_sessions.sort(key=lambda s: s.modified_at, reverse=True)

    return all_sessions


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


# ==========================================
# Issue Metadata Operations
# ==========================================

def get_local_issues_dir(repo_path: str) -> Path:
    """
    Get the local issues metadata directory for a repo.

    Returns {repo_path}/.clump/issues/ and creates it if needed.
    This is the primary location for issue metadata (works with Claude sandbox).
    """
    issues_dir = Path(repo_path) / ".clump" / "issues"
    issues_dir.mkdir(parents=True, exist_ok=True)
    return issues_dir


def get_clump_issues_dir(encoded_path: str) -> Path:
    """
    Get the global issues metadata directory for a specific encoded path.

    Returns ~/.clump/projects/{encoded-path}/issues/ and creates it if needed.
    This is the fallback location for issue metadata.
    """
    issues_dir = get_clump_projects_dir() / encoded_path / "issues"
    issues_dir.mkdir(parents=True, exist_ok=True)
    return issues_dir


def get_issue_metadata(encoded_path: str, issue_number: int) -> Optional[IssueMetadata]:
    """
    Read sidecar metadata for an issue.

    Checks local repo .clump/issues/ first, then falls back to ~/.clump/projects/.

    Args:
        encoded_path: The encoded path directory name
        issue_number: The GitHub issue number

    Returns:
        IssueMetadata if sidecar exists, None otherwise.
    """
    # Primary: check local repo .clump/issues/
    repo_path = decode_path(encoded_path)
    local_issues_dir = Path(repo_path) / ".clump" / "issues"
    local_sidecar_path = local_issues_dir / f"{issue_number}.json"

    if local_sidecar_path.exists():
        try:
            with open(local_sidecar_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return IssueMetadata.from_dict(data)
        except (json.JSONDecodeError, IOError, KeyError):
            pass

    # Fallback: check ~/.clump/projects/{encoded-path}/issues/
    global_issues_dir = get_clump_projects_dir() / encoded_path / "issues"
    global_sidecar_path = global_issues_dir / f"{issue_number}.json"

    if global_sidecar_path.exists():
        try:
            with open(global_sidecar_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return IssueMetadata.from_dict(data)
        except (json.JSONDecodeError, IOError, KeyError):
            pass

    return None


def save_issue_metadata(encoded_path: str, issue_number: int, metadata: IssueMetadata) -> None:
    """
    Save sidecar metadata for an issue.

    Saves to local repo .clump/issues/ (primary location).

    Args:
        encoded_path: The encoded path directory name
        issue_number: The GitHub issue number
        metadata: The metadata to save
    """
    repo_path = decode_path(encoded_path)
    issues_dir = get_local_issues_dir(repo_path)
    sidecar_path = issues_dir / f"{issue_number}.json"

    with open(sidecar_path, 'w', encoding='utf-8') as f:
        json.dump(metadata.to_dict(), f, indent=2)


def delete_issue_metadata(encoded_path: str, issue_number: int) -> bool:
    """
    Delete sidecar metadata for an issue.

    Checks both local and global locations.
    Returns True if a file existed and was deleted.
    """
    deleted = False

    # Try local repo .clump/issues/
    repo_path = decode_path(encoded_path)
    local_issues_dir = Path(repo_path) / ".clump" / "issues"
    local_sidecar_path = local_issues_dir / f"{issue_number}.json"

    if local_sidecar_path.exists():
        local_sidecar_path.unlink()
        deleted = True

    # Also try global ~/.clump/projects/{encoded-path}/issues/
    global_issues_dir = get_clump_projects_dir() / encoded_path / "issues"
    global_sidecar_path = global_issues_dir / f"{issue_number}.json"

    if global_sidecar_path.exists():
        global_sidecar_path.unlink()
        deleted = True

    return deleted


def list_issue_metadata(encoded_path: str) -> list[IssueMetadata]:
    """
    List all issue metadata for a repo.

    Merges metadata from both local repo .clump/issues/ and ~/.clump/projects/.
    Local metadata takes precedence for duplicate issue numbers.

    Args:
        encoded_path: The encoded path directory name

    Returns:
        List of IssueMetadata objects for all issues with metadata.
    """
    metadata_by_issue: dict[int, IssueMetadata] = {}

    # First, load from global ~/.clump/projects/{encoded-path}/issues/
    global_issues_dir = get_clump_projects_dir() / encoded_path / "issues"
    if global_issues_dir.exists():
        try:
            for json_file in global_issues_dir.glob("*.json"):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        meta = IssueMetadata.from_dict(data)
                        metadata_by_issue[meta.issue_number] = meta
                except (json.JSONDecodeError, IOError, KeyError):
                    continue
        except OSError:
            pass

    # Then, load from local repo .clump/issues/ (overrides global)
    repo_path = decode_path(encoded_path)
    local_issues_dir = Path(repo_path) / ".clump" / "issues"
    if local_issues_dir.exists():
        try:
            for json_file in local_issues_dir.glob("*.json"):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        meta = IssueMetadata.from_dict(data)
                        metadata_by_issue[meta.issue_number] = meta
                except (json.JSONDecodeError, IOError, KeyError):
                    continue
        except OSError:
            pass

    return list(metadata_by_issue.values())


# ==========================================
# PR Metadata Operations
# ==========================================

def get_local_prs_dir(repo_path: str) -> Path:
    """
    Get the local PRs metadata directory for a repo.

    Returns {repo_path}/.clump/prs/ and creates it if needed.
    This is the primary location for PR metadata (works with Claude sandbox).
    """
    prs_dir = Path(repo_path) / ".clump" / "prs"
    prs_dir.mkdir(parents=True, exist_ok=True)
    return prs_dir


def get_clump_prs_dir(encoded_path: str) -> Path:
    """
    Get the global PRs metadata directory for a specific encoded path.

    Returns ~/.clump/projects/{encoded-path}/prs/ and creates it if needed.
    This is the fallback location for PR metadata.
    """
    prs_dir = get_clump_projects_dir() / encoded_path / "prs"
    prs_dir.mkdir(parents=True, exist_ok=True)
    return prs_dir


def get_pr_metadata(encoded_path: str, pr_number: int) -> Optional[PRMetadata]:
    """
    Read sidecar metadata for a PR.

    Checks local repo .clump/prs/ first, then falls back to ~/.clump/projects/.

    Args:
        encoded_path: The encoded path directory name
        pr_number: The GitHub PR number

    Returns:
        PRMetadata if sidecar exists, None otherwise.
    """
    # Primary: check local repo .clump/prs/
    repo_path = decode_path(encoded_path)
    local_prs_dir = Path(repo_path) / ".clump" / "prs"
    local_sidecar_path = local_prs_dir / f"{pr_number}.json"

    if local_sidecar_path.exists():
        try:
            with open(local_sidecar_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return PRMetadata.from_dict(data)
        except (json.JSONDecodeError, IOError, KeyError):
            pass

    # Fallback: check ~/.clump/projects/{encoded-path}/prs/
    global_prs_dir = get_clump_projects_dir() / encoded_path / "prs"
    global_sidecar_path = global_prs_dir / f"{pr_number}.json"

    if global_sidecar_path.exists():
        try:
            with open(global_sidecar_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return PRMetadata.from_dict(data)
        except (json.JSONDecodeError, IOError, KeyError):
            pass

    return None


def save_pr_metadata(encoded_path: str, pr_number: int, metadata: PRMetadata) -> None:
    """
    Save sidecar metadata for a PR.

    Saves to local repo .clump/prs/ (primary location).

    Args:
        encoded_path: The encoded path directory name
        pr_number: The GitHub PR number
        metadata: The metadata to save
    """
    repo_path = decode_path(encoded_path)
    prs_dir = get_local_prs_dir(repo_path)
    sidecar_path = prs_dir / f"{pr_number}.json"

    with open(sidecar_path, 'w', encoding='utf-8') as f:
        json.dump(metadata.to_dict(), f, indent=2)


def delete_pr_metadata(encoded_path: str, pr_number: int) -> bool:
    """
    Delete sidecar metadata for a PR.

    Checks both local and global locations.
    Returns True if a file existed and was deleted.
    """
    deleted = False

    # Try local repo .clump/prs/
    repo_path = decode_path(encoded_path)
    local_prs_dir = Path(repo_path) / ".clump" / "prs"
    local_sidecar_path = local_prs_dir / f"{pr_number}.json"

    if local_sidecar_path.exists():
        local_sidecar_path.unlink()
        deleted = True

    # Also try global ~/.clump/projects/{encoded-path}/prs/
    global_prs_dir = get_clump_projects_dir() / encoded_path / "prs"
    global_sidecar_path = global_prs_dir / f"{pr_number}.json"

    if global_sidecar_path.exists():
        global_sidecar_path.unlink()
        deleted = True

    return deleted


def list_pr_metadata(encoded_path: str) -> list[PRMetadata]:
    """
    List all PR metadata for a repo.

    Merges metadata from both local repo .clump/prs/ and ~/.clump/projects/.
    Local metadata takes precedence for duplicate PR numbers.

    Args:
        encoded_path: The encoded path directory name

    Returns:
        List of PRMetadata objects for all PRs with metadata.
    """
    metadata_by_pr: dict[int, PRMetadata] = {}

    # First, load from global ~/.clump/projects/{encoded-path}/prs/
    global_prs_dir = get_clump_projects_dir() / encoded_path / "prs"
    if global_prs_dir.exists():
        try:
            for json_file in global_prs_dir.glob("*.json"):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        meta = PRMetadata.from_dict(data)
                        metadata_by_pr[meta.pr_number] = meta
                except (json.JSONDecodeError, IOError, KeyError):
                    continue
        except OSError:
            pass

    # Then, load from local repo .clump/prs/ (overrides global)
    repo_path = decode_path(encoded_path)
    local_prs_dir = Path(repo_path) / ".clump" / "prs"
    if local_prs_dir.exists():
        try:
            for json_file in local_prs_dir.glob("*.json"):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        meta = PRMetadata.from_dict(data)
                        metadata_by_pr[meta.pr_number] = meta
                except (json.JSONDecodeError, IOError, KeyError):
                    continue
        except OSError:
            pass

    return list(metadata_by_pr.values())


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
