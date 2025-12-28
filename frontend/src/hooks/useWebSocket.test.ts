import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  binaryType: string = 'blob';
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

  simulateMessage(data: ArrayBuffer) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
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

  static clearInstances() {
    MockWebSocket.instances = [];
  }
}

// Replace global WebSocket with mock
const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  MockWebSocket.clearInstances();
  // @ts-expect-error - Replacing WebSocket with mock
  globalThis.WebSocket = MockWebSocket;
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
});

describe('useWebSocket', () => {
  describe('connection behavior', () => {
    it('should not connect when processId is null', () => {
      renderHook(() => useWebSocket(null));

      expect(MockWebSocket.getLastInstance()).toBeUndefined();
    });

    it('should connect when processId is provided', () => {
      renderHook(() => useWebSocket('test-process-123'));

      const ws = MockWebSocket.getLastInstance();
      expect(ws).toBeDefined();
      expect(ws?.url).toContain('/api/processes/test-process-123/ws');
    });

    it('should use ws protocol on http', () => {
      // Mock location
      Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', host: 'localhost:3000' },
        writable: true,
      });

      renderHook(() => useWebSocket('test-id'));

      const ws = MockWebSocket.getLastInstance();
      expect(ws?.url).toBe('ws://localhost:3000/api/processes/test-id/ws');
    });

    it('should use wss protocol on https', () => {
      Object.defineProperty(window, 'location', {
        value: { protocol: 'https:', host: 'example.com' },
        writable: true,
      });

      renderHook(() => useWebSocket('test-id'));

      const ws = MockWebSocket.getLastInstance();
      expect(ws?.url).toBe('wss://example.com/api/processes/test-id/ws');
    });

    it('should set binaryType to arraybuffer', () => {
      renderHook(() => useWebSocket('test-id'));

      const ws = MockWebSocket.getLastInstance();
      expect(ws?.binaryType).toBe('arraybuffer');
    });
  });

  describe('connection state', () => {
    it('should initially report not connected', () => {
      const { result } = renderHook(() => useWebSocket('test-id'));

      expect(result.current.isConnected).toBe(false);
    });

    it('should report connected after open event', async () => {
      const { result } = renderHook(() => useWebSocket('test-id'));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });

    it('should report not connected after close event', async () => {
      const { result } = renderHook(() => useWebSocket('test-id'));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        ws?.simulateClose();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(false);
      });
    });
  });

  describe('callbacks', () => {
    it('should call onOpen when connection opens', async () => {
      const onOpen = vi.fn();
      renderHook(() => useWebSocket('test-id', { onOpen }));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      await waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(1);
      });
    });

    it('should call onMessage when message received', async () => {
      const onMessage = vi.fn();
      renderHook(() => useWebSocket('test-id', { onMessage }));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      const testData = new TextEncoder().encode('test message').buffer;
      act(() => {
        ws?.simulateMessage(testData);
      });

      await waitFor(() => {
        expect(onMessage).toHaveBeenCalledTimes(1);
        expect(onMessage).toHaveBeenCalledWith(testData);
      });
    });

    it('should call onClose when connection closes', async () => {
      const onClose = vi.fn();
      renderHook(() => useWebSocket('test-id', { onClose }));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
        ws?.simulateClose();
      });

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('should call onError when error occurs', async () => {
      const onError = vi.fn();
      renderHook(() => useWebSocket('test-id', { onError }));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateError();
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('sendInput', () => {
    it('should send input message when connected', async () => {
      const { result } = renderHook(() => useWebSocket('test-id'));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      act(() => {
        result.current.sendInput('hello world');
      });

      const messages = ws?.getSentMessages();
      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages![0])).toEqual({
        type: 'input',
        data: 'hello world',
      });
    });

    it('should not throw when sending while disconnected', () => {
      const { result } = renderHook(() => useWebSocket('test-id'));

      // WebSocket not open yet
      expect(() => {
        act(() => {
          result.current.sendInput('test');
        });
      }).not.toThrow();
    });
  });

  describe('sendResize', () => {
    it('should send resize message when connected', async () => {
      const { result } = renderHook(() => useWebSocket('test-id'));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      act(() => {
        result.current.sendResize(24, 80);
      });

      const messages = ws?.getSentMessages();
      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages![0])).toEqual({
        type: 'resize',
        rows: 24,
        cols: 80,
      });
    });

    it('should send multiple resize messages', async () => {
      const { result } = renderHook(() => useWebSocket('test-id'));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      act(() => {
        result.current.sendResize(24, 80);
        result.current.sendResize(30, 120);
      });

      const messages = ws?.getSentMessages();
      expect(messages).toHaveLength(2);
    });
  });

  describe('cleanup', () => {
    it('should close connection on unmount', async () => {
      const { unmount } = renderHook(() => useWebSocket('test-id'));

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      unmount();

      expect(ws?.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should close previous connection when processId changes', () => {
      const { rerender } = renderHook(
        ({ processId }) => useWebSocket(processId),
        { initialProps: { processId: 'process-1' } }
      );

      const ws1 = MockWebSocket.getLastInstance();
      act(() => {
        ws1?.simulateOpen();
      });

      rerender({ processId: 'process-2' });

      expect(ws1?.readyState).toBe(MockWebSocket.CLOSED);

      const ws2 = MockWebSocket.getLastInstance();
      expect(ws2).not.toBe(ws1);
      expect(ws2?.url).toContain('process-2');
    });
  });

  describe('return value stability', () => {
    it('should return stable function references', async () => {
      const { result, rerender } = renderHook(() => useWebSocket('test-id'));

      const initialSendInput = result.current.sendInput;
      const initialSendResize = result.current.sendResize;

      rerender();

      expect(result.current.sendInput).toBe(initialSendInput);
      expect(result.current.sendResize).toBe(initialSendResize);
    });
  });

  describe('callback updates (stale closure prevention)', () => {
    it('should call updated onMessage callback after rerender', async () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();

      const { rerender } = renderHook(
        ({ onMessage }) => useWebSocket('test-id', { onMessage }),
        { initialProps: { onMessage: onMessage1 } }
      );

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      // Rerender with a new callback
      rerender({ onMessage: onMessage2 });

      // Simulate a message - should call the NEW callback, not the old one
      const testData = new TextEncoder().encode('test').buffer;
      act(() => {
        ws?.simulateMessage(testData);
      });

      await waitFor(() => {
        // Old callback should NOT be called
        expect(onMessage1).not.toHaveBeenCalled();
        // New callback SHOULD be called
        expect(onMessage2).toHaveBeenCalledTimes(1);
        expect(onMessage2).toHaveBeenCalledWith(testData);
      });
    });

    it('should call updated onOpen callback after rerender', async () => {
      const onOpen1 = vi.fn();
      const onOpen2 = vi.fn();

      // Start with null processId so we can control when the connection opens
      const { rerender } = renderHook(
        ({ processId, onOpen }) => useWebSocket(processId, { onOpen }),
        { initialProps: { processId: null as string | null, onOpen: onOpen1 } }
      );

      // Update to use the second callback
      rerender({ processId: null, onOpen: onOpen2 });

      // Now connect with the updated callback in place
      rerender({ processId: 'test-id', onOpen: onOpen2 });

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      await waitFor(() => {
        // Only the second callback should be called
        expect(onOpen1).not.toHaveBeenCalled();
        expect(onOpen2).toHaveBeenCalledTimes(1);
      });
    });

    it('should call updated onClose callback after rerender', async () => {
      const onClose1 = vi.fn();
      const onClose2 = vi.fn();

      const { rerender } = renderHook(
        ({ onClose }) => useWebSocket('test-id', { onClose }),
        { initialProps: { onClose: onClose1 } }
      );

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateOpen();
      });

      // Update the callback
      rerender({ onClose: onClose2 });

      // Close the connection
      act(() => {
        ws?.simulateClose();
      });

      await waitFor(() => {
        expect(onClose1).not.toHaveBeenCalled();
        expect(onClose2).toHaveBeenCalledTimes(1);
      });
    });

    it('should call updated onError callback after rerender', async () => {
      const onError1 = vi.fn();
      const onError2 = vi.fn();

      const { rerender } = renderHook(
        ({ onError }) => useWebSocket('test-id', { onError }),
        { initialProps: { onError: onError1 } }
      );

      // Update the callback
      rerender({ onError: onError2 });

      const ws = MockWebSocket.getLastInstance();
      act(() => {
        ws?.simulateError();
      });

      await waitFor(() => {
        expect(onError1).not.toHaveBeenCalled();
        expect(onError2).toHaveBeenCalledTimes(1);
      });
    });

    it('should not reconnect when only callbacks change', async () => {
      const onMessage1 = vi.fn();
      const onMessage2 = vi.fn();

      const { rerender } = renderHook(
        ({ onMessage }) => useWebSocket('test-id', { onMessage }),
        { initialProps: { onMessage: onMessage1 } }
      );

      const ws1 = MockWebSocket.getLastInstance();
      act(() => {
        ws1?.simulateOpen();
      });

      // Get instance count before rerender
      const instanceCountBefore = MockWebSocket.getLastInstance();

      // Rerender with new callback
      rerender({ onMessage: onMessage2 });

      // Should be the same WebSocket instance (no reconnection)
      const instanceCountAfter = MockWebSocket.getLastInstance();
      expect(instanceCountAfter).toBe(instanceCountBefore);
      expect(ws1?.readyState).toBe(MockWebSocket.OPEN);
    });
  });
});
