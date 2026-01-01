import { memo, useCallback, useState, useRef, useEffect } from 'react';
import type { SessionSummary, Process, BulkOperationResult, CLIType } from '../types';
import { getModelShortName, getModelTextColor } from '../utils/models';
import { formatRelativeTime, formatDuration, isRecentlyModified } from '../utils/time';
import { ElapsedTimer } from './ElapsedTimer';
import {
  FilterBar,
  FilterBarRow,
  FilterGroup,
  SearchInput,
  SortControl,
  ItemCount,
  RefreshButton,
  ActiveFiltersIndicator,
  filterBarStyles,
} from './FilterBar';
import { ConfirmDialog } from './ConfirmDialog';
import { pluralize } from '../utils/text';
import { CLIBadge } from './CLISelector';

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
  isViewing?: boolean;
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
  isViewing = false,
}: SessionListItemProps) {
  // Track checkbox bounce animation
  const [isBouncing, setIsBouncing] = useState(false);
  const prevSelectedRef = useRef(isSelected);

  // Track star pop animation
  const [isStarAnimating, setIsStarAnimating] = useState(false);
  const prevStarredRef = useRef(session.starred);

  // Trigger bounce animation when selection changes
  useEffect(() => {
    if (isSelected !== prevSelectedRef.current) {
      setIsBouncing(true);
      prevSelectedRef.current = isSelected;
    }
  }, [isSelected]);

  // Trigger star pop animation when starred status changes
  useEffect(() => {
    if (session.starred !== prevStarredRef.current) {
      setIsStarAnimating(true);
      prevStarredRef.current = session.starred;
    }
  }, [session.starred]);

  // Format repo path for display - show last 2-3 segments
  const formatRepoPath = (s: SessionSummary) => {
    if (s.repo_name) return s.repo_name;
    const segments = s.repo_path.split('/').filter(Boolean);
    return segments.slice(-2).join('/');
  };

  // Determine status styling - Stoody card style, clean look
  // isSelected = bulk selection checkbox, isViewing = session tab is open/active
  const statusClasses = isSelected
    ? 'bg-blurple-500/10'
    : isViewing
    ? 'ring-2 ring-inset ring-blurple-500/50 bg-blurple-500/10'
    : '';

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group p-4 mx-2 my-2 cursor-pointer rounded-stoody-lg bg-gray-800 session-card-light hover:bg-gray-750 transition-colors duration-150 list-item-enter list-item-hover focus-visible:ring-2 focus-visible:ring-blurple-400 focus-visible:ring-inset ${statusClasses}`}
      style={{ '--item-index': Math.min(index, 15) } as React.CSSProperties}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {/* Hover arrow indicator */}
        <svg className="w-3.5 h-3.5 text-blurple-400 list-item-hover-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {/* Selection checkbox */}
        {selectionMode && onToggleSelect && (
          <button
            onClick={onToggleSelect}
            onAnimationEnd={() => setIsBouncing(false)}
            className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${
              isSelected
                ? 'bg-blue-500 border-blue-500'
                : 'border-gray-500 hover:border-gray-400'
            } ${isBouncing ? 'checkbox-bounce' : ''}`}
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
            className="status-badge status-badge-enter status-badge-active inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-stoody-lg bg-warning-500/20 text-warning-500 flex-shrink-0"
            title="Session is actively running"
            aria-label="Active session"
          >
            <span className="status-dot w-2 h-2 rounded-full bg-warning-500 animate-pulse" />
            Active
          </span>
        ) : isRecentlyModified(session.modified_at) ? (
          <span
            className="status-badge status-badge-enter status-badge-recent inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-stoody-lg bg-blurple-400/20 text-blurple-400 flex-shrink-0"
            title="Session updated in the last 10 minutes"
            aria-label="Recently updated session"
          >
            <span className="status-dot w-2 h-2 rounded-full bg-blurple-400" />
            Recent
          </span>
        ) : (
          <span
            className="status-badge status-badge-enter status-badge-done inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-stoody-lg bg-mint-400/20 text-mint-400 flex-shrink-0"
            title="Session completed"
            aria-label="Completed session"
          >
            <span className="status-dot w-2 h-2 rounded-full bg-mint-400" />
            Done
          </span>
        )}

        {/* Title */}
        <span className="text-sm font-medium text-white truncate flex-1 group-hover:text-pink-400 transition-colors" title={session.title || 'Untitled session'}>
          {session.title || 'Untitled session'}
        </span>

        {/* Star button */}
        {showStarButton && onToggleStar && (
          <button
            onClick={onToggleStar}
            onAnimationEnd={() => setIsStarAnimating(false)}
            className={`star-button flex-shrink-0 p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${
              session.starred
                ? 'text-yellow-400 star-button-starred'
                : 'text-gray-600 group-hover:text-gray-400 hover:!text-yellow-400'
            } ${isStarAnimating ? 'star-button-animate' : ''}`}
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
            className="flex-shrink-0 px-3 py-1.5 text-xs bg-blurple-500/20 text-blurple-400 hover:bg-blurple-500 hover:text-pink-400 rounded-stoody flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-400 btn-squish"
            title="Continue this conversation"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            Continue
          </button>
        )}
      </div>

      <div className="list-item-metadata flex items-center gap-2 text-xs mt-2 flex-wrap">
        {/* CLI badge - show which CLI tool was used */}
        {session.cli_type && session.cli_type !== 'claude' && (
          <CLIBadge cliType={session.cli_type} small />
        )}

        {/* Model - color-coded badge for quick identification (most important) */}
        {session.model && (
          <span className={`px-2 py-0.5 rounded-stoody font-medium ${getModelTextColor(session.model)} bg-gray-750/80`}>
            {getModelShortName(session.model)}
          </span>
        )}

        {/* Entity badges - informational only */}
        {session.entities?.map((entity, idx) => (
          <span
            key={idx}
            className={`px-2 py-0.5 rounded-stoody font-medium ${
              entity.kind === 'issue'
                ? 'bg-mint-400/15 text-mint-400'
                : 'bg-blurple-400/15 text-blurple-400'
            }`}
            title={entity.kind === 'issue' ? `Issue #${entity.number}` : `PR #${entity.number}`}
          >
            #{entity.number}
          </span>
        ))}

        {/* Separator dot */}
        <span className="text-gray-600 hidden sm:inline">·</span>

        {/* Message count with icon */}
        <span className="text-gray-500 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {session.message_count}
        </span>

        {/* Duration for active sessions, duration + relative time for completed */}
        {session.is_active && session.start_time ? (
          <span className="text-yellow-500 flex items-center gap-1" title="Time elapsed">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <ElapsedTimer startTime={session.start_time} />
          </span>
        ) : (
          <>
            {/* Show session duration if available */}
            {session.duration_seconds != null && (
              <span className="text-gray-400 flex items-center gap-1" title="Session duration">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatDuration(session.duration_seconds)}
              </span>
            )}
            {/* Show relative time */}
            {session.modified_at && (
              <span
                className="text-gray-500 ml-auto"
                title={new Date(session.modified_at).toLocaleString()}
              >
                {formatRelativeTime(session.modified_at)}
              </span>
            )}
          </>
        )}

        {/* Repo path - pushed to end, truncated */}
        <span className="px-2 py-0.5 bg-gray-750/50 rounded-stoody truncate max-w-[120px] text-gray-500 hidden sm:inline" title={session.repo_path}>
          {formatRepoPath(session)}
        </span>
      </div>
    </div>
  );
});

export type SessionFilter = 'all' | 'active' | 'completed' | 'starred' | 'with-entities';
export type ModelFilter = 'all' | 'sonnet' | 'opus' | 'haiku';
export type DateRangePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month';
export type CLIFilter = 'all' | CLIType;

export interface SessionListFilters {
  category: SessionFilter;
  model?: ModelFilter;
  cliType?: CLIFilter;
  search?: string;
  sort?: 'created' | 'updated' | 'messages';
  order?: 'asc' | 'desc';
  dateRange?: DateRangePreset;
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
  activeSessionId?: string | null;
}

const CATEGORY_FILTERS: { value: SessionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
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

const DATE_RANGE_FILTERS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

const CLI_FILTERS: { value: CLIFilter; label: string }[] = [
  { value: 'all', label: 'All CLIs' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'codex', label: 'Codex' },
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
  activeSessionId,
}: SessionListProps) {
  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  // Bulk delete handler - shows confirmation dialog
  const handleBulkDeleteClick = useCallback(() => {
    if (!onBulkDelete || selectedIds.size === 0) return;
    setShowDeleteConfirm(true);
  }, [onBulkDelete, selectedIds.size]);

  // Actual delete after confirmation
  const handleBulkDeleteConfirm = useCallback(async () => {
    if (!onBulkDelete || selectedIds.size === 0) return;

    setBulkActionLoading(true);
    try {
      const result = await onBulkDelete(Array.from(selectedIds));
      // Clear selection after successful delete
      if (result.deleted && result.deleted > 0) {
        setSelectedIds(new Set());
      }
      setShowDeleteConfirm(false);
    } catch (e) {
      console.error('Bulk delete failed:', e);
    } finally {
      setBulkActionLoading(false);
    }
  }, [onBulkDelete, selectedIds]);

  // Bulk star handler
  const handleBulkStar = useCallback(async (starred: boolean) => {
    if (!onBulkStar || selectedIds.size === 0) return;

    setBulkActionLoading(true);
    try {
      const result = await onBulkStar(Array.from(selectedIds), starred);
      // Clear selection after successful update (if any sessions were updated)
      if (result.updated && result.updated > 0) {
        setSelectedIds(new Set());
      }
    } catch (e) {
      console.error('Bulk star failed:', e);
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

  const setDateRange = (dateRange: DateRangePreset) => {
    onFiltersChange({ ...filters, dateRange: dateRange === 'all' ? undefined : dateRange });
  };

  const setCLIType = (cliType: CLIFilter) => {
    onFiltersChange({ ...filters, cliType: cliType === 'all' ? undefined : cliType });
  };

  const clearFilters = () => {
    onFiltersChange({ category: 'all' });
  };

  // Count active filters for the indicator
  const activeFilterCount = [
    filters.search ? 1 : 0,
    filters.category !== 'all' ? 1 : 0,
    filters.model && filters.model !== 'all' ? 1 : 0,
    filters.cliType && filters.cliType !== 'all' ? 1 : 0,
    filters.dateRange && filters.dateRange !== 'all' ? 1 : 0,
    filters.sort && filters.sort !== 'created' ? 1 : 0,
    filters.order && filters.order !== 'desc' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Memoize event handlers - must be before any early returns to satisfy Rules of Hooks
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
              className="px-2 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed rounded flex items-center gap-1 transition-colors"
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
              className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-750 disabled:opacity-50 disabled:cursor-not-allowed rounded flex items-center gap-1 transition-colors"
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
            onClick={handleBulkDeleteClick}
            disabled={bulkActionLoading}
            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded flex items-center gap-1 transition-colors"
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
      {/* Row 1: Search + count/refresh + clear filters */}
      <div className="flex items-center gap-2">
        {hasBulkOperations && !someSelected && (
          <button
            onClick={toggleSelectAll}
            className="flex-shrink-0 w-3.5 h-3.5 rounded border border-gray-600 hover:border-gray-500 transition-colors"
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
        <div className="flex items-center gap-1 shrink-0">
          <ItemCount count={total} singular="session" />
          {onRefresh && <RefreshButton onClick={onRefresh} loading={loading} />}
          <ActiveFiltersIndicator onClick={clearFilters} filterCount={activeFilterCount} />
        </div>
      </div>
      {/* Row 2: All filters in one row */}
      <FilterBarRow className="flex-wrap gap-1 overflow-x-auto scrollbar-none">
        {/* Status filter group */}
        <FilterGroup scrollable className="shrink-0">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setCategory(f.value)}
              className={`${filterBarStyles.pillButton(filters.category === f.value)} shrink-0`}
            >
              {f.label}
            </button>
          ))}
        </FilterGroup>

        {/* Model filter - compact dropdown */}
        <select
          value={filters.model || 'all'}
          onChange={(e) => setModel(e.target.value as ModelFilter)}
          className={filterBarStyles.select}
          aria-label="Filter by model"
        >
          {MODEL_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        {/* CLI filter - compact dropdown */}
        <select
          value={filters.cliType || 'all'}
          onChange={(e) => setCLIType(e.target.value as CLIFilter)}
          className={filterBarStyles.select}
          aria-label="Filter by CLI"
        >
          {CLI_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        {/* Date range filter - compact dropdown */}
        <select
          value={filters.dateRange || 'all'}
          onChange={(e) => setDateRange(e.target.value as DateRangePreset)}
          className={filterBarStyles.select}
          aria-label="Filter by date"
        >
          {DATE_RANGE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        {/* Sort control */}
        <SortControl
          sortValue={filters.sort || 'created'}
          orderValue={filters.order || 'desc'}
          options={SORT_OPTIONS}
          onSortChange={setSort}
          onOrderChange={setOrder}
        />
      </FilterBarRow>
    </FilterBar>
  );

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {filterBar}
        <div>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-3 mx-2 my-2 bg-gray-800 rounded-stoody-lg skeleton-item-enter"
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
        {/* Footer skeleton */}
        <div className="shrink-0 border-t border-gray-750 p-2 flex items-center text-sm">
          <div className="h-4 w-20 rounded skeleton-shimmer" />
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    const hasFilters = filters.search || filters.category !== 'all' || filters.model || filters.dateRange;
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {filterBar}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-750/50 max-w-xs empty-state-enter">
            <div className="relative w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4">
              {hasFilters ? (
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
            </div>
            <p className="text-gray-300 font-medium mb-1">
              {hasFilters ? 'No matching sessions' : 'No sessions yet'}
            </p>
            <p className="text-gray-400 text-sm mb-3">
              {hasFilters
                ? filters.search
                  ? `No sessions match "${filters.search}"`
                  : 'No sessions match the selected filters'
                : 'Start a session from an issue or PR'}
            </p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 active:scale-95 text-gray-200 rounded transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0">
        {filterBar}
        {bulkActionsBar}
        <div className="overflow-auto flex-1 min-h-0">
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
              isViewing={activeSessionId === session.session_id}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-750 p-2 flex items-center text-sm">
          <span className="text-gray-400">
            {total} sessions
          </span>
        </div>
      </div>

      {/* Bulk delete confirmation dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        title="Delete Sessions"
        message={`Are you sure you want to delete ${pluralize(selectedIds.size, 'session')}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={bulkActionLoading}
      />
    </>
  );
}
