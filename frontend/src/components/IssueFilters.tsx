import { useMemo } from 'react';
import type { Issue } from '../types';
import type { IssueFilters as IssueFiltersType, SessionStatusFilter } from '../hooks/useApi';
import {
  FilterBar,
  FilterBarRow,
  SearchInput,
  StateToggle,
  SessionStatusToggle,
  SortControl,
  LabelSelect,
  ItemCount,
  RefreshButton,
  ClearFiltersButton,
} from './FilterBar';

interface IssueFiltersProps {
  filters: IssueFiltersType;
  onFiltersChange: (filters: IssueFiltersType) => void;
  issues: Issue[];  // Used to extract available labels
  total?: number;  // Total issue count for display
  onRefresh?: () => void;  // Callback to refresh issues
  loading?: boolean;  // Whether issues are currently loading
}

const SORT_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'comments', label: 'Comments' },
];

export function IssueFilters({ filters, onFiltersChange, issues, total, onRefresh, loading }: IssueFiltersProps) {
  // Extract unique labels from issues
  const availableLabels = useMemo(() => {
    const labelSet = new Set<string>();
    issues.forEach(issue => issue.labels.forEach(label => labelSet.add(label)));
    return Array.from(labelSet).sort();
  }, [issues]);

  const selectedLabels = filters.labels || [];

  const setSearch = (search: string) => {
    onFiltersChange({ ...filters, search: search || undefined });
  };

  const setState = (state: 'open' | 'closed' | 'all') => {
    onFiltersChange({ ...filters, state });
  };

  const setSort = (sort: string) => {
    onFiltersChange({ ...filters, sort: sort as 'created' | 'updated' | 'comments' });
  };

  const setOrder = (order: 'asc' | 'desc') => {
    onFiltersChange({ ...filters, order });
  };

  const setLabels = (labels: string[]) => {
    onFiltersChange({ ...filters, labels: labels.length > 0 ? labels : undefined });
  };

  const setSessionStatus = (sessionStatus: SessionStatusFilter) => {
    onFiltersChange({ ...filters, sessionStatus: sessionStatus === 'all' ? undefined : sessionStatus });
  };

  const clearFilters = () => {
    onFiltersChange({ state: 'open' });
  };

  const hasActiveFilters =
    filters.search ||
    filters.state !== 'open' ||
    (filters.labels && filters.labels.length > 0) ||
    filters.sort !== 'created' ||
    filters.order !== 'desc' ||
    filters.sessionStatus;

  return (
    <FilterBar>
      {/* Search input */}
      <SearchInput
        value={filters.search || ''}
        onChange={setSearch}
        placeholder="Search issues..."
      />

      {/* State toggle, session status, and sort */}
      <FilterBarRow className="justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          <StateToggle value={filters.state || 'open'} onChange={setState} />
          <SessionStatusToggle value={filters.sessionStatus || 'all'} onChange={setSessionStatus} />
        </div>
        <div className="flex items-center gap-2">
          <SortControl
            sortValue={filters.sort || 'created'}
            orderValue={filters.order || 'desc'}
            options={SORT_OPTIONS}
            onSortChange={setSort}
            onOrderChange={setOrder}
          />
          {total !== undefined && <ItemCount count={total} singular="issue" />}
          {onRefresh && <RefreshButton onClick={onRefresh} loading={loading} />}
        </div>
      </FilterBarRow>

      {/* Label filter */}
      {availableLabels.length > 0 && (
        <LabelSelect
          selectedLabels={selectedLabels}
          availableLabels={availableLabels}
          onChange={setLabels}
        />
      )}

      {/* Clear filters button */}
      <ClearFiltersButton onClick={clearFilters} show={!!hasActiveFilters} />
    </FilterBar>
  );
}
