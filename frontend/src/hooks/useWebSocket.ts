import { useEffect, useRef, useCallback, useState } from 'react';

interface UseWebSocketOptions {
  onMessage?: (data: ArrayBuffer) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

export function useWebSocket(
  sessionId: string | null,
  options: UseWebSocketOptions = {}
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/sessions/${sessionId}/ws`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      options.onOpen?.();
    };

    ws.onmessage = (event) => {
      options.onMessage?.(event.data);
    };

    ws.onclose = () => {
      setIsConnected(false);
      options.onClose?.();
    };

    ws.onerror = (error) => {
      options.onError?.(error);
    };

    return () => {
      ws.close();
    };
  }, [sessionId]);

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
