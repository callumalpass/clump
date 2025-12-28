import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelBreakdown } from './ModelBreakdown';
import type { ModelUsage } from '../../types';

function createMockData(): ModelUsage[] {
  return [
    {
      model: 'claude-sonnet-4-20250514',
      display_name: 'Sonnet 4',
      input_tokens: 1000000,
      output_tokens: 500000,
      cache_read_tokens: 800000,
      cache_write_tokens: 100000,
      estimated_cost_usd: 15.00,
    },
    {
      model: 'claude-opus-4-20250514',
      display_name: 'Opus',
      input_tokens: 100000,
      output_tokens: 50000,
      cache_read_tokens: 80000,
      cache_write_tokens: 10000,
      estimated_cost_usd: 10.00,
    },
  ];
}

describe('ModelBreakdown', () => {
  describe('Empty state', () => {
    it('shows no data message when data is empty', () => {
      render(<ModelBreakdown data={[]} totalCost={0} />);
      expect(screen.getByText('No model usage data available')).toBeInTheDocument();
    });
  });

  describe('Donut chart', () => {
    it('renders SVG donut chart', () => {
      render(<ModelBreakdown data={createMockData()} totalCost={25} />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();

      // Should have circle elements for each model
      const circles = svg?.querySelectorAll('circle');
      expect(circles?.length).toBe(2);
    });

    it('shows total cost in center', () => {
      render(<ModelBreakdown data={createMockData()} totalCost={25} />);

      expect(screen.getByText('$25.00')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('formats small costs correctly', () => {
      const smallData: ModelUsage[] = [
        {
          model: 'test',
          display_name: 'Test',
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          estimated_cost_usd: 0.005,
        },
      ];

      render(<ModelBreakdown data={smallData} totalCost={0.005} />);

      // Should render the model without errors (formatCost handles small amounts)
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });

  describe('Legend', () => {
    it('shows all models in legend', () => {
      render(<ModelBreakdown data={createMockData()} totalCost={25} />);

      expect(screen.getByText('Sonnet 4')).toBeInTheDocument();
      expect(screen.getByText('Opus')).toBeInTheDocument();
    });

    it('shows cost per model', () => {
      render(<ModelBreakdown data={createMockData()} totalCost={25} />);

      expect(screen.getByText('$15.00')).toBeInTheDocument();
      expect(screen.getByText('$10.00')).toBeInTheDocument();
    });

    it('shows color dots for each model', () => {
      render(<ModelBreakdown data={createMockData()} totalCost={25} />);

      const colorDots = document.querySelectorAll('.rounded-full.w-3.h-3');
      expect(colorDots).toHaveLength(2);

      // Each dot should have a different color
      const colors = new Set(
        Array.from(colorDots).map(dot => dot.getAttribute('style'))
      );
      expect(colors.size).toBe(2);
    });
  });

  describe('Token breakdown', () => {
    it('shows token counts for each model', () => {
      render(<ModelBreakdown data={createMockData()} totalCost={25} />);

      // Sonnet 4 tokens (1M in, 500K out, 800K cache)
      expect(screen.getByText('In: 1.0M')).toBeInTheDocument();
      expect(screen.getByText('Out: 500K')).toBeInTheDocument();
      expect(screen.getByText('Cache: 800K')).toBeInTheDocument();

      // Opus tokens (100K in, 50K out, 80K cache)
      expect(screen.getByText('In: 100K')).toBeInTheDocument();
      expect(screen.getByText('Out: 50K')).toBeInTheDocument();
      expect(screen.getByText('Cache: 80K')).toBeInTheDocument();
    });

    it('formats small token counts correctly', () => {
      const smallData: ModelUsage[] = [
        {
          model: 'test',
          display_name: 'Test',
          input_tokens: 500,
          output_tokens: 250,
          cache_read_tokens: 100,
          cache_write_tokens: 50,
          estimated_cost_usd: 0.01,
        },
      ];

      render(<ModelBreakdown data={smallData} totalCost={0.01} />);

      expect(screen.getByText('In: 500')).toBeInTheDocument();
      expect(screen.getByText('Out: 250')).toBeInTheDocument();
      expect(screen.getByText('Cache: 100')).toBeInTheDocument();
    });
  });

  describe('Progress bars', () => {
    it('renders progress bars for each model', () => {
      render(<ModelBreakdown data={createMockData()} totalCost={25} />);

      const progressBars = document.querySelectorAll('.bg-gray-800.rounded-full.overflow-hidden');
      expect(progressBars).toHaveLength(2);
    });

    it('calculates percentages based on cost', () => {
      const data: ModelUsage[] = [
        {
          model: 'a',
          display_name: 'Model A',
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          estimated_cost_usd: 75,
        },
        {
          model: 'b',
          display_name: 'Model B',
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          estimated_cost_usd: 25,
        },
      ];

      render(<ModelBreakdown data={data} totalCost={100} />);

      // Find progress bar fills
      const fills = document.querySelectorAll('.rounded-full.transition-all.duration-300');

      // Model A should be 75%
      const fillA = Array.from(fills).find(el => el.getAttribute('style')?.includes('75%'));
      expect(fillA).toBeTruthy();

      // Model B should be 25%
      const fillB = Array.from(fills).find(el => el.getAttribute('style')?.includes('25%'));
      expect(fillB).toBeTruthy();
    });
  });

  describe('Model colors', () => {
    it('assigns correct colors to known models', () => {
      const data: ModelUsage[] = [
        { model: 'opus', display_name: 'Opus', input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, estimated_cost_usd: 10 },
        { model: 'sonnet', display_name: 'Sonnet', input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, estimated_cost_usd: 10 },
        { model: 'haiku', display_name: 'Haiku', input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, estimated_cost_usd: 10 },
      ];

      render(<ModelBreakdown data={data} totalCost={30} />);

      const colorDots = document.querySelectorAll('.rounded-full.w-3.h-3');

      // Opus should be purple (#a371f7)
      const opusDot = colorDots[0];
      expect(opusDot.getAttribute('style')).toContain('rgb(163, 113, 247)');

      // Sonnet should be blue (#58a6ff)
      const sonnetDot = colorDots[1];
      expect(sonnetDot.getAttribute('style')).toContain('rgb(88, 166, 255)');

      // Haiku should be green (#3fb950)
      const haikuDot = colorDots[2];
      expect(haikuDot.getAttribute('style')).toContain('rgb(63, 185, 80)');
    });

    it('uses fallback color for unknown models', () => {
      const data: ModelUsage[] = [
        { model: 'unknown', display_name: 'Unknown Model', input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, estimated_cost_usd: 10 },
      ];

      render(<ModelBreakdown data={data} totalCost={10} />);

      const colorDot = document.querySelector('.rounded-full.w-3.h-3');
      // Should use gray fallback (#8b949e)
      expect(colorDot?.getAttribute('style')).toContain('rgb(139, 148, 158)');
    });
  });

  describe('Edge cases', () => {
    it('handles single model', () => {
      const singleData: ModelUsage[] = [
        {
          model: 'sonnet',
          display_name: 'Sonnet',
          input_tokens: 1000000,
          output_tokens: 500000,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          estimated_cost_usd: 10,
        },
      ];

      render(<ModelBreakdown data={singleData} totalCost={10} />);

      expect(screen.getByText('Sonnet')).toBeInTheDocument();

      // Progress bar should exist
      const progressBars = document.querySelectorAll('.bg-gray-800.rounded-full.overflow-hidden');
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it('handles zero total cost', () => {
      const zeroData: ModelUsage[] = [
        {
          model: 'test',
          display_name: 'Test',
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          estimated_cost_usd: 0,
        },
      ];

      render(<ModelBreakdown data={zeroData} totalCost={0} />);

      // Should still render without errors
      expect(screen.getByText('Test')).toBeInTheDocument();
      // Total cost should show in some form
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('handles many models', () => {
      const manyModels: ModelUsage[] = Array.from({ length: 10 }, (_, i) => ({
        model: `model-${i}`,
        display_name: `Model ${i}`,
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        estimated_cost_usd: 1,
      }));

      render(<ModelBreakdown data={manyModels} totalCost={10} />);

      // All models should be visible
      for (let i = 0; i < 10; i++) {
        expect(screen.getByText(`Model ${i}`)).toBeInTheDocument();
      }
    });
  });
});
