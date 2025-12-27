import { useState, useEffect } from 'react';
import type { IssueDetail as IssueDetailType } from '../types';
import { fetchIssue } from '../hooks/useApi';
import { Markdown } from './Markdown';

interface IssueDetailProps {
  repoId: number;
  issueNumber: number;
  onAnalyze: () => void;
}

export function IssueDetail({ repoId, issueNumber, onAnalyze }: IssueDetailProps) {
  const [issue, setIssue] = useState<IssueDetailType | null>(null);
  const [loading, setLoading] = useState(true);
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
    return <div className="p-4 text-gray-400">Loading issue...</div>;
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
          <div className="flex items-center gap-2 mt-2">
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
