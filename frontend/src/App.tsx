import { useState, useCallback, useEffect, useRef } from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { useRepos, useIssues, usePRs, useProcesses, useSessions, useTags, useIssueTags, useCommands, useSessionCounts, buildPromptFromTemplate } from './hooks/useApi';
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

type Tab = 'issues' | 'prs' | 'sessions';

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
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [issueFilters, setIssueFilters] = useState<IssueFilters>({ state: 'open' });
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionListFilters, setSessionListFilters] = useState<SessionListFilters>({ category: 'all' });
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [selectedPR, setSelectedPR] = useState<number | null>(null);
  const [prFilters, setPRFilters] = useState<PRFilters>({ state: 'open' });
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  // Track view mode (transcript vs terminal) per session
  const [sessionViewModes, setSessionViewModes] = useState<Record<string, 'transcript' | 'terminal'>>({});

  // Track pending issue/PR context to show side-by-side view immediately
  const pendingIssueContextRef = useRef<PendingIssueContext | null>(null);
  const pendingPRContextRef = useRef<PendingPRContext | null>(null);

  // Ref for collapsible issue/PR context panel
  const contextPanelRef = useRef<PanelImperativeHandle>(null);

  // Track previous repo for saving tabs on switch
  const prevRepoIdRef = useRef<number | null>(null);

  // Refs for current tab state (used for saving on repo switch)
  const openSessionIdsRef = useRef<string[]>([]);
  const activeTabSessionIdRef = useRef<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    openSessionIdsRef.current = openSessionIds;
    activeTabSessionIdRef.current = activeTabSessionId;
  }, [openSessionIds, activeTabSessionId]);

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
  const { processes, createProcess, killProcess, addProcess } = useProcesses();
  // Build session filters based on UI state
  const sessionFilters: SessionFilters = {
    repoPath: selectedRepo?.local_path,
    search: sessionListFilters.search || undefined,
    starred: sessionListFilters.category === 'starred' ? true : undefined,
    hasEntities: sessionListFilters.category === 'with-entities' ? true : undefined,
    isActive: sessionListFilters.category === 'active' ? true : undefined,
  };
  const { sessions, loading: sessionsLoading, refresh: refreshSessions, continueSession, deleteSession, updateSessionMetadata, total: sessionsTotal, page: sessionsPage, totalPages: sessionsTotalPages, goToPage: goToSessionsPage } = useSessions(sessionFilters);
  const { tags, createTag } = useTags(selectedRepo?.id ?? null);
  const { issueTagsMap, addTagToIssue, removeTagFromIssue } = useIssueTags(selectedRepo?.id ?? null);
  const { prs, loading: prsLoading } = usePRs(selectedRepo?.id ?? null, prFilters);
  const { commands, refresh: refreshCommands } = useCommands(selectedRepo?.local_path);
  const { counts: sessionCounts } = useSessionCounts();

  // Save/restore session tabs when repo changes
  useEffect(() => {
    const STORAGE_KEY = 'clump:repoSessionTabs';

    // Save tabs for previous repo before switching (use refs for current values)
    if (prevRepoIdRef.current !== null && prevRepoIdRef.current !== selectedRepo?.id) {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        stored[prevRepoIdRef.current] = {
          openSessionIds: openSessionIdsRef.current,
          activeTabSessionId: activeTabSessionIdRef.current,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch (e) {
        console.error('Failed to save session tabs:', e);
      }
    }

    // Clear filters
    setSelectedTagId(null);
    setIssueFilters({ state: 'open' });
    setPRFilters({ state: 'open' });
    setSessionListFilters({ category: 'all' });

    // Clear selections (issues/PRs belong to specific repos)
    setSelectedIssue(null);
    setSelectedPR(null);

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
    } else {
      setOpenSessionIds([]);
      setActiveTabSessionId(null);
      setViewingSessionId(null);
    }

    // Clear process (we'll check if any restored tabs have running processes separately)
    setActiveProcessId(null);
    setExpandedSessionId(null);

    // Clear pending context refs
    pendingIssueContextRef.current = null;
    pendingPRContextRef.current = null;

    // Update ref for next switch
    prevRepoIdRef.current = selectedRepo?.id ?? null;
  }, [selectedRepo?.id]); // Note: We intentionally don't include openSessionIds/activeTabSessionId to avoid loops

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

  // Refresh sessions periodically to update status indicators
  useEffect(() => {
    const interval = setInterval(refreshSessions, 5000);
    return () => clearInterval(interval);
  }, [refreshSessions]);

  const handleStartIssueSession = useCallback(
    async (issue: Issue, command: CommandMetadata) => {
      if (!selectedRepo) return;

      const prompt = buildPromptFromTemplate(command.template, {
        number: issue.number,
        title: issue.title,
        body: issue.body,
      });

      const process = await createProcess(
        selectedRepo.id,
        prompt,
        'issue',
        [{ kind: 'issue', number: issue.number }],
        `${command.name}: Issue #${issue.number}`
      );

      // Store pending context so side-by-side view shows immediately
      // (before session is created and fetched via polling)
      pendingIssueContextRef.current = {
        processId: process.id,
        issueNumber: issue.number,
      };

      setActiveProcessId(process.id);

      // Add session to open tabs if claude_session_id is available
      if (process.claude_session_id) {
        setOpenSessionIds(prev => prev.includes(process.claude_session_id!) ? prev : [...prev, process.claude_session_id!]);
        setActiveTabSessionId(process.claude_session_id);
      }

      // Trigger immediate refresh to get session data sooner
      setTimeout(refreshSessions, 500);
    },
    [selectedRepo, createProcess, refreshSessions]
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

      const process = await createProcess(
        selectedRepo.id,
        prompt,
        'pr',
        [{ kind: 'pr', number: pr.number }],
        `${command.name}: PR #${pr.number}`
      );

      // Store pending context so side-by-side view shows immediately
      pendingPRContextRef.current = {
        processId: process.id,
        prNumber: pr.number,
      };

      setActiveProcessId(process.id);

      // Add session to open tabs if claude_session_id is available
      if (process.claude_session_id) {
        setOpenSessionIds(prev => prev.includes(process.claude_session_id!) ? prev : [...prev, process.claude_session_id!]);
        setActiveTabSessionId(process.claude_session_id);
      }

      // Trigger immediate refresh to get analysis data sooner
      setTimeout(refreshSessions, 500);
    },
    [selectedRepo, createProcess, refreshSessions]
  );

  const handleNewProcess = useCallback(async () => {
    if (!selectedRepo) return;

    const process = await createProcess(
      selectedRepo.id,
      undefined,
      'custom',
      [],
      'New Session'
    );

    setActiveProcessId(process.id);

    // Add session to open tabs if claude_session_id is available
    if (process.claude_session_id) {
      setOpenSessionIds(prev => prev.includes(process.claude_session_id!) ? prev : [...prev, process.claude_session_id!]);
      setActiveTabSessionId(process.claude_session_id);
    }

    // Trigger immediate refresh to get session data sooner
    setTimeout(refreshSessions, 500);
  }, [selectedRepo, createProcess, refreshSessions]);

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
  }, [settingsOpen, shortcutsOpen, activeProcessId, selectedIssue, selectedPR, activeTab]);

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
    async (session: SessionSummary) => {
      // Use the continue endpoint - creates a new process resuming the conversation
      const process = await continueSession(session.session_id);

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
    const session = sessions.find(s => s.session_id === sessionId);
    if (session?.is_active) {
      const activeProcess = processes.find(p => p.claude_session_id === sessionId);
      if (activeProcess) {
        killProcess(activeProcess.id);
      }
    }

    // Remove from open tabs
    setOpenSessionIds(prev => prev.filter(id => id !== sessionId));

    // If this was the active tab, clear it
    if (activeTabSessionId === sessionId) {
      setActiveTabSessionId(null);
      setActiveProcessId(null);
      setViewingSessionId(null);
    }
  }, [sessions, processes, killProcess, activeTabSessionId]);

  // Handler for selecting a session tab
  const handleSelectSessionTab = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.session_id === sessionId);
    if (!session) return;

    setActiveTabSessionId(sessionId);

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
  }, [sessions, processes]);

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
  // synthesize a minimal session from process data so the tab appears immediately
  const openSessions = openSessionIds
    .map(id => {
      // First try to find in fetched sessions
      const session = sessions.find(s => s.session_id === id);
      if (session) return session;

      // If not found, check if there's an active process for this session
      const process = processes.find(p => p.claude_session_id === id);
      if (process && selectedRepo) {
        // Create a synthetic session from process data (optimistic UI)
        return {
          session_id: id,
          encoded_path: '',
          repo_path: process.working_dir,
          repo_name: `${selectedRepo.owner}/${selectedRepo.name}`,
          title: 'New Session',
          model: null,
          start_time: process.created_at,
          end_time: null,
          message_count: 0,
          modified_at: process.created_at,
          file_size: 0,
          entities: [],
          tags: [],
          starred: false,
          is_active: true,
        } as SessionSummary;
      }
      return null;
    })
    .filter((s): s is SessionSummary => !!s);

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
          {/* Keyboard shortcuts hint */}
          <button
            onClick={() => setShortcutsOpen(true)}
            className="hidden sm:flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors focus:outline-none focus:text-gray-300"
            title="Keyboard shortcuts (?)"
          >
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-gray-400">?</kbd>
            <span>Help</span>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            {(['issues', 'prs', 'sessions'] as Tab[]).map((tab) => {
              // Get count for each tab
              const count = tab === 'issues' ? issuesTotal
                : tab === 'prs' ? prs.length
                : sessionsTotal;
              const hasRunning = tab === 'sessions' && sessions.some(s =>
                s.is_active && processes.some(p => p.claude_session_id === s.session_id)
              );

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                    activeTab === tab
                      ? 'text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
                >
                  {tab}
                  {selectedRepo && count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${
                      activeTab === tab
                        ? hasRunning ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
                        : hasRunning ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-400'
                    }`}>
                      {hasRunning && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse mr-1" />
                      )}
                      {count > 999 ? '999+' : count}
                    </span>
                  )}
                </button>
              );
            })}
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
                onCreateIssue={() => {
                  setIsCreatingIssue(true);
                  setSelectedIssue(null);
                }}
              />
            )}
            {activeTab === 'sessions' && (
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
              />
            )}
            {!selectedRepo && activeTab !== 'sessions' && (
              <div className="p-4 text-gray-400">Select a repository to view {activeTab}</div>
            )}
          </div>
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
                  <div className="flex items-center justify-between p-2 border-b border-gray-700 bg-gray-800/50 shrink-0">
                    {!issuePanelCollapsed && (
                      <span className="text-sm font-medium text-gray-300">
                        {showIssueSideBySide ? 'Issue Context' : 'PR Context'}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        const panel = contextPanelRef.current;
                        if (panel?.isCollapsed()) {
                          panel.expand();
                          setIssuePanelCollapsed(false);
                        } else {
                          panel?.collapse();
                          setIssuePanelCollapsed(true);
                        }
                      }}
                      className={`p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white ${issuePanelCollapsed ? 'mx-auto' : ''}`}
                      title={issuePanelCollapsed ? "Expand panel" : "Collapse panel"}
                    >
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${issuePanelCollapsed ? '' : 'rotate-180'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
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
                        {showPRSideBySide && activePR && (
                          <PRDetail
                            pr={activePR}
                            prCommands={commands.pr}
                            onStartSession={(command) => handleStartPRSession(activePR, command)}
                            sessions={sessions}
                            processes={processes}
                            onSelectSession={handleSelectSession}
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
                        issues={issues}
                        prs={prs}
                        onEntitiesChange={refreshSessions}
                        viewMode={sessionViewModes[activeSession.session_id]}
                        onViewModeChange={(mode) => handleSetSessionViewMode(activeSession.session_id, mode)}
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
                        onContinue={() => handleContinueSession(viewingSession)}
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
                        issues={issues}
                        prs={prs}
                        onEntitiesChange={refreshSessions}
                        viewMode={sessionViewModes[viewingSession.session_id]}
                        onViewModeChange={(mode) => handleSetSessionViewMode(viewingSession.session_id, mode)}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center text-gray-500">
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
                  pr={selectedPRData}
                  prCommands={commands.pr}
                  onStartSession={(command) => handleStartPRSession(selectedPRData, command)}
                  sessions={sessions}
                  processes={processes}
                  onSelectSession={handleSelectSession}
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
                      issues={issues}
                      prs={prs}
                      onEntitiesChange={refreshSessions}
                      viewMode={sessionViewModes[activeSession.session_id]}
                      onViewModeChange={(mode) => handleSetSessionViewMode(activeSession.session_id, mode)}
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
                      onContinue={() => handleContinueSession(viewingSession)}
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
                      issues={issues}
                      prs={prs}
                      onEntitiesChange={refreshSessions}
                      viewMode={sessionViewModes[viewingSession.session_id]}
                      onViewModeChange={(mode) => handleSetSessionViewMode(viewingSession.session_id, mode)}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center text-gray-500">
                        <p className="text-sm">Select a session above</p>
                        <p className="text-xs mt-1">or select an issue/PR from the sidebar</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty state (no open session tabs and no issue/PR selected) */}
            {openSessions.length === 0 && !selectedIssue && !selectedPR && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center p-8 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-sm">
                  <div className="w-16 h-16 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-5">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                  </div>
                  <p className="text-gray-300 font-medium mb-2">Select an issue or PR to view details</p>
                  <p className="text-gray-500 text-sm">or start a session from an issue or PR</p>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </Group>
    </div>
  );
}
