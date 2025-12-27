import type { Session, Analysis } from '../types';
import { ElapsedTimer } from './ElapsedTimer';

/** Maximum length of a tab title before truncation */
const MAX_TAB_TITLE_LENGTH = 30;
/** Suffix appended to truncated titles */
const TRUNCATION_SUFFIX = '...';

interface SessionTabsProps {
  sessions: Session[];
  activeSession: string | null;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onNewSession: () => void;
  analyses?: Analysis[];
}

function getTabName(session: Session, analyses: Analysis[]): string {
  // Find analysis linked to this session
  const analysis = analyses.find(
    (a) => a.id === session.analysis_id || a.session_id === session.id
  );

  if (analysis) {
    const title = analysis.title;
    if (title.length > MAX_TAB_TITLE_LENGTH) {
      const truncateAt = MAX_TAB_TITLE_LENGTH - TRUNCATION_SUFFIX.length;
      return title.slice(0, truncateAt) + TRUNCATION_SUFFIX;
    }
    return title;
  }

  return 'New Session';
}

export function SessionTabs({
  sessions,
  activeSession,
  onSelectSession,
  onCloseSession,
  onNewSession,
  analyses = [],
}: SessionTabsProps) {
  return (
    <div className="flex items-center gap-1 bg-[#161b22] border-b border-gray-700 px-2 overflow-x-auto">
      {sessions.map((session) => {
        const tabName = getTabName(session, analyses);
        const analysis = analyses.find(
          (a) => a.id === session.analysis_id || a.session_id === session.id
        );
        const fullTitle = analysis?.title || 'New Session';

        return (
          <button
            key={session.id}
            className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
              activeSession === session.id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            onClick={() => onSelectSession(session.id)}
            title={fullTitle}
          >
            <span className="text-sm whitespace-nowrap max-w-[180px] truncate">
              {tabName}
            </span>
            <ElapsedTimer startTime={session.created_at} className="text-xs text-gray-500 tabular-nums" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(session.id);
              }}
              className="ml-1 p-0.5 rounded text-gray-500 opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-red-400/50 transition-opacity duration-150"
              title="Close session"
              aria-label={`Close ${fullTitle}`}
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
