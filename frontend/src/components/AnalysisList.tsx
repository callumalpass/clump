import type { Analysis } from '../types';

interface AnalysisListProps {
  analyses: Analysis[];
  onSelectAnalysis: (analysis: Analysis) => void;
  loading: boolean;
}

export function AnalysisList({ analyses, onSelectAnalysis, loading }: AnalysisListProps) {
  if (loading) {
    return <div className="p-4 text-gray-400">Loading analyses...</div>;
  }

  if (analyses.length === 0) {
    return <div className="p-4 text-gray-400">No analyses yet</div>;
  }

  return (
    <div className="divide-y divide-gray-700">
      {analyses.map((analysis) => (
        <div
          key={analysis.id}
          className="p-3 cursor-pointer hover:bg-gray-800"
          onClick={() => onSelectAnalysis(analysis)}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${
              analysis.status === 'running' ? 'bg-yellow-500' :
              analysis.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium text-white truncate">
              {analysis.title}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="px-1.5 py-0.5 bg-gray-700 rounded">
              {analysis.type}
            </span>
            {analysis.entity_id && (
              <span>#{analysis.entity_id}</span>
            )}
            <span>{new Date(analysis.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
