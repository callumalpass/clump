import { useEffect, useRef, useCallback, useState } from 'react';
import { useWebSocketManager } from '../contexts/WebSocketContext';

interface UseProcessWebSocketOptions {
  onMessage?: (data: ArrayBuffer) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

/**
 * Hook to interact with a WebSocket connection for a process.
 *
 * Unlike the original useWebSocket, this hook:
 * - Uses a shared connection manager (WebSocketProvider)
 * - Does NOT close the connection when the component unmounts
 * - Connections persist across tab switches and are only closed when:
 *   - The session tab is explicitly closed
 *   - The process ends
 *
 * This allows seamless tab switching without disconnecting WebSockets.
 */
export function useProcessWebSocket(
  processId: string | null,
  options: UseProcessWebSocketOptions = {}
) {
  const { subscribe, send, isConnected: checkConnected } = useWebSocketManager();
  const [isConnected, setIsConnected] = useState(false);

  // Store callbacks in refs to avoid recreating subscriptions
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  useEffect(() => {
    if (!processId) {
      setIsConnected(false);
      return;
    }

    // Subscribe to the connection with stable callback wrappers
    const unsubscribe = subscribe(processId, {
      onMessage: (data) => {
        callbacksRef.current.onMessage?.(data);
      },
      onOpen: () => {
        setIsConnected(true);
        callbacksRef.current.onOpen?.();
      },
      onClose: () => {
        setIsConnected(false);
        callbacksRef.current.onClose?.();
      },
      onError: (error) => {
        callbacksRef.current.onError?.(error);
      },
    });

    // Check if already connected (connection may have been created by another component)
    setIsConnected(checkConnected(processId));

    // Unsubscribe when component unmounts or processId changes
    // Note: This removes our callbacks but does NOT close the connection!
    return unsubscribe;
  }, [processId, subscribe, checkConnected]);

  const sendMessage = useCallback((type: string, data: Record<string, unknown>) => {
    if (processId) {
      send(processId, type, data);
    }
  }, [processId, send]);

  const sendInput = useCallback((input: string) => {
    sendMessage('input', { data: input });
  }, [sendMessage]);

  const sendResize = useCallback((rows: number, cols: number) => {
    sendMessage('resize', { rows, cols });
  }, [sendMessage]);

  return {
    isConnected,
    sendInput,
    sendResize,
  };
}
