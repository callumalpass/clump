import type { Issue } from '../types';

interface IssueListProps {
  issues: Issue[];
  selectedIssue: number | null;
  onSelectIssue: (issueNumber: number) => void;
  onAnalyzeIssue: (issue: Issue) => void;
  loading: boolean;
}

export function IssueList({
  issues,
  selectedIssue,
  onSelectIssue,
  onAnalyzeIssue,
  loading,
}: IssueListProps) {
  if (loading) {
    return (
      <div className="p-4 text-gray-400">Loading issues...</div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="p-4 text-gray-400">No issues found</div>
    );
  }

  return (
    <div className="divide-y divide-gray-700">
      {issues.map((issue) => (
        <div
          key={issue.number}
          className={`p-3 cursor-pointer hover:bg-gray-800 ${
            selectedIssue === issue.number ? 'bg-gray-800 border-l-2 border-blue-500' : ''
          }`}
          onClick={() => onSelectIssue(issue.number)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">#{issue.number}</span>
                <h3 className="text-sm font-medium text-white truncate">
                  {issue.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {issue.labels.map((label) => (
                  <span
                    key={label}
                    className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                by {issue.author} · {issue.comments_count} comments
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAnalyzeIssue(issue);
              }}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded shrink-0"
            >
              Analyze
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
