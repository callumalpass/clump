import { describe, it, expect } from 'vitest';
import {
  MODEL_PRICING,
  calculateCost,
  formatCost,
  formatTokenCount,
  calculateCacheHitRate,
  formatCacheHitRate,
  getTokenUsageSummary,
} from './costs';

describe('MODEL_PRICING', () => {
  it('contains Claude 4.5 models', () => {
    expect(MODEL_PRICING['claude-opus-4-5-20251101']).toBeDefined();
  });

  it('contains Claude 4 models', () => {
    expect(MODEL_PRICING['claude-sonnet-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-20250514']).toBeDefined();
  });

  it('contains Claude 3.5 models', () => {
    expect(MODEL_PRICING['claude-3-5-sonnet-20241022']).toBeDefined();
    expect(MODEL_PRICING['claude-3-5-haiku-20241022']).toBeDefined();
  });

  it('has all required pricing fields', () => {
    Object.values(MODEL_PRICING).forEach(pricing => {
      expect(pricing).toHaveProperty('input');
      expect(pricing).toHaveProperty('output');
      expect(pricing).toHaveProperty('cacheRead');
      expect(pricing).toHaveProperty('cacheWrite');
      expect(typeof pricing.input).toBe('number');
      expect(typeof pricing.output).toBe('number');
      expect(typeof pricing.cacheRead).toBe('number');
      expect(typeof pricing.cacheWrite).toBe('number');
    });
  });

  it('has reasonable pricing values', () => {
    Object.values(MODEL_PRICING).forEach(pricing => {
      // All prices should be positive
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
      expect(pricing.cacheRead).toBeGreaterThan(0);
      expect(pricing.cacheWrite).toBeGreaterThan(0);

      // Output should be more expensive than input
      expect(pricing.output).toBeGreaterThan(pricing.input);

      // Cache read should be cheaper than input
      expect(pricing.cacheRead).toBeLessThan(pricing.input);
    });
  });
});

describe('calculateCost', () => {
  it('calculates cost for input tokens', () => {
    // Sonnet: $3 per 1M input tokens
    const cost = calculateCost(1000000, 0, 0, 0, 'claude-sonnet-4-20250514');
    expect(cost).toBeCloseTo(3.0, 2);
  });

  it('calculates cost for output tokens', () => {
    // Sonnet: $15 per 1M output tokens
    const cost = calculateCost(0, 1000000, 0, 0, 'claude-sonnet-4-20250514');
    expect(cost).toBeCloseTo(15.0, 2);
  });

  it('calculates cost for cache read tokens', () => {
    // Sonnet: $0.30 per 1M cache read tokens
    const cost = calculateCost(0, 0, 1000000, 0, 'claude-sonnet-4-20250514');
    expect(cost).toBeCloseTo(0.30, 2);
  });

  it('calculates cost for cache creation tokens', () => {
    // Sonnet: $3.75 per 1M cache creation tokens
    const cost = calculateCost(0, 0, 0, 1000000, 'claude-sonnet-4-20250514');
    expect(cost).toBeCloseTo(3.75, 2);
  });

  it('calculates combined cost correctly', () => {
    // 500K input + 100K output + 200K cache read + 50K cache creation
    const cost = calculateCost(500000, 100000, 200000, 50000, 'claude-sonnet-4-20250514');

    const expected = (500000 / 1000000) * 3.0 +   // input
                     (100000 / 1000000) * 15.0 +  // output
                     (200000 / 1000000) * 0.30 +  // cache read
                     (50000 / 1000000) * 3.75;    // cache creation

    expect(cost).toBeCloseTo(expected, 4);
  });

  it('uses Opus pricing when model contains "opus"', () => {
    const cost = calculateCost(1000000, 0, 0, 0, 'claude-opus-4-20250514');
    expect(cost).toBeCloseTo(15.0, 2); // Opus input is $15/M
  });

  it('uses Opus 4.5 pricing for exact model ID', () => {
    const cost = calculateCost(1000000, 0, 0, 0, 'claude-opus-4-5-20251101');
    expect(cost).toBeCloseTo(15.0, 2); // Opus 4.5 input is $15/M
  });

  it('uses Opus pricing for partial model match containing "opus"', () => {
    // Should match any model containing "opus" in the name
    const cost = calculateCost(1000000, 0, 0, 0, 'some-opus-variant');
    expect(cost).toBeCloseTo(15.0, 2); // Should fall back to Opus pricing
  });

  it('uses Haiku pricing when model contains "haiku"', () => {
    const cost = calculateCost(1000000, 0, 0, 0, 'claude-3-5-haiku-20241022');
    expect(cost).toBeCloseTo(0.80, 2); // Haiku input is $0.80/M
  });

  it('uses default (Sonnet) pricing for null model', () => {
    const cost = calculateCost(1000000, 0, 0, 0, null);
    expect(cost).toBeCloseTo(3.0, 2);
  });

  it('uses default pricing for unknown model', () => {
    const cost = calculateCost(1000000, 0, 0, 0, 'unknown-model');
    expect(cost).toBeCloseTo(3.0, 2);
  });

  it('handles zero tokens', () => {
    const cost = calculateCost(0, 0, 0, 0);
    expect(cost).toBe(0);
  });
});

describe('formatCost', () => {
  it('formats large costs with 2 decimal places', () => {
    expect(formatCost(25.50)).toBe('$25.50');
    expect(formatCost(100.00)).toBe('$100.00');
    expect(formatCost(1.00)).toBe('$1.00');
  });

  it('formats costs under $1 with 3 decimal places', () => {
    expect(formatCost(0.50)).toBe('$0.500');
    expect(formatCost(0.123)).toBe('$0.123');
  });

  it('formats very small costs with 4 decimal places', () => {
    expect(formatCost(0.0050)).toBe('$0.0050');
    expect(formatCost(0.0012)).toBe('$0.0012');
  });

  it('formats tiny costs as less than $0.01', () => {
    expect(formatCost(0.0001)).toBe('<$0.01');
    expect(formatCost(0.00001)).toBe('<$0.01');
  });

  it('handles zero cost', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('handles negative costs defensively', () => {
    // Negative costs shouldn't occur but should be handled gracefully as $0.00
    expect(formatCost(-1)).toBe('$0.00');
    expect(formatCost(-0.50)).toBe('$0.00');
    expect(formatCost(-0.001)).toBe('$0.00');
  });

  it('handles boundary values correctly', () => {
    // At exactly $0.01, should show with 4 decimal places
    expect(formatCost(0.01)).toBe('$0.010');
    // Just under $1, should show with 3 decimal places
    expect(formatCost(0.999)).toBe('$0.999');
    // At exactly $1, should show with 2 decimal places
    expect(formatCost(1)).toBe('$1.00');
  });

  it('handles floating point precision edge cases', () => {
    // These values can have floating point issues
    expect(formatCost(0.1 + 0.2)).toBe('$0.300');
    // Note: 1.005 actually rounds to 1.00 due to floating point representation
    // (1.005 is stored as ~1.00499999... internally)
    expect(formatCost(1.005)).toBe('$1.00');
    // Use 1.006 to test rounding up works
    expect(formatCost(1.006)).toBe('$1.01');
  });
});

describe('formatTokenCount', () => {
  it('formats millions with M suffix', () => {
    expect(formatTokenCount(1000000)).toBe('1.0M');
    expect(formatTokenCount(2500000)).toBe('2.5M');
    expect(formatTokenCount(10000000)).toBe('10.0M');
  });

  it('formats large thousands with K suffix (no decimal)', () => {
    expect(formatTokenCount(10000)).toBe('10K');
    expect(formatTokenCount(50000)).toBe('50K');
    expect(formatTokenCount(999000)).toBe('999K');
  });

  it('formats small thousands with K suffix (with decimal)', () => {
    expect(formatTokenCount(1000)).toBe('1.0K');
    expect(formatTokenCount(2500)).toBe('2.5K');
    expect(formatTokenCount(9999)).toBe('10.0K');
  });

  it('formats small numbers with locale string', () => {
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('handles zero', () => {
    expect(formatTokenCount(0)).toBe('0');
  });
});

describe('calculateCacheHitRate', () => {
  it('calculates cache hit rate correctly', () => {
    // 80% cache hit rate
    expect(calculateCacheHitRate(200, 800)).toBeCloseTo(80, 1);

    // 50% cache hit rate
    expect(calculateCacheHitRate(500, 500)).toBeCloseTo(50, 1);

    // 0% cache hit rate
    expect(calculateCacheHitRate(1000, 0)).toBe(0);

    // 100% cache hit rate
    expect(calculateCacheHitRate(0, 1000)).toBeCloseTo(100, 1);
  });

  it('returns 0 when no input tokens', () => {
    expect(calculateCacheHitRate(0, 0)).toBe(0);
  });
});

describe('formatCacheHitRate', () => {
  it('formats zero rate', () => {
    expect(formatCacheHitRate(0)).toBe('0%');
  });

  it('formats small rates as less than 1%', () => {
    expect(formatCacheHitRate(0.5)).toBe('<1%');
    expect(formatCacheHitRate(0.1)).toBe('<1%');
  });

  it('formats normal rates as rounded integers', () => {
    expect(formatCacheHitRate(50.4)).toBe('50%');
    expect(formatCacheHitRate(50.6)).toBe('51%');
    expect(formatCacheHitRate(99.9)).toBe('100%');
  });
});

describe('getTokenUsageSummary', () => {
  it('returns complete summary object', () => {
    const summary = getTokenUsageSummary(1000000, 500000, 800000, 100000, 'claude-sonnet-4-20250514');

    expect(summary).toHaveProperty('totalTokens');
    expect(summary).toHaveProperty('inputTokens');
    expect(summary).toHaveProperty('outputTokens');
    expect(summary).toHaveProperty('cacheReadTokens');
    expect(summary).toHaveProperty('cacheCreationTokens');
    expect(summary).toHaveProperty('estimatedCost');
    expect(summary).toHaveProperty('cacheHitRate');
    expect(summary).toHaveProperty('formattedTotal');
    expect(summary).toHaveProperty('formattedCost');
    expect(summary).toHaveProperty('formattedCacheHitRate');
  });

  it('calculates total tokens correctly', () => {
    const summary = getTokenUsageSummary(100, 200, 300, 400);
    expect(summary.totalTokens).toBe(1000);
  });

  it('preserves individual token counts', () => {
    const summary = getTokenUsageSummary(100, 200, 300, 400);
    expect(summary.inputTokens).toBe(100);
    expect(summary.outputTokens).toBe(200);
    expect(summary.cacheReadTokens).toBe(300);
    expect(summary.cacheCreationTokens).toBe(400);
  });

  it('calculates estimated cost', () => {
    const summary = getTokenUsageSummary(1000000, 0, 0, 0, 'claude-sonnet-4-20250514');
    expect(summary.estimatedCost).toBeCloseTo(3.0, 2);
  });

  it('calculates cache hit rate', () => {
    const summary = getTokenUsageSummary(200, 100, 800, 50);
    // Cache hit rate = 800 / (200 + 800) = 80%
    expect(summary.cacheHitRate).toBeCloseTo(80, 1);
  });

  it('formats values correctly', () => {
    const summary = getTokenUsageSummary(1000000, 500000, 0, 0, 'claude-sonnet-4-20250514');

    expect(summary.formattedTotal).toBe('1.5M');
    expect(summary.formattedCost).toMatch(/^\$/);
    expect(summary.formattedCacheHitRate).toBe('0%');
  });

  it('handles zero values', () => {
    const summary = getTokenUsageSummary(0, 0, 0, 0);

    expect(summary.totalTokens).toBe(0);
    expect(summary.estimatedCost).toBe(0);
    expect(summary.cacheHitRate).toBe(0);
    expect(summary.formattedTotal).toBe('0');
    expect(summary.formattedCacheHitRate).toBe('0%');
  });
});
