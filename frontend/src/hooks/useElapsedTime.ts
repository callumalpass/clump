import { useState, useEffect } from 'react';

/**
 * Parse a timestamp string, treating naive ISO strings (without timezone) as UTC.
 * Backend uses datetime.now(timezone.utc) which produces UTC-aware datetimes with '+00:00'.
 * This function also handles legacy naive datetimes (without 'Z') as UTC for backwards compatibility.
 */
function parseAsUtc(timestamp: string): Date {
  // If the string has no timezone indicator, assume UTC by appending 'Z'
  if (!/([+-]\d{2}:?\d{2}|Z)$/.test(timestamp)) {
    return new Date(timestamp + 'Z');
  }
  return new Date(timestamp);
}

/**
 * Hook that returns a formatted elapsed time string that updates every second
 * @param startTime - ISO string or Date object representing start time
 * @param isActive - Whether to actively update the timer (set false for completed sessions)
 * @returns Formatted duration string like "2m 30s" or "1h 15m"
 */
export function useElapsedTime(startTime: string | Date | null, isActive: boolean = true): string {
  const [elapsed, setElapsed] = useState<string>('');

  useEffect(() => {
    if (!startTime) {
      setElapsed('');
      return;
    }

    const start = typeof startTime === 'string' ? parseAsUtc(startTime) : startTime;

    const updateElapsed = () => {
      const now = new Date();
      const diffMs = now.getTime() - start.getTime();
      setElapsed(formatDuration(diffMs));
    };

    // Initial calculation
    updateElapsed();

    // Only set up interval if actively running
    if (isActive) {
      const interval = setInterval(updateElapsed, 1000);
      return () => clearInterval(interval);
    }
  }, [startTime, isActive]);

  return elapsed;
}

/**
 * Format milliseconds into a human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
}

/**
 * Calculate duration between two times (for completed sessions)
 */
export function calculateDuration(startTime: string | Date, endTime: string | Date): string {
  const start = typeof startTime === 'string' ? parseAsUtc(startTime) : startTime;
  const end = typeof endTime === 'string' ? parseAsUtc(endTime) : endTime;
  return formatDuration(end.getTime() - start.getTime());
}
