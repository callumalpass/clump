"""
Stats routes for Claude usage statistics from ~/.claude/stats-cache.json.

Provides aggregate usage data, daily activity, and cost estimates.
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Model pricing per 1M tokens (USD) - matches frontend/src/utils/costs.ts
MODEL_PRICING = {
    "claude-sonnet-4-20250514": {
        "input": 3.00,
        "output": 15.00,
        "cache_read": 0.30,
        "cache_write": 3.75,
    },
    "claude-opus-4-20250514": {
        "input": 15.00,
        "output": 75.00,
        "cache_read": 1.50,
        "cache_write": 18.75,
    },
    "claude-3-5-sonnet-20241022": {
        "input": 3.00,
        "output": 15.00,
        "cache_read": 0.30,
        "cache_write": 3.75,
    },
    "claude-3-5-haiku-20241022": {
        "input": 0.80,
        "output": 4.00,
        "cache_read": 0.08,
        "cache_write": 1.00,
    },
}

# Default pricing (Sonnet)
DEFAULT_PRICING = {
    "input": 3.00,
    "output": 15.00,
    "cache_read": 0.30,
    "cache_write": 3.75,
}


def get_pricing(model: str) -> dict:
    """Get pricing for a model, with fallback to default pricing."""
    # Try exact match
    if model in MODEL_PRICING:
        return MODEL_PRICING[model]

    # Try to match by model family
    model_lower = model.lower()
    if "opus" in model_lower:
        return MODEL_PRICING.get("claude-opus-4-20250514", DEFAULT_PRICING)
    if "haiku" in model_lower:
        return MODEL_PRICING.get("claude-3-5-haiku-20241022", DEFAULT_PRICING)
    if "sonnet" in model_lower:
        return MODEL_PRICING.get("claude-sonnet-4-20250514", DEFAULT_PRICING)

    return DEFAULT_PRICING


def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int,
    cache_write_tokens: int,
    model: str,
) -> float:
    """Calculate estimated cost in USD for token usage."""
    pricing = get_pricing(model)
    cost = (
        (input_tokens / 1_000_000) * pricing["input"]
        + (output_tokens / 1_000_000) * pricing["output"]
        + (cache_read_tokens / 1_000_000) * pricing["cache_read"]
        + (cache_write_tokens / 1_000_000) * pricing["cache_write"]
    )
    return cost


# Pydantic models for response
class DailyActivity(BaseModel):
    date: str
    message_count: int
    session_count: int
    tool_call_count: int


class DailyModelTokens(BaseModel):
    date: str
    tokens_by_model: dict[str, int]


class ModelUsage(BaseModel):
    model: str
    display_name: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    estimated_cost_usd: float


class HourlyDistribution(BaseModel):
    hour: int  # 0-23
    count: int


class StatsResponse(BaseModel):
    last_computed_date: str
    total_sessions: int
    total_messages: int
    first_session_date: Optional[str] = None
    longest_session_minutes: Optional[int] = None
    daily_activity: list[DailyActivity]
    daily_model_tokens: list[DailyModelTokens]
    model_usage: list[ModelUsage]
    hourly_distribution: list[HourlyDistribution]
    today_stats: Optional[DailyActivity] = None
    week_stats: DailyActivity
    total_estimated_cost_usd: float


def get_display_name(model: str) -> str:
    """Get a friendly display name for a model."""
    if "opus" in model.lower():
        return "Opus"
    if "sonnet" in model.lower():
        if "4-5" in model or "4.5" in model:
            return "Sonnet 4.5"
        if "4-" in model:
            return "Sonnet 4"
        return "Sonnet 3.5"
    if "haiku" in model.lower():
        return "Haiku"
    return model


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Get usage stats from ~/.claude/stats-cache.json."""
    stats_file = Path.home() / ".claude" / "stats-cache.json"

    if not stats_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Stats cache not found. Make sure Claude Code CLI has been used.",
        )

    try:
        with open(stats_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to read stats: {e}")

    # Parse daily activity
    daily_activity = [
        DailyActivity(
            date=day["date"],
            message_count=day.get("messageCount", 0),
            session_count=day.get("sessionCount", 0),
            tool_call_count=day.get("toolCallCount", 0),
        )
        for day in data.get("dailyActivity", [])
    ]

    # Parse daily model tokens
    daily_model_tokens = [
        DailyModelTokens(
            date=day["date"],
            tokens_by_model=day.get("tokensByModel", {}),
        )
        for day in data.get("dailyModelTokens", [])
    ]

    # Parse model usage with cost calculation
    model_usage_raw = data.get("modelUsage", {})
    model_usage = []
    total_cost = 0.0

    for model, usage in model_usage_raw.items():
        input_tokens = usage.get("inputTokens", 0)
        output_tokens = usage.get("outputTokens", 0)
        cache_read = usage.get("cacheReadInputTokens", 0)
        cache_write = usage.get("cacheCreationInputTokens", 0)

        cost = calculate_cost(input_tokens, output_tokens, cache_read, cache_write, model)
        total_cost += cost

        model_usage.append(
            ModelUsage(
                model=model,
                display_name=get_display_name(model),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_tokens=cache_read,
                cache_write_tokens=cache_write,
                estimated_cost_usd=cost,
            )
        )

    # Sort by cost descending
    model_usage.sort(key=lambda m: m.estimated_cost_usd, reverse=True)

    # Parse hourly distribution
    hour_counts = data.get("hourCounts", {})
    hourly_distribution = [
        HourlyDistribution(hour=int(hour), count=count)
        for hour, count in sorted(hour_counts.items(), key=lambda x: int(x[0]))
    ]

    # Calculate today's stats
    today = datetime.now().strftime("%Y-%m-%d")
    today_stats = next(
        (day for day in daily_activity if day.date == today),
        None,
    )

    # Calculate week stats (last 7 days)
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    week_days = [day for day in daily_activity if day.date >= week_ago]
    week_stats = DailyActivity(
        date=f"{week_ago} - {today}",
        message_count=sum(d.message_count for d in week_days),
        session_count=sum(d.session_count for d in week_days),
        tool_call_count=sum(d.tool_call_count for d in week_days),
    )

    # Parse longest session duration
    longest_session = data.get("longestSession", {})
    longest_session_minutes = None
    if longest_session.get("duration"):
        # Duration is in milliseconds
        longest_session_minutes = int(longest_session["duration"] / 1000 / 60)

    return StatsResponse(
        last_computed_date=data.get("lastComputedDate", ""),
        total_sessions=data.get("totalSessions", 0),
        total_messages=data.get("totalMessages", 0),
        first_session_date=data.get("firstSessionDate"),
        longest_session_minutes=longest_session_minutes,
        daily_activity=daily_activity,
        daily_model_tokens=daily_model_tokens,
        model_usage=model_usage,
        hourly_distribution=hourly_distribution,
        today_stats=today_stats,
        week_stats=week_stats,
        total_estimated_cost_usd=total_cost,
    )
