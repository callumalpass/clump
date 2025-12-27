import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ElapsedTimer } from './ElapsedTimer';

// Mock the useElapsedTime hook
vi.mock('../hooks/useElapsedTime', () => ({
  useElapsedTime: vi.fn(),
}));

import { useElapsedTime } from '../hooks/useElapsedTime';

describe('ElapsedTimer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders the elapsed time from the hook', () => {
      vi.mocked(useElapsedTime).mockReturnValue('5m 30s');

      render(<ElapsedTimer startTime="2025-01-01T00:00:00Z" />);

      expect(screen.getByText('5m 30s')).toBeInTheDocument();
    });

    it('renders empty string when hook returns empty', () => {
      vi.mocked(useElapsedTime).mockReturnValue('');

      const { container } = render(<ElapsedTimer startTime="2025-01-01T00:00:00Z" />);

      expect(container.querySelector('span')).toHaveTextContent('');
    });

    it('renders different durations correctly', () => {
      vi.mocked(useElapsedTime).mockReturnValue('1h 15m');

      render(<ElapsedTimer startTime="2025-01-01T00:00:00Z" />);

      expect(screen.getByText('1h 15m')).toBeInTheDocument();
    });

    it('renders seconds-only durations', () => {
      vi.mocked(useElapsedTime).mockReturnValue('45s');

      render(<ElapsedTimer startTime="2025-01-01T00:00:00Z" />);

      expect(screen.getByText('45s')).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('passes startTime to useElapsedTime hook', () => {
      vi.mocked(useElapsedTime).mockReturnValue('0s');

      render(<ElapsedTimer startTime="2025-01-01T12:00:00Z" />);

      expect(useElapsedTime).toHaveBeenCalledWith('2025-01-01T12:00:00Z', true);
    });

    it('passes isActive=true by default', () => {
      vi.mocked(useElapsedTime).mockReturnValue('0s');

      render(<ElapsedTimer startTime="2025-01-01T00:00:00Z" />);

      expect(useElapsedTime).toHaveBeenCalledWith('2025-01-01T00:00:00Z', true);
    });

    it('passes isActive=false when specified', () => {
      vi.mocked(useElapsedTime).mockReturnValue('10m 0s');

      render(<ElapsedTimer startTime="2025-01-01T00:00:00Z" isActive={false} />);

      expect(useElapsedTime).toHaveBeenCalledWith('2025-01-01T00:00:00Z', false);
    });

    it('applies className when provided', () => {
      vi.mocked(useElapsedTime).mockReturnValue('3m 20s');

      const { container } = render(
        <ElapsedTimer startTime="2025-01-01T00:00:00Z" className="text-green-500" />
      );

      expect(container.querySelector('span')).toHaveClass('text-green-500');
    });

    it('applies empty className by default', () => {
      vi.mocked(useElapsedTime).mockReturnValue('0s');

      const { container } = render(<ElapsedTimer startTime="2025-01-01T00:00:00Z" />);

      const span = container.querySelector('span');
      expect(span).toBeInTheDocument();
      // Empty className means no classes added
      expect(span?.className).toBe('');
    });

    it('applies multiple CSS classes', () => {
      vi.mocked(useElapsedTime).mockReturnValue('2m 0s');

      const { container } = render(
        <ElapsedTimer
          startTime="2025-01-01T00:00:00Z"
          className="text-sm font-mono text-gray-400"
        />
      );

      const span = container.querySelector('span');
      expect(span).toHaveClass('text-sm');
      expect(span).toHaveClass('font-mono');
      expect(span).toHaveClass('text-gray-400');
    });
  });

  describe('Integration with different time formats', () => {
    it('works with ISO strings with timezone', () => {
      vi.mocked(useElapsedTime).mockReturnValue('5m 0s');

      render(<ElapsedTimer startTime="2025-01-01T00:00:00+05:00" />);

      expect(useElapsedTime).toHaveBeenCalledWith('2025-01-01T00:00:00+05:00', true);
      expect(screen.getByText('5m 0s')).toBeInTheDocument();
    });

    it('works with ISO strings without timezone (naive)', () => {
      vi.mocked(useElapsedTime).mockReturnValue('15m 30s');

      render(<ElapsedTimer startTime="2025-01-01T00:00:00" />);

      expect(useElapsedTime).toHaveBeenCalledWith('2025-01-01T00:00:00', true);
      expect(screen.getByText('15m 30s')).toBeInTheDocument();
    });
  });

  describe('Re-rendering behavior', () => {
    it('updates when startTime changes', () => {
      vi.mocked(useElapsedTime).mockReturnValue('1m 0s');

      const { rerender } = render(<ElapsedTimer startTime="2025-01-01T00:00:00Z" />);

      expect(useElapsedTime).toHaveBeenCalledWith('2025-01-01T00:00:00Z', true);

      vi.mocked(useElapsedTime).mockReturnValue('2m 0s');
      rerender(<ElapsedTimer startTime="2025-01-01T01:00:00Z" />);

      expect(useElapsedTime).toHaveBeenCalledWith('2025-01-01T01:00:00Z', true);
    });

    it('updates when isActive changes', () => {
      vi.mocked(useElapsedTime).mockReturnValue('5m 0s');

      const { rerender } = render(<ElapsedTimer startTime="2025-01-01T00:00:00Z" isActive={true} />);

      expect(useElapsedTime).toHaveBeenCalledWith('2025-01-01T00:00:00Z', true);

      rerender(<ElapsedTimer startTime="2025-01-01T00:00:00Z" isActive={false} />);

      expect(useElapsedTime).toHaveBeenCalledWith('2025-01-01T00:00:00Z', false);
    });
  });
});
