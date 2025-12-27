import { useState, useEffect } from 'react';
import type { IssueDetail as IssueDetailType, Analysis, Tag } from '../types';
import { fetchIssue } from '../hooks/useApi';
import { Markdown } from './Markdown';

// Helper to determine contrasting text color for a background
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

const TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

interface IssueDetailProps {
  repoId: number;
  issueNumber: number;
  onAnalyze: () => void;
  analyses?: Analysis[];
  onSelectAnalysis?: (analysis: Analysis) => void;
  onContinueAnalysis?: (analysis: Analysis) => void;
  onDeleteAnalysis?: (analysis: Analysis) => void;
  tags?: Tag[];
  issueTags?: Tag[];
  onAddTag?: (tagId: number) => void;
  onRemoveTag?: (tagId: number) => void;
  onCreateTag?: (name: string, color?: string) => Promise<Tag | undefined>;
}

export function IssueDetail({
  repoId,
  issueNumber,
  onAnalyze,
  analyses = [],
  onSelectAnalysis,
  onContinueAnalysis,
  onDeleteAnalysis,
  tags = [],
  issueTags = [],
  onAddTag,
  onRemoveTag,
  onCreateTag,
}: IssueDetailProps) {
  const [issue, setIssue] = useState<IssueDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [creatingTag, setCreatingTag] = useState(false);

  const handleCreateTag = async () => {
    if (!newTagName.trim() || !onCreateTag) return;
    setCreatingTag(true);
    try {
      const tag = await onCreateTag(newTagName.trim(), newTagColor);
      if (tag) {
        onAddTag?.(tag.id);
        setNewTagName('');
        setNewTagColor(TAG_COLORS[0]);
        setShowTagDropdown(false);
      }
    } finally {
      setCreatingTag(false);
    }
  };

  // Filter analyses for this specific issue
  const issueAnalyses = analyses.filter(
    a => a.type === 'issue' && a.entity_id === issueNumber.toString()
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');

  const loadIssue = () => {
    setLoading(true);
    fetchIssue(repoId, issueNumber)
      .then(setIssue)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadIssue();
  }, [repoId, issueNumber]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;

    setSubmitting(true);
    setCommentError('');

    try {
      const res = await fetch(`/api/repos/${repoId}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to post comment');
      }

      setCommentBody('');
      // Reload issue to get new comment
      loadIssue();
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 animate-pulse">
        {/* Title skeleton */}
        <div className="mb-4">
          <div className="h-6 w-3/4 bg-gray-700 rounded mb-3" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-14 bg-gray-700 rounded-full" />
            <div className="h-5 w-20 bg-gray-700 rounded-full" />
            <div className="h-4 w-32 bg-gray-700 rounded" />
          </div>
        </div>
        {/* Body skeleton */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="h-4 w-full bg-gray-700 rounded mb-2" />
          <div className="h-4 w-5/6 bg-gray-700 rounded mb-2" />
          <div className="h-4 w-4/6 bg-gray-700 rounded mb-2" />
          <div className="h-4 w-3/4 bg-gray-700 rounded" />
        </div>
        {/* Comments skeleton */}
        <div className="h-5 w-32 bg-gray-700 rounded mb-3" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4">
              <div className="h-3 w-40 bg-gray-700 rounded mb-2" />
              <div className="h-4 w-full bg-gray-700 rounded mb-1" />
              <div className="h-4 w-2/3 bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!issue) {
    return <div className="p-4 text-gray-400">Issue not found</div>;
  }

  return (
    <div className="p-4 overflow-auto h-full">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">
            #{issue.number} {issue.title}
          </h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              issue.state === 'open' ? 'bg-green-900 text-green-300' : 'bg-purple-900 text-purple-300'
            }`}>
              {issue.state}
            </span>
            {issue.labels.map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300"
              >
                {label}
              </span>
            ))}
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              View on GitHub →
            </a>
          </div>

          {/* Tags section */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-gray-400">Tags:</span>
            {issueTags.map((tag) => {
              const bgColor = tag.color || '#374151';
              return (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
                  style={{ backgroundColor: bgColor, color: getContrastColor(bgColor) }}
                >
                  {tag.name}
                  <button
                    onClick={() => onRemoveTag?.(tag.id)}
                    className="hover:opacity-70 ml-0.5"
                    title="Remove tag"
                  >
                    ×
                  </button>
                </span>
              );
            })}

            {/* Add tag button/dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowTagDropdown(!showTagDropdown)}
                className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600"
              >
                + Add tag
              </button>

              {showTagDropdown && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10">
                  {/* Existing tags */}
                  {tags.filter(t => !issueTags.some(it => it.id === t.id)).length > 0 && (
                    <div className="p-2 border-b border-gray-700">
                      <div className="text-xs text-gray-400 mb-1">Available tags</div>
                      <div className="flex flex-wrap gap-1">
                        {tags
                          .filter(t => !issueTags.some(it => it.id === t.id))
                          .map((tag) => {
                            const bgColor = tag.color || '#374151';
                            return (
                              <button
                                key={tag.id}
                                onClick={() => {
                                  onAddTag?.(tag.id);
                                  setShowTagDropdown(false);
                                }}
                                className="px-2 py-0.5 text-xs rounded-full hover:opacity-80"
                                style={{ backgroundColor: bgColor, color: getContrastColor(bgColor) }}
                              >
                                {tag.name}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Create new tag */}
                  <div className="p-2">
                    <div className="text-xs text-gray-400 mb-1">Create new tag</div>
                    <div className="flex gap-1 mb-2">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Tag name"
                        className="flex-1 px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newTagName.trim()) {
                            e.preventDefault();
                            handleCreateTag();
                          }
                        }}
                      />
                      <button
                        onClick={handleCreateTag}
                        disabled={!newTagName.trim() || creatingTag}
                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded"
                      >
                        {creatingTag ? '...' : 'Add'}
                      </button>
                    </div>
                    <div className="flex gap-1">
                      {TAG_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewTagColor(color)}
                          className={`w-5 h-5 rounded-full ${newTagColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800' : ''}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onAnalyze}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shrink-0"
        >
          Analyze with Claude
        </button>
      </div>

      {/* Issue body */}
      <div className="mb-6">
        <div className="text-sm text-gray-400 mb-2">
          Opened by <span className="text-gray-300">{issue.author}</span> on {new Date(issue.created_at).toLocaleDateString()}
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          {issue.body ? (
            <Markdown>{issue.body}</Markdown>
          ) : (
            <p className="text-gray-400 italic">No description provided.</p>
          )}
        </div>
      </div>

      {/* Related Analysis Sessions */}
      {issueAnalyses.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white mb-3">
            Analysis Sessions ({issueAnalyses.length})
          </h3>
          <div className="space-y-2">
            {issueAnalyses.map((analysis) => (
              <div
                key={analysis.id}
                onClick={() => onSelectAnalysis?.(analysis)}
                className="group bg-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-750 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      analysis.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                      analysis.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className="text-sm font-medium text-white truncate">
                      {analysis.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Continue button */}
                    {analysis.status === 'completed' && analysis.claude_session_id && onContinueAnalysis && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onContinueAnalysis(analysis);
                        }}
                        className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1"
                        title="Continue this conversation"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        Continue
                      </button>
                    )}
                    {/* Delete button */}
                    {analysis.status !== 'running' && onDeleteAnalysis && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this analysis?')) {
                            onDeleteAnalysis(analysis);
                          }
                        }}
                        className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete analysis"
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
                {analysis.status === 'running' && (
                  <p className="text-xs text-yellow-400 mt-2">Session in progress - click to view</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-white mb-3">
          Comments ({issue.comments.length})
        </h3>

        {issue.comments.length > 0 ? (
          <div className="space-y-3 mb-4">
            {issue.comments.map((comment) => (
              <div key={comment.id} className="bg-gray-800 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-2">
                  <span className="text-gray-300">{comment.author}</span> · {new Date(comment.created_at).toLocaleDateString()}
                </div>
                <Markdown>{comment.body}</Markdown>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 mb-4">No comments yet.</p>
        )}

        {/* Add comment form */}
        <form onSubmit={handleSubmitComment} className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Add a comment</h4>
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Write your comment here... (Markdown supported)"
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm min-h-[100px] resize-y mb-2"
          />
          {commentError && (
            <div className="text-red-400 text-sm mb-2">{commentError}</div>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !commentBody.trim()}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded-lg"
            >
              {submitting ? 'Posting...' : 'Comment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
