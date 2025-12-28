import { memo, useCallback, useState } from 'react';
import type { SessionSummary, Process, BulkOperationResult } from '../types';
import { getModelShortName, getModelTextColor } from '../utils/models';
import { formatRelativeTime } from '../utils/time';
import { ElapsedTimer } from './ElapsedTimer';
import { Pagination, PaginationSkeleton } from './Pagination';
import {
  FilterBar,
  FilterBarRow,
  SearchInput,
  SortControl,
  ItemCount,
  RefreshButton,
  ActiveFiltersIndicator,
  filterBarStyles,
} from './FilterBar';

// Check if a session was modified recently (within last 10 minutes)
function isRecentlyModified(modifiedAt: string): boolean {
  const modified = new Date(modifiedAt);
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  return modified > tenMinutesAgo;
}

// Memoized list item component to prevent unnecessary re-renders
interface SessionListItemProps {
  session: SessionSummary;
  index: number;
  onSelect: () => void;
  onContinue?: (e: React.MouseEvent) => void;
  onToggleStar?: (e: React.MouseEvent) => void;
  showContinueButton: boolean;
  showStarButton: boolean;
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  selectionMode?: boolean;
}

const SessionListItem = memo(function SessionListItem({
  session,
  index,
  onSelect,
  onContinue,
  onToggleStar,
  showContinueButton,
  showStarButton,
  isSelected = false,
  onToggleSelect,
  selectionMode = false,
}: SessionListItemProps) {
  // Format repo path for display - show last 2-3 segments
  const formatRepoPath = (s: SessionSummary) => {
    if (s.repo_name) return s.repo_name;
    const segments = s.repo_path.split('/').filter(Boolean);
    return segments.slice(-2).join('/');
  };

  // Determine status for both border and glow styling
  const statusClasses = isSelected
    ? 'bg-blue-900/30 border-blue-500 list-item-glow-recent'
    : session.is_active
    ? 'border-yellow-500/70 hover:border-yellow-400 list-item-glow-active'
    : isRecentlyModified(session.modified_at)
    ? 'border-blue-500/60 hover:border-blue-400 list-item-glow-recent'
    : 'border-green-500/30 hover:border-green-500/60 list-item-glow-done';

  return (
    <div
      className={`group p-3 cursor-pointer border-l-2 hover:bg-gray-800/60 transition-all duration-150 ease-out list-item-hover list-item-enter ${statusClasses}`}
      style={{ '--item-index': Math.min(index, 15) } as React.CSSProperties}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 mb-1">
        {/* Selection checkbox */}
        {selectionMode && onToggleSelect && (
          <button
            onClick={onToggleSelect}
            className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${
              isSelected
                ? 'bg-blue-500 border-blue-500'
                : 'border-gray-500 hover:border-gray-400'
            }`}
            title={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected && (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        )}

        {/* Status indicator with text label for accessibility */}
        {session.is_active ? (
          <span
            className="status-badge status-badge-enter inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/20 text-yellow-400 flex-shrink-0 active-badge-glow"
            title="Session is actively running"
            aria-label="Active session"
          >
            <span className="status-dot w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            Active
          </span>
        ) : isRecentlyModified(session.modified_at) ? (
          <span
            className="status-badge status-badge-enter inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/20 text-blue-400 flex-shrink-0"
            title="Session updated in the last 10 minutes"
            aria-label="Recently updated session"
          >
            <span className="status-dot w-1.5 h-1.5 rounded-full bg-blue-500" />
            Recent
          </span>
        ) : (
          <span
            className="status-badge status-badge-enter inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-500/20 text-green-400 flex-shrink-0"
            title="Session completed"
            aria-label="Completed session"
          >
            <span className="status-dot w-1.5 h-1.5 rounded-full bg-green-500" />
            Done
          </span>
        )}

        {/* Title */}
        <span className="text-sm font-medium text-white truncate flex-1" title={session.title || 'Untitled session'}>
          {session.title || 'Untitled session'}
        </span>

        {/* Star button */}
        {showStarButton && onToggleStar && (
          <button
            onClick={onToggleStar}
            className={`flex-shrink-0 p-1 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${
              session.starred
                ? 'text-yellow-400'
                : 'text-gray-600 group-hover:text-gray-400 hover:!text-yellow-400'
            }`}
            title={session.starred ? 'Unstar' : 'Star'}
          >
            <svg className="w-4 h-4" fill={session.starred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        )}

        {/* Continue button - show if not actively running */}
        {showContinueButton && !session.is_active && onContinue && (
          <button
            onClick={onContinue}
            className="flex-shrink-0 px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 active:scale-95 rounded flex items-center gap-1 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
            title="Continue this conversation"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            Continue
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        {/* Repo path */}
        <span className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 rounded truncate max-w-[120px] transition-colors" title={session.repo_path}>
          {formatRepoPath(session)}
        </span>

        {/* Entity links */}
        {session.entities?.map((entity, idx) => (
          <span
            key={idx}
            className={`px-1 py-0.5 rounded transition-colors ${
              entity.kind === 'issue'
                ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50 hover:text-green-300'
                : 'bg-purple-900/30 text-purple-400 hover:bg-purple-900/50 hover:text-purple-300'
            }`}
          >
            #{entity.number}
          </span>
        ))}

        {/* Model - color-coded for quick identification */}
        {session.model && (
          <span className={getModelTextColor(session.model)}>
            {getModelShortName(session.model)}
          </span>
        )}

        {/* Message count */}
        <span className="text-gray-500">
          {session.message_count} msg{session.message_count !== 1 ? 's' : ''}
        </span>

        {/* Duration for active, relative time for completed */}
        {session.is_active && session.start_time ? (
          <span className="text-yellow-500" title="Time elapsed">
            <ElapsedTimer startTime={session.start_time} />
          </span>
        ) : session.modified_at && (
          <span
            className="text-gray-500"
            title={new Date(session.modified_at).toLocaleString()}
          >
            {formatRelativeTime(session.modified_at)}
          </span>
        )}
      </div>
    </div>
  );
});

export type SessionFilter = 'all' | 'active' | 'starred' | 'with-entities';
export type ModelFilter = 'all' | 'sonnet' | 'opus' | 'haiku';

export interface SessionListFilters {
  category: SessionFilter;
  model?: ModelFilter;
  search?: string;
  sort?: 'created' | 'updated' | 'messages';
  order?: 'asc' | 'desc';
}

interface SessionListProps {
  sessions: SessionSummary[];
  processes?: Process[];
  onSelectSession: (session: SessionSummary) => void;
  onContinueSession?: (session: SessionSummary) => void;
  onToggleStar?: (session: SessionSummary) => void;
  onRefresh?: () => void;
  onBulkDelete?: (sessionIds: string[]) => Promise<BulkOperationResult>;
  onBulkStar?: (sessionIds: string[], starred: boolean) => Promise<BulkOperationResult>;
  loading: boolean;
  filters: SessionListFilters;
  onFiltersChange: (filters: SessionListFilters) => void;
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const CATEGORY_FILTERS: { value: SessionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'starred', label: 'Starred' },
  { value: 'with-entities', label: 'Linked' },
];

const MODEL_FILTERS: { value: ModelFilter; label: string; color: string }[] = [
  { value: 'all', label: 'All Models', color: 'text-gray-400' },
  { value: 'sonnet', label: 'Sonnet', color: 'text-purple-400' },
  { value: 'opus', label: 'Opus', color: 'text-amber-500' },
  { value: 'haiku', label: 'Haiku', color: 'text-cyan-400' },
];

const SORT_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'messages', label: 'Messages' },
];

export function SessionList({
  sessions,
  processes: _processes = [],
  onSelectSession,
  onContinueSession,
  onToggleStar,
  onRefresh,
  onBulkDelete,
  onBulkStar,
  loading,
  filters,
  onFiltersChange,
  total,
  page,
  totalPages,
  onPageChange,
}: SessionListProps) {
  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Check if bulk operations are available
  const hasBulkOperations = !!onBulkDelete || !!onBulkStar;

  // Get selectable sessions (exclude active sessions from selection for delete)
  const selectableSessions = sessions.filter(s => !s.is_active);
  const allSelectableSelected = selectableSessions.length > 0 &&
    selectableSessions.every(s => selectedIds.has(s.session_id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectSession = useCallback((sessionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelectableSelected) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all non-active sessions on current page
      setSelectedIds(new Set(selectableSessions.map(s => s.session_id)));
    }
  }, [allSelectableSelected, selectableSessions]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Bulk delete handler
  const handleBulkDelete = useCallback(async () => {
    if (!onBulkDelete || selectedIds.size === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.size} session${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`
    );
    if (!confirmed) return;

    setBulkActionLoading(true);
    try {
      const result = await onBulkDelete(Array.from(selectedIds));
      // Clear selection after successful delete
      if (result.deleted && result.deleted > 0) {
        setSelectedIds(new Set());
      }
      if (result.failed > 0) {
        alert(`${result.failed} session${result.failed > 1 ? 's' : ''} could not be deleted`);
      }
    } catch (e) {
      console.error('Bulk delete failed:', e);
      alert('Failed to delete sessions');
    } finally {
      setBulkActionLoading(false);
    }
  }, [onBulkDelete, selectedIds]);

  // Bulk star handler
  const handleBulkStar = useCallback(async (starred: boolean) => {
    if (!onBulkStar || selectedIds.size === 0) return;

    setBulkActionLoading(true);
    try {
      await onBulkStar(Array.from(selectedIds), starred);
      // Clear selection after successful update
      setSelectedIds(new Set());
    } catch (e) {
      console.error('Bulk star failed:', e);
      alert('Failed to update sessions');
    } finally {
      setBulkActionLoading(false);
    }
  }, [onBulkStar, selectedIds]);

  const setSearch = (search: string) => {
    onFiltersChange({ ...filters, search: search || undefined });
  };

  const setCategory = (category: SessionFilter) => {
    onFiltersChange({ ...filters, category });
  };

  const setModel = (model: ModelFilter) => {
    onFiltersChange({ ...filters, model: model === 'all' ? undefined : model });
  };

  const setSort = (sort: string) => {
    onFiltersChange({ ...filters, sort: sort as 'created' | 'updated' | 'messages' });
  };

  const setOrder = (order: 'asc' | 'desc') => {
    onFiltersChange({ ...filters, order });
  };

  const clearFilters = () => {
    onFiltersChange({ category: 'all' });
  };

  // Count active filters for the indicator
  const activeFilterCount = [
    filters.search ? 1 : 0,
    filters.category !== 'all' ? 1 : 0,
    filters.model && filters.model !== 'all' ? 1 : 0,
    filters.sort !== 'created' ? 1 : 0,
    filters.order !== 'desc' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Bulk actions bar when items are selected
  const bulkActionsBar = someSelected && (
    <div className="flex items-center justify-between px-3 py-2 bg-blue-900/30 border-b border-blue-700/50">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSelectAll}
          className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${
            allSelectableSelected
              ? 'bg-blue-500 border-blue-500'
              : someSelected
              ? 'bg-blue-500/50 border-blue-500'
              : 'border-gray-500 hover:border-gray-400'
          }`}
          title={allSelectableSelected ? 'Deselect all' : 'Select all'}
        >
          {(allSelectableSelected || someSelected) && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={allSelectableSelected ? "M5 13l4 4L19 7" : "M20 12H4"} />
            </svg>
          )}
        </button>
        <span className="text-sm text-blue-300">
          {selectedIds.size} selected
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onBulkStar && (
          <>
            <button
              onClick={() => handleBulkStar(true)}
              disabled={bulkActionLoading}
              className="px-2 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 rounded flex items-center gap-1 transition-colors"
              title="Star selected"
            >
              <svg className="w-3 h-3" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              Star
            </button>
            <button
              onClick={() => handleBulkStar(false)}
              disabled={bulkActionLoading}
              className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 disabled:opacity-50 rounded flex items-center gap-1 transition-colors"
              title="Unstar selected"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              Unstar
            </button>
          </>
        )}
        {onBulkDelete && (
          <button
            onClick={handleBulkDelete}
            disabled={bulkActionLoading}
            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded flex items-center gap-1 transition-colors"
            title="Delete selected"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        )}
        <button
          onClick={clearSelection}
          className="px-2 py-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          title="Clear selection"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const filterBar = (
    <FilterBar>
      <div className="flex items-center gap-2">
        {hasBulkOperations && !someSelected && (
          <button
            onClick={toggleSelectAll}
            className="flex-shrink-0 w-4 h-4 rounded border border-gray-600 hover:border-gray-500 transition-colors"
            title="Select sessions"
          />
        )}
        <div className="flex-1">
          <SearchInput
            value={filters.search || ''}
            onChange={setSearch}
            placeholder="Search sessions..."
          />
        </div>
      </div>
      <FilterBarRow className="flex-wrap gap-1">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setCategory(f.value)}
            className={filterBarStyles.pillButton(filters.category === f.value)}
          >
            {f.label}
          </button>
        ))}
        <span className="text-gray-600 mx-1">|</span>
        {MODEL_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setModel(f.value)}
            className={`${filterBarStyles.pillButton((filters.model || 'all') === f.value)} ${
              (filters.model || 'all') === f.value ? f.color : ''
            }`}
          >
            {f.label}
          </button>
        ))}
      </FilterBarRow>
      <FilterBarRow className="justify-between">
        <SortControl
          sortValue={filters.sort || 'created'}
          orderValue={filters.order || 'desc'}
          options={SORT_OPTIONS}
          onSortChange={setSort}
          onOrderChange={setOrder}
        />
        <div className="flex items-center gap-1.5">
          <ItemCount count={total} singular="session" />
          {onRefresh && <RefreshButton onClick={onRefresh} loading={loading} />}
        </div>
      </FilterBarRow>
      <ActiveFiltersIndicator onClick={clearFilters} filterCount={activeFilterCount} />
    </FilterBar>
  );

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {filterBar}
        <div className="divide-y divide-gray-700">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-3 skeleton-item-enter"
              style={{ '--item-index': i } as React.CSSProperties}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-10 h-4 rounded-full skeleton-shimmer" />
                <div className="h-4 w-40 rounded skeleton-shimmer" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-14 rounded skeleton-shimmer" />
                <div className="h-4 w-8 rounded skeleton-shimmer" />
                <div className="h-4 w-20 rounded skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
        {/* Pagination skeleton */}
        <div className="shrink-0 border-t border-gray-700 p-2 flex items-center justify-between text-sm">
          <div className="h-4 w-20 rounded skeleton-shimmer" />
          <PaginationSkeleton />
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    const hasFilters = filters.search || filters.category !== 'all';
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {filterBar}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs empty-state-enter">
            <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4 empty-state-icon-float">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium mb-1">
              {hasFilters ? 'No matching sessions' : 'No Claude sessions found'}
            </p>
            <p className="text-gray-400 text-sm">
              {hasFilters
                ? 'Try adjusting your filters'
                : 'Sessions from Claude Code will appear here'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Memoize event handlers to maintain stable references for memoized children
  const handleContinue = useCallback((e: React.MouseEvent, session: SessionSummary) => {
    e.stopPropagation();
    onContinueSession?.(session);
  }, [onContinueSession]);

  const handleToggleStar = useCallback((e: React.MouseEvent, session: SessionSummary) => {
    e.stopPropagation();
    onToggleStar?.(session);
  }, [onToggleStar]);

  const handleToggleSelect = useCallback((e: React.MouseEvent, session: SessionSummary) => {
    e.stopPropagation();
    // Don't allow selecting active sessions (can't delete them)
    if (!session.is_active) {
      toggleSelectSession(session.session_id);
    }
  }, [toggleSelectSession]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {filterBar}
      {bulkActionsBar}
      <div className="divide-y divide-gray-700 overflow-auto flex-1 min-h-0">
        {sessions.map((session, index) => (
          <SessionListItem
            key={session.session_id}
            session={session}
            index={index}
            onSelect={() => onSelectSession(session)}
            onContinue={(e) => handleContinue(e, session)}
            onToggleStar={(e) => handleToggleStar(e, session)}
            showContinueButton={!!onContinueSession}
            showStarButton={!!onToggleStar}
            isSelected={selectedIds.has(session.session_id)}
            onToggleSelect={hasBulkOperations ? (e) => handleToggleSelect(e, session) : undefined}
            selectionMode={hasBulkOperations}
          />
        ))}
      </div>

      {/* Pagination - always visible to prevent layout shift */}
      <div className="shrink-0 border-t border-gray-700 p-2 flex items-center justify-between text-sm">
        <span className="text-gray-400">
          {total} sessions
        </span>
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
