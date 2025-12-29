import { useMemo } from 'react';
import { getTokenUsageSummary, formatTokenCount } from '../utils/costs';

interface TokenUsageBarProps {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model?: string | null;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Show detailed breakdown on hover */
  showDetails?: boolean;
}

/**
 * Visual bar showing token usage breakdown with cost estimate.
 */
export function TokenUsageBar({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
  model,
  compact = false,
  showDetails = true,
}: TokenUsageBarProps) {
  const summary = useMemo(
    () => getTokenUsageSummary(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, model),
    [inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, model]
  );

  if (summary.totalTokens === 0) {
    return null;
  }

  // Calculate percentages for the bar
  const inputPct = (inputTokens / summary.totalTokens) * 100;
  const outputPct = (outputTokens / summary.totalTokens) * 100;
  const cacheReadPct = (cacheReadTokens / summary.totalTokens) * 100;
  const cacheWritePct = (cacheCreationTokens / summary.totalTokens) * 100;

  const tooltipContent = showDetails
    ? `Input: ${formatTokenCount(inputTokens)}\nOutput: ${formatTokenCount(outputTokens)}\nCache Read: ${formatTokenCount(cacheReadTokens)}\nCache Write: ${formatTokenCount(cacheCreationTokens)}\n\nCache Hit: ${summary.formattedCacheHitRate}\nEst. Cost: ${summary.formattedCost}`
    : undefined;

  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-gray-400"
        title={tooltipContent}
      >
        {/* Token count */}
        <span className="tabular-nums">{summary.formattedTotal}</span>
        <span className="text-gray-600">tokens</span>

        {/* Cost badge */}
        <span className="px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-300 tabular-nums">
          {summary.formattedCost}
        </span>

        {/* Cache hit rate (if significant) */}
        {summary.cacheHitRate > 5 && (
          <span className="flex items-center gap-0.5 text-emerald-400">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {summary.formattedCacheHitRate}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5" title={tooltipContent}>
      {/* Summary row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-gray-400">
          <span>
            <span className="text-gray-300 tabular-nums">{summary.formattedTotal}</span> tokens
          </span>
          {summary.cacheHitRate > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {summary.formattedCacheHitRate} cache hit
            </span>
          )}
        </div>
        <span className="text-gray-300 font-medium tabular-nums">
          {summary.formattedCost}
        </span>
      </div>

      {/* Visual bar */}
      <div
        className="flex h-2 rounded-full overflow-hidden bg-gray-700/50 ring-1 ring-gray-600/30"
        role="img"
        aria-label={`Token usage: ${formatTokenCount(inputTokens)} input, ${formatTokenCount(outputTokens)} output, ${formatTokenCount(cacheReadTokens)} cache read, ${formatTokenCount(cacheCreationTokens)} cache write`}
      >
        {/* Input tokens - blue */}
        {inputPct > 0 && (
          <div
            className="token-bar-segment bg-blue-500 border-r border-gray-900/20 last:border-r-0"
            style={{ width: `${inputPct}%`, '--segment-color': 'rgba(59, 130, 246, 0.4)' } as React.CSSProperties}
            title={`Input: ${formatTokenCount(inputTokens)} (${inputPct.toFixed(1)}%)`}
          />
        )}
        {/* Output tokens - purple */}
        {outputPct > 0 && (
          <div
            className="token-bar-segment bg-purple-500 border-r border-gray-900/20 last:border-r-0"
            style={{ width: `${outputPct}%`, '--segment-color': 'rgba(168, 85, 247, 0.4)' } as React.CSSProperties}
            title={`Output: ${formatTokenCount(outputTokens)} (${outputPct.toFixed(1)}%)`}
          />
        )}
        {/* Cache read - emerald */}
        {cacheReadPct > 0 && (
          <div
            className="token-bar-segment bg-emerald-500 border-r border-gray-900/20 last:border-r-0"
            style={{ width: `${cacheReadPct}%`, '--segment-color': 'rgba(16, 185, 129, 0.4)' } as React.CSSProperties}
            title={`Cache Read: ${formatTokenCount(cacheReadTokens)} (${cacheReadPct.toFixed(1)}%)`}
          />
        )}
        {/* Cache write - amber */}
        {cacheWritePct > 0 && (
          <div
            className="token-bar-segment bg-amber-500 border-r border-gray-900/20 last:border-r-0"
            style={{ width: `${cacheWritePct}%`, '--segment-color': 'rgba(245, 158, 11, 0.4)' } as React.CSSProperties}
            title={`Cache Write: ${formatTokenCount(cacheCreationTokens)} (${cacheWritePct.toFixed(1)}%)`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        <span className="token-legend-item flex items-center gap-1.5 text-gray-400 rounded px-1.5 py-0.5 -mx-1.5 transition-all duration-150 hover:text-gray-200 hover:bg-blue-500/15 cursor-default">
          <span className="w-2 h-2 rounded-sm bg-blue-500 ring-1 ring-blue-400/30 shrink-0 transition-transform duration-150 group-hover:scale-110" />
          <span className="font-medium">Input</span>
          <span className="text-gray-500 group-hover:text-gray-400 tabular-nums transition-colors duration-150">{formatTokenCount(inputTokens)}</span>
        </span>
        <span className="token-legend-item flex items-center gap-1.5 text-gray-400 rounded px-1.5 py-0.5 -mx-1.5 transition-all duration-150 hover:text-gray-200 hover:bg-purple-500/15 cursor-default">
          <span className="w-2 h-2 rounded-sm bg-purple-500 ring-1 ring-purple-400/30 shrink-0 transition-transform duration-150" />
          <span className="font-medium">Output</span>
          <span className="text-gray-500 tabular-nums transition-colors duration-150">{formatTokenCount(outputTokens)}</span>
        </span>
        {cacheReadTokens > 0 && (
          <span className="token-legend-item flex items-center gap-1.5 text-gray-400 rounded px-1.5 py-0.5 -mx-1.5 transition-all duration-150 hover:text-gray-200 hover:bg-emerald-500/15 cursor-default">
            <span className="w-2 h-2 rounded-sm bg-emerald-500 ring-1 ring-emerald-400/30 shrink-0 transition-transform duration-150" />
            <span className="font-medium">Cache</span>
            <span className="text-gray-500 tabular-nums transition-colors duration-150">{formatTokenCount(cacheReadTokens)}</span>
          </span>
        )}
        {cacheCreationTokens > 0 && (
          <span className="token-legend-item flex items-center gap-1.5 text-gray-400 rounded px-1.5 py-0.5 -mx-1.5 transition-all duration-150 hover:text-gray-200 hover:bg-amber-500/15 cursor-default">
            <span className="w-2 h-2 rounded-sm bg-amber-500 ring-1 ring-amber-400/30 shrink-0 transition-transform duration-150" />
            <span className="font-medium">Write</span>
            <span className="text-gray-500 tabular-nums transition-colors duration-150">{formatTokenCount(cacheCreationTokens)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Compact inline token/cost display for list items.
 */
export function TokenCostBadge({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
  model,
}: TokenUsageBarProps) {
  const summary = useMemo(
    () => getTokenUsageSummary(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, model),
    [inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, model]
  );

  if (summary.totalTokens === 0) {
    return null;
  }

  const tooltipContent = `${formatTokenCount(inputTokens)} in / ${formatTokenCount(outputTokens)} out\nCache: ${summary.formattedCacheHitRate} hit\nEst. cost: ${summary.formattedCost}`;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-700/50 text-[10px] text-gray-400 tabular-nums"
      title={tooltipContent}
    >
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {summary.formattedCost}
    </span>
  );
}
