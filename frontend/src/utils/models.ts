/**
 * Shared utilities for Claude model name handling and styling.
 * Centralizes model-related logic to ensure consistency across components.
 */

/**
 * Get the full human-readable model name for display in detail views.
 * @example getModelDisplayName('claude-opus-4-5-20251101') // 'Opus 4.5'
 */
export function getModelDisplayName(model?: string): string {
  if (!model) return 'Unknown';
  if (model.includes('opus')) return 'Opus 4.5';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  // Fallback: extract last segment from model ID
  return model.split('-').slice(-1)[0] || model;
}

/**
 * Get a short model name for compact displays (lists, badges).
 * @example getModelShortName('claude-opus-4-5-20251101') // 'opus'
 */
export function getModelShortName(model?: string): string {
  if (!model) return '';
  if (model.includes('opus')) return 'opus';
  if (model.includes('haiku')) return 'haiku';
  return 'sonnet';
}

/**
 * Get Tailwind text color classes for model-specific styling.
 * Used for inline text coloring in lists.
 */
export function getModelTextColor(model?: string): string {
  if (!model) return 'text-gray-600';
  if (model.includes('opus')) return 'text-amber-500';
  if (model.includes('haiku')) return 'text-cyan-500';
  return 'text-purple-400'; // Sonnet
}

/**
 * Get Tailwind badge classes for model-specific badge styling.
 * Used for prominent model indicators with background colors.
 */
export function getModelBadgeStyle(model?: string): string {
  if (!model) return 'bg-gray-700/50 text-gray-400';
  if (model.includes('opus')) return 'bg-amber-900/50 text-amber-300 border border-amber-700/30';
  if (model.includes('haiku')) return 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/30';
  // Default to Sonnet styling (purple)
  return 'bg-purple-900/50 text-purple-300 border border-purple-700/30';
}
