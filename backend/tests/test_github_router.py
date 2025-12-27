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

    def test_parse_ssh_url(self, tmp_path):
        """Test parsing SSH remote URL."""
        # Create a mock git repo
        git_dir = tmp_path / ".git"
        git_dir.mkdir()
        config_file = git_dir / "config"
        config_file.write_text(
            "[remote \"origin\"]\n"
            "    url = git@github.com:owner/repo.git\n"
        )

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="git@github.com:owner/repo.git\n",
            )
            owner, name = parse_github_remote(str(tmp_path))

        assert owner == "owner"
        assert name == "repo"

    def test_parse_https_url(self, tmp_path):
        """Test parsing HTTPS remote URL."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="https://github.com/owner/repo.git\n",
            )
            owner, name = parse_github_remote(str(tmp_path))

        assert owner == "owner"
        assert name == "repo"

    def test_parse_https_url_without_git_extension(self, tmp_path):
        """Test parsing HTTPS URL without .git extension."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="https://github.com/owner/repo\n",
            )
            owner, name = parse_github_remote(str(tmp_path))

        assert owner == "owner"
        assert name == "repo"

    def test_path_not_exists(self, tmp_path):
        """Test error when path doesn't exist."""
        nonexistent = tmp_path / "nonexistent"
        with pytest.raises(ValueError, match="Path does not exist"):
            parse_github_remote(str(nonexistent))

    def test_not_git_repo(self, tmp_path):
        """Test error when path is not a git repository."""
        with pytest.raises(ValueError, match="Not a git repository"):
            parse_github_remote(str(tmp_path))

    def test_no_origin_remote(self, tmp_path):
        """Test error when no origin remote exists."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1,
                stdout="",
            )
            with pytest.raises(ValueError, match="No 'origin' remote found"):
                parse_github_remote(str(tmp_path))

    def test_unparseable_remote(self, tmp_path):
        """Test error when remote URL can't be parsed."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="git@gitlab.com:owner/repo.git\n",
            )
            with pytest.raises(ValueError, match="Could not parse GitHub remote URL"):
                parse_github_remote(str(tmp_path))


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
            mock_client.get_repo.side_effect = Exception("Not found")

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
            mock_client.list_prs.return_value = [mock_pr_data]

            response = client.get("/repos/1/prs")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["number"] == 123
        assert data[0]["head_ref"] == "feature/test"
        assert data[0]["base_ref"] == "main"

    def test_list_prs_with_state_filter(self, client, mock_repo_info, mock_pr_data):
        """Test listing PRs with state filter."""
        with patch("app.routers.github.get_repo_or_404") as mock_get, \
             patch("app.routers.github.github_client") as mock_client:
            mock_get.return_value = mock_repo_info
            mock_client.list_prs.return_value = [mock_pr_data]

            response = client.get("/repos/1/prs?state=closed&limit=50")

        assert response.status_code == 200
        mock_client.list_prs.assert_called_once_with(
            "test-owner",
            "test-repo",
            state="closed",
            limit=50,
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
