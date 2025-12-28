import { useMemo } from 'react';
import type { HourlyDistribution } from '../../types';

interface HourlyHeatmapProps {
  data: HourlyDistribution[];
}

const HOUR_LABELS = [
  '12a', '1a', '2a', '3a', '4a', '5a',
  '6a', '7a', '8a', '9a', '10a', '11a',
  '12p', '1p', '2p', '3p', '4p', '5p',
  '6p', '7p', '8p', '9p', '10p', '11p',
];

export function HourlyHeatmap({ data }: HourlyHeatmapProps) {
  const { hourData, maxCount, totalCount } = useMemo(() => {
    // Create a map for quick lookup
    const hourMap = new Map(data.map(d => [d.hour, d.count]));

    // Ensure we have all 24 hours
    const hourData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourMap.get(i) ?? 0,
    }));

    const maxCount = Math.max(...hourData.map(d => d.count), 1);
    const totalCount = hourData.reduce((sum, d) => sum + d.count, 0);

    return { hourData, maxCount, totalCount };
  }, [data]);

  const getIntensity = (count: number): number => {
    if (count === 0) return 0;
    // Use log scale for better distribution
    return Math.min(1, Math.log(count + 1) / Math.log(maxCount + 1));
  };

  const getColor = (intensity: number): string => {
    if (intensity === 0) return 'rgb(33, 38, 45)';  // gray-800
    // Gradient from dim blue to bright blue
    const r = Math.round(33 + (88 - 33) * intensity);
    const g = Math.round(38 + (166 - 38) * intensity);
    const b = Math.round(45 + (255 - 45) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Group hours into periods
  const periods = [
    { name: 'Night', hours: [0, 1, 2, 3, 4, 5], emoji: '🌙' },
    { name: 'Morning', hours: [6, 7, 8, 9, 10, 11], emoji: '🌅' },
    { name: 'Afternoon', hours: [12, 13, 14, 15, 16, 17], emoji: '☀️' },
    { name: 'Evening', hours: [18, 19, 20, 21, 22, 23], emoji: '🌆' },
  ];

  const periodStats = periods.map(period => {
    const count = period.hours.reduce((sum, h) => sum + (hourData[h]?.count ?? 0), 0);
    const percentage = totalCount > 0 ? (count / totalCount) * 100 : 0;
    return { ...period, count, percentage };
  });

  return (
    <div className="space-y-4">
      {/* Heatmap grid */}
      <div className="grid grid-cols-12 gap-1">
        {hourData.map(({ hour, count }) => {
          const intensity = getIntensity(count);
          return (
            <div
              key={hour}
              className="relative group"
            >
              <div
                className="aspect-square rounded-sm transition-transform hover:scale-110"
                style={{ backgroundColor: getColor(intensity) }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <div className="text-gray-400">{HOUR_LABELS[hour]}</div>
                <div className="text-blue-400 font-medium">{count.toLocaleString()} sessions</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hour labels */}
      <div className="grid grid-cols-12 gap-1 text-[10px] text-gray-500">
        {HOUR_LABELS.filter((_, i) => i % 2 === 0).map((label) => (
          <div key={label} className="col-span-2 text-center">{label}</div>
        ))}
      </div>

      {/* Intensity scale legend */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 px-1">
        <span>Less</span>
        <div className="flex gap-0.5 mx-2">
          {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
            <div
              key={intensity}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: getColor(intensity) }}
              title={intensity === 0 ? 'No activity' : `${Math.round(intensity * 100)}% intensity`}
            />
          ))}
        </div>
        <span>More</span>
      </div>

      {/* Period breakdown */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        {periodStats.map(period => (
          <div
            key={period.name}
            className="bg-gray-800/50 rounded p-2 text-center"
          >
            <div className="text-gray-500">{period.name}</div>
            <div className="text-blue-400 font-medium tabular-nums">
              {period.percentage.toFixed(0)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
