"""
Tests for the GitHub router API endpoints.

Tests cover:
- GET /repos (list repositories)
- POST /repos (add repository)
- DELETE /repos/{repo_id} (remove repository)
- GET /repos/{repo_id}/issues (list issues)
- GET /repos/{repo_id}/issues/{issue_number} (get issue detail)
- POST /repos/{repo_id}/issues (create issue)
- POST /repos/{repo_id}/issues/{issue_number}/comments (add comment)
- POST /repos/{repo_id}/issues/{issue_number}/close (close issue)
- POST /repos/{repo_id}/issues/{issue_number}/reopen (reopen issue)
- GET /repos/{repo_id}/prs (list PRs)
- GET /repos/{repo_id}/labels (get labels)
- GET /repos/{repo_id}/assignees (get assignees)
"""

import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI
from github import UnknownObjectException

from app.routers.github import (
    router,
    parse_github_remote,
    RepoResponse,
    IssueResponse,
    PRResponse,
)
from app.services.github_client import IssueData, PRData, IssueComment


@pytest.fixture
def app():
    """Create a test FastAPI app with the github router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_repo_info():
    """Create a mock repo info dict."""
    return {
        "id": 1,
        "owner": "test-owner",
        "name": "test-repo",
        "local_path": "/home/user/projects/test-repo",
    }


@pytest.fixture
def mock_issue_data():
    """Create a mock IssueData."""
    return IssueData(
        number=42,
        title="Test Issue",
        body="This is a test issue body",
        state="open",
        labels=["bug", "help wanted"],
        author="testuser",
        created_at=datetime(2024, 1, 15, 10, 30, 0),
        updated_at=datetime(2024, 1, 15, 12, 0, 0),
        comments_count=3,
        url="https://github.com/test-owner/test-repo/issues/42",
        comments=None,
    )


@pytest.fixture
def mock_pr_data():
    """Create a mock PRData."""
    return PRData(
        number=123,
        title="Test PR",
        body="This is a test PR body",
        state="open",
        labels=["enhancement"],
        author="prauthor",
        created_at=datetime(2024, 1, 10, 8, 0, 0),
        updated_at=datetime(2024, 1, 15, 14, 0, 0),
        head_ref="feature/test",
        base_ref="main",
        additions=50,
        deletions=10,
        changed_files=3,
        url="https://github.com/test-owner/test-repo/pull/123",
    )


class TestParseGitHubRemote:
    """Tests for the parse_github_remote helper function."""

    @pytest.fixture
    def mock_subprocess(self):
        """Create a mock async subprocess result."""
        async def create_mock(stdout: str, returncode: int = 0):
            mock_proc = MagicMock()
            mock_proc.returncode = returncode

            async def communicate():
                return (stdout.encode(), b"")

            mock_proc.communicate = communicate
            return mock_proc

        return create_mock

    @pytest.mark.asyncio
    async def test_parse_ssh_url(self, tmp_path, mock_subprocess):
        """Test parsing SSH remote URL."""
        # Create a mock git repo
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        async def mock_create(*args, **kwargs):
            return await mock_subprocess("git@github.com:owner/repo.git\n")

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create):
            owner, name = await parse_github_remote(str(tmp_path))

        assert owner == "owner"
        assert name == "repo"

    @pytest.mark.asyncio
    async def test_parse_https_url(self, tmp_path, mock_subprocess):
        """Test parsing HTTPS remote URL."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        async def mock_create(*args, **kwargs):
            return await mock_subprocess("https://github.com/owner/repo.git\n")

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create):
            owner, name = await parse_github_remote(str(tmp_path))

        assert owner == "owner"
        assert name == "repo"

    @pytest.mark.asyncio
    async def test_parse_https_url_without_git_extension(self, tmp_path, mock_subprocess):
        """Test parsing HTTPS URL without .git extension."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        async def mock_create(*args, **kwargs):
            return await mock_subprocess("https://github.com/owner/repo\n")

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create):
            owner, name = await parse_github_remote(str(tmp_path))

        assert owner == "owner"
        assert name == "repo"

    @pytest.mark.asyncio
    async def test_path_not_exists(self, tmp_path):
        """Test error when path doesn't exist."""
        nonexistent = tmp_path / "nonexistent"
        with pytest.raises(ValueError, match="Path does not exist"):
            await parse_github_remote(str(nonexistent))

    @pytest.mark.asyncio
    async def test_not_git_repo(self, tmp_path):
        """Test error when path is not a git repository."""
        with pytest.raises(ValueError, match="Not a git repository"):
            await parse_github_remote(str(tmp_path))

    @pytest.mark.asyncio
    async def test_no_origin_remote(self, tmp_path, mock_subprocess):
        """Test error when no origin remote exists."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        async def mock_create(*args, **kwargs):
            return await mock_subprocess("", returncode=1)

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create):
            with pytest.raises(ValueError, match="No 'origin' remote found"):
                await parse_github_remote(str(tmp_path))

    @pytest.mark.asyncio
    async def test_unparseable_remote(self, tmp_path, mock_subprocess):
        """Test error when remote URL can't be parsed."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        async def mock_create(*args, **kwargs):
            return await mock_subprocess("git@gitlab.com:owner/repo.git\n")

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create):
            with pytest.raises(ValueError, match="Could not parse GitHub remote URL"):
                await parse_github_remote(str(tmp_path))


class TestListRepos:
    """Tests for GET /repos endpoint."""

    def test_list_repos_empty(self, client):
        """Test listing repos when none exist."""
        with patch("app.routers.github.load_repos") as mock_load:
            mock_load.return_value = []
            response = client.get("/repos")

        assert response.status_code == 200
        assert response.json() == []

    def test_list_repos_with_data(self, client, mock_repo_info):
        """Test listing repos with data."""
        with patch("app.routers.github.load_repos") as mock_load:
            mock_load.return_value = [mock_repo_info]
            response = client.get("/repos")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == 1
        assert data[0]["owner"] == "test-owner"
        assert data[0]["name"] == "test-repo"


class TestCreateRepo:
    """Tests for POST /repos endpoint."""

    def test_create_repo_with_owner_name(self, client, mock_repo_info):
        """Test creating a repo with explicit owner and name."""
        with patch("app.routers.github.github_client") as mock_client, \
             patch("app.routers.github.storage_add_repo") as mock_add:
            mock_client.get_repo.return_value = MagicMock()
            mock_add.return_value = mock_repo_info

            response = client.post(
                "/repos",
                json={
                    "local_path": "/home/user/projects/test-repo",
                    "owner": "test-owner",
                    "name": "test-repo",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["owner"] == "test-owner"
        assert data["name"] == "test-repo"

    def test_create_repo_infer_from_git(self, client, mock_repo_info, tmp_path):
        """Test creating a repo by inferring from git remote."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        with patch("app.routers.github.parse_github_remote") as mock_parse, \
             patch("app.routers.github.github_client") as mock_client, \
             patch("app.routers.github.storage_add_repo") as mock_add:
            mock_parse.return_value = ("inferred-owner", "inferred-repo")
            mock_client.get_repo.return_value = MagicMock()
            mock_add.return_value = {
                **mock_repo_info,
                "owner": "inferred-owner",
                "name": "inferred-repo",
            }

            response = client.post(
                "/repos",
                json={"local_path": str(tmp_path)},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["owner"] == "inferred-owner"
        assert data["name"] == "inferred-repo"

    def test_create_repo_github_not_found(self, client):
        """Test error when repo doesn't exist on GitHub."""
        with patch("app.routers.github.github_client") as mock_client:
            # UnknownObjectException is what GitHub API raises for 404s
            mock_client.get_repo.side_effect = UnknownObjectException(
                status=404, data={"message": "Not Found"}, headers={}
            )

            response = client.post(
                "/repos",
                json={
                    "local_path": "/path/to/repo",
                    "owner": "owner",
                    "name": "nonexistent",
                },
            )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_create_repo_infer_fails(self, client, tmp_path):
        """Test error when git remote inference fails."""
        # Path exists but is not a git repo
        with patch("app.routers.github.parse_github_remote") as mock_parse:
            mock_parse.side_effect = ValueError("Not a git repository")

            response = client.post(
                "/repos",
                json={"local_path": str(tmp_path)},
            )

        assert response.status_code == 400
        assert "Could not infer" in response.json()["detail"]


class TestDeleteRepo:
    """Tests for DELETE /repos/{repo_id} endpoint."""

    def test_delete_repo(self, client, mock_repo_info):
        """Test deleting a repo."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.storage_delete_repo") as mock_delete, \
             patch("app.routers.github.delete_repo_data") as mock_delete_data, \
             patch("app.routers.github.clear_engine_cache") as mock_clear:
            mock_get.return_value = mock_repo_info

            response = client.delete("/repos/1")

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
        mock_delete.assert_called_once_with(1)
        mock_delete_data.assert_called_once()
        mock_clear.assert_called_once()

    def test_delete_repo_without_data(self, client, mock_repo_info):
        """Test deleting a repo without deleting data."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.storage_delete_repo") as mock_delete, \
             patch("app.routers.github.delete_repo_data") as mock_delete_data:
            mock_get.return_value = mock_repo_info

            response = client.delete("/repos/1?delete_data=false")

        assert response.status_code == 200
        mock_delete_data.assert_not_called()


class TestListIssues:
    """Tests for GET /repos/{repo_id}/issues endpoint."""

    def test_list_issues(self, client, mock_repo_info, mock_issue_data):
        """Test listing issues for a repo."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            mock_client.list_issues.return_value = ([mock_issue_data], 1)

            response = client.get("/repos/1/issues")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["issues"]) == 1
        assert data["issues"][0]["number"] == 42
        assert data["issues"][0]["title"] == "Test Issue"

    def test_list_issues_with_filters(self, client, mock_repo_info, mock_issue_data):
        """Test listing issues with filters."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            mock_client.list_issues.return_value = ([mock_issue_data], 1)

            response = client.get(
                "/repos/1/issues",
                params={
                    "state": "closed",
                    "search": "bug",
                    "labels": ["bug", "urgent"],
                    "sort": "updated",
                    "order": "asc",
                    "page": 2,
                    "per_page": 10,
                },
            )

        assert response.status_code == 200
        mock_client.list_issues.assert_called_once_with(
            "test-owner",
            "test-repo",
            state="closed",
            labels=["bug", "urgent"],
            search_query="bug",
            sort="updated",
            order="asc",
            page=2,
            per_page=10,
        )


class TestGetIssue:
    """Tests for GET /repos/{repo_id}/issues/{issue_number} endpoint."""

    def test_get_issue(self, client, mock_repo_info, mock_issue_data):
        """Test getting a single issue with comments."""
        mock_issue_data.comments = [
            IssueComment(
                id=1,
                author="commenter",
                body="This is a comment",
                created_at=datetime(2024, 1, 15, 11, 0, 0),
            )
        ]

        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            mock_client.get_issue.return_value = mock_issue_data

            response = client.get("/repos/1/issues/42")

        assert response.status_code == 200
        data = response.json()
        assert data["number"] == 42
        assert len(data["comments"]) == 1
        assert data["comments"][0]["author"] == "commenter"


class TestCreateIssue:
    """Tests for POST /repos/{repo_id}/issues endpoint."""

    def test_create_issue(self, client, mock_repo_info, mock_issue_data):
        """Test creating a new issue."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            mock_client.create_issue.return_value = mock_issue_data

            response = client.post(
                "/repos/1/issues",
                json={
                    "title": "New Issue",
                    "body": "Issue description",
                    "labels": ["bug"],
                    "assignees": ["user1"],
                },
            )

        assert response.status_code == 200
        mock_client.create_issue.assert_called_once_with(
            "test-owner",
            "test-repo",
            "New Issue",
            "Issue description",
            ["bug"],
            ["user1"],
        )


class TestIssueActions:
    """Tests for issue action endpoints."""

    def test_create_comment(self, client, mock_repo_info):
        """Test creating a comment on an issue."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            mock_client.add_comment.return_value = 123

            response = client.post(
                "/repos/1/issues/42/comments",
                json={"body": "A comment"},
            )

        assert response.status_code == 200
        assert response.json()["id"] == 123
        assert response.json()["status"] == "created"

    def test_close_issue(self, client, mock_repo_info):
        """Test closing an issue."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info

            response = client.post("/repos/1/issues/42/close")

        assert response.status_code == 200
        assert response.json()["status"] == "closed"
        mock_client.close_issue.assert_called_once()

    def test_reopen_issue(self, client, mock_repo_info):
        """Test reopening an issue."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info

            response = client.post("/repos/1/issues/42/reopen")

        assert response.status_code == 200
        assert response.json()["status"] == "opened"
        mock_client.reopen_issue.assert_called_once()


class TestListPRs:
    """Tests for GET /repos/{repo_id}/prs endpoint."""

    def test_list_prs(self, client, mock_repo_info, mock_pr_data):
        """Test listing PRs for a repo."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            # list_prs returns (prs, total) tuple
            mock_client.list_prs.return_value = ([mock_pr_data], 1)

            response = client.get("/repos/1/prs")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["prs"]) == 1
        assert data["prs"][0]["number"] == 123
        assert data["prs"][0]["head_ref"] == "feature/test"
        assert data["prs"][0]["base_ref"] == "main"

    def test_list_prs_with_state_filter(self, client, mock_repo_info, mock_pr_data):
        """Test listing PRs with state filter."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            # list_prs returns (prs, total) tuple
            mock_client.list_prs.return_value = ([mock_pr_data], 1)

            response = client.get("/repos/1/prs?state=closed")

        assert response.status_code == 200
        mock_client.list_prs.assert_called_once_with(
            "test-owner",
            "test-repo",
            state="closed",
            search_query=None,
            sort="created",
            order="desc",
            page=1,
            per_page=30,
        )


class TestLabelsAndAssignees:
    """Tests for labels and assignees endpoints."""

    def test_get_labels(self, client, mock_repo_info):
        """Test getting available labels."""
        mock_labels = [
            {"name": "bug", "color": "d73a4a", "description": "Something isn't working"},
            {"name": "enhancement", "color": "a2eeef", "description": "New feature"},
        ]

        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            mock_client.get_available_labels.return_value = mock_labels

            response = client.get("/repos/1/labels")

        assert response.status_code == 200
        data = response.json()
        assert len(data["labels"]) == 2
        assert data["labels"][0]["name"] == "bug"

    def test_get_assignees(self, client, mock_repo_info):
        """Test getting assignable users."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            mock_client.get_assignable_users.return_value = ["user1", "user2"]

            response = client.get("/repos/1/assignees")

        assert response.status_code == 200
        data = response.json()
        assert data["assignees"] == ["user1", "user2"]


class TestResponseModels:
    """Tests for response model conversions."""

    def test_repo_response_from_repo_info(self, mock_repo_info):
        """Test RepoResponse.from_repo_info conversion."""
        response = RepoResponse.from_repo_info(mock_repo_info)
        assert response.id == 1
        assert response.owner == "test-owner"
        assert response.name == "test-repo"
        assert response.local_path == "/home/user/projects/test-repo"


class TestGitHubCache:
    """Tests for the GitHub API response cache."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the cache before and after each test."""
        from app.routers.github import _clear_cache
        _clear_cache()
        yield
        _clear_cache()

    def test_cache_stores_and_retrieves_response(self):
        """Test that cached responses can be retrieved."""
        from app.routers.github import _cache_response, _get_cached_response

        test_data = {"issues": [{"number": 1, "title": "Test"}]}
        _cache_response("test_key", test_data)

        result = _get_cached_response("test_key")
        assert result == test_data

    def test_cache_returns_none_for_missing_key(self):
        """Test that missing keys return None."""
        from app.routers.github import _get_cached_response

        result = _get_cached_response("nonexistent_key")
        assert result is None

    def test_cache_expires_after_ttl(self):
        """Test that cached entries expire after TTL."""
        from app.routers.github import (
            _cache_response,
            _get_cached_response,
            _github_cache,
            GITHUB_CACHE_TTL,
        )
        import time as time_module

        test_data = {"test": "data"}
        _cache_response("expiring_key", test_data)

        # Verify it's cached
        assert _get_cached_response("expiring_key") == test_data

        # Manually set the timestamp to be expired
        _github_cache["expiring_key"] = (
            test_data,
            time_module.time() - GITHUB_CACHE_TTL - 1
        )

        # Should now return None and remove the entry
        result = _get_cached_response("expiring_key")
        assert result is None
        assert "expiring_key" not in _github_cache

    def test_cache_cleanup_removes_expired_entries(self):
        """Test that cleanup removes all expired entries."""
        from app.routers.github import (
            _github_cache,
            _cleanup_expired_cache_entries,
            GITHUB_CACHE_TTL,
        )
        import time as time_module

        current_time = time_module.time()

        # Add some expired entries
        _github_cache["expired1"] = ({"data": 1}, current_time - GITHUB_CACHE_TTL - 10)
        _github_cache["expired2"] = ({"data": 2}, current_time - GITHUB_CACHE_TTL - 5)
        # Add a valid entry
        _github_cache["valid"] = ({"data": 3}, current_time)

        _cleanup_expired_cache_entries()

        assert "expired1" not in _github_cache
        assert "expired2" not in _github_cache
        assert "valid" in _github_cache

    def test_cache_evicts_oldest_when_over_limit(self):
        """Test that oldest entries are evicted when cache exceeds max size."""
        from app.routers.github import (
            _cache_response,
            _github_cache,
            GITHUB_CACHE_MAX_SIZE,
        )
        import time as time_module

        # Fill the cache to max size with entries that have ascending timestamps
        base_time = time_module.time()
        for i in range(GITHUB_CACHE_MAX_SIZE):
            _github_cache[f"key_{i}"] = ({"data": i}, base_time + i)

        assert len(_github_cache) == GITHUB_CACHE_MAX_SIZE

        # Add one more entry - should trigger eviction of oldest
        _cache_response("new_key", {"data": "new"})

        # Cache should still be at max size
        assert len(_github_cache) <= GITHUB_CACHE_MAX_SIZE + 1  # +1 because we just added
        # The oldest entry (key_0 with lowest timestamp) should be gone
        assert "key_0" not in _github_cache
        # The new entry should be present
        assert "new_key" in _github_cache

    def test_cache_cleanup_prefers_expired_over_eviction(self):
        """Test that expired entries are removed before evicting valid ones."""
        from app.routers.github import (
            _cache_response,
            _github_cache,
            GITHUB_CACHE_MAX_SIZE,
            GITHUB_CACHE_TTL,
        )
        import time as time_module

        current_time = time_module.time()

        # Fill cache to max size with half expired and half valid entries
        for i in range(GITHUB_CACHE_MAX_SIZE):
            if i < GITHUB_CACHE_MAX_SIZE // 2:
                # Expired entries
                _github_cache[f"expired_{i}"] = (
                    {"data": i},
                    current_time - GITHUB_CACHE_TTL - 10
                )
            else:
                # Valid entries
                _github_cache[f"valid_{i}"] = ({"data": i}, current_time)

        assert len(_github_cache) == GITHUB_CACHE_MAX_SIZE

        # Add a new entry - should trigger cleanup of expired entries first
        _cache_response("new_key", {"data": "new"})

        # All expired entries should be gone
        for i in range(GITHUB_CACHE_MAX_SIZE // 2):
            assert f"expired_{i}" not in _github_cache

        # Valid entries should remain
        for i in range(GITHUB_CACHE_MAX_SIZE // 2, GITHUB_CACHE_MAX_SIZE):
            assert f"valid_{i}" in _github_cache

        # New entry should be present
        assert "new_key" in _github_cache

    def test_clear_cache_removes_all_entries(self):
        """Test that clear_cache removes all entries."""
        from app.routers.github import (
            _cache_response,
            _get_cached_response,
            _clear_cache,
            _github_cache,
        )

        # Add some entries
        _cache_response("key1", {"data": 1})
        _cache_response("key2", {"data": 2})
        _cache_response("key3", {"data": 3})

        assert len(_github_cache) == 3

        _clear_cache()

        assert len(_github_cache) == 0
        assert _get_cached_response("key1") is None
        assert _get_cached_response("key2") is None
        assert _get_cached_response("key3") is None

    def test_cache_overwrites_existing_key(self):
        """Test that caching with same key overwrites the previous value."""
        from app.routers.github import _cache_response, _get_cached_response

        _cache_response("key", {"value": "old"})
        assert _get_cached_response("key") == {"value": "old"}

        _cache_response("key", {"value": "new"})
        assert _get_cached_response("key") == {"value": "new"}

    def test_cache_handles_various_data_types(self):
        """Test that cache handles different data types correctly."""
        from app.routers.github import _cache_response, _get_cached_response

        # Test with list
        _cache_response("list_key", [1, 2, 3])
        assert _get_cached_response("list_key") == [1, 2, 3]

        # Test with nested dict
        nested = {"outer": {"inner": {"deep": "value"}}}
        _cache_response("nested_key", nested)
        assert _get_cached_response("nested_key") == nested

        # Test with None value
        _cache_response("none_key", None)
        # Note: None is a valid cached value, different from key not existing
        # _get_cached_response returns None for both cases, but the key exists
        from app.routers.github import _github_cache
        assert "none_key" in _github_cache

    def test_cache_key_with_special_characters(self):
        """Test that cache works with keys containing special characters."""
        from app.routers.github import _cache_response, _get_cached_response

        special_key = "issues:1:open:search=bug fix:labels=a,b,c"
        _cache_response(special_key, {"result": "found"})
        assert _get_cached_response(special_key) == {"result": "found"}

    def test_cache_empty_response(self):
        """Test caching empty responses (valid API responses with no data)."""
        from app.routers.github import _cache_response, _get_cached_response

        # Empty list (e.g., no issues found)
        _cache_response("empty_list", [])
        assert _get_cached_response("empty_list") == []

        # Empty dict
        _cache_response("empty_dict", {})
        assert _get_cached_response("empty_dict") == {}
