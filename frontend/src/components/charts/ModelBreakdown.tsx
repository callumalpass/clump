import { useMemo } from 'react';
import type { ModelUsage } from '../../types';
import { formatCost, formatTokenCount } from '../../utils/costs';

interface ModelBreakdownProps {
  data: ModelUsage[];
  totalCost: number;
}

// Model colors
const MODEL_COLORS: Record<string, string> = {
  'Opus': '#a371f7',      // purple
  'Sonnet': '#58a6ff',    // blue
  'Sonnet 4': '#58a6ff',
  'Sonnet 4.5': '#79c0ff',
  'Sonnet 3.5': '#388bfd',
  'Haiku': '#3fb950',     // green
};

function getModelColor(displayName: string): string {
  return MODEL_COLORS[displayName] ?? '#8b949e';  // gray fallback
}

export function ModelBreakdown({ data, totalCost }: ModelBreakdownProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // Calculate percentages
    return data.map(model => ({
      ...model,
      percentage: totalCost > 0 ? (model.estimated_cost_usd / totalCost) * 100 : 0,
      color: getModelColor(model.display_name),
    }));
  }, [data, totalCost]);

  // Calculate segments for donut chart
  const segments = useMemo(() => {
    let currentAngle = -90; // Start from top
    return chartData.map(model => {
      const angle = (model.percentage / 100) * 360;
      const segment = {
        ...model,
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
      };
      currentAngle += angle;
      return segment;
    });
  }, [chartData]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500">
        No model usage data available
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-center">
      {/* Donut chart */}
      <div className="relative w-40 h-40 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {segments.map((segment, i) => {
            const radius = 40;
            const circumference = 2 * Math.PI * radius;
            const strokeDasharray = circumference;
            const strokeDashoffset = circumference * (1 - segment.percentage / 100);
            const rotation = segment.startAngle + 90;

            return (
              <circle
                key={segment.model}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="18"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: '50% 50%',
                }}
                className="transition-all duration-300"
              />
            );
          })}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-semibold text-white">{formatCost(totalCost)}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
      </div>

      {/* Legend and details */}
      <div className="flex-1 space-y-3 w-full">
        {chartData.map(model => (
          <div key={model.model} className="flex items-center gap-3">
            {/* Color dot */}
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: model.color }}
            />

            {/* Model info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-200 truncate">
                  {model.display_name}
                </span>
                <span className="text-sm text-gray-400 tabular-nums ml-2">
                  {formatCost(model.estimated_cost_usd)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${model.percentage}%`,
                    backgroundColor: model.color,
                  }}
                />
              </div>

              {/* Token breakdown */}
              <div className="mt-1 flex gap-3 text-xs text-gray-500">
                <span>In: {formatTokenCount(model.input_tokens)}</span>
                <span>Out: {formatTokenCount(model.output_tokens)}</span>
                <span>Cache: {formatTokenCount(model.cache_read_tokens)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
