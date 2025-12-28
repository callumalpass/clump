import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { useWebSocket } from '../hooks/useWebSocket';
import '@xterm/xterm/css/xterm.css';

interface RelatedEntity {
  type: 'issue' | 'pr';
  number: number;
}

interface TerminalProps {
  processId: string;
  onClose?: () => void;
  relatedEntity?: RelatedEntity | null;
  onShowRelated?: () => void;
  /** Whether to show the header bar (default: true). Set to false when embedded in SessionView. */
  showHeader?: boolean;
  /** Callback when connection status changes (for parent components to display status) */
  onConnectionChange?: (isConnected: boolean) => void;
}

export function Terminal({ processId, onClose, relatedEntity, onShowRelated, showHeader = true, onConnectionChange }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sendInputRef = useRef<(data: string) => void>(() => {});
  const sendResizeRef = useRef<(rows: number, cols: number) => void>(() => {});
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const handleCopyProcessId = async () => {
    try {
      await navigator.clipboard.writeText(processId);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      console.error('Failed to copy process ID');
    }
  };

  const { isConnected, sendInput, sendResize } = useWebSocket(processId, {
    onMessage: (data) => {
      if (terminalRef.current) {
        // Write raw bytes directly to preserve ANSI escape sequences
        terminalRef.current.write(new Uint8Array(data));
      }
    },
  });

  // Keep refs updated with latest functions
  sendInputRef.current = sendInput;
  sendResizeRef.current = sendResize;

  // Notify parent of connection status changes
  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new XTerm({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: '#388bfd66',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      // Recommended settings for Claude Code compatibility
      scrollback: 10000,
      allowProposedApi: true, // Required for Unicode11 addon
      macOptionIsMeta: true, // Makes Option key work as Meta for Alt+Enter
      macOptionClickForcesSelection: true,
      // Ensure proper cursor/line handling for animations
      convertEol: false, // Don't convert \n to \r\n
      cursorStyle: 'block',
    });

    // Load addons
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Unicode11 for proper emoji/CJK character support
    const unicode11Addon = new Unicode11Addon();
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    terminal.open(containerRef.current);

    // WebGL addon for better performance (with fallback)
    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose();
        webglAddon = null;
      });
      terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon failed to load, using canvas renderer:', e);
      webglAddon = null;
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Track if we're disposing to prevent resize during cleanup
    let isDisposing = false;

    // Handle resize - use ResizeObserver for more reliable detection
    const handleResize = () => {
      if (isDisposing) return;
      if (fitAddon && terminal && containerRef.current) {
        try {
          fitAddon.fit();
          sendResizeRef.current(terminal.rows, terminal.cols);
        } catch {
          // Ignore errors during resize (can happen during mount/unmount)
        }
      }
    };

    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    // Also listen for window resize
    window.addEventListener('resize', handleResize);

    // Initial fit - do it immediately and again after a short delay
    fitAddon.fit();
    sendResizeRef.current(terminal.rows, terminal.cols);

    const resizeTimeout = setTimeout(() => {
      handleResize();
    }, 50);

    // Handle input - use refs to avoid stale closures
    terminal.onData((data) => {
      sendInputRef.current(data);
    });

    // Focus terminal
    terminal.focus();

    return () => {
      isDisposing = true;
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      terminalRef.current = null;
      fitAddonRef.current = null;
      try {
        webglAddon?.dispose();
      } catch {
        // Ignore disposal errors
      }
      try {
        terminal.dispose();
      } catch {
        // Ignore disposal errors
      }
    };
  }, [processId]); // Only re-run when processId changes

  return (
    <div className={`flex flex-col h-full bg-[#0d1117] overflow-hidden ${showHeader ? 'rounded-lg border border-gray-700' : ''}`}>
      {showHeader && (
        <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
              isConnected
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isConnected
                  ? 'bg-green-400'
                  : 'bg-red-400 animate-pulse'
              }`} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            <span className="text-sm text-gray-500">|</span>
            <button
              onClick={handleCopyProcessId}
              className={`copy-button flex items-center gap-1.5 text-sm focus:outline-none ${
                copyStatus === 'copied'
                  ? 'copy-button-success'
                  : 'text-gray-400 hover:text-white'
              }`}
              title={copyStatus === 'copied' ? 'Copied!' : 'Copy process ID'}
              aria-label={copyStatus === 'copied' ? 'Copied to clipboard' : 'Copy process ID to clipboard'}
            >
              <span>{processId.slice(0, 8)}</span>
              {copyStatus === 'copied' ? (
                <svg className="w-3.5 h-3.5 copy-success-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            {relatedEntity && onShowRelated && (
              <>
                <span className="text-sm text-gray-500">|</span>
                <button
                  onClick={onShowRelated}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {relatedEntity.type === 'issue' ? 'Issue' : 'PR'} #{relatedEntity.number}
                </button>
              </>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
            >
              Close
            </button>
          )}
        </div>
      )}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
