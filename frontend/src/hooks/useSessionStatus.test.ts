import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionStatus } from './useSessionStatus';
import type { SessionSummary } from '../types';

function createMockSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'session-1',
    encoded_path: '-home-user-projects-test',
    repo_path: '/home/user/projects/test',
    repo_name: 'owner/test-repo',
    title: 'Test Session',
    model: 'claude-3-sonnet',
    start_time: '2024-01-15T10:30:00Z',
    end_time: '2024-01-15T10:35:00Z',
    message_count: 5,
    modified_at: '2024-01-15T10:35:00Z',
    file_size: 1024,
    entities: [],
    tags: [],
    starred: false,
    is_active: false,
    ...overrides,
  };
}

describe('useSessionStatus', () => {
  describe('with empty sessions array', () => {
    it('returns hasRunning: false and hasCompleted: false', () => {
      const { result } = renderHook(() => useSessionStatus([]));

      expect(result.current.hasRunning).toBe(false);
      expect(result.current.hasCompleted).toBe(false);
    });
  });

  describe('with only completed sessions', () => {
    it('returns hasRunning: false and hasCompleted: true for single completed session', () => {
      const sessions = [createMockSession({ is_active: false })];

      const { result } = renderHook(() => useSessionStatus(sessions));

      expect(result.current.hasRunning).toBe(false);
      expect(result.current.hasCompleted).toBe(true);
    });

    it('returns hasRunning: false and hasCompleted: true for multiple completed sessions', () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: false }),
        createMockSession({ session_id: 'sess-2', is_active: false }),
        createMockSession({ session_id: 'sess-3', is_active: false }),
      ];

      const { result } = renderHook(() => useSessionStatus(sessions));

      expect(result.current.hasRunning).toBe(false);
      expect(result.current.hasCompleted).toBe(true);
    });
  });

  describe('with only active sessions', () => {
    it('returns hasRunning: true and hasCompleted: false for single active session', () => {
      const sessions = [createMockSession({ is_active: true })];

      const { result } = renderHook(() => useSessionStatus(sessions));

      expect(result.current.hasRunning).toBe(true);
      expect(result.current.hasCompleted).toBe(false);
    });

    it('returns hasRunning: true and hasCompleted: false for multiple active sessions', () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: true }),
        createMockSession({ session_id: 'sess-2', is_active: true }),
      ];

      const { result } = renderHook(() => useSessionStatus(sessions));

      expect(result.current.hasRunning).toBe(true);
      expect(result.current.hasCompleted).toBe(false);
    });
  });

  describe('with mixed active and completed sessions', () => {
    it('returns hasRunning: true and hasCompleted: false when at least one is active', () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: true }),
        createMockSession({ session_id: 'sess-2', is_active: false }),
        createMockSession({ session_id: 'sess-3', is_active: false }),
      ];

      const { result } = renderHook(() => useSessionStatus(sessions));

      expect(result.current.hasRunning).toBe(true);
      expect(result.current.hasCompleted).toBe(false);
    });

    it('prioritizes running status over completed when mixed', () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: false }),
        createMockSession({ session_id: 'sess-2', is_active: true }),
      ];

      const { result } = renderHook(() => useSessionStatus(sessions));

      // Running should be true and completed should be false
      // This is the expected behavior: hasRunning takes priority
      expect(result.current.hasRunning).toBe(true);
      expect(result.current.hasCompleted).toBe(false);
    });
  });

  describe('memoization', () => {
    it('returns the same reference when sessions array is unchanged', () => {
      const sessions = [createMockSession({ is_active: false })];

      const { result, rerender } = renderHook(() => useSessionStatus(sessions));
      const firstResult = result.current;

      rerender();

      expect(result.current).toBe(firstResult);
    });

    it('returns new reference when sessions array changes', () => {
      const initialSessions = [createMockSession({ is_active: false })];
      const newSessions = [createMockSession({ is_active: true })];

      const { result, rerender } = renderHook(
        ({ sessions }) => useSessionStatus(sessions),
        { initialProps: { sessions: initialSessions } }
      );

      const firstResult = result.current;
      expect(firstResult.hasRunning).toBe(false);
      expect(firstResult.hasCompleted).toBe(true);

      rerender({ sessions: newSessions });

      expect(result.current.hasRunning).toBe(true);
      expect(result.current.hasCompleted).toBe(false);
      expect(result.current).not.toBe(firstResult);
    });
  });

  describe('edge cases', () => {
    it('handles sessions with undefined is_active (treats as false)', () => {
      // In practice, is_active should always be defined, but test defensive behavior
      const sessions = [
        {
          ...createMockSession(),
          is_active: undefined as unknown as boolean,
        },
      ];

      const { result } = renderHook(() => useSessionStatus(sessions));

      // undefined is falsy, so hasRunning should be false
      expect(result.current.hasRunning).toBe(false);
      // But sessions.length > 0 and no active sessions, so hasCompleted should be true
      expect(result.current.hasCompleted).toBe(true);
    });

    it('handles large number of sessions', () => {
      const sessions = Array.from({ length: 1000 }, (_, i) =>
        createMockSession({ session_id: `sess-${i}`, is_active: i === 500 })
      );

      const { result } = renderHook(() => useSessionStatus(sessions));

      expect(result.current.hasRunning).toBe(true);
      expect(result.current.hasCompleted).toBe(false);
    });

    it('handles session at array boundary being active', () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: false }),
        createMockSession({ session_id: 'sess-2', is_active: false }),
        createMockSession({ session_id: 'sess-last', is_active: true }),
      ];

      const { result } = renderHook(() => useSessionStatus(sessions));

      expect(result.current.hasRunning).toBe(true);
      expect(result.current.hasCompleted).toBe(false);
    });
  });
});
