"""
GitHub API routes for repos, issues, and PRs.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Repo
from app.services.github_client import github_client, IssueData, PRData

router = APIRouter()


# Pydantic models for API
class RepoCreate(BaseModel):
    owner: str
    name: str
    local_path: str


class RepoResponse(BaseModel):
    id: int
    owner: str
    name: str
    local_path: str

    class Config:
        from_attributes = True


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
    url: str


# Repo endpoints
@router.get("/repos", response_model=list[RepoResponse])
async def list_repos(db: AsyncSession = Depends(get_db)):
    """List all configured repositories."""
    result = await db.execute(select(Repo))
    return result.scalars().all()


@router.post("/repos", response_model=RepoResponse)
async def create_repo(repo: RepoCreate, db: AsyncSession = Depends(get_db)):
    """Add a repository to track."""
    # Verify it exists on GitHub
    try:
        github_client.get_repo(repo.owner, repo.name)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Repository not found: {e}")

    db_repo = Repo(owner=repo.owner, name=repo.name, local_path=repo.local_path)
    db.add(db_repo)
    await db.commit()
    await db.refresh(db_repo)
    return db_repo


@router.delete("/repos/{repo_id}")
async def delete_repo(repo_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a repository."""
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    await db.delete(repo)
    await db.commit()
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
    db: AsyncSession = Depends(get_db),
):
    """List issues for a repository with pagination and filtering.

    Args:
        state: Filter by state - "open", "closed", or "all"
        search: Text search in issue title/body
        labels: Filter by label names (can specify multiple)
        sort: Sort field - "created", "updated", or "comments"
        order: Sort order - "asc" or "desc"
    """
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    issues, total = github_client.list_issues(
        repo.owner,
        repo.name,
        state=state,
        labels=labels if labels else None,
        search_query=search,
        sort=sort,
        order=order,
        page=page,
        per_page=per_page,
    )
    return IssueListResponse(
        issues=[_issue_to_response(i) for i in issues],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/repos/{repo_id}/issues/{issue_number}", response_model=IssueDetailResponse)
async def get_issue(
    repo_id: int,
    issue_number: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a single issue with comments."""
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    issue = github_client.get_issue(repo.owner, repo.name, issue_number)
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
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to an issue."""
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    try:
        comment_id = github_client.add_comment(repo.owner, repo.name, issue_number, comment.body)
        return {"id": comment_id, "status": "created"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# PR endpoints
@router.get("/repos/{repo_id}/prs", response_model=list[PRResponse])
async def list_prs(
    repo_id: int,
    state: str = "open",
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """List pull requests for a repository."""
    result = await db.execute(select(Repo).where(Repo.id == repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    prs = github_client.list_prs(repo.owner, repo.name, state=state, limit=limit)
    return [_pr_to_response(p) for p in prs]


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
        url=pr.url,
    )
