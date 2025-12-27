import type { Session, Analysis } from '../types';

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
    // Truncate long titles
    const title = analysis.title;
    if (title.length > 30) {
      return title.slice(0, 27) + '...';
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
            className={`group flex items-center gap-2 px-3 py-2 cursor-pointer border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
              activeSession === session.id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            onClick={() => onSelectSession(session.id)}
            title={fullTitle}
          >
            <span className="text-sm whitespace-nowrap max-w-[200px] truncate">
              {tabName}
            </span>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(session.id);
              }}
              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
            >
              ×
            </span>
          </button>
        );
      })}
      <button
        onClick={onNewSession}
        className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        title="New session"
      >
        +
      </button>
    </div>
  );
}
