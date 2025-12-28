import { describe, it, expect } from 'vitest';
import {
  getModelDisplayName,
  getModelShortName,
  getModelTextColor,
  getModelBadgeStyle,
} from './models';

describe('getModelDisplayName', () => {
  it('returns "Unknown" for undefined input', () => {
    expect(getModelDisplayName(undefined)).toBe('Unknown');
  });

  it('returns "Unknown" for empty string', () => {
    expect(getModelDisplayName('')).toBe('Unknown');
  });

  it('returns "Opus 4.5" for models containing "opus"', () => {
    expect(getModelDisplayName('claude-opus-4-5-20251101')).toBe('Opus 4.5');
    expect(getModelDisplayName('opus')).toBe('Opus 4.5');
    expect(getModelDisplayName('claude-3-opus')).toBe('Opus 4.5');
  });

  it('returns "Sonnet" for models containing "sonnet"', () => {
    expect(getModelDisplayName('claude-sonnet-4-20250514')).toBe('Sonnet');
    expect(getModelDisplayName('claude-3-5-sonnet-20241022')).toBe('Sonnet');
    expect(getModelDisplayName('sonnet')).toBe('Sonnet');
  });

  it('returns "Haiku" for models containing "haiku"', () => {
    expect(getModelDisplayName('claude-3-5-haiku-20241022')).toBe('Haiku');
    expect(getModelDisplayName('haiku')).toBe('Haiku');
    expect(getModelDisplayName('claude-3-haiku')).toBe('Haiku');
  });

  it('falls back to last segment of model ID for unknown models', () => {
    expect(getModelDisplayName('custom-model-v2')).toBe('v2');
    expect(getModelDisplayName('my-ai-assistant')).toBe('assistant');
  });

  it('returns the full string if no hyphens present', () => {
    expect(getModelDisplayName('custommodel')).toBe('custommodel');
  });
});

describe('getModelShortName', () => {
  it('returns empty string for undefined input', () => {
    expect(getModelShortName(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(getModelShortName('')).toBe('');
  });

  it('returns "opus" for models containing "opus"', () => {
    expect(getModelShortName('claude-opus-4-5-20251101')).toBe('opus');
    expect(getModelShortName('opus-model')).toBe('opus');
  });

  it('returns "haiku" for models containing "haiku"', () => {
    expect(getModelShortName('claude-3-5-haiku-20241022')).toBe('haiku');
    expect(getModelShortName('haiku-latest')).toBe('haiku');
  });

  it('returns "sonnet" as default for other models', () => {
    expect(getModelShortName('claude-sonnet-4-20250514')).toBe('sonnet');
    expect(getModelShortName('claude-3-5-sonnet')).toBe('sonnet');
    expect(getModelShortName('unknown-model')).toBe('sonnet');
    expect(getModelShortName('some-other-model')).toBe('sonnet');
  });
});

describe('getModelTextColor', () => {
  it('returns gray-600 for undefined input', () => {
    expect(getModelTextColor(undefined)).toBe('text-gray-600');
  });

  it('returns gray-600 for empty string', () => {
    expect(getModelTextColor('')).toBe('text-gray-600');
  });

  it('returns amber-500 for opus models', () => {
    expect(getModelTextColor('claude-opus-4-5-20251101')).toBe('text-amber-500');
    expect(getModelTextColor('opus')).toBe('text-amber-500');
  });

  it('returns cyan-500 for haiku models', () => {
    expect(getModelTextColor('claude-3-5-haiku-20241022')).toBe('text-cyan-500');
    expect(getModelTextColor('haiku')).toBe('text-cyan-500');
  });

  it('returns purple-400 for sonnet and other models', () => {
    expect(getModelTextColor('claude-sonnet-4-20250514')).toBe('text-purple-400');
    expect(getModelTextColor('sonnet')).toBe('text-purple-400');
    expect(getModelTextColor('unknown-model')).toBe('text-purple-400');
  });
});

describe('getModelBadgeStyle', () => {
  it('returns gray badge style for undefined input', () => {
    const result = getModelBadgeStyle(undefined);
    expect(result).toBe('bg-gray-700/50 text-gray-400');
  });

  it('returns gray badge style for empty string', () => {
    const result = getModelBadgeStyle('');
    expect(result).toBe('bg-gray-700/50 text-gray-400');
  });

  it('returns amber badge style for opus models', () => {
    const result = getModelBadgeStyle('claude-opus-4-5-20251101');
    expect(result).toBe('bg-amber-900/50 text-amber-300 border border-amber-700/30');
  });

  it('returns cyan badge style for haiku models', () => {
    const result = getModelBadgeStyle('claude-3-5-haiku-20241022');
    expect(result).toBe('bg-cyan-900/50 text-cyan-300 border border-cyan-700/30');
  });

  it('returns purple badge style for sonnet and other models', () => {
    const sonnetResult = getModelBadgeStyle('claude-sonnet-4-20250514');
    expect(sonnetResult).toBe('bg-purple-900/50 text-purple-300 border border-purple-700/30');

    const unknownResult = getModelBadgeStyle('unknown-model');
    expect(unknownResult).toBe('bg-purple-900/50 text-purple-300 border border-purple-700/30');
  });
});
