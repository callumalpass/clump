import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatsModal } from './StatsModal';
import type { StatsResponse } from '../types';

// Mock StatsView since we test it separately
vi.mock('./StatsView', () => ({
  StatsView: ({
    stats,
    loading,
    error,
    onRefresh,
  }: {
    stats: StatsResponse | null;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
  }) => (
    <div data-testid="stats-view">
      <span data-testid="stats-loading">{loading.toString()}</span>
      <span data-testid="stats-error">{error || 'no-error'}</span>
      <span data-testid="stats-data">{stats ? 'has-stats' : 'no-stats'}</span>
      <button data-testid="stats-refresh" onClick={onRefresh}>
        Refresh
      </button>
    </div>
  ),
}));

function createMockStats(): StatsResponse {
  return {
    last_computed_date: '2024-01-15',
    total_sessions: 100,
    total_messages: 2000,
    first_session_date: '2023-06-01',
    longest_session_minutes: 60,
    daily_activity: [],
    daily_model_tokens: [],
    model_usage: [],
    hourly_distribution: [],
    today_stats: null,
    week_stats: { date: '', message_count: 100, session_count: 10, tool_call_count: 500 },
    total_estimated_cost_usd: 10.00,
  };
}

describe('StatsModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    stats: createMockStats(),
    loading: false,
    error: null,
    onRefresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<StatsModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('Usage Statistics')).not.toBeInTheDocument();
    });

    it('renders modal when isOpen is true', () => {
      render(<StatsModal {...defaultProps} />);
      expect(screen.getByText('Usage Statistics')).toBeInTheDocument();
    });
  });

  describe('Modal structure', () => {
    it('renders header with title', () => {
      render(<StatsModal {...defaultProps} />);
      expect(screen.getByText('Usage Statistics')).toBeInTheDocument();
    });

    it('renders close button with aria-label', () => {
      render(<StatsModal {...defaultProps} />);
      const closeButton = screen.getByRole('button', { name: 'Close' });
      expect(closeButton).toBeInTheDocument();
    });

    it('renders StatsView with correct props', () => {
      render(<StatsModal {...defaultProps} loading={true} error="test error" />);

      expect(screen.getByTestId('stats-view')).toBeInTheDocument();
      expect(screen.getByTestId('stats-loading')).toHaveTextContent('true');
      expect(screen.getByTestId('stats-error')).toHaveTextContent('test error');
      expect(screen.getByTestId('stats-data')).toHaveTextContent('has-stats');
    });
  });

  describe('Close functionality', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<StatsModal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking backdrop', () => {
      const onClose = vi.fn();
      render(<StatsModal {...defaultProps} onClose={onClose} />);

      // Click the backdrop (the div with bg-black/60)
      const backdrop = document.querySelector('.bg-black\\/60');
      expect(backdrop).toBeInTheDocument();
      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<StatsModal {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not respond to Escape when modal is closed', () => {
      const onClose = vi.fn();
      render(<StatsModal {...defaultProps} isOpen={false} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Refresh functionality', () => {
    it('passes onRefresh to StatsView', () => {
      const onRefresh = vi.fn();
      render(<StatsModal {...defaultProps} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByTestId('stats-refresh'));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('Props forwarding', () => {
    it('forwards stats to StatsView', () => {
      render(<StatsModal {...defaultProps} stats={null} />);
      expect(screen.getByTestId('stats-data')).toHaveTextContent('no-stats');
    });

    it('forwards loading state to StatsView', () => {
      render(<StatsModal {...defaultProps} loading={false} />);
      expect(screen.getByTestId('stats-loading')).toHaveTextContent('false');
    });

    it('forwards error to StatsView', () => {
      render(<StatsModal {...defaultProps} error={null} />);
      expect(screen.getByTestId('stats-error')).toHaveTextContent('no-error');
    });
  });

  describe('Keyboard cleanup', () => {
    it('removes keyboard listener when modal closes', () => {
      const onClose = vi.fn();
      const { rerender } = render(<StatsModal {...defaultProps} onClose={onClose} />);

      // Close the modal
      rerender(<StatsModal {...defaultProps} isOpen={false} onClose={onClose} />);

      // Escape should not trigger onClose after modal is closed
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('removes keyboard listener on unmount', () => {
      const onClose = vi.fn();
      const { unmount } = render(<StatsModal {...defaultProps} onClose={onClose} />);

      unmount();

      // Escape should not trigger anything after unmount
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
