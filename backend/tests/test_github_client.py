"""
Tests for the GitHub client service.

Tests cover:
- GitHubClient initialization (with/without token)
- Repository caching
- Issue listing with search, filtering, pagination, and sorting
- Single issue retrieval with comments
- PR listing and retrieval
- Issue/PR mutations (add comment, add labels, close, reopen, create)
- Helper methods (get assignable users, get available labels)
- Edge cases and error handling
"""

import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch, PropertyMock

from app.services.github_client import (
    GitHubClient,
    IssueData,
    PRData,
    IssueComment,
)


@pytest.fixture
def mock_github():
    """Create a mock Github instance."""
    with patch("app.services.github_client.Github") as mock_cls:
        mock_instance = MagicMock()
        mock_cls.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_auth():
    """Create a mock Auth.Token."""
    with patch("app.services.github_client.Auth") as mock_auth:
        yield mock_auth


@pytest.fixture
def mock_settings():
    """Create mock settings with a token."""
    with patch("app.services.github_client.settings") as mock:
        mock.github_token = "test-token-123"
        yield mock


@pytest.fixture
def client(mock_github, mock_auth, mock_settings):
    """Create a GitHubClient instance with mocked dependencies."""
    return GitHubClient()


@pytest.fixture
def client_no_token(mock_github, mock_auth):
    """Create a GitHubClient instance without a token."""
    with patch("app.services.github_client.settings") as mock_settings:
        mock_settings.github_token = None
        return GitHubClient()


def create_mock_issue(
    number: int = 42,
    title: str = "Test Issue",
    body: str = "Issue body",
    state: str = "open",
    labels: list[str] | None = None,
    author: str = "testuser",
    comments: int = 0,
    url: str = "https://github.com/owner/repo/issues/42",
):
    """Helper to create a mock GitHub Issue object."""
    mock_issue = MagicMock()
    mock_issue.number = number
    mock_issue.title = title
    mock_issue.body = body
    mock_issue.state = state
    mock_issue.comments = comments
    mock_issue.html_url = url
    mock_issue.created_at = datetime(2024, 1, 15, 10, 0, 0)
    mock_issue.updated_at = datetime(2024, 1, 15, 12, 0, 0)

    # Create mock labels
    mock_labels = []
    for label_name in labels or []:
        mock_label = MagicMock()
        mock_label.name = label_name
        mock_labels.append(mock_label)
    mock_issue.labels = mock_labels

    # Create mock user
    mock_user = MagicMock()
    mock_user.login = author
    mock_issue.user = mock_user

    return mock_issue


def create_mock_pr(
    number: int = 123,
    title: str = "Test PR",
    body: str = "PR body",
    state: str = "open",
    labels: list[str] | None = None,
    author: str = "prauthor",
    head_ref: str = "feature/test",
    base_ref: str = "main",
    additions: int = 50,
    deletions: int = 10,
    changed_files: int = 3,
    url: str = "https://github.com/owner/repo/pull/123",
):
    """Helper to create a mock GitHub PullRequest object."""
    mock_pr = MagicMock()
    mock_pr.number = number
    mock_pr.title = title
    mock_pr.body = body
    mock_pr.state = state
    mock_pr.additions = additions
    mock_pr.deletions = deletions
    mock_pr.changed_files = changed_files
    mock_pr.html_url = url
    mock_pr.created_at = datetime(2024, 1, 10, 8, 0, 0)
    mock_pr.updated_at = datetime(2024, 1, 15, 14, 0, 0)

    # Create mock labels
    mock_labels = []
    for label_name in labels or []:
        mock_label = MagicMock()
        mock_label.name = label_name
        mock_labels.append(mock_label)
    mock_pr.labels = mock_labels

    # Create mock user
    mock_user = MagicMock()
    mock_user.login = author
    mock_pr.user = mock_user

    # Create mock head/base refs
    mock_head = MagicMock()
    mock_head.ref = head_ref
    mock_pr.head = mock_head

    mock_base = MagicMock()
    mock_base.ref = base_ref
    mock_pr.base = mock_base

    return mock_pr


class TestGitHubClientInit:
    """Tests for GitHubClient initialization."""

    def test_init_with_token_from_settings(self, mock_github, mock_auth, mock_settings):
        """Test client initialization uses token from settings."""
        client = GitHubClient()

        mock_auth.Token.assert_called_once_with("test-token-123")

    def test_init_with_explicit_token(self, mock_github, mock_auth):
        """Test client initialization with explicit token overrides settings."""
        with patch("app.services.github_client.settings") as mock_settings:
            mock_settings.github_token = "settings-token"
            client = GitHubClient(token="explicit-token")

            mock_auth.Token.assert_called_once_with("explicit-token")

    def test_init_without_token(self, mock_github, mock_auth):
        """Test client initialization without token uses unauthenticated Github."""
        with patch("app.services.github_client.settings") as mock_settings:
            mock_settings.github_token = None
            client = GitHubClient()

            # Auth.Token should not be called
            mock_auth.Token.assert_not_called()


class TestGetRepo:
    """Tests for GitHubClient.get_repo()."""

    def test_get_repo_fetches_from_api(self, client, mock_github):
        """Test get_repo calls Github API."""
        mock_repo = MagicMock()
        mock_github.get_repo.return_value = mock_repo

        result = client.get_repo("owner", "repo")

        mock_github.get_repo.assert_called_once_with("owner/repo")
        assert result == mock_repo

    def test_get_repo_caches_result(self, client, mock_github):
        """Test get_repo caches the result for subsequent calls."""
        mock_repo = MagicMock()
        mock_github.get_repo.return_value = mock_repo

        # Call twice
        result1 = client.get_repo("owner", "repo")
        result2 = client.get_repo("owner", "repo")

        # API should only be called once
        mock_github.get_repo.assert_called_once()
        assert result1 == result2 == mock_repo

    def test_get_repo_different_repos_not_cached_together(self, client, mock_github):
        """Test different repos are cached separately."""
        mock_repo1 = MagicMock()
        mock_repo2 = MagicMock()
        mock_github.get_repo.side_effect = [mock_repo1, mock_repo2]

        result1 = client.get_repo("owner1", "repo1")
        result2 = client.get_repo("owner2", "repo2")

        assert mock_github.get_repo.call_count == 2
        assert result1 == mock_repo1
        assert result2 == mock_repo2


class TestListIssues:
    """Tests for GitHubClient.list_issues()."""

    def test_list_issues_basic(self, client, mock_github):
        """Test basic issue listing."""
        mock_issue = create_mock_issue()
        mock_results = MagicMock()
        mock_results.totalCount = 1
        mock_results.__iter__ = lambda self: iter([mock_issue])
        mock_github.search_issues.return_value = mock_results

        issues, total = client.list_issues("owner", "repo")

        assert len(issues) == 1
        assert total == 1
        assert issues[0].number == 42
        assert issues[0].title == "Test Issue"
        mock_github.search_issues.assert_called_once()

    def test_list_issues_builds_correct_query(self, client, mock_github):
        """Test that list_issues builds the correct search query."""
        mock_results = MagicMock()
        mock_results.totalCount = 0
        mock_results.__iter__ = lambda self: iter([])
        mock_github.search_issues.return_value = mock_results

        client.list_issues("owner", "repo", state="open")

        call_args = mock_github.search_issues.call_args
        query = call_args[0][0]
        assert "repo:owner/repo" in query
        assert "is:issue" in query
        assert "state:open" in query

    def test_list_issues_state_all_omits_state_filter(self, client, mock_github):
        """Test that state='all' doesn't add state filter."""
        mock_results = MagicMock()
        mock_results.totalCount = 0
        mock_results.__iter__ = lambda self: iter([])
        mock_github.search_issues.return_value = mock_results

        client.list_issues("owner", "repo", state="all")

        query = mock_github.search_issues.call_args[0][0]
        assert "state:" not in query

    def test_list_issues_with_labels(self, client, mock_github):
        """Test issue listing with label filters."""
        mock_results = MagicMock()
        mock_results.totalCount = 0
        mock_results.__iter__ = lambda self: iter([])
        mock_github.search_issues.return_value = mock_results

        client.list_issues("owner", "repo", labels=["bug", "help wanted"])

        query = mock_github.search_issues.call_args[0][0]
        assert "label:bug" in query
        assert 'label:"help wanted"' in query

    def test_list_issues_with_search_query(self, client, mock_github):
        """Test issue listing with text search."""
        mock_results = MagicMock()
        mock_results.totalCount = 0
        mock_results.__iter__ = lambda self: iter([])
        mock_github.search_issues.return_value = mock_results

        client.list_issues("owner", "repo", search_query="authentication error")

        query = mock_github.search_issues.call_args[0][0]
        assert query.startswith("authentication error ")

    def test_list_issues_pagination(self, client, mock_github):
        """Test issue listing with pagination."""
        # Create 5 mock issues
        mock_issues = [create_mock_issue(number=i) for i in range(5)]
        mock_results = MagicMock()
        mock_results.totalCount = 5
        mock_results.__iter__ = lambda self: iter(mock_issues)
        mock_github.search_issues.return_value = mock_results

        # Get page 2 with 2 items per page
        issues, total = client.list_issues("owner", "repo", page=2, per_page=2)

        assert total == 5
        # Should get items at index 2 and 3 (0-indexed: page 2 starts at index 2)
        assert len(issues) == 2
        assert issues[0].number == 2
        assert issues[1].number == 3

    def test_list_issues_sort_options(self, client, mock_github):
        """Test issue listing with different sort options."""
        mock_results = MagicMock()
        mock_results.totalCount = 0
        mock_results.__iter__ = lambda self: iter([])
        mock_github.search_issues.return_value = mock_results

        client.list_issues("owner", "repo", sort="updated", order="asc")

        call_kwargs = mock_github.search_issues.call_args[1]
        assert call_kwargs["sort"] == "updated"
        assert call_kwargs["order"] == "asc"

    def test_list_issues_invalid_sort_defaults(self, client, mock_github):
        """Test that invalid sort field defaults to 'created'."""
        mock_results = MagicMock()
        mock_results.totalCount = 0
        mock_results.__iter__ = lambda self: iter([])
        mock_github.search_issues.return_value = mock_results

        client.list_issues("owner", "repo", sort="invalid_sort")

        call_kwargs = mock_github.search_issues.call_args[1]
        assert call_kwargs["sort"] == "created"

    def test_list_issues_invalid_order_defaults(self, client, mock_github):
        """Test that invalid order defaults to 'desc'."""
        mock_results = MagicMock()
        mock_results.totalCount = 0
        mock_results.__iter__ = lambda self: iter([])
        mock_github.search_issues.return_value = mock_results

        client.list_issues("owner", "repo", order="invalid_order")

        call_kwargs = mock_github.search_issues.call_args[1]
        assert call_kwargs["order"] == "desc"


class TestGetIssue:
    """Tests for GitHubClient.get_issue()."""

    def test_get_issue_returns_issue_data(self, client, mock_github):
        """Test get_issue returns correct IssueData."""
        mock_repo = MagicMock()
        mock_issue = create_mock_issue(number=42, title="Bug Report", comments=2)

        # Create mock comments
        mock_comment1 = MagicMock()
        mock_comment1.id = 1
        mock_comment1.body = "First comment"
        mock_comment1.created_at = datetime(2024, 1, 15, 11, 0, 0)
        mock_comment1_user = MagicMock()
        mock_comment1_user.login = "commenter1"
        mock_comment1.user = mock_comment1_user

        mock_comment2 = MagicMock()
        mock_comment2.id = 2
        mock_comment2.body = "Second comment"
        mock_comment2.created_at = datetime(2024, 1, 15, 12, 0, 0)
        mock_comment2_user = MagicMock()
        mock_comment2_user.login = "commenter2"
        mock_comment2.user = mock_comment2_user

        mock_issue.get_comments.return_value = [mock_comment1, mock_comment2]

        mock_repo.get_issue.return_value = mock_issue
        mock_github.get_repo.return_value = mock_repo

        result = client.get_issue("owner", "repo", 42)

        assert isinstance(result, IssueData)
        assert result.number == 42
        assert result.title == "Bug Report"
        assert result.comments is not None
        assert len(result.comments) == 2
        assert result.comments[0].author == "commenter1"
        assert result.comments[1].body == "Second comment"

    def test_get_issue_handles_null_user(self, client, mock_github):
        """Test get_issue handles comments with null user."""
        mock_repo = MagicMock()
        mock_issue = create_mock_issue()

        mock_comment = MagicMock()
        mock_comment.id = 1
        mock_comment.body = "Anonymous comment"
        mock_comment.created_at = datetime(2024, 1, 15, 11, 0, 0)
        mock_comment.user = None

        mock_issue.get_comments.return_value = [mock_comment]
        mock_repo.get_issue.return_value = mock_issue
        mock_github.get_repo.return_value = mock_repo

        result = client.get_issue("owner", "repo", 42)

        assert result.comments[0].author == "unknown"


class TestListPRs:
    """Tests for GitHubClient.list_prs()."""

    def test_list_prs_basic(self, client, mock_github):
        """Test basic PR listing."""
        mock_repo = MagicMock()
        mock_pr = create_mock_pr()
        mock_repo.get_pulls.return_value = [mock_pr]
        mock_github.get_repo.return_value = mock_repo

        prs = client.list_prs("owner", "repo")

        assert len(prs) == 1
        assert prs[0].number == 123
        assert prs[0].title == "Test PR"
        mock_repo.get_pulls.assert_called_once_with(state="open")

    def test_list_prs_with_state(self, client, mock_github):
        """Test PR listing with different states."""
        mock_repo = MagicMock()
        mock_repo.get_pulls.return_value = []
        mock_github.get_repo.return_value = mock_repo

        client.list_prs("owner", "repo", state="closed")

        mock_repo.get_pulls.assert_called_once_with(state="closed")

    def test_list_prs_respects_limit(self, client, mock_github):
        """Test PR listing respects the limit parameter."""
        mock_repo = MagicMock()
        mock_prs = [create_mock_pr(number=i) for i in range(10)]
        mock_repo.get_pulls.return_value = mock_prs
        mock_github.get_repo.return_value = mock_repo

        prs = client.list_prs("owner", "repo", limit=3)

        assert len(prs) == 3

    def test_list_prs_converts_to_pr_data(self, client, mock_github):
        """Test that PR objects are converted to PRData."""
        mock_repo = MagicMock()
        mock_pr = create_mock_pr(
            number=456,
            title="Feature PR",
            head_ref="feature/awesome",
            base_ref="develop",
            additions=100,
            deletions=50,
            labels=["feature", "ready"],
        )
        mock_repo.get_pulls.return_value = [mock_pr]
        mock_github.get_repo.return_value = mock_repo

        prs = client.list_prs("owner", "repo")

        assert isinstance(prs[0], PRData)
        assert prs[0].number == 456
        assert prs[0].head_ref == "feature/awesome"
        assert prs[0].base_ref == "develop"
        assert prs[0].additions == 100
        assert prs[0].deletions == 50
        assert prs[0].labels == ["feature", "ready"]


class TestGetPR:
    """Tests for GitHubClient.get_pr()."""

    def test_get_pr_returns_pr_data(self, client, mock_github):
        """Test get_pr returns correct PRData."""
        mock_repo = MagicMock()
        mock_pr = create_mock_pr(number=789, title="Important PR")
        mock_repo.get_pull.return_value = mock_pr
        mock_github.get_repo.return_value = mock_repo

        result = client.get_pr("owner", "repo", 789)

        assert isinstance(result, PRData)
        assert result.number == 789
        assert result.title == "Important PR"
        mock_repo.get_pull.assert_called_once_with(789)


class TestIssueMutations:
    """Tests for issue mutation methods."""

    def test_add_comment(self, client, mock_github):
        """Test adding a comment to an issue."""
        mock_repo = MagicMock()
        mock_issue = MagicMock()
        mock_comment = MagicMock()
        mock_comment.id = 12345

        mock_repo.get_issue.return_value = mock_issue
        mock_issue.create_comment.return_value = mock_comment
        mock_github.get_repo.return_value = mock_repo

        result = client.add_comment("owner", "repo", 42, "Great work!")

        assert result == 12345
        mock_issue.create_comment.assert_called_once_with("Great work!")

    def test_add_labels(self, client, mock_github):
        """Test adding labels to an issue."""
        mock_repo = MagicMock()
        mock_issue = MagicMock()

        mock_repo.get_issue.return_value = mock_issue
        mock_github.get_repo.return_value = mock_repo

        client.add_labels("owner", "repo", 42, ["bug", "priority"])

        mock_issue.add_to_labels.assert_called_once_with("bug", "priority")

    def test_close_issue(self, client, mock_github):
        """Test closing an issue."""
        mock_repo = MagicMock()
        mock_issue = MagicMock()

        mock_repo.get_issue.return_value = mock_issue
        mock_github.get_repo.return_value = mock_repo

        client.close_issue("owner", "repo", 42)

        mock_issue.edit.assert_called_once_with(state="closed")

    def test_reopen_issue(self, client, mock_github):
        """Test reopening an issue."""
        mock_repo = MagicMock()
        mock_issue = MagicMock()

        mock_repo.get_issue.return_value = mock_issue
        mock_github.get_repo.return_value = mock_repo

        client.reopen_issue("owner", "repo", 42)

        mock_issue.edit.assert_called_once_with(state="open")

    def test_create_issue(self, client, mock_github):
        """Test creating a new issue."""
        mock_repo = MagicMock()
        mock_issue = create_mock_issue(number=999, title="New Issue")

        mock_repo.create_issue.return_value = mock_issue
        mock_github.get_repo.return_value = mock_repo

        result = client.create_issue(
            "owner",
            "repo",
            title="New Issue",
            body="Issue description",
            labels=["bug"],
            assignees=["developer1"],
        )

        assert isinstance(result, IssueData)
        assert result.number == 999
        mock_repo.create_issue.assert_called_once_with(
            title="New Issue",
            body="Issue description",
            labels=["bug"],
            assignees=["developer1"],
        )

    def test_create_issue_default_labels_and_assignees(self, client, mock_github):
        """Test creating issue with default empty labels and assignees."""
        mock_repo = MagicMock()
        mock_issue = create_mock_issue()

        mock_repo.create_issue.return_value = mock_issue
        mock_github.get_repo.return_value = mock_repo

        client.create_issue("owner", "repo", title="Basic Issue", body="Body")

        mock_repo.create_issue.assert_called_once_with(
            title="Basic Issue",
            body="Body",
            labels=[],
            assignees=[],
        )


class TestHelperMethods:
    """Tests for helper methods."""

    def test_get_assignable_users(self, client, mock_github):
        """Test getting assignable users."""
        mock_repo = MagicMock()
        mock_users = []
        for name in ["user1", "user2", "user3"]:
            mock_user = MagicMock()
            mock_user.login = name
            mock_users.append(mock_user)

        mock_repo.get_assignees.return_value = mock_users
        mock_github.get_repo.return_value = mock_repo

        result = client.get_assignable_users("owner", "repo")

        assert result == ["user1", "user2", "user3"]

    def test_get_assignable_users_respects_limit(self, client, mock_github):
        """Test that get_assignable_users respects the limit."""
        mock_repo = MagicMock()
        mock_users = []
        for i in range(10):
            mock_user = MagicMock()
            mock_user.login = f"user{i}"
            mock_users.append(mock_user)

        mock_repo.get_assignees.return_value = mock_users
        mock_github.get_repo.return_value = mock_repo

        result = client.get_assignable_users("owner", "repo", limit=3)

        assert len(result) == 3

    def test_get_available_labels(self, client, mock_github):
        """Test getting available labels."""
        mock_repo = MagicMock()
        mock_labels = []

        for name, color, desc in [
            ("bug", "d73a4a", "Something isn't working"),
            ("enhancement", "a2eeef", "New feature"),
            ("documentation", "0075ca", None),
        ]:
            mock_label = MagicMock()
            mock_label.name = name
            mock_label.color = color
            mock_label.description = desc
            mock_labels.append(mock_label)

        mock_repo.get_labels.return_value = mock_labels
        mock_github.get_repo.return_value = mock_repo

        result = client.get_available_labels("owner", "repo")

        assert len(result) == 3
        assert result[0] == {
            "name": "bug",
            "color": "d73a4a",
            "description": "Something isn't working",
        }
        assert result[2]["description"] is None


class TestEdgeCases:
    """Tests for edge cases and special scenarios."""

    def test_issue_with_null_body(self, client, mock_github):
        """Test handling issue with null body."""
        mock_issue = create_mock_issue(body=None)
        mock_issue.body = None  # Explicitly set to None

        mock_results = MagicMock()
        mock_results.totalCount = 1
        mock_results.__iter__ = lambda self: iter([mock_issue])
        mock_github.search_issues.return_value = mock_results

        issues, _ = client.list_issues("owner", "repo")

        assert issues[0].body == ""

    def test_pr_with_null_body(self, client, mock_github):
        """Test handling PR with null body."""
        mock_repo = MagicMock()
        mock_pr = create_mock_pr()
        mock_pr.body = None

        mock_repo.get_pulls.return_value = [mock_pr]
        mock_github.get_repo.return_value = mock_repo

        prs = client.list_prs("owner", "repo")

        assert prs[0].body == ""

    def test_issue_with_null_user(self, client, mock_github):
        """Test handling issue with null user (deleted account)."""
        mock_issue = create_mock_issue()
        mock_issue.user = None

        mock_results = MagicMock()
        mock_results.totalCount = 1
        mock_results.__iter__ = lambda self: iter([mock_issue])
        mock_github.search_issues.return_value = mock_results

        issues, _ = client.list_issues("owner", "repo")

        assert issues[0].author == "unknown"

    def test_pr_with_null_user(self, client, mock_github):
        """Test handling PR with null user."""
        mock_repo = MagicMock()
        mock_pr = create_mock_pr()
        mock_pr.user = None

        mock_repo.get_pulls.return_value = [mock_pr]
        mock_github.get_repo.return_value = mock_repo

        prs = client.list_prs("owner", "repo")

        assert prs[0].author == "unknown"

    def test_empty_issue_list(self, client, mock_github):
        """Test handling empty issue search results."""
        mock_results = MagicMock()
        mock_results.totalCount = 0
        mock_results.__iter__ = lambda self: iter([])
        mock_github.search_issues.return_value = mock_results

        issues, total = client.list_issues("owner", "repo")

        assert issues == []
        assert total == 0

    def test_empty_pr_list(self, client, mock_github):
        """Test handling empty PR list."""
        mock_repo = MagicMock()
        mock_repo.get_pulls.return_value = []
        mock_github.get_repo.return_value = mock_repo

        prs = client.list_prs("owner", "repo")

        assert prs == []

    def test_issue_with_empty_labels(self, client, mock_github):
        """Test handling issue with no labels."""
        mock_issue = create_mock_issue(labels=[])

        mock_results = MagicMock()
        mock_results.totalCount = 1
        mock_results.__iter__ = lambda self: iter([mock_issue])
        mock_github.search_issues.return_value = mock_results

        issues, _ = client.list_issues("owner", "repo")

        assert issues[0].labels == []

    def test_comment_with_empty_body(self, client, mock_github):
        """Test handling comment with empty body."""
        mock_repo = MagicMock()
        mock_issue = create_mock_issue()

        mock_comment = MagicMock()
        mock_comment.id = 1
        mock_comment.body = None
        mock_comment.created_at = datetime(2024, 1, 15, 11, 0, 0)
        mock_user = MagicMock()
        mock_user.login = "commenter"
        mock_comment.user = mock_user

        mock_issue.get_comments.return_value = [mock_comment]
        mock_repo.get_issue.return_value = mock_issue
        mock_github.get_repo.return_value = mock_repo

        result = client.get_issue("owner", "repo", 42)

        assert result.comments[0].body == ""
