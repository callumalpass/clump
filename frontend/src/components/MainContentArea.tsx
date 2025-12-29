import { useRef } from 'react';
import { Group, Panel, type PanelImperativeHandle } from 'react-resizable-panels';
import { IssueDetail } from './IssueDetail';
import { IssueCreateView } from './IssueCreateView';
import { PRDetail } from './PRDetail';
import { ScheduleDetail } from './ScheduleDetail';
import { SessionPanel } from './SessionPanel';
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
// Resize Handle Component
// =============================================================================

import { Separator } from 'react-resizable-panels';

function ResizeHandle() {
  return (
    <Separator className="group relative flex items-center justify-center w-2 cursor-col-resize transition-all resize-handle">
      <div className="w-px h-full bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
      <div className="absolute inset-y-0 flex flex-col items-center justify-center gap-1 opacity-30 group-hover:opacity-100 transition-opacity pointer-events-none resize-handle-dots">
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blue-400 transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blue-400 transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blue-400 transition-colors" />
      </div>
    </Separator>
  );
}

// =============================================================================
// Types
// =============================================================================

type ViewMode = 'transcript' | 'terminal';

export interface MainContentAreaProps {
  // Layout mode
  layoutMode: LayoutMode;

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
  expandedSessionId: string | null;

  // Issue actions
  onStartIssueSession: (issue: Issue, command: CommandMetadata) => void;
  onSelectSession: (session: SessionSummary) => void;
  onContinueSession: (session: SessionSummary, prompt?: string) => Promise<void>;
  onToggleExpandedSession: (sessionId: string | null) => void;
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
      <div className="flex items-center p-2 border-b border-gray-700 bg-gray-800/50 shrink-0 flex-col gap-2">
        <button
          onClick={onExpand}
          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
    <div className="flex items-center p-2 border-b border-gray-700 bg-gray-800/50 shrink-0 justify-between">
      <span className="text-sm font-medium text-gray-300">{label} Context</span>
      <button
        onClick={onCollapse}
        className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center p-8 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-sm empty-state-enter">
        <div className="w-16 h-16 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-5 empty-state-icon-float">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
        </div>
        <p className="text-gray-300 font-medium mb-2">Select an issue or PR to view details</p>
        <p className="text-gray-400 text-sm">or start a session from an issue or PR</p>
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
    expandedSessionId,
    onStartIssueSession,
    onSelectSession,
    onContinueSession,
    onToggleExpandedSession,
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
    onClearActiveProcess,
    onShowIssue,
    onShowPR,
    onShowSchedule,
    onEntitiesChange,
    needsAttention,
    onRefreshIssues,
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
        expandedSessionId={expandedSessionId}
        onToggleSession={onToggleExpandedSession}
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
          className="flex flex-col border-r border-gray-700 min-h-0"
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
          className="flex flex-col border-r border-gray-700 min-h-0"
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
          className="border-r border-gray-700 overflow-auto"
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
      <div className="flex-1 border-r border-gray-700 overflow-auto">
        {selectedIssue && renderIssueDetail(selectedIssue)}
      </div>
    ),

    // PR detail only (no sessions)
    'pr-only': () => (
      <div className="flex-1 border-r border-gray-700 overflow-auto">
        {selectedPRData && renderPRDetail(selectedPRData)}
      </div>
    ),

    // Schedule detail only (no sessions)
    'schedule-only': () => (
      <div className="flex-1 border-r border-gray-700 overflow-auto">
        {renderScheduleDetail()}
      </div>
    ),

    // Sessions only (no context)
    'sessions-only': () => (
      <SessionPanel {...sessionPanelProps} emptyStateVariant="select-session" />
    ),

    // Issue creation form
    'issue-create': () => (
      <div className="flex-1 border-r border-gray-700 overflow-auto">
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
    'empty': () => <EmptyState />,
  };

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="flex-1 flex min-h-0">
      {layouts[layoutMode]()}
    </div>
  );
}
