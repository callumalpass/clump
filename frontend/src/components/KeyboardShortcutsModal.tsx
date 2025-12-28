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
      { keys: ['/'], description: 'Focus search in current tab' },
      { keys: ['['], description: 'Previous page in list' },
      { keys: [']'], description: 'Next page in list' },
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
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-gray-700 border border-gray-600 rounded text-xs font-mono text-gray-300 shadow-sm">
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
      <div className="relative bg-[#161b22] border border-gray-700 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden modal-content-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
          <div className="space-y-6">
            {shortcutGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm text-gray-300">{shortcut.description}</span>
                      <div className="flex items-center gap-1 ml-4">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center gap-1">
                            {keyIndex > 0 && <span className="text-gray-500 text-xs">+</span>}
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
          <div className="mt-6 pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 text-center">
              Press <KeyboardKey>Esc</KeyboardKey> or <KeyboardKey>?</KeyboardKey> to close
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
