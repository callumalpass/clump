import { useState, useEffect, useRef, ReactNode } from 'react';

// Consistent focus ring styling for accessibility
const focusRing = 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-900';

// Shared filter bar styling constants
export const filterBarStyles = {
  container: 'flex flex-col gap-2 p-2 border-b border-gray-700 bg-gray-800/30',
  row: 'flex items-center gap-2',
  // Toggle button group (connected buttons)
  toggleGroup: 'flex rounded-md overflow-hidden border border-gray-600',
  toggleButton: (isActive: boolean) =>
    `toggle-btn px-2.5 py-1 text-xs ${focusRing} focus:z-10 ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
    }`,
  // Standalone pill buttons (for category filters)
  pillButton: (isActive: boolean) =>
    `toggle-btn px-2.5 py-1 text-xs rounded-md ${focusRing} ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-400 hover:text-white hover:bg-gray-700'
    }`,
  // Select dropdown
  select: `bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs ${focusRing} focus:border-blue-500`,
  // Icon button
  iconButton: `p-1 bg-gray-800 border border-gray-600 rounded-md hover:bg-gray-700 hover:border-gray-500 transition-colors ${focusRing}`,
  // Counts and metadata
  count: 'text-xs text-gray-500',
  // Clear filters
  clearButton: `text-xs text-gray-400 hover:text-white ${focusRing}`,
};

// Search input component
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', debounceMs = 300 }: SearchInputProps) {
  const [inputValue, setInputValue] = useState(value);

  // Debounce the onChange
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (inputValue !== value) {
        onChange(inputValue);
      }
    }, debounceMs);
    return () => clearTimeout(timeout);
  }, [inputValue, debounceMs]);

  // Sync with external changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className={`w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-1 text-xs pl-7 ${focusRing} focus:border-blue-500`}
      />
      <svg
        className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      {inputValue && (
        <button
          onClick={() => {
            setInputValue('');
            onChange('');
          }}
          className={`absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white rounded-sm ${focusRing}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

// State toggle component (Open/Closed/All)
interface StateToggleProps {
  value: 'open' | 'closed' | 'all';
  onChange: (value: 'open' | 'closed' | 'all') => void;
}

export function StateToggle({ value, onChange }: StateToggleProps) {
  const states: ('open' | 'closed' | 'all')[] = ['open', 'closed', 'all'];
  return (
    <div className={filterBarStyles.toggleGroup}>
      {states.map((state) => (
        <button
          key={state}
          onClick={() => onChange(state)}
          className={filterBarStyles.toggleButton(value === state)}
        >
          {state.charAt(0).toUpperCase() + state.slice(1)}
        </button>
      ))}
    </div>
  );
}

// Sort dropdown with order toggle
interface SortOption {
  value: string;
  label: string;
}

interface SortControlProps {
  sortValue: string;
  orderValue: 'asc' | 'desc';
  options: SortOption[];
  onSortChange: (value: string) => void;
  onOrderChange: (value: 'asc' | 'desc') => void;
}

export function SortControl({ sortValue, orderValue, options, onSortChange, onOrderChange }: SortControlProps) {
  return (
    <div className="flex items-center gap-1">
      <select
        value={sortValue}
        onChange={(e) => onSortChange(e.target.value)}
        className={filterBarStyles.select}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => onOrderChange(orderValue === 'asc' ? 'desc' : 'asc')}
        className={filterBarStyles.iconButton}
        title={orderValue === 'asc' ? 'Oldest first' : 'Newest first'}
      >
        {orderValue === 'asc' ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
    </div>
  );
}

// Label/tag multi-select
interface LabelSelectProps {
  selectedLabels: string[];
  availableLabels: string[];
  onChange: (labels: string[]) => void;
}

export function LabelSelect({ selectedLabels, availableLabels, onChange }: LabelSelectProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleLabel = (label: string) => {
    if (selectedLabels.includes(label)) {
      onChange(selectedLabels.filter(l => l !== label));
    } else {
      onChange([...selectedLabels, label]);
    }
  };

  if (availableLabels.length === 0) return null;

  const unselectedLabels = availableLabels.filter(l => !selectedLabels.includes(l));

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-gray-400">Labels:</span>
        {selectedLabels.map((label) => (
          <button
            key={label}
            onClick={() => toggleLabel(label)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white ${focusRing}`}
          >
            {label}
            <span className="hover:text-blue-200">×</span>
          </button>
        ))}
        {unselectedLabels.length > 0 && (
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className={`px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 ${focusRing}`}
          >
            + Add
          </button>
        )}
      </div>

      {showDropdown && unselectedLabels.length > 0 && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-10 bg-black/20 transition-opacity"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-20 max-h-48 overflow-auto">
            {unselectedLabels.map((label) => (
              <button
                key={label}
                onClick={() => {
                  toggleLabel(label);
                  setShowDropdown(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 truncate ${focusRing} focus:bg-gray-700`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Filter bar container
interface FilterBarProps {
  children: ReactNode;
}

export function FilterBar({ children }: FilterBarProps) {
  return <div className={filterBarStyles.container}>{children}</div>;
}

// Filter bar row
interface FilterBarRowProps {
  children: ReactNode;
  className?: string;
}

export function FilterBarRow({ children, className = '' }: FilterBarRowProps) {
  return <div className={`${filterBarStyles.row} ${className}`}>{children}</div>;
}

// Item count display
interface ItemCountProps {
  count: number;
  singular: string;
  plural?: string;
}

export function ItemCount({ count, singular, plural }: ItemCountProps) {
  const label = count === 1 ? singular : (plural || `${singular}s`);
  return <span className={filterBarStyles.count}>{count} {label}</span>;
}

// Refresh button
interface RefreshButtonProps {
  onClick: () => void;
  loading?: boolean;
}

export function RefreshButton({ onClick, loading }: RefreshButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
      title="Refresh"
    >
      <svg
        className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );
}

// Clear filters button
interface ClearFiltersButtonProps {
  onClick: () => void;
  show: boolean;
}

export function ClearFiltersButton({ onClick, show }: ClearFiltersButtonProps) {
  if (!show) return null;
  return (
    <button onClick={onClick} className={filterBarStyles.clearButton}>
      Clear filters
    </button>
  );
}
