import { useMemo } from 'react';
import type { Issue } from '../types';
import type { IssueFilters as IssueFiltersType } from '../hooks/useApi';
import {
  FilterBar,
  FilterBarRow,
  SearchInput,
  StateToggle,
  SortControl,
  LabelSelect,
  ClearFiltersButton,
} from './FilterBar';

interface IssueFiltersProps {
  filters: IssueFiltersType;
  onFiltersChange: (filters: IssueFiltersType) => void;
  issues: Issue[];  // Used to extract available labels
}

const SORT_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'comments', label: 'Comments' },
];

export function IssueFilters({ filters, onFiltersChange, issues }: IssueFiltersProps) {
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

  const clearFilters = () => {
    onFiltersChange({ state: 'open' });
  };

  const hasActiveFilters =
    filters.search ||
    filters.state !== 'open' ||
    (filters.labels && filters.labels.length > 0) ||
    filters.sort !== 'created' ||
    filters.order !== 'desc';

  return (
    <FilterBar>
      {/* Search input */}
      <SearchInput
        value={filters.search || ''}
        onChange={setSearch}
        placeholder="Search issues..."
      />

      {/* State toggle and sort */}
      <FilterBarRow className="justify-between">
        <StateToggle value={filters.state || 'open'} onChange={setState} />
        <SortControl
          sortValue={filters.sort || 'created'}
          orderValue={filters.order || 'desc'}
          options={SORT_OPTIONS}
          onSortChange={setSort}
          onOrderChange={setOrder}
        />
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
