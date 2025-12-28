"""
Tests for the scheduler service.

Tests cover:
- parse_filter_query function for GitHub-style filter parsing
- get_command_template function for template lookup
- build_prompt_from_template function for variable substitution
- SchedulerService._get_prs method (especially the tuple unpacking fix)
- SchedulerService._get_issues method
"""

import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock

from app.services.scheduler import (
    parse_filter_query,
    build_prompt_from_template,
)


class TestParseFilterQuery:
    """Tests for parse_filter_query function."""

    def test_returns_empty_dict_for_none(self):
        """Returns empty dict when filter_query is None."""
        result = parse_filter_query(None)
        assert result == {}

    def test_returns_empty_dict_for_empty_string(self):
        """Returns empty dict when filter_query is empty string."""
        result = parse_filter_query("")
        assert result == {}

    def test_parses_state_filter(self):
        """Parses state:open filter correctly."""
        result = parse_filter_query("state:open")
        assert result["state"] == "open"

    def test_parses_state_closed(self):
        """Parses state:closed filter correctly."""
        result = parse_filter_query("state:closed")
        assert result["state"] == "closed"

    def test_parses_single_label(self):
        """Parses single label filter correctly."""
        result = parse_filter_query("label:bug")
        assert result["labels"] == ["bug"]

    def test_parses_multiple_labels_comma_separated(self):
        """Parses comma-separated labels correctly."""
        result = parse_filter_query("label:bug,enhancement")
        assert result["labels"] == ["bug", "enhancement"]

    def test_parses_multiple_label_filters(self):
        """Parses multiple separate label filters."""
        result = parse_filter_query("label:bug label:feature")
        assert "bug" in result["labels"]
        assert "feature" in result["labels"]

    def test_parses_exclude_label(self):
        """Parses -label: exclude filter correctly."""
        result = parse_filter_query("-label:wontfix")
        assert result["exclude_labels"] == ["wontfix"]

    def test_parses_exclude_multiple_labels(self):
        """Parses multiple exclude labels correctly."""
        result = parse_filter_query("-label:wontfix,duplicate")
        assert "wontfix" in result["exclude_labels"]
        assert "duplicate" in result["exclude_labels"]

    def test_parses_combined_filters(self):
        """Parses combined state, label, and exclude filters."""
        result = parse_filter_query("state:open label:bug -label:wontfix")
        assert result["state"] == "open"
        assert result["labels"] == ["bug"]
        assert result["exclude_labels"] == ["wontfix"]

    def test_default_state_is_open(self):
        """Default state is open when no filter provided."""
        result = parse_filter_query("label:bug")
        assert result["state"] == "open"

    def test_ignores_unknown_filters(self):
        """Ignores unknown filter types."""
        result = parse_filter_query("unknown:value label:bug")
        assert result["labels"] == ["bug"]
        assert "unknown" not in result

    def test_handles_whitespace_only(self):
        """Handles whitespace-only filter query."""
        result = parse_filter_query("   ")
        # Should return empty dict or dict with defaults, not crash
        assert isinstance(result, dict)

    def test_handles_extra_whitespace(self):
        """Handles extra whitespace between filters."""
        result = parse_filter_query("state:open    label:bug")
        assert result["state"] == "open"
        assert result["labels"] == ["bug"]

    def test_handles_empty_label_value(self):
        """Handles empty label value gracefully."""
        result = parse_filter_query("label:")
        # Empty label should be added (even if it's empty string)
        assert result["labels"] == [""]

    def test_handles_empty_state_value(self):
        """Handles empty state value gracefully."""
        result = parse_filter_query("state:")
        # Empty state value
        assert result["state"] == ""

    def test_multiple_exclude_label_filters(self):
        """Handles multiple separate -label filters."""
        result = parse_filter_query("-label:wontfix -label:duplicate")
        assert "wontfix" in result["exclude_labels"]
        assert "duplicate" in result["exclude_labels"]

    def test_mixed_include_and_exclude_labels(self):
        """Handles both include and exclude labels together."""
        result = parse_filter_query("label:bug,feature -label:wontfix")
        assert "bug" in result["labels"]
        assert "feature" in result["labels"]
        assert "wontfix" in result["exclude_labels"]


class TestBuildPromptFromTemplate:
    """Tests for build_prompt_from_template function."""

    def test_replaces_single_placeholder(self):
        """Replaces a single placeholder correctly."""
        template = "Review issue #{{number}}"
        context = {"number": 42}
        result = build_prompt_from_template(template, context)
        assert result == "Review issue #42"

    def test_replaces_multiple_placeholders(self):
        """Replaces multiple placeholders correctly."""
        template = "Issue {{number}}: {{title}}"
        context = {"number": 42, "title": "Bug fix"}
        result = build_prompt_from_template(template, context)
        assert result == "Issue 42: Bug fix"

    def test_replaces_same_placeholder_multiple_times(self):
        """Replaces the same placeholder appearing multiple times."""
        template = "{{name}} said hello to {{name}}"
        context = {"name": "Alice"}
        result = build_prompt_from_template(template, context)
        assert result == "Alice said hello to Alice"

    def test_handles_none_value(self):
        """Handles None values by replacing with empty string."""
        template = "Body: {{body}}"
        context = {"body": None}
        result = build_prompt_from_template(template, context)
        assert result == "Body: "

    def test_handles_missing_placeholder(self):
        """Leaves placeholder unchanged if not in context."""
        template = "Issue #{{number}} by {{author}}"
        context = {"number": 42}
        result = build_prompt_from_template(template, context)
        assert result == "Issue #42 by {{author}}"

    def test_handles_empty_context(self):
        """Leaves all placeholders unchanged with empty context."""
        template = "{{foo}} {{bar}}"
        context = {}
        result = build_prompt_from_template(template, context)
        assert result == "{{foo}} {{bar}}"

    def test_converts_non_string_values(self):
        """Converts non-string values to strings."""
        template = "Count: {{count}}, Active: {{active}}"
        context = {"count": 123, "active": True}
        result = build_prompt_from_template(template, context)
        assert result == "Count: 123, Active: True"


class TestSchedulerServiceGetPrs:
    """Tests for SchedulerService._get_prs method."""

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    @pytest.fixture
    def mock_job(self):
        """Create a mock ScheduledJob."""
        job = MagicMock()
        job.filter_query = "state:open"
        return job

    @pytest.fixture
    def mock_repo(self):
        """Create a mock repo dict."""
        return {
            "id": 1,
            "owner": "testowner",
            "name": "testrepo",
            "local_path": "/path/to/repo",
        }

    @pytest.mark.asyncio
    async def test_get_prs_unpacks_tuple_correctly(self, scheduler, mock_job, mock_repo):
        """Verifies _get_prs correctly unpacks the (prs, total) tuple from list_prs."""
        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_pr = MagicMock()
            mock_pr.number = 123
            mock_pr.title = "Test PR"
            mock_pr.body = "PR body"
            mock_pr.head_ref = "feature/test"
            mock_pr.base_ref = "main"
            # list_prs returns a tuple of (prs_list, total_count)
            mock_client.list_prs.return_value = ([mock_pr], 1)

            result = await scheduler._get_prs(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["type"] == "pr"
            assert result[0]["number"] == 123
            assert result[0]["title"] == "Test PR"
            assert result[0]["body"] == "PR body"
            assert result[0]["head_ref"] == "feature/test"
            assert result[0]["base_ref"] == "main"

    @pytest.mark.asyncio
    async def test_get_prs_handles_empty_result(self, scheduler, mock_job, mock_repo):
        """Handles empty PR list correctly."""
        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.list_prs.return_value = ([], 0)

            result = await scheduler._get_prs(mock_job, mock_repo)

            assert result == []

    @pytest.mark.asyncio
    async def test_get_prs_uses_filter_state(self, scheduler, mock_job, mock_repo):
        """Uses state from filter query."""
        mock_job.filter_query = "state:closed"

        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.list_prs.return_value = ([], 0)

            await scheduler._get_prs(mock_job, mock_repo)

            mock_client.list_prs.assert_called_once_with(
                owner="testowner",
                name="testrepo",
                state="closed",
            )

    @pytest.mark.asyncio
    async def test_get_prs_default_state_is_open(self, scheduler, mock_job, mock_repo):
        """Uses default state of 'open' when not specified."""
        mock_job.filter_query = None

        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.list_prs.return_value = ([], 0)

            await scheduler._get_prs(mock_job, mock_repo)

            mock_client.list_prs.assert_called_once_with(
                owner="testowner",
                name="testrepo",
                state="open",
            )

    @pytest.mark.asyncio
    async def test_get_prs_multiple_prs(self, scheduler, mock_job, mock_repo):
        """Handles multiple PRs correctly."""
        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_prs = []
            for i in range(3):
                mock_pr = MagicMock()
                mock_pr.number = i + 1
                mock_pr.title = f"PR {i + 1}"
                mock_pr.body = f"Body {i + 1}"
                mock_pr.head_ref = f"feature/{i + 1}"
                mock_pr.base_ref = "main"
                mock_prs.append(mock_pr)
            mock_client.list_prs.return_value = (mock_prs, 3)

            result = await scheduler._get_prs(mock_job, mock_repo)

            assert len(result) == 3
            assert result[0]["number"] == 1
            assert result[1]["number"] == 2
            assert result[2]["number"] == 3


class TestSchedulerServiceGetIssues:
    """Tests for SchedulerService._get_issues method."""

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    @pytest.fixture
    def mock_job(self):
        """Create a mock ScheduledJob."""
        job = MagicMock()
        job.filter_query = "state:open label:bug"
        return job

    @pytest.fixture
    def mock_repo(self):
        """Create a mock repo dict."""
        return {
            "id": 1,
            "owner": "testowner",
            "name": "testrepo",
            "local_path": "/path/to/repo",
        }

    @pytest.mark.asyncio
    async def test_get_issues_returns_formatted_list(self, scheduler, mock_job, mock_repo):
        """Returns properly formatted issue list."""
        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_issue = MagicMock()
            mock_issue.number = 42
            mock_issue.title = "Test Issue"
            mock_issue.body = "Issue body"
            mock_issue.labels = ["bug"]
            mock_client.list_issues.return_value = ([mock_issue], 1)

            result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["type"] == "issue"
            assert result[0]["number"] == 42
            assert result[0]["title"] == "Test Issue"
            assert result[0]["body"] == "Issue body"

    @pytest.mark.asyncio
    async def test_get_issues_filters_by_labels(self, scheduler, mock_job, mock_repo):
        """Passes labels to list_issues."""
        mock_job.filter_query = "label:bug,feature"

        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.list_issues.return_value = ([], 0)

            await scheduler._get_issues(mock_job, mock_repo)

            call_kwargs = mock_client.list_issues.call_args[1]
            assert "bug" in call_kwargs["labels"]
            assert "feature" in call_kwargs["labels"]

    @pytest.mark.asyncio
    async def test_get_issues_excludes_labels(self, scheduler, mock_job, mock_repo):
        """Filters out issues with excluded labels."""
        mock_job.filter_query = "-label:wontfix"

        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            # Return two issues, one with excluded label
            issue1 = MagicMock()
            issue1.number = 1
            issue1.title = "Keep"
            issue1.body = "body"
            issue1.labels = ["bug"]

            issue2 = MagicMock()
            issue2.number = 2
            issue2.title = "Exclude"
            issue2.body = "body"
            issue2.labels = ["wontfix"]

            mock_client.list_issues.return_value = ([issue1, issue2], 2)

            result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["number"] == 1
            assert result[0]["title"] == "Keep"


class TestSchedulerServiceGetTargetItems:
    """Tests for SchedulerService._get_target_items method."""

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    @pytest.fixture
    def mock_repo(self):
        """Create a mock repo dict."""
        return {
            "id": 1,
            "owner": "testowner",
            "name": "testrepo",
            "local_path": "/path/to/repo",
        }

    @pytest.mark.asyncio
    async def test_get_target_items_issues(self, scheduler, mock_repo):
        """Returns issues when target_type is 'issues'."""
        mock_job = MagicMock()
        mock_job.target_type = "issues"
        mock_job.filter_query = None

        with patch.object(scheduler, "_get_issues", new_callable=AsyncMock) as mock_get_issues:
            mock_get_issues.return_value = [{"type": "issue", "number": 1}]

            result = await scheduler._get_target_items(mock_job, mock_repo)

            mock_get_issues.assert_called_once_with(mock_job, mock_repo)
            assert result == [{"type": "issue", "number": 1}]

    @pytest.mark.asyncio
    async def test_get_target_items_prs(self, scheduler, mock_repo):
        """Returns PRs when target_type is 'prs'."""
        mock_job = MagicMock()
        mock_job.target_type = "prs"
        mock_job.filter_query = None

        with patch.object(scheduler, "_get_prs", new_callable=AsyncMock) as mock_get_prs:
            mock_get_prs.return_value = [{"type": "pr", "number": 1}]

            result = await scheduler._get_target_items(mock_job, mock_repo)

            mock_get_prs.assert_called_once_with(mock_job, mock_repo)
            assert result == [{"type": "pr", "number": 1}]

    @pytest.mark.asyncio
    async def test_get_target_items_codebase(self, scheduler, mock_repo):
        """Returns codebase item when target_type is 'codebase'."""
        mock_job = MagicMock()
        mock_job.target_type = "codebase"

        result = await scheduler._get_target_items(mock_job, mock_repo)

        assert result == [{"type": "codebase"}]

    @pytest.mark.asyncio
    async def test_get_target_items_custom(self, scheduler, mock_repo):
        """Returns custom item when target_type is 'custom'."""
        mock_job = MagicMock()
        mock_job.target_type = "custom"

        result = await scheduler._get_target_items(mock_job, mock_repo)

        assert result == [{"type": "custom"}]

    @pytest.mark.asyncio
    async def test_get_target_items_unknown_type(self, scheduler, mock_repo):
        """Returns empty list for unknown target_type."""
        mock_job = MagicMock()
        mock_job.target_type = "unknown"

        result = await scheduler._get_target_items(mock_job, mock_repo)

        assert result == []
