"""
Tag management routes for organizing issues.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
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


# --- Tag CRUD ---

@router.get("/repos/{repo_id}/tags", response_model=TagListResponse)
async def list_tags(
    repo_id: int,
    db: AsyncSession = Depends(get_db),
):
    """List all tags for a repository."""
    await get_repo_or_404(db, repo_id)

    result = await db.execute(
        select(Tag).where(Tag.repo_id == repo_id).order_by(Tag.name)
    )
    tags = result.scalars().all()

    return TagListResponse(
        tags=[
            TagResponse(
                id=t.id,
                repo_id=t.repo_id,
                name=t.name,
                color=t.color,
                created_at=t.created_at.isoformat(),
            )
            for t in tags
        ]
    )


@router.post("/repos/{repo_id}/tags", response_model=TagResponse)
async def create_tag(
    repo_id: int,
    data: TagCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new tag for a repository."""
    await get_repo_or_404(db, repo_id)

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

    return TagResponse(
        id=tag.id,
        repo_id=tag.repo_id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at.isoformat(),
    )


@router.patch("/repos/{repo_id}/tags/{tag_id}", response_model=TagResponse)
async def update_tag(
    repo_id: int,
    tag_id: int,
    data: TagUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a tag's name or color."""
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

    return TagResponse(
        id=tag.id,
        repo_id=tag.repo_id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at.isoformat(),
    )


@router.delete("/repos/{repo_id}/tags/{tag_id}")
async def delete_tag(
    repo_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a tag (also removes it from all issues)."""
    result = await db.execute(
        select(Tag).where(and_(Tag.id == tag_id, Tag.repo_id == repo_id))
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    await db.delete(tag)
    await db.commit()
    return {"status": "deleted"}


# --- Issue Tag Assignment ---

@router.get("/repos/{repo_id}/issues/{issue_number}/tags", response_model=IssueTagsResponse)
async def get_issue_tags(
    repo_id: int,
    issue_number: int,
    db: AsyncSession = Depends(get_db),
):
    """Get all tags assigned to an issue."""
    result = await db.execute(
        select(IssueTag, Tag)
        .join(Tag, IssueTag.tag_id == Tag.id)
        .where(and_(IssueTag.repo_id == repo_id, IssueTag.issue_number == issue_number))
    )
    rows = result.all()

    return IssueTagsResponse(
        issue_number=issue_number,
        tags=[
            TagResponse(
                id=tag.id,
                repo_id=tag.repo_id,
                name=tag.name,
                color=tag.color,
                created_at=tag.created_at.isoformat(),
            )
            for _, tag in rows
        ],
    )


@router.post("/repos/{repo_id}/issues/{issue_number}/tags/{tag_id}", response_model=IssueTagsResponse)
async def add_tag_to_issue(
    repo_id: int,
    issue_number: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Add a tag to an issue."""
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
    return await get_issue_tags(repo_id, issue_number, db)


@router.delete("/repos/{repo_id}/issues/{issue_number}/tags/{tag_id}", response_model=IssueTagsResponse)
async def remove_tag_from_issue(
    repo_id: int,
    issue_number: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Remove a tag from an issue."""
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
    return await get_issue_tags(repo_id, issue_number, db)


# --- Bulk Query ---

@router.get("/repos/{repo_id}/issue-tags")
async def get_all_issue_tags(
    repo_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get all issue-tag assignments for a repository (for efficient bulk loading)."""
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
        issue_tags[issue_tag.issue_number].append(
            TagResponse(
                id=tag.id,
                repo_id=tag.repo_id,
                name=tag.name,
                color=tag.color,
                created_at=tag.created_at.isoformat(),
            )
        )

    return {"issue_tags": issue_tags}
