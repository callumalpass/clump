"""
Router for managing local work items.

Work items are stored in <REPO>/.clump/work_items/{id}.json.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.db_helpers import get_repo_or_404
from app.storage import (
    WorkItem,
    get_work_item,
    save_work_item,
    delete_work_item,
    list_work_items,
    generate_work_item_id,
)
from app.schemas import (
    WorkItemResponse,
    WorkItemCreate,
    WorkItemUpdate,
)

router = APIRouter()


def work_item_to_response(item: WorkItem) -> WorkItemResponse:
    """Convert WorkItem to API response model."""
    return WorkItemResponse(
        id=item.id,
        title=item.title,
        description=item.description,
        status=item.status,
        priority=item.priority,
        tags=item.tags,
        created_at=item.created_at,
        updated_at=item.updated_at,
        ai_summary=item.ai_summary,
        complexity=item.complexity,
        risk=item.risk,
        suggested_approach=item.suggested_approach,
        notes=item.notes,
        analyzed_at=item.analyzed_at,
        analyzed_by=item.analyzed_by,
    )


@router.get("/repos/{repo_id}/work-items", response_model=list[WorkItemResponse])
async def list_repo_work_items(
    repo_id: int,
    status: Optional[str] = None,
    priority: Optional[str] = None,
) -> list[WorkItemResponse]:
    """List all work items for a repository."""
    repo = get_repo_or_404(repo_id)
    items = list_work_items(repo["local_path"])

    # Filter by status if provided
    if status:
        items = [i for i in items if i.status == status]

    # Filter by priority if provided
    if priority:
        items = [i for i in items if i.priority == priority]

    return [work_item_to_response(i) for i in items]


@router.post("/repos/{repo_id}/work-items", response_model=WorkItemResponse)
async def create_work_item(
    repo_id: int,
    data: WorkItemCreate,
) -> WorkItemResponse:
    """Create a new work item."""
    repo = get_repo_or_404(repo_id)

    # Generate unique ID
    item_id = generate_work_item_id(repo["local_path"])
    
    # Current timestamp
    now = datetime.now(timezone.utc).isoformat()

    item = WorkItem(
        id=item_id,
        title=data.title,
        description=data.description,
        status=data.status or "open",
        priority=data.priority or "medium",
        tags=data.tags or [],
        created_at=now,
        updated_at=now,
    )

    save_work_item(repo["local_path"], item, create_new=True)

    return work_item_to_response(item)


@router.get("/repos/{repo_id}/work-items/{item_id}", response_model=WorkItemResponse)
async def get_repo_work_item(
    repo_id: int,
    item_id: str,
) -> WorkItemResponse:
    """Get details of a work item."""
    repo = get_repo_or_404(repo_id)
    
    item = get_work_item(repo["local_path"], item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    return work_item_to_response(item)


@router.put("/repos/{repo_id}/work-items/{item_id}", response_model=WorkItemResponse)
async def update_work_item(
    repo_id: int,
    item_id: str,
    data: WorkItemUpdate,
) -> WorkItemResponse:
    """Update a work item."""
    repo = get_repo_or_404(repo_id)
    
    item = get_work_item(repo["local_path"], item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Update basic fields if provided
    if data.title is not None:
        item.title = data.title
    if data.description is not None:
        item.description = data.description
    if data.status is not None:
        item.status = data.status
    if data.priority is not None:
        item.priority = data.priority
    if data.tags is not None:
        item.tags = data.tags

    # Update AI analysis fields if provided
    if data.ai_summary is not None:
        item.ai_summary = data.ai_summary
    if data.complexity is not None:
        item.complexity = data.complexity
    if data.risk is not None:
        item.risk = data.risk
    if data.suggested_approach is not None:
        item.suggested_approach = data.suggested_approach
    if data.notes is not None:
        item.notes = data.notes
    if data.analyzed_at is not None:
        item.analyzed_at = data.analyzed_at
    if data.analyzed_by is not None:
        item.analyzed_by = data.analyzed_by

    # Update timestamp
    item.updated_at = datetime.now(timezone.utc).isoformat()

    save_work_item(repo["local_path"], item)

    return work_item_to_response(item)


@router.delete("/repos/{repo_id}/work-items/{item_id}")
async def delete_repo_work_item(
    repo_id: int,
    item_id: str,
) -> dict:
    """Delete a work item."""
    repo = get_repo_or_404(repo_id)
    
    deleted = delete_work_item(repo["local_path"], item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Work item not found")

    return {"status": "deleted", "id": item_id}