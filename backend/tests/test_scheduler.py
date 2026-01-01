"""
Tests for the scheduler service.

Tests cover:
- parse_filter_query function for GitHub-style filter parsing
- get_command_template function for template lookup
- build_prompt_from_template function for variable substitution
- calculate_next_run function for cron expression parsing
- SchedulerService._get_prs method (especially the tuple unpacking fix)
- SchedulerService._get_issues method
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, AsyncMock

from app.services.scheduler import (
    parse_filter_query,
    build_prompt_from_template,
    calculate_next_run,
)


class TestParseFilterQuery:
    """Tests for parse_filter_query function."""

    def test_returns_defaults_for_none(self):
        """Returns default FilterParams when filter_query is None."""
        result = parse_filter_query(None)
        assert result["state"] == "open"
        assert result["labels"] == []
        assert result["exclude_labels"] == []

    def test_returns_defaults_for_empty_string(self):
        """Returns default FilterParams when filter_query is empty string."""
        result = parse_filter_query("")
        assert result["state"] == "open"
        assert result["labels"] == []
        assert result["exclude_labels"] == []

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
        """Handles whitespace-only filter query - returns default FilterParams."""
        result = parse_filter_query("   ")
        # Should return default FilterParams (same as None/empty string)
        assert result["state"] == "open"
        assert result["labels"] == []
        assert result["exclude_labels"] == []

    def test_handles_extra_whitespace(self):
        """Handles extra whitespace between filters."""
        result = parse_filter_query("state:open    label:bug")
        assert result["state"] == "open"
        assert result["labels"] == ["bug"]

    def test_handles_empty_label_value(self):
        """Handles empty label value gracefully - skips empty labels."""
        result = parse_filter_query("label:")
        # Empty label should be skipped to avoid GitHub API issues
        assert result["labels"] == []

    def test_handles_empty_state_value(self):
        """Handles empty state value gracefully - keeps default state."""
        result = parse_filter_query("state:")
        # Empty state value should keep the default "open"
        assert result["state"] == "open"

    def test_handles_empty_exclude_label_value(self):
        """Handles empty exclude label value gracefully - skips empty labels."""
        result = parse_filter_query("-label:")
        # Empty exclude label should be skipped
        assert result["exclude_labels"] == []

    def test_handles_mixed_empty_and_valid_labels(self):
        """Handles mix of empty and valid labels - only keeps valid ones."""
        result = parse_filter_query("label:bug,,feature")
        # Empty labels between commas should be skipped
        assert result["labels"] == ["bug", "feature"]

    def test_handles_trailing_comma_in_labels(self):
        """Handles trailing comma in labels - skips resulting empty label."""
        result = parse_filter_query("label:bug,")
        assert result["labels"] == ["bug"]

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

    # ==============================================
    # Sidecar metadata filter tests
    # ==============================================

    def test_parses_priority_filter(self):
        """Parses priority filter correctly."""
        result = parse_filter_query("priority:high")
        assert result["priority"] == ["high"]

    def test_parses_priority_multiple_values(self):
        """Parses comma-separated priority values."""
        result = parse_filter_query("priority:high,critical")
        assert "high" in result["priority"]
        assert "critical" in result["priority"]

    def test_parses_priority_exclude(self):
        """Parses -priority exclude filter."""
        result = parse_filter_query("-priority:low")
        assert result["exclude_priority"] == ["low"]

    def test_parses_difficulty_filter(self):
        """Parses difficulty filter correctly."""
        result = parse_filter_query("difficulty:easy,medium")
        assert "easy" in result["difficulty"]
        assert "medium" in result["difficulty"]

    def test_parses_difficulty_exclude(self):
        """Parses -difficulty exclude filter."""
        result = parse_filter_query("-difficulty:complex")
        assert result["exclude_difficulty"] == ["complex"]

    def test_parses_risk_filter(self):
        """Parses risk filter correctly."""
        result = parse_filter_query("risk:low,medium")
        assert "low" in result["risk"]
        assert "medium" in result["risk"]

    def test_parses_risk_exclude(self):
        """Parses -risk exclude filter."""
        result = parse_filter_query("-risk:high")
        assert result["exclude_risk"] == ["high"]

    def test_parses_type_filter(self):
        """Parses type filter correctly."""
        result = parse_filter_query("type:bug,feature")
        assert "bug" in result["type"]
        assert "feature" in result["type"]

    def test_parses_type_exclude(self):
        """Parses -type exclude filter."""
        result = parse_filter_query("-type:docs")
        assert result["exclude_type"] == ["docs"]

    def test_parses_sidecar_status_filter(self):
        """Parses sidecar-status filter correctly."""
        result = parse_filter_query("sidecar-status:open,in_progress")
        assert "open" in result["sidecar_status"]
        assert "in_progress" in result["sidecar_status"]

    def test_parses_sidecar_status_exclude(self):
        """Parses -sidecar-status exclude filter."""
        result = parse_filter_query("-sidecar-status:completed")
        assert result["exclude_sidecar_status"] == ["completed"]

    def test_parses_affected_area_filter(self):
        """Parses affected-area filter correctly."""
        result = parse_filter_query("affected-area:backend,frontend")
        assert "backend" in result["affected_areas"]
        assert "frontend" in result["affected_areas"]

    def test_parses_affected_area_exclude(self):
        """Parses -affected-area exclude filter."""
        result = parse_filter_query("-affected-area:docs")
        assert result["exclude_affected_areas"] == ["docs"]

    def test_parses_combined_github_and_sidecar_filters(self):
        """Parses combined GitHub and sidecar filters."""
        result = parse_filter_query("state:open label:bug priority:high -type:docs")
        assert result["state"] == "open"
        assert result["labels"] == ["bug"]
        assert result["priority"] == ["high"]
        assert result["exclude_type"] == ["docs"]

    def test_sidecar_filters_default_to_empty_lists(self):
        """All sidecar filters default to empty lists."""
        result = parse_filter_query(None)
        assert result["priority"] == []
        assert result["exclude_priority"] == []
        assert result["difficulty"] == []
        assert result["exclude_difficulty"] == []
        assert result["risk"] == []
        assert result["exclude_risk"] == []
        assert result["type"] == []
        assert result["exclude_type"] == []
        assert result["sidecar_status"] == []
        assert result["exclude_sidecar_status"] == []
        assert result["affected_areas"] == []
        assert result["exclude_affected_areas"] == []


class TestHasSidecarFilters:
    """Tests for has_sidecar_filters function."""

    def test_returns_false_for_empty_filters(self):
        """Returns False when no sidecar filters are set."""
        from app.services.scheduler import has_sidecar_filters
        filters = parse_filter_query(None)
        assert has_sidecar_filters(filters) is False

    def test_returns_false_for_github_only_filters(self):
        """Returns False when only GitHub filters are set."""
        from app.services.scheduler import has_sidecar_filters
        filters = parse_filter_query("state:open label:bug -label:wontfix")
        assert has_sidecar_filters(filters) is False

    def test_returns_true_for_priority_filter(self):
        """Returns True when priority filter is set."""
        from app.services.scheduler import has_sidecar_filters
        filters = parse_filter_query("priority:high")
        assert has_sidecar_filters(filters) is True

    def test_returns_true_for_difficulty_filter(self):
        """Returns True when difficulty filter is set."""
        from app.services.scheduler import has_sidecar_filters
        filters = parse_filter_query("difficulty:easy")
        assert has_sidecar_filters(filters) is True

    def test_returns_true_for_exclude_sidecar_filter(self):
        """Returns True when an exclude sidecar filter is set."""
        from app.services.scheduler import has_sidecar_filters
        filters = parse_filter_query("-type:docs")
        assert has_sidecar_filters(filters) is True


class TestFilterIssuesBySidecar:
    """Tests for filter_issues_by_sidecar function."""

    def test_returns_all_issues_when_no_sidecar_filters(self):
        """Returns all issues when no sidecar filters are active."""
        from app.services.scheduler import filter_issues_by_sidecar
        filters = parse_filter_query("state:open label:bug")
        issues = [{"number": 1}, {"number": 2}, {"number": 3}]
        result = filter_issues_by_sidecar(issues, filters, "encoded_path")
        assert result == issues

    def test_excludes_issues_without_sidecar_when_filters_active(self):
        """Excludes issues without sidecar data when sidecar filters are active."""
        from app.services.scheduler import filter_issues_by_sidecar
        filters = parse_filter_query("priority:high")
        issues = [{"number": 1}, {"number": 2}]

        with patch("app.services.scheduler.get_issue_metadata", return_value=None):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        assert result == []

    def test_filters_by_priority_include(self):
        """Filters issues by priority include filter."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("priority:high,critical")
        issues = [{"number": 1}, {"number": 2}, {"number": 3}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, priority="high"),
                2: IssueMetadata(issue_number=2, priority="low"),
                3: IssueMetadata(issue_number=3, priority="critical"),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        assert len(result) == 2
        assert result[0]["number"] == 1
        assert result[1]["number"] == 3

    def test_filters_by_priority_exclude(self):
        """Filters issues by priority exclude filter."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("-priority:low")
        issues = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, priority="high"),
                2: IssueMetadata(issue_number=2, priority="low"),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_type(self):
        """Filters issues by type filter."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("type:bug")
        issues = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, type="bug"),
                2: IssueMetadata(issue_number=2, type="feature"),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_affected_areas(self):
        """Filters issues by affected areas (OR logic - any match)."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("affected-area:backend")
        issues = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, affected_areas=["backend", "api"]),
                2: IssueMetadata(issue_number=2, affected_areas=["frontend"]),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_multiple_sidecar_properties(self):
        """Filters issues by multiple sidecar properties (AND logic)."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("priority:high type:bug")
        issues = [{"number": 1}, {"number": 2}, {"number": 3}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, priority="high", type="bug"),
                2: IssueMetadata(issue_number=2, priority="high", type="feature"),
                3: IssueMetadata(issue_number=3, priority="low", type="bug"),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_sidecar_status(self):
        """Filters issues by sidecar status filter."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("sidecar-status:open,in_progress")
        issues = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, status="open"),
                2: IssueMetadata(issue_number=2, status="completed"),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1


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


class TestCalculateNextRun:
    """Tests for calculate_next_run function."""

    # ==============================================
    # Basic functionality tests
    # ==============================================

    def test_calculates_next_minute(self):
        """Calculates next run for every-minute cron expression."""
        # Cron expression: every minute
        next_run = calculate_next_run("* * * * *", "UTC")

        # Should be within 60 seconds of now
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        delta = (next_run - now).total_seconds()
        assert 0 <= delta <= 60

    def test_calculates_next_hour(self):
        """Calculates next run for hourly cron expression."""
        # Cron expression: every hour at minute 0
        next_run = calculate_next_run("0 * * * *", "UTC")

        # Should be at minute 0
        assert next_run.minute == 0
        assert next_run.second == 0

    def test_calculates_daily_at_9am(self):
        """Calculates next run for daily 9am cron expression."""
        # Cron expression: every day at 9:00 AM
        next_run = calculate_next_run("0 9 * * *", "UTC")

        # Should be at 9:00
        assert next_run.hour == 9
        assert next_run.minute == 0

    def test_calculates_weekly(self):
        """Calculates next run for weekly cron expression."""
        # Cron expression: every Monday at 9:00 AM
        next_run = calculate_next_run("0 9 * * 1", "UTC")

        # Should be on a Monday (weekday 0)
        assert next_run.weekday() == 0
        assert next_run.hour == 9
        assert next_run.minute == 0

    def test_calculates_monthly(self):
        """Calculates next run for monthly cron expression."""
        # Cron expression: first day of month at midnight
        next_run = calculate_next_run("0 0 1 * *", "UTC")

        # Should be on day 1
        assert next_run.day == 1
        assert next_run.hour == 0
        assert next_run.minute == 0

    # ==============================================
    # Timezone handling tests
    # ==============================================

    def test_handles_us_eastern_timezone(self):
        """Handles US Eastern timezone correctly."""
        next_run = calculate_next_run("0 9 * * *", "America/New_York")

        # Result should be naive UTC datetime
        assert next_run.tzinfo is None
        # Should be a valid datetime
        assert isinstance(next_run, datetime)

    def test_handles_us_pacific_timezone(self):
        """Handles US Pacific timezone correctly."""
        next_run = calculate_next_run("0 9 * * *", "America/Los_Angeles")

        assert next_run.tzinfo is None
        assert isinstance(next_run, datetime)

    def test_handles_europe_london_timezone(self):
        """Handles Europe/London timezone correctly."""
        next_run = calculate_next_run("0 9 * * *", "Europe/London")

        assert next_run.tzinfo is None
        assert isinstance(next_run, datetime)

    def test_handles_asia_tokyo_timezone(self):
        """Handles Asia/Tokyo timezone correctly."""
        next_run = calculate_next_run("0 9 * * *", "Asia/Tokyo")

        assert next_run.tzinfo is None
        assert isinstance(next_run, datetime)

    def test_unknown_timezone_falls_back_to_utc(self):
        """Falls back to UTC for unknown timezone."""
        # Should not raise exception, should use UTC
        next_run = calculate_next_run("0 9 * * *", "Invalid/Timezone")

        assert next_run.tzinfo is None
        assert isinstance(next_run, datetime)

    def test_empty_timezone_falls_back_to_utc(self):
        """Falls back to UTC for empty timezone string."""
        # pytz.timezone("") raises UnknownTimeZoneError
        next_run = calculate_next_run("0 9 * * *", "")

        assert next_run.tzinfo is None
        assert isinstance(next_run, datetime)

    # ==============================================
    # Cron expression edge cases
    # ==============================================

    def test_handles_step_values(self):
        """Handles step values in cron expression."""
        # Every 5 minutes
        next_run = calculate_next_run("*/5 * * * *", "UTC")

        # Minutes should be divisible by 5
        assert next_run.minute % 5 == 0

    def test_handles_range_values(self):
        """Handles range values in cron expression."""
        # Every minute between 9:00 and 10:00
        next_run = calculate_next_run("* 9-10 * * *", "UTC")

        assert isinstance(next_run, datetime)

    def test_handles_list_values(self):
        """Handles list values in cron expression."""
        # At minute 0 and 30
        next_run = calculate_next_run("0,30 * * * *", "UTC")

        assert next_run.minute in (0, 30)

    def test_handles_day_of_week_names(self):
        """Handles day-of-week names in cron expression."""
        # Every Monday (both numeric 1 and MON should work via croniter)
        next_run = calculate_next_run("0 9 * * MON", "UTC")

        assert next_run.weekday() == 0  # Monday

    def test_handles_month_names(self):
        """Handles month names in cron expression."""
        # First of January at midnight
        next_run = calculate_next_run("0 0 1 JAN *", "UTC")

        assert next_run.month == 1
        assert next_run.day == 1

    # ==============================================
    # Return value tests
    # ==============================================

    def test_returns_naive_datetime(self):
        """Returns naive datetime (no timezone info) for database storage."""
        next_run = calculate_next_run("0 9 * * *", "America/New_York")

        # Must be naive for SQLite storage
        assert next_run.tzinfo is None

    def test_returns_utc_time(self):
        """Returns time converted to UTC."""
        # 9 AM in New York should be 14:00 UTC (in EST, ignoring DST)
        # We can't easily verify the exact time without mocking, but we can
        # verify the time is consistent when converted back
        next_run_utc = calculate_next_run("0 9 * * *", "UTC")
        next_run_et = calculate_next_run("0 9 * * *", "America/New_York")

        # ET is behind UTC, so 9 AM ET should be later in UTC terms
        # (unless the UTC run happens first due to timing)
        assert isinstance(next_run_utc, datetime)
        assert isinstance(next_run_et, datetime)

    def test_next_run_is_in_future(self):
        """Next run time is always in the future."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        next_run = calculate_next_run("* * * * *", "UTC")

        # Should be in the future or at the exact same minute
        # (croniter returns next occurrence, not current)
        assert next_run >= now

    # ==============================================
    # Multiple consecutive runs tests
    # ==============================================

    def test_consecutive_runs_are_ordered(self):
        """Consecutive next run calculations are chronologically ordered."""
        from croniter import croniter
        import pytz

        tz = pytz.UTC
        now = datetime.now(tz)
        cron = croniter("*/15 * * * *", now)

        runs = []
        for _ in range(5):
            runs.append(cron.get_next(datetime))

        # Each run should be after the previous one
        for i in range(1, len(runs)):
            assert runs[i] > runs[i - 1]

    # ==============================================
    # Special cron expressions
    # ==============================================

    def test_handles_midnight_expression(self):
        """Handles midnight (0 0 * * *) expression."""
        next_run = calculate_next_run("0 0 * * *", "UTC")

        assert next_run.hour == 0
        assert next_run.minute == 0

    def test_handles_noon_expression(self):
        """Handles noon (0 12 * * *) expression."""
        next_run = calculate_next_run("0 12 * * *", "UTC")

        assert next_run.hour == 12
        assert next_run.minute == 0

    def test_handles_end_of_day_expression(self):
        """Handles end of day (59 23 * * *) expression."""
        next_run = calculate_next_run("59 23 * * *", "UTC")

        assert next_run.hour == 23
        assert next_run.minute == 59

    def test_handles_weekday_only_expression(self):
        """Handles weekday-only (Mon-Fri) expression."""
        # Every weekday at 9 AM
        next_run = calculate_next_run("0 9 * * 1-5", "UTC")

        # Should be Mon-Fri (weekday 0-4)
        assert next_run.weekday() < 5

    def test_handles_weekend_only_expression(self):
        """Handles weekend-only (Sat-Sun) expression."""
        # Every weekend at 9 AM
        next_run = calculate_next_run("0 9 * * 0,6", "UTC")

        # Should be Sat or Sun (weekday 5-6)
        assert next_run.weekday() >= 5

    # ==============================================
    # DST transition tests (conceptual)
    # ==============================================

    def test_handles_timezone_with_dst(self):
        """Handles timezone that has DST transitions."""
        # America/New_York has DST
        next_run = calculate_next_run("0 2 * * *", "America/New_York")

        # Should not raise exception even around DST transition times
        assert isinstance(next_run, datetime)
        assert next_run.tzinfo is None


class TestSchedulerServiceInit:
    """Tests for SchedulerService initialization."""

    def test_init_creates_empty_running_jobs(self):
        """Init creates an empty running jobs set."""
        from app.services.scheduler import SchedulerService
        scheduler = SchedulerService()
        assert scheduler._running_jobs == set()

    def test_init_creates_running_jobs_lock(self):
        """Init creates an asyncio Lock for thread safety."""
        import asyncio
        from app.services.scheduler import SchedulerService
        scheduler = SchedulerService()
        assert isinstance(scheduler._running_jobs_lock, asyncio.Lock)

    def test_init_sets_check_interval(self):
        """Init sets default check interval to 60 seconds."""
        from app.services.scheduler import SchedulerService
        scheduler = SchedulerService()
        assert scheduler._check_interval == 60

    def test_init_not_running(self):
        """Init sets running flag to False."""
        from app.services.scheduler import SchedulerService
        scheduler = SchedulerService()
        assert scheduler._running is False
        assert scheduler._task is None


class TestSchedulerServiceRunningJobsLock:
    """Tests for SchedulerService running jobs lock behavior."""

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    @pytest.mark.asyncio
    async def test_execute_job_safe_removes_job_under_lock(self, scheduler):
        """_execute_job_safe removes job ID from _running_jobs under lock."""
        # Add a job ID to the running jobs set
        scheduler._running_jobs.add(123)

        # Mock _execute_job to do nothing
        async def mock_execute_job(job_id, repo):
            pass

        scheduler._execute_job = mock_execute_job

        # Execute the safe wrapper
        await scheduler._execute_job_safe(123, {"local_path": "/test"})

        # Job should be removed from running jobs
        assert 123 not in scheduler._running_jobs

    @pytest.mark.asyncio
    async def test_execute_job_safe_removes_job_on_exception(self, scheduler):
        """_execute_job_safe removes job ID even when _execute_job raises."""
        # Add a job ID to the running jobs set
        scheduler._running_jobs.add(456)

        # Mock _execute_job to raise an exception
        async def mock_execute_job(job_id, repo):
            raise RuntimeError("Job failed!")

        scheduler._execute_job = mock_execute_job

        # Execute the safe wrapper - should not raise
        await scheduler._execute_job_safe(456, {"local_path": "/test"})

        # Job should still be removed from running jobs
        assert 456 not in scheduler._running_jobs

    @pytest.mark.asyncio
    async def test_concurrent_job_removal(self, scheduler):
        """Multiple concurrent jobs can be removed without race conditions."""
        import asyncio

        # Add multiple job IDs
        job_ids = list(range(100, 110))
        for job_id in job_ids:
            scheduler._running_jobs.add(job_id)

        # Mock _execute_job to do nothing
        async def mock_execute_job(job_id, repo):
            await asyncio.sleep(0.01)  # Small delay to encourage interleaving

        scheduler._execute_job = mock_execute_job

        # Run all jobs concurrently
        await asyncio.gather(*[
            scheduler._execute_job_safe(job_id, {"local_path": "/test"})
            for job_id in job_ids
        ])

        # All jobs should be removed
        assert scheduler._running_jobs == set()


class TestSchedulerServiceTriggerJob:
    """Tests for SchedulerService.trigger_job method."""

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    @pytest.mark.asyncio
    async def test_trigger_job_returns_already_running(self, scheduler):
        """trigger_job returns 'already_running' if job is in _running_jobs."""
        # Add the job to running jobs
        scheduler._running_jobs.add(42)

        run, error = await scheduler.trigger_job(42, 1)

        assert run is None
        assert error == "already_running"

    @pytest.mark.asyncio
    async def test_trigger_job_returns_none_for_missing_repo(self, scheduler):
        """trigger_job returns (None, None) if repo doesn't exist."""
        with patch("app.services.scheduler.get_repo_by_id", return_value=None):
            run, error = await scheduler.trigger_job(42, 999)

        assert run is None
        assert error is None

    @pytest.mark.asyncio
    async def test_trigger_job_returns_none_for_missing_job(self, scheduler):
        """trigger_job returns (None, None) if job doesn't exist."""
        mock_repo = {"id": 1, "local_path": "/test/path"}

        with patch("app.services.scheduler.get_repo_by_id", return_value=mock_repo):
            with patch("app.services.scheduler.get_repo_db") as mock_db_ctx:
                # Create a mock async context manager
                mock_db = AsyncMock()
                mock_db.__aenter__ = AsyncMock(return_value=mock_db)
                mock_db.__aexit__ = AsyncMock(return_value=None)
                mock_db_ctx.return_value = mock_db

                # Mock the database query to return None
                mock_result = MagicMock()
                mock_result.scalar_one_or_none.return_value = None
                mock_db.execute = AsyncMock(return_value=mock_result)

                run, error = await scheduler.trigger_job(42, 1)

        assert run is None
        assert error is None

    @pytest.mark.asyncio
    async def test_trigger_job_adds_job_to_running_under_lock(self, scheduler):
        """trigger_job adds job ID to _running_jobs under lock."""
        mock_repo = {"id": 1, "local_path": "/test/path"}
        mock_job = MagicMock()
        mock_job.id = 42
        mock_job.repo_id = 1

        with patch("app.services.scheduler.get_repo_by_id", return_value=mock_repo):
            with patch("app.services.scheduler.get_repo_db") as mock_db_ctx:
                mock_db = AsyncMock()
                mock_db.__aenter__ = AsyncMock(return_value=mock_db)
                mock_db.__aexit__ = AsyncMock(return_value=None)
                mock_db_ctx.return_value = mock_db

                mock_result = MagicMock()
                mock_result.scalar_one_or_none.return_value = mock_job
                mock_db.execute = AsyncMock(return_value=mock_result)

                # Mock _execute_job_safe so it doesn't actually run
                scheduler._execute_job_safe = AsyncMock()

                run, error = await scheduler.trigger_job(42, 1)

        # Job should be in running jobs
        assert 42 in scheduler._running_jobs
        assert error is None
        assert run is not None

    @pytest.mark.asyncio
    async def test_trigger_job_concurrent_calls_only_one_runs(self, scheduler):
        """Concurrent trigger_job calls for same job only run once."""
        import asyncio

        mock_repo = {"id": 1, "local_path": "/test/path"}
        mock_job = MagicMock()
        mock_job.id = 42
        mock_job.repo_id = 1

        trigger_count = 0

        async def mock_execute_job_safe(job_id, repo):
            nonlocal trigger_count
            trigger_count += 1
            await asyncio.sleep(0.1)  # Simulate job execution

        scheduler._execute_job_safe = mock_execute_job_safe

        with patch("app.services.scheduler.get_repo_by_id", return_value=mock_repo):
            with patch("app.services.scheduler.get_repo_db") as mock_db_ctx:
                mock_db = AsyncMock()
                mock_db.__aenter__ = AsyncMock(return_value=mock_db)
                mock_db.__aexit__ = AsyncMock(return_value=None)
                mock_db_ctx.return_value = mock_db

                mock_result = MagicMock()
                mock_result.scalar_one_or_none.return_value = mock_job
                mock_db.execute = AsyncMock(return_value=mock_result)

                # Trigger the same job multiple times concurrently
                results = await asyncio.gather(
                    scheduler.trigger_job(42, 1),
                    scheduler.trigger_job(42, 1),
                    scheduler.trigger_job(42, 1),
                )

        # Only one should have been triggered successfully
        successful_runs = [r for r, e in results if r is not None]
        already_running = [e for r, e in results if e == "already_running"]

        assert len(successful_runs) == 1
        assert len(already_running) == 2


class TestSchedulerServiceCheckRepoJobs:
    """Tests for SchedulerService._check_repo_jobs method."""

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    @pytest.mark.asyncio
    async def test_check_repo_jobs_skips_running_jobs(self, scheduler):
        """_check_repo_jobs skips jobs that are already running."""
        # Add job 42 to running jobs
        scheduler._running_jobs.add(42)

        mock_job = MagicMock()
        mock_job.id = 42

        mock_repo = {"id": 1, "local_path": "/test/path"}
        now = datetime.now()

        with patch("app.services.scheduler.get_repo_db") as mock_db_ctx:
            mock_db = AsyncMock()
            mock_db.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db.__aexit__ = AsyncMock(return_value=None)
            mock_db_ctx.return_value = mock_db

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [mock_job]
            mock_db.execute = AsyncMock(return_value=mock_result)

            # Mock _execute_job_safe to track if it's called
            scheduler._execute_job_safe = AsyncMock()

            await scheduler._check_repo_jobs(mock_repo, now)

        # Should not have tried to execute the running job
        scheduler._execute_job_safe.assert_not_called()

    @pytest.mark.asyncio
    async def test_check_repo_jobs_adds_job_to_running_under_lock(self, scheduler):
        """_check_repo_jobs adds job ID to _running_jobs under lock."""
        mock_job = MagicMock()
        mock_job.id = 99

        mock_repo = {"id": 1, "local_path": "/test/path"}
        now = datetime.now()

        with patch("app.services.scheduler.get_repo_db") as mock_db_ctx:
            mock_db = AsyncMock()
            mock_db.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db.__aexit__ = AsyncMock(return_value=None)
            mock_db_ctx.return_value = mock_db

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [mock_job]
            mock_db.execute = AsyncMock(return_value=mock_result)

            scheduler._execute_job_safe = AsyncMock()

            await scheduler._check_repo_jobs(mock_repo, now)

        # Job should be in running jobs
        assert 99 in scheduler._running_jobs
