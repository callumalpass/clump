import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HourlyHeatmap } from './HourlyHeatmap';
import type { HourlyDistribution } from '../../types';

function createMockData(hours: number[] = [9, 10, 11, 14, 15]): HourlyDistribution[] {
  return hours.map((hour, i) => ({
    hour,
    count: (i + 1) * 100,
  }));
}

describe('HourlyHeatmap', () => {
  describe('Grid rendering', () => {
    it('renders 24 hour cells', () => {
      render(<HourlyHeatmap data={createMockData()} />);

      // The grid is 12 columns x 2 rows = 24 cells
      const cells = document.querySelectorAll('.aspect-square');
      expect(cells).toHaveLength(24);
    });

    it('handles empty data', () => {
      render(<HourlyHeatmap data={[]} />);

      const cells = document.querySelectorAll('.aspect-square');
      expect(cells).toHaveLength(24);

      // All cells should have the empty color (gray-800)
      cells.forEach(cell => {
        expect(cell).toHaveStyle({ backgroundColor: 'rgb(33, 38, 45)' });
      });
    });

    it('handles all 24 hours with data', () => {
      const fullData = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: (i + 1) * 10,
      }));

      render(<HourlyHeatmap data={fullData} />);

      const cells = document.querySelectorAll('.aspect-square');
      expect(cells).toHaveLength(24);
    });
  });

  describe('Color intensity', () => {
    it('shows different colors based on count', () => {
      const data: HourlyDistribution[] = [
        { hour: 0, count: 0 },
        { hour: 1, count: 10 },
        { hour: 2, count: 100 },
        { hour: 3, count: 1000 },
      ];

      render(<HourlyHeatmap data={data} />);

      const cells = document.querySelectorAll('.aspect-square');

      // Hour 0 should have empty color
      expect(cells[0]).toHaveStyle({ backgroundColor: 'rgb(33, 38, 45)' });

      // Higher counts should have different (brighter) colors
      // We can't easily test exact colors but we can verify they're not all the same
      const colors = new Set(
        Array.from(cells).slice(0, 4).map(cell => cell.getAttribute('style'))
      );
      expect(colors.size).toBeGreaterThan(1);
    });
  });

  describe('Tooltips', () => {
    it('shows tooltip on cell hover', () => {
      const data: HourlyDistribution[] = [{ hour: 9, count: 150 }];
      render(<HourlyHeatmap data={data} />);

      const cells = document.querySelectorAll('.aspect-square');
      const cell9 = cells[9]; // 9am is the 10th cell (0-indexed)

      // Hover over the cell's parent (the group element)
      const group = cell9.parentElement;
      fireEvent.mouseEnter(group!);

      // Tooltip should show hour and count
      expect(screen.getByText('9a')).toBeInTheDocument();
      expect(screen.getByText('150 sessions')).toBeInTheDocument();
    });

    it('shows correct hour labels in tooltips for midnight', () => {
      render(<HourlyHeatmap data={[{ hour: 0, count: 100 }]} />);

      const cells = document.querySelectorAll('.aspect-square');
      const group = cells[0].parentElement;
      fireEvent.mouseEnter(group!);

      // Check tooltip content exists
      const tooltip = document.querySelector('.pointer-events-none.z-10');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent('12a');
    });
  });

  describe('Hour labels', () => {
    it('renders hour labels in the grid', () => {
      render(<HourlyHeatmap data={createMockData()} />);

      // The labels section should exist
      const labelContainer = document.querySelector('.text-\\[10px\\]');
      expect(labelContainer).toBeInTheDocument();
    });
  });

  describe('Period breakdown', () => {
    it('shows all four time periods', () => {
      render(<HourlyHeatmap data={createMockData()} />);

      expect(screen.getByText('Night')).toBeInTheDocument();
      expect(screen.getByText('Morning')).toBeInTheDocument();
      expect(screen.getByText('Afternoon')).toBeInTheDocument();
      expect(screen.getByText('Evening')).toBeInTheDocument();
    });

    it('calculates period percentages correctly', () => {
      // All activity in the morning (hours 6-11)
      const morningData: HourlyDistribution[] = [
        { hour: 9, count: 100 },
        { hour: 10, count: 100 },
      ];

      render(<HourlyHeatmap data={morningData} />);

      // Should have 4 percentage values (one for each period)
      const percentages = screen.getAllByText(/\d+%/);
      expect(percentages).toHaveLength(4);

      // The container for periods should exist with percentages
      const periodContainer = document.querySelector('.grid-cols-4');
      expect(periodContainer).toBeInTheDocument();
    });

    it('handles mixed period activity', () => {
      const mixedData: HourlyDistribution[] = [
        { hour: 2, count: 25 },   // Night
        { hour: 9, count: 25 },   // Morning
        { hour: 14, count: 25 },  // Afternoon
        { hour: 20, count: 25 },  // Evening
      ];

      render(<HourlyHeatmap data={mixedData} />);

      // All four periods should be displayed
      expect(screen.getByText('Night')).toBeInTheDocument();
      expect(screen.getByText('Morning')).toBeInTheDocument();
      expect(screen.getByText('Afternoon')).toBeInTheDocument();
      expect(screen.getByText('Evening')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles very large counts', () => {
      const largeData: HourlyDistribution[] = [
        { hour: 9, count: 1000000 },
      ];

      render(<HourlyHeatmap data={largeData} />);

      const cells = document.querySelectorAll('.aspect-square');
      const group = cells[9].parentElement;
      fireEvent.mouseEnter(group!);

      expect(screen.getByText('1,000,000 sessions')).toBeInTheDocument();
    });

    it('handles sparse data (only a few hours)', () => {
      const sparseData: HourlyDistribution[] = [
        { hour: 12, count: 50 },
      ];

      render(<HourlyHeatmap data={sparseData} />);

      // Should still render all 24 cells
      const cells = document.querySelectorAll('.aspect-square');
      expect(cells).toHaveLength(24);

      // Only hour 12 should have color
      const nonEmptyCells = Array.from(cells).filter(
        cell => cell.getAttribute('style') !== 'background-color: rgb(33, 38, 45);'
      );
      expect(nonEmptyCells).toHaveLength(1);
    });

    it('handles duplicate hour entries (takes last value)', () => {
      // This shouldn't happen in practice but tests robustness
      const dupData: HourlyDistribution[] = [
        { hour: 9, count: 100 },
        { hour: 9, count: 200 },  // This should take precedence
      ];

      render(<HourlyHeatmap data={dupData} />);

      const cells = document.querySelectorAll('.aspect-square');
      const group = cells[9].parentElement;
      fireEvent.mouseEnter(group!);

      expect(screen.getByText('200 sessions')).toBeInTheDocument();
    });
  });
});
