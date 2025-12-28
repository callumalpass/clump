/**
 * Hook for managing real-time events from the backend.
 *
 * Connects to the events WebSocket and handles:
 * - Notification events (permission requests, idle state)
 * - Session events (created, updated, completed, deleted)
 * - Process events (started, ended)
 * - Counts updates (session counts per repo)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RepoSessionCount } from '../types';

export type NotificationType = 'permission_needed' | 'idle' | 'session_completed' | 'session_failed';

// Event types from backend
export type EventType =
  | 'notification'
  | 'initial_state'
  | 'session_created'
  | 'session_updated'
  | 'session_completed'
  | 'session_deleted'
  | 'process_started'
  | 'process_ended'
  | 'counts_changed';

export interface SessionNotification {
  session_id: string;
  notification_type: NotificationType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface SessionCreatedEvent {
  session_id: string;
  repo_path: string;
  title: string;
  is_active: boolean;
  timestamp: string;
}

export interface SessionUpdatedEvent {
  session_id: string;
  repo_path: string;
  changes: {
    title?: string;
    starred?: boolean;
    tags?: string[];
    entities?: Array<{ kind: string; number: number }>;
  };
  timestamp: string;
}

export interface SessionCompletedEvent {
  session_id: string;
  repo_path: string;
  end_time: string;
  timestamp: string;
}

export interface SessionDeletedEvent {
  session_id: string;
  repo_path: string;
  timestamp: string;
}

export interface ProcessEvent {
  process_id: string;
  session_id: string;
  working_dir: string;
  timestamp: string;
}

export interface CountsChangedEvent {
  counts: Record<string, RepoSessionCount>;
  timestamp: string;
}

export interface InitialStateEvent {
  sessions_needing_attention: string[];
  processes: Array<{
    id: string;
    session_id: number | null;
    working_dir: string;
    created_at: string;
  }>;
}

interface UseNotificationsOptions {
  /** Enable desktop notifications (requires permission) */
  enableDesktopNotifications?: boolean;
  /** Enable sound notifications */
  enableSound?: boolean;
  /** Callback when any session needs attention */
  onAttentionNeeded?: (notification: SessionNotification) => void;
  /** Callback when a session is created */
  onSessionCreated?: (event: SessionCreatedEvent) => void;
  /** Callback when a session is updated */
  onSessionUpdated?: (event: SessionUpdatedEvent) => void;
  /** Callback when a session is completed */
  onSessionCompleted?: (event: SessionCompletedEvent) => void;
  /** Callback when a session is deleted */
  onSessionDeleted?: (event: SessionDeletedEvent) => void;
  /** Callback when a process starts */
  onProcessStarted?: (event: ProcessEvent) => void;
  /** Callback when a process ends */
  onProcessEnded?: (event: ProcessEvent) => void;
  /** Callback when session counts change */
  onCountsChanged?: (event: CountsChangedEvent) => void;
  /** Callback for initial state (processes list) */
  onInitialState?: (event: InitialStateEvent) => void;
}

interface UseNotificationsReturn {
  /** Set of session IDs that currently need attention */
  sessionsNeedingAttention: Set<string>;
  /** Check if a specific session needs attention */
  needsAttention: (sessionId: string) => boolean;
  /** Clear attention state for a session (user has seen it) */
  clearAttention: (sessionId: string) => void;
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Request permission for desktop notifications */
  requestNotificationPermission: () => Promise<NotificationPermission>;
  /** Current notification permission status */
  notificationPermission: NotificationPermission;
}

// Audio context for notification sounds
let audioContext: AudioContext | null = null;

function playNotificationSound() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Simple beep using Web Audio API
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.warn('Could not play notification sound:', e);
  }
}

export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsReturn {
  const {
    enableDesktopNotifications = true,
    enableSound = true,
    onAttentionNeeded,
    onSessionCreated,
    onSessionUpdated,
    onSessionCompleted,
    onSessionDeleted,
    onProcessStarted,
    onProcessEnded,
    onCountsChanged,
    onInitialState,
  } = options;

  // Store callbacks in refs to avoid reconnecting WebSocket when callbacks change
  const callbacksRef = useRef({
    onSessionCreated,
    onSessionUpdated,
    onSessionCompleted,
    onSessionDeleted,
    onProcessStarted,
    onProcessEnded,
    onCountsChanged,
    onInitialState,
  });
  callbacksRef.current = {
    onSessionCreated,
    onSessionUpdated,
    onSessionCompleted,
    onSessionDeleted,
    onProcessStarted,
    onProcessEnded,
    onCountsChanged,
    onInitialState,
  };

  const [sessionsNeedingAttention, setSessionsNeedingAttention] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track if window is focused (for desktop notifications)
  const isWindowFocused = useRef(document.hasFocus());

  useEffect(() => {
    const onFocus = () => { isWindowFocused.current = true; };
    const onBlur = () => { isWindowFocused.current = false; };

    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Show desktop notification
  const showDesktopNotification = useCallback((notification: SessionNotification) => {
    if (!enableDesktopNotifications || isWindowFocused.current) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const toolName = notification.data.tool_name as string | undefined;
    const message = notification.data.message as string | undefined;

    let body = 'Claude needs your attention';
    if (toolName) {
      body = `Permission requested for ${toolName}`;
    } else if (message) {
      body = message;
    }

    try {
      new Notification('Claude Code', {
        body,
        icon: '/favicon.ico',
        tag: notification.session_id, // Prevents duplicate notifications per session
      });
    } catch (e) {
      console.warn('Could not show desktop notification:', e);
    }
  }, [enableDesktopNotifications]);

  // Handle incoming notification
  const handleNotification = useCallback((notification: SessionNotification) => {
    if (notification.notification_type === 'permission_needed' || notification.notification_type === 'idle') {
      setSessionsNeedingAttention(prev => {
        const next = new Set(prev);
        next.add(notification.session_id);
        return next;
      });

      // Play sound
      if (enableSound) {
        playNotificationSound();
      }

      // Show desktop notification
      showDesktopNotification(notification);

      // Callback
      onAttentionNeeded?.(notification);
    }
  }, [enableSound, showDesktopNotification, onAttentionNeeded]);

  // Connect to WebSocket
  useEffect(() => {
    function connect() {
      // Use relative WebSocket URL based on current location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = '8000'; // Backend port
      const wsUrl = `${protocol}//${host}:${port}/api/hooks/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('Notifications WebSocket connected');
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect after delay
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.warn('Notifications WebSocket error:', error);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const callbacks = callbacksRef.current;

          switch (data.type) {
            case 'initial_state':
              // Set initial attention state
              setSessionsNeedingAttention(new Set(data.sessions_needing_attention || []));
              callbacks.onInitialState?.(data as InitialStateEvent);
              break;

            case 'notification':
              handleNotification(data as SessionNotification);
              break;

            case 'session_created':
              callbacks.onSessionCreated?.(data as SessionCreatedEvent);
              break;

            case 'session_updated':
              callbacks.onSessionUpdated?.(data as SessionUpdatedEvent);
              break;

            case 'session_completed':
              callbacks.onSessionCompleted?.(data as SessionCompletedEvent);
              break;

            case 'session_deleted':
              callbacks.onSessionDeleted?.(data as SessionDeletedEvent);
              break;

            case 'process_started':
              callbacks.onProcessStarted?.(data as ProcessEvent);
              break;

            case 'process_ended':
              callbacks.onProcessEnded?.(data as ProcessEvent);
              break;

            case 'counts_changed':
              callbacks.onCountsChanged?.(data as CountsChangedEvent);
              break;
          }
        } catch (e) {
          console.warn('Failed to parse WebSocket message:', e);
        }
      };
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [handleNotification]);

  // Clear attention for a session
  const clearAttention = useCallback((sessionId: string) => {
    setSessionsNeedingAttention(prev => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });

    // Notify backend
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'clear_attention',
        session_id: sessionId,
      }));
    }
  }, []);

  // Check if a session needs attention
  const needsAttention = useCallback((sessionId: string) => {
    return sessionsNeedingAttention.has(sessionId);
  }, [sessionsNeedingAttention]);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      return 'denied' as NotificationPermission;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  }, []);

  return {
    sessionsNeedingAttention,
    needsAttention,
    clearAttention,
    isConnected,
    requestNotificationPermission,
    notificationPermission,
  };
}
