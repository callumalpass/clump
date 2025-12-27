import type { SessionSummary, Process } from '../types';
import { ElapsedTimer } from './ElapsedTimer';

/** Maximum length of a tab title before truncation */
const MAX_TAB_TITLE_LENGTH = 30;
/** Suffix appended to truncated titles */
const TRUNCATION_SUFFIX = '...';

interface SessionTabsProps {
  /** Sessions to show as tabs */
  sessions: SessionSummary[];
  /** Currently running processes (to determine if session is live) */
  processes: Process[];
  /** Currently active/selected session ID */
  activeSessionId: string | null;
  /** Callback when a session tab is clicked */
  onSelectSession: (sessionId: string) => void;
  /** Callback when a session tab is closed */
  onCloseSession: (sessionId: string) => void;
  /** Callback to create a new session */
  onNewSession: () => void;
}

function getTabName(session: SessionSummary): string {
  const title = session.title || 'Untitled';
  if (title.length > MAX_TAB_TITLE_LENGTH) {
    const truncateAt = MAX_TAB_TITLE_LENGTH - TRUNCATION_SUFFIX.length;
    return title.slice(0, truncateAt) + TRUNCATION_SUFFIX;
  }
  return title;
}

export function SessionTabs({
  sessions,
  processes,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onNewSession,
}: SessionTabsProps) {
  return (
    <div className="flex items-center gap-1 bg-[#161b22] border-b border-gray-700 px-2 overflow-x-auto">
      {sessions.map((session) => {
        const tabName = getTabName(session);
        // Check if this session has an active process
        const activeProcess = session.is_active
          ? processes.find(p => p.claude_session_id === session.session_id)
          : null;
        const isRunning = !!activeProcess;

        return (
          <button
            key={session.session_id}
            className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
              activeSessionId === session.session_id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            onClick={() => onSelectSession(session.session_id)}
            title={session.title || 'Untitled'}
          >
            {/* Status indicator */}
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              isRunning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
            }`} />
            <span className="text-sm whitespace-nowrap max-w-[180px] truncate">
              {tabName}
            </span>
            {/* Show elapsed time for running sessions */}
            {isRunning && activeProcess && (
              <ElapsedTimer startTime={activeProcess.created_at} className="text-xs text-gray-500 tabular-nums" />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(session.session_id);
              }}
              className="ml-1 p-0.5 rounded text-gray-500 opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-red-400/50 transition-opacity duration-150"
              title="Close tab"
              aria-label={`Close ${session.title || 'session'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </button>
        );
      })}
      <button
        onClick={onNewSession}
        className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        title="New session"
        aria-label="Create new session"
      >
        +
      </button>
    </div>
  );
}
