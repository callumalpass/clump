/**
 * Determines the appropriate contrasting text color (black or white)
 * for a given background hex color, based on luminance.
 * Handles both 3-character (#fff) and 6-character (#ffffff) hex codes.
 */
export function getContrastColor(hexColor: string): string {
  let hex = hexColor.replace('#', '');

  // Expand 3-character hex to 6-character (e.g., 'fff' -> 'ffffff')
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  // Validate hex length
  if (hex.length !== 6) {
    return '#ffffff'; // Default to white text for invalid input
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Handle invalid hex characters (parseInt returns NaN)
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return '#ffffff'; // Default to white text for invalid input
  }

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Predefined colors for tag backgrounds.
 */
export const TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];
