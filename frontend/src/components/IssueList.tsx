import type { Issue, SessionSummary, Tag, IssueTagsMap, Process, CommandMetadata } from '../types';
import type { IssueFilters as IssueFiltersType } from '../hooks/useApi';
import { IssueFilters } from './IssueFilters';
import { StartSessionButton } from './StartSessionButton';
import { getContrastColor } from '../utils/colors';

/** Consistent focus ring styling for accessibility */
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900';

interface IssueListProps {
  issues: Issue[];
  selectedIssue: number | null;
  onSelectIssue: (issueNumber: number) => void;
  issueCommands: CommandMetadata[];
  onStartSession: (issue: Issue, command: CommandMetadata) => void;
  loading: boolean;
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
  // Group sessions by issue number (a session can appear under multiple issues)
  const sessionsByIssue = sessions.reduce((acc, session) => {
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

  // Filter issues by selected tag and session status
  const filteredIssues = issues.filter((issue) => {
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
        <div className="divide-y divide-gray-700">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3">
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

      {/* Empty state */}
      {!loading && issues.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs empty-state-enter">
            <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4 empty-state-icon-float">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium mb-1">No issues found</p>
            <p className="text-gray-500 text-sm">Try adjusting your filters or check the repository</p>
          </div>
        </div>
      )}

      {/* Tag filter chips */}
      {!loading && issues.length > 0 && tags.length > 0 && (
        <div className="shrink-0 p-2 border-b border-gray-700 flex flex-wrap gap-1">
          <button
            onClick={() => onSelectTag?.(null)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${focusRing} ${
              !selectedTagId
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
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
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs empty-state-enter">
            <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4 empty-state-icon-float">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium mb-1">No matching issues</p>
            <p className="text-gray-500 text-sm mb-3">
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
        <div className="flex-1 overflow-auto min-h-0 divide-y divide-gray-700">
          {filteredIssues.map((issue) => {
          const issueSessions = sessionsByIssue[issue.number.toString()] || [];
          // Check if any session is actively running
          const hasRunning = issueSessions.some(s => s.is_active);
          const hasCompleted = issueSessions.length > 0 && !hasRunning;
          const issueTags = issueTagsMap[issue.number] || [];

          return (
            <div
              key={issue.number}
              className={`p-3 cursor-pointer border-l-2 transition-all duration-150 ease-out list-item-hover ${
                selectedIssue === issue.number
                  ? 'bg-gray-800/80 border-blue-500 list-item-selected'
                  : 'border-transparent hover:bg-gray-800/60 hover:border-blue-500/50'
              }`}
              onClick={() => onSelectIssue(issue.number)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">#{issue.number}</span>
                    <h3 className="text-sm font-medium text-white truncate" title={issue.title}>
                      {issue.title}
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
                        title={`${issueSessions.length} completed session${issueSessions.length !== 1 ? 's' : ''}`}
                        aria-label={`${issueSessions.length} completed session${issueSessions.length !== 1 ? 's' : ''}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {issueSessions.length}
                      </span>
                    )}
                  </div>
                  {(issue.labels.length > 0 || issueTags.length > 0) && (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {issue.labels.map((label) => (
                        <span
                          key={label}
                          className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300"
                        >
                          {label}
                        </span>
                      ))}
                      {issueTags.map((tag) => {
                        const bgColor = tag.color || '#374151';
                        return (
                          <span
                            key={tag.id}
                            className="px-2 py-0.5 text-xs rounded-full"
                            style={{ backgroundColor: bgColor, color: getContrastColor(bgColor) }}
                          >
                            {tag.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    by {issue.author} · {issue.comments_count} comments
                    {issueSessions.length > 0 && (
                      <span className="text-purple-400"> · {issueSessions.length} session{issueSessions.length !== 1 ? 's' : ''}</span>
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
          })}
        </div>
      )}

      {/* Pagination - always visible to prevent layout shift */}
      <div className="shrink-0 border-t border-gray-700 p-2 flex items-center justify-between text-sm">
        {loading ? (
          <>
            <div className="h-4 w-16 rounded skeleton-shimmer" />
            <div className="flex items-center gap-1">
              <div className="h-7 w-8 rounded skeleton-shimmer" />
              <div className="h-4 w-12 rounded mx-1 skeleton-shimmer" />
              <div className="h-7 w-8 rounded skeleton-shimmer" />
            </div>
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className={`px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 transition-all ${focusRing} flex items-center gap-1`}
                aria-label="Go to previous page"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Prev</span>
              </button>
              <span className="px-2 text-gray-300 tabular-nums">
                {page} / {totalPages || 1}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className={`px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 transition-all ${focusRing} flex items-center gap-1`}
                aria-label="Go to next page"
              >
                <span>Next</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
