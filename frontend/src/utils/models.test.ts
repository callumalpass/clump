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

  // Claude models
  it('returns "Opus 4.5" for models containing "opus-4-5" or "opus-4.5"', () => {
    expect(getModelDisplayName('claude-opus-4-5-20251101')).toBe('Opus 4.5');
    expect(getModelDisplayName('opus-4.5')).toBe('Opus 4.5');
    expect(getModelDisplayName('opus-4-5')).toBe('Opus 4.5');
  });

  it('returns "Opus 4" for other opus models', () => {
    expect(getModelDisplayName('claude-opus-4-20250514')).toBe('Opus 4');
    expect(getModelDisplayName('opus')).toBe('Opus 4');
    expect(getModelDisplayName('claude-3-opus')).toBe('Opus 4');
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

  // Gemini models
  it('returns appropriate names for Gemini models', () => {
    expect(getModelDisplayName('gemini-3-flash-preview')).toBe('Gemini Flash');
    expect(getModelDisplayName('gemini-3-pro-preview')).toBe('Gemini Pro');
    expect(getModelDisplayName('gemini-2')).toBe('Gemini');
  });

  // Codex/GPT models
  it('returns appropriate names for Codex/GPT models', () => {
    expect(getModelDisplayName('gpt-5.2-codex')).toBe('GPT 5.2');
    expect(getModelDisplayName('gpt-5-codex')).toBe('GPT 5');
    expect(getModelDisplayName('codex')).toBe('Codex');
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

  // Claude models
  it('returns "opus" for models containing "opus"', () => {
    expect(getModelShortName('claude-opus-4-5-20251101')).toBe('opus');
    expect(getModelShortName('opus-model')).toBe('opus');
  });

  it('returns "haiku" for models containing "haiku"', () => {
    expect(getModelShortName('claude-3-5-haiku-20241022')).toBe('haiku');
    expect(getModelShortName('haiku-latest')).toBe('haiku');
  });

  it('returns "sonnet" for sonnet models and claude-* prefixed models', () => {
    expect(getModelShortName('claude-sonnet-4-20250514')).toBe('sonnet');
    expect(getModelShortName('claude-3-5-sonnet')).toBe('sonnet');
    expect(getModelShortName('claude-unknown-model')).toBe('sonnet');
  });

  // Gemini models
  it('returns "gemini" for Gemini models', () => {
    expect(getModelShortName('gemini-3-flash-preview')).toBe('gemini');
    expect(getModelShortName('gemini-pro')).toBe('gemini');
  });

  // Codex/GPT models
  it('returns "codex" for Codex/GPT models', () => {
    expect(getModelShortName('gpt-5.2-codex')).toBe('codex');
    expect(getModelShortName('gpt-4')).toBe('codex');
    expect(getModelShortName('codex')).toBe('codex');
  });

  it('returns first segment for unknown models', () => {
    expect(getModelShortName('unknown-model')).toBe('unknown');
    expect(getModelShortName('some-other-model')).toBe('some');
  });
});

describe('getModelTextColor', () => {
  it('returns gray-600 for undefined input', () => {
    expect(getModelTextColor(undefined)).toBe('text-gray-600');
  });

  it('returns gray-600 for empty string', () => {
    expect(getModelTextColor('')).toBe('text-gray-600');
  });

  // Claude models
  it('returns amber-500 for opus models', () => {
    expect(getModelTextColor('claude-opus-4-5-20251101')).toBe('text-amber-500');
    expect(getModelTextColor('opus')).toBe('text-amber-500');
  });

  it('returns cyan-500 for haiku models', () => {
    expect(getModelTextColor('claude-3-5-haiku-20241022')).toBe('text-cyan-500');
    expect(getModelTextColor('haiku')).toBe('text-cyan-500');
  });

  it('returns purple-400 for sonnet and claude-* models', () => {
    expect(getModelTextColor('claude-sonnet-4-20250514')).toBe('text-purple-400');
    expect(getModelTextColor('sonnet')).toBe('text-purple-400');
    expect(getModelTextColor('claude-unknown')).toBe('text-purple-400');
  });

  // Gemini models
  it('returns blue-400 for Gemini models', () => {
    expect(getModelTextColor('gemini-3-flash-preview')).toBe('text-blue-400');
    expect(getModelTextColor('gemini-pro')).toBe('text-blue-400');
  });

  // Codex/GPT models
  it('returns green-400 for Codex/GPT models', () => {
    expect(getModelTextColor('gpt-5.2-codex')).toBe('text-green-400');
    expect(getModelTextColor('codex')).toBe('text-green-400');
  });

  it('returns gray-400 for unknown models', () => {
    expect(getModelTextColor('unknown-model')).toBe('text-gray-400');
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

  // Claude models
  it('returns amber badge style for opus models', () => {
    const result = getModelBadgeStyle('claude-opus-4-5-20251101');
    expect(result).toBe('bg-amber-900/50 text-amber-300 border border-amber-700/30');
  });

  it('returns cyan badge style for haiku models', () => {
    const result = getModelBadgeStyle('claude-3-5-haiku-20241022');
    expect(result).toBe('bg-cyan-900/50 text-cyan-300 border border-cyan-700/30');
  });

  it('returns purple badge style for sonnet and claude-* models', () => {
    expect(getModelBadgeStyle('claude-sonnet-4-20250514')).toBe(
      'bg-purple-900/50 text-purple-300 border border-purple-700/30'
    );
    expect(getModelBadgeStyle('claude-unknown')).toBe(
      'bg-purple-900/50 text-purple-300 border border-purple-700/30'
    );
  });

  // Gemini models
  it('returns blue badge style for Gemini models', () => {
    expect(getModelBadgeStyle('gemini-3-flash-preview')).toBe(
      'bg-blue-900/50 text-blue-300 border border-blue-700/30'
    );
  });

  // Codex/GPT models
  it('returns green badge style for Codex/GPT models', () => {
    expect(getModelBadgeStyle('gpt-5.2-codex')).toBe(
      'bg-green-900/50 text-green-300 border border-green-700/30'
    );
  });

  it('returns gray badge style for unknown models', () => {
    expect(getModelBadgeStyle('unknown-model')).toBe('bg-gray-700/50 text-gray-400');
  });
});
