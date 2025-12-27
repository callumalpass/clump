"""
Tests for the tags router API endpoints.

Tests cover:
- GET /repos/{repo_id}/tags (list all tags for a repo)
- POST /repos/{repo_id}/tags (create a new tag)
- PATCH /repos/{repo_id}/tags/{tag_id} (update a tag)
- DELETE /repos/{repo_id}/tags/{tag_id} (delete a tag)
- GET /repos/{repo_id}/issues/{issue_number}/tags (get tags for an issue)
- POST /repos/{repo_id}/issues/{issue_number}/tags/{tag_id} (add tag to issue)
- DELETE /repos/{repo_id}/issues/{issue_number}/tags/{tag_id} (remove tag from issue)
- GET /repos/{repo_id}/issue-tags (bulk query all issue-tag mappings)
"""

import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock, AsyncMock
from contextlib import asynccontextmanager
from fastapi.testclient import TestClient
from fastapi import FastAPI
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.routers.tags import router
from app.database import Base
from app.models import Tag, IssueTag


@pytest.fixture
def app():
    """Create a test FastAPI app with the tags router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_repo():
    """Create a mock repo info dict."""
    return {
        "id": 1,
        "local_path": "/tmp/test-repo",
        "name": "test-repo",
        "full_name": "owner/test-repo",
    }


class InMemoryDB:
    """Helper class to manage an in-memory SQLite database for testing."""

    def __init__(self):
        self.engine = None
        self.session_factory = None

    async def setup(self):
        """Initialize the in-memory database."""
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        self.session_factory = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def teardown(self):
        """Close the database engine."""
        if self.engine:
            await self.engine.dispose()

    @asynccontextmanager
    async def get_session(self):
        """Get a database session."""
        async with self.session_factory() as session:
            yield session


@pytest.fixture
def in_memory_db():
    """Create an in-memory database for testing."""
    return InMemoryDB()


def create_mock_get_repo_db(db: InMemoryDB):
    """Create a mock get_repo_db context manager that uses our in-memory db."""
    @asynccontextmanager
    async def mock_get_repo_db(local_path: str):
        async with db.get_session() as session:
            yield session
    return mock_get_repo_db


class TestListTags:
    """Tests for GET /repos/{repo_id}/tags endpoint."""

    def test_list_tags_repo_not_found(self, client):
        """Test listing tags for a non-existent repo returns 404."""
        with patch("app.routers.tags.get_repo_or_404") as mock_get_repo:
            from fastapi import HTTPException
            mock_get_repo.side_effect = HTTPException(status_code=404, detail="Repository not found")

            response = client.get("/repos/999/tags")

            assert response.status_code == 404
            assert "not found" in response.json()["detail"].lower()

    def test_list_tags_empty(self, client, mock_repo, in_memory_db):
        """Test listing tags when none exist."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.get("/repos/1/tags")

                assert response.status_code == 200
                data = response.json()
                assert data["tags"] == []
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_list_tags_with_results(self, client, mock_repo, in_memory_db):
        """Test listing tags returns correct data."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        # Add some tags
        async def add_tags():
            async with in_memory_db.get_session() as session:
                tag1 = Tag(repo_id=1, name="bug", color="#ff0000")
                tag2 = Tag(repo_id=1, name="feature", color="#00ff00")
                session.add(tag1)
                session.add(tag2)
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tags())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.get("/repos/1/tags")

                assert response.status_code == 200
                data = response.json()
                assert len(data["tags"]) == 2
                # Tags should be ordered by name
                assert data["tags"][0]["name"] == "bug"
                assert data["tags"][0]["color"] == "#ff0000"
                assert data["tags"][1]["name"] == "feature"
                assert data["tags"][1]["color"] == "#00ff00"
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_list_tags_only_for_requested_repo(self, client, mock_repo, in_memory_db):
        """Test that listing tags only returns tags for the requested repo."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        # Add tags for different repos
        async def add_tags():
            async with in_memory_db.get_session() as session:
                tag1 = Tag(repo_id=1, name="my-tag", color="#ff0000")
                tag2 = Tag(repo_id=2, name="other-repo-tag", color="#00ff00")
                session.add(tag1)
                session.add(tag2)
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tags())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.get("/repos/1/tags")

                assert response.status_code == 200
                data = response.json()
                assert len(data["tags"]) == 1
                assert data["tags"][0]["name"] == "my-tag"
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())


class TestCreateTag:
    """Tests for POST /repos/{repo_id}/tags endpoint."""

    def test_create_tag_success(self, client, mock_repo, in_memory_db):
        """Test creating a tag successfully."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.post(
                    "/repos/1/tags",
                    json={"name": "enhancement", "color": "#0000ff"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["name"] == "enhancement"
                assert data["color"] == "#0000ff"
                assert data["repo_id"] == 1
                assert "id" in data
                assert "created_at" in data
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_create_tag_without_color(self, client, mock_repo, in_memory_db):
        """Test creating a tag without specifying a color."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.post(
                    "/repos/1/tags",
                    json={"name": "no-color-tag"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["name"] == "no-color-tag"
                assert data["color"] is None
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_create_tag_duplicate_name(self, client, mock_repo, in_memory_db):
        """Test creating a tag with a duplicate name fails."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        # Add an existing tag
        async def add_tag():
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=1, name="existing-tag", color="#ff0000")
                session.add(tag)
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tag())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.post(
                    "/repos/1/tags",
                    json={"name": "existing-tag", "color": "#00ff00"}
                )

                assert response.status_code == 400
                assert "already exists" in response.json()["detail"].lower()
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_create_tag_same_name_different_repo(self, client, mock_repo, in_memory_db):
        """Test creating a tag with same name in different repo succeeds."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        # Add a tag for a different repo
        async def add_tag():
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=2, name="same-name", color="#ff0000")
                session.add(tag)
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tag())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.post(
                    "/repos/1/tags",
                    json={"name": "same-name", "color": "#00ff00"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["name"] == "same-name"
                assert data["repo_id"] == 1
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_create_tag_missing_name(self, client, mock_repo):
        """Test creating a tag without a name fails validation."""
        with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo):
            response = client.post("/repos/1/tags", json={"color": "#ff0000"})

            assert response.status_code == 422  # Validation error


class TestUpdateTag:
    """Tests for PATCH /repos/{repo_id}/tags/{tag_id} endpoint."""

    def test_update_tag_name(self, client, mock_repo, in_memory_db):
        """Test updating a tag's name."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_id = None
        async def add_tag():
            nonlocal tag_id
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=1, name="old-name", color="#ff0000")
                session.add(tag)
                await session.commit()
                await session.refresh(tag)
                tag_id = tag.id

        asyncio.get_event_loop().run_until_complete(add_tag())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.patch(
                    f"/repos/1/tags/{tag_id}",
                    json={"name": "new-name"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["name"] == "new-name"
                assert data["color"] == "#ff0000"  # Color unchanged
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_update_tag_color(self, client, mock_repo, in_memory_db):
        """Test updating a tag's color."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_id = None
        async def add_tag():
            nonlocal tag_id
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=1, name="my-tag", color="#ff0000")
                session.add(tag)
                await session.commit()
                await session.refresh(tag)
                tag_id = tag.id

        asyncio.get_event_loop().run_until_complete(add_tag())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.patch(
                    f"/repos/1/tags/{tag_id}",
                    json={"color": "#00ff00"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["name"] == "my-tag"  # Name unchanged
                assert data["color"] == "#00ff00"
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_update_tag_not_found(self, client, mock_repo, in_memory_db):
        """Test updating a non-existent tag returns 404."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.patch(
                    "/repos/1/tags/999",
                    json={"name": "new-name"}
                )

                assert response.status_code == 404
                assert "not found" in response.json()["detail"].lower()
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_update_tag_duplicate_name(self, client, mock_repo, in_memory_db):
        """Test updating a tag to a name that already exists fails."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_id = None
        async def add_tags():
            nonlocal tag_id
            async with in_memory_db.get_session() as session:
                tag1 = Tag(repo_id=1, name="existing-name", color="#ff0000")
                tag2 = Tag(repo_id=1, name="will-change", color="#00ff00")
                session.add(tag1)
                session.add(tag2)
                await session.commit()
                await session.refresh(tag2)
                tag_id = tag2.id

        asyncio.get_event_loop().run_until_complete(add_tags())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.patch(
                    f"/repos/1/tags/{tag_id}",
                    json={"name": "existing-name"}
                )

                assert response.status_code == 400
                assert "already exists" in response.json()["detail"].lower()
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())


class TestDeleteTag:
    """Tests for DELETE /repos/{repo_id}/tags/{tag_id} endpoint."""

    def test_delete_tag_success(self, client, mock_repo, in_memory_db):
        """Test deleting a tag successfully."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_id = None
        async def add_tag():
            nonlocal tag_id
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=1, name="to-delete", color="#ff0000")
                session.add(tag)
                await session.commit()
                await session.refresh(tag)
                tag_id = tag.id

        asyncio.get_event_loop().run_until_complete(add_tag())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.delete(f"/repos/1/tags/{tag_id}")

                assert response.status_code == 200
                assert response.json()["status"] == "deleted"

                # Verify it's actually deleted
                response = client.get("/repos/1/tags")
                assert len(response.json()["tags"]) == 0
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_delete_tag_not_found(self, client, mock_repo, in_memory_db):
        """Test deleting a non-existent tag returns 404."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.delete("/repos/1/tags/999")

                assert response.status_code == 404
                assert "not found" in response.json()["detail"].lower()
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_delete_tag_cascades_to_issue_tags(self, client, mock_repo, in_memory_db):
        """Test deleting a tag also removes all issue-tag associations."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_id = None
        async def add_tag_with_issues():
            nonlocal tag_id
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=1, name="to-delete", color="#ff0000")
                session.add(tag)
                await session.commit()
                await session.refresh(tag)
                tag_id = tag.id

                # Add some issue-tag associations
                issue_tag1 = IssueTag(tag_id=tag_id, repo_id=1, issue_number=1)
                issue_tag2 = IssueTag(tag_id=tag_id, repo_id=1, issue_number=2)
                session.add(issue_tag1)
                session.add(issue_tag2)
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tag_with_issues())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.delete(f"/repos/1/tags/{tag_id}")

                assert response.status_code == 200

                # Verify issue-tags are also deleted (cascade)
                async def verify_deleted():
                    async with in_memory_db.get_session() as session:
                        result = await session.execute(select(IssueTag))
                        return result.scalars().all()

                remaining = asyncio.get_event_loop().run_until_complete(verify_deleted())
                assert len(remaining) == 0
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())


class TestGetIssueTags:
    """Tests for GET /repos/{repo_id}/issues/{issue_number}/tags endpoint."""

    def test_get_issue_tags_empty(self, client, mock_repo, in_memory_db):
        """Test getting tags for an issue with no tags."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.get("/repos/1/issues/42/tags")

                assert response.status_code == 200
                data = response.json()
                assert data["issue_number"] == 42
                assert data["tags"] == []
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_get_issue_tags_with_results(self, client, mock_repo, in_memory_db):
        """Test getting tags for an issue returns correct tags."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        async def add_tags_and_links():
            async with in_memory_db.get_session() as session:
                tag1 = Tag(repo_id=1, name="bug", color="#ff0000")
                tag2 = Tag(repo_id=1, name="feature", color="#00ff00")
                session.add(tag1)
                session.add(tag2)
                await session.commit()
                await session.refresh(tag1)
                await session.refresh(tag2)

                # Link tag1 to issue 42
                issue_tag = IssueTag(tag_id=tag1.id, repo_id=1, issue_number=42)
                session.add(issue_tag)
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tags_and_links())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.get("/repos/1/issues/42/tags")

                assert response.status_code == 200
                data = response.json()
                assert data["issue_number"] == 42
                assert len(data["tags"]) == 1
                assert data["tags"][0]["name"] == "bug"
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())


class TestAddTagToIssue:
    """Tests for POST /repos/{repo_id}/issues/{issue_number}/tags/{tag_id} endpoint."""

    def test_add_tag_to_issue_success(self, client, mock_repo, in_memory_db):
        """Test adding a tag to an issue successfully."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_id = None
        async def add_tag():
            nonlocal tag_id
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=1, name="bug", color="#ff0000")
                session.add(tag)
                await session.commit()
                await session.refresh(tag)
                tag_id = tag.id

        asyncio.get_event_loop().run_until_complete(add_tag())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.post(f"/repos/1/issues/42/tags/{tag_id}")

                assert response.status_code == 200
                data = response.json()
                assert data["issue_number"] == 42
                assert len(data["tags"]) == 1
                assert data["tags"][0]["name"] == "bug"
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_add_tag_to_issue_tag_not_found(self, client, mock_repo, in_memory_db):
        """Test adding a non-existent tag returns 404."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.post("/repos/1/issues/42/tags/999")

                assert response.status_code == 404
                assert "not found" in response.json()["detail"].lower()
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_add_tag_to_issue_idempotent(self, client, mock_repo, in_memory_db):
        """Test adding the same tag twice is idempotent."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_id = None
        async def add_tag():
            nonlocal tag_id
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=1, name="bug", color="#ff0000")
                session.add(tag)
                await session.commit()
                await session.refresh(tag)
                tag_id = tag.id

        asyncio.get_event_loop().run_until_complete(add_tag())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                # Add tag first time
                response1 = client.post(f"/repos/1/issues/42/tags/{tag_id}")
                assert response1.status_code == 200
                assert len(response1.json()["tags"]) == 1

                # Add same tag again - should succeed and still have 1 tag
                response2 = client.post(f"/repos/1/issues/42/tags/{tag_id}")
                assert response2.status_code == 200
                assert len(response2.json()["tags"]) == 1
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_add_multiple_tags_to_issue(self, client, mock_repo, in_memory_db):
        """Test adding multiple tags to the same issue."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_ids = []
        async def add_tags():
            async with in_memory_db.get_session() as session:
                tag1 = Tag(repo_id=1, name="bug", color="#ff0000")
                tag2 = Tag(repo_id=1, name="urgent", color="#ffa500")
                session.add(tag1)
                session.add(tag2)
                await session.commit()
                await session.refresh(tag1)
                await session.refresh(tag2)
                tag_ids.extend([tag1.id, tag2.id])

        asyncio.get_event_loop().run_until_complete(add_tags())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                # Add first tag
                client.post(f"/repos/1/issues/42/tags/{tag_ids[0]}")

                # Add second tag
                response = client.post(f"/repos/1/issues/42/tags/{tag_ids[1]}")

                assert response.status_code == 200
                data = response.json()
                assert len(data["tags"]) == 2
                tag_names = [t["name"] for t in data["tags"]]
                assert "bug" in tag_names
                assert "urgent" in tag_names
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())


class TestRemoveTagFromIssue:
    """Tests for DELETE /repos/{repo_id}/issues/{issue_number}/tags/{tag_id} endpoint."""

    def test_remove_tag_from_issue_success(self, client, mock_repo, in_memory_db):
        """Test removing a tag from an issue successfully."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_id = None
        async def add_tag_and_link():
            nonlocal tag_id
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=1, name="bug", color="#ff0000")
                session.add(tag)
                await session.commit()
                await session.refresh(tag)
                tag_id = tag.id

                issue_tag = IssueTag(tag_id=tag_id, repo_id=1, issue_number=42)
                session.add(issue_tag)
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tag_and_link())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.delete(f"/repos/1/issues/42/tags/{tag_id}")

                assert response.status_code == 200
                data = response.json()
                assert data["issue_number"] == 42
                assert data["tags"] == []
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_remove_tag_from_issue_not_assigned(self, client, mock_repo, in_memory_db):
        """Test removing a tag that isn't assigned returns success (idempotent)."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_id = None
        async def add_tag():
            nonlocal tag_id
            async with in_memory_db.get_session() as session:
                tag = Tag(repo_id=1, name="bug", color="#ff0000")
                session.add(tag)
                await session.commit()
                await session.refresh(tag)
                tag_id = tag.id

        asyncio.get_event_loop().run_until_complete(add_tag())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                # Remove a tag that was never assigned - should succeed
                response = client.delete(f"/repos/1/issues/42/tags/{tag_id}")

                assert response.status_code == 200
                data = response.json()
                assert data["tags"] == []
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_remove_one_tag_keeps_others(self, client, mock_repo, in_memory_db):
        """Test removing one tag doesn't affect other tags on the issue."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        tag_ids = []
        async def add_tags_and_links():
            async with in_memory_db.get_session() as session:
                tag1 = Tag(repo_id=1, name="bug", color="#ff0000")
                tag2 = Tag(repo_id=1, name="urgent", color="#ffa500")
                session.add(tag1)
                session.add(tag2)
                await session.commit()
                await session.refresh(tag1)
                await session.refresh(tag2)
                tag_ids.extend([tag1.id, tag2.id])

                issue_tag1 = IssueTag(tag_id=tag1.id, repo_id=1, issue_number=42)
                issue_tag2 = IssueTag(tag_id=tag2.id, repo_id=1, issue_number=42)
                session.add(issue_tag1)
                session.add(issue_tag2)
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tags_and_links())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                # Remove first tag
                response = client.delete(f"/repos/1/issues/42/tags/{tag_ids[0]}")

                assert response.status_code == 200
                data = response.json()
                assert len(data["tags"]) == 1
                assert data["tags"][0]["name"] == "urgent"
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())


class TestGetAllIssueTags:
    """Tests for GET /repos/{repo_id}/issue-tags endpoint."""

    def test_get_all_issue_tags_empty(self, client, mock_repo, in_memory_db):
        """Test getting all issue-tags when none exist."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.get("/repos/1/issue-tags")

                assert response.status_code == 200
                data = response.json()
                assert data["issue_tags"] == {}
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_get_all_issue_tags_with_results(self, client, mock_repo, in_memory_db):
        """Test getting all issue-tags returns correct grouping."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        async def add_tags_and_links():
            async with in_memory_db.get_session() as session:
                tag1 = Tag(repo_id=1, name="bug", color="#ff0000")
                tag2 = Tag(repo_id=1, name="urgent", color="#ffa500")
                session.add(tag1)
                session.add(tag2)
                await session.commit()
                await session.refresh(tag1)
                await session.refresh(tag2)

                # Issue 1 has both tags
                session.add(IssueTag(tag_id=tag1.id, repo_id=1, issue_number=1))
                session.add(IssueTag(tag_id=tag2.id, repo_id=1, issue_number=1))
                # Issue 2 has only bug tag
                session.add(IssueTag(tag_id=tag1.id, repo_id=1, issue_number=2))
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tags_and_links())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.get("/repos/1/issue-tags")

                assert response.status_code == 200
                data = response.json()

                # Issue 1 should have 2 tags
                assert len(data["issue_tags"]["1"]) == 2
                issue1_tag_names = [t["name"] for t in data["issue_tags"]["1"]]
                assert "bug" in issue1_tag_names
                assert "urgent" in issue1_tag_names

                # Issue 2 should have 1 tag
                assert len(data["issue_tags"]["2"]) == 1
                assert data["issue_tags"]["2"][0]["name"] == "bug"
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())

    def test_get_all_issue_tags_only_for_requested_repo(self, client, mock_repo, in_memory_db):
        """Test that bulk query only returns issue-tags for the requested repo."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(in_memory_db.setup())

        async def add_tags_for_multiple_repos():
            async with in_memory_db.get_session() as session:
                # Tags for repo 1
                tag1 = Tag(repo_id=1, name="repo1-tag", color="#ff0000")
                # Tags for repo 2
                tag2 = Tag(repo_id=2, name="repo2-tag", color="#00ff00")
                session.add(tag1)
                session.add(tag2)
                await session.commit()
                await session.refresh(tag1)
                await session.refresh(tag2)

                # Issue-tag for repo 1
                session.add(IssueTag(tag_id=tag1.id, repo_id=1, issue_number=1))
                # Issue-tag for repo 2
                session.add(IssueTag(tag_id=tag2.id, repo_id=2, issue_number=1))
                await session.commit()

        asyncio.get_event_loop().run_until_complete(add_tags_for_multiple_repos())

        try:
            with patch("app.routers.tags.get_repo_or_404", return_value=mock_repo), \
                 patch("app.routers.tags.get_repo_db", create_mock_get_repo_db(in_memory_db)):

                response = client.get("/repos/1/issue-tags")

                assert response.status_code == 200
                data = response.json()

                # Should only see repo 1's issue-tags
                assert "1" in data["issue_tags"]
                assert len(data["issue_tags"]["1"]) == 1
                assert data["issue_tags"]["1"][0]["name"] == "repo1-tag"
        finally:
            asyncio.get_event_loop().run_until_complete(in_memory_db.teardown())
