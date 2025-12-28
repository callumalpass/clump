import { useMemo, useState } from 'react';
import type { DailyActivity } from '../../types';

interface ActivityChartProps {
  data: DailyActivity[];
  days?: number;  // Number of days to show (default: 30)
}

type MetricKey = 'message_count' | 'session_count' | 'tool_call_count';

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: 'message_count', label: 'Messages', color: '#58a6ff' },
  { key: 'session_count', label: 'Sessions', color: '#3fb950' },
  { key: 'tool_call_count', label: 'Tool Calls', color: '#a371f7' },
];

export function ActivityChart({ data, days = 30 }: ActivityChartProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('message_count');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const chartData = useMemo(() => {
    // Sort by date and take last N days
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-days);
  }, [data, days]);

  const maxValue = useMemo(() => {
    if (chartData.length === 0) return 1;
    return Math.max(...chartData.map(d => d[activeMetric]), 1);
  }, [chartData, activeMetric]);

  const activeColor = METRICS.find(m => m.key === activeMetric)?.color ?? '#58a6ff';

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500">
        No activity data available
      </div>
    );
  }

  const barWidth = Math.max(4, Math.floor(100 / chartData.length) - 1);
  const gap = 1;

  return (
    <div className="space-y-3">
      {/* Metric selector */}
      <div className="flex gap-2">
        {METRICS.map(metric => (
          <button
            key={metric.key}
            onClick={() => setActiveMetric(metric.key)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeMetric === metric.key
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800'
            }`}
            style={activeMetric === metric.key ? { borderBottom: `2px solid ${metric.color}` } : undefined}
          >
            {metric.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="relative h-40">
        <svg
          className="w-full h-full"
          viewBox={`0 0 ${chartData.length * (barWidth + gap)} 100`}
          preserveAspectRatio="none"
        >
          {chartData.map((day, i) => {
            const value = day[activeMetric];
            const height = (value / maxValue) * 90;
            const x = i * (barWidth + gap);
            const y = 95 - height;
            const isHovered = hoveredIndex === i;

            return (
              <rect
                key={day.date}
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={1}
                fill={activeColor}
                opacity={isHovered ? 1 : 0.7}
                className="transition-opacity cursor-pointer"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredIndex !== null && chartData[hoveredIndex] && (
          <div
            className="absolute top-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs shadow-lg pointer-events-none z-10"
            style={{
              left: `${(hoveredIndex / chartData.length) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="text-gray-400">{formatDate(chartData[hoveredIndex].date)}</div>
            <div className="font-medium" style={{ color: activeColor }}>
              {chartData[hoveredIndex][activeMetric].toLocaleString()} {METRICS.find(m => m.key === activeMetric)?.label.toLowerCase()}
            </div>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>{formatDate(chartData[0]?.date)}</span>
        <span>{formatDate(chartData[chartData.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
