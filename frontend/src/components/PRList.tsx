import type { PR, Analysis, Session } from '../types';
import type { PRAnalysisTypeConfig } from '../constants/prAnalysisTypes';
import { PRAnalyzeButton } from './PRAnalyzeButton';

interface PRListProps {
  prs: PR[];
  selectedPR: number | null;
  onSelectPR: (prNumber: number) => void;
  onAnalyzePR: (pr: PR, analysisType: PRAnalysisTypeConfig) => void;
  loading: boolean;
  stateFilter: 'open' | 'closed' | 'all';
  onStateFilterChange: (state: 'open' | 'closed' | 'all') => void;
  analyses?: Analysis[];
  sessions?: Session[];
}

const STATE_FILTERS: { value: 'open' | 'closed' | 'all'; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

export function PRList({
  prs,
  selectedPR,
  onSelectPR,
  onAnalyzePR,
  loading,
  stateFilter,
  onStateFilterChange,
  analyses = [],
  sessions = [],
}: PRListProps) {
  // Group analyses by PR number
  const analysesByPR = analyses.reduce((acc, analysis) => {
    if (analysis.type === 'pr' && analysis.entity_id) {
      const prNum = analysis.entity_id;
      if (!acc[prNum]) acc[prNum] = [];
      acc[prNum].push(analysis);
    }
    return acc;
  }, {} as Record<string, Analysis[]>);

  // Filter tabs
  const filterTabs = (
    <div className="flex gap-1 p-2 border-b border-gray-700 bg-gray-800/30">
      {STATE_FILTERS.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onStateFilterChange(filter.value)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            stateFilter === filter.value
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          {filter.label}
        </button>
      ))}
      <span className="ml-auto text-xs text-gray-500 self-center pr-1">
        {prs.length} PR{prs.length !== 1 ? 's' : ''}
      </span>
    </div>
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {filterTabs}
        <div className="divide-y divide-gray-700">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-8 rounded skeleton-shimmer" />
                    <div className="h-4 w-48 rounded skeleton-shimmer" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-4 w-24 rounded skeleton-shimmer" />
                    <div className="h-4 w-16 rounded skeleton-shimmer" />
                  </div>
                  <div className="h-3 w-32 rounded mt-2 skeleton-shimmer" />
                </div>
                <div className="h-7 w-16 rounded shrink-0 skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (prs.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {filterTabs}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs">
            <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium mb-1">
              {stateFilter === 'all' ? 'No pull requests' : `No ${stateFilter} pull requests`}
            </p>
            <p className="text-gray-500 text-sm">
              {stateFilter !== 'all' ? 'Try selecting a different filter' : 'This repository has no PRs yet'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {filterTabs}
      <div className="flex-1 overflow-auto min-h-0 divide-y divide-gray-700">
        {prs.map((pr) => {
          const prAnalyses = analysesByPR[pr.number.toString()] || [];
          const hasRunning = prAnalyses.some(a =>
            a.status === 'running' && sessions.some(s => s.id === a.session_id)
          );
          const hasCompleted = prAnalyses.some(a => a.status === 'completed') ||
            prAnalyses.some(a => a.status === 'running' && !sessions.some(s => s.id === a.session_id));

          return (
            <div
              key={pr.number}
              className={`p-3 cursor-pointer border-l-2 transition-all duration-150 ${
                selectedPR === pr.number
                  ? 'bg-gray-800/80 border-blue-500'
                  : 'border-transparent hover:bg-gray-800/60 hover:border-blue-500/50'
              }`}
              onClick={() => onSelectPR(pr.number)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">#{pr.number}</span>
                    <h3 className="text-sm font-medium text-white truncate">
                      {pr.title}
                    </h3>
                    {hasRunning && (
                      <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse shrink-0" title="Analysis running" />
                    )}
                    {!hasRunning && hasCompleted && (
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title={`${prAnalyses.length} analysis session(s)`} />
                    )}
                  </div>
                  {/* Branch info */}
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono truncate max-w-[120px]" title={pr.head_ref}>
                      {pr.head_ref}
                    </span>
                    <svg className="w-3 h-3 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono truncate max-w-[120px]" title={pr.base_ref}>
                      {pr.base_ref}
                    </span>
                  </div>
                  {/* Labels */}
                  {pr.labels.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {pr.labels.map((label) => (
                        <span
                          key={label}
                          className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span>by {pr.author}</span>
                    <span className="flex items-center gap-1">
                      <span className="text-green-500">+{pr.additions}</span>
                      <span className="text-red-500">-{pr.deletions}</span>
                    </span>
                    <span>{pr.changed_files} file{pr.changed_files !== 1 ? 's' : ''}</span>
                    {prAnalyses.length > 0 && (
                      <span className="text-purple-400">{prAnalyses.length} session{prAnalyses.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
                <PRAnalyzeButton
                  pr={pr}
                  onAnalyze={(_, type) => {
                    onAnalyzePR(pr, type);
                  }}
                  size="sm"
                  className="shrink-0"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
