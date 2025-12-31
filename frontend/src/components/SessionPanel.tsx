import { SessionTabs } from './SessionTabs';
import { SessionView } from './SessionView';
import { Terminal } from './Terminal';
import { TypewriterText } from './EmptyState';
import type { SessionSummary, Process, Issue, PR } from '../types';
import type { NotificationDetails } from '../hooks/useNotifications';

type ViewMode = 'transcript' | 'terminal';

interface SessionPanelProps {
  // Session state
  openSessions: SessionSummary[];
  processes: Process[];
  activeTabSessionId: string | null;
  activeProcessId: string | null;
  viewingSessionId: string | null;

  // View mode state
  sessionViewModes: Record<string, ViewMode>;

  // Session actions
  onSelectSessionTab: (sessionId: string) => void;
  onCloseSessionTab: (sessionId: string) => void;
  onNewSession: () => void;
  onContinueSession: (session: SessionSummary, prompt?: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onUpdateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  onCloseViewingSession: () => void;
  onSetViewMode: (sessionId: string, mode: ViewMode) => void;

  // Process actions
  onKillProcess: (processId: string) => Promise<void>;
  onKillSession: (sessionId: string) => Promise<void>;
  onClearActiveProcess: () => void;

  // Navigation
  onShowIssue?: (issueNumber: number) => void;
  onShowPR?: (prNumber: number) => void;
  onShowSchedule?: (scheduleId: number) => void;

  // Data for SessionView
  issues?: Issue[];
  prs?: PR[];
  onEntitiesChange?: () => void;

  // Attention state
  needsAttention?: (sessionId: string) => boolean;
  getNotificationDetails?: (sessionId: string) => NotificationDetails | undefined;

  // Whether new session button should be disabled
  newSessionDisabled?: boolean;

  // Variant for different empty states
  emptyStateVariant?: 'default' | 'schedule' | 'select-session';
}

function EmptyState({ variant }: { variant: 'default' | 'schedule' | 'select-session' }) {
  if (variant === 'schedule') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm"><TypewriterText text="No active session" charDelay={40} /></p>
        <p className="text-xs text-gray-600 mt-1">Select a session tab above</p>
      </div>
    );
  }

  if (variant === 'select-session') {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs empty-state-enter">
          <div className="w-12 h-12 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4 empty-state-icon-float">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-gray-300 font-medium mb-1"><TypewriterText text="Select a session" charDelay={45} /></p>
          <p className="text-gray-400 text-sm">Click a tab above to view the conversation</p>
        </div>
      </div>
    );
  }

  // Default empty state
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center p-8 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-sm empty-state-enter">
        <div className="w-16 h-16 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-5 empty-state-icon-float">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
        </div>
        <p className="text-gray-300 font-medium mb-2"><TypewriterText text="Select an issue or PR to view details" charDelay={35} /></p>
        <p className="text-gray-400 text-sm">or start a session from an issue or PR</p>
      </div>
    </div>
  );
}

/**
 * SessionPanel combines SessionTabs with SessionView/Terminal/EmptyState.
 * This is the reusable session area used in all side-by-side layouts.
 */
export function SessionPanel({
  openSessions,
  processes,
  activeTabSessionId,
  activeProcessId,
  viewingSessionId,
  sessionViewModes,
  onSelectSessionTab,
  onCloseSessionTab,
  onNewSession,
  onContinueSession,
  onDeleteSession,
  onUpdateSessionTitle,
  onCloseViewingSession,
  onSetViewMode,
  onKillProcess,
  onKillSession,
  onClearActiveProcess,
  onShowIssue,
  onShowPR,
  onShowSchedule,
  issues,
  prs,
  onEntitiesChange,
  needsAttention,
  getNotificationDetails,
  newSessionDisabled,
  emptyStateVariant = 'select-session',
}: SessionPanelProps) {
  // Find the active session (from tabs)
  const activeSession = activeTabSessionId
    ? openSessions.find(s => s.session_id === activeTabSessionId)
    : null;

  // Find the viewing session (from history list)
  const viewingSession = viewingSessionId
    ? openSessions.find(s => s.session_id === viewingSessionId)
    : null;

  // Find the process associated with the viewing session
  const viewingSessionProcess = viewingSession
    ? processes.find(p => p.claude_session_id === viewingSession.session_id)
    : null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {openSessions.length > 0 && (
        <SessionTabs
          sessions={openSessions}
          processes={processes}
          activeSessionId={activeTabSessionId}
          onSelectSession={onSelectSessionTab}
          onCloseSession={onCloseSessionTab}
          onNewSession={onNewSession}
          needsAttention={needsAttention}
          getNotificationDetails={getNotificationDetails}
          newSessionDisabled={newSessionDisabled}
        />
      )}
      <div className="flex-1 min-h-0 p-2">
        {activeProcessId && activeSession ? (
          <SessionView
            session={activeSession}
            processId={activeProcessId}
            onClose={async () => {
              // Use killSession to handle both PTY and headless sessions
              await onKillSession(activeSession.session_id);
              onClearActiveProcess();
            }}
            onKillSession={async () => {
              await onKillSession(activeSession.session_id);
              onClearActiveProcess();
            }}
            onShowIssue={onShowIssue}
            onShowPR={onShowPR}
            onShowSchedule={onShowSchedule}
            issues={issues}
            prs={prs}
            onEntitiesChange={onEntitiesChange}
            viewMode={sessionViewModes[activeSession.session_id]}
            onViewModeChange={(mode) => onSetViewMode(activeSession.session_id, mode)}
            needsAttention={needsAttention}
          />
        ) : activeProcessId ? (
          // Fallback to terminal-only if no session found yet (orphan process)
          <Terminal
            processId={activeProcessId}
            onClose={async () => {
              await onKillProcess(activeProcessId);
              onClearActiveProcess();
            }}
          />
        ) : viewingSession ? (
          <SessionView
            session={viewingSession}
            processId={viewingSessionProcess?.id}
            onContinue={(prompt) => onContinueSession(viewingSession, prompt)}
            onClose={onCloseViewingSession}
            onDelete={async () => {
              await onDeleteSession(viewingSession.session_id);
              onCloseViewingSession();
            }}
            onKillSession={async () => {
              await onKillSession(viewingSession.session_id);
              onCloseViewingSession();
            }}
            onTitleChange={async (title) => {
              await onUpdateSessionTitle(viewingSession.session_id, title);
            }}
            onShowIssue={onShowIssue}
            onShowPR={onShowPR}
            onShowSchedule={onShowSchedule}
            issues={issues}
            prs={prs}
            onEntitiesChange={onEntitiesChange}
            viewMode={sessionViewModes[viewingSession.session_id]}
            onViewModeChange={(mode) => onSetViewMode(viewingSession.session_id, mode)}
            needsAttention={needsAttention}
          />
        ) : (
          <EmptyState variant={emptyStateVariant} />
        )}
      </div>
    </div>
  );
}
