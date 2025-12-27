import type { PR, SessionSummary, Process } from '../types';
import type { PRSessionTypeConfig } from '../constants/prSessionTypes';
import { Markdown } from './Markdown';
import { PRStartSessionButton } from './PRStartSessionButton';

interface PRDetailProps {
  pr: PR;
  onStartSession: (sessionType: PRSessionTypeConfig) => void;
  sessions?: SessionSummary[];
  processes?: Process[];
  onSelectSession?: (session: SessionSummary) => void;
}

export function PRDetail({
  pr,
  onStartSession,
  sessions = [],
  processes = [],
  onSelectSession,
}: PRDetailProps) {
  // Filter sessions that have this PR linked
  const prSessions = sessions.filter(
    s => s.entities?.some(e => e.kind === 'pr' && e.number === pr.number)
  ).sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

  return (
    <div className="p-4 overflow-auto h-full">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-white">
            #{pr.number} {pr.title}
          </h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              pr.state === 'open' ? 'bg-green-900 text-green-300' :
              pr.state === 'merged' ? 'bg-purple-900 text-purple-300' :
              'bg-red-900 text-red-300'
            }`}>
              {pr.state}
            </span>
            {pr.labels.map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300"
              >
                {label}
              </span>
            ))}
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              View on GitHub →
            </a>
          </div>

          {/* Branch info */}
          <div className="flex items-center gap-2 mt-3 text-sm">
            <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono" title={pr.head_ref}>
              {pr.head_ref}
            </span>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono" title={pr.base_ref}>
              {pr.base_ref}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-gray-400 mt-3">
            <span className="text-green-500">+{pr.additions}</span>
            <span className="text-red-500">-{pr.deletions}</span>
            <span>{pr.changed_files} file{pr.changed_files !== 1 ? 's' : ''} changed</span>
          </div>
        </div>
        <PRStartSessionButton
          pr={pr}
          onStart={(_, type) => onStartSession(type)}
          size="md"
          className="shrink-0"
        />
      </div>

      {/* PR description */}
      <div className="mb-6">
        <div className="text-sm text-gray-400 mb-2">
          Opened by <span className="text-gray-300">{pr.author}</span> on {new Date(pr.created_at).toLocaleDateString()}
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          {pr.body ? (
            <Markdown>{pr.body}</Markdown>
          ) : (
            <p className="text-gray-400 italic">No description provided.</p>
          )}
        </div>
      </div>

      {/* Related Sessions */}
      {prSessions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white mb-3">
            Sessions ({prSessions.length})
          </h3>
          <div className="space-y-2">
            {prSessions.map((session) => {
              // Check if this session has an actually running process
              const activeProcess = session.is_active
                ? processes.find(p => p.claude_session_id === session.session_id)
                : null;
              const isActuallyRunning = !!activeProcess;

              return (
                <div
                  key={session.session_id}
                  onClick={() => onSelectSession?.(session)}
                  className="group bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 p-3 cursor-pointer hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        isActuallyRunning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
                      }`} />
                      <span className="text-sm font-medium text-white truncate">
                        {session.title || 'Untitled session'}
                      </span>
                      {/* Arrow to indicate opens in panel */}
                      <svg
                        className="w-4 h-4 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        {new Date(session.modified_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {isActuallyRunning && (
                    <p className="text-xs text-yellow-400 mt-2">Process running - click to view</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
