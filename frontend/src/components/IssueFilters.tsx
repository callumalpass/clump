import { useMemo } from 'react';
import type { Issue, IssuePriority, IssueDifficulty, IssueRisk, IssueType, IssueStatus } from '../types';
import type { IssueFilters as IssueFiltersType, SessionStatusFilter } from '../hooks/useApi';
import {
  FilterBar,
  FilterBarRow,
  SearchInput,
  StateToggle,
  SessionStatusToggle,
  SortControl,
  LabelSelect,
  MetadataFilterSelect,
  ItemCount,
  RefreshButton,
  ActiveFiltersIndicator,
} from './FilterBar';

// Sidecar metadata filter options
const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'trivial', label: 'Trivial' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'complex', label: 'Complex' },
];

const RISK_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const TYPE_OPTIONS = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'refactor', label: 'Refactor' },
  { value: 'docs', label: 'Docs' },
  { value: 'chore', label: 'Chore' },
  { value: 'question', label: 'Question' },
];

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'wontfix', label: "Won't Fix" },
];

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

  // Sidecar metadata filter setters
  const setPriority = (priority: IssuePriority[]) => {
    onFiltersChange({ ...filters, priority: priority.length > 0 ? priority : undefined });
  };

  const setDifficulty = (difficulty: IssueDifficulty[]) => {
    onFiltersChange({ ...filters, difficulty: difficulty.length > 0 ? difficulty : undefined });
  };

  const setRisk = (risk: IssueRisk[]) => {
    onFiltersChange({ ...filters, risk: risk.length > 0 ? risk : undefined });
  };

  const setIssueType = (issueType: IssueType[]) => {
    onFiltersChange({ ...filters, issueType: issueType.length > 0 ? issueType : undefined });
  };

  const setSidecarStatus = (sidecarStatus: IssueStatus[]) => {
    onFiltersChange({ ...filters, sidecarStatus: sidecarStatus.length > 0 ? sidecarStatus : undefined });
  };

  const clearFilters = () => {
    onFiltersChange({ state: 'open' });
  };

  // Count active filters for the indicator
  // Only count filters that deviate from the default state (open, all, created, desc)
  // This prevents showing "2 filters" when user hasn't changed anything from defaults
  const activeFilterCount = [
    filters.search ? 1 : 0,
    filters.state && filters.state !== 'open' ? 1 : 0,  // 'open' is default
    filters.labels && filters.labels.length > 0 ? filters.labels.length : 0,
    filters.sort && filters.sort !== 'created' ? 1 : 0,  // 'created' is default
    filters.order && filters.order !== 'desc' ? 1 : 0,  // 'desc' is default
    filters.sessionStatus ? 1 : 0,  // undefined/'all' is default
    // Sidecar metadata filters
    filters.priority && filters.priority.length > 0 ? 1 : 0,
    filters.difficulty && filters.difficulty.length > 0 ? 1 : 0,
    filters.risk && filters.risk.length > 0 ? 1 : 0,
    filters.issueType && filters.issueType.length > 0 ? 1 : 0,
    filters.sidecarStatus && filters.sidecarStatus.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

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

      {/* Sidecar metadata filters */}
      <FilterBarRow className="flex-wrap gap-1.5">
        <span className="text-xs text-gray-500 mr-1">Metadata:</span>
        <MetadataFilterSelect
          label="Priority"
          options={PRIORITY_OPTIONS}
          selectedValues={filters.priority || []}
          onChange={(values) => setPriority(values as IssuePriority[])}
        />
        <MetadataFilterSelect
          label="Difficulty"
          options={DIFFICULTY_OPTIONS}
          selectedValues={filters.difficulty || []}
          onChange={(values) => setDifficulty(values as IssueDifficulty[])}
        />
        <MetadataFilterSelect
          label="Risk"
          options={RISK_OPTIONS}
          selectedValues={filters.risk || []}
          onChange={(values) => setRisk(values as IssueRisk[])}
        />
        <MetadataFilterSelect
          label="Type"
          options={TYPE_OPTIONS}
          selectedValues={filters.issueType || []}
          onChange={(values) => setIssueType(values as IssueType[])}
        />
        <MetadataFilterSelect
          label="Status"
          options={STATUS_OPTIONS}
          selectedValues={filters.sidecarStatus || []}
          onChange={(values) => setSidecarStatus(values as IssueStatus[])}
        />
      </FilterBarRow>

      {/* Active filters indicator */}
      <ActiveFiltersIndicator onClick={clearFilters} filterCount={activeFilterCount} />
    </FilterBar>
  );
}
