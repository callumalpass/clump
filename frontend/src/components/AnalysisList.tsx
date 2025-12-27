import type { Analysis, Session } from '../types';
import type { AnalysisStatusFilter } from '../hooks/useApi';
import { calculateDuration } from '../hooks/useElapsedTime';
import { ElapsedTimer } from './ElapsedTimer';

interface AnalysisListProps {
  analyses: Analysis[];
  sessions?: Session[];
  onSelectAnalysis: (analysis: Analysis) => void;
  onContinueAnalysis?: (analysis: Analysis) => void;
  onDeleteAnalysis?: (analysis: Analysis) => void;
  loading: boolean;
  statusFilter: AnalysisStatusFilter;
  onStatusFilterChange: (filter: AnalysisStatusFilter) => void;
  total: number;
}

const STATUS_FILTERS: { value: AnalysisStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export function AnalysisList({ analyses, sessions = [], onSelectAnalysis, onContinueAnalysis, onDeleteAnalysis, loading, statusFilter, onStatusFilterChange, total }: AnalysisListProps) {
  const filterTabs = (
    <div className="flex gap-1 p-2 border-b border-gray-700 bg-gray-800/30">
      {STATUS_FILTERS.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onStatusFilterChange(filter.value)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            statusFilter === filter.value
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          {filter.label}
        </button>
      ))}
      <span className="ml-auto text-xs text-gray-500 self-center pr-1">
        {total} result{total !== 1 ? 's' : ''}
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col flex-1">
        {filterTabs}
        <div className="divide-y divide-gray-700">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full skeleton-shimmer" />
                <div className="h-4 w-40 rounded skeleton-shimmer" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-14 rounded skeleton-shimmer" />
                <div className="h-4 w-8 rounded skeleton-shimmer" />
                <div className="h-4 w-20 rounded skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="flex flex-col flex-1">
        {filterTabs}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs">
            <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium mb-1">
              {statusFilter === 'all' ? 'No analyses yet' : `No ${statusFilter} analyses`}
            </p>
            <p className="text-gray-500 text-sm">
              {statusFilter === 'all'
                ? 'Click "Analyze" on an issue to start a session'
                : 'Try selecting a different filter'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleContinue = (e: React.MouseEvent, analysis: Analysis) => {
    e.stopPropagation();
    onContinueAnalysis?.(analysis);
  };

  const handleDelete = (e: React.MouseEvent, analysis: Analysis) => {
    e.stopPropagation();
    if (confirm(`Delete "${analysis.title}"?`)) {
      onDeleteAnalysis?.(analysis);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      {filterTabs}
      <div className="divide-y divide-gray-700 overflow-auto flex-1">
        {analyses.map((analysis) => {
        // Check if this analysis has an actually running session
        const hasActiveSession = sessions.some(s => s.id === analysis.session_id);
        const isActuallyRunning = analysis.status === 'running' && hasActiveSession;

        return (
          <div
            key={analysis.id}
            className="group p-3 cursor-pointer hover:bg-gray-800/80 transition-colors duration-150"
            onClick={() => onSelectAnalysis(analysis)}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isActuallyRunning ? 'bg-yellow-500 animate-pulse' :
                (analysis.status === 'completed' || analysis.status === 'running') ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-sm font-medium text-white truncate flex-1">
                {analysis.title}
              </span>
              {/* Continue button - show if not actively running and has claude session */}
              {!isActuallyRunning && analysis.claude_session_id && onContinueAnalysis && (
                <button
                  onClick={(e) => handleContinue(e, analysis)}
                  className="flex-shrink-0 px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  title="Continue this conversation"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Continue
                </button>
              )}
              {/* Delete button - show if not actively running */}
              {onDeleteAnalysis && !isActuallyRunning && (
                <button
                  onClick={(e) => handleDelete(e, analysis)}
                  className="flex-shrink-0 p-1 text-gray-500 opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-opacity duration-150 rounded focus:outline-none focus:opacity-100 focus:text-red-400 focus:ring-2 focus:ring-red-400/50"
                  title="Delete analysis"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-1.5 py-0.5 bg-gray-700 rounded">
                {analysis.type}
              </span>
              {analysis.entity_id && (
                <span>#{analysis.entity_id}</span>
              )}
              <span>{new Date(analysis.created_at).toLocaleDateString()}</span>
              {/* Duration display */}
              {isActuallyRunning ? (
                <span className="text-yellow-500" title="Time elapsed">
                  <ElapsedTimer startTime={analysis.created_at} />
                </span>
              ) : analysis.completed_at ? (
                <span className="text-gray-600" title="Total duration">
                  {calculateDuration(analysis.created_at, analysis.completed_at)}
                </span>
              ) : null}
              {analysis.claude_session_id && !isActuallyRunning && (
                <span className="text-gray-600" title={`Session: ${analysis.claude_session_id}`}>
                  (resumable)
                </span>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
