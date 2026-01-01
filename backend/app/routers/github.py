"""
GitHub API routes for repos, issues, and PRs.

Repo information is stored in ~/.clump/repos.json.
Per-repo data is stored in ~/.clump/projects/{hash}/data.db.
"""

import asyncio
import re
import time
from pathlib import Path

from contextlib import contextmanager
from typing import Generator, Any

from fastapi import APIRouter, HTTPException, Query
from github import (
    BadCredentialsException,
    GithubException,
    RateLimitExceededException,
    UnknownObjectException,
)
from pydantic import BaseModel

from app.db_helpers import get_repo_or_404
from app.storage import (
    load_repos,
    add_repo as storage_add_repo,
    delete_repo as storage_delete_repo,
    delete_repo_data,
    encode_path,
    get_issue_metadata,
    save_issue_metadata,
    delete_issue_metadata,
    list_issue_metadata,
    IssueMetadata,
    get_pr_metadata,
    list_pr_metadata,
    PRMetadata,
    RepoInfo,
)
from app.schemas import IssueMetadataResponse, IssueMetadataUpdate, PRMetadataResponse
from app.database import clear_engine_cache
from app.services.github_client import github_client, IssueData, PRData

router = APIRouter()

# ==========================================
# GitHub API Response Cache
# ==========================================
# Simple TTL cache to avoid hammering GitHub API on rapid repo switching
# Cache entries: {cache_key: (response_data, timestamp)}
_github_cache: dict[str, tuple[Any, float]] = {}
GITHUB_CACHE_TTL = 30  # seconds


def _get_cached_response(cache_key: str) -> Any | None:
    """Get cached response if still valid."""
    if cache_key in _github_cache:
        data, timestamp = _github_cache[cache_key]
        if time.time() - timestamp < GITHUB_CACHE_TTL:
            return data
        # Expired - remove from cache
        del _github_cache[cache_key]
    return None


def _cache_response(cache_key: str, data: Any) -> None:
    """Cache a response with current timestamp."""
    _github_cache[cache_key] = (data, time.time())
    # Simple cleanup: remove oldest entries if cache gets too large
    if len(_github_cache) > 100:
        oldest_key = min(_github_cache, key=lambda k: _github_cache[k][1])
        del _github_cache[oldest_key]


@contextmanager
def github_api_error_handler() -> Generator[None, None, None]:
    """Context manager that converts GitHub API exceptions to appropriate HTTPExceptions.

    Maps GitHub API exceptions to HTTP status codes:
    - UnknownObjectException (404) -> HTTPException(404)
    - BadCredentialsException (401/403) -> HTTPException(401)
    - RateLimitExceededException (403) -> HTTPException(429)
    - GithubException (other) -> HTTPException(502) for server errors, 400 otherwise

    Usage:
        with github_api_error_handler():
            result = github_client.some_method(...)
    """
    try:
        yield
    except UnknownObjectException as e:
        raise HTTPException(status_code=404, detail=f"Not found: {e.data}")
    except BadCredentialsException:
        raise HTTPException(status_code=401, detail="GitHub authentication failed")
    except RateLimitExceededException:
        raise HTTPException(status_code=429, detail="GitHub API rate limit exceeded")
    except GithubException as e:
        # Map GitHub API server errors (5xx) to 502 Bad Gateway
        if e.status >= 500:
            raise HTTPException(status_code=502, detail=f"GitHub API error: {e.data}")
        raise HTTPException(status_code=400, detail=f"GitHub API error: {e.data}")


async def parse_github_remote(local_path: str) -> tuple[str, str]:
    """
    Parse the GitHub owner and repo name from a local git repository's origin remote.

    Supports:
    - SSH URLs: git@github.com:owner/repo.git
    - HTTPS URLs: https://github.com/owner/repo.git
    - HTTPS URLs without .git: https://github.com/owner/repo

    Returns:
        Tuple of (owner, repo_name)

    Raises:
        ValueError: If the path is not a git repo or has no GitHub origin
    """
    path = Path(local_path).expanduser().resolve()

    if not path.exists():
        raise ValueError(f"Path does not exist: {local_path}")

    if not (path / ".git").exists():
        raise ValueError(f"Not a git repository: {local_path}")

    try:
        # Use async subprocess to avoid blocking the event loop
        proc = await asyncio.create_subprocess_exec(
            "git", "remote", "get-url", "origin",
            cwd=path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)

        if proc.returncode != 0:
            raise ValueError(f"No 'origin' remote found in {local_path}")

        remote_url = stdout.decode().strip()
    except asyncio.TimeoutError:
        raise ValueError("Timed out reading git remote")
    except FileNotFoundError:
        raise ValueError("git command not found")

    # Parse SSH URL: git@github.com:owner/repo.git
    ssh_match = re.match(r"git@github\.com:([^/]+)/(.+?)(?:\.git)?$", remote_url)
    if ssh_match:
        return ssh_match.group(1), ssh_match.group(2)

    # Parse HTTPS URL: https://github.com/owner/repo.git or https://github.com/owner/repo
    https_match = re.match(r"https://github\.com/([^/]+)/(.+?)(?:\.git)?$", remote_url)
    if https_match:
        return https_match.group(1), https_match.group(2)

    raise ValueError(f"Could not parse GitHub remote URL: {remote_url}")


# Pydantic models for API
class RepoCreate(BaseModel):
    local_path: str
    # owner and name are optional - will be inferred from git remote if not provided
    owner: str | None = None
    name: str | None = None


class RepoResponse(BaseModel):
    id: int
    owner: str
    name: str
    local_path: str

    @classmethod
    def from_repo_info(cls, repo: RepoInfo) -> "RepoResponse":
        return cls(
            id=repo["id"],
            owner=repo["owner"],
            name=repo["name"],
            local_path=repo["local_path"],
        )


class IssueResponse(BaseModel):
    number: int
    title: str
    body: str
    state: str
    labels: list[str]
    author: str
    created_at: str
    updated_at: str
    comments_count: int
    url: str


class IssueListResponse(BaseModel):
    issues: list[IssueResponse]
    total: int
    page: int
    per_page: int


class IssueDetailResponse(IssueResponse):
    comments: list[dict]


class PRResponse(BaseModel):
    number: int
    title: str
    body: str
    state: str
    labels: list[str]
    author: str
    created_at: str
    updated_at: str
    head_ref: str
    base_ref: str
    additions: int
    deletions: int
    changed_files: int
    comments_count: int
    url: str


class PRDetailResponse(PRResponse):
    comments: list[dict]


class PRListResponse(BaseModel):
    prs: list[PRResponse]
    total: int
    page: int
    per_page: int


# Repo endpoints
@router.get("/repos", response_model=list[RepoResponse])
async def list_repos():
    """List all configured repositories."""
    repos = load_repos()
    return [RepoResponse.from_repo_info(r) for r in repos]


@router.post("/repos", response_model=RepoResponse)
async def create_repo(repo: RepoCreate):
    """Add a repository to track.

    The owner and name can be automatically inferred from the git remote
    if only local_path is provided.
    """
    owner = repo.owner
    name = repo.name

    # Infer owner/name from git remote if not provided
    if not owner or not name:
        try:
            inferred_owner, inferred_name = await parse_github_remote(repo.local_path)
            owner = owner or inferred_owner
            name = name or inferred_name
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Could not infer repository info from git remote: {e}"
            )

    # Verify it exists on GitHub
    with github_api_error_handler():
        github_client.get_repo(owner, name)

    try:
        repo_info = storage_add_repo(owner, name, repo.local_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return RepoResponse.from_repo_info(repo_info)


@router.delete("/repos/{repo_id}")
async def delete_repo(repo_id: int, delete_data: bool = True):
    """
    Remove a repository.

    Args:
        repo_id: The repository ID
        delete_data: If True (default), also deletes the repo's data.db
    """
    repo = get_repo_or_404(repo_id)

    # Delete from registry
    storage_delete_repo(repo_id)

    # Optionally delete the repo's data
    if delete_data:
        delete_repo_data(repo["local_path"])
        clear_engine_cache(repo["local_path"])

    return {"status": "deleted"}


# Issue endpoints
@router.get("/repos/{repo_id}/issues", response_model=IssueListResponse)
async def list_issues(
    repo_id: int,
    state: str = "open",
    search: str | None = None,
    labels: list[str] = Query(default=[]),
    sort: str = "created",
    order: str = "desc",
    page: int = 1,
    per_page: int = 30,
    fetch_all: bool = False,
):
    """List issues for a repository with pagination and filtering.

    Args:
        state: Filter by state - "open", "closed", or "all"
        search: Text search in issue title/body
        labels: Filter by label names (can specify multiple)
        sort: Sort field - "created", "updated", or "comments"
        order: Sort order - "asc" or "desc"
        fetch_all: If true, fetch all issues (for client-side filtering)
    """
    repo = get_repo_or_404(repo_id)

    # Check cache first
    labels_key = ",".join(sorted(labels)) if labels else ""
    cache_key = f"issues:{repo_id}:{state}:{search or ''}:{labels_key}:{sort}:{order}:{page}:{per_page}:{fetch_all}"
    cached = _get_cached_response(cache_key)
    if cached is not None:
        return cached

    if fetch_all:
        # Fetch all issues for client-side filtering
        all_issues = github_client.list_all_issues(
            repo["owner"],
            repo["name"],
            state=state,
            labels=labels if labels else None,
        )
        # Apply search filter if provided
        if search:
            search_lower = search.lower()
            all_issues = [
                i for i in all_issues
                if search_lower in (i.title or "").lower() or search_lower in (i.body or "").lower()
            ]
        total = len(all_issues)
        response = IssueListResponse(
            issues=[_issue_to_response(i) for i in all_issues],
            total=total,
            page=1,
            per_page=total,  # All items in one "page"
        )
    else:
        issues, total = github_client.list_issues(
            repo["owner"],
            repo["name"],
            state=state,
            labels=labels if labels else None,
            search_query=search,
            sort=sort,
            order=order,
            page=page,
            per_page=per_page,
        )
        response = IssueListResponse(
            issues=[_issue_to_response(i) for i in issues],
            total=total,
            page=page,
            per_page=per_page,
        )
    _cache_response(cache_key, response)
    return response


@router.get("/repos/{repo_id}/issues/{issue_number}", response_model=IssueDetailResponse)
async def get_issue(
    repo_id: int,
    issue_number: int,
):
    """Get a single issue with comments."""
    repo = get_repo_or_404(repo_id)
    with github_api_error_handler():
        issue = github_client.get_issue(repo["owner"], repo["name"], issue_number)
    response = _issue_to_response(issue)
    response_dict = response.model_dump()
    response_dict["comments"] = [
        {
            "id": c.id,
            "author": c.author,
            "body": c.body,
            "created_at": c.created_at.isoformat(),
        }
        for c in (issue.comments or [])
    ]
    return response_dict


# Comment endpoints
class CommentCreate(BaseModel):
    body: str


@router.post("/repos/{repo_id}/issues/{issue_number}/comments")
async def create_comment(
    repo_id: int,
    issue_number: int,
    comment: CommentCreate,
):
    """Add a comment to an issue."""
    repo = get_repo_or_404(repo_id)
    with github_api_error_handler():
        comment_id = github_client.add_comment(repo["owner"], repo["name"], issue_number, comment.body)
        return {"id": comment_id, "status": "created"}


# Issue action endpoints
@router.post("/repos/{repo_id}/issues/{issue_number}/close")
async def close_issue(
    repo_id: int,
    issue_number: int,
):
    """Close an issue."""
    repo = get_repo_or_404(repo_id)
    with github_api_error_handler():
        github_client.close_issue(repo["owner"], repo["name"], issue_number)
        return {"status": "closed"}


@router.post("/repos/{repo_id}/issues/{issue_number}/reopen")
async def reopen_issue(
    repo_id: int,
    issue_number: int,
):
    """Reopen a closed issue."""
    repo = get_repo_or_404(repo_id)
    with github_api_error_handler():
        github_client.reopen_issue(repo["owner"], repo["name"], issue_number)
        return {"status": "opened"}


# Issue metadata endpoints (sidecar files written by Claude)
@router.get("/repos/{repo_id}/issue-metadata")
async def list_all_issue_metadata(repo_id: int) -> dict[int, IssueMetadataResponse]:
    """
    Get all issue metadata for a repository.

    Returns a dict mapping issue numbers to their metadata.
    This is used for bulk loading metadata to display in issue lists.
    """
    repo = get_repo_or_404(repo_id)
    encoded_path = encode_path(repo["local_path"])
    metadata_list = list_issue_metadata(encoded_path)

    return {
        m.issue_number: IssueMetadataResponse(
            issue_number=m.issue_number,
            status=m.status,
            tags=m.tags,
            priority=m.priority,
            difficulty=m.difficulty,
            risk=m.risk,
            type=m.type,
            affected_areas=m.affected_areas,
            ai_summary=m.ai_summary,
            notes=m.notes,
            root_cause=m.root_cause,
            suggested_fix=m.suggested_fix,
            analyzed_at=m.analyzed_at,
            analyzed_by=m.analyzed_by,
        )
        for m in metadata_list
    }


@router.get("/repos/{repo_id}/issues/{issue_number}/metadata", response_model=IssueMetadataResponse | None)
async def get_single_issue_metadata(
    repo_id: int,
    issue_number: int,
):
    """Get metadata for a single issue."""
    repo = get_repo_or_404(repo_id)
    encoded_path = encode_path(repo["local_path"])
    metadata = get_issue_metadata(encoded_path, issue_number)

    if metadata is None:
        return None

    return IssueMetadataResponse(
        issue_number=metadata.issue_number,
        status=metadata.status,
        tags=metadata.tags,
        priority=metadata.priority,
        difficulty=metadata.difficulty,
        risk=metadata.risk,
        type=metadata.type,
        affected_areas=metadata.affected_areas,
        ai_summary=metadata.ai_summary,
        notes=metadata.notes,
        root_cause=metadata.root_cause,
        suggested_fix=metadata.suggested_fix,
        analyzed_at=metadata.analyzed_at,
        analyzed_by=metadata.analyzed_by,
    )


@router.put("/repos/{repo_id}/issues/{issue_number}/metadata", response_model=IssueMetadataResponse)
async def update_issue_metadata(
    repo_id: int,
    issue_number: int,
    update: IssueMetadataUpdate,
):
    """
    Update metadata for an issue.

    This is for manual edits through the UI. Claude writes metadata directly
    to the sidecar files, but users can also edit via this endpoint.
    """
    repo = get_repo_or_404(repo_id)
    encoded_path = encode_path(repo["local_path"])

    # Load existing metadata or create new
    existing = get_issue_metadata(encoded_path, issue_number)
    if existing is None:
        existing = IssueMetadata(issue_number=issue_number)

    # Apply updates (only non-None fields)
    if update.status is not None:
        existing.status = update.status
    if update.tags is not None:
        existing.tags = update.tags
    if update.priority is not None:
        existing.priority = update.priority
    if update.difficulty is not None:
        existing.difficulty = update.difficulty
    if update.risk is not None:
        existing.risk = update.risk
    if update.type is not None:
        existing.type = update.type
    if update.affected_areas is not None:
        existing.affected_areas = update.affected_areas
    if update.ai_summary is not None:
        existing.ai_summary = update.ai_summary
    if update.notes is not None:
        existing.notes = update.notes
    if update.root_cause is not None:
        existing.root_cause = update.root_cause
    if update.suggested_fix is not None:
        existing.suggested_fix = update.suggested_fix

    # Save updated metadata
    save_issue_metadata(encoded_path, issue_number, existing)

    return IssueMetadataResponse(
        issue_number=existing.issue_number,
        status=existing.status,
        tags=existing.tags,
        priority=existing.priority,
        difficulty=existing.difficulty,
        risk=existing.risk,
        type=existing.type,
        affected_areas=existing.affected_areas,
        ai_summary=existing.ai_summary,
        notes=existing.notes,
        root_cause=existing.root_cause,
        suggested_fix=existing.suggested_fix,
        analyzed_at=existing.analyzed_at,
        analyzed_by=existing.analyzed_by,
    )


@router.delete("/repos/{repo_id}/issues/{issue_number}/metadata")
async def remove_issue_metadata(
    repo_id: int,
    issue_number: int,
):
    """Delete metadata for an issue."""
    repo = get_repo_or_404(repo_id)
    encoded_path = encode_path(repo["local_path"])
    deleted = delete_issue_metadata(encoded_path, issue_number)
    return {"deleted": deleted}


# PR metadata endpoints (sidecar files written by Claude)
@router.get("/repos/{repo_id}/pr-metadata")
async def list_all_pr_metadata(repo_id: int) -> dict[int, PRMetadataResponse]:
    """
    Get all PR metadata for a repository.

    Returns a dict mapping PR numbers to their metadata.
    This is used for bulk loading metadata to display in PR lists.
    """
    repo = get_repo_or_404(repo_id)
    encoded_path = encode_path(repo["local_path"])
    metadata_list = list_pr_metadata(encoded_path)

    return {
        m.pr_number: PRMetadataResponse(
            pr_number=m.pr_number,
            status=m.status,
            tags=m.tags,
            risk=m.risk,
            complexity=m.complexity,
            review_priority=m.review_priority,
            security_concerns=m.security_concerns,
            test_coverage=m.test_coverage,
            breaking_changes=m.breaking_changes,
            change_type=m.change_type,
            affected_areas=m.affected_areas,
            ai_summary=m.ai_summary,
            review_notes=m.review_notes,
            suggested_improvements=m.suggested_improvements,
            analyzed_at=m.analyzed_at,
            analyzed_by=m.analyzed_by,
        )
        for m in metadata_list
    }


@router.get("/repos/{repo_id}/prs/{pr_number}/metadata", response_model=PRMetadataResponse | None)
async def get_single_pr_metadata(
    repo_id: int,
    pr_number: int,
):
    """Get metadata for a single PR."""
    repo = get_repo_or_404(repo_id)
    encoded_path = encode_path(repo["local_path"])
    metadata = get_pr_metadata(encoded_path, pr_number)

    if metadata is None:
        return None

    return PRMetadataResponse(
        pr_number=metadata.pr_number,
        status=metadata.status,
        tags=metadata.tags,
        risk=metadata.risk,
        complexity=metadata.complexity,
        review_priority=metadata.review_priority,
        security_concerns=metadata.security_concerns,
        test_coverage=metadata.test_coverage,
        breaking_changes=metadata.breaking_changes,
        change_type=metadata.change_type,
        affected_areas=metadata.affected_areas,
        ai_summary=metadata.ai_summary,
        review_notes=metadata.review_notes,
        suggested_improvements=metadata.suggested_improvements,
        analyzed_at=metadata.analyzed_at,
        analyzed_by=metadata.analyzed_by,
    )


class IssueCreate(BaseModel):
    title: str
    body: str
    labels: list[str] = []
    assignees: list[str] = []


@router.post("/repos/{repo_id}/issues", response_model=IssueResponse)
async def create_issue(
    repo_id: int,
    issue: IssueCreate,
):
    """Create a new issue."""
    repo = get_repo_or_404(repo_id)
    with github_api_error_handler():
        created = github_client.create_issue(
            repo["owner"],
            repo["name"],
            issue.title,
            issue.body,
            issue.labels,
            issue.assignees,
        )
        return _issue_to_response(created)


@router.get("/repos/{repo_id}/labels")
async def get_labels(
    repo_id: int,
):
    """Get available labels for a repository."""
    repo = get_repo_or_404(repo_id)
    with github_api_error_handler():
        labels = github_client.get_available_labels(repo["owner"], repo["name"])
        return {"labels": labels}


@router.get("/repos/{repo_id}/assignees")
async def get_assignees(
    repo_id: int,
):
    """Get users who can be assigned to issues."""
    repo = get_repo_or_404(repo_id)
    with github_api_error_handler():
        assignees = github_client.get_assignable_users(repo["owner"], repo["name"])
        return {"assignees": assignees}


# PR endpoints
@router.get("/repos/{repo_id}/prs", response_model=PRListResponse)
async def list_prs(
    repo_id: int,
    state: str = "open",
    search: str | None = None,
    sort: str = "created",
    order: str = "desc",
    page: int = 1,
    per_page: int = 30,
):
    """List pull requests for a repository with pagination and filtering.

    Args:
        state: Filter by state - "open", "closed", or "all"
        search: Text search in PR title/body
        sort: Sort field - "created" or "updated"
        order: Sort order - "asc" or "desc"
    """
    repo = get_repo_or_404(repo_id)

    # Check cache first
    cache_key = f"prs:{repo_id}:{state}:{search or ''}:{sort}:{order}:{page}:{per_page}"
    cached = _get_cached_response(cache_key)
    if cached is not None:
        return cached

    prs, total = github_client.list_prs(
        repo["owner"],
        repo["name"],
        state=state,
        search_query=search,
        sort=sort,
        order=order,
        page=page,
        per_page=per_page,
    )
    response = PRListResponse(
        prs=[_pr_to_response(p) for p in prs],
        total=total,
        page=page,
        per_page=per_page,
    )
    _cache_response(cache_key, response)
    return response


@router.get("/repos/{repo_id}/prs/{pr_number}", response_model=PRDetailResponse)
async def get_pr(
    repo_id: int,
    pr_number: int,
):
    """Get a single pull request with comments."""
    repo = get_repo_or_404(repo_id)
    pr = github_client.get_pr(repo["owner"], repo["name"], pr_number)
    response = _pr_to_response(pr)
    response_dict = response.model_dump()
    response_dict["comments"] = [
        {
            "id": c.id,
            "author": c.author,
            "body": c.body,
            "created_at": c.created_at.isoformat(),
        }
        for c in (pr.comments or [])
    ]
    return response_dict


def _issue_to_response(issue: IssueData) -> IssueResponse:
    return IssueResponse(
        number=issue.number,
        title=issue.title,
        body=issue.body,
        state=issue.state,
        labels=issue.labels,
        author=issue.author,
        created_at=issue.created_at.isoformat(),
        updated_at=issue.updated_at.isoformat(),
        comments_count=issue.comments_count,
        url=issue.url,
    )


def _pr_to_response(pr: PRData) -> PRResponse:
    return PRResponse(
        number=pr.number,
        title=pr.title,
        body=pr.body,
        state=pr.state,
        labels=pr.labels,
        author=pr.author,
        created_at=pr.created_at.isoformat(),
        updated_at=pr.updated_at.isoformat(),
        head_ref=pr.head_ref,
        base_ref=pr.base_ref,
        additions=pr.additions,
        deletions=pr.deletions,
        changed_files=pr.changed_files,
        comments_count=pr.comments_count,
        url=pr.url,
    )
