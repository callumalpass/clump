import { useState, useEffect, memo } from 'react';
import type { PRDetail as PRDetailType, SessionSummary, Process, CommandMetadata } from '../types';
import { fetchPR } from '../hooks/useApi';
import { Markdown } from './Markdown';
import { PRStartSessionButton } from './PRStartSessionButton';
import { getTimeWithTooltip } from '../utils/time';

/**
 * Visual diff bar showing additions vs deletions ratio (like GitHub)
 * Shows a horizontal bar with green (additions) and red (deletions) segments
 */
interface DiffBarProps {
  additions: number;
  deletions: number;
  /** Maximum number of blocks to display (default 5) */
  maxBlocks?: number;
}

export const DiffBar = memo(function DiffBar({ additions, deletions, maxBlocks = 5 }: DiffBarProps) {
  const total = additions + deletions;

  // Don't show if no changes
  if (total === 0) return null;

  // Calculate how many blocks for each type
  const additionRatio = additions / total;
  const additionBlocks = Math.round(additionRatio * maxBlocks);
  const deletionBlocks = maxBlocks - additionBlocks;

  // Generate blocks array
  const blocks: ('add' | 'del' | 'neutral')[] = [];
  for (let i = 0; i < additionBlocks; i++) blocks.push('add');
  for (let i = 0; i < deletionBlocks; i++) blocks.push('del');

  // If we have blocks but all same type, ensure at least one of each if both exist
  if (additions > 0 && deletions > 0 && (additionBlocks === 0 || deletionBlocks === 0)) {
    if (additionBlocks === 0) blocks[0] = 'add';
    if (deletionBlocks === 0) blocks[blocks.length - 1] = 'del';
  }

  // Edge case: if only additions or only deletions, show all one color
  if (additions === 0) blocks.fill('del');
  if (deletions === 0) blocks.fill('add');

  return (
    <div
      className="inline-flex items-center gap-0.5"
      title={`+${additions.toLocaleString()} additions, -${deletions.toLocaleString()} deletions`}
      aria-label={`${additions} additions, ${deletions} deletions`}
    >
      {blocks.map((type, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-sm transition-transform hover:scale-125 ${
            type === 'add' ? 'bg-green-500' :
            type === 'del' ? 'bg-red-500' :
            'bg-gray-500'
          }`}
        />
      ))}
    </div>
  );
});

interface PRDetailProps {
  repoId: number;
  prNumber: number;
  prCommands: CommandMetadata[];
  onStartSession: (command: CommandMetadata) => void;
  sessions?: SessionSummary[];
  processes?: Process[];
  onSelectSession?: (session: SessionSummary) => void;
  onContinueSession?: (session: SessionSummary) => void;
}

export function PRDetail({
  repoId,
  prNumber,
  prCommands,
  onStartSession,
  sessions = [],
  processes = [],
  onSelectSession,
  onContinueSession,
}: PRDetailProps) {
  const [pr, setPR] = useState<PRDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [continuingSessionId, setContinuingSessionId] = useState<string | null>(null);

  const loadPR = () => {
    setLoading(true);
    fetchPR(repoId, prNumber)
      .then(setPR)
      .catch(() => {
        // Error fetching PR - pr will remain null, showing "not found" message
        setPR(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPR();
  }, [repoId, prNumber]);

  // Filter sessions that have this PR linked
  const prSessions = sessions.filter(
    s => s.entities?.some(e => e.kind === 'pr' && e.number === prNumber)
  ).sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

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
        {/* Branch info skeleton */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-6 w-24 rounded skeleton-shimmer" />
          <div className="h-4 w-4 rounded skeleton-shimmer" />
          <div className="h-6 w-20 rounded skeleton-shimmer" />
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

  if (!pr) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[200px] empty-state-enter">
        <div className="w-12 h-12 rounded-full bg-gray-700/40 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-400 font-medium mb-1">Pull request not found</p>
        <p className="text-sm text-gray-500">This PR may have been deleted or merged.</p>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto h-full min-w-0">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-white">
            #{pr.number} {pr.title}
          </h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
              pr.state === 'open' ? 'bg-green-500/20 text-green-400' :
              pr.state === 'merged' ? 'bg-purple-500/20 text-purple-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {pr.state}
            </span>
            {pr.labels.map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 text-xs rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
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
            <span className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono transition-colors" title={pr.head_ref}>
              {pr.head_ref}
            </span>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono transition-colors" title={pr.base_ref}>
              {pr.base_ref}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-gray-400 mt-3">
            <span className="text-green-500">+{pr.additions}</span>
            <span className="text-red-500">-{pr.deletions}</span>
            <span>{pr.changed_files} file{pr.changed_files !== 1 ? 's' : ''} changed</span>
            <DiffBar additions={pr.additions} deletions={pr.deletions} />
          </div>
        </div>
        <PRStartSessionButton
          pr={pr}
          commands={prCommands}
          onStart={(_, command) => onStartSession(command)}
          size="md"
          className="shrink-0"
        />
      </div>

      {/* PR description */}
      <div className="mb-6">
        <div className="text-sm text-gray-400 mb-2">
          Opened by <span className="text-gray-300">{pr.author}</span> <span className="cursor-help" title={getTimeWithTooltip(pr.created_at).full}>{getTimeWithTooltip(pr.created_at).relative}</span>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 overflow-x-auto">
          {pr.body ? (
            <Markdown>{pr.body}</Markdown>
          ) : (
            <p className="text-gray-400 italic">No description provided.</p>
          )}
        </div>
      </div>

      {/* Related Sessions */}
      {prSessions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white mb-3">
            Sessions ({prSessions.length})
          </h3>
          <div className="space-y-2">
            {prSessions.map((session) => {
              // Check if this session has an actually running process
              const activeProcess = session.is_active
                ? processes.find(p => p.claude_session_id === session.session_id)
                : null;
              const isActuallyRunning = !!activeProcess;
              const isContinuing = continuingSessionId === session.session_id;

              return (
                <div
                  key={session.session_id}
                  className="group bg-gray-800 rounded-lg border border-gray-750 hover:border-gray-600 p-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group/session rounded-md -m-1 p-1 hover:bg-gray-750/50 transition-colors"
                      onClick={() => onSelectSession?.(session)}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        isActuallyRunning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
                      }`} />
                      <span className="text-sm font-medium text-white truncate group-hover/session:text-blue-400 transition-colors">
                        {session.title || 'Untitled session'}
                      </span>
                      {/* Arrow to indicate opens in panel */}
                      <svg
                        className="w-4 h-4 text-gray-500 group-hover/session:text-blue-400 group-hover/session:translate-x-0.5 transition-all"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400 hidden sm:inline cursor-help" title={getTimeWithTooltip(session.modified_at).full}>
                        {getTimeWithTooltip(session.modified_at).relative}
                      </span>
                      {/* Continue button for completed sessions */}
                      {!isActuallyRunning && onContinueSession && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContinuingSessionId(session.session_id);
                            onContinueSession(session);
                          }}
                          disabled={isContinuing}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                          title="Continue this session"
                        >
                          {isContinuing ? (
                            <>
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              <span>Starting...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                              </svg>
                              <span>Continue</span>
                            </>
                          )}
                        </button>
                      )}
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
          Comments ({pr.comments.length})
        </h3>

        {pr.comments.length > 0 ? (
          <div className="space-y-3">
            {pr.comments.map((comment) => (
              <div key={comment.id} className="bg-gray-800 rounded-lg p-4 overflow-x-auto">
                <div className="text-sm text-gray-400 mb-2">
                  <span className="text-gray-300">{comment.author}</span> · <span className="cursor-help" title={getTimeWithTooltip(comment.created_at).full}>{getTimeWithTooltip(comment.created_at).relative}</span>
                </div>
                <Markdown>{comment.body}</Markdown>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-800/40 border border-gray-750/50 empty-state-enter">
            <div className="w-8 h-8 rounded-full bg-gray-700/50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">No comments yet on this pull request.</p>
          </div>
        )}
      </div>
    </div>
  );
}
