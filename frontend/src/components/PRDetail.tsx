import type { PR, Analysis, Session } from '../types';
import type { PRAnalysisTypeConfig } from '../constants/prAnalysisTypes';
import { Markdown } from './Markdown';
import { PRAnalyzeButton } from './PRAnalyzeButton';

interface PRDetailProps {
  pr: PR;
  onAnalyze: (analysisType: PRAnalysisTypeConfig) => void;
  analyses?: Analysis[];
  sessions?: Session[];
  onSelectAnalysis?: (analysis: Analysis) => void;
  onDeleteAnalysis?: (analysis: Analysis) => void;
}

export function PRDetail({
  pr,
  onAnalyze,
  analyses = [],
  sessions = [],
  onSelectAnalysis,
  onDeleteAnalysis,
}: PRDetailProps) {
  // Filter analyses for this specific PR
  const prAnalyses = analyses.filter(
    a => a.type === 'pr' && a.entity_id === pr.number.toString()
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="p-4 overflow-auto h-full">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-white">
            #{pr.number} {pr.title}
          </h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              pr.state === 'open' ? 'bg-green-900 text-green-300' :
              pr.state === 'merged' ? 'bg-purple-900 text-purple-300' :
              'bg-red-900 text-red-300'
            }`}>
              {pr.state}
            </span>
            {pr.labels.map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300"
              >
                {label}
              </span>
            ))}
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              View on GitHub →
            </a>
          </div>

          {/* Branch info */}
          <div className="flex items-center gap-2 mt-3 text-sm">
            <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono" title={pr.head_ref}>
              {pr.head_ref}
            </span>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono" title={pr.base_ref}>
              {pr.base_ref}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-gray-400 mt-3">
            <span className="text-green-500">+{pr.additions}</span>
            <span className="text-red-500">-{pr.deletions}</span>
            <span>{pr.changed_files} file{pr.changed_files !== 1 ? 's' : ''} changed</span>
          </div>
        </div>
        <PRAnalyzeButton
          pr={pr}
          onAnalyze={(_, type) => onAnalyze(type)}
          size="md"
          className="shrink-0"
        />
      </div>

      {/* PR description */}
      <div className="mb-6">
        <div className="text-sm text-gray-400 mb-2">
          Opened by <span className="text-gray-300">{pr.author}</span> on {new Date(pr.created_at).toLocaleDateString()}
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          {pr.body ? (
            <Markdown>{pr.body}</Markdown>
          ) : (
            <p className="text-gray-400 italic">No description provided.</p>
          )}
        </div>
      </div>

      {/* Related Analysis Sessions */}
      {prAnalyses.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white mb-3">
            Analysis Sessions ({prAnalyses.length})
          </h3>
          <div className="space-y-2">
            {prAnalyses.map((analysis) => {
              // Check if this analysis has an actually running session
              const hasActiveSession = sessions.some(s => s.id === analysis.session_id);
              const isActuallyRunning = analysis.status === 'running' && hasActiveSession;
              // Show as completed if DB says running but session is gone
              const effectiveStatus = isActuallyRunning ? 'running' :
                (analysis.status === 'running' ? 'completed' : analysis.status);

              return (
                <div
                  key={analysis.id}
                  onClick={() => onSelectAnalysis?.(analysis)}
                  className="group bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 p-3 cursor-pointer hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        isActuallyRunning ? 'bg-yellow-500 animate-pulse' :
                        effectiveStatus === 'completed' ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      <span className="text-sm font-medium text-white truncate">
                        {analysis.title}
                      </span>
                      {/* Arrow to indicate opens in panel */}
                      <svg
                        className="w-4 h-4 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Delete button - show if not actively running */}
                      {!isActuallyRunning && onDeleteAnalysis && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this analysis?')) {
                              onDeleteAnalysis(analysis);
                            }
                          }}
                          className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete analysis"
                          aria-label={`Delete analysis: ${analysis.title}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        {new Date(analysis.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {analysis.summary && (
                    <p className="text-sm text-gray-400 mt-2 line-clamp-2">{analysis.summary}</p>
                  )}
                  {isActuallyRunning && (
                    <p className="text-xs text-yellow-400 mt-2">Session in progress - click to view</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
