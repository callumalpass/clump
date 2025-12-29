import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  category: 'navigation' | 'actions' | 'sessions' | 'recent';
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

// Simple fuzzy match - checks if all query characters appear in order
function fuzzyMatch(query: string, target: string): { matched: boolean; score: number } {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  if (!query) return { matched: true, score: 0 };

  // Exact match gets highest score
  if (targetLower === queryLower) return { matched: true, score: 1000 };

  // Starts with query gets high score
  if (targetLower.startsWith(queryLower)) return { matched: true, score: 500 + (query.length / target.length) * 100 };

  // Contains query gets medium score
  if (targetLower.includes(queryLower)) return { matched: true, score: 200 + (query.length / target.length) * 50 };

  // Fuzzy match - characters appear in order
  let queryIndex = 0;
  let consecutiveMatches = 0;
  let maxConsecutive = 0;
  let totalScore = 0;

  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      queryIndex++;
      consecutiveMatches++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
      totalScore += consecutiveMatches; // Reward consecutive matches
    } else {
      consecutiveMatches = 0;
    }
  }

  if (queryIndex === queryLower.length) {
    return { matched: true, score: totalScore + maxConsecutive * 10 };
  }

  return { matched: false, score: 0 };
}

// Highlight matching characters in text
function highlightMatches(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Try exact substring match first
  const exactIndex = textLower.indexOf(queryLower);
  if (exactIndex !== -1) {
    return (
      <>
        {text.slice(0, exactIndex)}
        <span className="text-blurple-400 font-medium">{text.slice(exactIndex, exactIndex + query.length)}</span>
        {text.slice(exactIndex + query.length)}
      </>
    );
  }

  // Fall back to character-by-character highlighting for fuzzy matches
  const result: React.ReactNode[] = [];
  let queryIndex = 0;

  for (let i = 0; i < text.length; i++) {
    if (queryIndex < queryLower.length && textLower[i] === queryLower[queryIndex]) {
      result.push(<span key={i} className="text-blurple-400 font-medium">{text[i]}</span>);
      queryIndex++;
    } else {
      result.push(text[i]);
    }
  }

  return <>{result}</>;
}

function KeyboardKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 bg-gray-700 border border-gray-600 rounded text-[10px] font-mono text-gray-400">
      {children}
    </kbd>
  );
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter and sort commands based on query
  const filteredCommands = useMemo(() => {
    const results = commands
      .map(cmd => {
        // Search in both label and description
        const labelMatch = fuzzyMatch(query, cmd.label);
        const descMatch = cmd.description ? fuzzyMatch(query, cmd.description) : { matched: false, score: 0 };
        const bestScore = Math.max(labelMatch.score, descMatch.score * 0.8); // Weight description lower

        return {
          command: cmd,
          matched: labelMatch.matched || descMatch.matched,
          score: bestScore,
        };
      })
      .filter(r => r.matched)
      .sort((a, b) => {
        // Sort by category first (navigation, actions, sessions, recent)
        const categoryOrder = { navigation: 0, actions: 1, sessions: 2, recent: 3 };
        const catDiff = categoryOrder[a.command.category] - categoryOrder[b.command.category];
        if (catDiff !== 0) return catDiff;
        // Then by score
        return b.score - a.score;
      });

    return results.map(r => r.command);
  }, [commands, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Small delay to ensure modal is rendered
      const timeoutId = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredCommands, selectedIndex, onClose]);

  const handleItemClick = useCallback((command: Command) => {
    command.action();
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category]!.push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    actions: 'Actions',
    sessions: 'Sessions',
    recent: 'Recent',
  };

  // Build flat list with category headers for rendering
  let itemIndex = 0;
  const renderItems: { type: 'header' | 'command'; category?: string; command?: Command; index?: number }[] = [];

  for (const category of ['navigation', 'actions', 'sessions', 'recent']) {
    const cmds = groupedCommands[category];
    if (cmds && cmds.length > 0) {
      renderItems.push({ type: 'header', category });
      for (const cmd of cmds) {
        renderItems.push({ type: 'command', command: cmd, index: itemIndex });
        itemIndex++;
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative bg-[#161b22] border border-gray-750 rounded-lg shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-750">
          <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <div className="flex items-center gap-1">
            <KeyboardKey>Esc</KeyboardKey>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
              <p className="text-sm">No commands found</p>
              <p className="text-xs mt-1">Try a different search</p>
            </div>
          ) : (
            renderItems.map((item) => {
              if (item.type === 'header') {
                return (
                  <div
                    key={`header-${item.category}`}
                    className="px-4 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide"
                  >
                    {categoryLabels[item.category!]}
                  </div>
                );
              }

              const cmd = item.command!;
              const isSelected = item.index === selectedIndex;

              return (
                <button
                  key={cmd.id}
                  data-index={item.index}
                  onClick={() => handleItemClick(cmd)}
                  onMouseEnter={() => setSelectedIndex(item.index!)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-all duration-150 border-l-2 ${
                    isSelected
                      ? 'bg-blurple-500/20 text-white border-blue-500 pl-[14px]'
                      : 'text-gray-300 hover:bg-gray-800 border-transparent'
                  }`}
                >
                  {/* Icon */}
                  {cmd.icon && (
                    <span className={`shrink-0 ${isSelected ? 'text-blurple-400' : 'text-gray-500'}`}>
                      {cmd.icon}
                    </span>
                  )}

                  {/* Label + Description */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {highlightMatches(cmd.label, query)}
                    </div>
                    {cmd.description && (
                      <div className="text-xs text-gray-500 truncate">
                        {highlightMatches(cmd.description, query)}
                      </div>
                    )}
                  </div>

                  {/* Shortcut */}
                  {cmd.shortcut && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {cmd.shortcut.map((key, keyIdx) => (
                        <span key={keyIdx} className="flex items-center">
                          {keyIdx > 0 && <span className="text-gray-600 text-[10px] mx-0.5">+</span>}
                          <KeyboardKey>{key}</KeyboardKey>
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-750 text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <KeyboardKey>↑</KeyboardKey>
              <KeyboardKey>↓</KeyboardKey>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <KeyboardKey>↵</KeyboardKey>
              <span>to select</span>
            </span>
          </div>
          <span className="flex items-center gap-1">
            <KeyboardKey>Esc</KeyboardKey>
            <span>to close</span>
          </span>
        </div>
      </div>
    </div>
  );
}
