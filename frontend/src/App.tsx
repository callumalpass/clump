import { useState, useCallback, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { useRepos, useIssues, usePRs, useProcesses, useSessions, useTags, useIssueTags, useCommands, useSessionCounts, useStats, buildPromptFromTemplate } from './hooks/useApi';
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
import type { Repo, Issue, PR, SessionSummary, CommandMetadata } from './types';
import type { SessionListFilters } from './components/SessionList';

function ResizeHandle() {
  return (
    <Separator className="group relative flex items-center justify-center w-2 cursor-col-resize transition-all">
      {/* Visible drag line */}
      <div className="w-px h-full bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
      {/* Grip dots indicator - visible on hover */}
      <div className="absolute inset-y-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="w-1 h-1 rounded-full bg-blue-400" />
        <div className="w-1 h-1 rounded-full bg-blue-400" />
        <div className="w-1 h-1 rounded-full bg-blue-400" />
      </div>
    </Separator>
  );
}

function HorizontalResizeHandle() {
  return (
    <Separator className="group relative flex items-center justify-center h-2 cursor-row-resize transition-all">
      {/* Visible drag line */}
      <div className="h-px w-full bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
      {/* Grip dots indicator - visible on hover */}
      <div className="absolute inset-x-0 flex flex-row items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="w-1 h-1 rounded-full bg-blue-400" />
        <div className="w-1 h-1 rounded-full bg-blue-400" />
        <div className="w-1 h-1 rounded-full bg-blue-400" />
      </div>
    </Separator>
  );
}

type Tab = 'issues' | 'prs' | 'history' | 'schedules';

// Simple LRU cache for session data to prevent unbounded memory growth
class LRUSessionCache {
  private cache = new Map<string, SessionSummary>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(key: string): SessionSummary | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: SessionSummary): void {
    // If key exists, delete it first (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
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
  entities: { kind: string; number: number }[];
}

export default function App() {
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('issues');
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

  // Track pending issue/PR context to show side-by-side view immediately
  const pendingIssueContextRef = useRef<PendingIssueContext | null>(null);
  const pendingPRContextRef = useRef<PendingPRContext | null>(null);

  // Track pending session data for optimistic UI (title, entities before backend returns)
  const pendingSessionsRef = useRef<Map<string, PendingSessionData>>(new Map());

  // LRU cache for session data - prevents unbounded memory growth
  // Sessions are cached when viewed so tabs persist across page changes
  const cachedSessionsRef = useRef(new LRUSessionCache(100));

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
    isActive: sessionListFilters.category === 'active' ? true : undefined,
    sort: sessionListFilters.sort,
    order: sessionListFilters.order,
  };
  const { sessions, loading: sessionsLoading, refresh: refreshSessions, continueSession, deleteSession, updateSessionMetadata, total: sessionsTotal, page: sessionsPage, totalPages: sessionsTotalPages, goToPage: goToSessionsPage } = useSessions(sessionFilters);
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

    // Clear process (we'll check if any restored tabs have running processes separately)
    setActiveProcessId(null);
    setExpandedSessionId(null);

    // Clear pending context refs and session cache
    pendingIssueContextRef.current = null;
    pendingPRContextRef.current = null;
    cachedSessionsRef.current.clear();
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
      const entities = [{ kind: 'issue', number: issue.number }];

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
      const entities = [{ kind: 'pr', number: pr.number }];

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
    const entities: { kind: string; number: number }[] = [];

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

  // Global keyboard shortcuts (basic navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow Escape in inputs
        if (e.key !== 'Escape') return;
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
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else if (settingsOpen) {
          setSettingsOpen(false);
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
  }, [settingsOpen, shortcutsOpen, activeProcessId, selectedIssue, selectedPR, activeTab, issuesPage, issuesTotalPages, goToIssuesPage, prsPage, prsTotalPages, goToPRsPage, sessionsPage, sessionsTotalPages, goToSessionsPage]);

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
  const activeSession = activeProcess?.claude_session_id
    ? sessions.find(s => s.session_id === activeProcess.claude_session_id)
    : null;

  // Find the session being viewed (for transcript panel)
  const viewingSession = viewingSessionId
    ? sessions.find(s => s.session_id === viewingSessionId)
    : null;

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

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#161b22]">
        <h1 className="text-lg font-semibold">Clump</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {processes.length} active process{processes.length !== 1 ? 'es' : ''}
          </span>
          {/* Usage stats summary */}
          {stats && (
            <button
              onClick={() => setActiveTab('stats')}
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
                {(['issues', 'prs', 'history', 'schedules', 'stats'] as Tab[]).map((tab) => {
                  // Get count for each tab
                  const count = tab === 'issues' ? issuesTotal
                    : tab === 'prs' ? prsTotal
                    : tab === 'history' ? sessionsTotal
                    : 0; // schedules don't show count

                  return (
                    <button
                      key={tab}
                      ref={(el) => {
                        if (el) tabRefs.current.set(tab, el);
                      }}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 px-4 py-2 text-sm capitalize outline-none focus-visible:bg-blue-500/10 focus-visible:text-blue-300 flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                        activeTab === tab
                          ? 'text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                      }`}
                    >
                      {tab}
                      {(selectedRepo || tab === 'history') && count > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${
                          activeTab === tab
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {count > 999 ? '999+' : count}
                        </span>
                      )}
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

              {/* List content */}
              <div className="flex-1 min-h-0 flex flex-col">
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
                {activeTab === 'stats' && (
                  <StatsView
                    stats={stats}
                    loading={statsLoading}
                    error={statsError}
                    onRefresh={refreshStats}
                  />
                )}
                {!selectedRepo && activeTab !== 'history' && activeTab !== 'stats' && (
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
                        <p className="text-xs mt-1">or select an issue/PR from the sidebar</p>
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
