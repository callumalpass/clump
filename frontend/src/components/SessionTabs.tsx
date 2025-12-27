import type { Session } from '../types';

interface SessionTabsProps {
  sessions: Session[];
  activeSession: string | null;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onNewSession: () => void;
}

export function SessionTabs({
  sessions,
  activeSession,
  onSelectSession,
  onCloseSession,
  onNewSession,
}: SessionTabsProps) {
  return (
    <div className="flex items-center gap-1 bg-[#161b22] border-b border-gray-700 px-2 overflow-x-auto">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`group flex items-center gap-2 px-3 py-2 cursor-pointer border-b-2 transition-colors ${
            activeSession === session.id
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
          onClick={() => onSelectSession(session.id)}
        >
          <span className="text-sm whitespace-nowrap">
            {session.id}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCloseSession(session.id);
            }}
            className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={onNewSession}
        className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        title="New session"
      >
        +
      </button>
    </div>
  );
}
