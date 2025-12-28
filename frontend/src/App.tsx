import { useState, useCallback, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { useRepos, useIssues, usePRs, useProcesses, useSessions, useTags, useIssueTags, useCommands, useSessionCounts, useStats, buildPromptFromTemplate, exportSession, downloadExport } from './hooks/useApi';
import { useNotifications } from './hooks/useNotifications';
import type { IssueFilters, SessionFilters, PRFilters } from './hooks/useApi';
import { RepoSelector } from './components/RepoSelector';
import { IssueList } from './components/IssueList';
import { IssueDetail } from './components/IssueDetail';
import { IssueCreateView } from './components/IssueCreateView';
import { PRList } from './components/PRList';
import { PRDetail } from './components/PRDetail';
import { Terminal } from './components/Terminal';
import { SessionView } from './components/SessionView';
import { SessionTabs } from './components/SessionTabs';
import { SessionList } from './components/SessionList';
import { CompactSessionList } from './components/CompactSessionList';
import { ScheduleList } from './components/ScheduleList';
import { ScheduleDetail } from './components/ScheduleDetail';
import { StatsModal } from './components/StatsModal';
import { Settings } from './components/Settings';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { CommandPalette, type Command } from './components/CommandPalette';
import type { Repo, Issue, PR, SessionSummary, CommandMetadata, EntityLink } from './types';
import type { SessionListFilters } from './components/SessionList';
import { LRUCache } from './utils/cache';

function ResizeHandle() {
  return (
    <Separator className="group relative flex items-center justify-center w-2 cursor-col-resize transition-all resize-handle">
      {/* Visible drag line */}
      <div className="w-px h-full bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
      {/* Grip dots indicator - subtly visible, enhanced on hover */}
      <div className="absolute inset-y-0 flex flex-col items-center justify-center gap-1 opacity-30 group-hover:opacity-100 transition-opacity pointer-events-none resize-handle-dots">
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blue-400 transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blue-400 transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blue-400 transition-colors" />
      </div>
    </Separator>
  );
}

function HorizontalResizeHandle() {
  return (
    <Separator className="group relative flex items-center justify-center h-2 cursor-row-resize transition-all resize-handle">
      {/* Visible drag line */}
      <div className="h-px w-full bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
      {/* Grip dots indicator - subtly visible, enhanced on hover */}
      <div className="absolute inset-x-0 flex flex-row items-center justify-center gap-1 opacity-30 group-hover:opacity-100 transition-opacity pointer-events-none resize-handle-dots">
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blue-400 transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blue-400 transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-500 group-hover:bg-blue-400 transition-colors" />
      </div>
    </Separator>
  );
}

type Tab = 'issues' | 'prs' | 'history' | 'schedules';

// Storage key for persisting active tab
const ACTIVE_TAB_STORAGE_KEY = 'clump:activeTab';

// Valid tab values for validation
const VALID_TABS: Tab[] = ['issues', 'prs', 'history', 'schedules'];

/**
 * Load the active tab from localStorage, with validation.
 * Returns 'issues' as default if stored value is invalid or missing.
 */
function loadActiveTab(): Tab {
  try {
    const stored = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (stored && VALID_TABS.includes(stored as Tab)) {
      return stored as Tab;
    }
  } catch {
    // Ignore localStorage errors (e.g., private browsing mode)
  }
  return 'issues';
}

/**
 * Save the active tab to localStorage.
 */
function saveActiveTab(tab: Tab): void {
  try {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab);
  } catch {
    // Ignore localStorage errors
  }
}

// Track pending issue/PR context for processes being created
// This fixes the race condition where the sidepane doesn't show the issue/PR
// until the analysis is created and fetched via polling
interface PendingIssueContext {
  processId: string;
  issueNumber: number;
}

interface PendingPRContext {
  processId: string;
  prNumber: number;
}

// Track pending session metadata for optimistic UI
interface PendingSessionData {
  title: string;
  entities: EntityLink[];
}

export default function App() {
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [activeTab, setActiveTabState] = useState<Tab>(loadActiveTab);
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  // Track which sessions are open as tabs (persists after process ends) - now uses UUID strings
  const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
  // Track which session tab is currently active
  const [activeTabSessionId, setActiveTabSessionId] = useState<string | null>(null);
  const [issuePanelCollapsed, setIssuePanelCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [issueFilters, setIssueFilters] = useState<IssueFilters>({ state: 'open' });
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionListFilters, setSessionListFilters] = useState<SessionListFilters>({ category: 'all' });
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [selectedPR, setSelectedPR] = useState<number | null>(null);
  const [prFilters, setPRFilters] = useState<PRFilters>({ state: 'open' });
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  // Track selected schedule for center pane detail view
  const [selectedSchedule, setSelectedSchedule] = useState<number | null>(null);
  // Track view mode (transcript vs terminal) per session
  const [sessionViewModes, setSessionViewModes] = useState<Record<string, 'transcript' | 'terminal'>>({});

  // Wrapper for setActiveTab that also persists to localStorage
  const setActiveTab = useCallback((tab: Tab) => {
    setActiveTabState(tab);
    saveActiveTab(tab);
  }, []);

  // Track pending issue/PR context to show side-by-side view immediately
  const pendingIssueContextRef = useRef<PendingIssueContext | null>(null);
  const pendingPRContextRef = useRef<PendingPRContext | null>(null);

  // Track pending session data for optimistic UI (title, entities before backend returns)
  const pendingSessionsRef = useRef<Map<string, PendingSessionData>>(new Map());

  // LRU cache for session data - prevents unbounded memory growth
  // Sessions are cached when viewed so tabs persist across page changes
  const cachedSessionsRef = useRef(new LRUCache<string, SessionSummary>(100));

  // Ref for collapsible issue/PR context panel
  const contextPanelRef = useRef<PanelImperativeHandle>(null);

  // Refs for animated tab indicator
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<Tab, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Ref for refreshing schedule list from ScheduleDetail
  const scheduleListRefreshRef = useRef<(() => void) | null>(null);

  // Save session tabs on every change
  // Track which repo the current tabs belong to (prevents saving old tabs to new repo on switch)
  const tabsRepoIdRef = useRef<number | null>(null);
  useEffect(() => {
    // Only save if we have a selected repo
    if (!selectedRepo?.id) return;
    // Only save if these tabs belong to this repo (prevents race on repo switch)
    if (tabsRepoIdRef.current !== selectedRepo.id) return;

    const STORAGE_KEY = 'clump:repoSessionTabs';
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      stored[selectedRepo.id] = {
        openSessionIds,
        activeTabSessionId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {
      console.error('Failed to save session tabs:', e);
    }
  }, [openSessionIds, activeTabSessionId, selectedRepo?.id]);

  const { repos, addRepo } = useRepos();
  const {
    issues,
    loading: issuesLoading,
    refresh: refreshIssues,
    page: issuesPage,
    totalPages: issuesTotalPages,
    total: issuesTotal,
    goToPage: goToIssuesPage,
  } = useIssues(selectedRepo?.id ?? null, issueFilters);
  const { processes, createProcess, killProcess, addProcess, removeProcess, setProcesses, refresh: refreshProcesses } = useProcesses();
  // Build session filters based on UI state
  const sessionFilters: SessionFilters = {
    repoPath: selectedRepo?.local_path,
    search: sessionListFilters.search || undefined,
    starred: sessionListFilters.category === 'starred' ? true : undefined,
    hasEntities: sessionListFilters.category === 'with-entities' ? true : undefined,
    isActive: sessionListFilters.category === 'active' ? true :
              sessionListFilters.category === 'completed' ? false : undefined,
    model: sessionListFilters.model,
    sort: sessionListFilters.sort,
    order: sessionListFilters.order,
    dateRange: sessionListFilters.dateRange,
  };
  const { sessions, loading: sessionsLoading, refresh: refreshSessions, continueSession, deleteSession, updateSessionMetadata, bulkDeleteSessions, bulkUpdateSessions, total: sessionsTotal, page: sessionsPage, totalPages: sessionsTotalPages, goToPage: goToSessionsPage } = useSessions(sessionFilters);
  const { stats, loading: statsLoading, error: statsError, refresh: refreshStats } = useStats();

  // Debounced session refresh to coalesce multiple rapid refresh requests
  const refreshSessionsDebounced = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        refreshSessions();
        timeoutId = null;
      }, 500);
    };
  }, [refreshSessions]);

  const { tags, createTag } = useTags(selectedRepo?.id ?? null);
  const { issueTagsMap, addTagToIssue, removeTagFromIssue } = useIssueTags(selectedRepo?.id ?? null);
  const { prs, loading: prsLoading, refresh: refreshPRs, page: prsPage, totalPages: prsTotalPages, total: prsTotal, goToPage: goToPRsPage } = usePRs(selectedRepo?.id ?? null, prFilters);
  const { commands, refresh: refreshCommands } = useCommands(selectedRepo?.local_path);
  const { counts: sessionCounts, refresh: refreshSessionCounts, updateCounts } = useSessionCounts();

  // Event-driven updates from WebSocket
  // Handle session created - add to list and refresh counts
  const handleSessionCreated = useCallback(() => {
    // Refresh the session list to pick up the new session
    refreshSessions();
    refreshSessionCounts();
  }, [refreshSessions, refreshSessionCounts]);

  // Handle session updated - update the session in list
  const handleSessionUpdated = useCallback((_event: { session_id: string; changes: Record<string, unknown> }) => {
    // Refresh sessions to pick up the changes
    refreshSessions();
  }, [refreshSessions]);

  // Handle session completed - update is_active flag
  const handleSessionCompleted = useCallback((_event: { session_id: string }) => {
    refreshSessions();
    refreshSessionCounts();
  }, [refreshSessions, refreshSessionCounts]);

  // Handle session deleted - remove from list
  const handleSessionDeleted = useCallback((_event: { session_id: string }) => {
    refreshSessions();
    refreshSessionCounts();
  }, [refreshSessions, refreshSessionCounts]);

  // Handle process started - add to processes list
  const handleProcessStarted = useCallback((_event: { process_id: string; session_id: string; working_dir: string }) => {
    // The process was already added optimistically via createProcess
    // Just refresh to be safe
    refreshProcesses();
  }, [refreshProcesses]);

  // Handle process ended - remove from processes list
  const handleProcessEnded = useCallback((event: { process_id: string; session_id: string }) => {
    removeProcess(event.process_id);
  }, [removeProcess]);

  // Handle counts changed
  const handleCountsChanged = useCallback((event: { counts: Record<string, { repo_id: number; total: number; active: number }> }) => {
    updateCounts(event.counts);
  }, [updateCounts]);

  // Handle initial state from WebSocket
  const handleInitialState = useCallback((event: { processes: Array<{ id: string; session_id: number | null; working_dir: string; created_at: string; claude_session_id?: string | null }> }) => {
    // Update processes from WebSocket initial state
    setProcesses(event.processes.map(p => ({
      id: p.id,
      session_id: p.session_id,
      working_dir: p.working_dir,
      created_at: p.created_at,
      claude_session_id: p.claude_session_id ?? null,
    })));
  }, [setProcesses]);

  // Notifications hook for tracking sessions needing attention AND real-time events
  const {
    needsAttention,
    clearAttention,
    sessionsNeedingAttention,
  } = useNotifications({
    enableDesktopNotifications: true,
    enableSound: true,
    onSessionCreated: handleSessionCreated,
    onSessionUpdated: handleSessionUpdated,
    onSessionCompleted: handleSessionCompleted,
    onSessionDeleted: handleSessionDeleted,
    onProcessStarted: handleProcessStarted,
    onProcessEnded: handleProcessEnded,
    onCountsChanged: handleCountsChanged,
    onInitialState: handleInitialState,
  });

  // Update browser tab title when attention is needed
  useEffect(() => {
    const attentionCount = sessionsNeedingAttention.size;
    if (attentionCount > 0) {
      document.title = `(${attentionCount}) Clump - Attention needed`;
    } else {
      document.title = 'Clump';
    }

    return () => {
      document.title = 'Clump';
    };
  }, [sessionsNeedingAttention.size]);

  // Update the sliding tab indicator position when active tab changes
  useLayoutEffect(() => {
    const updateIndicator = () => {
      const container = tabsContainerRef.current;
      const activeTabElement = tabRefs.current.get(activeTab);
      if (container && activeTabElement) {
        const containerRect = container.getBoundingClientRect();
        const tabRect = activeTabElement.getBoundingClientRect();
        setIndicatorStyle({
          left: tabRect.left - containerRect.left,
          width: tabRect.width,
        });
      }
    };
    updateIndicator();
    // Also update on window resize
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeTab]);

  // Restore session tabs when repo changes
  useEffect(() => {
    const STORAGE_KEY = 'clump:repoSessionTabs';

    // Clear filters
    setSelectedTagId(null);
    setIssueFilters({ state: 'open' });
    setPRFilters({ state: 'open' });
    setSessionListFilters({ category: 'all' });

    // Clear selections (issues/PRs/schedules belong to specific repos)
    setSelectedIssue(null);
    setSelectedPR(null);
    setSelectedSchedule(null);

    // Restore tabs for new repo (or clear if none saved)
    if (selectedRepo?.id) {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const repoTabs = stored[selectedRepo.id];
        if (repoTabs) {
          setOpenSessionIds(repoTabs.openSessionIds || []);
          setActiveTabSessionId(repoTabs.activeTabSessionId || null);
          // If there's an active tab, try to view it
          if (repoTabs.activeTabSessionId) {
            setViewingSessionId(repoTabs.activeTabSessionId);
          } else {
            setViewingSessionId(null);
          }
        } else {
          setOpenSessionIds([]);
          setActiveTabSessionId(null);
          setViewingSessionId(null);
        }
      } catch (e) {
        console.error('Failed to restore session tabs:', e);
        setOpenSessionIds([]);
        setActiveTabSessionId(null);
        setViewingSessionId(null);
      }
      // Mark that these tabs now belong to this repo (enables saving)
      tabsRepoIdRef.current = selectedRepo.id;
    } else {
      setOpenSessionIds([]);
      setActiveTabSessionId(null);
      setViewingSessionId(null);
      tabsRepoIdRef.current = null;
    }

    // Only clear process/cache if repo actually changed (not on hot reload)
    const repoActuallyChanged = tabsRepoIdRef.current !== null && tabsRepoIdRef.current !== selectedRepo?.id;
    if (repoActuallyChanged || !selectedRepo?.id) {
      setActiveProcessId(null);
      setExpandedSessionId(null);
      // Clear pending context refs and session cache
      pendingIssueContextRef.current = null;
      pendingPRContextRef.current = null;
      cachedSessionsRef.current.clear();
    }
  }, [selectedRepo?.id]);

  // Handle issue selection from list - clears expanded analysis and PR selection
  const handleSelectIssue = useCallback((issueNumber: number) => {
    setSelectedIssue(issueNumber);
    setSelectedPR(null);
    setExpandedSessionId(null);
  }, []);

  // Handle PR selection from list - clears issue selection
  const handleSelectPR = useCallback((prNumber: number) => {
    setSelectedPR(prNumber);
    setSelectedIssue(null);
    setExpandedSessionId(null);
  }, []);

  // Note: Session list is now event-driven via WebSocket - no polling needed
  // Events trigger refreshSessions() when sessions change

  // Note: We intentionally do NOT auto-cleanup session tabs based on the sessions list
  // because sessions is paginated. Tabs for sessions on other pages would be incorrectly
  // removed when sorting/filtering changes. Tabs are only removed when:
  // 1. User explicitly closes them via handleCloseSessionTab
  // 2. Session is deleted via deleteSession
  // 3. Repo is switched (handled in the repo change useEffect)

  const handleStartIssueSession = useCallback(
    async (issue: Issue, command: CommandMetadata) => {
      if (!selectedRepo) return;

      const prompt = buildPromptFromTemplate(command.template, {
        number: issue.number,
        title: issue.title,
        body: issue.body,
      });

      const title = `${command.name}: Issue #${issue.number}`;
      const entities: EntityLink[] = [{ kind: 'issue', number: issue.number }];

      const process = await createProcess(
        selectedRepo.id,
        prompt,
        'issue',
        entities,
        title
      );

      // Store pending context so side-by-side view shows immediately
      // (before session is created and fetched via polling)
      pendingIssueContextRef.current = {
        processId: process.id,
        issueNumber: issue.number,
      };

      // Store pending session data for optimistic UI
      if (process.claude_session_id) {
        pendingSessionsRef.current.set(process.claude_session_id, { title, entities });
      }

      setActiveProcessId(process.id);

      // Add session to open tabs if claude_session_id is available
      if (process.claude_session_id) {
        setOpenSessionIds(prev => prev.includes(process.claude_session_id!) ? prev : [...prev, process.claude_session_id!]);
        setActiveTabSessionId(process.claude_session_id);
      }

      // Trigger debounced refresh to get session data sooner
      refreshSessionsDebounced();
    },
    [selectedRepo, createProcess, refreshSessionsDebounced]
  );

  const handleStartPRSession = useCallback(
    async (pr: PR, command: CommandMetadata) => {
      if (!selectedRepo) return;

      const prompt = buildPromptFromTemplate(command.template, {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        head_ref: pr.head_ref,
        base_ref: pr.base_ref,
      });

      const title = `${command.name}: PR #${pr.number}`;
      const entities: EntityLink[] = [{ kind: 'pr', number: pr.number }];

      const process = await createProcess(
        selectedRepo.id,
        prompt,
        'pr',
        entities,
        title
      );

      // Store pending context so side-by-side view shows immediately
      pendingPRContextRef.current = {
        processId: process.id,
        prNumber: pr.number,
      };

      // Store pending session data for optimistic UI
      if (process.claude_session_id) {
        pendingSessionsRef.current.set(process.claude_session_id, { title, entities });
      }

      setActiveProcessId(process.id);

      // Add session to open tabs if claude_session_id is available
      if (process.claude_session_id) {
        setOpenSessionIds(prev => prev.includes(process.claude_session_id!) ? prev : [...prev, process.claude_session_id!]);
        setActiveTabSessionId(process.claude_session_id);
      }

      // Trigger debounced refresh to get analysis data sooner
      refreshSessionsDebounced();
    },
    [selectedRepo, createProcess, refreshSessionsDebounced]
  );

  const handleNewProcess = useCallback(async () => {
    if (!selectedRepo) return;

    const title = 'New Session';
    const entities: EntityLink[] = [];

    const process = await createProcess(
      selectedRepo.id,
      undefined,
      'custom',
      entities,
      title
    );

    // Store pending session data for optimistic UI
    if (process.claude_session_id) {
      pendingSessionsRef.current.set(process.claude_session_id, { title, entities });
    }

    setActiveProcessId(process.id);

    // Add session to open tabs if claude_session_id is available
    if (process.claude_session_id) {
      setOpenSessionIds(prev => prev.includes(process.claude_session_id!) ? prev : [...prev, process.claude_session_id!]);
      setActiveTabSessionId(process.claude_session_id);
    }

    // Trigger debounced refresh to get session data sooner
    refreshSessionsDebounced();
  }, [selectedRepo, createProcess, refreshSessionsDebounced]);

  const handleSelectSession = useCallback((session: SessionSummary) => {
    // Check if this session is active (has a running process)
    const activeProcess = session.is_active ? processes.find(p => p.claude_session_id === session.session_id) : null;

    // Select the first linked issue or PR for context
    const firstIssue = session.entities?.find(e => e.kind === 'issue');
    const firstPR = session.entities?.find(e => e.kind === 'pr');

    if (firstIssue) {
      setSelectedIssue(firstIssue.number);
      setSelectedPR(null);
    } else if (firstPR) {
      setSelectedPR(firstPR.number);
      setSelectedIssue(null);
    }

    // Add session to open tabs
    setOpenSessionIds(prev => prev.includes(session.session_id) ? prev : [...prev, session.session_id]);
    setActiveTabSessionId(session.session_id);

    if (activeProcess) {
      // Process is still running - open the terminal
      setActiveProcessId(activeProcess.id);
      setViewingSessionId(null);
      setExpandedSessionId(null);

      // Store pending context for immediate side-by-side view
      if (firstIssue) {
        pendingIssueContextRef.current = {
          processId: activeProcess.id,
          issueNumber: firstIssue.number,
        };
      }
      if (firstPR) {
        pendingPRContextRef.current = {
          processId: activeProcess.id,
          prNumber: firstPR.number,
        };
      }
    } else {
      // Process ended - show transcript in details panel
      setActiveProcessId(null);
      setViewingSessionId(session.session_id);
      setExpandedSessionId(null);
    }
  }, [processes]);

  const handleContinueSession = useCallback(
    async (session: SessionSummary, prompt?: string) => {
      // Use the continue endpoint - creates a new process resuming the conversation
      const process = await continueSession(session.session_id, prompt);

      // Add the new process to state immediately
      addProcess(process);

      // Store pending context for first linked issue/PR so side-by-side shows immediately
      const firstIssue = session.entities?.find(e => e.kind === 'issue');
      const firstPR = session.entities?.find(e => e.kind === 'pr');

      if (firstIssue) {
        pendingIssueContextRef.current = {
          processId: process.id,
          issueNumber: firstIssue.number,
        };
      }

      if (firstPR) {
        pendingPRContextRef.current = {
          processId: process.id,
          prNumber: firstPR.number,
        };
      }

      // Ensure session is in open tabs and active
      setOpenSessionIds(prev => prev.includes(session.session_id) ? prev : [...prev, session.session_id]);
      setActiveTabSessionId(session.session_id);

      // Clear viewing state and switch to terminal
      setViewingSessionId(null);
      setActiveProcessId(process.id);
    },
    [continueSession, addProcess]
  );

  const handleToggleStar = useCallback(
    async (session: SessionSummary) => {
      await updateSessionMetadata(session.session_id, { starred: !session.starred });
    },
    [updateSessionMetadata]
  );

  // Handler for closing a session tab (not deleting the session)
  const handleCloseSessionTab = useCallback((sessionId: string) => {
    // Find the session to check if it has a running process
    const session = sessions.find(s => s.session_id === sessionId)
      ?? cachedSessionsRef.current.get(sessionId);
    if (session?.is_active) {
      const activeProcess = processes.find(p => p.claude_session_id === sessionId);
      if (activeProcess) {
        killProcess(activeProcess.id);
      }
    }

    // Remove from open tabs and cache
    setOpenSessionIds(prev => prev.filter(id => id !== sessionId));
    cachedSessionsRef.current.delete(sessionId);

    // If this was the active tab, clear it
    if (activeTabSessionId === sessionId) {
      setActiveTabSessionId(null);
      setActiveProcessId(null);
      setViewingSessionId(null);
    }
  }, [sessions, processes, killProcess, activeTabSessionId]);

  // Handler for selecting a session tab
  const handleSelectSessionTab = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.session_id === sessionId)
      ?? cachedSessionsRef.current.get(sessionId);
    if (!session) return;

    setActiveTabSessionId(sessionId);

    // Clear attention state when user selects the session
    clearAttention(sessionId);

    // Check if session is active
    const activeProcess = session.is_active ? processes.find(p => p.claude_session_id === sessionId) : null;
    if (activeProcess) {
      setActiveProcessId(activeProcess.id);
      setViewingSessionId(null);
    } else {
      setActiveProcessId(null);
      setViewingSessionId(sessionId);
    }

    // Update issue/PR selection for context (use first linked entity)
    const firstIssue = session.entities?.find(e => e.kind === 'issue');
    const firstPR = session.entities?.find(e => e.kind === 'pr');

    if (firstIssue) {
      setSelectedIssue(firstIssue.number);
      setSelectedPR(null);
    } else if (firstPR) {
      setSelectedPR(firstPR.number);
      setSelectedIssue(null);
    }
  }, [sessions, processes, clearAttention]);

  // Session tab keyboard shortcuts (Alt + 1-9, [, ], N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Tab navigation shortcuts (Alt + 1-9)
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        const sessionId = openSessionIds[tabIndex];
        if (sessionId) {
          handleSelectSessionTab(sessionId);
        }
        return;
      }

      // Previous tab (Alt + [)
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key === '[') {
        e.preventDefault();
        if (openSessionIds.length > 0 && activeTabSessionId) {
          const currentIndex = openSessionIds.indexOf(activeTabSessionId);
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : openSessionIds.length - 1;
          const sessionId = openSessionIds[prevIndex];
          if (sessionId) {
            handleSelectSessionTab(sessionId);
          }
        }
        return;
      }

      // Next tab (Alt + ])
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key === ']') {
        e.preventDefault();
        if (openSessionIds.length > 0 && activeTabSessionId) {
          const currentIndex = openSessionIds.indexOf(activeTabSessionId);
          const nextIndex = currentIndex < openSessionIds.length - 1 ? currentIndex + 1 : 0;
          const sessionId = openSessionIds[nextIndex];
          if (sessionId) {
            handleSelectSessionTab(sessionId);
          }
        }
        return;
      }

      // New session (Alt + N)
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        if (selectedRepo) {
          handleNewProcess();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openSessionIds, activeTabSessionId, handleSelectSessionTab, handleCloseSessionTab, selectedRepo, handleNewProcess]);

  // Find the active process and its related session
  const activeProcess = processes.find(p => p.id === activeProcessId);
  const activeSessionFromList = activeProcess?.claude_session_id
    ? (sessions.find(s => s.session_id === activeProcess.claude_session_id)
      ?? cachedSessionsRef.current.get(activeProcess.claude_session_id))
    : null;

  // Synthesize session from process data if not found (handles hot reloads, pagination gaps)
  const activeSession: SessionSummary | null = activeSessionFromList
    ?? (activeProcess?.claude_session_id && selectedRepo ? {
      session_id: activeProcess.claude_session_id,
      encoded_path: '',
      repo_path: activeProcess.working_dir,
      repo_name: `${selectedRepo.owner}/${selectedRepo.name}`,
      title: pendingSessionsRef.current.get(activeProcess.claude_session_id)?.title || 'Active Session',
      model: null,
      start_time: activeProcess.created_at,
      end_time: null,
      message_count: 0,
      modified_at: activeProcess.created_at,
      file_size: 0,
      entities: pendingSessionsRef.current.get(activeProcess.claude_session_id)?.entities || [],
      tags: [],
      starred: false,
      is_active: true,
    } : null);

  // Find the session being viewed (for transcript panel)
  const viewingSession = viewingSessionId
    ? (sessions.find(s => s.session_id === viewingSessionId)
      ?? cachedSessionsRef.current.get(viewingSessionId))
    : null;

  // Find the process for the viewing session (if it's still active)
  const viewingSessionProcess = viewingSession
    ? processes.find(p => p.claude_session_id === viewingSession.session_id)
    : null;

  // Cache active/viewing sessions so they persist across pagination changes
  // Only cache real sessions from API, not synthetic ones
  if (activeSessionFromList && activeProcess?.claude_session_id) {
    cachedSessionsRef.current.set(activeProcess.claude_session_id, activeSessionFromList);
  }
  if (viewingSession && viewingSessionId) {
    cachedSessionsRef.current.set(viewingSessionId, viewingSession);
  }

  // Check pending context for newly created processes (before analysis is fetched)
  const pendingIssueContext = pendingIssueContextRef.current;
  const hasPendingIssue = pendingIssueContext && pendingIssueContext.processId === activeProcessId;
  const pendingPRContext = pendingPRContextRef.current;
  const hasPendingPR = pendingPRContext && pendingPRContext.processId === activeProcessId;

  // Clear pending context once analysis is loaded
  if (activeSession && hasPendingIssue) {
    pendingIssueContextRef.current = null;
  }
  if (activeSession && hasPendingPR) {
    pendingPRContextRef.current = null;
  }

  // Determine the issue number to display - prefer user selection, fallback to session context
  const sessionIssue = activeSession?.entities?.find(e => e.kind === 'issue')
    ?? viewingSession?.entities?.find(e => e.kind === 'issue');
  const activeIssueNumber = selectedIssue ?? (
    sessionIssue
      ? sessionIssue.number
      : hasPendingIssue
        ? pendingIssueContext.issueNumber
        : null
  );

  // Determine the PR number to display - prefer user selection, fallback to session context
  const sessionPR = activeSession?.entities?.find(e => e.kind === 'pr')
    ?? viewingSession?.entities?.find(e => e.kind === 'pr');
  const activePRNumber = selectedPR ?? (
    sessionPR
      ? sessionPR.number
      : hasPendingPR
        ? pendingPRContext.prNumber
        : null
  );

  // Show side-by-side when we have sessions AND any issue/PR context
  // This keeps the session panel always visible when sessions exist
  const hasIssueContext = !!activeIssueNumber;
  const hasPRContext = !!activePRNumber;

  // Get the list of open sessions (sessions that have tabs open)
  // Uses optimistic UI: if a session isn't in the backend yet but has an active process,
  // synthesize a session from process data + pending metadata so the tab appears immediately
  // Memoized to avoid recalculating on every render
  const openSessions = useMemo(() => {
    return openSessionIds
      .map(id => {
        // First try to find in fetched sessions (current page)
        const session = sessions.find(s => s.session_id === id);
        if (session) {
          // Clear pending data once we have real session data
          pendingSessionsRef.current.delete(id);
          // Update cache with latest data
          cachedSessionsRef.current.set(id, session);
          return session;
        }

        // If not on current page, check our cache (for sessions on other pages)
        const cachedSession = cachedSessionsRef.current.get(id);
        if (cachedSession) {
          return cachedSession;
        }

        // If not found anywhere, check if there's an active process for this session
        const process = processes.find(p => p.claude_session_id === id);
        if (process && selectedRepo) {
          // Get pending session data (title, entities) if available
          const pendingData = pendingSessionsRef.current.get(id);

          // Create a synthetic session from process data + pending metadata (optimistic UI)
          return {
            session_id: id,
            encoded_path: '',
            repo_path: process.working_dir,
            repo_name: `${selectedRepo.owner}/${selectedRepo.name}`,
            title: pendingData?.title || 'New Session',
            model: null,
            start_time: process.created_at,
            end_time: null,
            message_count: 0,
            modified_at: process.created_at,
            file_size: 0,
            entities: pendingData?.entities || [],
            tags: [],
            starred: false,
            is_active: true,
          } as SessionSummary;
        }
        return null;
      })
      .filter((s): s is SessionSummary => !!s);
  }, [openSessionIds, sessions, processes, selectedRepo]);

  // Show side-by-side if we have open session tabs and any issue/PR selected
  const showSideBySide = openSessions.length > 0 && (hasIssueContext || hasPRContext);

  // Determine which context to show in side-by-side (issue vs PR)
  // Prioritize user's explicit selection over analysis context
  const showIssueSideBySide = selectedIssue ? true : (hasIssueContext && !hasPRContext);
  const showPRSideBySide = selectedPR ? true : (!selectedIssue && hasPRContext);

  // Find the active PR data (for side-by-side with terminal/transcript)
  const activePR = activePRNumber ? prs.find(p => p.number === activePRNumber) : null;

  // Find the selected PR data (for standalone PR detail view)
  const selectedPRData = selectedPR ? prs.find(p => p.number === selectedPR) : null;

  // Handlers for navigating to issues/PRs from SessionView
  const handleShowIssue = useCallback((issueNumber: number) => {
    setSelectedIssue(issueNumber);
    setSelectedPR(null);
  }, []);

  const handleShowPR = useCallback((prNumber: number) => {
    setSelectedPR(prNumber);
    setSelectedIssue(null);
  }, []);

  const handleShowSchedule = useCallback((scheduleId: number) => {
    setSelectedSchedule(scheduleId);
    setSelectedIssue(null);
    setSelectedPR(null);
    setActiveTab('schedules');
  }, []);

  // Handler for changing session view mode (transcript vs terminal)
  const handleSetSessionViewMode = useCallback((sessionId: string, mode: 'transcript' | 'terminal') => {
    setSessionViewModes(prev => ({ ...prev, [sessionId]: mode }));
  }, []);

  // Global keyboard shortcuts (basic navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow Escape and Cmd+K in inputs
        if (e.key !== 'Escape' && !(e.key === 'k' && (e.metaKey || e.ctrlKey))) return;
      }

      // Cmd+K / Ctrl+K : Open command palette
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // "?" : Show keyboard shortcuts help
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      // "/" : Focus search in current tab - like GitHub/Slack
      if (e.key === '/') {
        e.preventDefault();
        // Focus the search input in the current tab after a short delay
        setTimeout(() => {
          const placeholder = activeTab === 'issues' ? 'Search issues...'
            : activeTab === 'prs' ? 'Search PRs...'
            : 'Search sessions...';
          const searchInput = document.querySelector(`input[placeholder="${placeholder}"]`) as HTMLInputElement;
          searchInput?.focus();
        }, 50);
        return;
      }

      // "1-4" : Go to sidebar tabs (Issues, PRs, History, Schedules)
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('issues');
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          setActiveTab('prs');
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          setActiveTab('history');
          return;
        }
        if (e.key === '4') {
          e.preventDefault();
          setActiveTab('schedules');
          return;
        }
      }

      // "w" : Close current session tab (like browser tabs)
      if (e.key === 'w' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (activeTabSessionId) {
          handleCloseSessionTab(activeTabSessionId);
        }
        return;
      }

      // "s" : Toggle star on current session
      if (e.key === 's' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const currentSession = activeTabSessionId
          ? (sessions.find(s => s.session_id === activeTabSessionId)
            ?? cachedSessionsRef.current.get(activeTabSessionId))
          : null;
        if (currentSession) {
          handleToggleStar(currentSession);
        }
        return;
      }

      // "t" : Toggle between transcript and terminal view for active session
      if (e.key === 't' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const sessionId = activeTabSessionId;
        if (sessionId) {
          const currentMode = sessionViewModes[sessionId] ?? 'transcript';
          handleSetSessionViewMode(sessionId, currentMode === 'transcript' ? 'terminal' : 'transcript');
        }
        return;
      }

      // "e" : Export current session to markdown
      if (e.key === 'e' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (activeTabSessionId) {
          exportSession(activeTabSessionId, 'markdown')
            .then(result => {
              downloadExport(result.content, result.filename);
            })
            .catch(err => {
              console.error('Failed to export session:', err);
            });
        }
        return;
      }

      // "r" : Refresh current view
      if (e.key === 'r' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (activeTab === 'issues') refreshIssues();
        else if (activeTab === 'prs') refreshPRs();
        else if (activeTab === 'history') refreshSessions();
        return;
      }

      // "[" : Previous page in current list (without Alt - Alt+[ is for session tabs)
      if (e.key === '[' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (activeTab === 'issues' && issuesPage > 1) {
          goToIssuesPage(issuesPage - 1);
        } else if (activeTab === 'prs' && prsPage > 1) {
          goToPRsPage(prsPage - 1);
        } else if (activeTab === 'history' && sessionsPage > 1) {
          goToSessionsPage(sessionsPage - 1);
        }
        return;
      }

      // "]" : Next page in current list (without Alt - Alt+] is for session tabs)
      if (e.key === ']' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (activeTab === 'issues' && issuesPage < issuesTotalPages) {
          goToIssuesPage(issuesPage + 1);
        } else if (activeTab === 'prs' && prsPage < prsTotalPages) {
          goToPRsPage(prsPage + 1);
        } else if (activeTab === 'history' && sessionsPage < sessionsTotalPages) {
          goToSessionsPage(sessionsPage + 1);
        }
        return;
      }

      // Escape: Close modals, deselect issue/PR, or close terminal
      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        } else if (statsModalOpen) {
          setStatsModalOpen(false);
        } else if (activeProcessId) {
          setActiveProcessId(null);
        } else if (selectedIssue) {
          setSelectedIssue(null);
        } else if (selectedPR) {
          setSelectedPR(null);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, settingsOpen, shortcutsOpen, statsModalOpen, activeProcessId, selectedIssue, selectedPR, activeTab, issuesPage, issuesTotalPages, goToIssuesPage, prsPage, prsTotalPages, goToPRsPage, sessionsPage, sessionsTotalPages, goToSessionsPage, activeTabSessionId, handleCloseSessionTab, sessions, handleToggleStar, sessionViewModes, handleSetSessionViewMode, refreshIssues, refreshPRs, refreshSessions]);

  // Command palette commands
  const paletteCommands = useMemo((): Command[] => {
    const cmds: Command[] = [];

    // Navigation commands
    cmds.push({
      id: 'nav-issues',
      label: 'Go to Issues',
      description: 'View GitHub issues',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      ),
      category: 'navigation',
      action: () => setActiveTab('issues'),
    });

    cmds.push({
      id: 'nav-prs',
      label: 'Go to Pull Requests',
      description: 'View GitHub pull requests',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      category: 'navigation',
      action: () => setActiveTab('prs'),
    });

    cmds.push({
      id: 'nav-history',
      label: 'Go to History',
      description: 'View past sessions',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      category: 'navigation',
      action: () => setActiveTab('history'),
    });

    cmds.push({
      id: 'nav-schedules',
      label: 'Go to Schedules',
      description: 'View scheduled tasks',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      category: 'navigation',
      action: () => setActiveTab('schedules'),
    });

    // Action commands
    if (selectedRepo) {
      cmds.push({
        id: 'action-new-session',
        label: 'New Session',
        description: 'Start a new Claude Code session',
        shortcut: ['Alt', 'N'],
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        ),
        category: 'actions',
        action: handleNewProcess,
      });
    }

    cmds.push({
      id: 'action-settings',
      label: 'Open Settings',
      description: 'Configure application settings',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      category: 'actions',
      action: () => setSettingsOpen(true),
    });

    cmds.push({
      id: 'action-stats',
      label: 'View Usage Statistics',
      description: 'See token usage and costs',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      category: 'actions',
      action: () => setStatsModalOpen(true),
    });

    cmds.push({
      id: 'action-shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'View all keyboard shortcuts',
      shortcut: ['?'],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      category: 'actions',
      action: () => setShortcutsOpen(true),
    });

    cmds.push({
      id: 'action-refresh',
      label: 'Refresh Data',
      description: 'Refresh current view data',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      category: 'actions',
      action: () => {
        if (activeTab === 'issues') refreshIssues();
        else if (activeTab === 'prs') refreshPRs();
        else if (activeTab === 'history') refreshSessions();
      },
    });

    // Open sessions (currently open as tabs)
    for (const session of openSessions) {
      cmds.push({
        id: `session-${session.session_id}`,
        label: session.title || 'Untitled Session',
        description: session.is_active ? 'Active session' : `${session.message_count} messages`,
        icon: session.is_active ? (
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        ),
        category: 'sessions',
        action: () => handleSelectSessionTab(session.session_id),
      });
    }

    // Recent sessions from history (not already open as tabs)
    const openSessionIdSet = new Set(openSessions.map(s => s.session_id));
    const recentSessions = sessions
      .filter(s => !openSessionIdSet.has(s.session_id))
      .slice(0, 10); // Limit to 10 recent sessions

    for (const session of recentSessions) {
      cmds.push({
        id: `recent-${session.session_id}`,
        label: session.title || 'Untitled Session',
        description: `${session.message_count} messages`,
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        category: 'recent',
        action: () => handleSelectSession(session),
      });
    }

    return cmds;
  }, [selectedRepo, activeTab, openSessions, sessions, handleNewProcess, handleSelectSessionTab, handleSelectSession, refreshIssues, refreshPRs, refreshSessions]);

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#161b22]">
        <h1
          className="text-2xl text-white drop-shadow-[0_0_10px_rgba(251,191,36,0.4)] hover:drop-shadow-[0_0_15px_rgba(251,191,36,0.6)] transition-all cursor-default"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Clump
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {processes.length} active process{processes.length !== 1 ? 'es' : ''}
          </span>
          {/* Usage stats summary */}
          {stats && (
            <button
              onClick={() => setStatsModalOpen(true)}
              className="hidden md:flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              title="View usage statistics"
            >
              <span className="tabular-nums">
                {stats.today_stats ? `${stats.today_stats.message_count.toLocaleString()} msgs today` : ''}
              </span>
              <span className="text-gray-600">|</span>
              <span className="tabular-nums text-green-500">
                ${stats.total_estimated_cost_usd.toFixed(2)}
              </span>
            </button>
          )}
          {/* Keyboard shortcuts hint */}
          <button
            onClick={() => setShortcutsOpen(true)}
            className="hidden sm:flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-all active:scale-95 focus:outline-none focus:text-gray-300"
            title="Keyboard shortcuts (?)"
          >
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-gray-400">?</kbd>
            <span>Help</span>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        commands={commands}
        repoPath={selectedRepo?.local_path}
        onRefreshCommands={refreshCommands}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Stats Modal */}
      <StatsModal
        isOpen={statsModalOpen}
        onClose={() => setStatsModalOpen(false)}
        stats={stats}
        loading={statsLoading}
        error={statsError}
        onRefresh={refreshStats}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={paletteCommands}
      />

      <Group orientation="horizontal" className="flex-1 min-h-0">
        {/* Left sidebar */}
        <Panel defaultSize="320px" minSize="200px" maxSize="500px" className="border-r border-gray-700 flex flex-col bg-[#0d1117]">
          <RepoSelector
            repos={repos}
            selectedRepo={selectedRepo}
            onSelectRepo={setSelectedRepo}
            onAddRepo={addRepo}
            sessionCounts={sessionCounts}
          />

          {/* Split sidebar with Sessions at top, Tabs below */}
          <Group orientation="vertical" className="flex-1 min-h-0">
            {/* Top: Always-visible sessions */}
            <Panel defaultSize="30%" minSize="80px" maxSize="60%">
              <CompactSessionList
                sessions={sessions}
                onSelectSession={handleSelectSession}
                onContinueSession={handleContinueSession}
                onViewAll={() => setActiveTab('history')}
              />
            </Panel>

            <HorizontalResizeHandle />

            {/* Bottom: Tabs for Issues/PRs/History/Schedules */}
            <Panel minSize="200px" className="flex flex-col">
              {/* Tabs with sliding indicator */}
              <div ref={tabsContainerRef} className="relative flex border-b border-gray-700 shrink-0">
                {(['issues', 'prs', 'history', 'schedules'] as Tab[]).map((tab) => {
                  // Display labels - handles special casing like "PRs"
                  const tabLabels: Record<Tab, string> = {
                    issues: 'Issues',
                    prs: 'PRs',
                    history: 'History',
                    schedules: 'Schedules',
                  };
                  // Tab icons for visual hierarchy
                  const tabIcons: Record<Tab, React.ReactNode> = {
                    issues: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeWidth={2} />
                        <circle cx="12" cy="12" r="3" fill="currentColor" />
                      </svg>
                    ),
                    prs: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    ),
                    history: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ),
                    schedules: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    ),
                  };
                  // Get count for each tab
                  const count = tab === 'issues' ? issuesTotal
                    : tab === 'prs' ? prsTotal
                    : tab === 'history' ? sessionsTotal
                    : 0; // schedules don't show count

                  // Keyboard shortcut for this tab (1-4)
                  const tabShortcuts: Record<Tab, string> = {
                    issues: '1',
                    prs: '2',
                    history: '3',
                    schedules: '4',
                  };

                  return (
                    <button
                      key={tab}
                      ref={(el) => {
                        if (el) tabRefs.current.set(tab, el);
                      }}
                      onClick={() => setActiveTab(tab)}
                      className={`group flex-1 px-3 py-2 text-sm outline-none focus-visible:bg-blue-500/10 focus-visible:text-blue-300 flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                        activeTab === tab
                          ? 'text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                      }`}
                      title={`${tabLabels[tab]} (${tabShortcuts[tab]})`}
                    >
                      <span className={`transition-colors duration-150 ${activeTab === tab ? 'text-blue-400' : ''}`}>
                        {tabIcons[tab]}
                      </span>
                      {tabLabels[tab]}
                      {(selectedRepo || tab === 'history') && count > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${
                          activeTab === tab
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {count > 999 ? '999+' : count}
                        </span>
                      )}
                      <kbd className="kbd-hint opacity-0 group-hover:opacity-100 transition-opacity ml-1">{tabShortcuts[tab]}</kbd>
                    </button>
                  );
                })}
                {/* Sliding indicator - only show when width is calculated */}
                {indicatorStyle.width > 0 && (
                  <div
                    className="absolute bottom-0 h-0.5 bg-blue-500 transition-all duration-200 ease-out"
                    style={{
                      left: indicatorStyle.left,
                      width: indicatorStyle.width,
                    }}
                  />
                )}
              </div>

              {/* List content - key triggers fade animation on tab switch */}
              <div key={activeTab} className="flex-1 min-h-0 flex flex-col tab-content-enter">
                {activeTab === 'issues' && selectedRepo && (
                  <IssueList
                    issues={issues}
                    selectedIssue={selectedIssue}
                    onSelectIssue={handleSelectIssue}
                    issueCommands={commands.issue}
                    onStartSession={handleStartIssueSession}
                    loading={issuesLoading}
                    page={issuesPage}
                    totalPages={issuesTotalPages}
                    total={issuesTotal}
                    onPageChange={goToIssuesPage}
                    sessions={sessions}
                    processes={processes}
                    tags={tags}
                    issueTagsMap={issueTagsMap}
                    selectedTagId={selectedTagId}
                    onSelectTag={setSelectedTagId}
                    filters={issueFilters}
                    onFiltersChange={setIssueFilters}
                    onRefresh={refreshIssues}
                    onCreateIssue={() => {
                      setIsCreatingIssue(true);
                      setSelectedIssue(null);
                    }}
                  />
                )}
                {activeTab === 'history' && (
                  <SessionList
                    sessions={sessions}
                    processes={processes}
                    onSelectSession={handleSelectSession}
                    onContinueSession={handleContinueSession}
                    onToggleStar={handleToggleStar}
                    onRefresh={refreshSessions}
                    onBulkDelete={bulkDeleteSessions}
                    onBulkStar={(ids, starred) => bulkUpdateSessions(ids, { starred })}
                    loading={sessionsLoading}
                    filters={sessionListFilters}
                    onFiltersChange={setSessionListFilters}
                    total={sessionsTotal}
                    page={sessionsPage}
                    totalPages={sessionsTotalPages}
                    onPageChange={goToSessionsPage}
                  />
                )}
                {activeTab === 'prs' && selectedRepo && (
                  <PRList
                    prs={prs}
                    selectedPR={selectedPR}
                    onSelectPR={handleSelectPR}
                    prCommands={commands.pr}
                    onStartSession={handleStartPRSession}
                    loading={prsLoading}
                    filters={prFilters}
                    onFiltersChange={setPRFilters}
                    sessions={sessions}
                    processes={processes}
                    onRefresh={refreshPRs}
                    page={prsPage}
                    totalPages={prsTotalPages}
                    total={prsTotal}
                    onPageChange={goToPRsPage}
                  />
                )}
                {activeTab === 'schedules' && selectedRepo && (
                  <ScheduleList
                    repoId={selectedRepo.id}
                    repoPath={selectedRepo.local_path}
                    commands={commands}
                    selectedScheduleId={selectedSchedule}
                    onSelectSchedule={(id) => {
                      setSelectedSchedule(id);
                      // Clear other selections
                      setSelectedIssue(null);
                      setSelectedPR(null);
                    }}
                    refreshRef={scheduleListRefreshRef}
                  />
                )}
                {!selectedRepo && activeTab !== 'history' && (
                  <div className="p-4 text-gray-400">Select a repository to view {activeTab}</div>
                )}
              </div>
            </Panel>
          </Group>
        </Panel>

        <ResizeHandle />

        {/* Main content */}
        <Panel minSize="400px" className="flex flex-col min-w-0">
          {/* Content area */}
          <div className="flex-1 flex min-h-0">
            {/* Side-by-side view: Issue/PR + Terminal */}
            {showSideBySide && selectedRepo && (
              <Group orientation="horizontal" className="flex-1">
                {/* Collapsible context panel (issue or PR) */}
                <Panel
                  panelRef={contextPanelRef}
                  defaultSize="40%"
                  minSize="200px"
                  maxSize="60%"
                  collapsible
                  collapsedSize="40px"
                  className="flex flex-col border-r border-gray-700"
                >
                  {/* Always-visible header with toggle button */}
                  <div className={`flex items-center p-2 border-b border-gray-700 bg-gray-800/50 shrink-0 ${issuePanelCollapsed ? 'flex-col gap-2' : 'justify-between'}`}>
                    {issuePanelCollapsed ? (
                      <>
                        <button
                          onClick={() => {
                            const panel = contextPanelRef.current;
                            if (panel?.isCollapsed()) {
                              panel.expand();
                              setIssuePanelCollapsed(false);
                            }
                          }}
                          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                          title="Expand panel"
                          aria-label={`Expand ${showIssueSideBySide ? 'issue' : 'PR'} context panel`}
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        {/* Vertical label when collapsed */}
                        <div
                          className="flex flex-col items-center gap-1 cursor-pointer group"
                          onClick={() => {
                            const panel = contextPanelRef.current;
                            if (panel?.isCollapsed()) {
                              panel.expand();
                              setIssuePanelCollapsed(false);
                            }
                          }}
                          title={`Click to expand ${showIssueSideBySide ? 'issue' : 'PR'} context`}
                        >
                          {/* Icon for content type */}
                          {showIssueSideBySide ? (
                            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" strokeWidth={2} />
                              <circle cx="12" cy="12" r="3" fill="currentColor" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                            </svg>
                          )}
                          {/* Vertical text */}
                          <span
                            className="text-xs font-medium text-gray-400 group-hover:text-gray-200 transition-colors"
                            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                          >
                            {showIssueSideBySide ? 'Issue' : 'PR'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-gray-300">
                          {showIssueSideBySide ? 'Issue Context' : 'PR Context'}
                        </span>
                        <button
                          onClick={() => {
                            const panel = contextPanelRef.current;
                            panel?.collapse();
                            setIssuePanelCollapsed(true);
                          }}
                          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                          title="Collapse panel"
                          aria-label={`Collapse ${showIssueSideBySide ? 'issue' : 'PR'} context panel`}
                        >
                          <svg
                            className="w-4 h-4 rotate-180"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                  {/* Content area - invisible when collapsed but still in layout */}
                  <div className={`flex-1 overflow-auto transition-opacity duration-150 ${issuePanelCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                        {showIssueSideBySide && activeIssueNumber && (
                          <IssueDetail
                            repoId={selectedRepo.id}
                            issueNumber={activeIssueNumber}
                            issueCommands={commands.issue}
                            onStartSession={(command) => {
                              const issue = issues.find((i) => i.number === activeIssueNumber);
                              if (issue) handleStartIssueSession(issue, command);
                            }}
                            sessions={sessions}
                            processes={processes}
                            expandedSessionId={expandedSessionId}
                            onToggleSession={setExpandedSessionId}
                            onSelectSession={handleSelectSession}
                            onContinueSession={handleContinueSession}
                            tags={tags}
                            issueTags={issueTagsMap[activeIssueNumber] || []}
                            onAddTag={(tagId) => addTagToIssue(activeIssueNumber, tagId)}
                            onRemoveTag={(tagId) => removeTagFromIssue(activeIssueNumber, tagId)}
                            onCreateTag={createTag}
                          />
                        )}
                        {showPRSideBySide && activePR && selectedRepo && (
                          <PRDetail
                            repoId={selectedRepo.id}
                            prNumber={activePR.number}
                            prCommands={commands.pr}
                            onStartSession={(command) => handleStartPRSession(activePR, command)}
                            sessions={sessions}
                            processes={processes}
                            onSelectSession={handleSelectSession}
                            onContinueSession={handleContinueSession}
                          />
                        )}
                  </div>
                </Panel>
                <ResizeHandle />
                <Panel minSize="300px" className="flex flex-col">
                  {/* Session tabs */}
                  {openSessions.length > 0 && (
                    <SessionTabs
                      sessions={openSessions}
                      processes={processes}
                      activeSessionId={activeTabSessionId}
                      onSelectSession={handleSelectSessionTab}
                      onCloseSession={handleCloseSessionTab}
                      onNewSession={handleNewProcess}
                      needsAttention={needsAttention}
                      newSessionDisabled={!selectedRepo}
                    />
                  )}
                  <div className="flex-1 min-h-0 p-2">
                    {activeProcessId && activeSession ? (
                      <SessionView
                        session={activeSession}
                        processId={activeProcessId}
                        onClose={() => {
                          killProcess(activeProcessId);
                          setActiveProcessId(null);
                        }}
                        onShowIssue={handleShowIssue}
                        onShowPR={handleShowPR}
                        onShowSchedule={handleShowSchedule}
                        issues={issues}
                        prs={prs}
                        onEntitiesChange={refreshSessions}
                        viewMode={sessionViewModes[activeSession.session_id]}
                        onViewModeChange={(mode) => handleSetSessionViewMode(activeSession.session_id, mode)}
                        needsAttention={needsAttention}
                      />
                    ) : activeProcessId ? (
                      // Fallback to terminal-only if no analysis found yet
                      <Terminal
                        processId={activeProcessId}
                        onClose={() => {
                          killProcess(activeProcessId);
                          setActiveProcessId(null);
                        }}
                      />
                    ) : viewingSession ? (
                      <SessionView
                        session={viewingSession}
                        processId={viewingSessionProcess?.id}
                        onContinue={(prompt) => handleContinueSession(viewingSession, prompt)}
                        onClose={() => setViewingSessionId(null)}
                        onDelete={async () => {
                          await deleteSession(viewingSession.session_id);
                          setViewingSessionId(null);
                        }}
                        onTitleChange={async (title) => {
                          await updateSessionMetadata(viewingSession.session_id, { title });
                        }}
                        onShowIssue={handleShowIssue}
                        onShowPR={handleShowPR}
                        onShowSchedule={handleShowSchedule}
                        issues={issues}
                        prs={prs}
                        onEntitiesChange={refreshSessions}
                        viewMode={sessionViewModes[viewingSession.session_id]}
                        onViewModeChange={(mode) => handleSetSessionViewMode(viewingSession.session_id, mode)}
                        needsAttention={needsAttention}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center text-gray-400">
                          <p className="text-sm">Select a session above</p>
                          <p className="text-xs mt-1">or click a tab to view</p>
                        </div>
                      </div>
                    )}
                  </div>
                </Panel>
              </Group>
            )}

            {/* Issue creation panel */}
            {isCreatingIssue && selectedRepo && (
              <div className="flex-1 border-r border-gray-700 overflow-auto">
                <IssueCreateView
                  repoId={selectedRepo.id}
                  onCancel={() => setIsCreatingIssue(false)}
                  onCreated={(issue) => {
                    setIsCreatingIssue(false);
                    setSelectedIssue(issue.number);
                    refreshIssues();
                  }}
                />
              </div>
            )}

            {/* Issue detail panel only (when issue selected but no sessions) */}
            {selectedIssue && selectedRepo && !showSideBySide && !selectedPR && !isCreatingIssue && (
              <div className="flex-1 border-r border-gray-700 overflow-auto">
                <IssueDetail
                  repoId={selectedRepo.id}
                  issueNumber={selectedIssue}
                  issueCommands={commands.issue}
                  onStartSession={(command) => {
                    const issue = issues.find((i) => i.number === selectedIssue);
                    if (issue) handleStartIssueSession(issue, command);
                  }}
                  sessions={sessions}
                  processes={processes}
                  expandedSessionId={expandedSessionId}
                  onToggleSession={setExpandedSessionId}
                  onSelectSession={handleSelectSession}
                  onContinueSession={handleContinueSession}
                  tags={tags}
                  issueTags={issueTagsMap[selectedIssue] || []}
                  onAddTag={(tagId) => addTagToIssue(selectedIssue, tagId)}
                  onRemoveTag={(tagId) => removeTagFromIssue(selectedIssue, tagId)}
                  onCreateTag={createTag}
                />
              </div>
            )}

            {/* PR detail panel only (when PR selected but no sessions) */}
            {selectedPRData && selectedRepo && !showSideBySide && (
              <div className="flex-1 border-r border-gray-700 overflow-auto">
                <PRDetail
                  repoId={selectedRepo.id}
                  prNumber={selectedPRData.number}
                  prCommands={commands.pr}
                  onStartSession={(command) => handleStartPRSession(selectedPRData, command)}
                  sessions={sessions}
                  processes={processes}
                  onSelectSession={handleSelectSession}
                  onContinueSession={handleContinueSession}
                />
              </div>
            )}

            {/* Schedule detail panel (when schedule selected) */}
            {selectedSchedule && selectedRepo && !showSideBySide && !selectedIssue && !selectedPR && (
              <div className="flex-1 border-r border-gray-700 overflow-auto">
                <ScheduleDetail
                  repoId={selectedRepo.id}
                  scheduleId={selectedSchedule}
                  onShowSession={(sessionId) => {
                    const session = sessions.find(s => s.session_id === sessionId);
                    if (session) {
                      handleSelectSession(session);
                    }
                  }}
                  sessions={sessions}
                  commands={commands}
                  onScheduleDeleted={() => setSelectedSchedule(null)}
                  onScheduleUpdated={() => {
                    // Refresh schedules list to show updated data in cards
                    scheduleListRefreshRef.current?.();
                  }}
                />
              </div>
            )}

            {/* Sessions panel (no issue/PR context but open sessions exist) */}
            {openSessions.length > 0 && !hasIssueContext && !hasPRContext && (
              <div className="flex-1 flex flex-col">
                <SessionTabs
                  sessions={openSessions}
                  processes={processes}
                  activeSessionId={activeTabSessionId}
                  onSelectSession={handleSelectSessionTab}
                  onCloseSession={handleCloseSessionTab}
                  onNewSession={handleNewProcess}
                  needsAttention={needsAttention}
                  newSessionDisabled={!selectedRepo}
                />
                <div className="flex-1 min-h-0 p-2">
                  {activeProcessId && activeSession ? (
                    <SessionView
                      session={activeSession}
                      processId={activeProcessId}
                      onClose={() => {
                        killProcess(activeProcessId);
                        setActiveProcessId(null);
                      }}
                      onShowIssue={handleShowIssue}
                      onShowPR={handleShowPR}
                      onShowSchedule={handleShowSchedule}
                      issues={issues}
                      prs={prs}
                      onEntitiesChange={refreshSessions}
                      viewMode={sessionViewModes[activeSession.session_id]}
                      onViewModeChange={(mode) => handleSetSessionViewMode(activeSession.session_id, mode)}
                      needsAttention={needsAttention}
                    />
                  ) : activeProcessId ? (
                    // Fallback to terminal-only if no analysis found yet
                    <Terminal
                      processId={activeProcessId}
                      onClose={() => {
                        killProcess(activeProcessId);
                        setActiveProcessId(null);
                      }}
                    />
                  ) : viewingSession ? (
                    <SessionView
                      session={viewingSession}
                      processId={viewingSessionProcess?.id}
                      onContinue={(prompt) => handleContinueSession(viewingSession, prompt)}
                      onClose={() => setViewingSessionId(null)}
                      onDelete={async () => {
                        await deleteSession(viewingSession.session_id);
                        setViewingSessionId(null);
                      }}
                      onTitleChange={async (title) => {
                        await updateSessionMetadata(viewingSession.session_id, { title });
                      }}
                      onShowIssue={handleShowIssue}
                      onShowPR={handleShowPR}
                      onShowSchedule={handleShowSchedule}
                      issues={issues}
                      prs={prs}
                      onEntitiesChange={refreshSessions}
                      viewMode={sessionViewModes[viewingSession.session_id]}
                      onViewModeChange={(mode) => handleSetSessionViewMode(viewingSession.session_id, mode)}
                      needsAttention={needsAttention}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center p-8">
                      <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs empty-state-enter">
                        <div className="w-12 h-12 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4 empty-state-icon-float">
                          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </div>
                        <p className="text-gray-300 font-medium mb-1">Select a session</p>
                        <p className="text-gray-400 text-sm">Click a tab above to view the conversation</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty state (no open session tabs and no issue/PR/schedule selected) */}
            {openSessions.length === 0 && !selectedIssue && !selectedPR && !selectedSchedule && (
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
            )}
          </div>
        </Panel>
      </Group>
    </div>
  );
}
