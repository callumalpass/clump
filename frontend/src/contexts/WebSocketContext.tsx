import { createContext, useContext, useRef, useCallback, useState, useEffect, type ReactNode } from 'react';

// =============================================================================
// Types
// =============================================================================

interface WebSocketConnection {
  socket: WebSocket;
  isConnected: boolean;
  subscribers: Set<(data: ArrayBuffer) => void>;
  openCallbacks: Set<() => void>;
  closeCallbacks: Set<() => void>;
  errorCallbacks: Set<(error: Event) => void>;
}

interface WebSocketContextValue {
  /**
   * Subscribe to a WebSocket connection for a process.
   * Creates the connection if it doesn't exist.
   * Returns an unsubscribe function.
   */
  subscribe: (
    processId: string,
    callbacks: {
      onMessage?: (data: ArrayBuffer) => void;
      onOpen?: () => void;
      onClose?: () => void;
      onError?: (error: Event) => void;
    }
  ) => () => void;

  /**
   * Send data through a WebSocket connection.
   */
  send: (processId: string, type: string, data: Record<string, unknown>) => void;

  /**
   * Close a specific WebSocket connection.
   * Use when a session tab is closed.
   */
  closeConnection: (processId: string) => void;

  /**
   * Check if a connection is currently open.
   */
  isConnected: (processId: string) => boolean;

  /**
   * Get list of all active process IDs with connections.
   */
  getActiveProcessIds: () => string[];
}

// =============================================================================
// Context
// =============================================================================

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  // Map of processId -> WebSocketConnection
  const connectionsRef = useRef<Map<string, WebSocketConnection>>(new Map());

  // Force re-render when connection states change (for isConnected checks)
  const [, forceUpdate] = useState(0);
  const triggerUpdate = useCallback(() => forceUpdate(n => n + 1), []);

  // Clean up all connections on unmount
  useEffect(() => {
    return () => {
      connectionsRef.current.forEach((conn) => {
        try {
          conn.socket.close();
        } catch {
          // Ignore close errors during cleanup
        }
      });
      connectionsRef.current.clear();
    };
  }, []);

  const createConnection = useCallback((processId: string): WebSocketConnection => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/processes/${processId}/ws`;

    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';

    const connection: WebSocketConnection = {
      socket,
      isConnected: false,
      subscribers: new Set(),
      openCallbacks: new Set(),
      closeCallbacks: new Set(),
      errorCallbacks: new Set(),
    };

    socket.onopen = () => {
      connection.isConnected = true;
      triggerUpdate();
      connection.openCallbacks.forEach(cb => {
        try {
          cb();
        } catch (e) {
          console.error('Error in onOpen callback:', e);
        }
      });
    };

    socket.onmessage = (event) => {
      connection.subscribers.forEach(cb => {
        try {
          cb(event.data);
        } catch (e) {
          console.error('Error in message subscriber:', e);
        }
      });
    };

    socket.onclose = () => {
      connection.isConnected = false;
      triggerUpdate();
      connection.closeCallbacks.forEach(cb => {
        try {
          cb();
        } catch (e) {
          console.error('Error in onClose callback:', e);
        }
      });
      // Remove from connections map when closed
      connectionsRef.current.delete(processId);
    };

    socket.onerror = (error) => {
      connection.errorCallbacks.forEach(cb => {
        try {
          cb(error);
        } catch (e) {
          console.error('Error in onError callback:', e);
        }
      });
    };

    return connection;
  }, [triggerUpdate]);

  const subscribe = useCallback((
    processId: string,
    callbacks: {
      onMessage?: (data: ArrayBuffer) => void;
      onOpen?: () => void;
      onClose?: () => void;
      onError?: (error: Event) => void;
    }
  ): (() => void) => {
    // Get or create connection
    let connection = connectionsRef.current.get(processId);

    if (!connection) {
      connection = createConnection(processId);
      connectionsRef.current.set(processId, connection);
    }

    // Register callbacks
    if (callbacks.onMessage) {
      connection.subscribers.add(callbacks.onMessage);
    }
    if (callbacks.onOpen) {
      connection.openCallbacks.add(callbacks.onOpen);
      // If already connected, call immediately
      if (connection.isConnected) {
        try {
          callbacks.onOpen();
        } catch (e) {
          console.error('Error in immediate onOpen callback:', e);
        }
      }
    }
    if (callbacks.onClose) {
      connection.closeCallbacks.add(callbacks.onClose);
    }
    if (callbacks.onError) {
      connection.errorCallbacks.add(callbacks.onError);
    }

    // Return unsubscribe function
    return () => {
      const conn = connectionsRef.current.get(processId);
      if (conn) {
        if (callbacks.onMessage) {
          conn.subscribers.delete(callbacks.onMessage);
        }
        if (callbacks.onOpen) {
          conn.openCallbacks.delete(callbacks.onOpen);
        }
        if (callbacks.onClose) {
          conn.closeCallbacks.delete(callbacks.onClose);
        }
        if (callbacks.onError) {
          conn.errorCallbacks.delete(callbacks.onError);
        }
        // Note: We don't close the connection here - that's the key difference!
        // Connection stays alive until explicitly closed via closeConnection
      }
    };
  }, [createConnection]);

  const send = useCallback((processId: string, type: string, data: Record<string, unknown>) => {
    const connection = connectionsRef.current.get(processId);
    if (connection?.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  const closeConnection = useCallback((processId: string) => {
    const connection = connectionsRef.current.get(processId);
    if (connection) {
      try {
        connection.socket.close();
      } catch {
        // Ignore close errors
      }
      connectionsRef.current.delete(processId);
      triggerUpdate();
    }
  }, [triggerUpdate]);

  const isConnected = useCallback((processId: string): boolean => {
    const connection = connectionsRef.current.get(processId);
    return connection?.isConnected ?? false;
  }, []);

  const getActiveProcessIds = useCallback((): string[] => {
    return Array.from(connectionsRef.current.keys());
  }, []);

  const value: WebSocketContextValue = {
    subscribe,
    send,
    closeConnection,
    isConnected,
    getActiveProcessIds,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useWebSocketManager(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketManager must be used within a WebSocketProvider');
  }
  return context;
}
