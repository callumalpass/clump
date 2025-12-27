import { useState, useEffect } from 'react';

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

    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;

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
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
  return formatDuration(end.getTime() - start.getTime());
}
