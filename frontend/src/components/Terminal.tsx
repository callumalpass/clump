import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { useProcessWebSocket } from '../hooks/useProcessWebSocket';
import { useTheme } from '../hooks/useTheme';
import '@xterm/xterm/css/xterm.css';

/**
 * XTerm theme configurations for Stoody design system.
 * Maps resolved theme ('dark' | 'light') to xterm color palette.
 */
const xtermThemes: Record<'dark' | 'light', ITheme> = {
  dark: {
    background: '#2d3436',           // --stoody-bg-deep
    foreground: '#dfe6e9',           // --stoody-text-primary
    cursor: '#a29bfe',               // --stoody-blurple
    cursorAccent: '#2d3436',         // --stoody-bg-deep
    selectionBackground: '#a29bfe44', // blurple with transparency
    black: '#2f3640',                // --stoody-bg-elevated
    red: '#ff7675',                  // coral-red
    green: '#55efc4',                // --stoody-mint
    yellow: '#fdcb6e',               // warm yellow
    blue: '#74b9ff',                 // --stoody-sky
    magenta: '#a29bfe',              // --stoody-blurple
    cyan: '#81ecec',                 // teal
    white: '#b2bec3',                // --stoody-text-secondary
    brightBlack: '#636e72',          // --stoody-text-muted
    brightRed: '#fab1a0',            // --stoody-coral
    brightGreen: '#00b894',          // --stoody-mint-hover
    brightYellow: '#ffeaa7',         // bright warm yellow
    brightBlue: '#a29bfe',           // --stoody-blurple
    brightMagenta: '#ff69b4',        // --stoody-pink
    brightCyan: '#55efc4',           // --stoody-mint
    brightWhite: '#dfe6e9',          // --stoody-text-primary
  },
  light: {
    background: '#f4f4f0',           // --stoody-bg-elevated (light)
    foreground: '#2d3436',           // --stoody-text-primary (light)
    cursor: '#6c5ce7',               // --stoody-blurple (light)
    cursorAccent: '#f4f4f0',         // --stoody-bg-elevated (light)
    selectionBackground: '#6c5ce744', // blurple with transparency
    black: '#2d3436',                // charcoal
    red: '#d63031',                  // error red
    green: '#00b894',                // --stoody-mint (light)
    yellow: '#fdcb6e',               // warning yellow
    blue: '#0984e3',                 // --stoody-sky (light)
    magenta: '#6c5ce7',              // --stoody-blurple (light)
    cyan: '#00cec9',                 // teal
    white: '#636e72',                // --stoody-text-secondary (light)
    brightBlack: '#b2bec3',          // --stoody-text-muted (light)
    brightRed: '#e17055',            // --stoody-coral (light)
    brightGreen: '#55efc4',          // mint bright
    brightYellow: '#ffeaa7',         // bright warm yellow
    brightBlue: '#74b9ff',           // sky bright
    brightMagenta: '#e84393',        // --stoody-pink (light)
    brightCyan: '#81ecec',           // teal bright
    brightWhite: '#2d3436',          // charcoal
  },
};

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
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const handleCopyProcessId = async () => {
    try {
      await navigator.clipboard.writeText(processId);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      console.error('Failed to copy process ID');
    }
  };

  const { isConnected, sendInput, sendResize } = useProcessWebSocket(processId, {
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

  // Initialize terminal once on mount (or when processId changes)
  // Theme changes are handled separately to avoid destroying terminal history
  useEffect(() => {
    if (!containerRef.current) return;

    // Use dark theme as initial - the theme effect will update it immediately
    const terminal = new XTerm({
      theme: xtermThemes.dark,
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
    // Track if we've ever had a valid (non-zero) size - used to detect
    // transition from hidden (display:none) to visible
    let hadValidSize = false;

    // Handle resize - use ResizeObserver for more reliable detection
    const handleResize = () => {
      if (isDisposing) return;
      if (fitAddon && terminal && containerRef.current) {
        try {
          const rect = containerRef.current.getBoundingClientRect();
          const hasValidSize = rect.width > 0 && rect.height > 0;

          // Only fit if we have valid dimensions
          if (hasValidSize) {
            fitAddon.fit();
            sendResizeRef.current(terminal.rows, terminal.cols);

            // If this is the first time we have valid dimensions (transitioning
            // from hidden to visible), scroll to bottom to ensure the terminal
            // viewport is correctly positioned
            if (!hadValidSize) {
              hadValidSize = true;
              terminal.scrollToBottom();
            }
          }
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

    // Initial fit - use handleResize for consistent dimension checking
    // This handles both visible and hidden initial states correctly
    handleResize();

    // Retry fit after a short delay to handle layout settling
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
  }, [processId]); // Only re-create terminal when processId changes

  // Update terminal theme dynamically without destroying the terminal
  // This preserves terminal history when user switches between dark/light mode
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    // Assign new theme object to trigger xterm.js theme update
    terminal.options.theme = { ...xtermThemes[resolvedTheme] };
  }, [resolvedTheme]);

  // Theme-aware colors
  const containerBg = isLight ? 'bg-[#f4f4f0]' : 'bg-[#2d3436]';
  const containerBorder = isLight ? 'border-[#dfe6e9]' : 'border-[#464f5b]';
  const headerBg = isLight ? 'bg-[#eaeae5]' : 'bg-[#353b48]';
  const headerBorder = isLight ? 'border-[#dfe6e9]' : 'border-[#464f5b]';
  const textMuted = isLight ? 'text-[#636e72]' : 'text-gray-400';
  const textHover = isLight ? 'hover:text-[#2d3436]' : 'hover:text-white';
  const blurple = isLight ? '#6c5ce7' : '#a29bfe';
  const pink = isLight ? '#e84393' : '#ff69b4';
  const hoverBg = isLight ? 'hover:bg-[#dfe6e9]' : 'hover:bg-[#3d4655]';
  const focusOffset = isLight ? 'focus-visible:ring-offset-[#f4f4f0]' : 'focus-visible:ring-offset-[#2d3436]';

  return (
    <div className={`flex flex-col h-full ${containerBg} overflow-hidden ${showHeader ? `rounded-lg border ${containerBorder}` : ''}`}>
      {showHeader && (
        <div className={`flex items-center justify-between px-3 py-2 ${headerBg} border-b ${headerBorder}`}>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
              isConnected
                ? isLight ? 'bg-[#00b894]/20 text-[#00b894]' : 'bg-[#55efc4]/20 text-[#55efc4]'
                : isLight ? 'bg-[#d63031]/20 text-[#d63031]' : 'bg-[#ff7675]/20 text-[#ff7675]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isConnected
                  ? isLight ? 'bg-[#00b894]' : 'bg-[#55efc4]'
                  : isLight ? 'bg-[#d63031] animate-pulse' : 'bg-[#ff7675] animate-pulse'
              }`} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            <span className={`text-sm ${textMuted}`}>|</span>
            <button
              onClick={handleCopyProcessId}
              className={`copy-button flex items-center gap-1.5 text-sm focus:outline-none ${
                copyStatus === 'copied'
                  ? 'copy-button-success'
                  : `${textMuted} ${textHover}`
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
                <span className={`text-sm ${textMuted}`}>|</span>
                <button
                  onClick={onShowRelated}
                  className="text-sm transition-colors"
                  style={{ color: blurple }}
                  onMouseEnter={(e) => e.currentTarget.style.color = pink}
                  onMouseLeave={(e) => e.currentTarget.style.color = blurple}
                >
                  {relatedEntity.type === 'issue' ? 'Issue' : 'PR'} #{relatedEntity.number}
                </button>
              </>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className={`${textMuted} ${textHover} text-sm px-2 py-1 rounded ${hoverBg} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[${blurple}] focus-visible:ring-offset-1 ${focusOffset}`}
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
