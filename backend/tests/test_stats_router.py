"""
Tests for the stats router.

Tests cover:
- get_pricing function for model pricing lookup
- get_display_name function for model display names
- calculate_cost function for cost calculations
- Edge cases for model family matching
"""

import pytest

from app.routers.stats import (
    get_pricing,
    get_display_name,
    calculate_cost,
    MODEL_PRICING,
    DEFAULT_PRICING,
)


class TestGetPricing:
    """Tests for get_pricing function."""

    # ==============================================
    # Exact model match tests
    # ==============================================

    def test_exact_match_opus_4_5(self):
        """Returns correct pricing for Opus 4.5 exact match."""
        result = get_pricing("claude-opus-4-5-20251101")
        assert result == MODEL_PRICING["claude-opus-4-5-20251101"]
        assert result["input"] == 15.00
        assert result["output"] == 75.00

    def test_exact_match_opus_4(self):
        """Returns correct pricing for Opus 4 exact match."""
        result = get_pricing("claude-opus-4-20250514")
        assert result == MODEL_PRICING["claude-opus-4-20250514"]
        assert result["input"] == 15.00
        assert result["output"] == 75.00

    def test_exact_match_sonnet_4(self):
        """Returns correct pricing for Sonnet 4 exact match."""
        result = get_pricing("claude-sonnet-4-20250514")
        assert result == MODEL_PRICING["claude-sonnet-4-20250514"]
        assert result["input"] == 3.00
        assert result["output"] == 15.00

    def test_exact_match_sonnet_3_5(self):
        """Returns correct pricing for Sonnet 3.5 exact match."""
        result = get_pricing("claude-3-5-sonnet-20241022")
        assert result == MODEL_PRICING["claude-3-5-sonnet-20241022"]
        assert result["input"] == 3.00
        assert result["output"] == 15.00

    def test_exact_match_haiku_3_5(self):
        """Returns correct pricing for Haiku 3.5 exact match."""
        result = get_pricing("claude-3-5-haiku-20241022")
        assert result == MODEL_PRICING["claude-3-5-haiku-20241022"]
        assert result["input"] == 0.80
        assert result["output"] == 4.00

    # ==============================================
    # Model family fallback tests
    # ==============================================

    def test_opus_family_fallback(self):
        """Falls back to Opus 4 pricing for unknown opus model."""
        result = get_pricing("claude-opus-5-20260101")
        assert result["input"] == 15.00
        assert result["output"] == 75.00

    def test_sonnet_family_fallback(self):
        """Falls back to Sonnet 4 pricing for unknown sonnet model."""
        result = get_pricing("claude-sonnet-5-20260101")
        assert result["input"] == 3.00
        assert result["output"] == 15.00

    def test_haiku_family_fallback(self):
        """Falls back to Haiku 3.5 pricing for unknown haiku model."""
        result = get_pricing("claude-haiku-5-20260101")
        assert result["input"] == 0.80
        assert result["output"] == 4.00

    def test_opus_case_insensitive(self):
        """Model family matching is case insensitive."""
        result = get_pricing("CLAUDE-OPUS-4-20250514")
        assert result["input"] == 15.00

    def test_sonnet_case_insensitive(self):
        """Model family matching is case insensitive for sonnet."""
        result = get_pricing("Claude-Sonnet-4")
        assert result["input"] == 3.00

    def test_haiku_case_insensitive(self):
        """Model family matching is case insensitive for haiku."""
        result = get_pricing("HAIKU-test")
        assert result["input"] == 0.80

    # ==============================================
    # Default fallback tests
    # ==============================================

    def test_unknown_model_returns_default(self):
        """Returns default pricing for unknown model."""
        result = get_pricing("unknown-model-12345")
        assert result == DEFAULT_PRICING

    def test_empty_string_returns_default(self):
        """Returns default pricing for empty string."""
        result = get_pricing("")
        assert result == DEFAULT_PRICING

    def test_random_string_returns_default(self):
        """Returns default pricing for random string."""
        result = get_pricing("abcdefg")
        assert result == DEFAULT_PRICING

    # ==============================================
    # Cache token pricing tests
    # ==============================================

    def test_opus_cache_pricing(self):
        """Opus models have correct cache pricing."""
        result = get_pricing("claude-opus-4-5-20251101")
        assert result["cache_read"] == 1.50
        assert result["cache_write"] == 18.75

    def test_sonnet_cache_pricing(self):
        """Sonnet models have correct cache pricing."""
        result = get_pricing("claude-sonnet-4-20250514")
        assert result["cache_read"] == 0.30
        assert result["cache_write"] == 3.75

    def test_haiku_cache_pricing(self):
        """Haiku models have correct cache pricing."""
        result = get_pricing("claude-3-5-haiku-20241022")
        assert result["cache_read"] == 0.08
        assert result["cache_write"] == 1.00


class TestGetDisplayName:
    """Tests for get_display_name function."""

    # ==============================================
    # Opus display name tests
    # ==============================================

    def test_opus_4_5_display_name(self):
        """Returns 'Opus 4.5' for Opus 4.5 model."""
        assert get_display_name("claude-opus-4-5-20251101") == "Opus 4.5"

    def test_opus_4_display_name(self):
        """Returns 'Opus 4' for Opus 4 model."""
        assert get_display_name("claude-opus-4-20250514") == "Opus 4"

    def test_generic_opus_display_name(self):
        """Returns 'Opus' for generic opus model."""
        assert get_display_name("claude-opus-3-20230101") == "Opus"

    def test_opus_case_insensitive(self):
        """Opus detection is case insensitive."""
        assert get_display_name("CLAUDE-OPUS-4-20250514") == "Opus 4"

    # ==============================================
    # Sonnet display name tests
    # ==============================================

    def test_sonnet_4_display_name(self):
        """Returns 'Sonnet 4' for Sonnet 4 model."""
        assert get_display_name("claude-sonnet-4-20250514") == "Sonnet 4"

    def test_sonnet_3_5_display_name(self):
        """Returns 'Sonnet 3.5' for Sonnet 3.5 model."""
        assert get_display_name("claude-3-5-sonnet-20241022") == "Sonnet 3.5"

    def test_generic_sonnet_display_name(self):
        """Returns 'Sonnet 3.5' for generic sonnet model (no version match)."""
        assert get_display_name("claude-sonnet") == "Sonnet 3.5"

    def test_sonnet_case_insensitive(self):
        """Sonnet detection is case insensitive."""
        assert get_display_name("CLAUDE-SONNET-4-20250514") == "Sonnet 4"

    # ==============================================
    # Haiku display name tests
    # ==============================================

    def test_haiku_display_name(self):
        """Returns 'Haiku' for Haiku model."""
        assert get_display_name("claude-3-5-haiku-20241022") == "Haiku"

    def test_haiku_case_insensitive(self):
        """Haiku detection is case insensitive."""
        assert get_display_name("CLAUDE-HAIKU-3-5") == "Haiku"

    # ==============================================
    # Unknown model tests
    # ==============================================

    def test_unknown_model_returns_original(self):
        """Returns original string for unknown model."""
        assert get_display_name("unknown-model") == "unknown-model"

    def test_empty_string_returns_empty(self):
        """Returns empty string for empty input."""
        assert get_display_name("") == ""


class TestCalculateCost:
    """Tests for calculate_cost function."""

    # ==============================================
    # Basic cost calculation tests
    # ==============================================

    def test_basic_sonnet_cost(self):
        """Calculates correct cost for Sonnet usage."""
        # 1M input tokens at $3/M + 1M output tokens at $15/M = $18
        cost = calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-sonnet-4-20250514",
        )
        assert cost == pytest.approx(18.0)

    def test_basic_opus_cost(self):
        """Calculates correct cost for Opus usage."""
        # 1M input tokens at $15/M + 1M output tokens at $75/M = $90
        cost = calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-opus-4-5-20251101",
        )
        assert cost == pytest.approx(90.0)

    def test_basic_haiku_cost(self):
        """Calculates correct cost for Haiku usage."""
        # 1M input tokens at $0.80/M + 1M output tokens at $4/M = $4.80
        cost = calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-3-5-haiku-20241022",
        )
        assert cost == pytest.approx(4.80)

    # ==============================================
    # Cache token cost tests
    # ==============================================

    def test_cache_read_cost(self):
        """Calculates correct cost for cache reads."""
        # 1M cache read tokens at $0.30/M = $0.30
        cost = calculate_cost(
            input_tokens=0,
            output_tokens=0,
            cache_read_tokens=1_000_000,
            cache_write_tokens=0,
            model="claude-sonnet-4-20250514",
        )
        assert cost == pytest.approx(0.30)

    def test_cache_write_cost(self):
        """Calculates correct cost for cache writes."""
        # 1M cache write tokens at $3.75/M = $3.75
        cost = calculate_cost(
            input_tokens=0,
            output_tokens=0,
            cache_read_tokens=0,
            cache_write_tokens=1_000_000,
            model="claude-sonnet-4-20250514",
        )
        assert cost == pytest.approx(3.75)

    def test_combined_cost(self):
        """Calculates correct combined cost with all token types."""
        # 500K input at $3/M = $1.50
        # 200K output at $15/M = $3.00
        # 100K cache read at $0.30/M = $0.03
        # 50K cache write at $3.75/M = $0.1875
        # Total = $4.7175
        cost = calculate_cost(
            input_tokens=500_000,
            output_tokens=200_000,
            cache_read_tokens=100_000,
            cache_write_tokens=50_000,
            model="claude-sonnet-4-20250514",
        )
        assert cost == pytest.approx(4.7175)

    # ==============================================
    # Zero token tests
    # ==============================================

    def test_zero_tokens_returns_zero(self):
        """Returns 0 cost for zero tokens."""
        cost = calculate_cost(
            input_tokens=0,
            output_tokens=0,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-sonnet-4-20250514",
        )
        assert cost == 0.0

    # ==============================================
    # Small token count tests
    # ==============================================

    def test_small_token_count(self):
        """Correctly calculates cost for small token counts."""
        # 1000 input tokens at $3/M = $0.003
        cost = calculate_cost(
            input_tokens=1000,
            output_tokens=0,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="claude-sonnet-4-20250514",
        )
        assert cost == pytest.approx(0.003)

    # ==============================================
    # Default pricing tests
    # ==============================================

    def test_unknown_model_uses_default(self):
        """Uses default pricing for unknown model."""
        # Default is Sonnet pricing
        cost = calculate_cost(
            input_tokens=1_000_000,
            output_tokens=0,
            cache_read_tokens=0,
            cache_write_tokens=0,
            model="unknown-model",
        )
        assert cost == pytest.approx(3.0)


class TestModelPricingSync:
    """Tests to ensure MODEL_PRICING is properly synced with frontend."""

    def test_opus_4_5_exists(self):
        """Opus 4.5 pricing exists in MODEL_PRICING."""
        assert "claude-opus-4-5-20251101" in MODEL_PRICING

    def test_opus_4_exists(self):
        """Opus 4 pricing exists in MODEL_PRICING."""
        assert "claude-opus-4-20250514" in MODEL_PRICING

    def test_sonnet_4_exists(self):
        """Sonnet 4 pricing exists in MODEL_PRICING."""
        assert "claude-sonnet-4-20250514" in MODEL_PRICING

    def test_sonnet_3_5_exists(self):
        """Sonnet 3.5 pricing exists in MODEL_PRICING."""
        assert "claude-3-5-sonnet-20241022" in MODEL_PRICING

    def test_haiku_3_5_exists(self):
        """Haiku 3.5 pricing exists in MODEL_PRICING."""
        assert "claude-3-5-haiku-20241022" in MODEL_PRICING

    def test_all_models_have_required_keys(self):
        """All model pricing dicts have required keys."""
        required_keys = {"input", "output", "cache_read", "cache_write"}
        for model, pricing in MODEL_PRICING.items():
            assert set(pricing.keys()) == required_keys, f"Model {model} missing keys"

    def test_all_prices_are_positive(self):
        """All prices are positive numbers."""
        for model, pricing in MODEL_PRICING.items():
            for key, value in pricing.items():
                assert value > 0, f"Model {model} has non-positive {key}: {value}"


class TestGetStatsEndpoint:
    """Tests for the get_stats endpoint.

    Tests focus on handling None values in JSON data to prevent
    TypeError when values are None instead of missing.
    """

    # ==============================================
    # None value handling tests for model usage
    # ==============================================

    def test_handles_none_input_tokens(self, tmp_path, monkeypatch):
        """Handles None inputTokens in model usage."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 1,
            "totalMessages": 1,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {
                "claude-sonnet-4-20250514": {
                    "inputTokens": None,  # None value
                    "outputTokens": 1000,
                    "cacheReadInputTokens": 0,
                    "cacheCreationInputTokens": 0,
                }
            },
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            assert data["model_usage"][0]["input_tokens"] == 0

    def test_handles_none_output_tokens(self, tmp_path, monkeypatch):
        """Handles None outputTokens in model usage."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 1,
            "totalMessages": 1,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {
                "claude-sonnet-4-20250514": {
                    "inputTokens": 1000,
                    "outputTokens": None,  # None value
                    "cacheReadInputTokens": 0,
                    "cacheCreationInputTokens": 0,
                }
            },
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            assert data["model_usage"][0]["output_tokens"] == 0

    def test_handles_none_cache_tokens(self, tmp_path, monkeypatch):
        """Handles None cache tokens in model usage."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 1,
            "totalMessages": 1,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {
                "claude-sonnet-4-20250514": {
                    "inputTokens": 1000,
                    "outputTokens": 500,
                    "cacheReadInputTokens": None,  # None value
                    "cacheCreationInputTokens": None,  # None value
                }
            },
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            assert data["model_usage"][0]["cache_read_tokens"] == 0
            assert data["model_usage"][0]["cache_write_tokens"] == 0

    def test_handles_all_none_model_usage_fields(self, tmp_path, monkeypatch):
        """Handles all None values in model usage."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 1,
            "totalMessages": 1,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {
                "claude-sonnet-4-20250514": {
                    "inputTokens": None,
                    "outputTokens": None,
                    "cacheReadInputTokens": None,
                    "cacheCreationInputTokens": None,
                }
            },
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            model = data["model_usage"][0]
            assert model["input_tokens"] == 0
            assert model["output_tokens"] == 0
            assert model["cache_read_tokens"] == 0
            assert model["cache_write_tokens"] == 0
            assert model["estimated_cost_usd"] == 0.0

    # ==============================================
    # None value handling tests for daily activity
    # ==============================================

    def test_handles_none_message_count_in_daily_activity(self, tmp_path, monkeypatch):
        """Handles None messageCount in daily activity."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 1,
            "totalMessages": 1,
            "dailyActivity": [
                {
                    "date": "2024-01-01",
                    "messageCount": None,  # None value
                    "sessionCount": 5,
                    "toolCallCount": 10,
                }
            ],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            assert data["daily_activity"][0]["message_count"] == 0
            assert data["daily_activity"][0]["session_count"] == 5
            assert data["daily_activity"][0]["tool_call_count"] == 10

    def test_handles_none_session_count_in_daily_activity(self, tmp_path, monkeypatch):
        """Handles None sessionCount in daily activity."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 1,
            "totalMessages": 1,
            "dailyActivity": [
                {
                    "date": "2024-01-01",
                    "messageCount": 100,
                    "sessionCount": None,  # None value
                    "toolCallCount": 10,
                }
            ],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            assert data["daily_activity"][0]["message_count"] == 100
            assert data["daily_activity"][0]["session_count"] == 0
            assert data["daily_activity"][0]["tool_call_count"] == 10

    def test_handles_all_none_daily_activity_counts(self, tmp_path, monkeypatch):
        """Handles all None counts in daily activity."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 1,
            "totalMessages": 1,
            "dailyActivity": [
                {
                    "date": "2024-01-01",
                    "messageCount": None,
                    "sessionCount": None,
                    "toolCallCount": None,
                }
            ],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            day = data["daily_activity"][0]
            assert day["message_count"] == 0
            assert day["session_count"] == 0
            assert day["tool_call_count"] == 0

    # ==============================================
    # None value handling tests for top-level fields
    # ==============================================

    def test_handles_none_total_sessions(self, tmp_path, monkeypatch):
        """Handles None totalSessions."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": None,  # None value
            "totalMessages": 100,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            assert data["total_sessions"] == 0

    def test_handles_none_total_messages(self, tmp_path, monkeypatch):
        """Handles None totalMessages."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": None,  # None value
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            assert data["total_messages"] == 0

    def test_handles_none_last_computed_date(self, tmp_path, monkeypatch):
        """Handles None lastComputedDate."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": None,  # None value
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            assert data["last_computed_date"] == ""

    # ==============================================
    # Combined None value tests
    # ==============================================

    def test_handles_many_none_values(self, tmp_path, monkeypatch):
        """Handles multiple None values across different fields."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": None,
            "totalSessions": None,
            "totalMessages": None,
            "dailyActivity": [
                {
                    "date": "2024-01-01",
                    "messageCount": None,
                    "sessionCount": None,
                    "toolCallCount": None,
                }
            ],
            "dailyModelTokens": [],
            "modelUsage": {
                "claude-sonnet-4-20250514": {
                    "inputTokens": None,
                    "outputTokens": None,
                    "cacheReadInputTokens": None,
                    "cacheCreationInputTokens": None,
                }
            },
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()

            # Check top-level fields
            assert data["last_computed_date"] == ""
            assert data["total_sessions"] == 0
            assert data["total_messages"] == 0

            # Check daily activity
            day = data["daily_activity"][0]
            assert day["message_count"] == 0
            assert day["session_count"] == 0
            assert day["tool_call_count"] == 0

            # Check model usage
            model = data["model_usage"][0]
            assert model["input_tokens"] == 0
            assert model["output_tokens"] == 0
            assert model["cache_read_tokens"] == 0
            assert model["cache_write_tokens"] == 0
            assert model["estimated_cost_usd"] == 0.0


class TestGetStatsNoneContainerHandling:
    """Tests for handling None values for container fields.

    These tests verify the fix for the bug where .get('key', []) or .get('key', {})
    returns None (not the default) when the key exists with value None.
    The fix uses `data.get('key') or []` pattern instead.
    """

    # ==============================================
    # None daily activity list tests
    # ==============================================

    def test_handles_none_daily_activity_list(self, tmp_path):
        """Handles None dailyActivity list (not missing, but explicitly None)."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": None,  # Key exists but value is None
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            # Should be empty list, not cause TypeError
            assert data["daily_activity"] == []

    # ==============================================
    # None daily model tokens list tests
    # ==============================================

    def test_handles_none_daily_model_tokens_list(self, tmp_path):
        """Handles None dailyModelTokens list (not missing, but explicitly None)."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": [],
            "dailyModelTokens": None,  # Key exists but value is None
            "modelUsage": {},
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            # Should be empty list, not cause TypeError
            assert data["daily_model_tokens"] == []

    # ==============================================
    # None model usage dict tests
    # ==============================================

    def test_handles_none_model_usage_dict(self, tmp_path):
        """Handles None modelUsage dict (not missing, but explicitly None)."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": None,  # Key exists but value is None
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            # Should be empty list (no models), not cause AttributeError on .items()
            assert data["model_usage"] == []

    # ==============================================
    # None hour counts dict tests
    # ==============================================

    def test_handles_none_hour_counts_dict(self, tmp_path):
        """Handles None hourCounts dict (not missing, but explicitly None)."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": None,  # Key exists but value is None
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            # Should be empty list, not cause AttributeError on .items()
            assert data["hourly_distribution"] == []

    # ==============================================
    # None longest session dict tests
    # ==============================================

    def test_handles_none_longest_session_dict(self, tmp_path):
        """Handles None longestSession dict (not missing, but explicitly None)."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {},
            "longestSession": None,  # Key exists but value is None
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            # Should be None (no longest session), not cause AttributeError on .get()
            assert data["longest_session_minutes"] is None

    # ==============================================
    # None tokens_by_model in daily model tokens tests
    # ==============================================

    def test_handles_none_tokens_by_model_in_daily_model_tokens(self, tmp_path):
        """Handles None tokensByModel in daily model tokens entries."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": [],
            "dailyModelTokens": [
                {
                    "date": "2024-01-01",
                    "tokensByModel": None,  # Key exists but value is None
                }
            ],
            "modelUsage": {},
            "hourCounts": {},
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()
            # Should have entry with empty dict, not cause TypeError
            assert len(data["daily_model_tokens"]) == 1
            assert data["daily_model_tokens"][0]["tokens_by_model"] == {}

    # ==============================================
    # Combined None container tests
    # ==============================================

    def test_handles_all_none_container_fields(self, tmp_path):
        """Handles all container fields being None simultaneously."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": None,  # All container fields are None
            "dailyModelTokens": None,
            "modelUsage": None,
            "hourCounts": None,
            "longestSession": None,
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()

            # All should return empty containers or None, not cause errors
            assert data["daily_activity"] == []
            assert data["daily_model_tokens"] == []
            assert data["model_usage"] == []
            assert data["hourly_distribution"] == []
            assert data["longest_session_minutes"] is None

    # ==============================================
    # None values inside hourCounts dict tests
    # ==============================================

    def test_handles_none_count_values_in_hour_counts(self, tmp_path):
        """Handles None values inside hourCounts dict (e.g., {"23": null}).

        This tests the fix where individual hour count values could be None,
        which would cause a Pydantic validation error without the fix.
        """
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {
                "9": 5,
                "10": None,  # None value should be treated as 0
                "11": 10,
                "23": None,  # Another None value
            },
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()

            # Should have 4 entries, sorted by hour
            assert len(data["hourly_distribution"]) == 4

            # Check the values - None should be converted to 0
            hourly = {h["hour"]: h["count"] for h in data["hourly_distribution"]}
            assert hourly[9] == 5
            assert hourly[10] == 0  # None converted to 0
            assert hourly[11] == 10
            assert hourly[23] == 0  # None converted to 0

    def test_handles_mixed_valid_and_none_count_values(self, tmp_path):
        """Handles a mix of valid integers, zeros, and None values in hourCounts."""
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        stats_data = {
            "lastComputedDate": "2024-01-01",
            "totalSessions": 10,
            "totalMessages": 100,
            "dailyActivity": [],
            "dailyModelTokens": [],
            "modelUsage": {},
            "hourCounts": {
                "0": 0,      # Explicit zero
                "1": None,   # None value
                "2": 100,    # Normal value
            },
        }

        stats_file = tmp_path / ".claude" / "stats-cache.json"
        stats_file.parent.mkdir(parents=True)
        stats_file.write_text(json.dumps(stats_data))

        with patch("app.routers.stats.Path.home", return_value=tmp_path):
            client = TestClient(app)
            response = client.get("/api/stats")

            assert response.status_code == 200
            data = response.json()

            hourly = {h["hour"]: h["count"] for h in data["hourly_distribution"]}
            assert hourly[0] == 0    # Explicit zero preserved
            assert hourly[1] == 0    # None converted to 0
            assert hourly[2] == 100  # Normal value preserved
