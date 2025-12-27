import { useState, useCallback, useEffect, useRef } from 'react';
import { useRepos, useIssues, useSessions, useAnalyses, useTags, useIssueTags } from './hooks/useApi';
import type { IssueFilters, AnalysisStatusFilter } from './hooks/useApi';
import { RepoSelector } from './components/RepoSelector';
import { IssueList } from './components/IssueList';
import { IssueDetail } from './components/IssueDetail';
import { Terminal } from './components/Terminal';
import { SessionTabs } from './components/SessionTabs';
import { AnalysisList } from './components/AnalysisList';
import { GitHubTokenSetup } from './components/GitHubTokenSetup';
import { Settings } from './components/Settings';
import type { Repo, Issue, Analysis } from './types';
import type { AnalysisTypeConfig } from './constants/analysisTypes';
import { DEFAULT_ANALYSIS_TYPE } from './constants/analysisTypes';

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
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [issueFilters, setIssueFilters] = useState<IssueFilters>({ state: 'open' });
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<number | null>(null);
  const [analysisStatusFilter, setAnalysisStatusFilter] = useState<AnalysisStatusFilter>('all');

  // Track pending issue context to show side-by-side view immediately
  const pendingIssueContextRef = useRef<PendingIssueContext | null>(null);

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

      // Escape: Close settings, deselect issue, or close terminal
      if (e.key === 'Escape') {
        if (settingsOpen) {
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
  }, [settingsOpen, activeSessionId, selectedIssue]);

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
      setExpandedAnalysisId(null);

      // Store pending context for immediate side-by-side view
      if (analysis.type === 'issue' && analysis.entity_id) {
        pendingIssueContextRef.current = {
          sessionId: analysis.session_id!,
          issueNumber: parseInt(analysis.entity_id, 10),
        };
      }
    } else {
      // Session ended - show issue details with this analysis expanded
      setActiveSessionId(null);
      setExpandedAnalysisId(analysis.id);
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

  // Check pending context for newly created sessions (before analysis is fetched)
  const pendingContext = pendingIssueContextRef.current;
  const hasPendingIssue = pendingContext && pendingContext.sessionId === activeSessionId;

  // Clear pending context once analysis is loaded
  if (activeAnalysis && hasPendingIssue) {
    pendingIssueContextRef.current = null;
  }

  // Show side-by-side if we have an active session AND any issue context (from analysis, pending, or user selection)
  const showSideBySide = activeSessionId && (
    (activeAnalysis?.type === 'issue' && activeAnalysis?.entity_id) || hasPendingIssue || selectedIssue
  );

  // Determine the issue number to display - prefer user selection, fallback to analysis context
  const activeIssueNumber = selectedIssue ?? (
    activeAnalysis?.entity_id
      ? parseInt(activeAnalysis.entity_id, 10)
      : hasPendingIssue
        ? pendingContext.issueNumber
        : null
  );

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#161b22]">
        <h1 className="text-lg font-semibold">Claude Code Hub</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {sessions.length} active session{sessions.length !== 1 ? 's' : ''}
          </span>
          {/* Keyboard shortcuts hint */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-gray-400">/</kbd>
            <span>Search</span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-gray-400 ml-2">Esc</kbd>
            <span>Close</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
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

      <div className="flex-1 flex min-h-0">
        {/* Left sidebar */}
        <aside className="w-80 border-r border-gray-700 flex flex-col bg-[#0d1117]">
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
                className={`flex-1 px-4 py-2 text-sm capitalize ${
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
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm"
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
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* GitHub Token Setup */}
          <GitHubTokenSetup onTokenConfigured={refreshIssues} />

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
              <>
                {/* Collapsible issue panel */}
                <div className={`border-r border-gray-700 shrink-0 flex flex-col ${issuePanelCollapsed ? 'w-10' : 'w-[520px]'}`}>
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
                </div>
                <div className="flex-1 p-2">
                  <Terminal
                    sessionId={activeSessionId}
                    onClose={() => {
                      killSession(activeSessionId);
                      setActiveSessionId(null);
                    }}
                  />
                </div>
              </>
            )}

            {/* Issue detail panel only (when issue selected but no terminal) */}
            {selectedIssue && selectedRepo && !activeSessionId && (
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

            {/* Empty state */}
            {!selectedIssue && !activeSessionId && (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <p className="mb-2">Select an issue to view details</p>
                  <p className="text-sm">or click "Analyze" to start a Claude Code session</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
