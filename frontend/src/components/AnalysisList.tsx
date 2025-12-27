import type { Analysis } from '../types';

interface AnalysisListProps {
  analyses: Analysis[];
  onSelectAnalysis: (analysis: Analysis) => void;
  onContinueAnalysis?: (analysis: Analysis) => void;
  onDeleteAnalysis?: (analysis: Analysis) => void;
  loading: boolean;
}

export function AnalysisList({ analyses, onSelectAnalysis, onContinueAnalysis, onDeleteAnalysis, loading }: AnalysisListProps) {
  if (loading) {
    return (
      <div className="divide-y divide-gray-700">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-3 animate-pulse">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-gray-700" />
              <div className="h-4 w-40 bg-gray-700 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-14 bg-gray-700 rounded" />
              <div className="h-4 w-8 bg-gray-700 rounded" />
              <div className="h-4 w-20 bg-gray-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (analyses.length === 0) {
    return <div className="p-4 text-gray-400">No analyses yet</div>;
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
    <div className="divide-y divide-gray-700 overflow-auto flex-1">
      {analyses.map((analysis) => (
        <div
          key={analysis.id}
          className="group p-3 cursor-pointer hover:bg-gray-800"
          onClick={() => onSelectAnalysis(analysis)}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              analysis.status === 'running' ? 'bg-yellow-500' :
              analysis.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium text-white truncate flex-1">
              {analysis.title}
            </span>
            {/* Continue button for completed analyses with a session */}
            {analysis.status === 'completed' && analysis.claude_session_id && onContinueAnalysis && (
              <button
                onClick={(e) => handleContinue(e, analysis)}
                className="flex-shrink-0 px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1"
                title="Continue this conversation"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                Continue
              </button>
            )}
            {/* Delete button */}
            {onDeleteAnalysis && analysis.status !== 'running' && (
              <button
                onClick={(e) => handleDelete(e, analysis)}
                className="flex-shrink-0 p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
            {analysis.claude_session_id && (
              <span className="text-gray-600" title={`Session: ${analysis.claude_session_id}`}>
                (resumable)
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
