import { useState } from 'react';
import type { StatsResponse } from '../types';
import { formatCost } from '../utils/costs';
import { ActivityChart } from './charts/ActivityChart';
import { HourlyHeatmap } from './charts/HourlyHeatmap';
import { ModelBreakdown } from './charts/ModelBreakdown';

interface StatsViewProps {
  stats: StatsResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

type DateRange = 7 | 14 | 30 | 90 | 'all';

export function StatsView({ stats, loading, error, onRefresh }: StatsViewProps) {
  const [dateRange, setDateRange] = useState<DateRange>(30);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-red-400">{error}</div>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">No stats available</div>
      </div>
    );
  }

  const daysToShow = dateRange === 'all' ? stats.daily_activity.length : dateRange;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Last updated: {stats.last_computed_date}
          </p>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm transition-colors flex items-center gap-2"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Sessions"
            value={stats.total_sessions.toLocaleString()}
            subtext={stats.first_session_date ? `Since ${formatDateShort(stats.first_session_date)}` : undefined}
          />
          <StatCard
            label="Total Messages"
            value={stats.total_messages.toLocaleString()}
          />
          <StatCard
            label="Estimated Cost"
            value={formatCost(stats.total_estimated_cost_usd)}
            subtext="All time"
            highlight
          />
          <StatCard
            label="Longest Session"
            value={stats.longest_session_minutes ? formatDuration(stats.longest_session_minutes) : 'N/A'}
          />
        </div>

        {/* This week summary */}
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-3">This Week</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-semibold text-white tabular-nums">
                {stats.week_stats.message_count.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Messages</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white tabular-nums">
                {stats.week_stats.session_count.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Sessions</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white tabular-nums">
                {stats.week_stats.tool_call_count.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Tool Calls</div>
            </div>
          </div>
        </div>

        {/* Activity chart */}
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-400">Daily Activity</h2>
            <div className="flex gap-1">
              {([7, 14, 30, 90, 'all'] as DateRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    dateRange === range
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  {range === 'all' ? 'All' : `${range}d`}
                </button>
              ))}
            </div>
          </div>
          <ActivityChart data={stats.daily_activity} days={daysToShow} />
        </div>

        {/* Two column layout for model breakdown and hourly distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Model breakdown */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h2 className="text-sm font-medium text-gray-400 mb-4">Model Usage</h2>
            <ModelBreakdown
              data={stats.model_usage}
              totalCost={stats.total_estimated_cost_usd}
            />
          </div>

          {/* Hourly distribution */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h2 className="text-sm font-medium text-gray-400 mb-4">Activity by Hour</h2>
            <HourlyHeatmap data={stats.hourly_distribution} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
}

function StatCard({ label, value, subtext, highlight }: StatCardProps) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${highlight ? 'text-green-400' : 'text-white'}`}>
        {value}
      </div>
      {subtext && <div className="text-xs text-gray-600 mt-1">{subtext}</div>}
    </div>
  );
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}
