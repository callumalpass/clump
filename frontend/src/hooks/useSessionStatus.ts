import { useMemo } from 'react';
import type { SessionSummary } from '../types';

interface SessionStatus {
  hasRunning: boolean;
  hasCompleted: boolean;
}

/**
 * Derives session status flags from an array of sessions.
 *
 * @param sessions - Array of session summaries to analyze
 * @returns hasRunning: true if any session is active; hasCompleted: true if sessions exist but none are active
 */
export function useSessionStatus(sessions: SessionSummary[]): SessionStatus {
  return useMemo(() => ({
    hasRunning: sessions.some(s => s.is_active),
    hasCompleted: sessions.length > 0 && !sessions.some(s => s.is_active),
  }), [sessions]);
}
