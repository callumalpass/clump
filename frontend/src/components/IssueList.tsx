import type { Issue, SessionSummary, Tag, IssueTagsMap, Process, CommandMetadata } from '../types';
import type { IssueFilters as IssueFiltersType } from '../hooks/useApi';
import { IssueFilters } from './IssueFilters';
import { StartSessionButton } from './StartSessionButton';
import { getContrastColor } from '../utils/colors';

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

  // Filter issues by selected tag
  const filteredIssues = selectedTagId
    ? issues.filter((issue) => {
        const issueTags = issueTagsMap[issue.number] || [];
        return issueTags.some((t) => t.id === selectedTagId);
      })
    : issues;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Issue filters */}
      {onFiltersChange && (
        <IssueFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          issues={issues}
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
            <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4">
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
            className={`px-2 py-0.5 text-xs rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-900 ${
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
                className={`px-2 py-0.5 text-xs rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-900 ${
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

      {/* Issue list */}
      {!loading && issues.length > 0 && (
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
              className={`p-3 cursor-pointer border-l-2 transition-all duration-150 ${
                selectedIssue === issue.number
                  ? 'bg-gray-800/80 border-blue-500'
                  : 'border-transparent hover:bg-gray-800/60 hover:border-blue-500/50'
              }`}
              onClick={() => onSelectIssue(issue.number)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">#{issue.number}</span>
                    <h3 className="text-sm font-medium text-white truncate">
                      {issue.title}
                    </h3>
                    {hasRunning && (
                      <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse shrink-0" title="Session running" />
                    )}
                    {!hasRunning && hasCompleted && (
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title={`${issueSessions.length} session(s)`} />
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
                  className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
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
                className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-900"
                title="Previous page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="px-2 text-gray-300 tabular-nums">
                {page} / {totalPages || 1}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-900"
                title="Next page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
