import { useRef } from 'react';
import { Group, Panel, type PanelImperativeHandle } from 'react-resizable-panels';
import { IssueDetail } from './IssueDetail';
import { IssueCreateView } from './IssueCreateView';
import { PRDetail } from './PRDetail';
import { ScheduleDetail } from './ScheduleDetail';
import { SessionPanel } from './SessionPanel';
import { ResizeHandle } from './ResizeHandle';
import type { LayoutMode } from '../hooks/useLayoutMode';
import type {
  Repo,
  Issue,
  PR,
  SessionSummary,
  Process,
  CommandMetadata,
  CommandsResponse,
  Tag,
} from '../types';

// =============================================================================
// Types
// =============================================================================

type ViewMode = 'transcript' | 'terminal';

export type Tab = 'issues' | 'prs' | 'history' | 'schedules';

export interface MainContentAreaProps {
  // Layout mode
  layoutMode: LayoutMode;

  // Current active tab for context-aware empty states
  activeTab: Tab;

  // Whether the current list is empty (helps provide contextual empty state messages)
  listEmpty?: boolean;

  // Whether the current list has an error (for error-aware empty states)
  listError?: string | null;

  // Repo context
  selectedRepo: Repo | null;

  // Selection state
  selectedIssue: number | null;
  selectedPR: number | null;
  selectedSchedule: number | null;
  activeIssueNumber: number | null;
  activePRNumber: number | null;

  // Issue panel collapse state
  issuePanelCollapsed: boolean;
  onIssuePanelCollapsedChange: (collapsed: boolean) => void;

  // Data
  issues: Issue[];
  prs: PR[];
  sessions: SessionSummary[];
  openSessions: SessionSummary[];
  processes: Process[];
  commands: CommandsResponse;
  tags: Tag[];
  issueTagsMap: Record<number, Tag[]>;

  // Session panel state
  activeTabSessionId: string | null;
  activeProcessId: string | null;
  viewingSessionId: string | null;
  sessionViewModes: Record<string, ViewMode>;

  // Issue actions
  onStartIssueSession: (issue: Issue, command: CommandMetadata) => void;
  onSelectSession: (session: SessionSummary) => void;
  onContinueSession: (session: SessionSummary, prompt?: string) => Promise<void>;
  onAddTagToIssue: (issueNumber: number, tagId: number) => void;
  onRemoveTagFromIssue: (issueNumber: number, tagId: number) => void;
  onCreateTag: (name: string, color?: string) => Promise<Tag | undefined>;

  // PR actions
  onStartPRSession: (pr: PR, command: CommandMetadata) => void;

  // Schedule actions
  onScheduleDeleted: () => void;
  onScheduleUpdated: () => void;

  // Issue creation
  onCancelIssueCreate: () => void;
  onIssueCreated: (issue: Issue) => void;

  // Session panel actions
  onSelectSessionTab: (sessionId: string) => void;
  onCloseSessionTab: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onUpdateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  onCloseViewingSession: () => void;
  onSetViewMode: (sessionId: string, mode: ViewMode) => void;
  onKillProcess: (processId: string) => Promise<void>;
  onKillSession: (sessionId: string) => Promise<void>;
  onClearActiveProcess: () => void;

  // Navigation
  onShowIssue: (issueNumber: number) => void;
  onShowPR: (prNumber: number) => void;
  onShowSchedule: (scheduleId: number) => void;

  // Other
  onEntitiesChange: () => void;
  needsAttention?: (sessionId: string) => boolean;

  // Refresh functions
  onRefreshIssues: () => void;

  // Tab navigation (for empty state quick nav)
  onTabChange?: (tab: Tab) => void;
}

// =============================================================================
// Collapsible Context Panel Header
// =============================================================================

interface ContextPanelHeaderProps {
  isCollapsed: boolean;
  isIssue: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

function ContextPanelHeader({ isCollapsed, isIssue, onExpand, onCollapse }: ContextPanelHeaderProps) {
  const label = isIssue ? 'Issue' : 'PR';

  if (isCollapsed) {
    return (
      <div className="flex items-center p-2 border-b border-gray-750 bg-gray-800/50 shrink-0 flex-col gap-2">
        <button
          onClick={onExpand}
          className="p-1 hover:bg-gray-750 rounded text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-400"
          title="Expand panel"
          aria-label={`Expand ${label.toLowerCase()} context panel`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div
          className="flex flex-col items-center gap-1 cursor-pointer group"
          onClick={onExpand}
          title={`Click to expand ${label.toLowerCase()} context`}
        >
          {isIssue ? (
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          )}
          <span
            className="text-xs font-medium text-gray-400 group-hover:text-gray-200 transition-colors"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center p-2 border-b border-gray-750 bg-gray-800/50 shrink-0 justify-between">
      <span className="text-sm font-medium text-gray-300">{label} Context</span>
      <button
        onClick={onCollapse}
        className="p-1 hover:bg-gray-750 rounded text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-400"
        title="Collapse panel"
        aria-label={`Collapse ${label.toLowerCase()} context panel`}
      >
        <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="kbd-hint mx-0.5">{children}</kbd>
  );
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

// Welcome state shown when no repo is selected
function WelcomeState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 empty-state-pattern">
      <div className="text-center p-8 rounded-xl bg-gray-800/40 border border-gray-750/50 max-w-md empty-state-enter">
        {/* Logo/Icon */}
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blurple-500/20 to-mint-500/20 flex items-center justify-center mx-auto mb-6 empty-state-icon-float">
          <svg className="w-10 h-10 text-blurple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>

        {/* Welcome message */}
        <h2 className="text-xl font-semibold text-gray-200 mb-2">Welcome to Clump</h2>
        <p className="text-gray-400 text-sm mb-6">
          Manage Claude Code sessions for your GitHub repositories
        </p>

        {/* Getting started steps */}
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

        {/* Keyboard hint */}
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

// Context-aware empty state content based on active tab
const emptyStateContent: Record<Tab, { title: string; description: string; emptyTitle: string; emptyDescription: string; icon: React.ReactNode }> = {
  issues: {
    title: 'Select an issue to view details',
    description: 'or start a session to work on it',
    emptyTitle: 'No issues to display',
    emptyDescription: 'Check your filters or switch to a different state',
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
    emptyTitle: 'No pull requests to display',
    emptyDescription: 'Check your filters or switch to a different state',
    icon: (
      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  history: {
    title: 'Select a session to view details',
    description: 'browse past sessions and their transcripts',
    emptyTitle: 'No sessions yet',
    emptyDescription: 'Start a session from an issue or PR to get started',
    icon: (
      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  schedules: {
    title: 'Select a schedule to view details',
    description: 'manage automated sessions',
    emptyTitle: 'No schedules yet',
    emptyDescription: 'Create a schedule to automate recurring tasks',
    icon: (
      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
};

interface EmptyStateProps {
  activeTab: Tab;
  listEmpty?: boolean;
  listError?: string | null;
  onTabChange?: (tab: Tab) => void;
}

function EmptyState({ activeTab, listEmpty, listError, onTabChange }: EmptyStateProps) {
  const content = emptyStateContent[activeTab];

  // If there's an error loading the list, show error-aware empty state
  if (listError) {
    const tabLabel = activeTab === 'issues' ? 'issues' : activeTab === 'prs' ? 'pull requests' : activeTab === 'history' ? 'sessions' : 'schedules';
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center p-8 rounded-xl bg-danger-500/5 border border-danger-500/20 max-w-md empty-state-enter">
          {/* Error icon */}
          <div className="w-16 h-16 rounded-full bg-danger-500/10 flex items-center justify-center mx-auto mb-5 empty-state-icon-float">
            <svg className="w-8 h-8 text-danger-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          {/* Error message */}
          <h3 className="text-danger-300 font-semibold text-lg mb-2">Unable to load {tabLabel}</h3>
          <p className="text-gray-400 text-sm mb-4">There was a problem fetching data from the server.</p>
          <p className="text-gray-500 text-xs">Use the retry button in the sidebar to try again.</p>

          {/* Navigation hint - switch to another tab */}
          <div className="mt-6 pt-4 border-t border-gray-750/50">
            <p className="text-gray-500 text-xs mb-3">Or switch to a different view:</p>
            <div className="flex justify-center gap-2">
              {activeTab !== 'history' && (
                <QuickNavItem shortcut="3" label="History" onClick={() => onTabChange?.('history')} />
              )}
              {activeTab !== 'issues' && (
                <QuickNavItem shortcut="1" label="Issues" onClick={() => onTabChange?.('issues')} />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If the list has items, show a minimal "select an item" prompt
  // If the list is empty, show the full empty state with navigation shortcuts
  if (!listEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 empty-state-pattern">
        <div className="text-center empty-state-enter">
          {/* Subtle icon */}
          <div className="w-12 h-12 rounded-full bg-gray-800/60 flex items-center justify-center mx-auto mb-3 empty-state-icon-float">
            {content.icon}
          </div>
          {/* Simple prompt */}
          <p className="text-gray-400 text-sm">{content.title}</p>
          <p className="text-gray-500 text-xs mt-1">{content.description}</p>
        </div>
      </div>
    );
  }

  // Full empty state for when the list is truly empty
  return (
    <div className="flex-1 flex items-center justify-center p-8 empty-state-pattern">
      <div className="text-center p-8 rounded-xl bg-gray-800/40 border border-gray-750/50 max-w-lg empty-state-enter">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-5 empty-state-icon-float">
          {content.icon}
        </div>

        {/* Main message */}
        <h3 className="text-gray-200 font-semibold text-lg mb-2">{content.emptyTitle}</h3>
        <p className="text-gray-400 text-sm mb-6">{content.emptyDescription}</p>

        {/* Quick navigation grid - clickable buttons to switch tabs */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <QuickNavItem shortcut="1" label="Issues" active={activeTab === 'issues'} onClick={() => onTabChange?.('issues')} />
          <QuickNavItem shortcut="2" label="PRs" active={activeTab === 'prs'} onClick={() => onTabChange?.('prs')} />
          <QuickNavItem shortcut="3" label="History" active={activeTab === 'history'} onClick={() => onTabChange?.('history')} />
          <QuickNavItem shortcut="4" label="Schedules" active={activeTab === 'schedules'} onClick={() => onTabChange?.('schedules')} />
        </div>

        {/* Command palette hint */}
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
// Main Content Area Component
// =============================================================================

export function MainContentArea(props: MainContentAreaProps) {
  const {
    layoutMode,
    activeTab,
    listEmpty,
    listError,
    selectedRepo,
    selectedIssue,
    selectedPR,
    selectedSchedule,
    activeIssueNumber,
    activePRNumber,
    issuePanelCollapsed,
    onIssuePanelCollapsedChange,
    issues,
    prs,
    sessions,
    openSessions,
    processes,
    commands,
    tags,
    issueTagsMap,
    activeTabSessionId,
    activeProcessId,
    viewingSessionId,
    sessionViewModes,
    onStartIssueSession,
    onSelectSession,
    onContinueSession,
    onAddTagToIssue,
    onRemoveTagFromIssue,
    onCreateTag,
    onStartPRSession,
    onScheduleDeleted,
    onScheduleUpdated,
    onCancelIssueCreate,
    onIssueCreated,
    onSelectSessionTab,
    onCloseSessionTab,
    onNewSession,
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
    onEntitiesChange,
    needsAttention,
    onRefreshIssues,
    onTabChange,
  } = props;

  // Ref for collapsible context panel
  const contextPanelRef = useRef<PanelImperativeHandle>(null);

  // Find the active PR (for side-by-side with terminal/transcript)
  const activePR = activePRNumber ? prs.find(p => p.number === activePRNumber) : null;

  // Find the selected PR data (for standalone PR detail view)
  const selectedPRData = selectedPR ? prs.find(p => p.number === selectedPR) : null;

  // Common session panel props
  const sessionPanelProps = {
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
    newSessionDisabled: !selectedRepo,
  };

  // Handler for expanding context panel
  const handleExpandContextPanel = () => {
    const panel = contextPanelRef.current;
    if (panel?.isCollapsed()) {
      panel.expand();
      onIssuePanelCollapsedChange(false);
    }
  };

  // Handler for collapsing context panel
  const handleCollapseContextPanel = () => {
    const panel = contextPanelRef.current;
    panel?.collapse();
    onIssuePanelCollapsedChange(true);
  };

  // Render IssueDetail component
  const renderIssueDetail = (issueNumber: number) => {
    if (!selectedRepo) return null;
    return (
      <IssueDetail
        repoId={selectedRepo.id}
        issueNumber={issueNumber}
        issueCommands={commands.issue}
        onStartSession={(command) => {
          const issue = issues.find((i) => i.number === issueNumber);
          if (issue) onStartIssueSession(issue, command);
        }}
        sessions={sessions}
        processes={processes}
        onSelectSession={onSelectSession}
        onContinueSession={onContinueSession}
        tags={tags}
        issueTags={issueTagsMap[issueNumber] || []}
        onAddTag={(tagId) => onAddTagToIssue(issueNumber, tagId)}
        onRemoveTag={(tagId) => onRemoveTagFromIssue(issueNumber, tagId)}
        onCreateTag={onCreateTag}
      />
    );
  };

  // Render PRDetail component
  const renderPRDetail = (pr: PR) => {
    if (!selectedRepo) return null;
    return (
      <PRDetail
        repoId={selectedRepo.id}
        prNumber={pr.number}
        prCommands={commands.pr}
        onStartSession={(command) => onStartPRSession(pr, command)}
        sessions={sessions}
        processes={processes}
        onSelectSession={onSelectSession}
        onContinueSession={onContinueSession}
      />
    );
  };

  // Render ScheduleDetail component
  const renderScheduleDetail = () => {
    if (!selectedRepo || !selectedSchedule) return null;
    return (
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
    );
  };

  // =============================================================================
  // Layout Registry - Maps layout modes to their render functions
  // =============================================================================

  const layouts: Record<LayoutMode, () => React.ReactNode> = {
    // Issue + Sessions side-by-side (resizable, collapsible context)
    'issue-sessions': () => (
      <Group orientation="horizontal" className="flex-1">
        <Panel
          panelRef={contextPanelRef}
          defaultSize="40%"
          minSize="200px"
          maxSize="60%"
          collapsible
          collapsedSize="40px"
          className="flex flex-col border-r border-gray-750 min-h-0"
        >
          <ContextPanelHeader
            isCollapsed={issuePanelCollapsed}
            isIssue={true}
            onExpand={handleExpandContextPanel}
            onCollapse={handleCollapseContextPanel}
          />
          <div className={`flex-1 overflow-auto transition-opacity duration-150 ${issuePanelCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            {activeIssueNumber && renderIssueDetail(activeIssueNumber)}
          </div>
        </Panel>
        <ResizeHandle />
        <Panel minSize="300px" className="flex flex-col min-h-0">
          <SessionPanel {...sessionPanelProps} emptyStateVariant="select-session" />
        </Panel>
      </Group>
    ),

    // PR + Sessions side-by-side (resizable, collapsible context)
    'pr-sessions': () => (
      <Group orientation="horizontal" className="flex-1">
        <Panel
          panelRef={contextPanelRef}
          defaultSize="40%"
          minSize="200px"
          maxSize="60%"
          collapsible
          collapsedSize="40px"
          className="flex flex-col border-r border-gray-750 min-h-0"
        >
          <ContextPanelHeader
            isCollapsed={issuePanelCollapsed}
            isIssue={false}
            onExpand={handleExpandContextPanel}
            onCollapse={handleCollapseContextPanel}
          />
          <div className={`flex-1 overflow-auto transition-opacity duration-150 ${issuePanelCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            {activePR && renderPRDetail(activePR)}
          </div>
        </Panel>
        <ResizeHandle />
        <Panel minSize="300px" className="flex flex-col min-h-0">
          <SessionPanel {...sessionPanelProps} emptyStateVariant="select-session" />
        </Panel>
      </Group>
    ),

    // Schedule + Sessions side-by-side (resizable)
    'schedule-sessions': () => (
      <Group orientation="horizontal" className="flex-1">
        <Panel
          defaultSize="40%"
          minSize="250px"
          maxSize="60%"
          className="border-r border-gray-750 overflow-auto"
        >
          {renderScheduleDetail()}
        </Panel>
        <ResizeHandle />
        <Panel minSize="300px" className="flex flex-col min-h-0">
          <SessionPanel {...sessionPanelProps} emptyStateVariant="schedule" />
        </Panel>
      </Group>
    ),

    // Issue detail only (no sessions)
    'issue-only': () => (
      <div className="flex-1 border-r border-gray-750 overflow-auto">
        {selectedIssue && renderIssueDetail(selectedIssue)}
      </div>
    ),

    // PR detail only (no sessions)
    'pr-only': () => (
      <div className="flex-1 border-r border-gray-750 overflow-auto">
        {selectedPRData && renderPRDetail(selectedPRData)}
      </div>
    ),

    // Schedule detail only (no sessions)
    'schedule-only': () => (
      <div className="flex-1 border-r border-gray-750 overflow-auto">
        {renderScheduleDetail()}
      </div>
    ),

    // Sessions only (no context)
    'sessions-only': () => (
      <SessionPanel {...sessionPanelProps} emptyStateVariant="select-session" />
    ),

    // Issue creation form
    'issue-create': () => (
      <div className="flex-1 border-r border-gray-750 overflow-auto">
        {selectedRepo && (
          <IssueCreateView
            repoId={selectedRepo.id}
            onCancel={onCancelIssueCreate}
            onCreated={(issue) => {
              onIssueCreated(issue);
              onRefreshIssues();
            }}
          />
        )}
      </div>
    ),

    // Empty state
    'empty': () => <EmptyState activeTab={activeTab} listEmpty={listEmpty} listError={listError} onTabChange={onTabChange} />,
  };

  // =============================================================================
  // Render
  // =============================================================================

  // Show welcome state when no repo is selected
  if (!selectedRepo) {
    return (
      <div className="flex-1 flex min-h-0">
        <WelcomeState />
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      {layouts[layoutMode]()}
    </div>
  );
}
