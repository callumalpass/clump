import type { PR, SessionSummary, Process, CommandMetadata } from '../types';
import type { PRFilters, SessionStatusFilter } from '../hooks/useApi';
import { PRStartSessionButton } from './PRStartSessionButton';
import {
  FilterBar,
  FilterBarRow,
  SearchInput,
  StateToggle,
  SessionStatusToggle,
  SortControl,
  ItemCount,
  RefreshButton,
  ClearFiltersButton,
} from './FilterBar';

interface PRListProps {
  prs: PR[];
  selectedPR: number | null;
  onSelectPR: (prNumber: number) => void;
  prCommands: CommandMetadata[];
  onStartSession: (pr: PR, command: CommandMetadata) => void;
  loading: boolean;
  filters: PRFilters;
  onFiltersChange: (filters: PRFilters) => void;
  sessions?: SessionSummary[];
  processes?: Process[];
  onRefresh?: () => void;
}

const SORT_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
];

export function PRList({
  prs,
  selectedPR,
  onSelectPR,
  prCommands,
  onStartSession,
  loading,
  filters,
  onFiltersChange,
  sessions = [],
  processes: _processes = [],
  onRefresh,
}: PRListProps) {
  // Group sessions by PR number (a session can appear under multiple PRs)
  const sessionsByPR = sessions.reduce((acc, session) => {
    const prEntities = session.entities?.filter(e => e.kind === 'pr') || [];
    for (const entity of prEntities) {
      const prNum = entity.number.toString();
      if (!acc[prNum]) acc[prNum] = [];
      if (!acc[prNum].includes(session)) {
        acc[prNum].push(session);
      }
    }
    return acc;
  }, {} as Record<string, SessionSummary[]>);

  const setSearch = (search: string) => {
    onFiltersChange({ ...filters, search: search || undefined });
  };

  const setState = (state: 'open' | 'closed' | 'all') => {
    onFiltersChange({ ...filters, state });
  };

  const setSort = (sort: string) => {
    onFiltersChange({ ...filters, sort: sort as 'created' | 'updated' });
  };

  const setOrder = (order: 'asc' | 'desc') => {
    onFiltersChange({ ...filters, order });
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
    filters.sort !== 'created' ||
    filters.order !== 'desc' ||
    filters.sessionStatus;

  // Filter PRs by session status
  const filteredPRs = prs.filter((pr) => {
    if (filters.sessionStatus) {
      const hasSessions = (sessionsByPR[pr.number.toString()] || []).length > 0;
      if (filters.sessionStatus === 'analyzed' && !hasSessions) return false;
      if (filters.sessionStatus === 'unanalyzed' && hasSessions) return false;
    }
    return true;
  });

  // Filter tabs
  const filterBar = (
    <FilterBar>
      <SearchInput
        value={filters.search || ''}
        onChange={setSearch}
        placeholder="Search PRs..."
      />
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
          <ItemCount count={filteredPRs.length} singular="PR" />
          {onRefresh && <RefreshButton onClick={onRefresh} loading={loading} />}
        </div>
      </FilterBarRow>
      <ClearFiltersButton onClick={clearFilters} show={!!hasActiveFilters} />
    </FilterBar>
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {filterBar}
        <div className="divide-y divide-gray-700">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-8 rounded skeleton-shimmer" />
                    <div className="h-4 w-48 rounded skeleton-shimmer" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-4 w-24 rounded skeleton-shimmer" />
                    <div className="h-4 w-16 rounded skeleton-shimmer" />
                  </div>
                  <div className="h-3 w-32 rounded mt-2 skeleton-shimmer" />
                </div>
                <div className="h-7 w-16 rounded shrink-0 skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (filteredPRs.length === 0) {
    const hasFilters = filters.search || filters.state !== 'open' || filters.sessionStatus;
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {filterBar}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs empty-state-enter">
            <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium mb-1">
              {hasFilters ? 'No matching pull requests' : 'No pull requests'}
            </p>
            <p className="text-gray-500 text-sm">
              {hasFilters ? 'Try adjusting your filters' : 'This repository has no PRs yet'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {filterBar}
      <div className="flex-1 overflow-auto min-h-0 divide-y divide-gray-700">
        {filteredPRs.map((pr) => {
          const prSessions = sessionsByPR[pr.number.toString()] || [];
          // Check if any session is actively running
          const hasRunning = prSessions.some(s => s.is_active);
          const hasCompleted = prSessions.length > 0 && !hasRunning;

          return (
            <div
              key={pr.number}
              className={`p-3 cursor-pointer border-l-2 transition-all duration-150 ease-out list-item-hover ${
                selectedPR === pr.number
                  ? 'bg-gray-800/80 border-blue-500 list-item-selected'
                  : 'border-transparent hover:bg-gray-800/60 hover:border-blue-500/50'
              }`}
              onClick={() => onSelectPR(pr.number)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">#{pr.number}</span>
                    <h3 className="text-sm font-medium text-white truncate" title={pr.title}>
                      {pr.title}
                    </h3>
                    {hasRunning && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/20 text-yellow-400 shrink-0"
                        title="Session actively running"
                        aria-label="Active session"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                        Running
                      </span>
                    )}
                    {!hasRunning && hasCompleted && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-500/20 text-green-400 shrink-0"
                        title={`${prSessions.length} completed session${prSessions.length !== 1 ? 's' : ''}`}
                        aria-label={`${prSessions.length} completed session${prSessions.length !== 1 ? 's' : ''}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {prSessions.length}
                      </span>
                    )}
                  </div>
                  {/* Branch info */}
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono truncate max-w-[120px]" title={pr.head_ref}>
                      {pr.head_ref}
                    </span>
                    <svg className="w-3 h-3 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono truncate max-w-[120px]" title={pr.base_ref}>
                      {pr.base_ref}
                    </span>
                  </div>
                  {/* Labels */}
                  {pr.labels.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {pr.labels.map((label) => (
                        <span
                          key={label}
                          className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span>by {pr.author}</span>
                    <span className="flex items-center gap-1">
                      <span className="text-green-500">+{pr.additions}</span>
                      <span className="text-red-500">-{pr.deletions}</span>
                    </span>
                    <span>{pr.changed_files} file{pr.changed_files !== 1 ? 's' : ''}</span>
                    {prSessions.length > 0 && (
                      <span className="text-purple-400">{prSessions.length} session{prSessions.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
                <PRStartSessionButton
                  pr={pr}
                  commands={prCommands}
                  onStart={(_, command) => {
                    onStartSession(pr, command);
                  }}
                  size="sm"
                  className="shrink-0"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
