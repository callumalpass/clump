/**
 * Formats a date string as a compact human-readable relative time (e.g., "2h ago", "1d ago").
 * Falls back to a short date format for older dates.
 * Returns empty string for invalid date strings.
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);

  // Handle invalid dates
  if (isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Handle future dates (shouldn't happen but just in case)
  if (diffMs < 0) {
    return 'now';
  }

  // Less than a minute
  if (diffSeconds < 60) {
    return 'now';
  }

  // Less than an hour
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  // Less than a day
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  // Yesterday
  if (diffDays === 1) {
    return '1d ago';
  }

  // Less than a week
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  // Less than a month (roughly)
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w ago`;
  }

  // Less than a year
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  }

  // More than a year - show short date
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Returns both relative time and full date for tooltip display.
 * Returns empty strings for invalid date strings.
 */
export function getTimeWithTooltip(dateString: string): { relative: string; full: string } {
  const date = new Date(dateString);

  // Handle invalid dates consistently with formatRelativeTime
  if (isNaN(date.getTime())) {
    return { relative: '', full: '' };
  }

  return {
    relative: formatRelativeTime(dateString),
    full: date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

/**
 * Checks if a date string represents a time within the given threshold from now.
 * Useful for determining if something was "recently" modified.
 * Returns false for invalid date strings.
 *
 * @param dateString - The ISO date string to check
 * @param thresholdMinutes - How many minutes ago counts as "recent" (default: 10)
 */
export function isRecentlyModified(dateString: string, thresholdMinutes: number = 10): boolean {
  const date = new Date(dateString);

  // Handle invalid dates
  if (isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();
  const thresholdTime = new Date(now.getTime() - thresholdMinutes * 60 * 1000);
  return date > thresholdTime;
}

/**
 * Formats a Date object as a YYYY-MM-DD string in the local timezone.
 * This avoids the timezone shift that can occur when using toISOString().
 *
 * For example, if it's 10 PM on January 15 in UTC-5, toISOString() returns
 * "2024-01-16T03:00:00Z", and substring(0,10) gives "2024-01-16" (wrong day).
 * This function correctly returns "2024-01-15".
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a duration in seconds as a human-readable string.
 * Examples: "45s", "2m 30s", "1h 15m", "2h 30m"
 * Returns null for null/undefined/negative/NaN/Infinity inputs.
 * Floating-point inputs are rounded down to whole seconds.
 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  // Round down to whole seconds to handle floating-point inputs
  const totalSeconds = Math.floor(seconds);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes < 60) {
    // For short durations, include seconds
    if (remainingSeconds > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  // For longer durations, skip seconds
  if (remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${hours}h`;
}
