import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotifications, type SessionNotification } from './useNotifications';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private static instances: MockWebSocket[] = [];
  private sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateMessage(data: object) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  getSentMessages(): string[] {
    return this.sentMessages;
  }

  static getLastInstance(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  static getAllInstances(): MockWebSocket[] {
    return [...MockWebSocket.instances];
  }

  static clearInstances() {
    MockWebSocket.instances = [];
  }

  static getInstanceCount(): number {
    return MockWebSocket.instances.length;
  }
}

// Mock AudioContext - use a class to properly mock the constructor
class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn();
  createOscillator = vi.fn(() => ({
    connect: vi.fn(),
    frequency: { value: 0 },
    type: 'sine',
    start: vi.fn(),
    stop: vi.fn(),
  }));
  createGain = vi.fn(() => ({
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  }));
}

// Replace globals
const originalWebSocket = globalThis.WebSocket;
const originalAudioContext = globalThis.AudioContext;
const originalNotification = globalThis.Notification;

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.clearInstances();
  // @ts-expect-error - Replacing WebSocket with mock
  globalThis.WebSocket = MockWebSocket;
  // @ts-expect-error - Replacing AudioContext with mock
  globalThis.AudioContext = MockAudioContext;

  // Mock Notification API
  // @ts-expect-error - Mocking Notification
  globalThis.Notification = vi.fn();
  // @ts-expect-error - Adding permission property
  globalThis.Notification.permission = 'granted';
  // @ts-expect-error - Adding requestPermission
  globalThis.Notification.requestPermission = vi.fn().mockResolvedValue('granted');

  // Mock document.hasFocus
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.WebSocket = originalWebSocket;
  globalThis.AudioContext = originalAudioContext;
  globalThis.Notification = originalNotification;
  vi.restoreAllMocks();
});

describe('useNotifications', () => {
  describe('WebSocket connection', () => {
    it('connects to WebSocket on mount', () => {
      renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      expect(ws).toBeDefined();
      expect(ws?.url).toContain('/api/hooks/ws');
    });

    it('uses ws protocol on http', () => {
      Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', hostname: 'localhost' },
        writable: true,
      });

      renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      expect(ws?.url).toMatch(/^ws:/);
    });

    it('uses wss protocol on https', () => {
      Object.defineProperty(window, 'location', {
        value: { protocol: 'https:', hostname: 'example.com' },
        writable: true,
      });

      renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      expect(ws?.url).toMatch(/^wss:/);
    });

    it('reports connected state after open', () => {
      const { result } = renderHook(() => useNotifications());

      expect(result.current.isConnected).toBe(false);

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);
    });

    it('reports disconnected state after close', () => {
      const { result } = renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);

      act(() => {
        ws?.simulateClose();
      });

      expect(result.current.isConnected).toBe(false);
    });

    it('attempts to reconnect after close', () => {
      renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        ws?.simulateClose();
      });

      const countBefore = MockWebSocket.getInstanceCount();

      // Advance timers for reconnect (3000ms)
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(MockWebSocket.getInstanceCount()).toBeGreaterThan(countBefore);
    });

    it('cleans up WebSocket on unmount', () => {
      const { unmount } = renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      unmount();

      expect(ws?.readyState).toBe(MockWebSocket.CLOSED);
    });
  });

  describe('initial state handling', () => {
    it('sets sessions needing attention from initial_state', () => {
      const { result } = renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage({
          type: 'initial_state',
          sessions_needing_attention: ['session-1', 'session-2'],
          processes: [],
        });
      });

      expect(result.current.needsAttention('session-1')).toBe(true);
      expect(result.current.needsAttention('session-2')).toBe(true);
      expect(result.current.needsAttention('session-3')).toBe(false);
    });

    it('calls onInitialState callback', () => {
      const onInitialState = vi.fn();
      renderHook(() => useNotifications({ onInitialState }));

      const ws = MockWebSocket.getLastInstance();
      const initialStateData = {
        type: 'initial_state',
        sessions_needing_attention: ['session-1'],
        processes: [{ id: 'proc-1', session_id: null, working_dir: '/test', created_at: '2024-01-01' }],
      };

      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage(initialStateData);
      });

      expect(onInitialState).toHaveBeenCalledWith(initialStateData);
    });
  });

  describe('notification handling', () => {
    it('adds session to needsAttention set on permission_needed notification', () => {
      const { result } = renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage({
          type: 'notification',
          session_id: 'session-123',
          notification_type: 'permission_needed',
          data: { tool_name: 'Bash' },
          timestamp: '2024-01-01T00:00:00Z',
        });
      });

      expect(result.current.needsAttention('session-123')).toBe(true);
    });

    it('adds session to needsAttention set on idle notification', () => {
      const { result } = renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage({
          type: 'notification',
          session_id: 'session-456',
          notification_type: 'idle',
          data: {},
          timestamp: '2024-01-01T00:00:00Z',
        });
      });

      expect(result.current.needsAttention('session-456')).toBe(true);
    });

    it('stores notification details for tooltip display', () => {
      const { result } = renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage({
          type: 'notification',
          session_id: 'session-789',
          notification_type: 'permission_needed',
          data: { tool_name: 'Edit', message: 'File changes pending' },
          timestamp: '2024-01-01T12:00:00Z',
        });
      });

      const details = result.current.getNotificationDetails('session-789');
      expect(details).toEqual({
        notification_type: 'permission_needed',
        tool_name: 'Edit',
        message: 'File changes pending',
        timestamp: '2024-01-01T12:00:00Z',
      });
    });

    it('calls onAttentionNeeded callback', () => {
      const onAttentionNeeded = vi.fn();
      renderHook(() => useNotifications({ onAttentionNeeded }));

      const ws = MockWebSocket.getLastInstance();
      const notificationMessage = {
        type: 'notification',
        session_id: 'session-test',
        notification_type: 'permission_needed',
        data: { tool_name: 'Read' },
        timestamp: '2024-01-01T00:00:00Z',
      };

      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage(notificationMessage);
      });

      // The callback receives the full message as SessionNotification
      expect(onAttentionNeeded).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'session-test',
          notification_type: 'permission_needed',
          data: { tool_name: 'Read' },
          timestamp: '2024-01-01T00:00:00Z',
        })
      );
    });
  });

  describe('clearAttention', () => {
    it('removes session from needsAttention set', () => {
      const { result } = renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage({
          type: 'notification',
          session_id: 'session-clear',
          notification_type: 'permission_needed',
          data: {},
          timestamp: '2024-01-01T00:00:00Z',
        });
      });

      expect(result.current.needsAttention('session-clear')).toBe(true);

      act(() => {
        result.current.clearAttention('session-clear');
      });

      expect(result.current.needsAttention('session-clear')).toBe(false);
    });

    it('clears notification details', () => {
      const { result } = renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage({
          type: 'notification',
          session_id: 'session-details',
          notification_type: 'permission_needed',
          data: { tool_name: 'Write' },
          timestamp: '2024-01-01T00:00:00Z',
        });
      });

      expect(result.current.getNotificationDetails('session-details')).toBeDefined();

      act(() => {
        result.current.clearAttention('session-details');
      });

      expect(result.current.getNotificationDetails('session-details')).toBeUndefined();
    });

    it('sends clear_attention message to backend', () => {
      const { result } = renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      act(() => {
        result.current.clearAttention('session-backend');
      });

      const messages = ws?.getSentMessages();
      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages![0])).toEqual({
        type: 'clear_attention',
        session_id: 'session-backend',
      });
    });
  });

  describe('session event callbacks', () => {
    it('calls onSessionCreated callback', () => {
      const onSessionCreated = vi.fn();
      renderHook(() => useNotifications({ onSessionCreated }));

      const ws = MockWebSocket.getLastInstance();
      const event = {
        type: 'session_created',
        session_id: 'new-session',
        repo_path: '/test/repo',
        title: 'New Session',
        is_active: true,
        timestamp: '2024-01-01T00:00:00Z',
      };

      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage(event);
      });

      expect(onSessionCreated).toHaveBeenCalledWith(event);
    });

    it('calls onSessionUpdated callback', () => {
      const onSessionUpdated = vi.fn();
      renderHook(() => useNotifications({ onSessionUpdated }));

      const ws = MockWebSocket.getLastInstance();
      const event = {
        type: 'session_updated',
        session_id: 'updated-session',
        repo_path: '/test/repo',
        changes: { title: 'Updated Title' },
        timestamp: '2024-01-01T00:00:00Z',
      };

      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage(event);
      });

      expect(onSessionUpdated).toHaveBeenCalledWith(event);
    });

    it('calls onSessionCompleted callback', () => {
      const onSessionCompleted = vi.fn();
      renderHook(() => useNotifications({ onSessionCompleted }));

      const ws = MockWebSocket.getLastInstance();
      const event = {
        type: 'session_completed',
        session_id: 'completed-session',
        repo_path: '/test/repo',
        end_time: '2024-01-01T01:00:00Z',
        timestamp: '2024-01-01T01:00:00Z',
      };

      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage(event);
      });

      expect(onSessionCompleted).toHaveBeenCalledWith(event);
    });

    it('calls onSessionDeleted callback', () => {
      const onSessionDeleted = vi.fn();
      renderHook(() => useNotifications({ onSessionDeleted }));

      const ws = MockWebSocket.getLastInstance();
      const event = {
        type: 'session_deleted',
        session_id: 'deleted-session',
        repo_path: '/test/repo',
        timestamp: '2024-01-01T00:00:00Z',
      };

      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage(event);
      });

      expect(onSessionDeleted).toHaveBeenCalledWith(event);
    });
  });

  describe('process event callbacks', () => {
    it('calls onProcessStarted callback', () => {
      const onProcessStarted = vi.fn();
      renderHook(() => useNotifications({ onProcessStarted }));

      const ws = MockWebSocket.getLastInstance();
      const event = {
        type: 'process_started',
        process_id: 'proc-1',
        session_id: 'session-1',
        working_dir: '/test',
        timestamp: '2024-01-01T00:00:00Z',
      };

      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage(event);
      });

      expect(onProcessStarted).toHaveBeenCalledWith(event);
    });

    it('calls onProcessEnded callback', () => {
      const onProcessEnded = vi.fn();
      renderHook(() => useNotifications({ onProcessEnded }));

      const ws = MockWebSocket.getLastInstance();
      const event = {
        type: 'process_ended',
        process_id: 'proc-1',
        session_id: 'session-1',
        working_dir: '/test',
        timestamp: '2024-01-01T00:00:00Z',
      };

      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage(event);
      });

      expect(onProcessEnded).toHaveBeenCalledWith(event);
    });
  });

  describe('counts changed callback', () => {
    it('calls onCountsChanged callback', () => {
      const onCountsChanged = vi.fn();
      renderHook(() => useNotifications({ onCountsChanged }));

      const ws = MockWebSocket.getLastInstance();
      const event = {
        type: 'counts_changed',
        counts: {
          '/repo1': { total: 5, active: 2, starred: 1 },
          '/repo2': { total: 3, active: 0, starred: 2 },
        },
        timestamp: '2024-01-01T00:00:00Z',
      };

      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage(event);
      });

      expect(onCountsChanged).toHaveBeenCalledWith(event);
    });
  });

  describe('callback stability (stale closure prevention)', () => {
    it('does not reconnect WebSocket when callbacks change', () => {
      const onSessionCreated1 = vi.fn();
      const onSessionCreated2 = vi.fn();

      const { rerender } = renderHook(
        ({ onSessionCreated }) => useNotifications({ onSessionCreated }),
        { initialProps: { onSessionCreated: onSessionCreated1 } }
      );

      const ws1 = MockWebSocket.getLastInstance();
      act(() => {
        ws1?.simulateOpen();
      });

      const instanceCountBefore = MockWebSocket.getInstanceCount();

      // Rerender with new callback
      rerender({ onSessionCreated: onSessionCreated2 });

      // Should not create a new WebSocket
      expect(MockWebSocket.getInstanceCount()).toBe(instanceCountBefore);
      expect(ws1?.readyState).toBe(MockWebSocket.OPEN);
    });

    it('uses updated callbacks after rerender', () => {
      const onSessionCreated1 = vi.fn();
      const onSessionCreated2 = vi.fn();

      const { rerender } = renderHook(
        ({ onSessionCreated }) => useNotifications({ onSessionCreated }),
        { initialProps: { onSessionCreated: onSessionCreated1 } }
      );

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      // Rerender with new callback
      rerender({ onSessionCreated: onSessionCreated2 });

      // Send event
      act(() => {
        ws?.simulateMessage({
          type: 'session_created',
          session_id: 'test',
          repo_path: '/test',
          title: 'Test',
          is_active: true,
          timestamp: '2024-01-01T00:00:00Z',
        });
      });

      // Old callback should NOT be called
      expect(onSessionCreated1).not.toHaveBeenCalled();
      // New callback SHOULD be called
      expect(onSessionCreated2).toHaveBeenCalled();
    });

    it('does not reconnect when enableSound changes', () => {
      const { rerender } = renderHook(
        ({ enableSound }) => useNotifications({ enableSound }),
        { initialProps: { enableSound: true } }
      );

      const ws1 = MockWebSocket.getLastInstance();
      act(() => {
        ws1?.simulateOpen();
      });

      const instanceCountBefore = MockWebSocket.getInstanceCount();

      // Toggle enableSound
      rerender({ enableSound: false });

      // Should not create a new WebSocket
      expect(MockWebSocket.getInstanceCount()).toBe(instanceCountBefore);
      expect(ws1?.readyState).toBe(MockWebSocket.OPEN);
    });

    it('does not reconnect when onAttentionNeeded changes', () => {
      const onAttentionNeeded1 = vi.fn();
      const onAttentionNeeded2 = vi.fn();

      const { rerender } = renderHook(
        ({ onAttentionNeeded }) => useNotifications({ onAttentionNeeded }),
        { initialProps: { onAttentionNeeded: onAttentionNeeded1 } }
      );

      const ws1 = MockWebSocket.getLastInstance();
      act(() => {
        ws1?.simulateOpen();
      });

      const instanceCountBefore = MockWebSocket.getInstanceCount();

      // Change callback
      rerender({ onAttentionNeeded: onAttentionNeeded2 });

      // Should not create a new WebSocket
      expect(MockWebSocket.getInstanceCount()).toBe(instanceCountBefore);
      expect(ws1?.readyState).toBe(MockWebSocket.OPEN);
    });
  });

  describe('desktop notifications', () => {
    it('does not show notification when window is focused', () => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);

      renderHook(() => useNotifications({ enableDesktopNotifications: true }));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        ws?.simulateMessage({
          type: 'notification',
          session_id: 'session-1',
          notification_type: 'permission_needed',
          data: {},
          timestamp: '2024-01-01T00:00:00Z',
        });
      });

      // Notification constructor should not be called
      expect(globalThis.Notification).not.toHaveBeenCalled();
    });
  });

  describe('notification permission', () => {
    it('returns current notification permission', () => {
      const { result } = renderHook(() => useNotifications());

      expect(result.current.notificationPermission).toBe('granted');
    });

    it('requestNotificationPermission calls Notification.requestPermission', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.requestNotificationPermission();
      });

      expect(globalThis.Notification.requestPermission).toHaveBeenCalled();
    });
  });

  describe('return value stability', () => {
    it('returns stable function references', () => {
      const { result, rerender } = renderHook(() => useNotifications());

      const initialNeedsAttention = result.current.needsAttention;
      const initialGetNotificationDetails = result.current.getNotificationDetails;
      const initialClearAttention = result.current.clearAttention;
      const initialRequestPermission = result.current.requestNotificationPermission;

      rerender();

      expect(result.current.needsAttention).toBe(initialNeedsAttention);
      expect(result.current.getNotificationDetails).toBe(initialGetNotificationDetails);
      expect(result.current.clearAttention).toBe(initialClearAttention);
      expect(result.current.requestNotificationPermission).toBe(initialRequestPermission);
    });
  });

  describe('error handling', () => {
    it('handles WebSocket errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateError();
      });

      // Should not throw
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles malformed JSON messages gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      renderHook(() => useNotifications());

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        // Send invalid JSON
        if (ws?.onmessage) {
          ws.onmessage(new MessageEvent('message', { data: 'not json' }));
        }
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse WebSocket message:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });
});
