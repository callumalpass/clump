"""
Tests for the stats router.

Tests cover:
- Model pricing and cost calculation
- Display name generation
- Stats endpoint response parsing
- Daily activity aggregation
- Model usage calculation
- Hourly distribution parsing
- Week/today stats calculation
- Edge cases and error handling
"""

import json
import pytest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, mock_open
from fastapi.testclient import TestClient

from app.routers.stats import (
    get_pricing,
    calculate_cost,
    get_display_name,
    MODEL_PRICING,
    DEFAULT_PRICING,
)


class TestGetPricing:
    """Tests for the get_pricing function."""

    def test_exact_model_match(self):
        """Returns correct pricing for exact model match."""
        pricing = get_pricing("claude-opus-4-20250514")
        assert pricing["input"] == 15.00
        assert pricing["output"] == 75.00

    def test_sonnet_4_pricing(self):
        """Returns correct pricing for Sonnet 4."""
        pricing = get_pricing("claude-sonnet-4-20250514")
        assert pricing["input"] == 3.00
        assert pricing["output"] == 15.00

    def test_opus_45_pricing(self):
        """Returns correct pricing for Opus 4.5."""
        pricing = get_pricing("claude-opus-4-5-20251101")
        assert pricing["input"] == 15.00
        assert pricing["output"] == 75.00

    def test_haiku_pricing(self):
        """Returns correct pricing for Haiku."""
        pricing = get_pricing("claude-3-5-haiku-20241022")
        assert pricing["input"] == 0.80
        assert pricing["output"] == 4.00

    def test_opus_family_fallback(self):
        """Falls back to Opus pricing for unknown Opus models."""
        pricing = get_pricing("claude-opus-9-99999999")
        assert pricing["input"] == 15.00
        assert pricing["output"] == 75.00

    def test_sonnet_family_fallback(self):
        """Falls back to Sonnet pricing for unknown Sonnet models."""
        pricing = get_pricing("claude-sonnet-9-99999999")
        assert pricing["input"] == 3.00
        assert pricing["output"] == 15.00

    def test_haiku_family_fallback(self):
        """Falls back to Haiku pricing for unknown Haiku models."""
        pricing = get_pricing("claude-haiku-9-99999999")
        assert pricing["input"] == 0.80
        assert pricing["output"] == 4.00

    def test_unknown_model_uses_default(self):
        """Returns default pricing for completely unknown models."""
        pricing = get_pricing("unknown-model")
        assert pricing == DEFAULT_PRICING

    def test_case_insensitive_family_matching(self):
        """Model family matching is case-insensitive."""
        pricing_lower = get_pricing("claude-OPUS-future")
        pricing_upper = get_pricing("CLAUDE-opus-future")
        assert pricing_lower == pricing_upper

    def test_empty_model_string(self):
        """Returns default pricing for empty model string."""
        pricing = get_pricing("")
        assert pricing == DEFAULT_PRICING


class TestCalculateCost:
    """Tests for the calculate_cost function."""

    def test_basic_cost_calculation(self):
        """Calculates cost correctly with all token types."""
        cost = calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_read_tokens=1_000_000,
            cache_write_tokens=1_000_000,
            model="claude-sonnet-4-20250514",
        )
        # $3 + $15 + $0.30 + $3.75 = $22.05
        assert cost == pytest.approx(22.05, rel=0.01)

    def test_zero_tokens(self):
        """Returns zero cost for zero tokens."""
        cost = calculate_cost(
            input_tokens=0,
            output_tokens=0,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-sonnet-4-20250514",
        )
        assert cost == 0.0

    def test_only_input_tokens(self):
        """Calculates cost with only input tokens."""
        cost = calculate_cost(
            input_tokens=1_000_000,
            output_tokens=0,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-sonnet-4-20250514",
        )
        assert cost == pytest.approx(3.00, rel=0.01)

    def test_only_output_tokens(self):
        """Calculates cost with only output tokens."""
        cost = calculate_cost(
            input_tokens=0,
            output_tokens=1_000_000,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-sonnet-4-20250514",
        )
        assert cost == pytest.approx(15.00, rel=0.01)

    def test_small_token_counts(self):
        """Calculates cost correctly for small token counts."""
        cost = calculate_cost(
            input_tokens=1000,
            output_tokens=500,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-sonnet-4-20250514",
        )
        # (1000/1M * $3) + (500/1M * $15) = $0.003 + $0.0075 = $0.0105
        assert cost == pytest.approx(0.0105, rel=0.01)

    def test_opus_model_cost(self):
        """Calculates correct cost for Opus model."""
        cost = calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-opus-4-20250514",
        )
        # $15 + $75 = $90
        assert cost == pytest.approx(90.00, rel=0.01)

    def test_haiku_model_cost(self):
        """Calculates correct cost for Haiku model."""
        cost = calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-3-5-haiku-20241022",
        )
        # $0.80 + $4.00 = $4.80
        assert cost == pytest.approx(4.80, rel=0.01)


class TestGetDisplayName:
    """Tests for the get_display_name function."""

    def test_opus_45_display_name(self):
        """Returns 'Opus 4.5' for Opus 4.5 models."""
        assert get_display_name("claude-opus-4-5-20251101") == "Opus 4.5"

    def test_opus_4_display_name(self):
        """Returns 'Opus 4' for Opus 4 models."""
        assert get_display_name("claude-opus-4-20250514") == "Opus 4"

    def test_sonnet_4_display_name(self):
        """Returns 'Sonnet 4' for Sonnet 4 models."""
        assert get_display_name("claude-sonnet-4-20250514") == "Sonnet 4"

    def test_sonnet_35_display_name(self):
        """Returns 'Sonnet 3.5' for Sonnet 3.5 models."""
        assert get_display_name("claude-3-5-sonnet-20241022") == "Sonnet 3.5"

    def test_haiku_display_name(self):
        """Returns 'Haiku' for Haiku models."""
        assert get_display_name("claude-3-5-haiku-20241022") == "Haiku"

    def test_generic_opus_display_name(self):
        """Returns 'Opus' for generic Opus models."""
        assert get_display_name("claude-opus-unknown") == "Opus"

    def test_unknown_model_returns_original(self):
        """Returns original model name for unknown models."""
        assert get_display_name("unknown-model") == "unknown-model"

    def test_case_insensitive_matching(self):
        """Model family matching is case-insensitive."""
        assert get_display_name("CLAUDE-OPUS-4-20250514") == "Opus 4"

    def test_opus_45_variant_formats(self):
        """Handles both 4-5 and 4.5 format for Opus 4.5."""
        assert get_display_name("opus-4.5-model") == "Opus 4.5"
        assert get_display_name("opus-4-5-model") == "Opus 4.5"


class TestStatsEndpoint:
    """Tests for the /stats endpoint."""

    @pytest.fixture
    def sample_stats_data(self):
        """Sample stats data matching Claude's stats-cache.json format."""
        return {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 42,
            "totalMessages": 1500,
            "firstSessionDate": "2024-06-15",
            "longestSession": {"duration": 3600000},  # 1 hour in ms
            "dailyActivity": [
                {
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "messageCount": 50,
                    "sessionCount": 5,
                    "toolCallCount": 100,
                },
                {
                    "date": (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d"),
                    "messageCount": 30,
                    "sessionCount": 3,
                    "toolCallCount": 60,
                },
            ],
            "dailyModelTokens": [
                {
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "tokensByModel": {
                        "claude-sonnet-4-20250514": 50000,
                        "claude-opus-4-20250514": 10000,
                    },
                },
            ],
            "modelUsage": {
                "claude-sonnet-4-20250514": {
                    "inputTokens": 100000,
                    "outputTokens": 50000,
                    "cacheReadInputTokens": 10000,
                    "cacheCreationInputTokens": 5000,
                },
            },
            "hourCounts": {
                "9": 10,
                "10": 25,
                "14": 15,
            },
        }

    @pytest.fixture
    def mock_stats_file(self, sample_stats_data, tmp_path):
        """Create a mock stats file."""
        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True, exist_ok=True)
        stats_file.write_text(json.dumps(sample_stats_data))
        return stats_file

    def test_stats_endpoint_success(self, sample_stats_data):
        """Returns stats successfully when file exists."""
        from app.main import app

        client = TestClient(app)

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch(
                    "builtins.open",
                    mock_open(read_data=json.dumps(sample_stats_data)),
                ):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        data = response.json()
        assert data["total_sessions"] == 42
        assert data["total_messages"] == 1500

    def test_stats_endpoint_file_not_found(self):
        """Returns 404 when stats file doesn't exist."""
        from app.main import app

        client = TestClient(app)

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=False):
                response = client.get("/api/stats")

        assert response.status_code == 404
        assert "Stats cache not found" in response.json()["detail"]

    def test_stats_endpoint_invalid_json(self):
        """Returns 500 for invalid JSON."""
        from app.main import app

        client = TestClient(app)

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data="not valid json")):
                    response = client.get("/api/stats")

        assert response.status_code == 500
        assert "Failed to read stats" in response.json()["detail"]


class TestStatsEdgeCases:
    """Tests for edge cases in stats parsing."""

    def test_none_values_in_daily_activity(self):
        """Handles None values in daily activity."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [
                {
                    "date": "2025-01-10",
                    "messageCount": None,
                    "sessionCount": None,
                    "toolCallCount": None,
                },
            ],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["daily_activity"][0]["message_count"] == 0
        assert result["daily_activity"][0]["session_count"] == 0
        assert result["daily_activity"][0]["tool_call_count"] == 0

    def test_none_daily_activity_list(self):
        """Handles None dailyActivity list."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": None,
            "dailyModelTokens": None,
            "modelUsage": None,
            "hourCounts": None,
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["daily_activity"] == []
        assert result["daily_model_tokens"] == []
        assert result["model_usage"] == []

    def test_none_tokens_by_model(self):
        """Handles None tokensByModel in daily model tokens."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [],
            "dailyModelTokens": [
                {
                    "date": "2025-01-10",
                    "tokensByModel": None,
                },
            ],
            "modelUsage": {},
            "hourCounts": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["daily_model_tokens"][0]["tokens_by_model"] == {}

    def test_none_model_usage_values(self):
        """Handles None values in model usage."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {
                "claude-sonnet-4-20250514": {
                    "inputTokens": None,
                    "outputTokens": None,
                    "cacheReadInputTokens": None,
                    "cacheCreationInputTokens": None,
                },
            },
            "hourCounts": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["model_usage"][0]["input_tokens"] == 0
        assert result["model_usage"][0]["output_tokens"] == 0

    def test_none_hour_counts(self):
        """Handles None values in hour counts."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {
                "9": None,
                "10": 5,
            },
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        hour_9 = next(h for h in result["hourly_distribution"] if h["hour"] == 9)
        hour_10 = next(h for h in result["hourly_distribution"] if h["hour"] == 10)
        assert hour_9["count"] == 0
        assert hour_10["count"] == 5

    def test_none_longest_session(self):
        """Handles None longest session."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
            "longestSession": None,
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["longest_session_minutes"] is None

    def test_longest_session_without_duration(self):
        """Handles longest session without duration field."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
            "longestSession": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["longest_session_minutes"] is None

    def test_empty_stats_file(self):
        """Handles minimal/empty stats data."""
        from app.main import app

        client = TestClient(app)

        data = {}

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["total_sessions"] == 0
        assert result["total_messages"] == 0
        assert result["daily_activity"] == []


class TestWeekStats:
    """Tests for week stats calculation."""

    def test_week_stats_aggregation(self):
        """Calculates week stats by summing last 7 days plus today (8 days total)."""
        from app.main import app

        client = TestClient(app)

        today = datetime.now()
        data = {
            "lastComputedDate": today.strftime("%Y-%m-%d"),
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [
                {
                    "date": (today - timedelta(days=i)).strftime("%Y-%m-%d"),
                    "messageCount": 10,
                    "sessionCount": 2,
                    "toolCallCount": 20,
                }
                for i in range(10)  # 10 days of data
            ],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        # The code uses `day.date >= week_ago` where week_ago is 7 days ago
        # This includes: today + 7 previous days = 8 days total
        # 8 days * 10 messages = 80
        assert result["week_stats"]["message_count"] == 80
        assert result["week_stats"]["session_count"] == 16
        assert result["week_stats"]["tool_call_count"] == 160

    def test_today_stats_found(self):
        """Returns today's stats when available."""
        from app.main import app

        client = TestClient(app)

        today = datetime.now().strftime("%Y-%m-%d")
        data = {
            "lastComputedDate": today,
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [
                {
                    "date": today,
                    "messageCount": 25,
                    "sessionCount": 5,
                    "toolCallCount": 50,
                },
            ],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["today_stats"] is not None
        assert result["today_stats"]["message_count"] == 25

    def test_today_stats_not_found(self):
        """Returns None for today_stats when no data for today."""
        from app.main import app

        client = TestClient(app)

        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        data = {
            "lastComputedDate": yesterday,
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [
                {
                    "date": yesterday,
                    "messageCount": 25,
                    "sessionCount": 5,
                    "toolCallCount": 50,
                },
            ],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["today_stats"] is None


class TestModelUsageSorting:
    """Tests for model usage sorting."""

    def test_model_usage_sorted_by_cost_descending(self):
        """Model usage is sorted by estimated cost descending."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {
                "claude-3-5-haiku-20241022": {
                    "inputTokens": 100000,  # Low cost model
                    "outputTokens": 50000,
                    "cacheReadInputTokens": 0,
                    "cacheCreationInputTokens": 0,
                },
                "claude-opus-4-20250514": {
                    "inputTokens": 100000,  # High cost model
                    "outputTokens": 50000,
                    "cacheReadInputTokens": 0,
                    "cacheCreationInputTokens": 0,
                },
                "claude-sonnet-4-20250514": {
                    "inputTokens": 100000,  # Medium cost model
                    "outputTokens": 50000,
                    "cacheReadInputTokens": 0,
                    "cacheCreationInputTokens": 0,
                },
            },
            "hourCounts": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        model_usage = result["model_usage"]
        assert len(model_usage) == 3
        # Opus should be first (highest cost)
        assert "opus" in model_usage[0]["model"].lower()
        # Haiku should be last (lowest cost)
        assert "haiku" in model_usage[2]["model"].lower()


class TestTotalCostCalculation:
    """Tests for total cost calculation."""

    def test_total_cost_sums_all_models(self):
        """Total cost is sum of all model costs."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {
                "claude-sonnet-4-20250514": {
                    "inputTokens": 1_000_000,
                    "outputTokens": 1_000_000,
                    "cacheReadInputTokens": 0,
                    "cacheCreationInputTokens": 0,
                },
                "claude-opus-4-20250514": {
                    "inputTokens": 1_000_000,
                    "outputTokens": 1_000_000,
                    "cacheReadInputTokens": 0,
                    "cacheCreationInputTokens": 0,
                },
            },
            "hourCounts": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        # Sonnet: $3 + $15 = $18
        # Opus: $15 + $75 = $90
        # Total: $108
        assert result["total_estimated_cost_usd"] == pytest.approx(108.00, rel=0.01)

    def test_zero_total_cost_with_no_usage(self):
        """Total cost is zero when no model usage."""
        from app.main import app

        client = TestClient(app)

        data = {
            "lastComputedDate": "2025-01-10",
            "totalSessions": 0,
            "totalMessages": 0,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        with patch.object(Path, "home") as mock_home:
            mock_home.return_value = Path("/mock/home")
            with patch.object(Path, "exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json.dumps(data))):
                    response = client.get("/api/stats")

        assert response.status_code == 200
        result = response.json()
        assert result["total_estimated_cost_usd"] == 0.0
