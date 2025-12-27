"""
Tag management routes for organizing issues.

Tags are stored in per-repo databases at ~/.clump/projects/{hash}/data.db.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_

from app.database import get_repo_db
from app.db_helpers import get_repo_or_404
from app.models import Tag, IssueTag

router = APIRouter()


class TagResponse(BaseModel):
    id: int
    repo_id: int
    name: str
    color: str | None
    created_at: str

    class Config:
        from_attributes = True


def _tag_to_response(tag: Tag) -> TagResponse:
    """Convert a Tag model to TagResponse."""
    return TagResponse(
        id=tag.id,
        repo_id=tag.repo_id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at.isoformat(),
    )


class TagCreate(BaseModel):
    name: str
    color: str | None = None


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class TagListResponse(BaseModel):
    tags: list[TagResponse]


class IssueTagsResponse(BaseModel):
    issue_number: int
    tags: list[TagResponse]


class DeleteResponse(BaseModel):
    status: str


class AllIssueTagsResponse(BaseModel):
    issue_tags: dict[int, list[TagResponse]]


# --- Tag CRUD ---

@router.get("/repos/{repo_id}/tags", response_model=TagListResponse)
async def list_tags(repo_id: int):
    """List all tags for a repository."""
    repo = get_repo_or_404(repo_id)

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(Tag).where(Tag.repo_id == repo_id).order_by(Tag.name)
        )
        tags = result.scalars().all()

        return TagListResponse(tags=[_tag_to_response(t) for t in tags])


@router.post("/repos/{repo_id}/tags", response_model=TagResponse)
async def create_tag(repo_id: int, data: TagCreate):
    """Create a new tag for a repository."""
    repo = get_repo_or_404(repo_id)

    async with get_repo_db(repo["local_path"]) as db:
        # Check for duplicate name
        existing = await db.execute(
            select(Tag).where(and_(Tag.repo_id == repo_id, Tag.name == data.name))
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Tag with this name already exists")

        tag = Tag(repo_id=repo_id, name=data.name, color=data.color)
        db.add(tag)
        await db.commit()
        await db.refresh(tag)

        return _tag_to_response(tag)


@router.patch("/repos/{repo_id}/tags/{tag_id}", response_model=TagResponse)
async def update_tag(repo_id: int, tag_id: int, data: TagUpdate):
    """Update a tag's name or color."""
    repo = get_repo_or_404(repo_id)

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(Tag).where(and_(Tag.id == tag_id, Tag.repo_id == repo_id))
        )
        tag = result.scalar_one_or_none()
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")

        if data.name is not None:
            # Check for duplicate name
            existing = await db.execute(
                select(Tag).where(
                    and_(Tag.repo_id == repo_id, Tag.name == data.name, Tag.id != tag_id)
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Tag with this name already exists")
            tag.name = data.name

        if data.color is not None:
            tag.color = data.color

        await db.commit()
        await db.refresh(tag)

        return _tag_to_response(tag)


@router.delete("/repos/{repo_id}/tags/{tag_id}", response_model=DeleteResponse)
async def delete_tag(repo_id: int, tag_id: int) -> DeleteResponse:
    """Delete a tag (also removes it from all issues)."""
    repo = get_repo_or_404(repo_id)

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(Tag).where(and_(Tag.id == tag_id, Tag.repo_id == repo_id))
        )
        tag = result.scalar_one_or_none()
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")

        await db.delete(tag)
        await db.commit()
        return DeleteResponse(status="deleted")


# --- Issue Tag Assignment ---

@router.get("/repos/{repo_id}/issues/{issue_number}/tags", response_model=IssueTagsResponse)
async def get_issue_tags(repo_id: int, issue_number: int):
    """Get all tags assigned to an issue."""
    repo = get_repo_or_404(repo_id)

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(IssueTag, Tag)
            .join(Tag, IssueTag.tag_id == Tag.id)
            .where(and_(IssueTag.repo_id == repo_id, IssueTag.issue_number == issue_number))
        )
        rows = result.all()

        return IssueTagsResponse(
            issue_number=issue_number,
            tags=[_tag_to_response(tag) for _, tag in rows],
        )


@router.post("/repos/{repo_id}/issues/{issue_number}/tags/{tag_id}", response_model=IssueTagsResponse)
async def add_tag_to_issue(repo_id: int, issue_number: int, tag_id: int):
    """Add a tag to an issue."""
    repo = get_repo_or_404(repo_id)

    async with get_repo_db(repo["local_path"]) as db:
        # Verify tag exists and belongs to repo
        tag_result = await db.execute(
            select(Tag).where(and_(Tag.id == tag_id, Tag.repo_id == repo_id))
        )
        if not tag_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Tag not found")

        # Check if already assigned
        existing = await db.execute(
            select(IssueTag).where(
                and_(
                    IssueTag.tag_id == tag_id,
                    IssueTag.repo_id == repo_id,
                    IssueTag.issue_number == issue_number,
                )
            )
        )
        if not existing.scalar_one_or_none():
            issue_tag = IssueTag(tag_id=tag_id, repo_id=repo_id, issue_number=issue_number)
            db.add(issue_tag)
            await db.commit()

        # Return updated tags for this issue
        result = await db.execute(
            select(IssueTag, Tag)
            .join(Tag, IssueTag.tag_id == Tag.id)
            .where(and_(IssueTag.repo_id == repo_id, IssueTag.issue_number == issue_number))
        )
        rows = result.all()

        return IssueTagsResponse(
            issue_number=issue_number,
            tags=[_tag_to_response(tag) for _, tag in rows],
        )


@router.delete("/repos/{repo_id}/issues/{issue_number}/tags/{tag_id}", response_model=IssueTagsResponse)
async def remove_tag_from_issue(repo_id: int, issue_number: int, tag_id: int):
    """Remove a tag from an issue."""
    repo = get_repo_or_404(repo_id)

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(IssueTag).where(
                and_(
                    IssueTag.tag_id == tag_id,
                    IssueTag.repo_id == repo_id,
                    IssueTag.issue_number == issue_number,
                )
            )
        )
        issue_tag = result.scalar_one_or_none()
        if issue_tag:
            await db.delete(issue_tag)
            await db.commit()

        # Return updated tags for this issue
        result = await db.execute(
            select(IssueTag, Tag)
            .join(Tag, IssueTag.tag_id == Tag.id)
            .where(and_(IssueTag.repo_id == repo_id, IssueTag.issue_number == issue_number))
        )
        rows = result.all()

        return IssueTagsResponse(
            issue_number=issue_number,
            tags=[_tag_to_response(tag) for _, tag in rows],
        )


# --- Bulk Query ---

@router.get("/repos/{repo_id}/issue-tags", response_model=AllIssueTagsResponse)
async def get_all_issue_tags(repo_id: int) -> AllIssueTagsResponse:
    """Get all issue-tag assignments for a repository (for efficient bulk loading)."""
    repo = get_repo_or_404(repo_id)

    async with get_repo_db(repo["local_path"]) as db:
        result = await db.execute(
            select(IssueTag, Tag)
            .join(Tag, IssueTag.tag_id == Tag.id)
            .where(IssueTag.repo_id == repo_id)
        )
        rows = result.all()

        # Group by issue number
        issue_tags: dict[int, list[TagResponse]] = {}
        for issue_tag, tag in rows:
            if issue_tag.issue_number not in issue_tags:
                issue_tags[issue_tag.issue_number] = []
            issue_tags[issue_tag.issue_number].append(_tag_to_response(tag))

        return AllIssueTagsResponse(issue_tags=issue_tags)
