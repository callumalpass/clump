import { useState, useRef, useEffect } from 'react';
import type { PR, CommandMetadata } from '../types';
import { focusRingInset } from '../utils/styles';

interface PRStartSessionButtonProps {
  pr: PR;
  commands: CommandMetadata[];
  onStart: (pr: PR, command: CommandMetadata) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function PRStartSessionButton({ pr, commands, onStart, size = 'md', className = '' }: PRStartSessionButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<CommandMetadata | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Set default selected command when commands load
  useEffect(() => {
    if (commands.length > 0 && !selectedCommand) {
      setSelectedCommand(commands[0] ?? null);
    }
  }, [commands, selectedCommand]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMainClick = () => {
    if (selectedCommand) {
      onStart(pr, selectedCommand);
    }
  };

  const handleCommandSelect = (command: CommandMetadata) => {
    setSelectedCommand(command);
    setShowDropdown(false);
    onStart(pr, command);
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
    <div className={`relative inline-flex ${className}`} ref={dropdownRef}>
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
        onClick={(e) => {
          e.stopPropagation();
          setShowDropdown(!showDropdown);
        }}
        className={`px-2 ${sizeClasses} bg-blurple-500 hover:bg-blurple-600 hover:text-pink-400 active:scale-95 text-white rounded-r-stoody transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-400 shadow-stoody-sm`}
        aria-label="Select PR session type"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
      >
        <svg className={`w-3 h-3 transition-transform duration-150 ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {showDropdown && (
      <div
        className="absolute right-0 top-full mt-2 w-64 bg-gray-800 rounded-stoody shadow-stoody-lg z-20 dropdown-menu-enter overflow-hidden"
        role="listbox"
        aria-label="Select PR session command"
      >
        {commands.map((command) => (
            <button
              key={command.id}
              onClick={(e) => {
                e.stopPropagation();
                handleCommandSelect(command);
              }}
              className={`w-full px-4 py-3 text-left hover:bg-gray-750 focus:bg-gray-750 transition-colors ${focusRingInset} ${
                selectedCommand?.id === command.id ? 'bg-gray-750' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{command.name}</span>
                {selectedCommand?.id === command.id && (
                  <svg className="w-4 h-4 text-blurple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{command.description}</p>
            </button>
        ))}
      </div>
      )}
    </div>
  );
}
