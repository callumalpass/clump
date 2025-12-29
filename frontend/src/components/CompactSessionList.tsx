import type { SessionSummary } from '../types';
import { ElapsedTimer } from './ElapsedTimer';
import { formatRelativeTime } from '../utils/time';

// Check if a session was modified recently (within last 10 minutes)
function isRecentlyModified(modifiedAt: string): boolean {
  const modified = new Date(modifiedAt);
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  return modified > tenMinutesAgo;
}

interface CompactSessionListProps {
  sessions: SessionSummary[];
  onSelectSession: (session: SessionSummary) => void;
  onContinueSession?: (session: SessionSummary) => void;
  onKillSession?: (session: SessionSummary) => void;
  onViewAll?: () => void;
  maxItems?: number;
}

export function CompactSessionList({
  sessions,
  onSelectSession,
  onContinueSession,
  onKillSession,
  onViewAll,
  maxItems = 5,
}: CompactSessionListProps) {
  // Filter to active + recently modified, limit to maxItems
  const prominentSessions = sessions
    .filter((s) => s.is_active || isRecentlyModified(s.modified_at))
    .slice(0, maxItems);

  const hasMore = sessions.filter((s) => s.is_active || isRecentlyModified(s.modified_at)).length > maxItems;
  const activeCount = sessions.filter((s) => s.is_active).length;

  const handleContinue = (e: React.MouseEvent, session: SessionSummary) => {
    e.stopPropagation();
    onContinueSession?.(session);
  };

  const handleKill = (e: React.MouseEvent, session: SessionSummary) => {
    e.stopPropagation();
    onKillSession?.(session);
  };

  if (prominentSessions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-gray-750/50">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sessions</h3>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-5 empty-state-enter">
          <div className="w-12 h-12 rounded-stoody bg-gray-800 flex items-center justify-center mb-3 empty-state-icon-float shadow-stoody-sm">
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-sm text-gray-400 font-medium mb-1">No active sessions</p>
          <p className="text-xs text-gray-500">Start one from an issue or PR</p>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-pink-400 hover:bg-gray-800/50 border-t border-gray-750/50 transition-colors text-center"
          >
            View history
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-750/50">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            Sessions
            {activeCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-stoody-sm bg-warning-500/20 text-warning-500">
                <span className="w-1.5 h-1.5 rounded-full bg-warning-500 animate-pulse" />
                {activeCount} active
              </span>
            )}
          </h3>
        </div>
      </div>

      {/* Session list - Stoody card style */}
      <div className="flex-1 overflow-auto min-h-0 p-2 space-y-2">
        {prominentSessions.map((session, index) => (
          <div
            key={session.session_id}
            role="button"
            tabIndex={0}
            className={`group flex items-center gap-3 px-4 py-3 cursor-pointer rounded-stoody-lg transition-all duration-150 list-item-enter shadow-stoody-sm bg-gray-800 hover:bg-gray-850`}
            style={{ '--item-index': index } as React.CSSProperties}
            onClick={() => onSelectSession(session)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectSession(session);
              }
            }}
          >
            {/* Status dot */}
            <span
              className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${
                session.is_active ? 'bg-warning-500 animate-pulse' : 'bg-blurple-400'
              }`}
            />

            {/* Title - truncated */}
            <span className="flex-1 text-sm text-white truncate group-hover:text-pink-400 transition-colors" title={session.title || 'Untitled session'}>
              {session.title || 'Untitled session'}
            </span>

            {/* Duration for active sessions, relative time for inactive */}
            {session.is_active && session.start_time ? (
              <span className="text-xs text-warning-500/80 tabular-nums flex-shrink-0 font-medium">
                <ElapsedTimer startTime={session.start_time} />
              </span>
            ) : session.modified_at && (
              <span
                className="text-xs text-gray-500 flex-shrink-0"
                title={new Date(session.modified_at).toLocaleString()}
              >
                {formatRelativeTime(session.modified_at)}
              </span>
            )}

            {/* Stop button for active sessions */}
            {session.is_active && onKillSession && (
              <button
                onClick={(e) => handleKill(e, session)}
                className="flex-shrink-0 px-2.5 py-1 text-xs text-danger-400 bg-danger-500/20 hover:bg-danger-500 hover:text-white active:scale-95 rounded-stoody-sm flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-danger-400"
                title="Stop this session"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Stop
              </button>
            )}

            {/* Continue button for non-active */}
            {!session.is_active && onContinueSession && (
              <button
                onClick={(e) => handleContinue(e, session)}
                className="flex-shrink-0 px-2.5 py-1 text-xs text-blurple-400 bg-blurple-500/20 hover:bg-blurple-500 hover:text-pink-400 active:scale-95 rounded-stoody-sm flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-blurple-400"
                title="Continue this session"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                Continue
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Footer with View All */}
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="px-4 py-2.5 text-sm text-gray-400 hover:text-pink-400 hover:bg-gray-800/50 border-t border-gray-750/50 transition-colors text-center flex items-center justify-center gap-1.5"
        >
          {hasMore ? 'View all sessions' : 'View history'}
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
