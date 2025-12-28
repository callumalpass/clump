import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityChart } from './ActivityChart';
import type { DailyActivity } from '../../types';

function createMockData(count: number = 10): DailyActivity[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    message_count: (i + 1) * 10,
    session_count: i + 1,
    tool_call_count: (i + 1) * 50,
  }));
}

describe('ActivityChart', () => {
  describe('Empty state', () => {
    it('shows no data message when data is empty', () => {
      render(<ActivityChart data={[]} />);
      expect(screen.getByText('No activity data available')).toBeInTheDocument();
    });
  });

  describe('Metric selector', () => {
    it('renders all metric buttons', () => {
      render(<ActivityChart data={createMockData()} />);

      expect(screen.getByRole('button', { name: 'Messages' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sessions' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tool Calls' })).toBeInTheDocument();
    });

    it('defaults to Messages metric', () => {
      render(<ActivityChart data={createMockData()} />);

      const messagesBtn = screen.getByRole('button', { name: 'Messages' });
      expect(messagesBtn).toHaveClass('bg-gray-700');
    });

    it('switches metric when button clicked', () => {
      render(<ActivityChart data={createMockData()} />);

      const sessionsBtn = screen.getByRole('button', { name: 'Sessions' });
      fireEvent.click(sessionsBtn);

      expect(sessionsBtn).toHaveClass('bg-gray-700');
      expect(screen.getByRole('button', { name: 'Messages' })).not.toHaveClass('bg-gray-700');
    });
  });

  describe('Chart rendering', () => {
    it('renders SVG chart with bars', () => {
      render(<ActivityChart data={createMockData(5)} />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();

      const bars = svg?.querySelectorAll('rect');
      expect(bars).toHaveLength(5);
    });

    it('limits data to specified days', () => {
      render(<ActivityChart data={createMockData(30)} days={7} />);

      const svg = document.querySelector('svg');
      const bars = svg?.querySelectorAll('rect');
      expect(bars).toHaveLength(7);
    });

    it('shows all data when days exceeds data length', () => {
      render(<ActivityChart data={createMockData(5)} days={30} />);

      const svg = document.querySelector('svg');
      const bars = svg?.querySelectorAll('rect');
      expect(bars).toHaveLength(5);
    });
  });

  describe('Tooltip', () => {
    it('shows tooltip on bar hover', () => {
      render(<ActivityChart data={createMockData(5)} />);

      const svg = document.querySelector('svg');
      const firstBar = svg?.querySelector('rect');
      expect(firstBar).toBeInTheDocument();

      fireEvent.mouseEnter(firstBar!);

      // Should show the tooltip with date and value
      const tooltip = document.querySelector('.pointer-events-none');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent('Jan 1');
      expect(tooltip).toHaveTextContent(/messages/i);
    });

    it('hides tooltip on mouse leave', () => {
      render(<ActivityChart data={createMockData(5)} />);

      const svg = document.querySelector('svg');
      const firstBar = svg?.querySelector('rect');

      fireEvent.mouseEnter(firstBar!);
      expect(document.querySelector('.pointer-events-none')).toBeInTheDocument();

      fireEvent.mouseLeave(firstBar!);
      expect(document.querySelector('.pointer-events-none')).not.toBeInTheDocument();
    });

    it('updates tooltip for different metrics', () => {
      render(<ActivityChart data={createMockData(5)} />);

      const svg = document.querySelector('svg');
      const firstBar = svg?.querySelector('rect');

      // Switch to sessions
      fireEvent.click(screen.getByRole('button', { name: 'Sessions' }));
      fireEvent.mouseEnter(firstBar!);

      expect(screen.getByText(/1.*sessions/i)).toBeInTheDocument();
    });
  });

  describe('X-axis labels', () => {
    it('shows start and end dates', () => {
      const data = createMockData(10);
      render(<ActivityChart data={data} />);

      expect(screen.getByText('Jan 1')).toBeInTheDocument();
      expect(screen.getByText('Jan 10')).toBeInTheDocument();
    });
  });

  describe('Bar sizing', () => {
    it('handles single data point', () => {
      render(<ActivityChart data={createMockData(1)} />);

      const svg = document.querySelector('svg');
      const bars = svg?.querySelectorAll('rect');
      expect(bars).toHaveLength(1);
    });

    it('handles large dataset', () => {
      render(<ActivityChart data={createMockData(100)} days={100} />);

      const svg = document.querySelector('svg');
      const bars = svg?.querySelectorAll('rect');
      expect(bars).toHaveLength(100);
    });
  });

  describe('Data sorting', () => {
    it('sorts data by date', () => {
      const unsortedData: DailyActivity[] = [
        { date: '2024-01-03', message_count: 30, session_count: 3, tool_call_count: 150 },
        { date: '2024-01-01', message_count: 10, session_count: 1, tool_call_count: 50 },
        { date: '2024-01-02', message_count: 20, session_count: 2, tool_call_count: 100 },
      ];

      render(<ActivityChart data={unsortedData} />);

      // First and last dates should be in order
      expect(screen.getByText('Jan 1')).toBeInTheDocument();
      expect(screen.getByText('Jan 3')).toBeInTheDocument();
    });
  });

  describe('Height calculation', () => {
    it('handles zero values correctly', () => {
      const dataWithZeros: DailyActivity[] = [
        { date: '2024-01-01', message_count: 0, session_count: 0, tool_call_count: 0 },
        { date: '2024-01-02', message_count: 10, session_count: 1, tool_call_count: 50 },
      ];

      render(<ActivityChart data={dataWithZeros} />);

      const svg = document.querySelector('svg');
      const bars = svg?.querySelectorAll('rect');
      expect(bars).toHaveLength(2);

      // First bar should have height 0 (or close to 0)
      const firstBarHeight = parseFloat(bars![0].getAttribute('height') || '0');
      expect(firstBarHeight).toBe(0);
    });

    it('handles all same values', () => {
      const sameValueData: DailyActivity[] = [
        { date: '2024-01-01', message_count: 50, session_count: 5, tool_call_count: 100 },
        { date: '2024-01-02', message_count: 50, session_count: 5, tool_call_count: 100 },
        { date: '2024-01-03', message_count: 50, session_count: 5, tool_call_count: 100 },
      ];

      render(<ActivityChart data={sameValueData} />);

      const svg = document.querySelector('svg');
      const bars = svg?.querySelectorAll('rect');

      // All bars should have the same height
      const heights = Array.from(bars!).map(bar => bar.getAttribute('height'));
      expect(new Set(heights).size).toBe(1);
    });
  });
});
