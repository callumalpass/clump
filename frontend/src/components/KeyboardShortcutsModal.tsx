interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Cmd/Ctrl', 'K'], description: 'Open command palette (includes recent sessions)' },
      { keys: ['/'], description: 'Focus search in current tab' },
      { keys: ['1'], description: 'Go to Issues tab' },
      { keys: ['2'], description: 'Go to PRs tab' },
      { keys: ['3'], description: 'Go to History tab' },
      { keys: ['4'], description: 'Go to Schedules tab' },
      { keys: ['['], description: 'Previous page in list' },
      { keys: [']'], description: 'Next page in list' },
      { keys: ['r'], description: 'Refresh current view' },
      { keys: ['Esc'], description: 'Close modal, deselect, or close terminal' },
      { keys: ['?'], description: 'Show this help dialog' },
    ],
  },
  {
    title: 'Session Tabs',
    shortcuts: [
      { keys: ['Alt', '1-9'], description: 'Switch to session tab 1-9' },
      { keys: ['Alt', '['], description: 'Previous session tab' },
      { keys: ['Alt', ']'], description: 'Next session tab' },
      { keys: ['Alt', 'N'], description: 'Open new session (requires repo)' },
      { keys: ['w'], description: 'Close current session tab' },
    ],
  },
  {
    title: 'Session Actions',
    shortcuts: [
      { keys: ['s'], description: 'Toggle star on current session' },
      { keys: ['t'], description: 'Toggle transcript/terminal view' },
      { keys: ['e'], description: 'Export session transcript to markdown' },
    ],
  },
  {
    title: 'Terminal',
    shortcuts: [
      { keys: ['Ctrl', 'C'], description: 'Interrupt current command' },
      { keys: ['Ctrl', 'D'], description: 'End input / Exit' },
      { keys: ['Ctrl', 'L'], description: 'Clear terminal screen' },
      { keys: ['Alt', 'Enter'], description: 'Send multiline input (Mac: Option+Enter)' },
    ],
  },
  {
    title: 'Quick Tips',
    shortcuts: [
      { keys: ['Click'], description: 'Select an issue to view details' },
      { keys: ['Analyze'], description: 'Start Claude Code session for an issue' },
      { keys: ['Continue'], description: 'Resume a previous Claude session' },
    ],
  },
];

function KeyboardKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="kbd-hint text-xs min-w-[1.5rem] h-6 px-1.5">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-enter">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-750 rounded-stoody-lg shadow-stoody-lg max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden modal-content-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-750 bg-gray-800/50">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-800 rounded-stoody-sm text-gray-400 hover:text-pink-400 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(80vh-72px)]">
          <div className="space-y-6">
            {shortcutGroups.map((group, groupIndex) => (
              <div key={group.title} className="list-item-enter" style={{ '--item-index': groupIndex } as React.CSSProperties}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {group.title}
                </h3>
                <div className="space-y-1">
                  {group.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded-stoody-sm hover:bg-gray-800/50 transition-colors group"
                    >
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{shortcut.description}</span>
                      <div className="flex items-center gap-1.5 ml-4">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center gap-1">
                            {keyIndex > 0 && <span className="text-gray-600 text-xs">+</span>}
                            <KeyboardKey>{key}</KeyboardKey>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="mt-6 pt-4 border-t border-gray-750">
            <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-2">
              Press <KeyboardKey>Esc</KeyboardKey> or <KeyboardKey>?</KeyboardKey> to close
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
