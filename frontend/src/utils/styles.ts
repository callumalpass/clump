/**
 * Shared UI styling constants for consistent visual design across the app.
 * These utilities ensure accessibility and visual consistency.
 */

/**
 * Consistent focus ring styling for accessibility.
 * Uses focus-visible to only show rings on keyboard navigation, not mouse clicks.
 *
 * Standard blue ring with offset for dark backgrounds.
 */
export const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900';

/**
 * Focus ring variant for elements inside gray-800 backgrounds.
 */
export const focusRingGray800 = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-800';
