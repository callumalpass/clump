# Cost/Usage/Statistics Dashboard

## Overview

A dashboard for tracking token usage, costs, and usage patterns across sessions. The data already exists in transcripts - this feature aggregates and visualizes it.

## Data Already Available

From `transcript_parser.py`, each session already tracks:
- `total_input_tokens`
- `total_output_tokens`
- `total_cache_read_tokens`
- `total_cache_creation_tokens`
- `model` used
- `start_time` / `end_time`
- Tool uses (name, count)

## Architecture

### Backend

#### 1. New Database Table: `usage_stats`

```python
# models.py
class UsageStats(Base):
    """Aggregated usage statistics per session."""
    __tablename__ = "usage_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(String(100), unique=True)  # Claude session ID
    repo_id: Mapped[int] = mapped_column(Integer)

    # Token counts
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_creation_tokens: Mapped[int] = mapped_column(Integer, default=0)

    # Derived/computed
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)

    # Metadata
    model: Mapped[str | None] = mapped_column(String(50), nullable=True)
    session_kind: Mapped[str | None] = mapped_column(String(50), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tool_use_count: Mapped[int] = mapped_column(Integer, default=0)
    message_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    session_date: Mapped[datetime] = mapped_column(DateTime)  # For grouping by day
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

#### 2. Cost Calculation Service

```python
# services/cost_calculator.py

# Pricing per 1M tokens (as of Dec 2024, update as needed)
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
    "claude-3-5-haiku-20241022": {
        "input": 0.80,
        "output": 4.00,
        "cache_read": 0.08,
        "cache_write": 1.00,
    },
}

def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int,
    cache_creation_tokens: int,
    model: str
) -> float:
    """Calculate estimated cost in USD."""
    pricing = MODEL_PRICING.get(model, MODEL_PRICING["claude-sonnet-4-20250514"])

    cost = (
        (input_tokens / 1_000_000) * pricing["input"]
        + (output_tokens / 1_000_000) * pricing["output"]
        + (cache_read_tokens / 1_000_000) * pricing["cache_read"]
        + (cache_creation_tokens / 1_000_000) * pricing["cache_write"]
    )

    return round(cost, 6)
```

#### 3. Stats Aggregation Service

```python
# services/stats_aggregator.py

@dataclass
class AggregatedStats:
    """Aggregated statistics for a time period."""
    total_sessions: int
    total_input_tokens: int
    total_output_tokens: int
    total_cache_read_tokens: int
    total_cache_creation_tokens: int
    total_cost_usd: float
    cache_hit_rate: float  # cache_read / (cache_read + input)
    avg_session_duration_seconds: float
    avg_tokens_per_session: float

    # Breakdowns
    by_model: dict[str, "AggregatedStats"]
    by_session_kind: dict[str, "AggregatedStats"]
    by_day: dict[str, "AggregatedStats"]  # ISO date string -> stats

async def get_stats(
    repo_id: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    group_by: str = "day",  # day, week, month
) -> AggregatedStats:
    """Get aggregated statistics with optional filtering."""
    ...

async def sync_session_stats(session_id: str, transcript: ParsedTranscript) -> UsageStats:
    """Sync stats from a parsed transcript to the database."""
    ...
```

#### 4. New Router: `routers/stats.py`

```python
router = APIRouter()

@router.get("/stats")
async def get_usage_stats(
    repo_id: int | None = None,
    start_date: str | None = None,  # ISO format
    end_date: str | None = None,
    group_by: str = "day",
):
    """Get aggregated usage statistics."""
    ...

@router.get("/stats/sessions")
async def get_session_stats(
    repo_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    sort_by: str = "cost",  # cost, tokens, date
    sort_order: str = "desc",
):
    """Get per-session statistics for detailed view."""
    ...

@router.get("/stats/tools")
async def get_tool_stats(
    repo_id: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
):
    """Get tool usage statistics."""
    ...

@router.post("/stats/sync")
async def sync_all_stats(repo_id: int | None = None):
    """Trigger a full sync of stats from all transcripts."""
    ...
```

### Frontend

#### 1. New Component: `StatsDashboard.tsx`

```typescript
interface StatsDashboardProps {
  repoId: number | null;
}

export function StatsDashboard({ repoId }: StatsDashboardProps) {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const { stats, loading } = useStats(repoId, dateRange, groupBy);

  return (
    <div className="p-4 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Cost" value={`$${stats.total_cost_usd.toFixed(2)}`} />
        <StatCard title="Total Tokens" value={formatTokens(stats.total_input_tokens + stats.total_output_tokens)} />
        <StatCard title="Sessions" value={stats.total_sessions} />
        <StatCard title="Cache Hit Rate" value={`${(stats.cache_hit_rate * 100).toFixed(1)}%`} />
      </div>

      {/* Cost Over Time Chart */}
      <CostChart data={stats.by_day} />

      {/* Breakdowns */}
      <div className="grid grid-cols-2 gap-4">
        <ModelBreakdown data={stats.by_model} />
        <SessionKindBreakdown data={stats.by_session_kind} />
      </div>

      {/* Top Sessions by Cost */}
      <TopSessionsTable repoId={repoId} />

      {/* Tool Usage */}
      <ToolUsageChart repoId={repoId} />
    </div>
  );
}
```

#### 2. Chart Components

Use a lightweight charting library like `recharts` or render simple SVG/CSS charts:

```typescript
// Simple bar chart for daily costs
function CostChart({ data }: { data: Record<string, AggregatedStats> }) {
  const days = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const maxCost = Math.max(...days.map(([, s]) => s.total_cost_usd));

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-4">Cost Over Time</h3>
      <div className="flex items-end gap-1 h-40">
        {days.map(([date, dayStats]) => (
          <div key={date} className="flex-1 flex flex-col items-center">
            <div
              className="w-full bg-blue-500 rounded-t"
              style={{ height: `${(dayStats.total_cost_usd / maxCost) * 100}%` }}
              title={`${date}: $${dayStats.total_cost_usd.toFixed(4)}`}
            />
            <span className="text-xs text-gray-500 mt-1">
              {new Date(date).getDate()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 3. Hook: `useStats.ts`

```typescript
export function useStats(
  repoId: number | null,
  dateRange: string,
  groupBy: string
) {
  const [stats, setStats] = useState<AggregatedStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const params = new URLSearchParams({
        ...(repoId && { repo_id: String(repoId) }),
        group_by: groupBy,
        ...getDateRangeParams(dateRange),
      });

      const response = await fetch(`/api/stats?${params}`);
      const data = await response.json();
      setStats(data);
      setLoading(false);
    };

    fetchStats();
  }, [repoId, dateRange, groupBy]);

  return { stats, loading };
}
```

### UI Integration

Add a new "Stats" tab in the sidebar alongside Issues/PRs/Sessions:

```typescript
// In App.tsx
type Tab = 'issues' | 'prs' | 'sessions' | 'stats';

// In the tab bar
<button onClick={() => setActiveTab('stats')}>
  Stats
</button>

// In the content area
{activeTab === 'stats' && (
  <StatsDashboard repoId={selectedRepo?.id ?? null} />
)}
```

### Data Sync Strategy

1. **On Session Load**: When a session transcript is parsed, update the stats table
2. **Background Sync**: Periodic job to sync any missed sessions
3. **On-Demand Sync**: Button to force full resync

```python
# In sessions router, when loading a session
async def get_session(session_id: str):
    transcript = parse_transcript(session_id, working_dir)
    if transcript:
        # Fire-and-forget stats sync
        asyncio.create_task(sync_session_stats(session_id, transcript))
    return session
```

## Implementation Order

1. **Phase 1**: Database model + cost calculation service
2. **Phase 2**: Stats aggregation API endpoints
3. **Phase 3**: Basic dashboard UI with summary cards
4. **Phase 4**: Charts and breakdowns
5. **Phase 5**: Background sync and data integrity

## Files to Create/Modify

**New Files:**
- `backend/app/services/cost_calculator.py`
- `backend/app/services/stats_aggregator.py`
- `backend/app/routers/stats.py`
- `frontend/src/components/StatsDashboard.tsx`
- `frontend/src/components/stats/CostChart.tsx`
- `frontend/src/components/stats/StatCard.tsx`
- `frontend/src/components/stats/ModelBreakdown.tsx`
- `frontend/src/components/stats/ToolUsageChart.tsx`
- `frontend/src/hooks/useStats.ts`

**Modify:**
- `backend/app/models.py` - Add UsageStats model
- `backend/app/main.py` - Add stats router
- `frontend/src/App.tsx` - Add Stats tab
- `frontend/src/types.ts` - Add stats types

## Future Enhancements

- Budget alerts (notify when approaching limit)
- Cost forecasting based on trends
- Per-issue/PR cost attribution
- Export to CSV/JSON
- Comparison with previous periods
- Model efficiency recommendations (e.g., "consider haiku for simple tasks")
