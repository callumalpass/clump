import { useMemo, memo } from 'react';
import type { Issue, SessionSummary, Tag, IssueTagsMap, Process, CommandMetadata } from '../types';
import type { IssueFilters as IssueFiltersType } from '../hooks/useApi';
import { useSessionStatus } from '../hooks/useSessionStatus';
import { IssueFilters } from './IssueFilters';
import { StartSessionButton } from './StartSessionButton';
import { Pagination, PaginationSkeleton } from './Pagination';
import { getContrastColor } from '../utils/colors';
import { focusRing } from '../utils/styles';
import { pluralize } from '../utils/text';

// Memoized list item component to prevent unnecessary re-renders
interface IssueListItemProps {
  issue: Issue;
  index: number;
  isSelected: boolean;
  issueSessions: SessionSummary[];
  issueTags: Tag[];
  issueCommands: CommandMetadata[];
  onSelect: () => void;
  onStartSession: (issue: Issue, command: CommandMetadata) => void;
}

const IssueListItem = memo(function IssueListItem({
  issue,
  index,
  isSelected,
  issueSessions,
  issueTags,
  issueCommands,
  onSelect,
  onStartSession,
}: IssueListItemProps) {
  const { hasRunning, hasCompleted } = useSessionStatus(issueSessions);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group p-4 mx-2 my-2 cursor-pointer rounded-stoody-lg bg-gray-800 session-card-light hover:bg-gray-750 transition-colors duration-150 list-item-enter list-item-hover focus-visible:ring-2 focus-visible:ring-blurple-400 focus-visible:ring-inset ${
        isSelected ? 'ring-2 ring-inset ring-blurple-500/50 bg-blurple-500/10' : ''
      }`}
      style={{ '--item-index': Math.min(index, 15) } as React.CSSProperties}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={isSelected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Hover arrow indicator */}
            <svg className="w-3.5 h-3.5 text-blurple-400 list-item-hover-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-400 text-sm">#{issue.number}</span>
            <h3 className="text-sm font-medium text-white truncate group-hover:text-pink-400 transition-colors" title={issue.title}>
              {issue.title}
            </h3>
            {hasRunning && (
              <span
                className="status-badge status-badge-enter inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-stoody-lg bg-warning-500/20 text-warning-500 shrink-0"
                title="Session actively running"
                aria-label="Active session"
              >
                <span className="status-dot w-2 h-2 rounded-full bg-warning-500 animate-pulse" />
                Running
              </span>
            )}
            {!hasRunning && hasCompleted && (
              <span
                className="status-badge status-badge-enter inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-stoody-lg bg-mint-400/20 text-mint-400 shrink-0"
                title={pluralize(issueSessions.length, 'completed session')}
                aria-label={pluralize(issueSessions.length, 'completed session')}
              >
                <span className="status-dot w-2 h-2 rounded-full bg-mint-400" />
                {issueSessions.length}
              </span>
            )}
          </div>
          {(issue.labels.length > 0 || issueTags.length > 0) && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {issue.labels.map((label) => (
                <span
                  key={label}
                  className="px-2.5 py-1 text-xs rounded-stoody-lg bg-gray-750 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  {label}
                </span>
              ))}
              {issueTags.map((tag) => {
                const bgColor = tag.color || '#374151';
                return (
                  <span
                    key={tag.id}
                    className="px-2.5 py-1 text-xs rounded-stoody-lg"
                    style={{ backgroundColor: bgColor, color: getContrastColor(bgColor) }}
                  >
                    {tag.name}
                  </span>
                );
              })}
            </div>
          )}
          <div className="list-item-metadata text-xs text-gray-400 mt-2">
            by {issue.author} · {issue.comments_count} comments
            {issueSessions.length > 0 && (
              <span className="text-blurple-400"> · {pluralize(issueSessions.length, 'session')}</span>
            )}
          </div>
        </div>
        <StartSessionButton
          issue={issue}
          commands={issueCommands}
          onStart={(_, command) => {
            onStartSession(issue, command);
          }}
          size="sm"
          className="shrink-0"
        />
      </div>
    </div>
  );
});

interface IssueListProps {
  issues: Issue[];
  selectedIssue: number | null;
  onSelectIssue: (issueNumber: number) => void;
  issueCommands: CommandMetadata[];
  onStartSession: (issue: Issue, command: CommandMetadata) => void;
  loading: boolean;
  error?: string | null;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  sessions?: SessionSummary[];
  processes?: Process[];
  tags?: Tag[];
  issueTagsMap?: IssueTagsMap;
  selectedTagId?: number | null;
  onSelectTag?: (tagId: number | null) => void;
  filters?: IssueFiltersType;
  onFiltersChange?: (filters: IssueFiltersType) => void;
  onCreateIssue?: () => void;
  onRefresh?: () => void;
}

export function IssueList({
  issues,
  selectedIssue,
  onSelectIssue,
  issueCommands,
  onStartSession,
  loading,
  error,
  page,
  totalPages,
  total,
  onPageChange,
  sessions = [],
  processes: _processes = [],
  tags = [],
  issueTagsMap = {},
  selectedTagId,
  onSelectTag,
  filters = {},
  onFiltersChange,
  onCreateIssue,
  onRefresh,
}: IssueListProps) {
  // Memoize session grouping to avoid recalculation on every render
  const sessionsByIssue = useMemo(() => {
    return sessions.reduce((acc, session) => {
      const issueEntities = session.entities?.filter(e => e.kind === 'issue') || [];
      for (const entity of issueEntities) {
        const issueNum = entity.number.toString();
        if (!acc[issueNum]) acc[issueNum] = [];
        if (!acc[issueNum].includes(session)) {
          acc[issueNum].push(session);
        }
      }
      return acc;
    }, {} as Record<string, SessionSummary[]>);
  }, [sessions]);

  // Memoize filtered issues to avoid recalculation on every render
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // Filter by tag
      if (selectedTagId) {
        const issueTags = issueTagsMap[issue.number] || [];
        if (!issueTags.some((t) => t.id === selectedTagId)) {
          return false;
        }
      }
      // Filter by session status
      if (filters.sessionStatus) {
        const hasSessions = (sessionsByIssue[issue.number.toString()] || []).length > 0;
        if (filters.sessionStatus === 'analyzed' && !hasSessions) return false;
        if (filters.sessionStatus === 'unanalyzed' && hasSessions) return false;
      }
      return true;
    });
  }, [issues, selectedTagId, issueTagsMap, filters.sessionStatus, sessionsByIssue]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Issue filters */}
      {onFiltersChange && (
        <IssueFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          issues={issues}
          total={total}
          onRefresh={onRefresh}
          loading={loading}
        />
      )}

      {/* Loading state - show skeleton items with shimmer effect */}
      {loading && (
        <div className="flex flex-col">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-3 skeleton-item-enter"
              style={{ '--item-index': i } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-8 rounded skeleton-shimmer" />
                    <div className="h-4 w-48 rounded skeleton-shimmer" />
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="h-5 w-16 rounded-full skeleton-shimmer" />
                    <div className="h-5 w-12 rounded-full skeleton-shimmer" />
                  </div>
                  <div className="h-3 w-32 rounded mt-2 skeleton-shimmer" />
                </div>
                <div className="h-7 w-16 rounded shrink-0 skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state - API failure */}
      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-danger-500/10 border border-danger-500/30 max-w-sm empty-state-enter">
            <div className="w-14 h-14 rounded-full bg-danger-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-danger-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-danger-300 font-medium mb-1">Failed to load issues</p>
            <p className="text-gray-400 text-sm mb-4">{error}</p>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className={`px-4 py-2 text-xs bg-danger-500/20 hover:bg-danger-500/30 active:scale-95 text-danger-300 hover:text-danger-200 border border-danger-500/30 rounded-stoody transition-all ${focusRing}`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Try again
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state - distinguish between "no issues exist" vs "filters too restrictive" */}
      {!loading && !error && issues.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-750/50 max-w-xs empty-state-enter">
            <div className="relative w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4 empty-state-icon-float cursor-pointer">
              <span className="empty-state-tooltip">
                {(filters.state !== 'all' || filters.search || filters.sessionStatus) ? 'picky, picky!' : 'so empty...'}
              </span>
              {(filters.state !== 'all' || filters.search || filters.sessionStatus) ? (
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )}
            </div>
            {(filters.state !== 'all' || filters.search || filters.sessionStatus) ? (
              <>
                <p className="text-gray-300 font-medium mb-1">No matching issues</p>
                <p className="text-gray-400 text-sm mb-3">
                  {filters.search
                    ? `No ${filters.state === 'all' ? '' : filters.state + ' '}issues match "${filters.search}"`
                    : `No ${filters.state} issues found`}
                </p>
                <button
                  onClick={() => onFiltersChange?.({ state: 'open', search: '', sessionStatus: undefined, sort: filters.sort, order: filters.order })}
                  className={`px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 active:scale-95 text-gray-200 rounded transition-all ${focusRing}`}
                >
                  Reset filters
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-300 font-medium mb-1">No issues yet</p>
                <p className="text-gray-400 text-sm">This repository has no open issues</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tag filter chips */}
      {!loading && issues.length > 0 && tags.length > 0 && (
        <div className="shrink-0 p-2 border-b border-gray-750 flex flex-wrap gap-1">
          <button
            onClick={() => onSelectTag?.(null)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${focusRing} ${
              !selectedTagId
                ? 'bg-blurple-500 text-white filter-pill-active'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
            }`}
          >
            All
          </button>
          {tags.map((tag) => {
            const isSelected = selectedTagId === tag.id;
            const bgColor = tag.color || '#374151';
            return (
              <button
                key={tag.id}
                onClick={() => onSelectTag?.(isSelected ? null : tag.id)}
                className={`px-2 py-0.5 text-xs rounded-full transition-colors ${focusRing} ${
                  isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900' : 'hover:opacity-80'
                }`}
                style={{ backgroundColor: bgColor, color: getContrastColor(bgColor) }}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Filtered empty state - when filters/tags result in no matches */}
      {!loading && issues.length > 0 && filteredIssues.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-750/50 max-w-xs empty-state-enter">
            <div className="relative w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4 empty-state-icon-float cursor-pointer">
              <span className="empty-state-tooltip">too picky!</span>
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium mb-1">No matching issues</p>
            <p className="text-gray-400 text-sm mb-3">
              {selectedTagId && filters.sessionStatus
                ? 'No issues match the selected tag and status filter'
                : selectedTagId
                ? 'No issues have this tag'
                : 'No issues match the selected status filter'}
            </p>
            <button
              onClick={() => {
                onSelectTag?.(null);
                onFiltersChange?.({ ...filters, sessionStatus: undefined });
              }}
              className={`px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 active:scale-95 text-gray-200 rounded transition-all ${focusRing}`}
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      {/* Issue list */}
      {!loading && filteredIssues.length > 0 && (
        <div className="flex-1 overflow-auto min-h-0 flex flex-col">
          {filteredIssues.map((issue, index) => (
            <IssueListItem
              key={issue.number}
              issue={issue}
              index={index}
              isSelected={selectedIssue === issue.number}
              issueSessions={sessionsByIssue[issue.number.toString()] || []}
              issueTags={issueTagsMap[issue.number] || []}
              issueCommands={issueCommands}
              onSelect={() => onSelectIssue(issue.number)}
              onStartSession={onStartSession}
            />
          ))}
        </div>
      )}

      {/* Pagination - always visible to prevent layout shift */}
      <div className="shrink-0 border-t border-gray-750 p-2 flex items-center justify-between text-sm">
        {loading ? (
          <>
            <div className="h-4 w-16 rounded skeleton-shimmer" />
            <PaginationSkeleton />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">
                {total} issues
              </span>
              {onCreateIssue && (
                <button
                  onClick={onCreateIssue}
                  className={`px-2 py-1 text-xs bg-green-600 hover:bg-green-700 active:scale-95 text-white rounded transition-all ${focusRing}`}
                  title="Create new issue"
                >
                  + New
                </button>
              )}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
