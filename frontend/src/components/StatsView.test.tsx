import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatsView } from './StatsView';
import type { StatsResponse } from '../types';

// Mock the chart components
vi.mock('./charts/ActivityChart', () => ({
  ActivityChart: ({ data, days }: { data: unknown[]; days: number }) => (
    <div data-testid="activity-chart" data-days={days} data-count={data.length}>
      Activity Chart
    </div>
  ),
}));

vi.mock('./charts/HourlyHeatmap', () => ({
  HourlyHeatmap: ({ data }: { data: unknown[] }) => (
    <div data-testid="hourly-heatmap" data-count={data.length}>
      Hourly Heatmap
    </div>
  ),
}));

vi.mock('./charts/ModelBreakdown', () => ({
  ModelBreakdown: ({ data, totalCost }: { data: unknown[]; totalCost: number }) => (
    <div data-testid="model-breakdown" data-count={data.length} data-cost={totalCost}>
      Model Breakdown
    </div>
  ),
}));

function createMockStats(overrides: Partial<StatsResponse> = {}): StatsResponse {
  return {
    last_computed_date: '2024-01-15',
    total_sessions: 150,
    total_messages: 2500,
    first_session_date: '2023-06-01',
    longest_session_minutes: 120,
    daily_activity: [
      { date: '2024-01-14', message_count: 50, session_count: 5, tool_call_count: 200 },
      { date: '2024-01-15', message_count: 75, session_count: 8, tool_call_count: 300 },
    ],
    daily_model_tokens: [],
    model_usage: [
      {
        model: 'claude-sonnet-4',
        display_name: 'Sonnet 4',
        input_tokens: 100000,
        output_tokens: 50000,
        cache_read_tokens: 80000,
        cache_write_tokens: 10000,
        estimated_cost_usd: 1.50,
      },
    ],
    hourly_distribution: [
      { hour: 9, count: 100 },
      { hour: 10, count: 150 },
    ],
    today_stats: { date: '2024-01-15', message_count: 75, session_count: 8, tool_call_count: 300 },
    week_stats: { date: '', message_count: 500, session_count: 40, tool_call_count: 2000 },
    total_estimated_cost_usd: 25.50,
    ...overrides,
  };
}

describe('StatsView', () => {
  const defaultProps = {
    stats: createMockStats(),
    loading: false,
    error: null,
    onRefresh: vi.fn(),
  };

  describe('Loading state', () => {
    it('shows skeleton loading state when loading with no stats', () => {
      render(<StatsView {...defaultProps} stats={null} loading={true} />);
      // The component shows a skeleton loading UI, not text
      // Verify skeleton elements are rendered (shimmer placeholders)
      const skeletonElements = document.querySelectorAll('.skeleton-shimmer');
      expect(skeletonElements.length).toBeGreaterThan(0);
    });

    it('shows stats while loading if stats exist (refresh scenario)', () => {
      render(<StatsView {...defaultProps} loading={true} />);
      expect(screen.queryByText('Loading stats...')).not.toBeInTheDocument();
      expect(screen.getByText('Total Sessions')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error message and retry button', () => {
      const onRefresh = vi.fn();
      render(<StatsView {...defaultProps} stats={null} error="Failed to load stats" onRefresh={onRefresh} />);

      expect(screen.getByText('Failed to load stats')).toBeInTheDocument();
      const retryButton = screen.getByRole('button', { name: 'Retry' });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('Empty state', () => {
    it('shows no stats available message when stats is null', () => {
      render(<StatsView {...defaultProps} stats={null} />);
      expect(screen.getByText('No stats available')).toBeInTheDocument();
    });
  });

  describe('Stats display', () => {
    it('renders summary cards with correct values', () => {
      render(<StatsView {...defaultProps} />);

      expect(screen.getByText('Total Sessions')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();

      expect(screen.getByText('Total Messages')).toBeInTheDocument();
      expect(screen.getByText('2,500')).toBeInTheDocument();

      expect(screen.getByText('Estimated Cost')).toBeInTheDocument();
      expect(screen.getByText('$25.50')).toBeInTheDocument();

      expect(screen.getByText('Longest Session')).toBeInTheDocument();
      expect(screen.getByText('2h 0m')).toBeInTheDocument();
    });

    it('shows "Since" date from first_session_date', () => {
      render(<StatsView {...defaultProps} />);
      expect(screen.getByText('Since Jun 2023')).toBeInTheDocument();
    });

    it('renders week stats section', () => {
      render(<StatsView {...defaultProps} />);

      expect(screen.getByText('This Week')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument(); // week messages
      expect(screen.getByText('40')).toBeInTheDocument(); // week sessions
      expect(screen.getByText('2,000')).toBeInTheDocument(); // week tool calls
    });

    it('renders chart components', () => {
      render(<StatsView {...defaultProps} />);

      expect(screen.getByTestId('activity-chart')).toBeInTheDocument();
      expect(screen.getByTestId('hourly-heatmap')).toBeInTheDocument();
      expect(screen.getByTestId('model-breakdown')).toBeInTheDocument();
    });
  });

  describe('Date range selector', () => {
    it('renders date range buttons', () => {
      render(<StatsView {...defaultProps} />);

      expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '14d' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '90d' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    });

    it('defaults to 30 days', () => {
      render(<StatsView {...defaultProps} />);
      const chart = screen.getByTestId('activity-chart');
      expect(chart).toHaveAttribute('data-days', '30');
    });

    it('changes date range when button clicked', () => {
      render(<StatsView {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '7d' }));
      expect(screen.getByTestId('activity-chart')).toHaveAttribute('data-days', '7');

      fireEvent.click(screen.getByRole('button', { name: '90d' }));
      expect(screen.getByTestId('activity-chart')).toHaveAttribute('data-days', '90');
    });

    it('shows all days when "All" is selected', () => {
      const stats = createMockStats({
        daily_activity: Array.from({ length: 100 }, (_, i) => ({
          date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          message_count: 10,
          session_count: 1,
          tool_call_count: 50,
        })),
      });

      render(<StatsView {...defaultProps} stats={stats} />);
      fireEvent.click(screen.getByRole('button', { name: 'All' }));
      expect(screen.getByTestId('activity-chart')).toHaveAttribute('data-days', '100');
    });
  });

  describe('Refresh functionality', () => {
    it('calls onRefresh when refresh button is clicked', () => {
      const onRefresh = vi.fn();
      render(<StatsView {...defaultProps} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('disables refresh button while loading', () => {
      render(<StatsView {...defaultProps} loading={true} />);
      expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
    });

    it('shows spinner animation while loading', () => {
      render(<StatsView {...defaultProps} loading={true} />);
      const svg = screen.getByRole('button', { name: /refresh/i }).querySelector('svg');
      expect(svg).toHaveClass('animate-spin');
    });
  });

  describe('Edge cases', () => {
    it('handles missing longest_session_minutes', () => {
      const stats = createMockStats({ longest_session_minutes: null });
      render(<StatsView {...defaultProps} stats={stats} />);
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('handles missing first_session_date', () => {
      const stats = createMockStats({ first_session_date: null });
      render(<StatsView {...defaultProps} stats={stats} />);
      // Should not show "Since" text
      expect(screen.queryByText(/Since/)).not.toBeInTheDocument();
    });

    it('formats duration correctly for various lengths', () => {
      // Minutes only
      const shortStats = createMockStats({ longest_session_minutes: 45 });
      const { rerender } = render(<StatsView {...defaultProps} stats={shortStats} />);
      expect(screen.getByText('45m')).toBeInTheDocument();

      // Hours and minutes
      const mediumStats = createMockStats({ longest_session_minutes: 90 });
      rerender(<StatsView {...defaultProps} stats={mediumStats} />);
      expect(screen.getByText('1h 30m')).toBeInTheDocument();

      // Days, hours (very long session)
      const longStats = createMockStats({ longest_session_minutes: 1500 }); // 25 hours
      rerender(<StatsView {...defaultProps} stats={longStats} />);
      expect(screen.getByText('1d 1h')).toBeInTheDocument();
    });
  });
});
