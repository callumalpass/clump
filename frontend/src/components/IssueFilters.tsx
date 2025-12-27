import { useState, useEffect, useMemo } from 'react';
import type { Issue } from '../types';
import type { IssueFilters as IssueFiltersType } from '../hooks/useApi';

interface IssueFiltersProps {
  filters: IssueFiltersType;
  onFiltersChange: (filters: IssueFiltersType) => void;
  issues: Issue[];  // Used to extract available labels
}

export function IssueFilters({ filters, onFiltersChange, issues }: IssueFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== (filters.search || '')) {
        onFiltersChange({ ...filters, search: searchInput || undefined });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Sync search input with filters (for external changes)
  useEffect(() => {
    setSearchInput(filters.search || '');
  }, [filters.search]);

  // Extract unique labels from issues
  const availableLabels = useMemo(() => {
    const labelSet = new Set<string>();
    issues.forEach(issue => issue.labels.forEach(label => labelSet.add(label)));
    return Array.from(labelSet).sort();
  }, [issues]);

  const selectedLabels = filters.labels || [];

  const toggleLabel = (label: string) => {
    const newLabels = selectedLabels.includes(label)
      ? selectedLabels.filter(l => l !== label)
      : [...selectedLabels, label];
    onFiltersChange({ ...filters, labels: newLabels.length > 0 ? newLabels : undefined });
  };

  const setState = (state: 'open' | 'closed' | 'all') => {
    onFiltersChange({ ...filters, state });
  };

  const setSort = (sort: 'created' | 'updated' | 'comments') => {
    onFiltersChange({ ...filters, sort });
  };

  const toggleOrder = () => {
    onFiltersChange({ ...filters, order: filters.order === 'asc' ? 'desc' : 'asc' });
  };

  const clearFilters = () => {
    setSearchInput('');
    onFiltersChange({ state: 'open' });
  };

  const hasActiveFilters =
    filters.search ||
    filters.state !== 'open' ||
    (filters.labels && filters.labels.length > 0) ||
    filters.sort !== 'created' ||
    filters.order !== 'desc';

  return (
    <div className="p-2 border-b border-gray-700 space-y-2">
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search issues..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm pl-8 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white focus:outline-none focus:text-white"
          >
            ×
          </button>
        )}
      </div>

      {/* State toggle and sort */}
      <div className="flex items-center justify-between gap-2">
        {/* State buttons */}
        <div className="flex rounded overflow-hidden border border-gray-600">
          {(['open', 'closed', 'all'] as const).map((state) => (
            <button
              key={state}
              onClick={() => setState(state)}
              className={`px-2 py-1 text-xs capitalize focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset focus:z-10 ${
                filters.state === state
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {state}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="flex items-center gap-1">
          <select
            value={filters.sort || 'created'}
            onChange={(e) => setSort(e.target.value as 'created' | 'updated' | 'comments')}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="comments">Comments</option>
          </select>
          <button
            onClick={toggleOrder}
            className="p-1 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title={filters.order === 'asc' ? 'Oldest first' : 'Newest first'}
          >
            {filters.order === 'asc' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Label filter */}
      {availableLabels.length > 0 && (
        <div className="relative">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-400">Labels:</span>
            {selectedLabels.map((label) => (
              <button
                key={label}
                onClick={() => toggleLabel(label)}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-gray-900"
              >
                {label}
                <span className="hover:text-blue-200">×</span>
              </button>
            ))}
            <button
              onClick={() => setShowLabelDropdown(!showLabelDropdown)}
              className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-900"
            >
              + Add
            </button>
          </div>

          {showLabelDropdown && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
              {availableLabels
                .filter(label => !selectedLabels.includes(label))
                .map((label) => (
                  <button
                    key={label}
                    onClick={() => {
                      toggleLabel(label);
                      setShowLabelDropdown(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 truncate focus:outline-none focus:bg-gray-700 focus:text-white"
                  >
                    {label}
                  </button>
                ))}
              {availableLabels.filter(label => !selectedLabels.includes(label)).length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-400">All labels selected</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Clear filters button */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="text-xs text-gray-400 hover:text-white focus:outline-none focus:text-white focus:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
