import { useState, useRef, useEffect } from 'react';
import type { PR, CommandMetadata } from '../types';

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
          className={`px-3 ${sizeClasses} bg-gray-600 text-gray-400 rounded-md font-medium cursor-not-allowed`}
        >
          Loading...
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
        className={`px-3 ${sizeClasses} bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-l-md font-medium border-r border-purple-500 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 focus-visible:z-10`}
      >
        {selectedCommand?.shortName || 'Start'}
      </button>

      {/* Dropdown trigger */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowDropdown(!showDropdown);
        }}
        className={`px-2 ${sizeClasses} bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-r-md transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900`}
        aria-label="Select PR session type"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      <div
        className={`absolute right-0 top-full mt-1 w-64 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-20 transition-all duration-150 origin-top-right ${
          showDropdown
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        {commands.map((command) => (
            <button
              key={command.id}
              onClick={(e) => {
                e.stopPropagation();
                handleCommandSelect(command);
              }}
              className={`w-full px-3 py-2 text-left hover:bg-gray-700 first:rounded-t-md last:rounded-b-md focus:outline-none focus:bg-gray-700 ${
                selectedCommand?.id === command.id ? 'bg-gray-700' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{command.name}</span>
                {selectedCommand?.id === command.id && (
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{command.description}</p>
            </button>
        ))}
      </div>
    </div>
  );
}
