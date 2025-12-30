import { IssueDetail } from './IssueDetail';
import { IssueCreateView } from './IssueCreateView';
import { PRDetail } from './PRDetail';
import { ScheduleDetail } from './ScheduleDetail';
import { SessionDetail } from './SessionDetail';
import type {
  Repo,
  Issue,
  SessionSummary,
  Process,
  CommandMetadata,
  CommandsResponse,
  Tag,
  IssueMetadataMap,
  PRMetadataMap,
} from '../types';

// =============================================================================
// Types
// =============================================================================

export type Tab = 'issues' | 'prs' | 'history' | 'schedules';

export interface DetailPaneProps {
  // Repo context
  selectedRepo: Repo | null;

  // Selection state (only one should be active at a time)
  selectedIssue: number | null;
  selectedPR: number | null;
  selectedSchedule: number | null;
  selectedSession: SessionSummary | null;
  isCreatingIssue: boolean;

  // Current tab for empty state context
  activeTab: Tab;

  // Data
  sessions: SessionSummary[];
  processes: Process[];
  commands: CommandsResponse;
  tags: Tag[];
  issueTagsMap: Record<number, Tag[]>;
  issueMetadataMap: IssueMetadataMap;
  prMetadataMap: PRMetadataMap;

  // Issue actions
  onStartIssueSession: (issue: { number: number; title: string; body: string; author: string }, command: CommandMetadata) => void;
  onSelectSession: (session: SessionSummary) => void;
  onContinueSession: (session: SessionSummary, prompt?: string) => Promise<void>;
  onAddTagToIssue: (issueNumber: number, tagId: number) => void;
  onRemoveTagFromIssue: (issueNumber: number, tagId: number) => void;
  onCreateTag: (name: string, color?: string) => Promise<Tag | undefined>;

  // PR actions
  onStartPRSession: (pr: { number: number; title: string; body: string; author: string; head_ref: string; base_ref: string }, command: CommandMetadata) => void;

  // Schedule actions
  onScheduleDeleted: () => void;
  onScheduleUpdated: () => void;

  // Session actions (for SessionDetail)
  onDeleteSession: (sessionId: string) => Promise<void>;
  onUpdateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  onShowIssue: (issueNumber: number) => void;
  onShowPR: (prNumber: number) => void;
  onShowSchedule: (scheduleId: number) => void;
  onSessionClosed: () => void;

  // Issue creation
  onCancelIssueCreate: () => void;
  onIssueCreated: (issue: Issue) => void;
  onRefreshIssues: () => void;

  // Tab navigation (for empty state)
  onTabChange?: (tab: Tab) => void;
}

// =============================================================================
// Empty States
// =============================================================================

function KeyHint({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd-hint mx-0.5">{children}</kbd>;
}

function QuickNavItem({ shortcut, label, active = false, onClick }: { shortcut: string; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={active}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 ${
        active
          ? 'bg-blurple-500/20 text-blurple-400 cursor-default border border-blurple-500/30'
          : 'bg-gray-700/30 text-gray-400 hover:bg-gray-750/50 hover:text-gray-200 active:scale-[0.98] border border-transparent'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <KeyHint>{shortcut}</KeyHint>
      <span className="text-sm">{label}</span>
      {active && (
        <svg className="w-3 h-3 text-blurple-400 ml-auto" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}

function WelcomeState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 empty-state-pattern">
      <div className="text-center p-8 rounded-xl bg-gray-800/40 border border-gray-750/50 max-w-md empty-state-enter">
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blurple-500/20 to-mint-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-blurple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-200 mb-2">Welcome to Clump</h2>
        <p className="text-gray-400 text-sm mb-6">
          Manage Claude Code sessions for your GitHub repositories
        </p>
        <div className="text-left space-y-3 mb-6">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-750/30">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blurple-500/20 text-blurple-400 flex items-center justify-center text-xs font-medium">1</div>
            <div>
              <p className="text-sm text-gray-300 font-medium">Select a repository</p>
              <p className="text-xs text-gray-500">Use the dropdown in the sidebar to choose a repo</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-750/30">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blurple-500/20 text-blurple-400 flex items-center justify-center text-xs font-medium">2</div>
            <div>
              <p className="text-sm text-gray-300 font-medium">Pick an issue or PR</p>
              <p className="text-xs text-gray-500">Browse issues to start a Claude session</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-750/30">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blurple-500/20 text-blurple-400 flex items-center justify-center text-xs font-medium">3</div>
            <div>
              <p className="text-sm text-gray-300 font-medium">Start analyzing</p>
              <p className="text-xs text-gray-500">Let Claude help you understand and work on the code</p>
            </div>
          </div>
        </div>
        <div className="pt-4 border-t border-gray-750/50 flex items-center justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <KeyHint>?</KeyHint>
            <span>Keyboard shortcuts</span>
          </span>
        </div>
      </div>
    </div>
  );
}

const emptyStateContent: Record<Tab, { title: string; description: string; icon: React.ReactNode }> = {
  issues: {
    title: 'Select an issue to view details',
    description: 'or start a session to work on it',
    icon: (
      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    ),
  },
  prs: {
    title: 'Select a pull request to view details',
    description: 'or start a session to review it',
    icon: (
      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  history: {
    title: 'Select a session to view details',
    description: 'browse past sessions and their transcripts',
    icon: (
      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  schedules: {
    title: 'Automate recurring tasks',
    description: 'Create or select a schedule from the panel',
    icon: (
      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

function EmptyState({ activeTab, onTabChange }: { activeTab: Tab; onTabChange?: (tab: Tab) => void }) {
  const content = emptyStateContent[activeTab];

  return (
    <div className="flex-1 flex items-center justify-center p-8 empty-state-pattern">
      <div className="text-center p-8 rounded-xl bg-gray-800/40 border border-gray-750/50 max-w-lg empty-state-enter">
        <div className="relative w-16 h-16 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-5">
          {content.icon}
        </div>
        <h3 className="text-gray-200 font-semibold text-lg mb-2">{content.title}</h3>
        <p className="text-gray-400 text-sm mb-6">{content.description}</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          <QuickNavItem shortcut="1" label="Issues" active={activeTab === 'issues'} onClick={() => onTabChange?.('issues')} />
          <QuickNavItem shortcut="2" label="PRs" active={activeTab === 'prs'} onClick={() => onTabChange?.('prs')} />
          <QuickNavItem shortcut="3" label="History" active={activeTab === 'history'} onClick={() => onTabChange?.('history')} />
          <QuickNavItem shortcut="4" label="Schedules" active={activeTab === 'schedules'} onClick={() => onTabChange?.('schedules')} />
        </div>
        <div className="pt-4 border-t border-gray-750/50 flex items-center justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <KeyHint>⌘K</KeyHint>
            <span>Command palette</span>
          </span>
          <span className="text-gray-600">·</span>
          <span className="flex items-center gap-1.5">
            <KeyHint>?</KeyHint>
            <span>All shortcuts</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Detail Pane Component
// =============================================================================

export function DetailPane(props: DetailPaneProps) {
  const {
    selectedRepo,
    selectedIssue,
    selectedPR,
    selectedSchedule,
    selectedSession,
    isCreatingIssue,
    activeTab,
    sessions,
    processes,
    commands,
    tags,
    issueTagsMap,
    issueMetadataMap,
    prMetadataMap,
    onStartIssueSession,
    onSelectSession,
    onContinueSession,
    onAddTagToIssue,
    onRemoveTagFromIssue,
    onCreateTag,
    onStartPRSession,
    onScheduleDeleted,
    onScheduleUpdated,
    onDeleteSession,
    onUpdateSessionTitle,
    onShowIssue,
    onShowPR,
    onShowSchedule,
    onSessionClosed,
    onCancelIssueCreate,
    onIssueCreated,
    onRefreshIssues,
    onTabChange,
  } = props;

  // No repo selected - show welcome
  if (!selectedRepo) {
    return <WelcomeState />;
  }

  // Creating a new issue
  if (isCreatingIssue) {
    return (
      <div className="flex-1 overflow-auto">
        <IssueCreateView
          repoId={selectedRepo.id}
          onCancel={onCancelIssueCreate}
          onCreated={(issue) => {
            onIssueCreated(issue);
            onRefreshIssues();
          }}
        />
      </div>
    );
  }

  // Session selected (from History tab)
  if (selectedSession) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <SessionDetail
          session={selectedSession}
          onContinue={async (prompt) => {
            await onContinueSession(selectedSession, prompt);
          }}
          onDelete={async () => {
            await onDeleteSession(selectedSession.session_id);
            onSessionClosed();
          }}
          onTitleChange={async (title) => {
            await onUpdateSessionTitle(selectedSession.session_id, title);
          }}
          onShowIssue={onShowIssue}
          onShowPR={onShowPR}
          onShowSchedule={onShowSchedule}
        />
      </div>
    );
  }

  // Schedule selected
  if (selectedSchedule) {
    return (
      <div className="flex-1 overflow-auto">
        <ScheduleDetail
          repoId={selectedRepo.id}
          scheduleId={selectedSchedule}
          onShowSession={(sessionId) => {
            const session = sessions.find(s => s.session_id === sessionId);
            if (session) {
              onSelectSession(session);
            }
          }}
          sessions={sessions}
          commands={commands}
          onScheduleDeleted={onScheduleDeleted}
          onScheduleUpdated={onScheduleUpdated}
        />
      </div>
    );
  }

  // Issue selected
  if (selectedIssue) {
    return (
      <div className="flex-1 overflow-auto">
        <IssueDetail
          repoId={selectedRepo.id}
          issueNumber={selectedIssue}
          issueCommands={commands.issue}
          onStartSession={(issue, command) => {
            onStartIssueSession(issue, command);
          }}
          sessions={sessions}
          processes={processes}
          onSelectSession={onSelectSession}
          onContinueSession={onContinueSession}
          tags={tags}
          issueTags={issueTagsMap[selectedIssue] || []}
          issueMetadata={issueMetadataMap[selectedIssue]}
          onAddTag={(tagId) => onAddTagToIssue(selectedIssue, tagId)}
          onRemoveTag={(tagId) => onRemoveTagFromIssue(selectedIssue, tagId)}
          onCreateTag={onCreateTag}
        />
      </div>
    );
  }

  // PR selected
  if (selectedPR) {
    return (
      <div className="flex-1 overflow-auto">
        <PRDetail
          repoId={selectedRepo.id}
          prNumber={selectedPR}
          prCommands={commands.pr}
          onStartSession={(pr, command) => {
            onStartPRSession(pr, command);
          }}
          sessions={sessions}
          processes={processes}
          onSelectSession={onSelectSession}
          onContinueSession={onContinueSession}
          prMetadata={prMetadataMap[selectedPR]}
        />
      </div>
    );
  }

  // Nothing selected - show empty state
  return <EmptyState activeTab={activeTab} onTabChange={onTabChange} />;
}
