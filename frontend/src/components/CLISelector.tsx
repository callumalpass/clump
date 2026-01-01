import { useState, useRef, useEffect, useCallback } from 'react';
import type { CLIType, CLIInfo } from '../types';
import { focusRing } from '../utils/styles';

interface CLISelectorProps {
  selectedCLI: CLIType;
  onSelectCLI: (cli: CLIType) => void;
  availableCLIs: CLIInfo[];
  loading?: boolean;
}

// CLI display info
const CLI_DISPLAY: Record<CLIType, { name: string; color: string; bgColor: string }> = {
  claude: { name: 'Claude', color: 'text-orange-300', bgColor: 'bg-orange-600' },
  gemini: { name: 'Gemini', color: 'text-blue-300', bgColor: 'bg-blue-600' },
  codex: { name: 'Codex', color: 'text-green-300', bgColor: 'bg-green-600' },
};

export function CLISelector({
  selectedCLI,
  onSelectCLI,
  availableCLIs,
  loading = false,
}: CLISelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelectCLI = useCallback((cli: CLIType) => {
    onSelectCLI(cli);
    setIsOpen(false);
    buttonRef.current?.focus();
  }, [onSelectCLI]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const installedCLIs = availableCLIs.filter(c => c.installed);
    const currentIndex = installedCLIs.findIndex(c => c.type === selectedCLI);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex < installedCLIs.length - 1) {
          handleSelectCLI(installedCLIs[currentIndex + 1]!.type);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex > 0) {
          handleSelectCLI(installedCLIs[currentIndex - 1]!.type);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
    }
  }, [isOpen, availableCLIs, selectedCLI, handleSelectCLI]);

  if (loading) {
    return (
      <div className="h-8 w-24 bg-gray-700 animate-pulse rounded" />
    );
  }

  const selectedDisplay = CLI_DISPLAY[selectedCLI];
  const installedCLIs = availableCLIs.filter(c => c.installed);

  // If only one CLI is available, don't show dropdown
  if (installedCLIs.length <= 1) {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${selectedDisplay.bgColor}`}>
        <span className={`text-sm font-medium ${selectedDisplay.color}`}>
          {selectedDisplay.name}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded ${selectedDisplay.bgColor} hover:opacity-90 transition-opacity ${focusRing}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={`text-sm font-medium ${selectedDisplay.color}`}>
          {selectedDisplay.name}
        </span>
        <svg
          className={`w-3.5 h-3.5 ${selectedDisplay.color} transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute left-0 mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 z-50"
          role="listbox"
        >
          {availableCLIs.map((cli) => {
            const display = CLI_DISPLAY[cli.type];
            const isSelected = cli.type === selectedCLI;
            const isDisabled = !cli.installed;

            return (
              <button
                key={cli.type}
                onClick={() => !isDisabled && handleSelectCLI(cli.type)}
                disabled={isDisabled}
                role="option"
                aria-selected={isSelected}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-left
                  ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-750'}
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  transition-colors
                `}
              >
                <span className={`w-2 h-2 rounded-full ${display.bgColor}`} />
                <span className="text-sm text-gray-200">{display.name}</span>
                {isDisabled && (
                  <span className="ml-auto text-xs text-gray-500">Not installed</span>
                )}
                {isSelected && !isDisabled && (
                  <svg className="ml-auto w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// CLI badge component for session list
export function CLIBadge({ cliType, small = false }: { cliType: CLIType; small?: boolean }) {
  const display = CLI_DISPLAY[cliType];

  return (
    <span className={`
      inline-flex items-center rounded
      ${small ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-xs'}
      ${display.bgColor} ${display.color} font-medium
    `}>
      {display.name}
    </span>
  );
}

// Export CLI display info for use elsewhere
export { CLI_DISPLAY };
