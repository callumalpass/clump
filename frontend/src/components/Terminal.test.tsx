import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Create mock instances to track method calls - must be defined before vi.mock calls
const mockTerminalInstance = {
  open: vi.fn(),
  loadAddon: vi.fn(),
  focus: vi.fn(),
  write: vi.fn(),
  onData: vi.fn(),
  dispose: vi.fn(),
  rows: 24,
  cols: 80,
  unicode: {
    activeVersion: '6',
  },
};

const mockFitAddonInstance = {
  fit: vi.fn(),
  dispose: vi.fn(),
};

const mockWebglAddonInstance = {
  onContextLoss: vi.fn(),
  dispose: vi.fn(),
};

const mockUnicode11AddonInstance = {
  dispose: vi.fn(),
};

// Mock useWebSocket hook
const mockSendInput = vi.fn();
const mockSendResize = vi.fn();
const mockUseWebSocket = vi.fn(() => ({
  isConnected: true,
  sendInput: mockSendInput,
  sendResize: mockSendResize,
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    open = mockTerminalInstance.open;
    loadAddon = mockTerminalInstance.loadAddon;
    focus = mockTerminalInstance.focus;
    write = mockTerminalInstance.write;
    onData = mockTerminalInstance.onData;
    dispose = mockTerminalInstance.dispose;
    rows = mockTerminalInstance.rows;
    cols = mockTerminalInstance.cols;
    unicode = mockTerminalInstance.unicode;
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = mockFitAddonInstance.fit;
    dispose = mockFitAddonInstance.dispose;
  },
}));

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss = mockWebglAddonInstance.onContextLoss;
    dispose = mockWebglAddonInstance.dispose;
  },
}));

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: class {
    dispose = mockUnicode11AddonInstance.dispose;
  },
}));

vi.mock('../hooks/useProcessWebSocket', () => ({
  useProcessWebSocket: (...args: unknown[]) => mockUseWebSocket(...args),
}));

// Import component after mocks
import { Terminal } from './Terminal';

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  triggerResize() {
    this.callback([], this);
  }
}

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  writable: true,
});

describe('Terminal', () => {
  const defaultProps = {
    processId: 'test-process-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset useWebSocket mock to default connected state
    mockUseWebSocket.mockReturnValue({
      isConnected: true,
      sendInput: mockSendInput,
      sendResize: mockSendResize,
    });

    // Reset ResizeObserver
    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders with header when showHeader is true (default)', () => {
      render(<Terminal {...defaultProps} />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('renders without header when showHeader is false', () => {
      render(<Terminal {...defaultProps} showHeader={false} />);

      expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    });

    it('shows process ID in header (truncated)', () => {
      render(<Terminal {...defaultProps} />);

      // Process ID is truncated to first 8 characters
      expect(screen.getByText('test-pro')).toBeInTheDocument();
    });

    it('renders terminal container', () => {
      const { container } = render(<Terminal {...defaultProps} />);

      expect(container.querySelector('.flex-1')).toBeInTheDocument();
    });
  });

  describe('Connection Status', () => {
    it('shows connected status when WebSocket is connected', () => {
      mockUseWebSocket.mockReturnValue({
        isConnected: true,
        sendInput: mockSendInput,
        sendResize: mockSendResize,
      });

      render(<Terminal {...defaultProps} />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows disconnected status when WebSocket is not connected', () => {
      mockUseWebSocket.mockReturnValue({
        isConnected: false,
        sendInput: mockSendInput,
        sendResize: mockSendResize,
      });

      render(<Terminal {...defaultProps} />);

      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('uses green styling when connected', () => {
      mockUseWebSocket.mockReturnValue({
        isConnected: true,
        sendInput: mockSendInput,
        sendResize: mockSendResize,
      });

      const { container } = render(<Terminal {...defaultProps} />);

      // Stoody theme uses mint color (#55efc4) for connected status
      const statusBadge = container.querySelector('.bg-\\[\\#55efc4\\]\\/20');
      expect(statusBadge).toBeInTheDocument();
    });

    it('uses red styling when disconnected', () => {
      mockUseWebSocket.mockReturnValue({
        isConnected: false,
        sendInput: mockSendInput,
        sendResize: mockSendResize,
      });

      const { container } = render(<Terminal {...defaultProps} />);

      // Stoody theme uses coral-red color (#ff7675) for disconnected status
      const statusBadge = container.querySelector('.bg-\\[\\#ff7675\\]\\/20');
      expect(statusBadge).toBeInTheDocument();
    });

    it('calls onConnectionChange when connection status changes', () => {
      const onConnectionChange = vi.fn();

      mockUseWebSocket.mockReturnValue({
        isConnected: true,
        sendInput: mockSendInput,
        sendResize: mockSendResize,
      });

      render(<Terminal {...defaultProps} onConnectionChange={onConnectionChange} />);

      expect(onConnectionChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Copy Process ID', () => {
    it('copies process ID when button is clicked', async () => {
      // Use real timers for clipboard tests since they involve async operations
      vi.useRealTimers();

      render(<Terminal {...defaultProps} />);

      const copyButton = screen.getByText('test-pro').closest('button')!;
      await act(async () => {
        fireEvent.click(copyButton);
        // Allow the async clipboard operation to complete
        await Promise.resolve();
      });

      expect(mockClipboard.writeText).toHaveBeenCalledWith('test-process-123');

      vi.useFakeTimers();
    });

    it('shows copied status after successful copy', async () => {
      vi.useRealTimers();

      render(<Terminal {...defaultProps} />);

      const copyButton = screen.getByText('test-pro').closest('button')!;
      await act(async () => {
        fireEvent.click(copyButton);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Copied to clipboard')).toBeInTheDocument();
      });

      vi.useFakeTimers();
    });

    it('resets copy status after timeout', async () => {
      vi.useRealTimers();

      render(<Terminal {...defaultProps} />);

      const copyButton = screen.getByText('test-pro').closest('button')!;

      // Click and wait for the copy to succeed
      await act(async () => {
        fireEvent.click(copyButton);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Copied to clipboard')).toBeInTheDocument();
      });

      // Wait for the reset timeout (2000ms + buffer)
      await waitFor(
        () => {
          expect(screen.getByLabelText('Copy process ID to clipboard')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      vi.useFakeTimers();
    });

    it('handles clipboard error gracefully', async () => {
      vi.useRealTimers();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));

      render(<Terminal {...defaultProps} />);

      const copyButton = screen.getByText('test-pro').closest('button')!;
      await act(async () => {
        fireEvent.click(copyButton);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to copy process ID');
      });

      consoleSpy.mockRestore();
      vi.useFakeTimers();
    });
  });

  describe('Close Button', () => {
    it('renders close button when onClose is provided', () => {
      render(<Terminal {...defaultProps} onClose={() => {}} />);

      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('does not render close button when onClose is not provided', () => {
      render(<Terminal {...defaultProps} />);

      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();

      render(<Terminal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Related Entity', () => {
    it('shows issue link when relatedEntity is an issue', () => {
      render(
        <Terminal
          {...defaultProps}
          relatedEntity={{ type: 'issue', number: 42 }}
          onShowRelated={() => {}}
        />
      );

      expect(screen.getByText('Issue #42')).toBeInTheDocument();
    });

    it('shows PR link when relatedEntity is a PR', () => {
      render(
        <Terminal
          {...defaultProps}
          relatedEntity={{ type: 'pr', number: 123 }}
          onShowRelated={() => {}}
        />
      );

      expect(screen.getByText('PR #123')).toBeInTheDocument();
    });

    it('calls onShowRelated when related entity link is clicked', () => {
      const onShowRelated = vi.fn();

      render(
        <Terminal
          {...defaultProps}
          relatedEntity={{ type: 'issue', number: 42 }}
          onShowRelated={onShowRelated}
        />
      );

      fireEvent.click(screen.getByText('Issue #42'));

      expect(onShowRelated).toHaveBeenCalled();
    });

    it('does not show related entity without onShowRelated callback', () => {
      render(
        <Terminal
          {...defaultProps}
          relatedEntity={{ type: 'issue', number: 42 }}
        />
      );

      expect(screen.queryByText('Issue #42')).not.toBeInTheDocument();
    });

    it('does not show related entity when not provided', () => {
      render(<Terminal {...defaultProps} onShowRelated={() => {}} />);

      expect(screen.queryByText(/Issue #/)).not.toBeInTheDocument();
      expect(screen.queryByText(/PR #/)).not.toBeInTheDocument();
    });
  });

  describe('XTerm Integration', () => {
    it('opens terminal on mount', () => {
      render(<Terminal {...defaultProps} />);

      expect(mockTerminalInstance.open).toHaveBeenCalled();
    });

    it('loads addons', () => {
      render(<Terminal {...defaultProps} />);

      // Should load FitAddon, Unicode11Addon, and potentially WebglAddon
      expect(mockTerminalInstance.loadAddon).toHaveBeenCalled();
    });

    it('focuses terminal after mount', () => {
      render(<Terminal {...defaultProps} />);

      expect(mockTerminalInstance.focus).toHaveBeenCalled();
    });

    it('disposes terminal on unmount', () => {
      const { unmount } = render(<Terminal {...defaultProps} />);

      unmount();

      expect(mockTerminalInstance.dispose).toHaveBeenCalled();
    });

    it('calls fit on mount', () => {
      render(<Terminal {...defaultProps} />);

      expect(mockFitAddonInstance.fit).toHaveBeenCalled();
    });
  });

  describe('WebSocket Integration', () => {
    it('passes processId to useWebSocket hook', () => {
      render(<Terminal processId="my-process-456" />);

      expect(mockUseWebSocket).toHaveBeenCalledWith(
        'my-process-456',
        expect.any(Object)
      );
    });

    it('writes received messages to terminal', () => {
      let messageCallback: ((data: ArrayBuffer) => void) | null = null;

      mockUseWebSocket.mockImplementation((_processId: unknown, options: { onMessage?: (data: ArrayBuffer) => void } | undefined) => {
        messageCallback = options?.onMessage || null;
        return {
          isConnected: true,
          sendInput: mockSendInput,
          sendResize: mockSendResize,
        };
      });

      render(<Terminal {...defaultProps} />);

      // Simulate receiving a message
      const testData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      act(() => {
        messageCallback?.(testData.buffer);
      });

      expect(mockTerminalInstance.write).toHaveBeenCalledWith(expect.any(Uint8Array));
    });

    it('sends input through WebSocket when typing', () => {
      let dataCallback: ((data: string) => void) | null = null;

      mockTerminalInstance.onData.mockImplementation((cb: (data: string) => void) => {
        dataCallback = cb;
      });

      render(<Terminal {...defaultProps} />);

      // Simulate typing
      act(() => {
        dataCallback?.('hello');
      });

      expect(mockSendInput).toHaveBeenCalledWith('hello');
    });
  });

  describe('Styling', () => {
    it('applies dark background', () => {
      const { container } = render(<Terminal {...defaultProps} />);

      // Stoody theme uses #2d3436 for the terminal background
      expect(container.querySelector('.bg-\\[\\#2d3436\\]')).toBeInTheDocument();
    });

    it('applies rounded border when header is shown', () => {
      const { container } = render(<Terminal {...defaultProps} showHeader={true} />);

      expect(container.querySelector('.rounded-lg')).toBeInTheDocument();
    });

    it('does not apply rounded border when header is hidden', () => {
      const { container } = render(<Terminal {...defaultProps} showHeader={false} />);

      // Container still exists but without the rounded class from the showHeader condition
      const mainContainer = container.firstChild;
      expect(mainContainer).not.toHaveClass('rounded-lg');
    });
  });

  describe('Cleanup', () => {
    it('cleans up resize observer on unmount', () => {
      const disconnectSpy = vi.fn();
      global.ResizeObserver = class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = disconnectSpy;
        constructor(_callback: ResizeObserverCallback) {}
      } as unknown as typeof ResizeObserver;

      const { unmount } = render(<Terminal {...defaultProps} />);

      unmount();

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('removes window resize listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(<Terminal {...defaultProps} />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('clears resize timeout on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const { unmount } = render(<Terminal {...defaultProps} />);

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('copy button has accessible label', () => {
      render(<Terminal {...defaultProps} />);

      const copyButton = screen.getByLabelText('Copy process ID to clipboard');
      expect(copyButton).toBeInTheDocument();
    });

    it('close button has accessible label', () => {
      render(<Terminal {...defaultProps} onClose={() => {}} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      expect(closeButton).toBeInTheDocument();
    });

    it('close button has focus ring styling', () => {
      render(<Terminal {...defaultProps} onClose={() => {}} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      expect(closeButton).toHaveClass('focus-visible:ring-2');
    });
  });
});
