import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { CommandMetadata } from '../types';
import { focusRingInset } from '../utils/styles';
import { useClickOutside } from '../hooks/useClickOutside';

// Minimal issue info needed for starting a session
export interface SessionableIssue {
  number: number;
  title: string;
  body: string;
}

interface StartSessionButtonProps {
  issue: SessionableIssue;
  commands: CommandMetadata[];
  onStart: (issue: SessionableIssue, command: CommandMetadata) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function StartSessionButton({ issue, commands, onStart, size = 'md', className = '' }: StartSessionButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<CommandMetadata | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Set default selected command when commands load
  useEffect(() => {
    if (commands.length > 0 && !selectedCommand) {
      setSelectedCommand(commands[0] ?? null);
    }
  }, [commands, selectedCommand]);

  // Close dropdown when clicking outside
  const clickOutsideRefs = useMemo(() => [dropdownRef, triggerRef], []);
  const handleClickOutside = useCallback(() => {
    setShowDropdown(false);
    setFocusedIndex(-1);
  }, []);
  useClickOutside(clickOutsideRefs, handleClickOutside);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (showDropdown && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.right - 256, // 256px = w-64
      });
    }
  }, [showDropdown]);

  // Reset focused index when dropdown closes
  useEffect(() => {
    if (!showDropdown) {
      setFocusedIndex(-1);
    } else {
      // Focus the currently selected command when dropdown opens
      const selectedIndex = commands.findIndex(cmd => cmd.id === selectedCommand?.id);
      setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [showDropdown, commands, selectedCommand?.id]);

  // Focus the item when focusedIndex changes
  useEffect(() => {
    if (showDropdown && focusedIndex >= 0) {
      const element = itemRefs.current.get(focusedIndex);
      element?.focus();
    }
  }, [focusedIndex, showDropdown]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % commands.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + commands.length) % commands.length);
        break;
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(commands.length - 1);
        break;
    }
  }, [showDropdown, commands.length]);

  const handleMainClick = () => {
    if (selectedCommand) {
      onStart(issue, selectedCommand);
    }
  };

  const handleCommandSelect = (command: CommandMetadata) => {
    setSelectedCommand(command);
    setShowDropdown(false);
    onStart(issue, command);
  };

  const sizeClasses = size === 'sm'
    ? 'text-xs py-1'
    : 'text-sm py-2';

  if (commands.length === 0) {
    return (
      <div className={`inline-flex ${className}`}>
        <button
          disabled
          className={`inline-flex items-center gap-1.5 px-3 ${sizeClasses} bg-gray-750 text-gray-400 rounded-stoody font-medium cursor-not-allowed`}
          aria-busy="true"
          aria-label="Loading session commands"
        >
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      {/* Main button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleMainClick();
        }}
        className={`px-3 ${sizeClasses} bg-blurple-500 hover:bg-blurple-600 hover:text-pink-400 active:scale-95 text-white rounded-l-stoody font-medium border-r border-blurple-400/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-400 focus-visible:z-10 shadow-stoody-sm`}
      >
        {selectedCommand?.shortName || 'Start'}
      </button>

      {/* Dropdown trigger */}
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setShowDropdown(!showDropdown);
        }}
        className={`px-2 ${sizeClasses} bg-blurple-500 hover:bg-blurple-600 hover:text-pink-400 active:scale-95 text-white rounded-r-stoody transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-400 shadow-stoody-sm`}
        aria-label="Select session type"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
      >
        <svg className={`w-3 h-3 transition-transform duration-150 ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu - rendered via portal to escape overflow containers */}
      {showDropdown && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-64 bg-gray-800 rounded-stoody shadow-stoody-lg z-50 dropdown-menu-enter overflow-hidden"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
          role="listbox"
          aria-label="Select session command"
          aria-activedescendant={focusedIndex >= 0 ? `command-option-${commands[focusedIndex]?.id}` : undefined}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {commands.map((command, index) => (
              <button
                key={command.id}
                id={`command-option-${command.id}`}
                ref={(el) => {
                  if (el) itemRefs.current.set(index, el);
                }}
                role="option"
                aria-selected={selectedCommand?.id === command.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCommandSelect(command);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCommandSelect(command);
                  }
                }}
                className={`dropdown-item-enter w-full px-4 py-3 text-left hover:bg-gray-750 focus:bg-gray-750 transition-colors ${focusRingInset} ${
                  selectedCommand?.id === command.id ? 'bg-gray-750' : ''
                }`}
                style={{ '--item-index': index } as React.CSSProperties}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{command.name}</span>
                  {selectedCommand?.id === command.id && (
                    <svg className="w-4 h-4 text-blurple-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">{command.description}</p>
              </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
