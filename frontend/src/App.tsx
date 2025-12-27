import { useState, useCallback, useEffect, useRef } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useRepos, useIssues, useSessions, useAnalyses, useTags, useIssueTags } from './hooks/useApi';
import type { IssueFilters, AnalysisStatusFilter } from './hooks/useApi';
import { RepoSelector } from './components/RepoSelector';
import { IssueList } from './components/IssueList';
import { IssueDetail } from './components/IssueDetail';
import { Terminal } from './components/Terminal';
import { TranscriptPanel } from './components/TranscriptPanel';
import { SessionTabs } from './components/SessionTabs';
import { AnalysisList } from './components/AnalysisList';
import { Settings } from './components/Settings';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import type { Repo, Issue, Analysis } from './types';
import type { AnalysisTypeConfig } from './constants/analysisTypes';
import { DEFAULT_ANALYSIS_TYPE } from './constants/analysisTypes';

function ResizeHandle() {
  return (
    <Separator className="group relative flex items-center justify-center w-1 hover:w-2 transition-all">
      <div className="w-px h-full bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
    </Separator>
  );
}

type Tab = 'issues' | 'prs' | 'analyses';

// Track pending issue context for sessions being created
// This fixes the race condition where the sidepane doesn't show the issue
// until the analysis is created and fetched via polling
interface PendingIssueContext {
  sessionId: string;
  issueNumber: number;
}

export default function App() {
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('issues');
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [issuePanelCollapsed, setIssuePanelCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [issueFilters, setIssueFilters] = useState<IssueFilters>({ state: 'open' });
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<number | null>(null);
  const [analysisStatusFilter, setAnalysisStatusFilter] = useState<AnalysisStatusFilter>('all');
  const [viewingAnalysisId, setViewingAnalysisId] = useState<number | null>(null);

  // Track pending issue context to show side-by-side view immediately
  const pendingIssueContextRef = useRef<PendingIssueContext | null>(null);

  const { repos, addRepo } = useRepos();
  const {
    issues,
    loading: issuesLoading,
    refresh: _refreshIssues,
    page: issuesPage,
    totalPages: issuesTotalPages,
    total: issuesTotal,
    goToPage: goToIssuesPage,
  } = useIssues(selectedRepo?.id ?? null, issueFilters);
  void _refreshIssues; // Reserved for future use
  const { sessions, createSession, killSession, addSession } = useSessions();
  const { analyses, loading: analysesLoading, refresh: refreshAnalyses, deleteAnalysis, continueAnalysis, total: analysesTotal } = useAnalyses(
    selectedRepo?.id,
    searchQuery || undefined,
    analysisStatusFilter
  );
  const { tags, createTag } = useTags(selectedRepo?.id ?? null);
  const { issueTagsMap, addTagToIssue, removeTagFromIssue } = useIssueTags(selectedRepo?.id ?? null);

  // Clear filters when repo changes
  useEffect(() => {
    setSelectedTagId(null);
    setIssueFilters({ state: 'open' });
  }, [selectedRepo?.id]);

  // Handle issue selection from list - clears expanded analysis
  const handleSelectIssue = useCallback((issueNumber: number) => {
    setSelectedIssue(issueNumber);
    setExpandedAnalysisId(null);
  }, []);

  // Refresh analyses periodically to update status indicators
  useEffect(() => {
    const interval = setInterval(refreshAnalyses, 5000);
    return () => clearInterval(interval);
  }, [refreshAnalyses]);

  const handleAnalyzeIssue = useCallback(
    async (issue: Issue, analysisType: AnalysisTypeConfig = DEFAULT_ANALYSIS_TYPE) => {
      if (!selectedRepo) return;

      const prompt = analysisType.buildPrompt({
        number: issue.number,
        title: issue.title,
        body: issue.body,
      });

      const session = await createSession(
        selectedRepo.id,
        prompt,
        'issue',
        issue.number.toString(),
        `${analysisType.name}: Issue #${issue.number}`
      );

      // Store pending context so side-by-side view shows immediately
      // (before analysis is created and fetched via polling)
      pendingIssueContextRef.current = {
        sessionId: session.id,
        issueNumber: issue.number,
      };

      setActiveSessionId(session.id);

      // Trigger immediate refresh to get analysis data sooner
      setTimeout(refreshAnalyses, 500);
    },
    [selectedRepo, createSession, refreshAnalyses]
  );

  const handleNewSession = useCallback(async () => {
    if (!selectedRepo) return;

    const session = await createSession(
      selectedRepo.id,
      undefined,
      'custom',
      undefined,
      'New Session'
    );

    setActiveSessionId(session.id);
  }, [selectedRepo, createSession]);

  // Global keyboard shortcuts
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

      // "/" : Focus search (switch to analyses tab) - like GitHub/Slack
      if (e.key === '/') {
        e.preventDefault();
        setActiveTab('analyses');
        // Focus the search input after a short delay
        setTimeout(() => {
          const searchInput = document.querySelector('input[placeholder="Search analyses..."]') as HTMLInputElement;
          searchInput?.focus();
        }, 50);
        return;
      }

      // Escape: Close modals, deselect issue, or close terminal
      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        } else if (activeSessionId) {
          setActiveSessionId(null);
        } else if (selectedIssue) {
          setSelectedIssue(null);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen, shortcutsOpen, activeSessionId, selectedIssue]);

  const handleSelectAnalysis = useCallback((analysis: Analysis) => {
    // Check if this analysis has an active session we can view
    const activeSession = sessions.find(s => s.id === analysis.session_id);

    // If it's an issue analysis, always select the issue for context
    if (analysis.type === 'issue' && analysis.entity_id) {
      setSelectedIssue(parseInt(analysis.entity_id, 10));
    }

    if (activeSession) {
      // Session is still running - open the terminal
      setActiveSessionId(analysis.session_id);
      setViewingAnalysisId(null);
      setExpandedAnalysisId(null);

      // Store pending context for immediate side-by-side view
      if (analysis.type === 'issue' && analysis.entity_id) {
        pendingIssueContextRef.current = {
          sessionId: analysis.session_id!,
          issueNumber: parseInt(analysis.entity_id, 10),
        };
      }
    } else {
      // Session ended - show transcript in details panel
      setActiveSessionId(null);
      setViewingAnalysisId(analysis.id);
      setExpandedAnalysisId(null);
    }
  }, [sessions]);

  const handleContinueAnalysis = useCallback(
    async (analysis: Analysis) => {
      if (!analysis.claude_session_id) return;

      // Use the new continue endpoint - this reuses the existing analysis record
      const session = await continueAnalysis(analysis.id);

      // Add the new session to state immediately
      addSession(session);

      // Store pending context for issue analyses so side-by-side shows immediately
      if (analysis.type === 'issue' && analysis.entity_id) {
        pendingIssueContextRef.current = {
          sessionId: session.id,
          issueNumber: parseInt(analysis.entity_id, 10),
        };
      }

      // Clear viewing state and switch to terminal
      setViewingAnalysisId(null);
      setActiveSessionId(session.id);
    },
    [continueAnalysis, addSession]
  );

  const handleDeleteAnalysis = useCallback(
    async (analysis: Analysis) => {
      await deleteAnalysis(analysis.id);
    },
    [deleteAnalysis]
  );

  // Find the active session's related issue (if any)
  // First try to find via active session, then fallback to matching session_id in analyses
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const activeAnalysis = activeSession?.analysis_id
    ? analyses.find(a => a.id === activeSession.analysis_id)
    : analyses.find(a => a.session_id === activeSessionId);

  // Find the analysis being viewed (for transcript panel)
  const viewingAnalysis = viewingAnalysisId
    ? analyses.find(a => a.id === viewingAnalysisId)
    : null;

  // Check pending context for newly created sessions (before analysis is fetched)
  const pendingContext = pendingIssueContextRef.current;
  const hasPendingIssue = pendingContext && pendingContext.sessionId === activeSessionId;

  // Clear pending context once analysis is loaded
  if (activeAnalysis && hasPendingIssue) {
    pendingIssueContextRef.current = null;
  }

  // Show side-by-side if we have an active session/transcript AND any issue context
  const showSideBySide = (activeSessionId || viewingAnalysis) && (
    (activeAnalysis?.type === 'issue' && activeAnalysis?.entity_id) ||
    (viewingAnalysis?.type === 'issue' && viewingAnalysis?.entity_id) ||
    hasPendingIssue ||
    selectedIssue
  );

  // Determine the issue number to display - prefer user selection, fallback to analysis context
  const activeIssueNumber = selectedIssue ?? (
    activeAnalysis?.entity_id
      ? parseInt(activeAnalysis.entity_id, 10)
      : viewingAnalysis?.entity_id
        ? parseInt(viewingAnalysis.entity_id, 10)
        : hasPendingIssue
          ? pendingContext.issueNumber
          : null
  );

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#161b22]">
        <h1 className="text-lg font-semibold">Clump</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {sessions.length} active session{sessions.length !== 1 ? 's' : ''}
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
      <Settings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <Group orientation="horizontal" className="flex-1 min-h-0">
        {/* Left sidebar */}
        <Panel defaultSize={20} minSize={15} maxSize={35} className="border-r border-gray-700 flex flex-col bg-[#0d1117]">
          <RepoSelector
            repos={repos}
            selectedRepo={selectedRepo}
            onSelectRepo={setSelectedRepo}
            onAddRepo={addRepo}
          />

          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            {(['issues', 'prs', 'analyses'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
                  activeTab === tab
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search (for analyses) */}
          {activeTab === 'analyses' && (
            <div className="p-2 border-b border-gray-700">
              <input
                type="text"
                placeholder="Search analyses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* List content */}
          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab === 'issues' && selectedRepo && (
              <IssueList
                issues={issues}
                selectedIssue={selectedIssue}
                onSelectIssue={handleSelectIssue}
                onAnalyzeIssue={handleAnalyzeIssue}
                loading={issuesLoading}
                page={issuesPage}
                totalPages={issuesTotalPages}
                total={issuesTotal}
                onPageChange={goToIssuesPage}
                analyses={analyses}
                sessions={sessions}
                tags={tags}
                issueTagsMap={issueTagsMap}
                selectedTagId={selectedTagId}
                onSelectTag={setSelectedTagId}
                filters={issueFilters}
                onFiltersChange={setIssueFilters}
              />
            )}
            {activeTab === 'analyses' && (
              <AnalysisList
                analyses={analyses}
                sessions={sessions}
                onSelectAnalysis={handleSelectAnalysis}
                onContinueAnalysis={handleContinueAnalysis}
                onDeleteAnalysis={handleDeleteAnalysis}
                loading={analysesLoading}
                statusFilter={analysisStatusFilter}
                onStatusFilterChange={setAnalysisStatusFilter}
                total={analysesTotal}
              />
            )}
            {activeTab === 'prs' && (
              <div className="p-4 text-gray-400">PR view coming soon</div>
            )}
            {!selectedRepo && activeTab !== 'analyses' && (
              <div className="p-4 text-gray-400">Select a repository to view {activeTab}</div>
            )}
          </div>
        </Panel>

        <ResizeHandle />

        {/* Main content */}
        <Panel defaultSize={80} minSize={40} className="flex flex-col min-w-0">
          {/* Session tabs */}
          {sessions.length > 0 && (
            <SessionTabs
              sessions={sessions}
              activeSession={activeSessionId}
              onSelectSession={setActiveSessionId}
              onCloseSession={killSession}
              onNewSession={handleNewSession}
              analyses={analyses}
            />
          )}

          {/* Content area */}
          <div className="flex-1 flex min-h-0">
            {/* Side-by-side view: Issue + Terminal */}
            {showSideBySide && selectedRepo && (
              <Group orientation="horizontal" className="flex-1">
                {/* Collapsible issue panel */}
                <Panel
                  defaultSize={issuePanelCollapsed ? 3 : 40}
                  minSize={3}
                  maxSize={60}
                  collapsible
                  collapsedSize={3}
                  className="flex flex-col border-r border-gray-700"
                >
                  {issuePanelCollapsed ? (
                    <button
                      onClick={() => setIssuePanelCollapsed(false)}
                      className="h-full w-full flex items-center justify-center hover:bg-gray-800 text-gray-400 hover:text-white"
                      title="Show issue details"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between p-2 border-b border-gray-700 bg-gray-800/50">
                        <span className="text-sm font-medium text-gray-300">Issue Context</span>
                        <button
                          onClick={() => setIssuePanelCollapsed(true)}
                          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                          title="Collapse panel"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex-1 overflow-auto">
                        {activeIssueNumber && (
                          <IssueDetail
                            repoId={selectedRepo.id}
                            issueNumber={activeIssueNumber}
                            onAnalyze={(analysisType) => {
                              const issue = issues.find((i) => i.number === activeIssueNumber);
                              if (issue) handleAnalyzeIssue(issue, analysisType);
                            }}
                            analyses={analyses}
                            sessions={sessions}
                            expandedAnalysisId={expandedAnalysisId}
                            onToggleAnalysis={setExpandedAnalysisId}
                            onSelectAnalysis={handleSelectAnalysis}
                            onContinueAnalysis={handleContinueAnalysis}
                            onDeleteAnalysis={handleDeleteAnalysis}
                            tags={tags}
                            issueTags={issueTagsMap[activeIssueNumber] || []}
                            onAddTag={(tagId) => addTagToIssue(activeIssueNumber, tagId)}
                            onRemoveTag={(tagId) => removeTagFromIssue(activeIssueNumber, tagId)}
                            onCreateTag={createTag}
                          />
                        )}
                      </div>
                    </>
                  )}
                </Panel>
                <ResizeHandle />
                <Panel defaultSize={60} minSize={30} className="p-2">
                  {activeSessionId ? (
                    <Terminal
                      sessionId={activeSessionId}
                      onClose={() => {
                        killSession(activeSessionId);
                        setActiveSessionId(null);
                      }}
                    />
                  ) : viewingAnalysis ? (
                    <TranscriptPanel
                      analysis={viewingAnalysis}
                      onContinue={viewingAnalysis.claude_session_id ? () => handleContinueAnalysis(viewingAnalysis) : undefined}
                      onClose={() => setViewingAnalysisId(null)}
                    />
                  ) : null}
                </Panel>
              </Group>
            )}

            {/* Issue detail panel only (when issue selected but no terminal/transcript) */}
            {selectedIssue && selectedRepo && !activeSessionId && !viewingAnalysis && (
              <div className="flex-1 border-r border-gray-700 overflow-auto">
                <IssueDetail
                  repoId={selectedRepo.id}
                  issueNumber={selectedIssue}
                  onAnalyze={(analysisType) => {
                    const issue = issues.find((i) => i.number === selectedIssue);
                    if (issue) handleAnalyzeIssue(issue, analysisType);
                  }}
                  analyses={analyses}
                  sessions={sessions}
                  expandedAnalysisId={expandedAnalysisId}
                  onToggleAnalysis={setExpandedAnalysisId}
                  onSelectAnalysis={handleSelectAnalysis}
                  onContinueAnalysis={handleContinueAnalysis}
                  onDeleteAnalysis={handleDeleteAnalysis}
                  tags={tags}
                  issueTags={issueTagsMap[selectedIssue] || []}
                  onAddTag={(tagId) => addTagToIssue(selectedIssue, tagId)}
                  onRemoveTag={(tagId) => removeTagFromIssue(selectedIssue, tagId)}
                  onCreateTag={createTag}
                />
              </div>
            )}

            {/* Terminal only (for non-issue sessions) */}
            {activeSessionId && !showSideBySide && (
              <div className="flex-1 p-2">
                <Terminal
                  sessionId={activeSessionId}
                  onClose={() => {
                    killSession(activeSessionId);
                    setActiveSessionId(null);
                  }}
                />
              </div>
            )}

            {/* Transcript only (for non-issue completed analyses) */}
            {viewingAnalysis && !showSideBySide && (
              <div className="flex-1 p-2">
                <TranscriptPanel
                  analysis={viewingAnalysis}
                  onContinue={viewingAnalysis.claude_session_id ? () => handleContinueAnalysis(viewingAnalysis) : undefined}
                  onClose={() => setViewingAnalysisId(null)}
                />
              </div>
            )}

            {/* Empty state */}
            {!selectedIssue && !activeSessionId && !viewingAnalysis && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center p-8">
                  <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  <p className="text-gray-400 font-medium mb-2">Select an issue to view details</p>
                  <p className="text-gray-500 text-sm">or click "Analyze" to start a Claude Code session</p>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </Group>
    </div>
  );
}
