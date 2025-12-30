import { useState, useEffect, useCallback } from 'react';
import { ConversationView } from './ConversationView';
import type { SessionSummary, SessionDetail as SessionDetailType, Issue, PR } from '../types';
import { fetchSessionDetail, exportSession, downloadExport } from '../hooks/useApi';
import { formatDuration } from '../utils/time';

// =============================================================================
// Types
// =============================================================================

interface SessionDetailProps {
  /** The session to display */
  session: SessionSummary;
  /** Callback to continue the session */
  onContinue: (prompt?: string) => Promise<void>;
  /** Callback when session is deleted */
  onDelete: () => Promise<void>;
  /** Callback when session title is changed */
  onTitleChange?: (title: string) => Promise<void>;
  /** Navigate to an issue */
  onShowIssue?: (issueNumber: number) => void;
  /** Navigate to a PR */
  onShowPR?: (prNumber: number) => void;
  /** Navigate to a schedule */
  onShowSchedule?: (scheduleId: number) => void;
  /** Available issues for context */
  issues?: Issue[];
  /** Available PRs for context */
  prs?: PR[];
}

// =============================================================================
// Helper Components
// =============================================================================

function EntityBadge({
  kind,
  number,
  onClick
}: {
  kind: 'issue' | 'pr';
  number: number;
  onClick?: () => void;
}) {
  const isIssue = kind === 'issue';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
        isIssue
          ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
          : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
      }`}
    >
      {isIssue ? (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      )}
      #{number}
    </button>
  );
}

function MetadataItem({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SessionDetail({
  session,
  onContinue,
  onDelete,
  onTitleChange,
  onShowIssue,
  onShowPR,
  onShowSchedule,
}: SessionDetailProps) {
  const [detail, setDetail] = useState<SessionDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || '');
  const [continuing, setContinuing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Fetch session detail
  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSessionDetail(session.session_id);
        if (!cancelled) {
          setDetail(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDetail();
    return () => { cancelled = true; };
  }, [session.session_id]);

  // Handle title edit
  const handleSaveTitle = useCallback(async () => {
    if (!onTitleChange || editTitle === session.title) {
      setIsEditing(false);
      return;
    }
    try {
      await onTitleChange(editTitle);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save title:', err);
    }
  }, [editTitle, session.title, onTitleChange]);

  // Handle continue
  const handleContinue = useCallback(async () => {
    setContinuing(true);
    try {
      await onContinue();
    } finally {
      setContinuing(false);
    }
  }, [onContinue]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }, [onDelete]);

  // Handle export
  const handleExport = useCallback(async (format: 'markdown' | 'json' | 'text') => {
    setExporting(true);
    try {
      const result = await exportSession(session.session_id, format);
      downloadExport(result.content, result.filename);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [session.session_id]);

  // Format duration
  const duration = session.duration_seconds
    ? formatDuration(session.duration_seconds)
    : session.start_time && session.end_time
      ? formatDuration((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 1000)
      : null;

  // Format date
  const dateStr = session.start_time
    ? new Date(session.start_time).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-gray-750 bg-gray-800/50">
        {/* Title */}
        <div className="flex items-start justify-between gap-4 mb-3">
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setEditTitle(session.title || '');
                  setIsEditing(false);
                }
              }}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-lg font-semibold text-white focus:outline-none focus:border-blurple-400"
              autoFocus
            />
          ) : (
            <h2
              className="text-lg font-semibold text-white cursor-pointer hover:text-gray-300 transition-colors"
              onClick={() => onTitleChange && setIsEditing(true)}
              title={onTitleChange ? 'Click to edit title' : undefined}
            >
              {session.title || 'Untitled Session'}
            </h2>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleContinue}
              disabled={continuing}
              className="px-3 py-1.5 bg-blurple-500 hover:bg-blurple-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {continuing ? 'Starting...' : 'Continue'}
            </button>

            {/* Export dropdown */}
            <div className="relative group">
              <button
                disabled={exporting}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Export"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <div className="absolute right-0 top-full mt-1 py-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={() => handleExport('markdown')}
                  className="block w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-700"
                >
                  Markdown
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="block w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-700"
                >
                  JSON
                </button>
                <button
                  onClick={() => handleExport('text')}
                  className="block w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-700"
                >
                  Plain Text
                </button>
              </div>
            </div>

            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
              title="Delete session"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <MetadataItem label="Date" value={dateStr} />
          <MetadataItem label="Duration" value={duration} />
          <MetadataItem label="Model" value={session.model} />
          <MetadataItem label="Messages" value={session.message_count?.toString()} />
          {detail && (detail.total_input_tokens > 0 || detail.total_output_tokens > 0) && (
            <MetadataItem
              label="Tokens"
              value={`${(detail.total_input_tokens + detail.total_output_tokens).toLocaleString()}`}
            />
          )}
        </div>

        {/* Entities */}
        {session.entities && session.entities.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-500">Linked:</span>
            {session.entities.map((entity, i) => (
              <EntityBadge
                key={`${entity.kind}-${entity.number}-${i}`}
                kind={entity.kind}
                number={entity.number}
                onClick={() => {
                  if (entity.kind === 'issue' && onShowIssue) {
                    onShowIssue(entity.number);
                  } else if (entity.kind === 'pr' && onShowPR) {
                    onShowPR(entity.number);
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Schedule link */}
        {session.scheduled_job_id && onShowSchedule && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">Created by:</span>
            <button
              onClick={() => onShowSchedule(session.scheduled_job_id!)}
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule #{session.scheduled_job_id}
            </button>
          </div>
        )}
      </div>

      {/* Transcript */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-gray-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Loading transcript...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-4">
              <p className="text-red-400 mb-2">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-gray-400 hover:text-white"
              >
                Retry
              </button>
            </div>
          </div>
        ) : detail ? (
          <ConversationView
            transcript={{
              session_id: detail.session_id,
              messages: detail.messages,
              summary: detail.summary ?? undefined,
              model: detail.model ?? undefined,
              total_input_tokens: detail.total_input_tokens,
              total_output_tokens: detail.total_output_tokens,
              total_cache_read_tokens: detail.total_cache_read_tokens,
              total_cache_creation_tokens: detail.total_cache_creation_tokens,
              start_time: detail.start_time ?? undefined,
              end_time: detail.end_time ?? undefined,
            }}
            sessionId={session.session_id}
          />
        ) : null}
      </div>
    </div>
  );
}
