/**
 * Shared utilities for model name handling and styling.
 * Supports Claude, Gemini, and Codex models.
 */

/**
 * Get the full human-readable model name for display in detail views.
 * @example getModelDisplayName('claude-opus-4-5-20251101') // 'Opus 4.5'
 * @example getModelDisplayName('gemini-3-flash-preview') // 'Gemini Flash'
 * @example getModelDisplayName('gpt-5.2-codex') // 'GPT 5.2'
 */
export function getModelDisplayName(model?: string): string {
  if (!model) return 'Unknown';

  // Claude models
  if (model.includes('opus-4-5') || model.includes('opus-4.5')) return 'Opus 4.5';
  if (model.includes('opus')) return 'Opus 4';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';

  // Gemini models
  if (model.includes('gemini')) {
    if (model.includes('flash')) return 'Gemini Flash';
    if (model.includes('pro')) return 'Gemini Pro';
    return 'Gemini';
  }

  // OpenAI/Codex models
  if (model.includes('gpt') || model.includes('codex')) {
    // Extract version like "5.2" from "gpt-5.2-codex"
    const match = model.match(/(\d+(?:\.\d+)?)/);
    if (match) return `GPT ${match[1]}`;
    return 'Codex';
  }

  // Fallback: extract last segment from model ID
  return model.split('-').slice(-1)[0] || model;
}

/**
 * Get a short model name for compact displays (lists, badges).
 * @example getModelShortName('claude-opus-4-5-20251101') // 'opus'
 * @example getModelShortName('gemini-3-flash-preview') // 'gemini'
 * @example getModelShortName('gpt-5.2-codex') // 'codex'
 */
export function getModelShortName(model?: string): string {
  if (!model) return '';

  // Claude models
  if (model.includes('opus')) return 'opus';
  if (model.includes('haiku')) return 'haiku';
  if (model.includes('sonnet')) return 'sonnet';

  // Gemini models
  if (model.includes('gemini')) return 'gemini';

  // OpenAI/Codex models
  if (model.includes('codex') || model.includes('gpt')) return 'codex';

  // If it's a Claude model ID format (claude-*), assume sonnet
  if (model.startsWith('claude-')) return 'sonnet';

  // Unknown model - return first part
  return model.split('-')[0] || model;
}

/**
 * Get Tailwind text color classes for model-specific styling.
 * Used for inline text coloring in lists.
 */
export function getModelTextColor(model?: string): string {
  if (!model) return 'text-gray-600';

  // Claude models
  if (model.includes('opus')) return 'text-amber-500';
  if (model.includes('haiku')) return 'text-cyan-500';
  if (model.includes('sonnet') || model.startsWith('claude-')) return 'text-purple-400';

  // Gemini models - blue
  if (model.includes('gemini')) return 'text-blue-400';

  // Codex/GPT models - green
  if (model.includes('codex') || model.includes('gpt')) return 'text-green-400';

  return 'text-gray-400'; // Unknown
}

/**
 * Get Tailwind badge classes for model-specific badge styling.
 * Used for prominent model indicators with background colors.
 */
export function getModelBadgeStyle(model?: string): string {
  if (!model) return 'bg-gray-700/50 text-gray-400';

  // Claude models
  if (model.includes('opus')) return 'bg-amber-900/50 text-amber-300 border border-amber-700/30';
  if (model.includes('haiku')) return 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/30';
  if (model.includes('sonnet') || model.startsWith('claude-')) {
    return 'bg-purple-900/50 text-purple-300 border border-purple-700/30';
  }

  // Gemini models - blue theme
  if (model.includes('gemini')) {
    return 'bg-blue-900/50 text-blue-300 border border-blue-700/30';
  }

  // Codex/GPT models - green theme
  if (model.includes('codex') || model.includes('gpt')) {
    return 'bg-green-900/50 text-green-300 border border-green-700/30';
  }

  // Unknown model - gray
  return 'bg-gray-700/50 text-gray-400';
}
