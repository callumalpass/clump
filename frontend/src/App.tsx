import { useState, useCallback } from 'react';
import { useRepos, useIssues, useSessions, useAnalyses } from './hooks/useApi';
import { RepoSelector } from './components/RepoSelector';
import { IssueList } from './components/IssueList';
import { IssueDetail } from './components/IssueDetail';
import { Terminal } from './components/Terminal';
import { SessionTabs } from './components/SessionTabs';
import { AnalysisList } from './components/AnalysisList';
import { GitHubTokenSetup } from './components/GitHubTokenSetup';
import type { Repo, Issue, Analysis } from './types';

type Tab = 'issues' | 'prs' | 'analyses';

export default function App() {
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('issues');
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { repos, addRepo } = useRepos();
  const {
    issues,
    loading: issuesLoading,
    refresh: refreshIssues,
    page: issuesPage,
    totalPages: issuesTotalPages,
    total: issuesTotal,
    goToPage: goToIssuesPage,
  } = useIssues(selectedRepo?.id ?? null);
  const { sessions, createSession, killSession } = useSessions();
  const { analyses, loading: analysesLoading } = useAnalyses(
    selectedRepo?.id,
    searchQuery || undefined
  );

  const handleAnalyzeIssue = useCallback(
    async (issue: Issue) => {
      if (!selectedRepo) return;

      const prompt = `Please analyze this GitHub issue and suggest a fix approach:

Issue #${issue.number}: ${issue.title}

${issue.body}

Please:
1. Identify the root cause
2. Suggest a fix approach
3. Identify relevant files that may need to be changed`;

      const session = await createSession(
        selectedRepo.id,
        prompt,
        'issue',
        issue.number.toString(),
        `Issue #${issue.number}: ${issue.title}`
      );

      setActiveSessionId(session.id);
    },
    [selectedRepo, createSession]
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

  const handleSelectAnalysis = useCallback((analysis: Analysis) => {
    if (analysis.session_id) {
      setActiveSessionId(analysis.session_id);
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#161b22]">
        <h1 className="text-lg font-semibold">Claude Code Hub</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {sessions.length} active session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

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
                onSelectIssue={setSelectedIssue}
                onAnalyzeIssue={handleAnalyzeIssue}
                loading={issuesLoading}
                page={issuesPage}
                totalPages={issuesTotalPages}
                total={issuesTotal}
                onPageChange={goToIssuesPage}
              />
            )}
            {activeTab === 'analyses' && (
              <AnalysisList
                analyses={analyses}
                onSelectAnalysis={handleSelectAnalysis}
                loading={analysesLoading}
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
            />
          )}

          {/* Content area */}
          <div className="flex-1 flex min-h-0">
            {/* Issue detail panel (when issue selected but no terminal) */}
            {selectedIssue && selectedRepo && !activeSessionId && (
              <div className="flex-1 border-r border-gray-700 overflow-auto">
                <IssueDetail
                  repoId={selectedRepo.id}
                  issueNumber={selectedIssue}
                  onAnalyze={() => {
                    const issue = issues.find((i) => i.number === selectedIssue);
                    if (issue) handleAnalyzeIssue(issue);
                  }}
                />
              </div>
            )}

            {/* Terminal */}
            {activeSessionId && (
              <div className="flex-1 p-2">
                <Terminal
                  sessionId={activeSessionId}
                  onClose={() => setActiveSessionId(null)}
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
