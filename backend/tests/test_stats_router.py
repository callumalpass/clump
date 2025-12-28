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
