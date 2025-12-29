import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { vim, Vim, getCM } from '@replit/codemirror-vim';

// Local storage key for vim mode preference
const VIM_MODE_KEY = 'editor-vim-mode';

// Dark theme matching the app UI
const darkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#0d1117',
    color: '#e6edf3',
    fontSize: '14px',
  },
  '.cm-scroller': {
    backgroundColor: '#0d1117',
  },
  '.cm-content': {
    backgroundColor: '#0d1117',
    caretColor: '#58a6ff',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  '.cm-cursor': {
    borderLeftColor: '#58a6ff',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#58a6ff',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: '#264f78',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#264f78',
  },
  '.cm-gutters': {
    backgroundColor: '#0d1117',
    color: '#6e7681',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#0d1117',
  },
  '.cm-activeLine': {
    backgroundColor: '#0d1117',
  },
  '.cm-line': {
    padding: '0 4px',
  },
  // Vim cursor styles
  '.cm-fat-cursor': {
    backgroundColor: '#58a6ff !important',
    color: '#0d1117 !important',
  },
  '&:not(.cm-focused) .cm-fat-cursor': {
    backgroundColor: '#58a6ff80 !important',
    outline: '1px solid #58a6ff',
  },
  // Placeholder styling
  '.cm-placeholder': {
    color: '#6e7681',
    fontStyle: 'italic',
  },
}, { dark: true });

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
  onSubmit?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  vimMode?: boolean;
  onVimModeChange?: (enabled: boolean) => void;
}

export function Editor({
  value,
  onChange,
  placeholder = '',
  minHeight = '100px',
  maxHeight = '400px',
  onSubmit,
  disabled = false,
  autoFocus = false,
  vimMode: controlledVimMode,
  onVimModeChange,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);

  // Use controlled vim mode if provided, otherwise use localStorage
  const [internalVimMode, setInternalVimMode] = useState(() => {
    if (controlledVimMode !== undefined) return controlledVimMode;
    try {
      return localStorage.getItem(VIM_MODE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const vimEnabled = controlledVimMode !== undefined ? controlledVimMode : internalVimMode;

  // Vim mode indicator state
  const [vimModeIndicator, setVimModeIndicator] = useState('NORMAL');

  // Keep refs up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  // Toggle vim mode
  const toggleVimMode = useCallback(() => {
    const newValue = !vimEnabled;
    if (controlledVimMode === undefined) {
      setInternalVimMode(newValue);
      try {
        localStorage.setItem(VIM_MODE_KEY, String(newValue));
      } catch {
        // Ignore localStorage errors
      }
    }
    onVimModeChange?.(newValue);
  }, [vimEnabled, controlledVimMode, onVimModeChange]);

  // Create/recreate editor when vim mode changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up existing editor
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const extensions = [
      // High priority submit keybindings (must come before vim)
      Prec.highest(keymap.of([
        // Ctrl+Enter to submit
        {
          key: 'Ctrl-Enter',
          run: () => {
            onSubmitRef.current?.();
            return true;
          },
        },
        // Cmd+Enter for Mac
        {
          key: 'Mod-Enter',
          run: () => {
            onSubmitRef.current?.();
            return true;
          },
        },
      ])),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      markdown(),
      Prec.highest(darkTheme),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorState.readOnly.of(disabled),
    ];

    // Add placeholder if provided
    if (placeholder) {
      extensions.push(cmPlaceholder(placeholder));
    }

    // Add vim mode if enabled
    if (vimEnabled) {
      extensions.unshift(vim());
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Set up vim mode indicator updates
    if (vimEnabled) {
      const updateVimMode = () => {
        const cm = getCM(view);
        if (cm) {
          const vimState = (cm.state as { vim?: { mode?: string; visualMode?: boolean } }).vim;
          if (vimState) {
            if (vimState.visualMode) {
              setVimModeIndicator('VISUAL');
            } else {
              setVimModeIndicator(vimState.mode?.toUpperCase() || 'NORMAL');
            }
          }
        }
      };

      // Update on keyup
      view.dom.addEventListener('keyup', updateVimMode);

      // Also update periodically for mode changes
      const interval = setInterval(updateVimMode, 100);

      // Add Ctrl+Enter mapping for vim mode (works in normal mode)
      Vim.defineEx('submit', '', () => {
        onSubmitRef.current?.();
      });

      return () => {
        view.dom.removeEventListener('keyup', updateVimMode);
        clearInterval(interval);
        view.destroy();
      };
    }

    if (autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
    };
  }, [vimEnabled, disabled, placeholder, autoFocus]);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (value !== currentValue) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`bg-[#0d1117] border border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        style={{
          minHeight,
          maxHeight,
          overflowY: 'auto',
        }}
      />

      {/* Status bar */}
      <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {/* Vim mode toggle */}
          <button
            type="button"
            onClick={toggleVimMode}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              vimEnabled
                ? 'bg-green-900/50 text-green-400 hover:bg-green-900/70'
                : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-400'
            }`}
            title={vimEnabled ? 'Vim mode enabled (click to disable)' : 'Click to enable Vim mode'}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>vim</span>
          </button>

          {/* Vim mode indicator */}
          {vimEnabled && (
            <span className={`px-1.5 py-0.5 rounded font-mono text-xs ${
              vimModeIndicator === 'INSERT'
                ? 'bg-blue-900/50 text-blue-400'
                : vimModeIndicator === 'VISUAL'
                ? 'bg-purple-900/50 text-purple-400'
                : 'bg-gray-800 text-gray-400'
            }`}>
              -- {vimModeIndicator} --
            </span>
          )}
        </div>

        {/* Submit hint */}
        {onSubmit && (
          <span className="text-gray-600">
            {vimEnabled ? 'Ctrl+Enter or :submit' : 'Ctrl+Enter'} to submit
          </span>
        )}
      </div>
    </div>
  );
}
