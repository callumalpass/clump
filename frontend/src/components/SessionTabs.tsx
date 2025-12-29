import { useRef, useState, useLayoutEffect, useCallback, useEffect } from 'react';
import type { SessionSummary, Process } from '../types';
import { ElapsedTimer } from './ElapsedTimer';
import { formatRelativeTime } from '../utils/time';
import { focusRing } from '../utils/styles';

/** Custom hook to detect scroll overflow state */
function useScrollOverflow(ref: React.RefObject<HTMLElement | null>) {
  const [overflow, setOverflow] = useState({ canScrollLeft: false, canScrollRight: false });

  const checkOverflow = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    // Small threshold to account for sub-pixel rounding
    const threshold = 2;
    setOverflow({
      canScrollLeft: scrollLeft > threshold,
      canScrollRight: scrollLeft + clientWidth < scrollWidth - threshold,
    });
    // ref is a stable RefObject - its identity never changes, only ref.current does
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check initially and on scroll
    checkOverflow();
    el.addEventListener('scroll', checkOverflow, { passive: true });

    // Also check on resize
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', checkOverflow);
      resizeObserver.disconnect();
    };
    // checkOverflow has stable identity (empty deps), ref is a stable RefObject
  }, [checkOverflow]);

  return overflow;
}

/** Maximum length of a tab title before truncation */
const MAX_TAB_TITLE_LENGTH = 30;
/** Suffix appended to truncated titles */
const TRUNCATION_SUFFIX = '...';

interface SessionTabsProps {
  /** Sessions to show as tabs */
  sessions: SessionSummary[];
  /** Currently running processes (to determine if session is live) */
  processes: Process[];
  /** Currently active/selected session ID */
  activeSessionId: string | null;
  /** Callback when a session tab is clicked */
  onSelectSession: (sessionId: string) => void;
  /** Callback when a session tab is closed */
  onCloseSession: (sessionId: string) => void;
  /** Callback to create a new session */
  onNewSession: () => void;
  /** Check if a session needs user attention (e.g., permission request) */
  needsAttention?: (sessionId: string) => boolean;
  /** Whether the new session button should be disabled (e.g., no repo selected) */
  newSessionDisabled?: boolean;
}

function getTabName(session: SessionSummary): string {
  const title = session.title || 'Untitled';
  if (title.length > MAX_TAB_TITLE_LENGTH) {
    const truncateAt = MAX_TAB_TITLE_LENGTH - TRUNCATION_SUFFIX.length;
    return title.slice(0, truncateAt) + TRUNCATION_SUFFIX;
  }
  return title;
}

export function SessionTabs({
  sessions,
  processes,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onNewSession,
  needsAttention,
  newSessionDisabled,
}: SessionTabsProps) {
  // Refs for animated tab indicator and scroll container
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Track scroll overflow for fade indicators
  const { canScrollLeft, canScrollRight } = useScrollOverflow(containerRef);

  // Update the sliding tab indicator position when active tab changes
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateIndicator = () => {
      const activeTabElement = activeSessionId ? tabRefs.current.get(activeSessionId) : null;
      if (activeTabElement) {
        const containerRect = container.getBoundingClientRect();
        const tabRect = activeTabElement.getBoundingClientRect();
        setIndicatorStyle({
          left: tabRect.left - containerRect.left,
          width: tabRect.width,
        });
      } else {
        // No active tab - hide indicator
        setIndicatorStyle({ left: 0, width: 0 });
      }
    };

    // Initial update - use rAF to ensure DOM has settled
    const rafId = requestAnimationFrame(updateIndicator);

    // Watch for size changes on all tab elements
    const resizeObserver = new ResizeObserver(updateIndicator);
    tabRefs.current.forEach((el) => resizeObserver.observe(el));
    resizeObserver.observe(container);

    // Also update on window resize
    window.addEventListener('resize', updateIndicator);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [activeSessionId, sessions]); // Re-run when sessions change too (for dynamic tabs)

  return (
    <div ref={wrapperRef} className="relative bg-gray-850 border-b border-gray-750">
      {/* Left overflow fade indicator */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-850 to-transparent pointer-events-none z-10 transition-opacity duration-150 ${
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
      {/* Right overflow fade indicator */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-850 to-transparent pointer-events-none z-10 transition-opacity duration-150 ${
          canScrollRight ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
      <div ref={containerRef} className="relative flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-none">
      {sessions.map((session) => {
        const tabName = getTabName(session);
        // Check if this session is running (either via process or headless)
        const isRunning = session.is_active;
        // Get the active process if available (for PTY sessions, provides start time)
        const activeProcess = isRunning
          ? processes.find(p => p.claude_session_id === session.session_id)
          : null;
        // Check if session needs attention (permission request, idle)
        const sessionNeedsAttention = needsAttention?.(session.session_id) ?? false;
        const isActiveTab = activeSessionId === session.session_id;

        return (
          <div
            key={session.session_id}
            ref={(el) => {
              if (el) tabRefs.current.set(session.session_id, el);
            }}
            role="tab"
            tabIndex={0}
            className={`session-tab session-tab-enter group flex items-center gap-2 px-4 py-2.5 cursor-pointer rounded-stoody-lg transition-all duration-150 ${focusRing} ${
              isActiveTab
                ? 'text-white bg-gray-800'
                : sessionNeedsAttention
                  ? 'text-warning-300 bg-warning-500/10 hover:bg-warning-500/15'
                  : 'text-gray-400 bg-gray-800 hover:text-pink-400 hover:bg-gray-850'
            }`}
            onClick={() => onSelectSession(session.session_id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectSession(session.session_id);
              }
            }}
            title={session.title || 'Untitled'}
            aria-selected={isActiveTab}
          >
            {/* Status indicator */}
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                sessionNeedsAttention
                  ? 'bg-warning-500 animate-pulse'
                  : isRunning
                    ? 'bg-warning-500 animate-pulse'
                    : 'bg-mint-400'
              }`}
              title={
                sessionNeedsAttention
                  ? 'Needs attention - permission request pending'
                  : isRunning
                    ? 'Session is running'
                    : 'Session completed'
              }
              aria-label={
                sessionNeedsAttention
                  ? 'Needs attention'
                  : isRunning
                    ? 'Running'
                    : 'Completed'
              }
            />
            {/* Entity badges - show linked issues/PRs */}
            {session.entities && session.entities.length > 0 && (
              <span className="flex items-center gap-1 shrink-0">
                {session.entities.slice(0, 2).map((entity, idx) => (
                  <span
                    key={`${entity.kind}-${entity.number}-${idx}`}
                    className={`text-xs px-1.5 py-0.5 rounded-stoody-sm font-medium ${
                      entity.kind === 'issue'
                        ? 'bg-mint-400/20 text-mint-400'
                        : 'bg-blurple-400/20 text-blurple-400'
                    }`}
                  >
                    {entity.kind === 'pr' ? 'PR' : ''}#{entity.number}
                  </span>
                ))}
                {session.entities.length > 2 && (
                  <span className="text-xs text-gray-500">+{session.entities.length - 2}</span>
                )}
              </span>
            )}
            <span className="text-sm whitespace-nowrap max-w-[180px] truncate">
              {tabName}
            </span>
            {/* Show elapsed time for running sessions, relative time for completed */}
            {isRunning && (activeProcess?.created_at || session.start_time) ? (
              <ElapsedTimer startTime={activeProcess?.created_at || session.start_time!} className="text-xs text-warning-500 tabular-nums font-medium" />
            ) : !isRunning && session.modified_at && (
              <span
                className="text-xs text-gray-500 tabular-nums"
                title={new Date(session.modified_at).toLocaleString()}
              >
                {formatRelativeTime(session.modified_at)}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(session.session_id);
              }}
              className={`session-tab-close ml-1 p-1.5 rounded-stoody-sm opacity-0 group-hover:opacity-100 text-gray-400 hover:text-danger-400 hover:bg-danger-500/15 active:bg-danger-500/25 transition-all duration-150 ${focusRing} focus-visible:opacity-100`}
              title="Close tab"
              aria-label={`Close ${session.title || 'session'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
      <button
        onClick={onNewSession}
        disabled={newSessionDisabled}
        className={`group/new p-2.5 rounded-stoody-lg transition-all active:scale-95 disabled:active:scale-100 ${focusRing} ${
          newSessionDisabled
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:text-pink-400 hover:bg-gray-800'
        }`}
        title={newSessionDisabled ? "Select a repository first" : "New session (Ctrl+N)"}
        aria-label="Create new session"
      >
        <svg
          className={`w-4 h-4 transition-transform ${newSessionDisabled ? '' : 'group-hover/new:rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      {/* Sliding indicator - only show when width is calculated */}
      {indicatorStyle.width > 0 && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-blurple-400 transition-all duration-200 ease-out"
          style={{
            transform: `translateX(${indicatorStyle.left}px)`,
            width: indicatorStyle.width,
          }}
        />
      )}
      </div>
    </div>
  );
}
