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
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-700/50">
        {/* Input tokens - blue */}
        {inputPct > 0 && (
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${inputPct}%` }}
            title={`Input: ${formatTokenCount(inputTokens)}`}
          />
        )}
        {/* Output tokens - purple */}
        {outputPct > 0 && (
          <div
            className="bg-purple-500 transition-all"
            style={{ width: `${outputPct}%` }}
            title={`Output: ${formatTokenCount(outputTokens)}`}
          />
        )}
        {/* Cache read - emerald */}
        {cacheReadPct > 0 && (
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${cacheReadPct}%` }}
            title={`Cache Read: ${formatTokenCount(cacheReadTokens)}`}
          />
        )}
        {/* Cache write - amber */}
        {cacheWritePct > 0 && (
          <div
            className="bg-amber-500 transition-all"
            style={{ width: `${cacheWritePct}%` }}
            title={`Cache Write: ${formatTokenCount(cacheCreationTokens)}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-blue-500" />
          Input
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-purple-500" />
          Output
        </span>
        {cacheReadTokens > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" />
            Cache
          </span>
        )}
        {cacheCreationTokens > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-500" />
            Cache Write
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
