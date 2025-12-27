import type { SessionSummary, Process } from '../types';
import { calculateDuration } from '../hooks/useElapsedTime';
import { ElapsedTimer } from './ElapsedTimer';

export type SessionFilter = 'all' | 'active' | 'starred' | 'with-entities';

interface SessionListProps {
  sessions: SessionSummary[];
  processes?: Process[];
  onSelectSession: (session: SessionSummary) => void;
  onContinueSession?: (session: SessionSummary) => void;
  onToggleStar?: (session: SessionSummary) => void;
  onRefresh?: () => void;
  loading: boolean;
  filter: SessionFilter;
  onFilterChange: (filter: SessionFilter) => void;
  total: number;
}

const FILTERS: { value: SessionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'starred', label: 'Starred' },
  { value: 'with-entities', label: 'Linked' },
];

export function SessionList({
  sessions,
  processes: _processes = [],
  onSelectSession,
  onContinueSession,
  onToggleStar,
  onRefresh,
  loading,
  filter,
  onFilterChange,
  total
}: SessionListProps) {
  const filterTabs = (
    <div className="flex gap-1 p-2 border-b border-gray-700 bg-gray-800/30">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onFilterChange(f.value)}
          className={`toggle-btn px-2.5 py-1 text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            filter === f.value
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          {f.label}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-xs text-gray-500">
          {total} session{total !== 1 ? 's' : ''}
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Refresh sessions"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col flex-1">
        {filterTabs}
        <div className="divide-y divide-gray-700">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3">
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
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col flex-1">
        {filterTabs}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs empty-state-enter">
            <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium mb-1">
              {filter === 'all' ? 'No Claude sessions found' : `No ${filter} sessions`}
            </p>
            <p className="text-gray-500 text-sm">
              {filter === 'all'
                ? 'Sessions from Claude Code will appear here'
                : 'Try selecting a different filter'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleContinue = (e: React.MouseEvent, session: SessionSummary) => {
    e.stopPropagation();
    onContinueSession?.(session);
  };

  const handleToggleStar = (e: React.MouseEvent, session: SessionSummary) => {
    e.stopPropagation();
    onToggleStar?.(session);
  };

  // Format repo path for display - show last 2-3 segments
  const formatRepoPath = (session: SessionSummary) => {
    if (session.repo_name) return session.repo_name;
    const segments = session.repo_path.split('/').filter(Boolean);
    return segments.slice(-2).join('/');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {filterTabs}
      <div className="divide-y divide-gray-700 overflow-auto flex-1 min-h-0">
        {sessions.map((session) => (
          <div
            key={session.session_id}
            className="group p-3 cursor-pointer border-l-2 border-transparent hover:bg-gray-800/60 hover:border-blue-500/50 transition-all duration-150 list-item-hover"
            onClick={() => onSelectSession(session)}
          >
            <div className="flex items-center gap-2 mb-1">
              {/* Status indicator with text label for accessibility */}
              {session.is_active ? (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/20 text-yellow-400 flex-shrink-0"
                  title="Session is actively running"
                  aria-label="Active session"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                  Active
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-500/20 text-green-400 flex-shrink-0"
                  title="Session completed"
                  aria-label="Completed session"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Done
                </span>
              )}

              {/* Title */}
              <span className="text-sm font-medium text-white truncate flex-1">
                {session.title || 'Untitled session'}
              </span>

              {/* Star button */}
              {onToggleStar && (
                <button
                  onClick={(e) => handleToggleStar(e, session)}
                  className={`flex-shrink-0 p-1 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-yellow-400 ${
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
              {!session.is_active && onContinueSession && (
                <button
                  onClick={(e) => handleContinue(e, session)}
                  className="flex-shrink-0 px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  title="Continue this conversation"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Continue
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              {/* Repo path */}
              <span className="px-1.5 py-0.5 bg-gray-700 rounded truncate max-w-[120px]" title={session.repo_path}>
                {formatRepoPath(session)}
              </span>

              {/* Entity links */}
              {session.entities?.map((entity, idx) => (
                <span
                  key={idx}
                  className={`px-1 py-0.5 rounded ${
                    entity.kind === 'issue'
                      ? 'bg-green-900/30 text-green-400'
                      : 'bg-purple-900/30 text-purple-400'
                  }`}
                >
                  #{entity.number}
                </span>
              ))}

              {/* Model */}
              {session.model && (
                <span className="text-gray-600">
                  {session.model.includes('opus') ? 'opus' : session.model.includes('haiku') ? 'haiku' : 'sonnet'}
                </span>
              )}

              {/* Message count */}
              <span className="text-gray-600">
                {session.message_count} msg{session.message_count !== 1 ? 's' : ''}
              </span>

              {/* Duration */}
              {session.is_active && session.start_time ? (
                <span className="text-yellow-500" title="Time elapsed">
                  <ElapsedTimer startTime={session.start_time} />
                </span>
              ) : session.start_time && session.end_time ? (
                <span className="text-gray-600" title="Total duration">
                  {calculateDuration(session.start_time, session.end_time)}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
