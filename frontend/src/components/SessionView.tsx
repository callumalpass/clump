import { useState, useEffect, useCallback } from 'react';
import { Terminal } from './Terminal';
import { ConversationView } from './ConversationView';
import { Editor } from './Editor';
import { EntityPicker } from './EntityPicker';
import type { SessionSummary, SessionDetail, EntityLink, Issue, PR, ParsedTranscript, TranscriptMessage } from '../types';
import { fetchSessionDetail, addEntityToSession, removeEntityFromSession } from '../hooks/useApi';
import { useProcessWebSocket } from '../hooks/useProcessWebSocket';
import { useTheme } from '../hooks/useTheme';
import { useTabIndicator } from '../hooks/useTabIndicator';
import { formatDuration } from '../utils/time';
import { focusRing } from '../utils/styles';
import { downloadFile, sanitizeFilename } from '../utils/download';

// =============================================================================
// Constants
// =============================================================================

// PTY input handling: Claude Code's TUI (Ink) needs batched input with delays
// to avoid overwhelming the terminal and ensure proper processing
const PTY_BATCH_SIZE = 10;           // Characters per batch to reduce network overhead
const PTY_CHUNK_DELAY_MS = 5;        // Delay between batches to avoid overwhelming TUI
const PTY_ENTER_DELAY_MS = 150;      // Delay before sending Enter to let TUI process input

// UI timing constants
const POLL_INTERVAL_MS = 2000;       // Session detail polling interval for active sessions
const COPY_STATUS_RESET_MS = 2000;   // Time before copy/prompt status resets to idle
const UI_FOCUS_DELAY_MS = 50;        // Delay for DOM focus operations (allows render)

// Export formatting
const SEPARATOR_LINE_LENGTH = 50;    // Length of separator lines in text exports

// =============================================================================
// Types & Helpers
// =============================================================================

// Extract common session metadata for export formatters
interface SessionMetadata {
  title: string;
  path: string;
  date: string | null;
  model: string | null;
  totalTokens: number | null;
  branch: string | null;
}

function extractSessionMetadata(detail: SessionDetail): SessionMetadata {
  const totalTokens = detail.total_input_tokens || detail.total_output_tokens
    ? detail.total_input_tokens + detail.total_output_tokens
    : null;

  return {
    title: detail.metadata?.title || 'Session',
    path: detail.repo_path,
    date: detail.start_time ? new Date(detail.start_time).toLocaleString() : null,
    model: detail.model || null,
    totalTokens,
    branch: detail.git_branch || null,
  };
}

// Format transcript as markdown for export
function formatTranscriptAsMarkdown(detail: SessionDetail): string {
  const lines: string[] = [];
  const meta = extractSessionMetadata(detail);

  lines.push(`# ${meta.title}`);
  lines.push('');
  lines.push(`**Path:** ${meta.path}`);
  if (meta.date) {
    lines.push(`**Date:** ${meta.date}`);
  }
  if (meta.model) {
    lines.push(`**Model:** ${meta.model}`);
  }
  if (meta.totalTokens !== null) {
    lines.push(`**Tokens:** ${meta.totalTokens.toLocaleString()}`);
  }
  if (meta.branch) {
    lines.push(`**Branch:** ${meta.branch}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const message of detail.messages) {
    const role = message.role === 'user' ? 'User' : 'Claude';
    const timestamp = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '';

    lines.push(`## ${role}${timestamp ? ` (${timestamp})` : ''}`);
    lines.push('');

    if (message.thinking) {
      lines.push('> *Thinking:*');
      for (const line of message.thinking.split('\n')) {
        lines.push(`> ${line}`);
      }
      lines.push('');
    }

    if (message.content) {
      lines.push(message.content);
      lines.push('');
    }

    if (message.tool_uses.length > 0) {
      for (const tool of message.tool_uses) {
        lines.push(`**Tool:** \`${tool.name}\``);
        lines.push('```json');
        lines.push(JSON.stringify(tool.input, null, 2));
        lines.push('```');
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

// Format transcript as plain text
function formatTranscriptAsText(detail: SessionDetail): string {
  const lines: string[] = [];
  const meta = extractSessionMetadata(detail);

  lines.push(meta.title);
  lines.push('='.repeat(meta.title.length));
  lines.push('');
  lines.push(`Path: ${meta.path}`);
  if (meta.date) {
    lines.push(`Date: ${meta.date}`);
  }
  if (meta.model) {
    lines.push(`Model: ${meta.model}`);
  }
  lines.push('');
  lines.push('-'.repeat(SEPARATOR_LINE_LENGTH));
  lines.push('');

  for (const message of detail.messages) {
    const role = message.role === 'user' ? 'USER' : 'CLAUDE';
    const timestamp = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '';

    lines.push(`[${role}]${timestamp ? ` ${timestamp}` : ''}`);

    if (message.content) {
      lines.push(message.content);
    }

    if (message.tool_uses.length > 0) {
      for (const tool of message.tool_uses) {
        lines.push(`  → Tool: ${tool.name}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export type ViewMode = 'transcript' | 'terminal';

// =============================================================================
// ViewModeToggle Component - Transcript/Terminal toggle with sliding indicator
// =============================================================================

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  const modes: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    {
      value: 'transcript',
      label: 'Transcript',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      value: 'terminal',
      label: 'Terminal',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  const { containerRef, tabRefs, indicatorStyle } = useTabIndicator<HTMLDivElement>(value);

  return (
    <div
      ref={containerRef}
      className="relative flex rounded-lg overflow-hidden border border-gray-750 bg-gray-900 shadow-stoody-sm"
      role="group"
      aria-label="View mode"
    >
      {/* Sliding background indicator */}
      <div
        className="toggle-indicator absolute top-0 bottom-0 bg-gray-700 rounded-[4px]"
        style={{
          transform: `translateX(${indicatorStyle.left}px)`,
          width: indicatorStyle.width,
        }}
      />
      {modes.map((mode) => (
        <button
          key={mode.value}
          ref={(el) => { if (el) tabRefs.current.set(mode.value, el); }}
          onClick={() => onChange(mode.value)}
          className={`toggle-btn relative z-10 flex items-center gap-1.5 px-2.5 py-1 text-xs transition-all duration-150 ${focusRing} focus:z-10 ${
            value === mode.value
              ? 'text-white font-medium'
              : 'text-gray-400 hover:text-pink-400'
          }`}
          aria-pressed={value === mode.value}
        >
          {mode.icon}
          {mode.label}
        </button>
      ))}
    </div>
  );
}

interface SessionViewProps {
  /** The session summary (from list) */
  session: SessionSummary;
  /** Active process ID (if PTY process is still running) */
  processId?: string | null;
  /** Callback when session is closed */
  onClose: () => void;
  /** Callback to continue a finished session (returns new process ID) */
  onContinue?: (prompt?: string) => Promise<string | void>;
  /** Callback when session is deleted */
  onDelete?: () => void;
  /** Callback when session title is changed */
  onTitleChange?: (title: string) => Promise<void>;
  /** Navigate to an issue */
  onShowIssue?: (issueNumber: number) => void;
  /** Navigate to a PR */
  onShowPR?: (prNumber: number) => void;
  /** Navigate to a schedule */
  onShowSchedule?: (scheduleId: number) => void;
  /** Available issues for linking */
  issues?: Issue[];
  /** Available PRs for linking */
  prs?: PR[];
  /** Callback when entities change */
  onEntitiesChange?: () => void;
  /** View mode (transcript vs terminal) - controlled by parent */
  viewMode?: ViewMode;
  /** Callback when view mode changes */
  onViewModeChange?: (mode: ViewMode) => void;
  /** Check if a session needs attention (permission request, idle) */
  needsAttention?: (sessionId: string) => boolean;
}

export function SessionView({
  session,
  processId,
  onClose,
  onContinue,
  onDelete,
  onTitleChange,
  onShowIssue,
  onShowPR,
  onShowSchedule,
  issues = [],
  prs = [],
  onEntitiesChange,
  viewMode: controlledViewMode,
  onViewModeChange,
  needsAttention,
}: SessionViewProps) {
  // Theme for styling
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  // Determine if process is active (has a running PTY)
  const isActiveProcess = !!processId || session.is_active;

  // Check if Claude is waiting for user input (permission request, idle)
  // session_id is the UUID which is the same as claude_session_id
  const waitingForInput = session.session_id
    ? needsAttention?.(session.session_id) ?? false
    : false;

  // WebSocket for sending input to active sessions
  const { sendInput } = useProcessWebSocket(processId ?? null);

  // Handler to send messages to Claude via WebSocket
  const handleSendMessage = useCallback(async (message: string) => {
    if (processId && message.trim()) {
      // Add optimistic message immediately for instant feedback
      const optimisticId = `optimistic-${Date.now()}`;
      setOptimisticMessages(prev => [...prev, {
        id: optimisticId,
        content: message.trim(),
        timestamp: new Date().toISOString(),
      }]);

      // Send message text first, then carriage return after a delay
      const text = message.trim();

      for (let i = 0; i < text.length; i += PTY_BATCH_SIZE) {
        sendInput(text.slice(i, i + PTY_BATCH_SIZE));
        if (i + PTY_BATCH_SIZE < text.length) {
          await new Promise(resolve => setTimeout(resolve, PTY_CHUNK_DELAY_MS));
        }
      }

      // Wait for Claude Code's TUI to process the input before sending Enter
      await new Promise(resolve => setTimeout(resolve, PTY_ENTER_DELAY_MS));

      // Use \r (carriage return) like a real terminal Enter key
      sendInput('\r');
    }
  }, [processId, sendInput]);

  // View mode: use controlled value if provided, otherwise default based on process state
  // Default to terminal for active sessions (preserves continuity from fallback Terminal component)
  const defaultViewMode: ViewMode = processId ? 'terminal' : 'transcript';
  const viewMode = controlledViewMode ?? defaultViewMode;

  const setViewMode = useCallback((mode: ViewMode) => {
    onViewModeChange?.(mode);
  }, [onViewModeChange]);

  // Terminal connection status (updated via callback from Terminal component)
  const [isConnected, setIsConnected] = useState(false);

  // Session detail state (includes full transcript)
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searchVisible, setSearchVisible] = useState(false);

  // Export state
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Initial prompt copy state
  const [promptCopyStatus, setPromptCopyStatus] = useState<'idle' | 'copied'>('idle');

  // Entity management state
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [entityPickerType, setEntityPickerType] = useState<'issue' | 'pr' | null>(null);
  const [entities, setEntities] = useState<EntityLink[]>(session.entities || []);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Continue with message state (for inactive sessions)
  const [continueMessage, setContinueMessage] = useState('');
  const [isContinuing, setIsContinuing] = useState(false);

  // Optimistic messages (shown immediately before poll confirms)
  const [optimisticMessages, setOptimisticMessages] = useState<Array<{
    id: string;
    content: string;
    timestamp: string;
  }>>([]);

  // Handler to continue session with a message
  const handleContinueWithMessage = useCallback(async () => {
    if (!onContinue || isContinuing) return;
    const message = continueMessage.trim();
    setIsContinuing(true);
    try {
      await onContinue(message || undefined);
      setContinueMessage('');
    } catch (err) {
      console.error('Failed to continue session:', err);
    } finally {
      setIsContinuing(false);
    }
  }, [onContinue, continueMessage, isContinuing]);

  // Sync entities when session changes
  useEffect(() => {
    setEntities(session.entities || []);
  }, [session.entities]);

  // Clear optimistic messages when they appear in the real transcript
  useEffect(() => {
    if (!detail?.messages || optimisticMessages.length === 0) return;

    // Get the last few real user messages to compare against optimistic ones
    const recentUserMessages = detail.messages
      .filter(m => m.role === 'user')
      .slice(-optimisticMessages.length - 2)
      .map(m => m.content.trim());

    // Remove optimistic messages that now appear in real messages
    setOptimisticMessages(prev =>
      prev.filter(opt => !recentUserMessages.includes(opt.content.trim()))
    );
  }, [detail?.messages, optimisticMessages]);

  // Handle adding entity
  const handleAddEntity = useCallback(async (kind: string, number: number) => {
    const newEntity = await addEntityToSession(session.session_id, kind, number);
    setEntities(prev => [...prev, newEntity]);
    onEntitiesChange?.();
  }, [session.session_id, onEntitiesChange]);

  // Handle removing entity
  const handleRemoveEntity = useCallback(async (entityIdx: number) => {
    await removeEntityFromSession(session.session_id, entityIdx);
    setEntities(prev => prev.filter((_, i) => i !== entityIdx));
    onEntitiesChange?.();
  }, [session.session_id, onEntitiesChange]);

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [onDelete]);

  // Handle title editing
  const handleTitleEdit = useCallback(() => {
    setEditedTitle(detail?.metadata?.title || session.title || '');
    setIsEditingTitle(true);
  }, [detail?.metadata?.title, session.title]);

  const handleTitleSave = useCallback(async () => {
    if (!onTitleChange || editedTitle.trim() === '') return;
    try {
      await onTitleChange(editedTitle.trim());
      setIsEditingTitle(false);
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  }, [onTitleChange, editedTitle]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  }, [handleTitleSave]);

  // Close actions menu when clicking outside
  useEffect(() => {
    if (!showActionsMenu) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-actions-menu]')) {
        setShowActionsMenu(false);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showActionsMenu]);

  // Fetch session detail on mount, with polling for active sessions
  // Active sessions need polling to pick up new transcript messages
  // Completed sessions don't need polling - they're static
  useEffect(() => {
    let isMounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const fetchDetail = (isInitial = false) => {
      if (isInitial) {
        setLoading(true);
        setError(null);
      }

      fetchSessionDetail(session.session_id)
        .then((data) => {
          if (isMounted) {
            setDetail(data);
            if (isInitial) setLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted && isInitial) {
            setError(err.message || 'Failed to load session');
            setLoading(false);
          }
        });
    };

    // Initial fetch
    fetchDetail(true);

    // Poll for transcript updates only if session is active
    if (isActiveProcess) {
      pollInterval = setInterval(() => fetchDetail(false), POLL_INTERVAL_MS);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [session.session_id, isActiveProcess]);

  // Reset search when session changes
  useEffect(() => {
    setSearchQuery('');
    setCurrentMatchIndex(0);
    setTotalMatches(0);
  }, [session.session_id]);

  // Get formatted content for export
  const getExportContent = useCallback((format: 'markdown' | 'text' | 'json'): string | null => {
    if (!detail) return null;

    switch (format) {
      case 'markdown':
        return formatTranscriptAsMarkdown(detail);
      case 'text':
        return formatTranscriptAsText(detail);
      case 'json':
        return JSON.stringify(detail, null, 2);
      default:
        return null;
    }
  }, [detail]);

  // Copy to clipboard
  const handleCopy = useCallback(async (format: 'markdown' | 'text' | 'json' = 'markdown') => {
    const content = getExportContent(format);
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus('copied');
      setShowExportMenu(false);
      setTimeout(() => setCopyStatus('idle'), COPY_STATUS_RESET_MS);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  }, [getExportContent]);

  // Download as file
  const handleDownload = useCallback((format: 'markdown' | 'text' | 'json') => {
    const content = getExportContent(format);
    if (!content) return;

    const extensions = { markdown: 'md', text: 'txt', json: 'json' };
    const mimeTypes = { markdown: 'text/markdown', text: 'text/plain', json: 'application/json' };
    const title = detail?.metadata?.title || session.title || 'session';
    const filename = `${sanitizeFilename(title)}.${extensions[format]}`;

    downloadFile(content, filename, mimeTypes[format]);
    setShowExportMenu(false);
  }, [getExportContent, detail, session.title]);

  // Get the initial user prompt from the transcript
  const getInitialPrompt = useCallback((): string | null => {
    if (!detail?.messages?.length) return null;
    const firstUserMessage = detail.messages.find(m => m.role === 'user');
    return firstUserMessage?.content || null;
  }, [detail]);

  // Copy initial prompt to clipboard
  const handleCopyInitialPrompt = useCallback(async () => {
    const prompt = getInitialPrompt();
    if (!prompt) return;

    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopyStatus('copied');
      setShowActionsMenu(false);
      setTimeout(() => setPromptCopyStatus('idle'), COPY_STATUS_RESET_MS);
    } catch {
      console.error('Failed to copy prompt to clipboard');
    }
  }, [getInitialPrompt]);

  const handleMatchesFound = useCallback((count: number) => {
    setTotalMatches(count);
    if (count > 0 && currentMatchIndex >= count) {
      setCurrentMatchIndex(0);
    }
  }, [currentMatchIndex]);

  const goToNextMatch = useCallback(() => {
    if (totalMatches > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % totalMatches);
    }
  }, [totalMatches]);

  const goToPrevMatch = useCallback(() => {
    if (totalMatches > 0) {
      setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
    }
  }, [totalMatches]);

  // Close export menu when clicking outside
  useEffect(() => {
    if (!showExportMenu) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-export-menu]')) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showExportMenu]);

  // Keyboard shortcuts for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when viewing transcript
      if (viewMode !== 'transcript') return;

      // Ctrl/Cmd + F to toggle search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchVisible(true);
        setTimeout(() => {
          const input = document.querySelector('[data-transcript-search]') as HTMLInputElement;
          input?.focus();
        }, UI_FOCUS_DELAY_MS);
      }

      // Escape to close search
      if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false);
        setSearchQuery('');
      }

      // Enter to go to next match
      if (e.key === 'Enter' && searchVisible) {
        const activeElement = document.activeElement;
        if (activeElement?.hasAttribute('data-transcript-search')) {
          e.preventDefault();
          if (e.shiftKey) {
            goToPrevMatch();
          } else {
            goToNextMatch();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, searchVisible, goToNextMatch, goToPrevMatch]);

  const title = detail?.metadata?.title || session.title || 'Untitled session';

  // For active sessions with terminal, we render BOTH terminal and transcript views
  // but hide the inactive one. This keeps the Terminal mounted so its xterm buffer
  // is preserved when switching between views.
  const showTerminalView = isActiveProcess && processId && viewMode === 'terminal';
  const hasTerminal = isActiveProcess && !!processId;

  // Build a ParsedTranscript-compatible object for ConversationView
  // Include optimistic messages (user messages that haven't been confirmed by poll yet)
  const optimisticTranscriptMessages: TranscriptMessage[] = optimisticMessages.map(msg => ({
    uuid: msg.id,
    role: 'user' as const,
    content: msg.content,
    timestamp: msg.timestamp,
    tool_uses: [],
  }));

  const transcriptForView: ParsedTranscript | null = detail ? {
    session_id: detail.session_id,
    messages: [...detail.messages, ...optimisticTranscriptMessages],
    summary: detail.summary || undefined,
    model: detail.model || undefined,
    total_input_tokens: detail.total_input_tokens,
    total_output_tokens: detail.total_output_tokens,
    total_cache_read_tokens: detail.total_cache_read_tokens,
    total_cache_creation_tokens: detail.total_cache_creation_tokens,
    start_time: detail.start_time || undefined,
    end_time: detail.end_time || undefined,
    claude_code_version: detail.claude_code_version || undefined,
    git_branch: detail.git_branch || undefined,
  } : null;

  // Theme-aware colors for the container
  const containerBg = isLight ? 'bg-[#fdfbf7]' : 'bg-[#2d3436]';
  const containerBorder = isLight ? 'border-[#dfe6e9]' : 'border-gray-750';

  // Transcript view (default, or only option for completed sessions)
  return (
    <div className={`h-full flex flex-col ${containerBg} rounded-lg border ${containerBorder} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-gray-800/50 border-b border-gray-750">
        {/* Left: Title/Status + Entity chips */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Terminal view: show connection status and process ID */}
          {showTerminalView ? (
            <>
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                isConnected
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isConnected
                    ? 'bg-green-400'
                    : 'bg-red-400 animate-pulse'
                }`} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
              <span className="text-sm text-gray-500">|</span>
              <span className="text-sm text-gray-400 shrink-0">{processId?.slice(0, 8)}</span>
            </>
          ) : (
            <>
              {/* Transcript view: show title */}
              {!isActiveProcess && (
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              )}
              {isEditingTitle ? (
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={handleTitleSave}
                  className="text-sm font-medium text-white bg-gray-700 border border-gray-600 rounded px-2 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-w-0 flex-1"
                  autoFocus
                />
              ) : (
                <h3
                  className={`text-sm font-medium text-white truncate ${onTitleChange ? 'cursor-pointer hover:text-blurple-400 transition-colors' : ''}`}
                  onClick={onTitleChange ? handleTitleEdit : undefined}
                  title={onTitleChange ? 'Click to edit title' : undefined}
                >
                  {title}
                </h3>
              )}
            </>
          )}
          {/* Entities - shown in both views */}
          {entities.length > 0 && (
            <>
              {showTerminalView && <span className="text-sm text-gray-500">|</span>}
              <div className="flex items-center gap-1.5 flex-wrap">
                {entities.map((entity, idx) => (
                  showTerminalView ? (
                    <button
                      key={idx}
                      onClick={() => entity.kind === 'issue' ? onShowIssue?.(entity.number) : onShowPR?.(entity.number)}
                      className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                        entity.kind === 'issue'
                          ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
                          : 'bg-purple-900/30 text-purple-400 hover:bg-purple-900/50'
                      }`}
                    >
                      #{entity.number}
                    </button>
                  ) : (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                        entity.kind === 'issue'
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-purple-900/30 text-purple-400'
                      }`}
                    >
                      <button
                        onClick={() => entity.kind === 'issue' ? onShowIssue?.(entity.number) : onShowPR?.(entity.number)}
                        className="hover:underline"
                      >
                        #{entity.number}
                      </button>
                      <button
                        onClick={() => handleRemoveEntity(idx)}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        title="Unlink"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  )
                ))}
              </div>
            </>
          )}
          {session.scheduled_job_id && (
            <>
              {showTerminalView && <span className="text-sm text-gray-500">|</span>}
              <button
                onClick={() => onShowSchedule?.(session.scheduled_job_id!)}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900/50 transition-colors shrink-0"
                title="View schedule"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Scheduled</span>
              </button>
            </>
          )}
        </div>

        {/* Right: Controls (never truncate) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle (only show for active sessions with processId) */}
          {hasTerminal && (
            <ViewModeToggle
              value={showTerminalView ? 'terminal' : 'transcript'}
              onChange={setViewMode}
            />
          )}

          {/* Live indicator for active sessions */}
          {isActiveProcess && !waitingForInput && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          )}
          {/* Waiting for input indicator */}
          {isActiveProcess && waitingForInput && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full shrink-0 animate-pulse">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Waiting for input
            </span>
          )}
          {/* Search toggle button */}
          <button
            onClick={() => {
              setSearchVisible(!searchVisible);
              if (!searchVisible) {
                setTimeout(() => {
                  const input = document.querySelector('[data-transcript-search]') as HTMLInputElement;
                  input?.focus();
                }, UI_FOCUS_DELAY_MS);
              }
            }}
            className={`p-1.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              searchVisible ? 'bg-blurple-500 text-white' : 'hover:bg-gray-750 text-gray-400 hover:text-white'
            }`}
            title="Search transcript (Ctrl+F)"
            aria-label="Search transcript"
            aria-expanded={searchVisible}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Copy button */}
          {detail && (
            <button
              onClick={() => handleCopy('markdown')}
              className={`copy-button p-1.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                copyStatus === 'copied'
                  ? 'bg-green-600 text-white'
                  : 'hover:bg-gray-750 text-gray-400 hover:text-white'
              }`}
              title={copyStatus === 'copied' ? 'Copied!' : 'Copy transcript'}
              aria-label={copyStatus === 'copied' ? 'Copied to clipboard' : 'Copy transcript to clipboard'}
            >
              {copyStatus === 'copied' ? (
                <svg className="w-4 h-4 copy-success-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}

          {/* Export dropdown */}
          {detail && (
            <div className="relative" data-export-menu>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className={`p-1.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  showExportMenu ? 'bg-gray-700 text-white' : 'hover:bg-gray-750 text-gray-400 hover:text-white'
                }`}
                title="Download transcript"
                aria-label="Download transcript"
                aria-expanded={showExportMenu}
                aria-haspopup="menu"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-gray-800 border border-gray-750 rounded-lg shadow-lg py-1 z-50 origin-top-right animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-xs text-gray-500 font-medium">Download as</div>
                  <button
                    onClick={() => handleDownload('markdown')}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-750 text-gray-300 flex items-center gap-2 transition-colors focus:outline-none focus:bg-gray-700"
                  >
                    <span className="text-purple-400">.md</span>
                    <span>Markdown</span>
                  </button>
                  <button
                    onClick={() => handleDownload('text')}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-750 text-gray-300 flex items-center gap-2 transition-colors focus:outline-none focus:bg-gray-700"
                  >
                    <span className="text-blurple-400">.txt</span>
                    <span>Plain text</span>
                  </button>
                  <button
                    onClick={() => handleDownload('json')}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-750 text-gray-300 flex items-center gap-2 transition-colors focus:outline-none focus:bg-gray-700"
                  >
                    <span className="text-green-400">.json</span>
                    <span>JSON</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Actions dropdown */}
          <div className="relative" data-actions-menu>
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className={`p-1.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                showActionsMenu ? 'bg-gray-700 text-white' : 'hover:bg-gray-750 text-gray-400 hover:text-white'
              }`}
              title="Actions"
              aria-label="Actions"
              aria-expanded={showActionsMenu}
              aria-haspopup="menu"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>

            {showActionsMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-750 rounded-lg shadow-lg py-1 z-50 origin-top-right animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    setEntityPickerType('issue');
                    setShowActionsMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-750 text-gray-300 flex items-center gap-2 transition-colors focus:outline-none focus:bg-gray-700"
                >
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Link Issue
                </button>
                <button
                  onClick={() => {
                    setEntityPickerType('pr');
                    setShowActionsMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-750 text-gray-300 flex items-center gap-2 transition-colors focus:outline-none focus:bg-gray-700"
                >
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Link PR
                </button>
                {/* Copy initial prompt button */}
                {getInitialPrompt() && (
                  <button
                    onClick={handleCopyInitialPrompt}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-750 text-gray-300 flex items-center gap-2 transition-colors focus:outline-none focus:bg-gray-700"
                  >
                    {promptCopyStatus === 'copied' ? (
                      <>
                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 text-blurple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Prompt
                      </>
                    )}
                  </button>
                )}
                {/* Delete button - only for non-active sessions */}
                {!isActiveProcess && onDelete && (
                  <>
                    <div className="border-t border-gray-750 my-1" />
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(true);
                        setShowActionsMenu(false);
                      }}
                      className="w-full px-3 py-1.5 text-sm text-left hover:bg-red-900/50 text-red-400 flex items-center gap-2 transition-colors focus:outline-none focus:bg-red-900/50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-750 rounded text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchVisible && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/30 border-b border-gray-750">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              data-transcript-search
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentMatchIndex(0);
              }}
              placeholder="Search in transcript..."
              className={`w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm pl-8 focus:border-blue-500 focus:outline-none ${searchQuery ? 'pr-8' : ''}`}
            />
            <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setCurrentMatchIndex(0);
                  // Keep focus on search input
                  const input = document.querySelector('[data-transcript-search]') as HTMLInputElement;
                  input?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-750 text-gray-400 hover:text-white transition-colors"
                title="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {searchQuery && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400 min-w-[4rem] text-right">
                {totalMatches > 0 ? `${currentMatchIndex + 1} of ${totalMatches}` : 'No matches'}
              </span>
              <button
                onClick={goToPrevMatch}
                disabled={totalMatches === 0}
                className="p-1 hover:bg-gray-750 rounded text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title="Previous match (Shift+Enter)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={goToNextMatch}
                disabled={totalMatches === 0}
                className="p-1 hover:bg-gray-750 rounded text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title="Next match (Enter)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setSearchVisible(false);
              setSearchQuery('');
            }}
            className="p-1 hover:bg-gray-750 rounded text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Close search (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Content - Terminal and Transcript views */}
      {/* Terminal view: always mounted when hasTerminal, but hidden when not active */}
      {/* This preserves xterm buffer across view switches */}
      {hasTerminal && (
        <div className={`flex-1 min-h-0 ${showTerminalView ? '' : 'hidden'}`}>
          <Terminal
            processId={processId!}
            showHeader={false}
            onConnectionChange={setIsConnected}
          />
        </div>
      )}

      {/* Transcript view: hidden when terminal view is active */}
      <div className={`flex-1 overflow-auto ${showTerminalView ? 'hidden' : ''}`}>
        {loading && (
          <div className="p-4">
            {/* Stats bar skeleton */}
            <div className="bg-gray-850 border-b border-gray-750 px-3 py-2 rounded-t-lg mb-4">
              <div className="flex items-center gap-4">
                <div className="h-5 w-16 rounded-full skeleton-shimmer" />
                <div className="h-4 w-24 rounded skeleton-shimmer" />
                <div className="h-4 w-20 rounded skeleton-shimmer" />
              </div>
            </div>
            {/* Message bubbles skeleton */}
            <div className="space-y-4">
              <div className="flex justify-end">
                <div className="max-w-[85%] ml-8">
                  <div className="flex justify-end mb-1">
                    <div className="h-3 w-16 rounded skeleton-shimmer" />
                  </div>
                  <div className="bg-blue-900/30 border border-blue-800/50 rounded-lg px-3 py-2">
                    <div className="h-4 w-48 rounded skeleton-shimmer mb-2" />
                    <div className="h-4 w-32 rounded skeleton-shimmer" />
                  </div>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[85%] mr-8">
                  <div className="flex justify-start mb-1">
                    <div className="h-3 w-20 rounded skeleton-shimmer" />
                  </div>
                  <div className="bg-gray-800 border border-gray-750 rounded-lg px-3 py-2">
                    <div className="h-4 w-full rounded skeleton-shimmer mb-2" />
                    <div className="h-4 w-5/6 rounded skeleton-shimmer mb-2" />
                    <div className="h-4 w-4/6 rounded skeleton-shimmer" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="p-6 rounded-xl bg-gray-800/40 border border-gray-750/50 max-w-sm">
              <div className="w-14 h-14 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-gray-300 font-medium mb-1">Failed to load session</p>
              <p className="text-gray-400 text-sm mb-4">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  fetchSessionDetail(session.session_id)
                    .then((data) => {
                      setDetail(data);
                      setLoading(false);
                    })
                    .catch((err) => {
                      setError(err.message || 'Failed to load session');
                      setLoading(false);
                    });
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors flex items-center gap-2 mx-auto btn-secondary"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && transcriptForView && (
          <ConversationView
            key={`transcript-${resolvedTheme}`}
            transcript={transcriptForView}
            sessionId={session.session_id}
            searchQuery={searchQuery}
            currentMatchIndex={currentMatchIndex}
            onMatchesFound={handleMatchesFound}
            isActiveSession={isActiveProcess}
            onSendMessage={processId ? handleSendMessage : undefined}
          />
        )}

        {!loading && !error && !transcriptForView && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <svg className="w-12 h-12 text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-400 font-medium mb-1">No transcript available</p>
            <p className="text-gray-400 text-sm">This session didn't produce a transcript</p>
          </div>
        )}
      </div>

      {/* Message input for inactive sessions (continue with message) */}
      {!isActiveProcess && onContinue && (
        <div className="shrink-0 border-t border-gray-750 bg-gray-800/50 p-4">
          <Editor
            value={continueMessage}
            onChange={setContinueMessage}
            placeholder="Send a message to continue this session..."
            minHeight="60px"
            maxHeight="200px"
            onSubmit={handleContinueWithMessage}
            disabled={isContinuing}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleContinueWithMessage}
              disabled={isContinuing}
              className="px-4 py-2 bg-blurple-500 hover:bg-blurple-600 hover:text-pink-400 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-stoody transition-all flex items-center gap-2 shadow-stoody-sm"
            >
              {isContinuing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span>{continueMessage.trim() ? 'Continue with message' : 'Continue'}</span>
                  <kbd className="text-xs bg-blurple-700/50 px-1.5 py-0.5 rounded-stoody-sm">⌘↵</kbd>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer with metadata */}
      <div className="px-4 py-2 border-t border-gray-750 bg-gray-800/30">
        {/* Metadata row */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span>
              {detail?.start_time ? new Date(detail.start_time).toLocaleString() : session.modified_at ? new Date(session.modified_at).toLocaleString() : 'Unknown date'}
            </span>
            {/* Session duration for completed sessions */}
            {!isActiveProcess && detail?.duration_seconds != null && (
              <span className="text-gray-400" title="Session duration">
                {formatDuration(detail.duration_seconds)}
              </span>
            )}
            {detail?.model && (
              <span className="text-gray-600">
                {detail.model.includes('opus') ? 'Opus' : detail.model.includes('haiku') ? 'Haiku' : 'Sonnet'}
              </span>
            )}
          </div>
          <span className="text-gray-600" title={session.session_id}>
            Session: {session.session_id.slice(0, 8)}...
          </span>
        </div>
      </div>

      {/* Entity Picker Modal */}
      <EntityPicker
        isOpen={entityPickerType !== null}
        onClose={() => setEntityPickerType(null)}
        entityType={entityPickerType || 'issue'}
        issues={issues}
        prs={prs}
        linkedEntities={entities}
        onAdd={handleAddEntity}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-enter">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="relative bg-gray-800 border border-gray-750 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 modal-content-enter">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Delete Session</h3>
                <p className="text-sm text-gray-400">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete this session? The transcript file will be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-750 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="btn-danger px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
