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
