import { useEffect, useRef, useCallback, useState } from 'react';

interface UseWebSocketOptions {
  onMessage?: (data: ArrayBuffer) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

export function useWebSocket(
  processId: string | null,
  options: UseWebSocketOptions = {}
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Store callbacks in refs to avoid stale closures
  // This ensures the latest callback is always called without needing to reconnect
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  useEffect(() => {
    if (!processId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/processes/${processId}/ws`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      callbacksRef.current.onOpen?.();
    };

    ws.onmessage = (event) => {
      callbacksRef.current.onMessage?.(event.data);
    };

    ws.onclose = () => {
      setIsConnected(false);
      callbacksRef.current.onClose?.();
    };

    ws.onerror = (error) => {
      callbacksRef.current.onError?.(error);
    };

    return () => {
      ws.close();
    };
  }, [processId]);

  const send = useCallback((type: string, data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  const sendInput = useCallback((input: string) => {
    send('input', { data: input });
  }, [send]);

  const sendResize = useCallback((rows: number, cols: number) => {
    send('resize', { rows, cols });
  }, [send]);

  return {
    isConnected,
    sendInput,
    sendResize,
  };
}
