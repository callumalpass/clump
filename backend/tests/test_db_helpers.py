"""
Tests for the db_helpers module - database helper functions.

Tests cover:
- get_repo_or_404: Repository lookup with 404 handling
- get_session_or_404: Session lookup with 404 handling
- get_session_with_repo_or_404: Combined session/repo lookup
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi import HTTPException

from app.db_helpers import (
    get_repo_or_404,
    get_session_or_404,
    get_session_with_repo_or_404,
)


class TestGetRepoOr404:
    """Tests for get_repo_or_404 function."""

    def test_get_repo_or_404_found(self):
        """Test getting an existing repository."""
        mock_repo = {
            "id": 1,
            "owner": "testowner",
            "name": "testrepo",
            "local_path": "/path/to/repo"
        }

        with patch("app.db_helpers.get_repo_by_id", return_value=mock_repo):
            result = get_repo_or_404(1)

            assert result == mock_repo
            assert result["id"] == 1
            assert result["owner"] == "testowner"

    def test_get_repo_or_404_not_found(self):
        """Test getting a non-existent repository raises 404."""
        with patch("app.db_helpers.get_repo_by_id", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                get_repo_or_404(999)

            assert exc_info.value.status_code == 404
            assert "not found" in exc_info.value.detail.lower()

    def test_get_repo_or_404_returns_correct_repo(self):
        """Test that correct repo is returned based on ID."""
        repos = {
            1: {"id": 1, "owner": "owner1", "name": "repo1", "local_path": "/path1"},
            2: {"id": 2, "owner": "owner2", "name": "repo2", "local_path": "/path2"},
        }

        with patch("app.db_helpers.get_repo_by_id", side_effect=lambda id: repos.get(id)):
            result = get_repo_or_404(2)

            assert result["id"] == 2
            assert result["owner"] == "owner2"


class TestGetSessionOr404:
    """Tests for get_session_or_404 function."""

    @pytest.mark.asyncio
    async def test_get_session_or_404_found(self):
        """Test getting an existing session."""
        mock_session = MagicMock()
        mock_session.id = 1
        mock_session.title = "Test Session"
        mock_session.entities = []

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_session

        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await get_session_or_404(mock_db, 1)

        assert result == mock_session
        assert result.id == 1
        assert result.title == "Test Session"

    @pytest.mark.asyncio
    async def test_get_session_or_404_not_found(self):
        """Test getting a non-existent session raises 404."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await get_session_or_404(mock_db, 999)

        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_get_session_or_404_eager_loads_entities(self):
        """Test that entities relationship is eager loaded."""
        mock_session = MagicMock()
        mock_session.id = 1
        mock_session.entities = [MagicMock(entity_kind="issue", entity_number=42)]

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_session

        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await get_session_or_404(mock_db, 1)

        # Verify execute was called (which includes selectinload)
        mock_db.execute.assert_called_once()
        assert len(result.entities) == 1


class TestGetSessionWithRepoOr404:
    """Tests for get_session_with_repo_or_404 function."""

    @pytest.mark.asyncio
    async def test_get_session_with_repo_or_404_found(self):
        """Test getting session with matching repo."""
        mock_repo = {
            "id": 1,
            "owner": "testowner",
            "name": "testrepo",
            "local_path": "/path/to/repo"
        }

        mock_session = MagicMock()
        mock_session.id = 10
        mock_session.repo_id = 1
        mock_session.entities = []

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_session

        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch("app.db_helpers.get_repo_by_id", return_value=mock_repo):
            session, repo = await get_session_with_repo_or_404(10, 1, mock_db)

            assert session.id == 10
            assert repo["id"] == 1

    @pytest.mark.asyncio
    async def test_get_session_with_repo_or_404_repo_not_found(self):
        """Test that missing repo raises 404."""
        mock_db = MagicMock()

        with patch("app.db_helpers.get_repo_by_id", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                await get_session_with_repo_or_404(10, 999, mock_db)

            assert exc_info.value.status_code == 404
            assert "repository" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_get_session_with_repo_or_404_session_not_found(self):
        """Test that missing session raises 404."""
        mock_repo = {
            "id": 1,
            "owner": "testowner",
            "name": "testrepo",
            "local_path": "/path/to/repo"
        }

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch("app.db_helpers.get_repo_by_id", return_value=mock_repo):
            with pytest.raises(HTTPException) as exc_info:
                await get_session_with_repo_or_404(999, 1, mock_db)

            assert exc_info.value.status_code == 404
            assert "session" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_get_session_with_repo_or_404_wrong_repo(self):
        """Test that session belonging to different repo raises 404."""
        mock_repo = {
            "id": 1,
            "owner": "testowner",
            "name": "testrepo",
            "local_path": "/path/to/repo"
        }

        mock_session = MagicMock()
        mock_session.id = 10
        mock_session.repo_id = 2  # Different repo!
        mock_session.entities = []

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_session

        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch("app.db_helpers.get_repo_by_id", return_value=mock_repo):
            with pytest.raises(HTTPException) as exc_info:
                await get_session_with_repo_or_404(10, 1, mock_db)

            assert exc_info.value.status_code == 404
            assert "not found" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_get_session_with_repo_or_404_verifies_repo_ownership(self):
        """Test that session ownership is verified against requested repo_id."""
        mock_repo = {
            "id": 1,
            "owner": "testowner",
            "name": "testrepo",
            "local_path": "/specific/path/to/repo"
        }

        mock_session = MagicMock()
        mock_session.id = 10
        mock_session.repo_id = 1
        mock_session.entities = []

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_session

        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch("app.db_helpers.get_repo_by_id", return_value=mock_repo):
            session, repo = await get_session_with_repo_or_404(10, 1, mock_db)

            # Verify the session and repo are returned correctly
            assert session.repo_id == repo["id"]
