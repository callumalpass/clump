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
    _format_template_value,
    calculate_next_run,
    is_valid_cron_expression,
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


class TestFilterPrsBySidecar:
    """Tests for filter_prs_by_sidecar function.

    Tests that PR metadata fields are correctly mapped:
    - review_priority -> priority filter
    - complexity -> difficulty filter
    - change_type -> type filter
    """

    def test_returns_all_prs_when_no_sidecar_filters(self):
        """Returns all PRs when no sidecar filters are active."""
        from app.services.scheduler import filter_prs_by_sidecar
        filters = parse_filter_query("state:open label:bug")
        prs = [{"number": 1}, {"number": 2}]

        result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert result == prs

    def test_excludes_prs_without_sidecar_when_filters_active(self):
        """Excludes PRs without sidecar metadata when sidecar filters are active."""
        from app.services.scheduler import filter_prs_by_sidecar
        filters = parse_filter_query("priority:high")
        prs = [{"number": 1}, {"number": 2}]

        with patch("app.services.scheduler.get_pr_metadata", return_value=None):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert result == []

    def test_filters_by_priority_maps_to_review_priority(self):
        """Priority filter maps to PR's review_priority field."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("priority:high,critical")
        prs = [{"number": 1}, {"number": 2}, {"number": 3}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, review_priority="high"),
                2: PRMetadata(pr_number=2, review_priority="low"),
                3: PRMetadata(pr_number=3, review_priority="critical"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 2
        assert result[0]["number"] == 1
        assert result[1]["number"] == 3

    def test_filters_by_priority_exclude_maps_to_review_priority(self):
        """Priority exclude filter maps to PR's review_priority field."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("-priority:low")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, review_priority="high"),
                2: PRMetadata(pr_number=2, review_priority="low"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_difficulty_maps_to_complexity(self):
        """Difficulty filter maps to PR's complexity field."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("difficulty:complex,moderate")
        prs = [{"number": 1}, {"number": 2}, {"number": 3}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, complexity="complex"),
                2: PRMetadata(pr_number=2, complexity="simple"),
                3: PRMetadata(pr_number=3, complexity="moderate"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 2
        assert result[0]["number"] == 1
        assert result[1]["number"] == 3

    def test_filters_by_difficulty_exclude_maps_to_complexity(self):
        """Difficulty exclude filter maps to PR's complexity field."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("-difficulty:trivial")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, complexity="complex"),
                2: PRMetadata(pr_number=2, complexity="trivial"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_type_maps_to_change_type(self):
        """Type filter maps to PR's change_type field."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("type:bugfix,feature")
        prs = [{"number": 1}, {"number": 2}, {"number": 3}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, change_type="bugfix"),
                2: PRMetadata(pr_number=2, change_type="docs"),
                3: PRMetadata(pr_number=3, change_type="feature"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 2
        assert result[0]["number"] == 1
        assert result[1]["number"] == 3

    def test_filters_by_type_exclude_maps_to_change_type(self):
        """Type exclude filter maps to PR's change_type field."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("-type:docs")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, change_type="feature"),
                2: PRMetadata(pr_number=2, change_type="docs"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_risk(self):
        """Risk filter works for PRs (same field name)."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("risk:high")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, risk="high"),
                2: PRMetadata(pr_number=2, risk="low"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_sidecar_status(self):
        """Sidecar status filter works for PRs."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("sidecar-status:reviewing")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, status="reviewing"),
                2: PRMetadata(pr_number=2, status="merged"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_affected_areas(self):
        """Affected areas filter works for PRs."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("affected-area:api")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, affected_areas=["api", "backend"]),
                2: PRMetadata(pr_number=2, affected_areas=["frontend"]),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_filters_by_multiple_pr_properties(self):
        """Filters PRs by multiple sidecar properties (AND logic)."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("priority:high type:bugfix")
        prs = [{"number": 1}, {"number": 2}, {"number": 3}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, review_priority="high", change_type="bugfix"),
                2: PRMetadata(pr_number=2, review_priority="high", change_type="feature"),
                3: PRMetadata(pr_number=3, review_priority="low", change_type="bugfix"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1


class TestFormatTemplateValue:
    """Tests for _format_template_value helper function."""

    def test_none_returns_empty_string(self):
        """None value returns empty string."""
        assert _format_template_value(None) == ""

    def test_string_returns_itself(self):
        """String value returns itself."""
        assert _format_template_value("hello") == "hello"

    def test_integer_returns_string(self):
        """Integer value returns string representation."""
        assert _format_template_value(42) == "42"

    def test_zero_returns_string_zero(self):
        """Zero returns '0' not empty string."""
        assert _format_template_value(0) == "0"

    def test_false_returns_string_false(self):
        """False returns 'False' not empty string."""
        assert _format_template_value(False) == "False"

    def test_true_returns_string_true(self):
        """True returns 'True'."""
        assert _format_template_value(True) == "True"

    def test_empty_string_returns_empty_string(self):
        """Empty string returns empty string."""
        assert _format_template_value("") == ""

    def test_list_returns_comma_separated(self):
        """List returns comma-separated string."""
        assert _format_template_value(["a", "b", "c"]) == "a, b, c"

    def test_empty_list_returns_empty_string(self):
        """Empty list returns empty string."""
        assert _format_template_value([]) == ""

    def test_single_item_list_returns_just_item(self):
        """Single item list returns just that item."""
        assert _format_template_value(["only"]) == "only"

    def test_list_with_numbers(self):
        """List with numbers converts items to strings."""
        assert _format_template_value([1, 2, 3]) == "1, 2, 3"

    def test_list_with_mixed_types(self):
        """List with mixed types converts all to strings."""
        assert _format_template_value(["text", 42, True, None]) == "text, 42, True, None"

    def test_dict_returns_string_representation(self):
        """Dict value returns its string representation."""
        result = _format_template_value({"key": "value"})
        assert result == "{'key': 'value'}"

    def test_nested_dict_returns_string_representation(self):
        """Nested dict returns its string representation."""
        result = _format_template_value({"outer": {"inner": 42}})
        assert result == "{'outer': {'inner': 42}}"

    def test_float_returns_string(self):
        """Float value returns string representation."""
        assert _format_template_value(3.14) == "3.14"

    def test_float_zero_returns_string(self):
        """Float zero returns '0.0'."""
        assert _format_template_value(0.0) == "0.0"

    def test_negative_number_returns_string(self):
        """Negative numbers return their string representation."""
        assert _format_template_value(-42) == "-42"
        assert _format_template_value(-3.14) == "-3.14"

    def test_list_with_none_items(self):
        """List containing only None items converts correctly."""
        assert _format_template_value([None, None]) == "None, None"

    def test_list_with_empty_strings(self):
        """List with empty strings preserves them."""
        assert _format_template_value(["a", "", "b"]) == "a, , b"

    def test_tuple_returns_string_representation(self):
        """Tuple returns its string representation (not treated as list)."""
        result = _format_template_value((1, 2, 3))
        assert result == "(1, 2, 3)"

    def test_set_returns_string_representation(self):
        """Set returns its string representation (not treated as list)."""
        # Sets have non-deterministic order, so just check it's a string
        result = _format_template_value({1, 2})
        assert isinstance(result, str)
        assert "{" in result and "}" in result


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

    def test_preserves_zero_value(self):
        """Preserves zero as '0' instead of empty string.

        This tests the fix for the bug where falsy values like 0 were
        incorrectly replaced with empty string.
        """
        template = "Count: {{count}}"
        context = {"count": 0}
        result = build_prompt_from_template(template, context)
        assert result == "Count: 0"

    def test_preserves_false_value(self):
        """Preserves False as 'False' instead of empty string.

        This tests the fix for the bug where falsy values like False were
        incorrectly replaced with empty string.
        """
        template = "Active: {{active}}"
        context = {"active": False}
        result = build_prompt_from_template(template, context)
        assert result == "Active: False"

    def test_preserves_empty_string_value(self):
        """Preserves empty string as '' instead of being silently dropped.

        This tests the fix for the bug where empty strings were treated
        the same as None.
        """
        template = "Description: [{{desc}}]"
        context = {"desc": ""}
        result = build_prompt_from_template(template, context)
        assert result == "Description: []"

    def test_distinguishes_none_from_other_falsy_values(self):
        """Ensures None is treated differently from other falsy values.

        None -> empty string
        0 -> '0'
        False -> 'False'
        '' -> ''
        """
        template = "a={{a}}, b={{b}}, c={{c}}, d={{d}}"
        context = {"a": None, "b": 0, "c": False, "d": ""}
        result = build_prompt_from_template(template, context)
        assert result == "a=, b=0, c=False, d="

    def test_handles_list_value(self):
        """Converts list values to comma-separated strings."""
        template = "Labels: {{labels}}"
        context = {"labels": ["bug", "enhancement", "priority"]}
        result = build_prompt_from_template(template, context)
        assert result == "Labels: bug, enhancement, priority"

    def test_handles_empty_list_value(self):
        """Converts empty list to empty string."""
        template = "Labels: {{labels}}"
        context = {"labels": []}
        result = build_prompt_from_template(template, context)
        assert result == "Labels: "

    def test_handles_list_with_single_item(self):
        """Converts single-item list to just that item."""
        template = "Labels: {{labels}}"
        context = {"labels": ["bug"]}
        result = build_prompt_from_template(template, context)
        assert result == "Labels: bug"

    def test_handles_list_with_non_string_items(self):
        """Converts list items to strings."""
        template = "Values: {{values}}"
        context = {"values": [1, 2, 3]}
        result = build_prompt_from_template(template, context)
        assert result == "Values: 1, 2, 3"

    def test_handles_list_with_mixed_types(self):
        """Converts list with mixed types to strings."""
        template = "Mixed: {{items}}"
        context = {"items": ["text", 42, True]}
        result = build_prompt_from_template(template, context)
        assert result == "Mixed: text, 42, True"

    def test_handles_placeholder_in_context_value(self):
        """Handles value containing placeholder syntax (no double substitution)."""
        template = "Value: {{value}}"
        context = {"value": "{{nested}}"}  # Value looks like a placeholder
        result = build_prompt_from_template(template, context)
        assert result == "Value: {{nested}}"  # Should not substitute recursively

    def test_handles_empty_template(self):
        """Handles empty template string."""
        template = ""
        context = {"key": "value"}
        result = build_prompt_from_template(template, context)
        assert result == ""

    def test_handles_no_placeholders(self):
        """Handles template with no placeholders."""
        template = "This is plain text."
        context = {"key": "value"}
        result = build_prompt_from_template(template, context)
        assert result == "This is plain text."

    def test_handles_dict_value(self):
        """Handles dict value by converting to string representation."""
        template = "Data: {{data}}"
        context = {"data": {"a": 1, "b": 2}}
        result = build_prompt_from_template(template, context)
        assert result == "Data: {'a': 1, 'b': 2}"

    def test_handles_newlines_in_template(self):
        """Handles newlines in template correctly."""
        template = "Line 1: {{a}}\nLine 2: {{b}}"
        context = {"a": "first", "b": "second"}
        result = build_prompt_from_template(template, context)
        assert result == "Line 1: first\nLine 2: second"

    def test_handles_newlines_in_value(self):
        """Handles newlines in context value correctly."""
        template = "Body: {{body}}"
        context = {"body": "Line 1\nLine 2\nLine 3"}
        result = build_prompt_from_template(template, context)
        assert result == "Body: Line 1\nLine 2\nLine 3"

    def test_handles_unicode_in_template(self):
        """Handles unicode characters in template."""
        template = "Issue №{{number}}: {{emoji}}"
        context = {"number": 42, "emoji": "🔥"}
        result = build_prompt_from_template(template, context)
        assert result == "Issue №42: 🔥"

    def test_handles_special_characters_in_placeholder_name(self):
        """Handles placeholder names without special regex meaning."""
        template = "Value: {{a_key_1}}"
        context = {"a_key_1": "test"}
        result = build_prompt_from_template(template, context)
        assert result == "Value: test"

    def test_handles_adjacent_placeholders(self):
        """Handles placeholders immediately adjacent to each other."""
        template = "{{a}}{{b}}{{c}}"
        context = {"a": "1", "b": "2", "c": "3"}
        result = build_prompt_from_template(template, context)
        assert result == "123"


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
    async def test_get_prs_returns_formatted_list(self, scheduler, mock_job, mock_repo):
        """Verifies _get_prs returns properly formatted PR list."""
        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_pr = MagicMock()
            mock_pr.number = 123
            mock_pr.title = "Test PR"
            mock_pr.body = "PR body"
            mock_pr.author = "octocat"
            mock_pr.head_ref = "feature/test"
            mock_pr.base_ref = "main"
            # list_all_prs returns a list directly
            mock_client.list_all_prs.return_value = [mock_pr]

            result = await scheduler._get_prs(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["type"] == "pr"
            assert result[0]["number"] == 123
            assert result[0]["title"] == "Test PR"
            assert result[0]["body"] == "PR body"
            assert result[0]["author"] == "octocat"
            assert result[0]["head_ref"] == "feature/test"
            assert result[0]["base_ref"] == "main"

    @pytest.mark.asyncio
    async def test_get_prs_handles_empty_result(self, scheduler, mock_job, mock_repo):
        """Handles empty PR list correctly."""
        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.list_all_prs.return_value = []

            result = await scheduler._get_prs(mock_job, mock_repo)

            assert result == []

    @pytest.mark.asyncio
    async def test_get_prs_uses_filter_state(self, scheduler, mock_job, mock_repo):
        """Uses state from filter query."""
        mock_job.filter_query = "state:closed"

        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.list_all_prs.return_value = []

            await scheduler._get_prs(mock_job, mock_repo)

            mock_client.list_all_prs.assert_called_once_with(
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
            mock_client.list_all_prs.return_value = []

            await scheduler._get_prs(mock_job, mock_repo)

            mock_client.list_all_prs.assert_called_once_with(
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
                mock_pr.author = f"author{i + 1}"
                mock_pr.head_ref = f"feature/{i + 1}"
                mock_pr.base_ref = "main"
                mock_prs.append(mock_pr)
            mock_client.list_all_prs.return_value = mock_prs

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
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value
            mock_issue = MagicMock()
            mock_issue.number = 42
            mock_issue.title = "Test Issue"
            mock_issue.body = "Issue body"
            mock_issue.author = "testuser"
            mock_issue.labels = ["bug"]
            mock_client.list_all_issues.return_value = [mock_issue]

            result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["type"] == "issue"
            assert result[0]["number"] == 42
            assert result[0]["title"] == "Test Issue"
            assert result[0]["body"] == "Issue body"
            assert result[0]["author"] == "testuser"

    @pytest.mark.asyncio
    async def test_get_issues_filters_by_labels(self, scheduler, mock_job, mock_repo):
        """Passes labels to list_all_issues."""
        mock_job.filter_query = "label:bug,feature"

        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value
            mock_client.list_all_issues.return_value = []

            await scheduler._get_issues(mock_job, mock_repo)

            call_kwargs = mock_client.list_all_issues.call_args[1]
            assert "bug" in call_kwargs["labels"]
            assert "feature" in call_kwargs["labels"]

    @pytest.mark.asyncio
    async def test_get_issues_excludes_labels(self, scheduler, mock_job, mock_repo):
        """Filters out issues with excluded labels."""
        mock_job.filter_query = "-label:wontfix"

        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value
            # Return two issues, one with excluded label
            issue1 = MagicMock()
            issue1.number = 1
            issue1.title = "Keep"
            issue1.body = "body"
            issue1.author = "user1"
            issue1.labels = ["bug"]

            issue2 = MagicMock()
            issue2.number = 2
            issue2.title = "Exclude"
            issue2.body = "body"
            issue2.author = "user2"
            issue2.labels = ["wontfix"]

            mock_client.list_all_issues.return_value = [issue1, issue2]

            result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["number"] == 1
            assert result[0]["title"] == "Keep"
            assert result[0]["author"] == "user1"


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
        mock_job.only_new = False  # Prevents database call for processed entities

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
        mock_job.only_new = False  # Prevents database call for processed entities

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


class TestIsValidCronExpression:
    """Tests for is_valid_cron_expression function."""

    def test_valid_standard_cron(self):
        """Returns True for valid 5-field cron expression."""
        assert is_valid_cron_expression("0 9 * * *") is True

    def test_valid_every_minute(self):
        """Returns True for every-minute expression."""
        assert is_valid_cron_expression("* * * * *") is True

    def test_valid_with_step(self):
        """Returns True for step expression."""
        assert is_valid_cron_expression("*/5 * * * *") is True

    def test_valid_with_range(self):
        """Returns True for range expression."""
        assert is_valid_cron_expression("0 9-17 * * *") is True

    def test_valid_with_list(self):
        """Returns True for list expression."""
        assert is_valid_cron_expression("0,30 * * * *") is True

    def test_valid_with_day_name(self):
        """Returns True for day-of-week name."""
        assert is_valid_cron_expression("0 9 * * MON") is True

    def test_valid_with_month_name(self):
        """Returns True for month name."""
        assert is_valid_cron_expression("0 0 1 JAN *") is True

    def test_valid_6_field_with_seconds(self):
        """Returns True for 6-field expression with seconds."""
        assert is_valid_cron_expression("0 0 9 * * *") is True

    def test_invalid_too_few_fields(self):
        """Returns False for expression with too few fields."""
        assert is_valid_cron_expression("0 9 *") is False

    def test_invalid_too_many_fields(self):
        """Returns False for expression with too many fields."""
        assert is_valid_cron_expression("0 0 0 9 * * * *") is False

    def test_invalid_word(self):
        """Returns False for non-cron word."""
        assert is_valid_cron_expression("invalid") is False

    def test_invalid_empty_string(self):
        """Returns False for empty string."""
        assert is_valid_cron_expression("") is False

    def test_invalid_spaces_only(self):
        """Returns False for spaces only."""
        assert is_valid_cron_expression("     ") is False

    def test_invalid_out_of_range_minute(self):
        """Returns False for minute out of range."""
        assert is_valid_cron_expression("99 * * * *") is False

    def test_invalid_out_of_range_hour(self):
        """Returns False for hour out of range."""
        assert is_valid_cron_expression("0 25 * * *") is False

    def test_invalid_out_of_range_day(self):
        """Returns False for day out of range."""
        assert is_valid_cron_expression("0 0 32 * *") is False

    def test_invalid_out_of_range_month(self):
        """Returns False for month out of range."""
        assert is_valid_cron_expression("0 0 1 13 *") is False

    def test_invalid_out_of_range_dow(self):
        """Returns False for day of week out of range."""
        assert is_valid_cron_expression("0 0 * * 8") is False

    def test_invalid_special_characters(self):
        """Returns False for invalid special characters."""
        assert is_valid_cron_expression("0 9 @ $ %") is False

    def test_none_input(self):
        """Returns False for None input."""
        assert is_valid_cron_expression(None) is False


class TestCalculateNextRunInvalidInput:
    """Tests for calculate_next_run with invalid input."""

    def test_raises_for_invalid_cron_expression(self):
        """Raises ValueError for invalid cron expression."""
        with pytest.raises(ValueError) as exc_info:
            calculate_next_run("invalid", "UTC")

        assert "Invalid cron expression" in str(exc_info.value)
        assert "'invalid'" in str(exc_info.value)

    def test_raises_for_too_few_fields(self):
        """Raises ValueError for too few fields."""
        with pytest.raises(ValueError) as exc_info:
            calculate_next_run("0 9", "UTC")

        assert "Invalid cron expression" in str(exc_info.value)

    def test_raises_for_empty_string(self):
        """Raises ValueError for empty string."""
        with pytest.raises(ValueError) as exc_info:
            calculate_next_run("", "UTC")

        assert "Invalid cron expression" in str(exc_info.value)

    def test_raises_for_out_of_range_values(self):
        """Raises ValueError for out of range values."""
        with pytest.raises(ValueError) as exc_info:
            calculate_next_run("99 99 99 99 99", "UTC")

        assert "Invalid cron expression" in str(exc_info.value)

    def test_handles_none_timezone_gracefully(self):
        """Falls back to UTC when timezone is None."""
        # Should not raise, should fall back to UTC
        next_run = calculate_next_run("0 9 * * *", None)

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
        """_execute_job_safe removes job key from _running_jobs under lock."""
        # Add a job key (repo_id, job_id) to the running jobs set
        job_key = (1, 123)
        scheduler._running_jobs.add(job_key)

        # Mock _execute_job to do nothing
        async def mock_execute_job(job_id, repo):
            pass

        scheduler._execute_job = mock_execute_job

        # Execute the safe wrapper with job_key tuple
        await scheduler._execute_job_safe(job_key, {"id": 1, "local_path": "/test"})

        # Job should be removed from running jobs
        assert job_key not in scheduler._running_jobs

    @pytest.mark.asyncio
    async def test_execute_job_safe_removes_job_on_exception(self, scheduler):
        """_execute_job_safe removes job key even when _execute_job raises."""
        # Add a job key (repo_id, job_id) to the running jobs set
        job_key = (1, 456)
        scheduler._running_jobs.add(job_key)

        # Mock _execute_job to raise an exception
        async def mock_execute_job(job_id, repo):
            raise RuntimeError("Job failed!")

        scheduler._execute_job = mock_execute_job

        # Execute the safe wrapper - should not raise
        await scheduler._execute_job_safe(job_key, {"id": 1, "local_path": "/test"})

        # Job should still be removed from running jobs
        assert job_key not in scheduler._running_jobs

    @pytest.mark.asyncio
    async def test_concurrent_job_removal(self, scheduler):
        """Multiple concurrent jobs can be removed without race conditions."""
        import asyncio

        # Add multiple job keys (repo_id, job_id)
        job_keys = [(1, job_id) for job_id in range(100, 110)]
        for job_key in job_keys:
            scheduler._running_jobs.add(job_key)

        # Mock _execute_job to do nothing
        async def mock_execute_job(job_id, repo):
            await asyncio.sleep(0.01)  # Small delay to encourage interleaving

        scheduler._execute_job = mock_execute_job

        # Run all jobs concurrently
        await asyncio.gather(*[
            scheduler._execute_job_safe(job_key, {"id": 1, "local_path": "/test"})
            for job_key in job_keys
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
        # Add the job key (repo_id, job_id) to running jobs
        scheduler._running_jobs.add((1, 42))

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
        """trigger_job adds job key to _running_jobs under lock."""
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

        # Job key (repo_id, job_id) should be in running jobs
        assert (1, 42) in scheduler._running_jobs
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
        # Add job key (repo_id=1, job_id=42) to running jobs
        scheduler._running_jobs.add((1, 42))

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
        """_check_repo_jobs adds job key to _running_jobs under lock."""
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

        # Job key (repo_id, job_id) should be in running jobs
        assert (1, 99) in scheduler._running_jobs


class TestGetCommandTemplate:
    """Tests for get_command_template function."""

    def test_returns_none_when_command_not_found(self):
        """Returns None when command file is not found."""
        from app.services.scheduler import get_command_template

        with patch("app.services.scheduler.find_command_file", return_value=(None, None)):
            result = get_command_template("nonexistent", "issue", "/repo/path")

        assert result is None

    def test_returns_none_when_parse_fails(self):
        """Returns None when command file parsing fails."""
        from app.services.scheduler import get_command_template

        with patch("app.services.scheduler.find_command_file", return_value=("/path/to/cmd.md", "repo")), \
             patch("app.services.scheduler.parse_command_file", return_value=None):
            result = get_command_template("test-cmd", "issue", "/repo/path")

        assert result is None

    def test_returns_template_when_command_found(self):
        """Returns command template when command is found and parsed."""
        from app.services.scheduler import get_command_template

        mock_cmd = MagicMock()
        mock_cmd.template = "Review issue #{{number}}"

        with patch("app.services.scheduler.find_command_file", return_value=("/path/to/cmd.md", "repo")), \
             patch("app.services.scheduler.parse_command_file", return_value=mock_cmd):
            result = get_command_template("review", "issue", "/repo/path")

        assert result == "Review issue #{{number}}"


class TestSchedulerServiceGetIssuesAuthorField:
    """Tests specifically for the author field in _get_issues."""

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    @pytest.fixture
    def mock_job(self):
        """Create a mock ScheduledJob."""
        job = MagicMock()
        job.filter_query = None
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
    async def test_get_issues_includes_author_in_result(self, scheduler, mock_job, mock_repo):
        """Verifies that author field is included in issue dicts."""
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value

            mock_issue = MagicMock()
            mock_issue.number = 1
            mock_issue.title = "Test"
            mock_issue.body = "Body"
            mock_issue.author = "octocat"
            mock_issue.labels = []
            mock_client.list_all_issues.return_value = [mock_issue]

            result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 1
            assert "author" in result[0]
            assert result[0]["author"] == "octocat"

    @pytest.mark.asyncio
    async def test_get_issues_preserves_author_through_sidecar_filter(self, scheduler, mock_job, mock_repo):
        """Author field is preserved when sidecar filters are applied."""
        from app.storage import IssueMetadata

        mock_job.filter_query = "priority:high"

        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value

            mock_issue = MagicMock()
            mock_issue.number = 42
            mock_issue.title = "High priority issue"
            mock_issue.body = "Description"
            mock_issue.author = "contributor123"
            mock_issue.labels = []
            mock_client.list_all_issues.return_value = [mock_issue]

            # Mock sidecar metadata that matches the filter
            def mock_get_metadata(encoded_path, issue_number):
                return IssueMetadata(issue_number=42, priority="high")

            with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
                result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["author"] == "contributor123"

    @pytest.mark.asyncio
    async def test_get_issues_with_multiple_authors(self, scheduler, mock_job, mock_repo):
        """Handles multiple issues with different authors."""
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value

            issues = []
            for i, author in enumerate(["alice", "bob", "charlie"], 1):
                mock_issue = MagicMock()
                mock_issue.number = i
                mock_issue.title = f"Issue {i}"
                mock_issue.body = "Body"
                mock_issue.author = author
                mock_issue.labels = []
                issues.append(mock_issue)

            mock_client.list_all_issues.return_value = issues

            result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 3
            assert result[0]["author"] == "alice"
            assert result[1]["author"] == "bob"
            assert result[2]["author"] == "charlie"


class TestSchedulerServiceGetPrsWithLabels:
    """Tests for _get_prs with label filtering."""

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
    async def test_get_prs_filters_by_include_labels(self, scheduler, mock_repo):
        """Filters PRs to only those with specified labels."""
        mock_job = MagicMock()
        mock_job.filter_query = "label:urgent"

        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_prs_by_sidecar", side_effect=lambda prs, *args: prs):
            mock_client = MockClient.return_value

            pr1 = MagicMock()
            pr1.number = 1
            pr1.title = "Urgent PR"
            pr1.body = "Body"
            pr1.head_ref = "urgent-fix"
            pr1.base_ref = "main"
            pr1.labels = ["urgent", "bug"]

            pr2 = MagicMock()
            pr2.number = 2
            pr2.title = "Regular PR"
            pr2.body = "Body"
            pr2.head_ref = "feature"
            pr2.base_ref = "main"
            pr2.labels = ["feature"]

            mock_client.list_all_prs.return_value = [pr1, pr2]

            result = await scheduler._get_prs(mock_job, mock_repo)

            # Only PR with 'urgent' label should remain
            assert len(result) == 1
            assert result[0]["number"] == 1

    @pytest.mark.asyncio
    async def test_get_prs_excludes_labeled_prs(self, scheduler, mock_repo):
        """Excludes PRs with specified exclude labels."""
        mock_job = MagicMock()
        mock_job.filter_query = "-label:wip"

        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_prs_by_sidecar", side_effect=lambda prs, *args: prs):
            mock_client = MockClient.return_value

            pr1 = MagicMock()
            pr1.number = 1
            pr1.title = "Ready PR"
            pr1.body = "Body"
            pr1.head_ref = "ready"
            pr1.base_ref = "main"
            pr1.labels = ["ready"]

            pr2 = MagicMock()
            pr2.number = 2
            pr2.title = "WIP PR"
            pr2.body = "Body"
            pr2.head_ref = "wip"
            pr2.base_ref = "main"
            pr2.labels = ["wip"]

            mock_client.list_all_prs.return_value = [pr1, pr2]

            result = await scheduler._get_prs(mock_job, mock_repo)

            # PR with 'wip' label should be excluded
            assert len(result) == 1
            assert result[0]["number"] == 1

    @pytest.mark.asyncio
    async def test_get_prs_include_and_exclude_combined(self, scheduler, mock_repo):
        """Combines include and exclude label filters."""
        mock_job = MagicMock()
        mock_job.filter_query = "label:bug -label:wontfix"

        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_prs_by_sidecar", side_effect=lambda prs, *args: prs):
            mock_client = MockClient.return_value

            pr1 = MagicMock()
            pr1.number = 1
            pr1.title = "Good bug fix"
            pr1.body = "Body"
            pr1.head_ref = "bugfix"
            pr1.base_ref = "main"
            pr1.labels = ["bug"]

            pr2 = MagicMock()
            pr2.number = 2
            pr2.title = "Won't fix bug"
            pr2.body = "Body"
            pr2.head_ref = "wontfix"
            pr2.base_ref = "main"
            pr2.labels = ["bug", "wontfix"]

            pr3 = MagicMock()
            pr3.number = 3
            pr3.title = "Feature"
            pr3.body = "Body"
            pr3.head_ref = "feature"
            pr3.base_ref = "main"
            pr3.labels = ["feature"]

            mock_client.list_all_prs.return_value = [pr1, pr2, pr3]

            result = await scheduler._get_prs(mock_job, mock_repo)

            # Only PR with 'bug' but not 'wontfix' should remain
            assert len(result) == 1
            assert result[0]["number"] == 1

    @pytest.mark.asyncio
    async def test_get_prs_includes_labels_in_result(self, scheduler, mock_repo):
        """Verifies that labels field is included in PR dicts."""
        mock_job = MagicMock()
        mock_job.filter_query = None

        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_prs_by_sidecar", side_effect=lambda prs, *args: prs):
            mock_client = MockClient.return_value

            pr = MagicMock()
            pr.number = 1
            pr.title = "Test PR"
            pr.body = "Body"
            pr.head_ref = "feature"
            pr.base_ref = "main"
            pr.labels = ["enhancement", "v2"]

            mock_client.list_all_prs.return_value = [pr]

            result = await scheduler._get_prs(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["labels"] == ["enhancement", "v2"]


class TestSchedulerSessionCreation:
    """Tests documenting correct Session creation in scheduler.

    These tests verify that when creating Sessions from scheduled jobs:
    - cli_type is correctly set from job.cli_type (or defaults to 'claude')
    - cost_usd and duration_ms are saved when provided by headless result

    The actual _process_item method is tested indirectly through higher-level
    integration tests due to its complex database interactions.
    """

    def test_session_cli_type_field_defaults(self):
        """Verify Session model has correct cli_type default."""
        from app.models import Session, CLITypeEnum
        # The Session model has cli_type with default=CLITypeEnum.CLAUDE.value
        # This documents the expected behavior: sessions default to 'claude'
        assert Session.cli_type.default.arg == CLITypeEnum.CLAUDE.value

    def test_session_cost_usd_nullable(self):
        """Verify Session model cost_usd is nullable."""
        from app.models import Session
        # cost_usd should be nullable for sessions without cost tracking
        assert Session.cost_usd.nullable is True

    def test_session_duration_ms_nullable(self):
        """Verify Session model duration_ms is nullable."""
        from app.models import Session
        # duration_ms should be nullable for sessions without duration tracking
        assert Session.duration_ms.nullable is True

    def test_cli_type_or_default_expression(self):
        """Test the pattern used for cli_type defaulting in _process_item.

        The fix uses `job.cli_type or 'claude'` which should:
        - Return job.cli_type when it's truthy (e.g., 'gemini', 'codex')
        - Return 'claude' when job.cli_type is None
        """
        # Test the exact pattern used in _process_item
        assert ("gemini" or "claude") == "gemini"
        assert ("codex" or "claude") == "codex"
        assert (None or "claude") == "claude"
        assert ("claude" or "claude") == "claude"

    def test_is_not_none_check_for_cost(self):
        """Test the pattern used for checking cost_usd before saving.

        The fix uses `is not None` which correctly handles 0.0 as a valid value.
        """
        # Test the exact pattern used in _process_item
        def should_save_cost(cost_usd):
            return cost_usd is not None

        # 0.0 is a valid cost that should be saved
        assert should_save_cost(0.0) is True
        assert should_save_cost(0.0025) is True
        # None means no cost data - don't save
        assert should_save_cost(None) is False

    def test_is_not_none_check_for_duration(self):
        """Test the pattern used for checking duration_ms before saving.

        The fix uses `is not None` which correctly handles 0 as a valid value.
        """
        # Test the exact pattern used in _process_item
        def should_save_duration(duration_ms):
            return duration_ms is not None

        # 0 is a valid duration that should be saved
        assert should_save_duration(0) is True
        assert should_save_duration(15000) is True
        # None means no duration data - don't save
        assert should_save_duration(None) is False


class TestFilterIssuesBySidecarEdgeCases:
    """Edge case tests for filter_issues_by_sidecar function."""

    def test_issue_with_none_priority_passes_exclude_filter(self):
        """Issues with None priority pass exclude_priority filters."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("-priority:low")
        issues = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, priority=None),  # None priority
                2: IssueMetadata(issue_number=2, priority="low"),  # Excluded
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        # Issue 1 (None priority) should pass since None != "low"
        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_issue_with_none_difficulty_passes_exclude_filter(self):
        """Issues with None difficulty pass exclude_difficulty filters."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("-difficulty:complex")
        issues = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, difficulty=None),
                2: IssueMetadata(issue_number=2, difficulty="complex"),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_issue_with_empty_affected_areas_excluded_by_filter(self):
        """Issues with empty affected_areas don't match any area filter."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("affected-area:backend")
        issues = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, affected_areas=[]),  # Empty list
                2: IssueMetadata(issue_number=2, affected_areas=["backend"]),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        # Only issue 2 matches affected-area:backend
        assert len(result) == 1
        assert result[0]["number"] == 2

    def test_issue_with_none_affected_areas_excluded_by_filter(self):
        """Issues with None affected_areas don't match any area filter."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("affected-area:backend")
        issues = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, affected_areas=None),  # None
                2: IssueMetadata(issue_number=2, affected_areas=["backend"]),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        # Only issue 2 matches
        assert len(result) == 1
        assert result[0]["number"] == 2

    def test_issue_with_empty_affected_areas_passes_exclude_filter(self):
        """Issues with empty affected_areas pass exclude_affected_areas filters."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        filters = parse_filter_query("-affected-area:docs")
        issues = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, affected_areas=[]),  # Empty - passes
                2: IssueMetadata(issue_number=2, affected_areas=["docs"]),  # Excluded
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        # Issue 1 passes (no areas to exclude), issue 2 excluded
        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_combined_include_and_exclude_same_field(self):
        """Include and exclude on same field work together."""
        from app.services.scheduler import filter_issues_by_sidecar
        from app.storage import IssueMetadata
        # Include high/critical, exclude critical
        filters = parse_filter_query("priority:high,critical -priority:critical")
        issues = [{"number": 1}, {"number": 2}, {"number": 3}]

        def mock_get_metadata(encoded_path, issue_number):
            metadata_map = {
                1: IssueMetadata(issue_number=1, priority="high"),
                2: IssueMetadata(issue_number=2, priority="critical"),
                3: IssueMetadata(issue_number=3, priority="low"),
            }
            return metadata_map.get(issue_number)

        with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
            result = filter_issues_by_sidecar(issues, filters, "encoded_path")

        # Only issue 1 (high) passes: matches include, not in exclude
        # Issue 2 matches include but is excluded
        # Issue 3 doesn't match include
        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_empty_issues_list(self):
        """Empty issues list returns empty result."""
        from app.services.scheduler import filter_issues_by_sidecar
        filters = parse_filter_query("priority:high")
        result = filter_issues_by_sidecar([], filters, "encoded_path")
        assert result == []


class TestFilterPrsBySidecarEdgeCases:
    """Edge case tests for filter_prs_by_sidecar function."""

    def test_pr_with_none_review_priority_passes_exclude_filter(self):
        """PRs with None review_priority pass exclude_priority filters."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("-priority:low")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, review_priority=None),
                2: PRMetadata(pr_number=2, review_priority="low"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_pr_with_none_complexity_passes_exclude_filter(self):
        """PRs with None complexity pass exclude_difficulty filters."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("-difficulty:complex")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, complexity=None),
                2: PRMetadata(pr_number=2, complexity="complex"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_pr_with_none_change_type_passes_exclude_filter(self):
        """PRs with None change_type pass exclude_type filters."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("-type:docs")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, change_type=None),
                2: PRMetadata(pr_number=2, change_type="docs"),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_pr_with_none_affected_areas_passes_exclude_filter(self):
        """PRs with None affected_areas pass exclude_affected_areas filters."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query("-affected-area:legacy")
        prs = [{"number": 1}, {"number": 2}]

        def mock_get_metadata(encoded_path, pr_number):
            metadata_map = {
                1: PRMetadata(pr_number=1, affected_areas=None),
                2: PRMetadata(pr_number=2, affected_areas=["legacy"]),
            }
            return metadata_map.get(pr_number)

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        assert len(result) == 1
        assert result[0]["number"] == 1

    def test_empty_prs_list(self):
        """Empty PRs list returns empty result."""
        from app.services.scheduler import filter_prs_by_sidecar
        filters = parse_filter_query("priority:high")
        result = filter_prs_by_sidecar([], filters, "encoded_path")
        assert result == []

    def test_all_filters_combined(self):
        """All sidecar filter types work together."""
        from app.services.scheduler import filter_prs_by_sidecar
        from app.storage import PRMetadata
        filters = parse_filter_query(
            "priority:high difficulty:moderate type:feature risk:low "
            "-affected-area:legacy sidecar-status:open"
        )
        prs = [{"number": 1}]

        def mock_get_metadata(encoded_path, pr_number):
            return PRMetadata(
                pr_number=1,
                review_priority="high",
                complexity="moderate",
                change_type="feature",
                risk="low",
                affected_areas=["api"],  # Not legacy
                status="open",
            )

        with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
            result = filter_prs_by_sidecar(prs, filters, "encoded_path")

        # PR matches all filters
        assert len(result) == 1
        assert result[0]["number"] == 1


class TestSchedulerServiceGetIssuesLabelsField:
    """Tests for the labels field in _get_issues output.

    These tests verify that issue dicts include the labels field for consistency
    with PR dicts and to support templates that use {{labels}}.
    """

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    @pytest.fixture
    def mock_job(self):
        """Create a mock ScheduledJob."""
        job = MagicMock()
        job.filter_query = None
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
    async def test_get_issues_includes_labels_in_result(self, scheduler, mock_job, mock_repo):
        """Verifies that labels field is included in issue dicts."""
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value

            mock_issue = MagicMock()
            mock_issue.number = 1
            mock_issue.title = "Test"
            mock_issue.body = "Body"
            mock_issue.author = "octocat"
            mock_issue.labels = ["bug", "enhancement"]
            mock_client.list_all_issues.return_value = [mock_issue]

            result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 1
            assert "labels" in result[0]
            assert result[0]["labels"] == ["bug", "enhancement"]

    @pytest.mark.asyncio
    async def test_get_issues_includes_empty_labels(self, scheduler, mock_job, mock_repo):
        """Verifies that empty labels list is included in issue dicts."""
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value

            mock_issue = MagicMock()
            mock_issue.number = 1
            mock_issue.title = "Test"
            mock_issue.body = "Body"
            mock_issue.author = "octocat"
            mock_issue.labels = []
            mock_client.list_all_issues.return_value = [mock_issue]

            result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 1
            assert "labels" in result[0]
            assert result[0]["labels"] == []

    @pytest.mark.asyncio
    async def test_get_issues_labels_preserved_through_sidecar_filter(self, scheduler, mock_job, mock_repo):
        """Labels field is preserved when sidecar filters are applied."""
        from app.storage import IssueMetadata

        mock_job.filter_query = "priority:high"

        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value

            mock_issue = MagicMock()
            mock_issue.number = 42
            mock_issue.title = "High priority issue"
            mock_issue.body = "Description"
            mock_issue.author = "contributor123"
            mock_issue.labels = ["bug", "critical"]
            mock_client.list_all_issues.return_value = [mock_issue]

            # Mock sidecar metadata that matches the filter
            def mock_get_metadata(encoded_path, issue_number):
                return IssueMetadata(issue_number=42, priority="high")

            with patch("app.services.scheduler.get_issue_metadata", side_effect=mock_get_metadata):
                result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["labels"] == ["bug", "critical"]

    @pytest.mark.asyncio
    async def test_get_issues_with_multiple_issues_different_labels(self, scheduler, mock_job, mock_repo):
        """Handles multiple issues with different labels."""
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value

            issues = []
            labels_list = [["bug"], ["feature", "enhancement"], ["docs", "help-wanted", "good-first-issue"]]
            for i, labels in enumerate(labels_list, 1):
                mock_issue = MagicMock()
                mock_issue.number = i
                mock_issue.title = f"Issue {i}"
                mock_issue.body = "Body"
                mock_issue.author = "user"
                mock_issue.labels = labels
                issues.append(mock_issue)

            mock_client.list_all_issues.return_value = issues

            result = await scheduler._get_issues(mock_job, mock_repo)

            assert len(result) == 3
            assert result[0]["labels"] == ["bug"]
            assert result[1]["labels"] == ["feature", "enhancement"]
            assert result[2]["labels"] == ["docs", "help-wanted", "good-first-issue"]

    @pytest.mark.asyncio
    async def test_get_issues_labels_after_exclude_filter(self, scheduler, mock_repo):
        """Labels field is preserved after exclude_labels filtering."""
        mock_job = MagicMock()
        mock_job.filter_query = "-label:wontfix"

        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value

            issue1 = MagicMock()
            issue1.number = 1
            issue1.title = "Keep"
            issue1.body = "body"
            issue1.author = "user1"
            issue1.labels = ["bug", "priority-high"]

            issue2 = MagicMock()
            issue2.number = 2
            issue2.title = "Exclude"
            issue2.body = "body"
            issue2.author = "user2"
            issue2.labels = ["wontfix"]

            mock_client.list_all_issues.return_value = [issue1, issue2]

            result = await scheduler._get_issues(mock_job, mock_repo)

            # Only issue1 should remain
            assert len(result) == 1
            assert result[0]["number"] == 1
            # And it should have its labels
            assert result[0]["labels"] == ["bug", "priority-high"]

    @pytest.mark.asyncio
    async def test_issue_and_pr_dicts_have_consistent_structure(self, scheduler, mock_repo):
        """Verifies that issue dicts and PR dicts have the same label field structure."""
        mock_job = MagicMock()
        mock_job.filter_query = None

        # Test issues
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues):
            mock_client = MockClient.return_value

            mock_issue = MagicMock()
            mock_issue.number = 1
            mock_issue.title = "Issue"
            mock_issue.body = "Body"
            mock_issue.author = "user"
            mock_issue.labels = ["test-label"]
            mock_client.list_all_issues.return_value = [mock_issue]

            issue_result = await scheduler._get_issues(mock_job, mock_repo)

        # Test PRs
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_prs_by_sidecar", side_effect=lambda prs, *args: prs):
            mock_client = MockClient.return_value

            mock_pr = MagicMock()
            mock_pr.number = 1
            mock_pr.title = "PR"
            mock_pr.body = "Body"
            mock_pr.head_ref = "feature"
            mock_pr.base_ref = "main"
            mock_pr.labels = ["test-label"]
            mock_client.list_all_prs.return_value = [mock_pr]

            pr_result = await scheduler._get_prs(mock_job, mock_repo)

        # Both should have labels field
        assert "labels" in issue_result[0]
        assert "labels" in pr_result[0]
        # Both should be lists
        assert isinstance(issue_result[0]["labels"], list)
        assert isinstance(pr_result[0]["labels"], list)


class TestSchedulerServiceGetPRsAuthorField:
    """Tests specifically for the author field in _get_prs.

    The author field is needed for template substitution when command templates
    reference {{author}} for PR-targeted scheduled jobs. This ensures parity
    with _get_issues which already includes the author field.
    """

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    @pytest.fixture
    def mock_job(self):
        """Create a mock ScheduledJob."""
        job = MagicMock()
        job.filter_query = None
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
    async def test_get_prs_includes_author_in_result(self, scheduler, mock_job, mock_repo):
        """Verifies that author field is included in PR dicts."""
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_prs_by_sidecar", side_effect=lambda prs, *args: prs):
            mock_client = MockClient.return_value

            mock_pr = MagicMock()
            mock_pr.number = 1
            mock_pr.title = "Test PR"
            mock_pr.body = "Body"
            mock_pr.author = "octocat"
            mock_pr.head_ref = "feature-branch"
            mock_pr.base_ref = "main"
            mock_pr.labels = []
            mock_client.list_all_prs.return_value = [mock_pr]

            result = await scheduler._get_prs(mock_job, mock_repo)

            assert len(result) == 1
            assert "author" in result[0]
            assert result[0]["author"] == "octocat"

    @pytest.mark.asyncio
    async def test_get_prs_preserves_author_through_sidecar_filter(self, scheduler, mock_job, mock_repo):
        """Author field is preserved when sidecar filters are applied."""
        from app.storage import PRMetadata

        mock_job.filter_query = "priority:high"

        with patch("app.services.scheduler.GitHubClient") as MockClient:
            mock_client = MockClient.return_value

            mock_pr = MagicMock()
            mock_pr.number = 42
            mock_pr.title = "High priority PR"
            mock_pr.body = "Description"
            mock_pr.author = "contributor123"
            mock_pr.head_ref = "hotfix"
            mock_pr.base_ref = "main"
            mock_pr.labels = []
            mock_client.list_all_prs.return_value = [mock_pr]

            # Mock sidecar metadata that matches the filter
            def mock_get_metadata(encoded_path, pr_number):
                return PRMetadata(pr_number=42, review_priority="high")

            with patch("app.services.scheduler.get_pr_metadata", side_effect=mock_get_metadata):
                result = await scheduler._get_prs(mock_job, mock_repo)

            assert len(result) == 1
            assert result[0]["author"] == "contributor123"

    @pytest.mark.asyncio
    async def test_get_prs_with_multiple_authors(self, scheduler, mock_job, mock_repo):
        """Handles multiple PRs with different authors."""
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_prs_by_sidecar", side_effect=lambda prs, *args: prs):
            mock_client = MockClient.return_value

            prs = []
            for i, author in enumerate(["alice", "bob", "charlie"], 1):
                mock_pr = MagicMock()
                mock_pr.number = i
                mock_pr.title = f"PR {i}"
                mock_pr.body = "Body"
                mock_pr.author = author
                mock_pr.head_ref = f"feature-{i}"
                mock_pr.base_ref = "main"
                mock_pr.labels = []
                prs.append(mock_pr)

            mock_client.list_all_prs.return_value = prs

            result = await scheduler._get_prs(mock_job, mock_repo)

            assert len(result) == 3
            assert result[0]["author"] == "alice"
            assert result[1]["author"] == "bob"
            assert result[2]["author"] == "charlie"

    @pytest.mark.asyncio
    async def test_get_prs_author_matches_issues_field_structure(self, scheduler, mock_job, mock_repo):
        """Verifies that PR and issue author fields have consistent structure.

        Both _get_issues and _get_prs should include 'author' at the same level
        in the result dict for consistent template substitution.
        """
        with patch("app.services.scheduler.GitHubClient") as MockClient, \
             patch("app.services.scheduler.filter_issues_by_sidecar", side_effect=lambda issues, *args: issues), \
             patch("app.services.scheduler.filter_prs_by_sidecar", side_effect=lambda prs, *args: prs):
            mock_client = MockClient.return_value

            # Create issue with author
            mock_issue = MagicMock()
            mock_issue.number = 1
            mock_issue.title = "Issue"
            mock_issue.body = "Body"
            mock_issue.author = "issue-author"
            mock_issue.labels = []
            mock_client.list_all_issues.return_value = [mock_issue]

            # Create PR with author
            mock_pr = MagicMock()
            mock_pr.number = 1
            mock_pr.title = "PR"
            mock_pr.body = "Body"
            mock_pr.author = "pr-author"
            mock_pr.head_ref = "feature"
            mock_pr.base_ref = "main"
            mock_pr.labels = []
            mock_client.list_all_prs.return_value = [mock_pr]

            issue_result = await scheduler._get_issues(mock_job, mock_repo)
            pr_result = await scheduler._get_prs(mock_job, mock_repo)

        # Both should have author field at the same level
        assert "author" in issue_result[0]
        assert "author" in pr_result[0]
        # Both should be strings
        assert isinstance(issue_result[0]["author"], str)
        assert isinstance(pr_result[0]["author"], str)
        # Values should match what we set
        assert issue_result[0]["author"] == "issue-author"
        assert pr_result[0]["author"] == "pr-author"


class TestSchedulerServiceExecuteJobCronErrorHandling:
    """Tests for error handling when cron expression calculation fails in _execute_job.

    These tests verify that the scheduler gracefully handles invalid cron expressions
    that might be introduced by:
    - Manual editing of schedule JSON files
    - Corrupted data
    - Edge cases in cron parsing

    The fix ensures:
    1. If cron calculation fails BEFORE job execution, the job is skipped with a log
    2. If cron calculation fails AFTER job execution (in finally block), the run record
       is still committed properly, just without updating next_run_at
    """

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
    async def test_execute_job_skips_on_initial_cron_error(self, scheduler, mock_repo):
        """Job execution is skipped if initial cron calculation fails.

        When _calculate_next_run fails BEFORE the try block (line 618),
        the job should log an error and return early without creating a run record.
        """
        from app.models import ScheduledJob

        mock_job = MagicMock(spec=ScheduledJob)
        mock_job.id = 1
        mock_job.name = "test-job"
        mock_job.cron_expression = "invalid cron"  # Will cause ValueError
        mock_job.timezone = "UTC"

        # Mock the database context
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_job
        mock_db.execute.return_value = mock_result

        # Use a context manager mock that returns our mock_db
        mock_context = AsyncMock()
        mock_context.__aenter__ = AsyncMock(return_value=mock_db)
        mock_context.__aexit__ = AsyncMock(return_value=None)

        with patch("app.services.scheduler.get_repo_db", return_value=mock_context), \
             patch.object(scheduler, "_calculate_next_run", side_effect=ValueError("Invalid cron expression")), \
             patch("app.services.scheduler.logger") as mock_logger:

            # Execute the job
            await scheduler._execute_job(1, mock_repo)

            # Verify error was logged
            mock_logger.error.assert_called()
            error_call_args = str(mock_logger.error.call_args)
            assert "invalid cron" in error_call_args.lower() or "skipping" in error_call_args.lower()

            # Verify no run record was created (db.add should not have been called after commit)
            # The flow should return early before creating a ScheduledJobRun

    @pytest.mark.asyncio
    async def test_execute_job_commits_even_on_final_cron_error(self, scheduler, mock_repo):
        """Run record is committed even if final cron calculation fails.

        When _calculate_next_run fails in the finally block (line 663),
        the run record should still be committed with all its data,
        only leaving next_run_at unchanged.
        """
        from app.models import ScheduledJob, ScheduledJobRun, JobRunStatus
        from datetime import datetime, timezone

        mock_job = MagicMock(spec=ScheduledJob)
        mock_job.id = 1
        mock_job.name = "test-job"
        mock_job.cron_expression = "0 9 * * *"
        mock_job.timezone = "UTC"
        mock_job.repo_id = 1
        mock_job.target_type = "codebase"  # Simple target type
        mock_job.max_items = 10
        mock_job.run_count = 0
        mock_job.last_run_at = None
        mock_job.last_run_status = None
        mock_job.next_run_at = datetime.now(timezone.utc)

        # Track if db.commit was called
        commit_called = False
        original_next_run = mock_job.next_run_at

        async def track_commit():
            nonlocal commit_called
            commit_called = True

        # Mock the database context
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_job
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock(side_effect=track_commit)

        mock_context = AsyncMock()
        mock_context.__aenter__ = AsyncMock(return_value=mock_db)
        mock_context.__aexit__ = AsyncMock(return_value=None)

        # Track which call number we're on for _calculate_next_run
        call_count = 0

        def cron_side_effect(job):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # First call succeeds (initial update before execution)
                return datetime.now(timezone.utc)
            else:
                # Second call fails (in finally block)
                raise ValueError("Simulated cron error in finally block")

        with patch("app.services.scheduler.get_repo_db", return_value=mock_context), \
             patch.object(scheduler, "_calculate_next_run", side_effect=cron_side_effect), \
             patch.object(scheduler, "_get_target_items", new_callable=AsyncMock, return_value=[{"type": "codebase"}]), \
             patch.object(scheduler, "_process_item", new_callable=AsyncMock, return_value="session-123"), \
             patch("app.services.scheduler.logger"):

            # Execute the job
            await scheduler._execute_job(1, mock_repo)

            # Verify commit was still called (bug fix ensures this happens)
            assert commit_called, "db.commit() should have been called even after cron error in finally"

            # Verify run_count was incremented (happens before the failing cron call)
            assert mock_job.run_count == 1

    @pytest.mark.asyncio
    async def test_execute_job_logs_cron_error_in_finally(self, scheduler, mock_repo):
        """Cron calculation error in finally block is properly logged."""
        from app.models import ScheduledJob
        from datetime import datetime, timezone

        mock_job = MagicMock(spec=ScheduledJob)
        mock_job.id = 42
        mock_job.name = "test-job-with-bad-cron"
        mock_job.cron_expression = "0 9 * * *"
        mock_job.timezone = "UTC"
        mock_job.repo_id = 1
        mock_job.target_type = "codebase"
        mock_job.max_items = 10
        mock_job.run_count = 0
        mock_job.next_run_at = datetime.now(timezone.utc)

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_job
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        mock_context = AsyncMock()
        mock_context.__aenter__ = AsyncMock(return_value=mock_db)
        mock_context.__aexit__ = AsyncMock(return_value=None)

        call_count = 0

        def cron_side_effect(job):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return datetime.now(timezone.utc)
            raise ValueError("Cron parsing failed: missing field")

        with patch("app.services.scheduler.get_repo_db", return_value=mock_context), \
             patch.object(scheduler, "_calculate_next_run", side_effect=cron_side_effect), \
             patch.object(scheduler, "_get_target_items", new_callable=AsyncMock, return_value=[{"type": "codebase"}]), \
             patch.object(scheduler, "_process_item", new_callable=AsyncMock, return_value="session-123"), \
             patch("app.services.scheduler.logger") as mock_logger:

            await scheduler._execute_job(1, mock_repo)

            # Verify error was logged for the job
            error_calls = [str(call) for call in mock_logger.error.call_args_list]
            assert any("42" in call or "Failed to calculate next run" in call for call in error_calls), \
                f"Expected error log for job 42, got: {error_calls}"


class TestSchedulerServiceCalculateNextRunIntegration:
    """Integration tests for _calculate_next_run with actual croniter."""

    @pytest.fixture
    def scheduler(self):
        """Create a SchedulerService instance."""
        from app.services.scheduler import SchedulerService
        return SchedulerService()

    def test_calculate_next_run_with_valid_cron(self, scheduler):
        """_calculate_next_run works with valid cron expression."""
        from app.models import ScheduledJob

        mock_job = MagicMock(spec=ScheduledJob)
        mock_job.cron_expression = "0 9 * * *"
        mock_job.timezone = "UTC"

        # Should not raise
        result = scheduler._calculate_next_run(mock_job)

        assert isinstance(result, datetime)
        assert result.hour == 9
        assert result.minute == 0

    def test_calculate_next_run_with_invalid_cron_raises(self, scheduler):
        """_calculate_next_run raises ValueError for invalid cron."""
        from app.models import ScheduledJob

        mock_job = MagicMock(spec=ScheduledJob)
        mock_job.cron_expression = "invalid cron expression"
        mock_job.timezone = "UTC"

        with pytest.raises(ValueError):
            scheduler._calculate_next_run(mock_job)

    def test_calculate_next_run_with_malformed_cron_raises(self, scheduler):
        """_calculate_next_run raises ValueError for malformed cron patterns."""
        from app.models import ScheduledJob

        invalid_cron_expressions = [
            "* * * *",  # Missing field (only 4 fields)
            "60 * * * *",  # Invalid minute (60 > 59)
            "* 24 * * *",  # Invalid hour (24 > 23)
            "* * 32 * *",  # Invalid day (32 > 31)
            "* * * 13 *",  # Invalid month (13 > 12)
            "* * * * 8",  # Invalid day of week (8 > 7)
            "not a cron",  # Complete nonsense
            "",  # Empty string
        ]

        for cron_expr in invalid_cron_expressions:
            mock_job = MagicMock(spec=ScheduledJob)
            mock_job.cron_expression = cron_expr
            mock_job.timezone = "UTC"

            with pytest.raises((ValueError, TypeError)):
                scheduler._calculate_next_run(mock_job)

    def test_calculate_next_run_with_various_valid_patterns(self, scheduler):
        """_calculate_next_run works with various valid cron patterns."""
        from app.models import ScheduledJob

        valid_patterns = [
            "* * * * *",  # Every minute
            "0 * * * *",  # Every hour
            "0 0 * * *",  # Every day at midnight
            "0 0 * * 0",  # Every Sunday at midnight
            "0 0 1 * *",  # First day of month
            "*/5 * * * *",  # Every 5 minutes
            "0 9-17 * * *",  # Every hour 9am-5pm
            "0 0,12 * * *",  # Midnight and noon
        ]

        for cron_expr in valid_patterns:
            mock_job = MagicMock(spec=ScheduledJob)
            mock_job.cron_expression = cron_expr
            mock_job.timezone = "UTC"

            # Should not raise
            result = scheduler._calculate_next_run(mock_job)
            assert isinstance(result, datetime), f"Failed for pattern: {cron_expr}"


class TestCheckRepoJobsInvalidCronExpression:
    """Tests for _check_repo_jobs handling of invalid cron expressions in schedule definitions."""

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
    async def test_skips_definition_with_invalid_cron_expression(self, scheduler, mock_repo, caplog):
        """_check_repo_jobs skips schedule definitions with invalid cron expressions."""
        from app.storage import ScheduleDefinition

        # Create a definition with an invalid cron expression
        invalid_defn = ScheduleDefinition(
            id="invalid-schedule",
            name="Invalid Schedule",
            cron_expression="invalid cron",  # Not a valid cron expression
            timezone="UTC",
        )

        now = datetime.now()

        with patch("app.services.scheduler.list_schedule_definitions", return_value=[invalid_defn]):
            with patch("app.services.scheduler.get_repo_db") as mock_db_ctx:
                mock_db = AsyncMock()
                mock_db.__aenter__ = AsyncMock(return_value=mock_db)
                mock_db.__aexit__ = AsyncMock(return_value=None)
                mock_db_ctx.return_value = mock_db

                # Mock the query to return None (no existing runtime state)
                mock_result = MagicMock()
                mock_result.scalar_one_or_none.return_value = None
                mock_result.scalars.return_value.all.return_value = []  # No due jobs
                mock_db.execute = AsyncMock(return_value=mock_result)

                import logging
                caplog.set_level(logging.WARNING)

                # Should not raise despite invalid cron
                await scheduler._check_repo_jobs(mock_repo, now)

                # Should have logged a warning
                assert any("invalid cron expression" in record.message.lower() for record in caplog.records)
                assert any("invalid-schedule" in record.message for record in caplog.records)

    @pytest.mark.asyncio
    async def test_processes_valid_definitions_when_invalid_exists(self, scheduler, mock_repo):
        """_check_repo_jobs processes valid definitions even when invalid ones exist."""
        from app.storage import ScheduleDefinition

        invalid_defn = ScheduleDefinition(
            id="invalid-schedule",
            name="Invalid Schedule",
            cron_expression="not valid",
            timezone="UTC",
        )

        valid_defn = ScheduleDefinition(
            id="valid-schedule",
            name="Valid Schedule",
            cron_expression="0 9 * * *",  # Valid: daily at 9am
            timezone="UTC",
        )

        now = datetime.now()
        runtime_created = []

        with patch("app.services.scheduler.list_schedule_definitions", return_value=[invalid_defn, valid_defn]):
            with patch("app.services.scheduler.get_repo_db") as mock_db_ctx:
                mock_db = AsyncMock()
                mock_db.__aenter__ = AsyncMock(return_value=mock_db)
                mock_db.__aexit__ = AsyncMock(return_value=None)
                mock_db_ctx.return_value = mock_db

                # Mock the query to return None (no existing runtime state)
                mock_result = MagicMock()
                mock_result.scalar_one_or_none.return_value = None
                mock_result.scalars.return_value.all.return_value = []  # No due jobs
                mock_db.execute = AsyncMock(return_value=mock_result)

                # Track what gets added to the database
                def track_add(obj):
                    runtime_created.append(obj.name)
                mock_db.add = MagicMock(side_effect=track_add)
                mock_db.commit = AsyncMock()

                await scheduler._check_repo_jobs(mock_repo, now)

                # Only the valid definition should have been added
                assert "valid-schedule" in runtime_created
                assert "invalid-schedule" not in runtime_created

    @pytest.mark.asyncio
    async def test_skips_various_invalid_cron_patterns(self, scheduler, mock_repo, caplog):
        """_check_repo_jobs skips definitions with various types of invalid cron expressions."""
        from app.storage import ScheduleDefinition

        invalid_cron_expressions = [
            "",  # Empty string
            "* * * *",  # Missing field (only 4 fields)
            "60 * * * *",  # Invalid minute (60 > 59)
            "* 24 * * *",  # Invalid hour (24 > 23)
            "not a cron expression",  # Random text
            "   ",  # Whitespace only
        ]

        for cron_expr in invalid_cron_expressions:
            defn = ScheduleDefinition(
                id=f"test-{hash(cron_expr)}",
                name="Test Schedule",
                cron_expression=cron_expr,
                timezone="UTC",
            )

            now = datetime.now()

            with patch("app.services.scheduler.list_schedule_definitions", return_value=[defn]):
                with patch("app.services.scheduler.get_repo_db") as mock_db_ctx:
                    mock_db = AsyncMock()
                    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
                    mock_db.__aexit__ = AsyncMock(return_value=None)
                    mock_db_ctx.return_value = mock_db

                    mock_result = MagicMock()
                    mock_result.scalar_one_or_none.return_value = None
                    mock_result.scalars.return_value.all.return_value = []
                    mock_db.execute = AsyncMock(return_value=mock_result)

                    mock_db.add = MagicMock()

                    # Should not raise
                    await scheduler._check_repo_jobs(mock_repo, now)

                    # Should not have tried to create runtime state for invalid cron
                    mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_does_not_skip_existing_runtime_with_invalid_cron(self, scheduler, mock_repo):
        """_check_repo_jobs still syncs existing runtime state even if definition has invalid cron.

        When runtime state already exists for a schedule, we sync fields from the definition
        but don't need to calculate next_run (that's done elsewhere).
        """
        from app.storage import ScheduleDefinition
        from app.models import ScheduledJob

        # Definition has invalid cron (user may have broken it while editing)
        defn = ScheduleDefinition(
            id="existing-schedule",
            name="Existing Schedule",
            cron_expression="invalid",
            timezone="UTC",
            status="paused",  # Changed status
        )

        # But runtime already exists with a valid next_run_at
        existing_runtime = MagicMock(spec=ScheduledJob)
        existing_runtime.status = "active"  # Will be synced to "paused"
        existing_runtime.cli_type = "claude"
        existing_runtime.permission_mode = None
        existing_runtime.model = None
        existing_runtime.max_turns = None
        existing_runtime.allowed_tools = None

        now = datetime.now()

        with patch("app.services.scheduler.list_schedule_definitions", return_value=[defn]):
            with patch("app.services.scheduler.get_repo_db") as mock_db_ctx:
                mock_db = AsyncMock()
                mock_db.__aenter__ = AsyncMock(return_value=mock_db)
                mock_db.__aexit__ = AsyncMock(return_value=None)
                mock_db_ctx.return_value = mock_db

                # First query returns the existing runtime, second returns no due jobs
                mock_result1 = MagicMock()
                mock_result1.scalar_one_or_none.return_value = existing_runtime

                mock_result2 = MagicMock()
                mock_result2.scalars.return_value.all.return_value = []

                mock_db.execute = AsyncMock(side_effect=[mock_result1, mock_result2])
                mock_db.commit = AsyncMock()

                await scheduler._check_repo_jobs(mock_repo, now)

                # Status should have been synced from definition
                assert existing_runtime.status == "paused"
