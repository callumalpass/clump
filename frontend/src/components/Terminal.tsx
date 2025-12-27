import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { useWebSocket } from '../hooks/useWebSocket';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  sessionId: string;
  onClose?: () => void;
}

export function Terminal({ sessionId, onClose }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sendInputRef = useRef<(data: string) => void>(() => {});
  const sendResizeRef = useRef<(rows: number, cols: number) => void>(() => {});

  const { isConnected, sendInput, sendResize } = useWebSocket(sessionId, {
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

    // Handle resize - use ResizeObserver for more reliable detection
    const handleResize = () => {
      if (fitAddon && terminal && containerRef.current) {
        fitAddon.fit();
        sendResizeRef.current(terminal.rows, terminal.cols);
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
  }, [sessionId]); // Only re-run when sessionId changes

  return (
    <div className="flex flex-col h-full bg-[#0d1117] rounded-lg overflow-hidden border border-gray-700">
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">Session: {sessionId}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700"
          >
            Close
          </button>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
