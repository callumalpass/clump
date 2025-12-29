/**
 * Token cost calculation utilities for Claude models.
 *
 * Pricing is per 1M tokens (as of December 2024).
 * These prices should be updated when Anthropic changes their pricing.
 */

// Model pricing per 1M tokens (USD)
export const MODEL_PRICING: Record<string, {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}> = {
  // Claude 4.5 models (latest)
  'claude-opus-4-5-20251101': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheWrite: 18.75,
  },
  // Claude 4 models (current)
  'claude-sonnet-4-20250514': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  'claude-opus-4-20250514': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheWrite: 18.75,
  },
  // Claude 3.5 models (legacy)
  'claude-3-5-sonnet-20241022': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  'claude-3-5-haiku-20241022': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheWrite: 1.00,
  },
};

type ModelPricing = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

// Default pricing (Sonnet)
const DEFAULT_PRICING: ModelPricing = {
  input: 3.00,
  output: 15.00,
  cacheRead: 0.30,
  cacheWrite: 3.75,
};

// Model family to default model mapping for fallback pricing lookup.
// When a model string contains a family keyword (e.g., "opus"), use the corresponding
// default model for pricing. Update these when new model versions are released.
const MODEL_FAMILY_DEFAULTS: Record<string, string> = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-3-5-haiku-20241022',
};

/**
 * Get pricing for a model, with fallback to default pricing.
 */
function getPricing(model: string | null | undefined): ModelPricing {
  if (!model) return DEFAULT_PRICING;

  // Try exact match first
  const exactMatch = MODEL_PRICING[model];
  if (exactMatch) {
    return exactMatch;
  }

  // Try to match by model family (e.g., "claude-sonnet-4" matches the default sonnet model)
  const modelLower = model.toLowerCase();
  for (const [family, defaultModel] of Object.entries(MODEL_FAMILY_DEFAULTS)) {
    if (modelLower.includes(family)) {
      return MODEL_PRICING[defaultModel] ?? DEFAULT_PRICING;
    }
  }

  return DEFAULT_PRICING;
}

/**
 * Calculate estimated cost in USD for token usage.
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  model?: string | null
): number {
  const pricing = getPricing(model);

  const cost = (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheReadTokens / 1_000_000) * pricing.cacheRead +
    (cacheCreationTokens / 1_000_000) * pricing.cacheWrite
  );

  return cost;
}

/**
 * Format cost as a currency string.
 * Handles edge cases: zero/negative costs are shown as $0.00, very small costs as <$0.01.
 */
export function formatCost(cost: number): string {
  // Handle zero and negative costs defensively (negatives shouldn't happen, treat as zero)
  if (cost <= 0) {
    return '$0.00';
  }
  if (cost < 0.01) {
    // Show in cents for very small amounts
    const cents = cost * 100;
    if (cents < 0.1) {
      return '<$0.01';
    }
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count with K/M suffixes for readability.
 */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 10_000) {
    return `${Math.round(count / 1_000)}K`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

/**
 * Calculate cache hit rate as a percentage.
 */
export function calculateCacheHitRate(
  inputTokens: number,
  cacheReadTokens: number
): number {
  const totalInput = inputTokens + cacheReadTokens;
  if (totalInput === 0) return 0;
  return (cacheReadTokens / totalInput) * 100;
}

/**
 * Format cache hit rate as a percentage string.
 */
export function formatCacheHitRate(rate: number): string {
  if (rate === 0) return '0%';
  if (rate < 1) return '<1%';
  return `${Math.round(rate)}%`;
}

/**
 * Token usage summary for display.
 */
export interface TokenUsageSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCost: number;
  cacheHitRate: number;
  formattedTotal: string;
  formattedCost: string;
  formattedCacheHitRate: string;
}

/**
 * Calculate a complete token usage summary.
 */
export function getTokenUsageSummary(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  model?: string | null
): TokenUsageSummary {
  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  const estimatedCost = calculateCost(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, model);
  const cacheHitRate = calculateCacheHitRate(inputTokens, cacheReadTokens);

  return {
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    estimatedCost,
    cacheHitRate,
    formattedTotal: formatTokenCount(totalTokens),
    formattedCost: formatCost(estimatedCost),
    formattedCacheHitRate: formatCacheHitRate(cacheHitRate),
  };
}
