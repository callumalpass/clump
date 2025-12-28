import type { SessionSummary } from '../types';
import { ElapsedTimer } from './ElapsedTimer';

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
  onViewAll?: () => void;
  maxItems?: number;
}

export function CompactSessionList({
  sessions,
  onSelectSession,
  onContinueSession,
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

  if (prominentSessions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-gray-700/50">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sessions</h3>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4 empty-state-enter">
          <div className="w-10 h-10 rounded-full bg-gray-700/40 flex items-center justify-center mb-2 empty-state-icon-float">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-xs text-gray-400 font-medium mb-0.5">No active sessions</p>
          <p className="text-[10px] text-gray-500">Start one from an issue or PR</p>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 border-t border-gray-700/50 transition-colors text-center"
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
      <div className="px-3 py-2 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            Sessions
            {activeCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/20 text-yellow-400">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                {activeCount} active
              </span>
            )}
          </h3>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-auto min-h-0">
        {prominentSessions.map((session, index) => (
          <div
            key={session.session_id}
            className={`group flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 hover:bg-gray-800/60 transition-all duration-150 list-item-enter ${
              session.is_active
                ? 'border-yellow-500/70 hover:border-yellow-400 bg-yellow-500/5'
                : 'border-blue-500/60 hover:border-blue-400'
            }`}
            style={{ '--item-index': index } as React.CSSProperties}
            onClick={() => onSelectSession(session)}
          >
            {/* Status dot */}
            <span
              className={`flex-shrink-0 w-2 h-2 rounded-full ${
                session.is_active ? 'bg-yellow-500 animate-pulse' : 'bg-blue-500'
              }`}
            />

            {/* Title - truncated */}
            <span className="flex-1 text-sm text-white truncate" title={session.title || 'Untitled session'}>
              {session.title || 'Untitled session'}
            </span>

            {/* Duration for active sessions */}
            {session.is_active && session.start_time && (
              <span className="text-[10px] text-yellow-500/70 tabular-nums flex-shrink-0">
                <ElapsedTimer startTime={session.start_time} />
              </span>
            )}

            {/* Continue button for non-active */}
            {!session.is_active && onContinueSession && (
              <button
                onClick={(e) => handleContinue(e, session)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-700 active:scale-95 rounded transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                title="Continue this session"
              >
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
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 border-t border-gray-700/50 transition-colors text-center flex items-center justify-center gap-1"
        >
          {hasMore ? 'View all sessions' : 'View history'}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
