import { useElapsedTime } from '../hooks/useElapsedTime';

interface ElapsedTimerProps {
  /** ISO string representing the start time */
  startTime: string;
  /** Whether the timer is actively running (updates every second) */
  isActive?: boolean;
  /** Additional CSS classes to apply */
  className?: string;
}

/**
 * Component that displays elapsed time from a start time.
 * Updates every second when active.
 */
export function ElapsedTimer({ startTime, isActive = true, className = '' }: ElapsedTimerProps) {
  const elapsed = useElapsedTime(startTime, isActive);

  return <span className={className}>{elapsed}</span>;
}
