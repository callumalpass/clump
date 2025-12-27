import { useState, useEffect } from 'react';
import type { IssueDetail as IssueDetailType, SessionSummary, Tag, Process } from '../types';
import type { SessionTypeConfig } from '../constants/sessionTypes';
import { fetchIssue, closeIssue, reopenIssue } from '../hooks/useApi';
import { Markdown } from './Markdown';
import { StartSessionButton } from './StartSessionButton';
import { getContrastColor, TAG_COLORS } from '../utils/colors';
import { Editor } from './Editor';

interface IssueDetailProps {
  repoId: number;
  issueNumber: number;
  onStartSession: (sessionType: SessionTypeConfig) => void;
  sessions?: SessionSummary[];
  processes?: Process[];
  expandedSessionId?: string | null;
  onToggleSession?: (sessionId: string | null) => void;
  onSelectSession?: (session: SessionSummary) => void;
  onContinueSession?: (session: SessionSummary) => void;
  tags?: Tag[];
  issueTags?: Tag[];
  onAddTag?: (tagId: number) => void;
  onRemoveTag?: (tagId: number) => void;
  onCreateTag?: (name: string, color?: string) => Promise<Tag | undefined>;
}

export function IssueDetail({
  repoId,
  issueNumber,
  onStartSession,
  sessions = [],
  processes = [],
  expandedSessionId: _expandedSessionId,
  onToggleSession: _onToggleSession,
  onSelectSession,
  onContinueSession: _onContinueSession,
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

  // Filter sessions that have this issue linked
  const issueSessions = sessions.filter(
    s => s.entities?.some(e => e.kind === 'issue' && e.number === issueNumber)
  ).sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [issueActionLoading, setIssueActionLoading] = useState(false);
  const [issueActionError, setIssueActionError] = useState('');

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

  const handleCloseIssue = async () => {
    setIssueActionLoading(true);
    setIssueActionError('');
    try {
      await closeIssue(repoId, issueNumber);
      loadIssue();
    } catch (e) {
      setIssueActionError(e instanceof Error ? e.message : 'Failed to close issue');
    } finally {
      setIssueActionLoading(false);
    }
  };

  const handleReopenIssue = async () => {
    setIssueActionLoading(true);
    setIssueActionError('');
    try {
      await reopenIssue(repoId, issueNumber);
      loadIssue();
    } catch (e) {
      setIssueActionError(e instanceof Error ? e.message : 'Failed to reopen issue');
    } finally {
      setIssueActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        {/* Title skeleton */}
        <div className="mb-4">
          <div className="h-6 w-3/4 rounded mb-3 skeleton-shimmer" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-14 rounded-full skeleton-shimmer" />
            <div className="h-5 w-20 rounded-full skeleton-shimmer" />
            <div className="h-4 w-32 rounded skeleton-shimmer" />
          </div>
        </div>
        {/* Body skeleton */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="h-4 w-full rounded mb-2 skeleton-shimmer" />
          <div className="h-4 w-5/6 rounded mb-2 skeleton-shimmer" />
          <div className="h-4 w-4/6 rounded mb-2 skeleton-shimmer" />
          <div className="h-4 w-3/4 rounded skeleton-shimmer" />
        </div>
        {/* Comments skeleton */}
        <div className="h-5 w-32 rounded mb-3 skeleton-shimmer" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4">
              <div className="h-3 w-40 rounded mb-2 skeleton-shimmer" />
              <div className="h-4 w-full rounded mb-1 skeleton-shimmer" />
              <div className="h-4 w-2/3 rounded skeleton-shimmer" />
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
            {issue.state === 'open' ? (
              <button
                onClick={handleCloseIssue}
                disabled={issueActionLoading}
                className="px-2 py-0.5 text-xs rounded bg-red-900/50 text-red-300 hover:bg-red-900/70 disabled:opacity-50 transition-colors"
              >
                {issueActionLoading ? 'Closing...' : 'Close Issue'}
              </button>
            ) : (
              <button
                onClick={handleReopenIssue}
                disabled={issueActionLoading}
                className="px-2 py-0.5 text-xs rounded bg-green-900/50 text-green-300 hover:bg-green-900/70 disabled:opacity-50 transition-colors"
              >
                {issueActionLoading ? 'Reopening...' : 'Reopen Issue'}
              </button>
            )}
          </div>
          {issueActionError && (
            <div className="text-red-400 text-xs mt-1">{issueActionError}</div>
          )}

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
                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                      >
                        {creatingTag ? 'Adding...' : 'Add'}
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
        <StartSessionButton
          issue={{ number: issue.number, title: issue.title, body: issue.body || '' }}
          onStart={(_, type) => onStartSession(type)}
          size="md"
          className="shrink-0"
        />
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

      {/* Related Sessions */}
      {issueSessions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white mb-3">
            Sessions ({issueSessions.length})
          </h3>
          <div className="space-y-2">
            {issueSessions.map((session) => {
              // Check if this session has an actually running process
              const activeProcess = session.is_active
                ? processes.find(p => p.claude_session_id === session.session_id)
                : null;
              const isActuallyRunning = !!activeProcess;

              return (
                <div
                  key={session.session_id}
                  onClick={() => onSelectSession?.(session)}
                  className="group bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 p-3 cursor-pointer hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        isActuallyRunning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
                      }`} />
                      <span className="text-sm font-medium text-white truncate">
                        {session.title || 'Untitled session'}
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
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        {new Date(session.modified_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {isActuallyRunning && (
                    <p className="text-xs text-yellow-400 mt-2">Process running - click to view</p>
                  )}
                </div>
              );
            })}
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
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Add a comment</h4>
          <Editor
            value={commentBody}
            onChange={setCommentBody}
            placeholder="Write your comment here... (Markdown supported)"
            minHeight="100px"
            onSubmit={() => {
              if (commentBody.trim() && !submitting) {
                handleSubmitComment({ preventDefault: () => {} } as React.FormEvent);
              }
            }}
            disabled={submitting}
          />
          {commentError && (
            <div className="text-red-400 text-sm mt-2">{commentError}</div>
          )}
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={(e) => handleSubmitComment(e)}
              disabled={submitting || !commentBody.trim()}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              {submitting ? 'Posting...' : 'Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
