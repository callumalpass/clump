import { useState, useEffect, useRef, ReactNode, useMemo } from 'react';
import { focusRing, focusRingInset } from '../utils/styles';
import { pluralize } from '../utils/text';
import { useTabIndicator } from '../hooks/useTabIndicator';

// Shared filter bar styling constants - Compact design
export const filterBarStyles = {
  container: 'flex flex-col gap-2 px-3 py-2 border-b border-gray-750 bg-gray-800/40',
  row: 'flex items-center gap-2',
  // Toggle button group (connected buttons) - compact padding
  toggleGroup: 'relative flex rounded-stoody overflow-hidden border border-gray-750 bg-gray-800 shadow-stoody-sm',
  toggleButton: (isActive: boolean) =>
    `toggle-btn relative z-10 px-3 py-1.5 text-xs transition-all duration-150 active:scale-95 ${focusRing} focus:z-10 ${
      isActive
        ? 'text-white font-medium toggle-btn-active'
        : 'text-gray-400 hover:text-pink-400'
    }`,
  // Standalone pill buttons (for category filters) - compact padding
  pillButton: (isActive: boolean) =>
    `toggle-btn px-3 py-1.5 text-xs rounded-stoody transition-transform active:scale-95 ${focusRing} ${
      isActive
        ? 'bg-blurple-500 text-white shadow-stoody-sm filter-pill-active'
        : 'text-gray-400 hover:text-pink-400 hover:bg-gray-750 filter-pill-inactive'
    }`,
  // Select dropdown - compact
  select: `bg-gray-800 border border-gray-750 rounded-stoody px-2.5 py-1.5 text-xs transition-colors duration-150 shadow-stoody-sm ${focusRing} focus:border-blurple-400 focus:bg-gray-850/50`,
  // Icon button - compact
  iconButton: `icon-btn p-2 bg-gray-800 border border-gray-750 rounded-stoody hover:bg-gray-750 hover:border-gray-700 shadow-stoody-sm ${focusRing}`,
  // Counts and metadata
  count: 'text-xs text-gray-500',
  // Clear filters
  clearButton: `text-xs text-gray-400 hover:text-pink-400 transition-transform active:scale-95 ${focusRing}`,
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
  }, [inputValue, debounceMs, onChange, value]);

  // Sync with external changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  return (
    <div className="relative flex-1 min-w-0 group search-input-container">
      <input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className={`peer w-full bg-gray-800 border border-gray-750 rounded-stoody px-3 py-1.5 text-xs pl-8 transition-all duration-200 shadow-stoody-sm ${focusRing} focus:border-blurple-400 focus:bg-gray-850/50 focus:shadow-[0_0_0_3px_rgba(162,155,254,0.15)] placeholder:text-gray-500`}
        aria-label={placeholder.replace('...', '')}
      />
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none transition-all duration-200 peer-focus:text-blurple-400 peer-focus:scale-110"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      {/* Clear button with smooth enter/exit transition */}
      <button
        onClick={() => {
          setInputValue('');
          onChange('');
        }}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-stoody-sm text-gray-500 hover:text-pink-400 hover:bg-gray-750 transition-all duration-150 ${focusRing} ${
          inputValue ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
        }`}
        aria-label="Clear search"
        title="Clear search"
        tabIndex={inputValue ? 0 : -1}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
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
  const { containerRef, tabRefs, indicatorStyle } = useTabIndicator<HTMLDivElement>(value);

  return (
    <div ref={containerRef} className={filterBarStyles.toggleGroup} role="group" aria-label="Filter by state">
      {/* Sliding background indicator */}
      <div
        className="toggle-indicator absolute top-0 bottom-0 bg-blurple-500 rounded-[3px]"
        style={{
          transform: `translateX(${indicatorStyle.left}px)`,
          width: indicatorStyle.width,
        }}
      />
      {states.map((state) => (
        <button
          key={state}
          ref={(el) => { if (el) tabRefs.current.set(state, el); }}
          onClick={() => onChange(state)}
          className={filterBarStyles.toggleButton(value === state)}
          aria-pressed={value === state}
        >
          {state.charAt(0).toUpperCase() + state.slice(1)}
        </button>
      ))}
    </div>
  );
}

// Session status toggle component (All/Analyzed/Unanalyzed)
type SessionStatusFilter = 'all' | 'analyzed' | 'unanalyzed';

interface SessionStatusToggleProps {
  value: SessionStatusFilter;
  onChange: (value: SessionStatusFilter) => void;
}

export function SessionStatusToggle({ value, onChange }: SessionStatusToggleProps) {
  const statuses: { value: SessionStatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'analyzed', label: 'Analyzed' },
    { value: 'unanalyzed', label: 'New' },
  ];
  const { containerRef, tabRefs, indicatorStyle } = useTabIndicator<HTMLDivElement>(value);

  return (
    <div ref={containerRef} className={filterBarStyles.toggleGroup} role="group" aria-label="Filter by session status">
      {/* Sliding background indicator */}
      <div
        className="toggle-indicator absolute top-0 bottom-0 bg-blurple-500 rounded-[3px]"
        style={{
          transform: `translateX(${indicatorStyle.left}px)`,
          width: indicatorStyle.width,
        }}
      />
      {statuses.map((status) => (
        <button
          key={status.value}
          ref={(el) => { if (el) tabRefs.current.set(status.value, el); }}
          onClick={() => onChange(status.value)}
          className={filterBarStyles.toggleButton(value === status.value)}
          aria-pressed={value === status.value}
          title={status.value === 'analyzed' ? 'Has session' : status.value === 'unanalyzed' ? 'No sessions yet' : 'Show all'}
        >
          {status.label}
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
    <div className="flex items-center gap-1" role="group" aria-label="Sort options">
      <select
        value={sortValue}
        onChange={(e) => onSortChange(e.target.value)}
        className={filterBarStyles.select}
        aria-label="Sort by"
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
        title={orderValue === 'asc' ? 'Oldest first - click for newest first' : 'Newest first - click for oldest first'}
        aria-label={orderValue === 'asc' ? 'Sort order: oldest first. Click to sort newest first' : 'Sort order: newest first. Click to sort oldest first'}
      >
        {orderValue === 'asc' ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blurple-500 text-white transition-transform active:scale-95 ${focusRing}`}
          >
            {label}
            <span className="hover:text-blurple-300">×</span>
          </button>
        ))}
        {unselectedLabels.length > 0 && (
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className={`px-2 py-0.5 text-xs rounded-full bg-gray-750 text-gray-300 hover:bg-gray-700 transition-transform active:scale-95 ${focusRing}`}
          >
            + Add
          </button>
        )}
      </div>

      {showDropdown && unselectedLabels.length > 0 && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-10 bg-black/20 modal-backdrop-enter"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute top-full left-0 mt-1.5 w-48 bg-gray-800 border border-gray-750 rounded-stoody shadow-xl z-20 max-h-48 overflow-auto dropdown-menu-enter py-1">
            {unselectedLabels.map((label, index) => (
              <button
                key={label}
                onClick={() => {
                  toggleLabel(label);
                  setShowDropdown(false);
                }}
                className={`dropdown-item-enter w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-750 hover:text-white truncate transition-colors duration-100 ${focusRingInset} focus:bg-gray-750 focus:text-white`}
                style={{ '--item-index': index } as React.CSSProperties}
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

// Filter group - visually groups related filters with optional label
interface FilterGroupProps {
  children: ReactNode;
  label?: string;
  className?: string;
  /** Allow horizontal scrolling on mobile instead of wrapping */
  scrollable?: boolean;
}

export function FilterGroup({ children, label, className = '', scrollable = false }: FilterGroupProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Check scroll position to show/hide fade indicators
  useEffect(() => {
    if (!scrollable) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const updateFades = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftFade(scrollLeft > 2);
      setShowRightFade(scrollLeft < scrollWidth - clientWidth - 2);
    };

    updateFades();
    container.addEventListener('scroll', updateFades);
    window.addEventListener('resize', updateFades);

    return () => {
      container.removeEventListener('scroll', updateFades);
      window.removeEventListener('resize', updateFades);
    };
  }, [scrollable, children]);

  return (
    <div className={`relative flex items-center gap-0.5 px-1 py-0.5 rounded-stoody-sm bg-gray-800/50 filter-group-light ${className}`}>
      {label && (
        <span className="text-[9px] font-medium text-gray-500 uppercase tracking-wide mr-0.5 shrink-0">
          {label}
        </span>
      )}
      {/* Left fade indicator */}
      {scrollable && showLeftFade && (
        <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-gray-800/80 to-transparent pointer-events-none z-10 rounded-l-stoody-sm filter-group-fade-left" />
      )}
      <div
        ref={scrollContainerRef}
        className={`flex items-center gap-0.5 ${scrollable ? 'overflow-x-auto scrollbar-none flex-nowrap' : ''}`}
      >
        {children}
      </div>
      {/* Right fade indicator */}
      {scrollable && showRightFade && (
        <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-gray-800/80 to-transparent pointer-events-none z-10 rounded-r-stoody-sm filter-group-fade-right" />
      )}
    </div>
  );
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

// Refresh button with success feedback animation
interface RefreshButtonProps {
  onClick: () => void;
  loading?: boolean;
}

export function RefreshButton({ onClick, loading }: RefreshButtonProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const wasLoadingRef = useRef(false);

  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Detect when loading finishes to show success animation
  useEffect(() => {
    if (wasLoadingRef.current && !loading && !prefersReducedMotion) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 1200);
      return () => clearTimeout(timer);
    }
    wasLoadingRef.current = loading ?? false;
  }, [loading, prefersReducedMotion]);

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`icon-btn p-1 rounded-stoody-sm hover:bg-gray-750 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed ${focusRing} ${showSuccess ? 'text-mint-400' : ''}`}
      title={loading ? 'Refreshing...' : showSuccess ? 'Refreshed!' : 'Refresh'}
      aria-label={loading ? 'Refreshing data' : showSuccess ? 'Data refreshed successfully' : 'Refresh data'}
    >
      {showSuccess ? (
        <svg
          className="w-3 h-3 refresh-success-icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg
          className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )}
    </button>
  );
}

// Active filters indicator with clear button
interface ActiveFiltersIndicatorProps {
  onClick: () => void;
  filterCount: number;
}

export function ActiveFiltersIndicator({ onClick, filterCount }: ActiveFiltersIndicatorProps) {
  if (filterCount <= 0) return null;
  return (
    <button
      onClick={onClick}
      className={`filter-indicator-enter inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-stoody-sm bg-blurple-500/20 text-blurple-400 hover:bg-blurple-500/30 hover:text-blurple-300 border border-blurple-500/30 transition-all active:scale-95 ${focusRing}`}
      title="Clear all active filters"
      aria-label={`Clear ${pluralize(filterCount, 'active filter')}`}
    >
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
      <span>{pluralize(filterCount, 'filter')}</span>
      <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

// Legacy clear filters button (kept for backward compatibility)
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
