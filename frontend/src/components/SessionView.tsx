import { useState, useEffect, useCallback } from 'react';
import { Terminal } from './Terminal';
import { ConversationView, RawTranscriptView } from './ConversationView';
import type { Analysis, TranscriptResponse, ParsedTranscript } from '../types';
import { fetchTranscript } from '../hooks/useApi';

// Format transcript as markdown for export
function formatTranscriptAsMarkdown(transcript: ParsedTranscript, analysis: Analysis): string {
  const lines: string[] = [];

  lines.push(`# ${analysis.title}`);
  lines.push('');
  lines.push(`**Analysis Type:** ${analysis.type}`);
  lines.push(`**Date:** ${new Date(analysis.created_at).toLocaleString()}`);
  if (transcript.model) {
    lines.push(`**Model:** ${transcript.model}`);
  }
  if (transcript.total_input_tokens || transcript.total_output_tokens) {
    const total = (transcript.total_input_tokens || 0) + (transcript.total_output_tokens || 0);
    lines.push(`**Tokens:** ${total.toLocaleString()}`);
  }
  if (transcript.git_branch) {
    lines.push(`**Branch:** ${transcript.git_branch}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const message of transcript.messages) {
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
function formatTranscriptAsText(transcript: ParsedTranscript, analysis: Analysis): string {
  const lines: string[] = [];

  lines.push(analysis.title);
  lines.push('='.repeat(analysis.title.length));
  lines.push('');
  lines.push(`Analysis Type: ${analysis.type}`);
  lines.push(`Date: ${new Date(analysis.created_at).toLocaleString()}`);
  if (transcript.model) {
    lines.push(`Model: ${transcript.model}`);
  }
  lines.push('');
  lines.push('-'.repeat(50));
  lines.push('');

  for (const message of transcript.messages) {
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

interface RelatedEntity {
  type: 'issue' | 'pr';
  number: number;
}

type ViewMode = 'transcript' | 'terminal';

interface SessionViewProps {
  /** The analysis record (required for transcript view) */
  analysis: Analysis;
  /** Active session ID (if session is still running) */
  sessionId?: string | null;
  /** Callback when session is closed */
  onClose: () => void;
  /** Callback to continue a finished session */
  onContinue?: () => void;
  /** Related issue/PR for context display */
  relatedEntity?: RelatedEntity | null;
  /** Callback to show the related issue/PR */
  onShowRelated?: () => void;
}

export function SessionView({
  analysis,
  sessionId,
  onClose,
  onContinue,
  relatedEntity,
  onShowRelated,
}: SessionViewProps) {
  // Determine if session is active (has a running PTY)
  const isActiveSession = !!sessionId;

  // View mode: transcript or terminal (only relevant for active sessions)
  const [viewMode, setViewMode] = useState<ViewMode>('transcript');

  // Terminal connection status (updated via callback from Terminal component)
  const [isConnected, setIsConnected] = useState(false);

  // Transcript state
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
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

  // Fetch transcript (with polling for active sessions)
  useEffect(() => {
    let isMounted = true;
    let pollTimeout: NodeJS.Timeout | null = null;

    const fetchData = () => {
      fetchTranscript(analysis.id)
        .then((data) => {
          if (isMounted) {
            setTranscript(data);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err.message || 'Failed to load transcript');
            setLoading(false);
          }
        })
        .finally(() => {
          // Poll for updates if this is an active session and we're viewing transcript
          if (isMounted && isActiveSession && viewMode === 'transcript') {
            pollTimeout = setTimeout(fetchData, 2000);
          }
        });
    };

    setLoading(true);
    setError(null);
    fetchData();

    return () => {
      isMounted = false;
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [analysis.id, isActiveSession, viewMode]);

  // Reset search when analysis changes
  useEffect(() => {
    setSearchQuery('');
    setCurrentMatchIndex(0);
    setTotalMatches(0);
  }, [analysis.id]);

  // Get formatted content for export
  const getExportContent = useCallback((format: 'markdown' | 'text' | 'json'): string | null => {
    if (!transcript) return null;

    if (transcript.type === 'raw') {
      return transcript.transcript;
    }

    const parsed = transcript.transcript;
    switch (format) {
      case 'markdown':
        return formatTranscriptAsMarkdown(parsed, analysis);
      case 'text':
        return formatTranscriptAsText(parsed, analysis);
      case 'json':
        return JSON.stringify(parsed, null, 2);
      default:
        return null;
    }
  }, [transcript, analysis]);

  // Copy to clipboard
  const handleCopy = useCallback(async (format: 'markdown' | 'text' | 'json' = 'markdown') => {
    const content = getExportContent(format);
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus('copied');
      setShowExportMenu(false);
      setTimeout(() => setCopyStatus('idle'), 2000);
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

    const blob = new Blob([content], { type: mimeTypes[format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${analysis.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.${extensions[format]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [getExportContent, analysis.title]);

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
        }, 50);
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

  // If viewing terminal mode for an active session, render Terminal component
  if (isActiveSession && viewMode === 'terminal') {
    return (
      <div className="h-full flex flex-col bg-[#0d1117] rounded-lg border border-gray-700 overflow-hidden">
        {/* Header with toggle */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-gray-800/50 border-b border-gray-700">
          {/* Left: Connection status, session ID, related entity */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Connection status badge */}
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
            <span className="text-sm text-gray-400 shrink-0">{sessionId.slice(0, 8)}</span>
            {relatedEntity && onShowRelated && (
              <>
                <span className="text-sm text-gray-500">|</span>
                <button
                  onClick={onShowRelated}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors shrink-0"
                >
                  {relatedEntity.type === 'issue' ? 'Issue' : 'PR'} #{relatedEntity.number}
                </button>
              </>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* View toggle */}
            <div className="flex items-center bg-gray-900 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('transcript')}
                className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors text-gray-400 hover:text-white"
              >
                Transcript
              </button>
              <button
                onClick={() => setViewMode('terminal')}
                className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors bg-gray-700 text-white"
              >
                Terminal
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Close"
              aria-label="Close session"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {/* Terminal (without its own header) */}
        <div className="flex-1 min-h-0">
          <Terminal
            sessionId={sessionId}
            showHeader={false}
            onConnectionChange={setIsConnected}
          />
        </div>
      </div>
    );
  }

  // Transcript view (default, or only option for completed sessions)
  return (
    <div className="h-full flex flex-col bg-[#0d1117] rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-gray-800/50 border-b border-gray-700">
        {/* Left: Title (truncates) */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!isActiveSession && (
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          )}
          <h3 className="text-sm font-medium text-white truncate">{analysis.title}</h3>
          {relatedEntity && onShowRelated && (
            <button
              onClick={onShowRelated}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0"
            >
              #{relatedEntity.number}
            </button>
          )}
        </div>

        {/* Right: Controls (never truncate) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle (only show for active sessions) */}
          {isActiveSession && (
            <div className="flex items-center bg-gray-900 rounded-lg p-0.5 mr-1">
              <button
                onClick={() => setViewMode('transcript')}
                className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors bg-gray-700 text-white"
              >
                Transcript
              </button>
              <button
                onClick={() => setViewMode('terminal')}
                className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors text-gray-400 hover:text-white"
              >
                Terminal
              </button>
            </div>
          )}

          {/* Live indicator for active sessions */}
          {isActiveSession && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
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
                }, 50);
              }
            }}
            className={`p-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              searchVisible ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400 hover:text-white'
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
          {transcript && (
            <button
              onClick={() => handleCopy('markdown')}
              className={`p-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                copyStatus === 'copied'
                  ? 'bg-green-600 text-white'
                  : 'hover:bg-gray-700 text-gray-400 hover:text-white'
              }`}
              title={copyStatus === 'copied' ? 'Copied!' : 'Copy transcript'}
              aria-label={copyStatus === 'copied' ? 'Copied to clipboard' : 'Copy transcript to clipboard'}
            >
              {copyStatus === 'copied' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          {transcript && (
            <div className="relative" data-export-menu>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className={`p-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  showExportMenu ? 'bg-gray-700 text-white' : 'hover:bg-gray-700 text-gray-400 hover:text-white'
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
                <div className="absolute right-0 top-full mt-1 w-44 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 z-50 origin-top-right animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-xs text-gray-500 font-medium">Download as</div>
                  <button
                    onClick={() => handleDownload('markdown')}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-700 text-gray-300 flex items-center gap-2 focus:outline-none focus:bg-gray-700"
                  >
                    <span className="text-purple-400">.md</span>
                    <span>Markdown</span>
                  </button>
                  <button
                    onClick={() => handleDownload('text')}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-700 text-gray-300 flex items-center gap-2 focus:outline-none focus:bg-gray-700"
                  >
                    <span className="text-blue-400">.txt</span>
                    <span>Plain text</span>
                  </button>
                  <button
                    onClick={() => handleDownload('json')}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-700 text-gray-300 flex items-center gap-2 focus:outline-none focus:bg-gray-700"
                  >
                    <span className="text-green-400">.json</span>
                    <span>JSON</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Continue button (only for completed sessions) */}
          {!isActiveSession && analysis.claude_session_id && onContinue && (
            <button
              onClick={onContinue}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-gray-900"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              Continue
            </button>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/30 border-b border-gray-700">
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
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm pl-8 focus:border-blue-500 focus:outline-none"
            />
            <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {searchQuery && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400 min-w-[4rem] text-right">
                {totalMatches > 0 ? `${currentMatchIndex + 1} of ${totalMatches}` : 'No matches'}
              </span>
              <button
                onClick={goToPrevMatch}
                disabled={totalMatches === 0}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Previous match (Shift+Enter)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={goToNextMatch}
                disabled={totalMatches === 0}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Close search (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="p-4">
            {/* Stats bar skeleton */}
            <div className="bg-gray-850 border-b border-gray-700 px-3 py-2 rounded-t-lg mb-4">
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
                  <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
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
            <div className="p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-sm">
              <div className="w-14 h-14 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-gray-300 font-medium mb-1">Failed to load transcript</p>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && transcript && (
          transcript.type === 'parsed' ? (
            <ConversationView
              transcript={transcript.transcript}
              searchQuery={searchQuery}
              currentMatchIndex={currentMatchIndex}
              onMatchesFound={handleMatchesFound}
            />
          ) : (
            <div className="p-4">
              <RawTranscriptView transcript={transcript.transcript} />
            </div>
          )
        )}

        {!loading && !error && !transcript && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <svg className="w-12 h-12 text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-400 font-medium mb-1">No transcript available</p>
            <p className="text-gray-500 text-sm">The analysis session didn't produce a transcript</p>
          </div>
        )}
      </div>

      {/* Footer with metadata */}
      <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/30">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {new Date(analysis.created_at).toLocaleString()}
          </span>
          {analysis.claude_session_id && (
            <span className="text-gray-600" title={analysis.claude_session_id}>
              Session: {analysis.claude_session_id.slice(0, 8)}...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
