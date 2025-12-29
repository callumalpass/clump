import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import type { TranscriptMessage, ToolUse, ParsedTranscript } from '../types';
import { Markdown } from './Markdown';
import { Editor } from './Editor';
import { SubsessionView } from './SubsessionView';
import { calculateCost, formatCost } from '../utils/costs';
import { getModelDisplayName, getModelBadgeStyle } from '../utils/models';
import { computeLineDiff } from '../utils/diffing';
import { cleanTerminalOutput } from '../utils/text';
import { calculateDuration } from '../hooks/useElapsedTime';

// Highlight matching text in a string
// Memoized to avoid recomputation on every render
const HighlightedText = memo(function HighlightedText({
  text,
  searchQuery,
  currentMatchIndexInText
}: {
  text: string;
  searchQuery: string;
  /** The specific match index within this text that should be highlighted as "current" */
  currentMatchIndexInText?: number;
}) {
  // Memoize the parts calculation to avoid string manipulation on every render
  const parts = useMemo(() => {
    if (!searchQuery.trim()) {
      return null; // Signal to render text directly
    }

    const result: React.ReactNode[] = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    let lastIndex = 0;
    let matchIndex = 0;

    while (true) {
      const index = lowerText.indexOf(lowerQuery, lastIndex);
      if (index === -1) break;

      // Add text before match
      if (index > lastIndex) {
        result.push(text.slice(lastIndex, index));
      }

      // Only highlight the specific match that is the current one
      const isThisMatchCurrent = currentMatchIndexInText === matchIndex;

      // Add highlighted match
      result.push(
        <mark
          key={`match-${matchIndex}`}
          className={`rounded px-0.5 ${
            isThisMatchCurrent
              ? 'bg-yellow-400 text-black'
              : 'bg-yellow-500/30 text-inherit'
          }`}
          data-search-match={matchIndex}
        >
          {text.slice(index, index + searchQuery.length)}
        </mark>
      );

      lastIndex = index + searchQuery.length;
      matchIndex++;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      result.push(text.slice(lastIndex));
    }

    return result;
  }, [text, searchQuery, currentMatchIndexInText]);

  if (parts === null) {
    return <>{text}</>;
  }

  return <>{parts}</>;
});

interface ConversationViewProps {
  transcript: ParsedTranscript;
  sessionId?: string;  // For loading subsessions
  searchQuery?: string;
  currentMatchIndex?: number;
  onMatchesFound?: (count: number) => void;
  isActiveSession?: boolean;
  onSendMessage?: (message: string) => void;
}

// Format token count for display
function formatTokens(count: number | undefined): string {
  if (count === undefined || count === null) return '0';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

// Format time gap for display between messages
function formatTimeGap(ms: number): string | null {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // Only show gap if >= 3 minutes
  if (minutes < 3) return null;

  if (days > 0) {
    return days === 1 ? '1 day later' : `${days} days later`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour later' : `${hours} hours later`;
  }
  return `${minutes} minutes later`;
}

// Time gap indicator component
function TimeGapIndicator({ gapMs }: { gapMs: number }) {
  const gapText = formatTimeGap(gapMs);
  if (!gapText) return null;

  return (
    <div className="flex items-center gap-3 py-2 my-1" role="separator" aria-label={gapText}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
      <span className="text-xs text-gray-500 flex items-center gap-1.5 px-2">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {gapText}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
    </div>
  );
}

// Count tool usage from transcript messages
function countToolUsage(messages: TranscriptMessage[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const message of messages) {
    for (const tool of message.tool_uses) {
      counts[tool.name] = (counts[tool.name] || 0) + 1;
    }
  }
  return counts;
}

// Tool styling configuration for the summary
const TOOL_STYLES: Record<string, { color: string; label: string }> = {
  Edit: { color: 'text-emerald-400', label: 'edits' },
  Read: { color: 'text-blurple-400', label: 'reads' },
  Write: { color: 'text-cyan-400', label: 'writes' },
  Bash: { color: 'text-amber-400', label: 'cmds' },
  Grep: { color: 'text-orange-400', label: 'searches' },
  Glob: { color: 'text-violet-400', label: 'globs' },
  Task: { color: 'text-purple-400', label: 'agents' },
  WebFetch: { color: 'text-pink-400', label: 'fetches' },
  WebSearch: { color: 'text-rose-400', label: 'searches' },
  LSP: { color: 'text-teal-400', label: 'lsp' },
};

// Component to display tool usage summary
function ToolUsageSummary({ toolCounts }: { toolCounts: Record<string, number> }) {
  const entries = Object.entries(toolCounts);
  if (entries.length === 0) return null;

  // Sort by count descending, take top 5
  const sorted = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const shown = sorted.reduce((sum, [, count]) => sum + count, 0);
  const othersCount = total - shown;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-gray-500">Tools:</span>
      {sorted.map(([name, count]) => {
        const style = TOOL_STYLES[name] || { color: 'text-gray-400', label: name.toLowerCase() };
        return (
          <span
            key={name}
            className={`${style.color} tabular-nums`}
            title={`${count} ${name} call${count !== 1 ? 's' : ''}`}
          >
            {count} {style.label}
          </span>
        );
      })}
      {othersCount > 0 && (
        <span className="text-gray-500" title={`${othersCount} other tool calls`}>
          +{othersCount}
        </span>
      )}
    </div>
  );
}

function SessionStats({ transcript }: { transcript: ParsedTranscript }) {
  const totalInput = transcript.total_input_tokens ?? 0;
  const totalOutput = transcript.total_output_tokens ?? 0;
  const totalCacheRead = transcript.total_cache_read_tokens ?? 0;
  const totalCacheCreation = transcript.total_cache_creation_tokens ?? 0;
  const totalTokens = totalInput + totalOutput;
  const estimatedCost = calculateCost(
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheCreation,
    transcript.model
  );

  // Calculate tool usage
  const toolCounts = useMemo(() => countToolUsage(transcript.messages), [transcript.messages]);

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm px-4 py-3 shadow-stoody-sm">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-xs">
          {/* Model badge - color-coded by model type */}
          <span className={`px-2.5 py-1 rounded-stoody ${getModelBadgeStyle(transcript.model)}`}>
            {getModelDisplayName(transcript.model)}
          </span>

          {/* Token stats */}
          <div className="flex items-center gap-1 text-gray-400">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span title={`Input: ${formatTokens(totalInput)} / Output: ${formatTokens(totalOutput)}`}>
              {formatTokens(totalTokens)} tokens
            </span>
          </div>

          {/* Cache efficiency */}
          {totalCacheRead > 0 && (
            <div className="flex items-center gap-1 text-green-400" title="Tokens read from cache">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>{formatTokens(totalCacheRead)} cached</span>
            </div>
          )}

          {/* Duration */}
          <div className="flex items-center gap-1 text-gray-400">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{transcript.start_time && transcript.end_time ? calculateDuration(transcript.start_time, transcript.end_time) : '-'}</span>
          </div>

          {/* Message count */}
          <span className="text-gray-500">
            {transcript.messages.length} messages
          </span>

          {/* Estimated cost */}
          {estimatedCost !== null && (
            <div
              className="flex items-center gap-1 text-amber-400"
              title={`Estimated cost based on ${getModelDisplayName(transcript.model)} pricing (Dec 2024)\nInput: ${formatTokens(totalInput)} tokens\nOutput: ${formatTokens(totalOutput)} tokens\nCache read: ${formatTokens(totalCacheRead)} tokens`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatCost(estimatedCost)}</span>
            </div>
          )}
        </div>

        {/* Git branch */}
        {transcript.git_branch && (
          <span className="text-xs text-gray-500">
            <span className="text-gray-600">branch:</span> {transcript.git_branch}
          </span>
        )}
      </div>

      {/* Tool usage summary */}
      {Object.keys(toolCounts).length > 0 && (
        <div className="mt-1.5">
          <ToolUsageSummary toolCounts={toolCounts} />
        </div>
      )}

      {/* Summary if available */}
      {transcript.summary && (
        <div className="mt-1 text-xs text-gray-400 truncate" title={transcript.summary}>
          {transcript.summary}
        </div>
      )}
    </div>
  );
}

interface ToolDisplayProps {
  tool: ToolUse;
  parentSessionId?: string;
}

// Helper to get just the filename from a path
function getFileName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
}

// Helper to truncate long strings
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

// Count lines in a string
function countLines(str: string): number {
  return str.split('\n').length;
}

// ============ EDIT TOOL ============
function EditToolDisplay({ tool }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const input = tool.input as {
    file_path?: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
  };

  const filePath = input.file_path || 'unknown';
  const oldStr = input.old_string || '';
  const newStr = input.new_string || '';
  const fileName = getFileName(filePath);

  const oldLines = countLines(oldStr);
  const newLines = countLines(newStr);
  const lineDiff = newLines - oldLines;

  // Compute unified diff
  const diffLines = useMemo(() => computeLineDiff(oldStr, newStr), [oldStr, newStr]);

  return (
    <div className="mt-2 text-xs rounded-stoody bg-gray-800 overflow-hidden tool-card-hover shadow-stoody-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-emerald-900/20 text-left transition-all duration-150 group/tool"
      >
        {/* Edit icon */}
        <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <span className="text-emerald-400 font-medium">Edit</span>
        <span className="text-gray-300 font-mono truncate flex-1" title={filePath}>
          {fileName}
        </span>
        {/* Line change indicator */}
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          lineDiff > 0 ? 'bg-green-900/50 text-green-400' :
          lineDiff < 0 ? 'bg-red-900/50 text-red-400' :
          'bg-gray-700 text-gray-400'
        }`}>
          {lineDiff > 0 ? `+${lineDiff}` : lineDiff < 0 ? lineDiff : '±0'} lines
        </span>
        {input.replace_all && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-400">
            all
          </span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="tool-card-content" data-expanded={expanded}>
        <div className="tool-card-content-inner">
          <div className="border-t border-gray-750">
            {/* File path */}
            <div className="px-2 py-1 bg-gray-900/50 text-gray-500 font-mono text-[10px] truncate">
              {filePath}
            </div>

            {/* Unified diff view */}
            <div className="overflow-auto max-h-80 font-mono text-xs">
              {diffLines.length === 0 ? (
                <div className="p-2 text-gray-500 italic">No changes</div>
              ) : (
                diffLines.map((diff, idx) => {
                  if (diff.type === 'modified') {
                    // Render modified line with inline highlights
                    return (
                      <div key={idx}>
                        {/* Old line with deletions highlighted */}
                        <div className="px-2 py-0.5 whitespace-pre-wrap break-all bg-red-950/30">
                          <span className="inline-block w-4 shrink-0 select-none text-red-500">-</span>
                          {diff.oldSegments.map((seg, segIdx) => (
                            <span
                              key={segIdx}
                              className={seg.type === 'delete' ? 'bg-red-700/60 text-red-200 rounded-sm' : 'text-red-300/70'}
                            >
                              {seg.text}
                            </span>
                          ))}
                        </div>
                        {/* New line with insertions highlighted */}
                        <div className="px-2 py-0.5 whitespace-pre-wrap break-all bg-green-950/30">
                          <span className="inline-block w-4 shrink-0 select-none text-green-500">+</span>
                          {diff.newSegments.map((seg, segIdx) => (
                            <span
                              key={segIdx}
                              className={seg.type === 'insert' ? 'bg-green-700/60 text-green-200 rounded-sm' : 'text-green-300/70'}
                            >
                              {seg.text}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  // Simple line (unchanged, removed, or added)
                  return (
                    <div
                      key={idx}
                      className={`px-2 py-0.5 whitespace-pre-wrap break-all ${
                        diff.type === 'removed'
                          ? 'bg-red-950/30 text-red-300'
                          : diff.type === 'added'
                          ? 'bg-green-950/30 text-green-300'
                          : 'bg-gray-900/30 text-gray-400'
                      }`}
                    >
                      <span className={`inline-block w-4 shrink-0 select-none ${
                        diff.type === 'removed'
                          ? 'text-red-500'
                          : diff.type === 'added'
                          ? 'text-green-500'
                          : 'text-gray-600'
                      }`}>
                        {diff.type === 'removed' ? '-' : diff.type === 'added' ? '+' : ' '}
                      </span>
                      {diff.line || ' '}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to check if a file is an image based on extension
function isImageFile(filePath: string): boolean {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const lower = filePath.toLowerCase();
  return imageExtensions.some(ext => lower.endsWith(ext));
}

// Image modal for viewing images full-size (rendered via portal)
function ImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  // Close on escape key and prevent body scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90"
      onClick={onClose}
      style={{ margin: 0 }}
    >
      {/* Close button - top right corner */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-2 z-10"
        title="Close (Esc)"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image container */}
      <div className="p-8" onClick={e => e.stopPropagation()}>
        <img
          src={src}
          alt={alt}
          className="max-w-[85vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
        {/* Filename below image */}
        <div className="mt-3 text-center text-gray-400 text-sm">
          {alt}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// Helper to detect if content might be base64 image data
function isBase64ImageData(content: string): { isBase64: boolean; mimeType?: string } {
  // Check for data URL format
  const dataUrlMatch = content.match(/^data:(image\/[^;]+);base64,/);
  if (dataUrlMatch) {
    return { isBase64: true, mimeType: dataUrlMatch[1] };
  }
  // Check for raw base64 (starts with common image magic bytes in base64)
  // PNG: iVBOR, JPEG: /9j/, GIF: R0lG, WebP: UklGR
  if (/^(iVBOR|\/9j\/|R0lG|UklGR)/.test(content.trim())) {
    return { isBase64: true };
  }
  return { isBase64: false };
}

// ============ READ TOOL ============
function ReadToolDisplay({ tool }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const input = tool.input as {
    file_path?: string;
    offset?: number;
    limit?: number;
  };

  const filePath = input.file_path || 'unknown';
  const fileName = getFileName(filePath);
  const hasRange = input.offset !== undefined || input.limit !== undefined;
  const hasResult = !!tool.result;
  const isImage = isImageFile(filePath);

  // Process result content for display
  const resultContent = useMemo(() => {
    if (!tool.result) return null;

    // Check if it's an image
    if (isImage) {
      const base64Check = isBase64ImageData(tool.result);
      if (base64Check.isBase64) {
        // If it's already a data URL, use as-is; otherwise construct one
        if (tool.result.startsWith('data:')) {
          return { type: 'image' as const, src: tool.result };
        }
        // Guess mime type from extension
        const ext = filePath.toLowerCase().split('.').pop();
        const mimeTypes: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          webp: 'image/webp',
          svg: 'image/svg+xml',
          bmp: 'image/bmp',
          ico: 'image/x-icon',
        };
        const mimeType = mimeTypes[ext || ''] || 'image/png';
        return { type: 'image' as const, src: `data:${mimeType};base64,${tool.result.trim()}` };
      }
    }

    // It's text content
    return { type: 'text' as const, content: tool.result };
  }, [tool.result, isImage, filePath]);

  // Count lines in result
  const lineCount = tool.result ? countLines(tool.result) : 0;

  return (
    <div className="mt-2 text-xs rounded-stoody bg-gray-800 overflow-hidden tool-card-hover shadow-stoody-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-750 text-left transition-colors"
      >
        {/* Read icon */}
        <svg className="w-3.5 h-3.5 text-blurple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-blurple-400 font-medium">Read</span>
        <span className="text-gray-300 font-mono truncate flex-1" title={filePath}>
          {fileName}
        </span>
        {isImage && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300">
            image
          </span>
        )}
        {hasRange && (
          <span className="text-xs text-gray-500">
            {input.offset !== undefined && `from L${input.offset}`}
            {input.limit !== undefined && ` (${input.limit} lines)`}
          </span>
        )}
        {!hasRange && hasResult && !isImage && lineCount > 0 && (
          <span className="text-xs text-gray-500">
            {lineCount} lines
          </span>
        )}
        {tool.result_is_error && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">
            error
          </span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="tool-card-content" data-expanded={expanded}>
        <div className="tool-card-content-inner">
          <div className="border-t border-gray-750">
            {/* File path header */}
            <div className="px-2 py-1.5 bg-gray-900/50 border-b border-gray-750">
              <div className="font-mono text-gray-400 text-[10px] break-all">
                {filePath}
              </div>
              {hasRange && (
                <div className="mt-1 text-gray-500">
                  {input.offset !== undefined && <span>Offset: {input.offset}</span>}
                  {input.offset !== undefined && input.limit !== undefined && <span> | </span>}
                  {input.limit !== undefined && <span>Limit: {input.limit} lines</span>}
                </div>
              )}
            </div>

            {/* Result content */}
            {resultContent && (
              <div className={tool.result_is_error ? 'bg-red-950/20' : 'bg-gray-900/30'}>
                {resultContent.type === 'image' ? (
                  <div className="p-3 flex justify-center">
                    <button
                      onClick={() => setShowImageModal(true)}
                      className="relative group cursor-zoom-in"
                      title="Click to enlarge"
                    >
                      <img
                        src={resultContent.src}
                        alt={fileName}
                        className="max-w-full max-h-96 h-auto rounded-lg border border-gray-750 transition-all group-hover:border-blue-500"
                        loading="lazy"
                      />
                      {/* Zoom indicator */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg">
                        <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                      </div>
                    </button>
                  </div>
                ) : (
                  <pre className={`p-2 text-xs whitespace-pre-wrap overflow-auto max-h-80 font-mono ${
                    tool.result_is_error ? 'text-red-300' : 'text-gray-300'
                  }`}>
                    {resultContent.content}
                  </pre>
                )}
              </div>
            )}

            {/* Image modal */}
            {showImageModal && resultContent?.type === 'image' && (
              <ImageModal
                src={resultContent.src}
                alt={fileName}
                onClose={() => setShowImageModal(false)}
              />
            )}

            {/* No result message */}
            {!resultContent && (
              <div className="px-2 py-3 text-gray-500 italic text-center">
                No result content available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ BASH TOOL ============
function BashToolDisplay({ tool }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const input = tool.input as {
    command?: string;
    description?: string;
    timeout?: number;
  };

  const command = input.command || '';
  const description = input.description;

  // Truncate command for preview
  const commandPreview = truncate(command.split('\n')[0] ?? '', 60);
  const isMultiLine = command.includes('\n');

  return (
    <div className="mt-2 text-xs rounded-stoody bg-gray-800 overflow-hidden tool-card-hover shadow-stoody-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-750 text-left transition-colors"
      >
        {/* Terminal icon */}
        <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-amber-400 font-medium">Bash</span>
        <code className="text-gray-300 font-mono truncate flex-1 bg-gray-900/50 px-1.5 py-0.5 rounded">
          {commandPreview}
        </code>
        {isMultiLine && (
          <span className="text-xs text-gray-500">
            {countLines(command)} lines
          </span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="tool-card-content" data-expanded={expanded}>
        <div className="tool-card-content-inner">
          <div className="border-t border-gray-750">
            {description && (
              <div className="px-2 py-1 bg-gray-900/50 text-gray-400 text-[10px] border-b border-gray-750">
                {description}
              </div>
            )}
            <pre className="p-2 text-xs text-amber-200/80 whitespace-pre-wrap overflow-auto max-h-60 bg-gray-900/30 font-mono">
              $ {command}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ WRITE TOOL ============
function WriteToolDisplay({ tool }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const input = tool.input as {
    file_path?: string;
    content?: string;
  };

  const filePath = input.file_path || 'unknown';
  const content = input.content || '';
  const fileName = getFileName(filePath);
  const lineCount = countLines(content);

  return (
    <div className="mt-2 text-xs rounded-stoody bg-gray-800 overflow-hidden tool-card-hover shadow-stoody-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-750 text-left transition-colors"
      >
        {/* Write icon */}
        <svg className="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-cyan-400 font-medium">Write</span>
        <span className="text-gray-300 font-mono truncate flex-1" title={filePath}>
          {fileName}
        </span>
        <span className="text-xs text-gray-500">
          {lineCount} lines
        </span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="tool-card-content" data-expanded={expanded}>
        <div className="tool-card-content-inner">
          <div className="border-t border-gray-750">
            <div className="px-2 py-1 bg-gray-900/50 text-gray-500 font-mono text-[10px] truncate">
              {filePath}
            </div>
            <pre className="p-2 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-60 bg-gray-900/30">
              {content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ GREP TOOL ============
function GrepToolDisplay({ tool }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const input = tool.input as {
    pattern?: string;
    path?: string;
    glob?: string;
    type?: string;
    output_mode?: string;
  };

  const pattern = input.pattern || '';
  const path = input.path;
  const glob = input.glob;

  return (
    <div className="mt-2 text-xs rounded-stoody bg-gray-800 overflow-hidden tool-card-hover shadow-stoody-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-750 text-left transition-colors"
      >
        {/* Search icon */}
        <svg className="w-3.5 h-3.5 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-orange-400 font-medium">Grep</span>
        <code className="text-gray-300 font-mono truncate flex-1 bg-gray-900/50 px-1.5 py-0.5 rounded">
          {truncate(pattern, 40)}
        </code>
        {path && (
          <span className="text-gray-500 truncate max-w-[120px]" title={path}>
            in {getFileName(path)}
          </span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="tool-card-content" data-expanded={expanded}>
        <div className="tool-card-content-inner">
          <div className="border-t border-gray-750 p-2 bg-gray-900/30 space-y-1">
            <div>
              <span className="text-gray-500">Pattern: </span>
              <code className="text-orange-300 font-mono">{pattern}</code>
            </div>
            {path && (
              <div>
                <span className="text-gray-500">Path: </span>
                <span className="text-gray-300 font-mono">{path}</span>
              </div>
            )}
            {glob && (
              <div>
                <span className="text-gray-500">Glob: </span>
                <span className="text-gray-300 font-mono">{glob}</span>
              </div>
            )}
            {input.type && (
              <div>
                <span className="text-gray-500">Type: </span>
                <span className="text-gray-300">{input.type}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ GLOB TOOL ============
function GlobToolDisplay({ tool }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const input = tool.input as {
    pattern?: string;
    path?: string;
  };

  const pattern = input.pattern || '';
  const path = input.path;

  return (
    <div className="mt-2 text-xs rounded-stoody bg-gray-800 overflow-hidden tool-card-hover shadow-stoody-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-750 text-left transition-colors"
      >
        {/* Folder icon */}
        <svg className="w-3.5 h-3.5 text-violet-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-violet-400 font-medium">Glob</span>
        <code className="text-gray-300 font-mono truncate flex-1 bg-gray-900/50 px-1.5 py-0.5 rounded">
          {pattern}
        </code>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="tool-card-content" data-expanded={expanded && !!path}>
        <div className="tool-card-content-inner">
          <div className="border-t border-gray-750 px-2 py-1.5 bg-gray-900/30">
            <span className="text-gray-500">In: </span>
            <span className="text-gray-300 font-mono">{path}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ TASK (AGENT) TOOL ============
function TaskToolDisplay({ tool, parentSessionId }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const [subsessionExpanded, setSubsessionExpanded] = useState(false);

  const input = tool.input as {
    prompt?: string;
    description?: string;
    subagent_type?: string;
    model?: string;
  };

  const hasSpawnedAgent = !!tool.spawned_agent_id;
  const agentType = input.subagent_type || 'general';
  const description = input.description || '';
  const prompt = input.prompt || '';

  return (
    <div className="mt-2 text-xs rounded-stoody bg-gray-800 overflow-hidden tool-card-hover shadow-stoody-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-750 text-left transition-colors"
      >
        {/* Agent icon */}
        <svg className="w-3.5 h-3.5 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="text-purple-400 font-medium">Task</span>
        <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded text-[10px]">
          {agentType}
        </span>
        <span className="text-gray-400 truncate flex-1">
          {description || truncate(prompt, 40)}
        </span>
        {input.model && (
          <span className="text-xs text-gray-500">{input.model}</span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="tool-card-content" data-expanded={expanded}>
        <div className="tool-card-content-inner">
          <div className="border-t border-gray-750">
            {description && (
              <div className="px-2 py-1 bg-gray-900/50 text-gray-400 text-[10px] border-b border-gray-750">
                {description}
              </div>
            )}
            <pre className="p-2 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-40 bg-gray-900/30">
              {prompt}
            </pre>
          </div>
        </div>
      </div>

      {/* Subsession expansion */}
      {hasSpawnedAgent && parentSessionId && (
        <div className="border-t border-gray-750">
          <button
            onClick={() => setSubsessionExpanded(!subsessionExpanded)}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-purple-900/20 text-left transition-colors text-purple-400"
          >
            <svg
              className={`w-3 h-3 transition-transform ${subsessionExpanded ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>{subsessionExpanded ? 'Hide' : 'View'} agent session</span>
            <span className="text-gray-500 font-mono text-[10px]">
              agent-{tool.spawned_agent_id}
            </span>
          </button>

          {subsessionExpanded && (
            <SubsessionView
              agentId={tool.spawned_agent_id!}
              parentSessionId={parentSessionId}
              depth={1}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============ GENERIC TOOL DISPLAY ============
function GenericToolDisplay({ tool, parentSessionId }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const [subsessionExpanded, setSubsessionExpanded] = useState(false);

  const hasSpawnedAgent = !!tool.spawned_agent_id;
  const inputPreview = JSON.stringify(tool.input).slice(0, 100);
  const hasMore = JSON.stringify(tool.input).length > 100;

  return (
    <div className="mt-2 text-xs rounded-stoody bg-gray-800 overflow-hidden tool-card-hover shadow-stoody-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-gray-750 text-left transition-colors"
      >
        <span className="text-purple-400 font-mono">{tool.name}</span>
        <span className="text-gray-500 truncate flex-1">
          {hasMore ? inputPreview + '...' : inputPreview}
        </span>
        {hasSpawnedAgent && (
          <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded text-[10px]">
            agent
          </span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="tool-card-content" data-expanded={expanded}>
        <div className="tool-card-content-inner">
          <div className="p-2 border-t border-gray-750">
            <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-60">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {hasSpawnedAgent && parentSessionId && (
        <div className="border-t border-gray-750">
          <button
            onClick={() => setSubsessionExpanded(!subsessionExpanded)}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-purple-900/20 text-left transition-colors text-purple-400"
          >
            <svg
              className={`w-3 h-3 transition-transform ${subsessionExpanded ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>{subsessionExpanded ? 'Hide' : 'View'} agent session</span>
            <span className="text-gray-500 font-mono text-[10px]">
              agent-{tool.spawned_agent_id}
            </span>
          </button>

          {subsessionExpanded && (
            <SubsessionView
              agentId={tool.spawned_agent_id!}
              parentSessionId={parentSessionId}
              depth={1}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============ MAIN TOOL DISPLAY ROUTER ============
interface ToolUseDisplayProps {
  tool: ToolUse;
  parentSessionId?: string;
}

function ToolUseDisplay({ tool, parentSessionId }: ToolUseDisplayProps) {
  // Route to specialized displays based on tool name
  switch (tool.name) {
    case 'Edit':
      return <EditToolDisplay tool={tool} parentSessionId={parentSessionId} />;
    case 'Read':
      return <ReadToolDisplay tool={tool} parentSessionId={parentSessionId} />;
    case 'Bash':
      return <BashToolDisplay tool={tool} parentSessionId={parentSessionId} />;
    case 'Write':
      return <WriteToolDisplay tool={tool} parentSessionId={parentSessionId} />;
    case 'Grep':
      return <GrepToolDisplay tool={tool} parentSessionId={parentSessionId} />;
    case 'Glob':
      return <GlobToolDisplay tool={tool} parentSessionId={parentSessionId} />;
    case 'Task':
      return <TaskToolDisplay tool={tool} parentSessionId={parentSessionId} />;
    default:
      return <GenericToolDisplay tool={tool} parentSessionId={parentSessionId} />;
  }
}

function ThinkingDisplay({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);

  // Truncate thinking display
  const preview = thinking.slice(0, 150);
  const hasMore = thinking.length > 150;

  return (
    <div className="mt-2 text-xs rounded-stoody bg-gray-800 overflow-hidden shadow-stoody-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-gray-800 text-left transition-colors"
      >
        <span className="text-amber-500">💭 Thinking</span>
        {!expanded && (
          <span className="text-gray-500 truncate flex-1 italic">
            {hasMore ? preview + '...' : preview}
          </span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="tool-card-content" data-expanded={expanded}>
        <div className="tool-card-content-inner">
          <div className="p-2 border-t border-gray-750 text-gray-400 italic whitespace-pre-wrap">
            {thinking}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: TranscriptMessage;
  parentSessionId?: string;  // For loading subsessions
  searchQuery?: string;
  matchIndices?: number[];
  currentMatchIndex?: number;
  onCopy?: (text: string) => void;
}

function MessageBubble({ message, parentSessionId, searchQuery = '', matchIndices = [], currentMatchIndex, onCopy }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isPending = message.uuid.startsWith('optimistic-');
  const hasMatch = matchIndices.length > 0;
  const hasCurrentMatch = currentMatchIndex !== undefined && matchIndices.includes(currentMatchIndex);
  const [showCopied, setShowCopied] = useState(false);

  const handleCopyMessage = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setShowCopied(true);
      onCopy?.(message.content);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} group/bubble`}
      data-has-match={hasMatch}
      data-message-uuid={message.uuid}
    >
      <div className={`max-w-[85%] min-w-0 ${isUser ? 'ml-8' : 'mr-8'}`}>
        {/* Role indicator */}
        <div className={`text-xs mb-1 flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className={isUser ? 'text-blurple-400' : 'text-green-400'}>
            {isUser ? 'You' : 'Claude'}
          </span>
          {isPending ? (
            <span className="text-yellow-500 animate-pulse">Sending...</span>
          ) : message.timestamp && (
            <span className="text-gray-500">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          )}
          {/* Token usage badge for assistant messages */}
          {!isUser && message.usage && (
            <span
              className="text-gray-600"
              title={`In: ${message.usage.input_tokens ?? 0} / Out: ${message.usage.output_tokens ?? 0}${
                message.usage.cache_read_tokens ? ` / Cached: ${message.usage.cache_read_tokens}` : ''
              }`}
            >
              {formatTokens((message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0))} tok
            </span>
          )}
          {/* Match indicator */}
          {hasMatch && (
            <span className="text-yellow-500 text-xs">
              {matchIndices.length} match{matchIndices.length !== 1 ? 'es' : ''}
            </span>
          )}
          {/* Copy button */}
          {message.content && (
            <button
              onClick={handleCopyMessage}
              className={`copy-button opacity-0 group-hover/bubble:opacity-70 hover:!opacity-100 p-1 rounded-stoody-sm transition-all ${
                showCopied ? 'copy-button-success !opacity-100' : 'text-gray-400 hover:text-pink-400'
              }`}
              title={showCopied ? 'Copied!' : 'Copy message'}
            >
              {showCopied ? (
                <svg className="w-3.5 h-3.5 copy-success-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Message content */}
        <div
          className={`rounded-stoody-lg px-4 py-3 message-bubble-enter shadow-stoody-sm ${
            isUser
              ? 'bg-blurple-500/10 message-user'
              : 'bg-gray-800 message-assistant'
          } ${hasCurrentMatch ? 'ring-2 ring-yellow-400' : ''} ${isPending ? 'opacity-70' : ''}`}
        >
          {/* Thinking (if present) */}
          {message.thinking && <ThinkingDisplay thinking={message.thinking} />}

          {/* Main content with search highlighting */}
          {message.content && (
            <div className="text-sm text-gray-200">
              {searchQuery ? (
                <SearchHighlightedMarkdown
                  content={message.content}
                  searchQuery={searchQuery}
                  matchIndices={matchIndices}
                  currentMatchIndex={currentMatchIndex}
                />
              ) : (
                <Markdown>{message.content}</Markdown>
              )}
            </div>
          )}

          {/* Tool uses */}
          {message.tool_uses.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.tool_uses.map((tool) => (
                <ToolUseDisplay key={tool.id} tool={tool} parentSessionId={parentSessionId} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Component to render markdown with search highlights
function SearchHighlightedMarkdown({
  content,
  searchQuery,
  matchIndices,
  currentMatchIndex
}: {
  content: string;
  searchQuery: string;
  matchIndices: number[];
  currentMatchIndex?: number;
}) {
  // For simplicity, we'll render the highlighted text directly
  // This sacrifices some markdown rendering for accurate highlighting
  const lines = content.split('\n');

  // Calculate which match index within the message content corresponds to the global current match
  // matchIndices contains the global indices for all matches in this message
  // We need to find which local index (0-based within this message) is current
  const localCurrentMatchIndex = useMemo(() => {
    if (currentMatchIndex === undefined) return undefined;
    const localIndex = matchIndices.indexOf(currentMatchIndex);
    return localIndex >= 0 ? localIndex : undefined;
  }, [matchIndices, currentMatchIndex]);

  // Pre-calculate cumulative match counts per line so we know which local match index
  // corresponds to each line
  const lineMatchInfo = useMemo(() => {
    if (!searchQuery.trim()) return [];

    let cumulativeCount = 0;
    return lines.map(line => {
      const startIndex = cumulativeCount;
      const matchesInLine = countMatches(line, searchQuery);
      cumulativeCount += matchesInLine;
      return { startIndex, count: matchesInLine };
    });
  }, [lines, searchQuery]);

  return (
    <div className="prose prose-invert prose-sm max-w-none overflow-x-auto break-words">
      {lines.map((line, lineIndex) => {
        // Calculate which match index within this line is the current one (if any)
        let currentMatchInLine: number | undefined;
        if (localCurrentMatchIndex !== undefined && lineMatchInfo[lineIndex]) {
          const { startIndex, count } = lineMatchInfo[lineIndex];
          // Check if the current match falls within this line
          if (localCurrentMatchIndex >= startIndex && localCurrentMatchIndex < startIndex + count) {
            currentMatchInLine = localCurrentMatchIndex - startIndex;
          }
        }

        return (
          <div key={lineIndex} className="whitespace-pre-wrap break-words">
            <HighlightedText
              text={line}
              searchQuery={searchQuery}
              currentMatchIndexInText={currentMatchInLine}
            />
            {lineIndex < lines.length - 1 && '\n'}
          </div>
        );
      })}
    </div>
  );
}

// Helper to count matches in text
function countMatches(text: string, query: string): number {
  if (!query.trim()) return 0;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let count = 0;
  let index = 0;
  while ((index = lowerText.indexOf(lowerQuery, index)) !== -1) {
    count++;
    index += lowerQuery.length;
  }
  return count;
}

// Build a map of message index -> array of global match indices
function buildMatchMap(messages: TranscriptMessage[], query: string): Map<number, number[]> {
  const map = new Map<number, number[]>();
  if (!query.trim()) return map;

  let globalIndex = 0;
  messages.forEach((message, msgIndex) => {
    const matchCount = countMatches(message.content || '', query);
    if (matchCount > 0) {
      const indices: number[] = [];
      for (let i = 0; i < matchCount; i++) {
        indices.push(globalIndex + i);
      }
      map.set(msgIndex, indices);
      globalIndex += matchCount;
    }
  });

  return map;
}

export function ConversationView({
  transcript,
  sessionId,
  searchQuery = '',
  currentMatchIndex,
  onMatchesFound,
  isActiveSession = false,
  onSendMessage,
}: ConversationViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Track if user is at the bottom of the scroll container
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(transcript.messages.length);

  // Check if scrolled to bottom (with small threshold for rounding)
  const checkIfAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const threshold = 50; // pixels from bottom to consider "at bottom"
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Handle scroll events to track position
  const handleScroll = useCallback(() => {
    isAtBottomRef.current = checkIfAtBottom();
  }, [checkIfAtBottom]);

  // Auto-scroll to bottom when new messages arrive (only for active sessions)
  useEffect(() => {
    if (!isActiveSession) return;

    const messageCount = transcript.messages.length;
    const hadNewMessages = messageCount > prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;

    // Only scroll if we had new messages and user was at bottom
    if (hadNewMessages && isAtBottomRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [transcript.messages.length, isActiveSession]);

  // Initial scroll to bottom for active sessions
  useEffect(() => {
    if (isActiveSession && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      isAtBottomRef.current = true;
    }
  }, [isActiveSession]);

  const handleSend = () => {
    if (!inputMessage.trim() || !onSendMessage || sending) return;
    setSending(true);
    onSendMessage(inputMessage);
    setInputMessage('');
    // Scroll to bottom when sending a message
    isAtBottomRef.current = true;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
    // Reset sending state after a delay to show feedback
    setTimeout(() => setSending(false), 500);
  };

  // Calculate match map and total matches
  const matchMap = useMemo(
    () => buildMatchMap(transcript.messages, searchQuery),
    [transcript.messages, searchQuery]
  );

  const totalMatches = useMemo(() => {
    let total = 0;
    matchMap.forEach(indices => {
      total += indices.length;
    });
    return total;
  }, [matchMap]);

  // Report matches to parent
  useEffect(() => {
    onMatchesFound?.(totalMatches);
  }, [totalMatches, onMatchesFound]);

  // Scroll to current match
  useEffect(() => {
    if (currentMatchIndex === undefined || !containerRef.current) return;

    // Find which message contains the current match
    let targetMessageIndex: number | undefined;
    for (const [msgIndex, indices] of matchMap.entries()) {
      if (indices.includes(currentMatchIndex)) {
        targetMessageIndex = msgIndex;
        break;
      }
    }

    if (targetMessageIndex !== undefined) {
      const messageElements = containerRef.current.querySelectorAll('[data-message-uuid]');
      const targetElement = messageElements[targetMessageIndex];
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchIndex, matchMap]);

  if (transcript.messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center p-6 rounded-stoody-lg bg-gray-800 max-w-xs empty-state-enter shadow-stoody">
          <div className="w-14 h-14 rounded-full bg-gray-750 flex items-center justify-center mx-auto mb-4 empty-state-icon-float">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-gray-300 font-medium mb-1">No messages in transcript</p>
          <p className="text-gray-400 text-sm">This conversation appears to be empty</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-w-0 h-full" ref={containerRef}>
      <SessionStats transcript={transcript} />
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto space-y-5 p-4 min-w-0"
      >
        {transcript.messages.map((message, index) => {
          // Calculate time gap from previous message
          const prevMessage = index > 0 ? transcript.messages[index - 1] : null;
          const gapMs = prevMessage?.timestamp && message.timestamp
            ? new Date(message.timestamp).getTime() - new Date(prevMessage.timestamp).getTime()
            : 0;

          return (
            <div key={message.uuid || index}>
              {gapMs > 0 && <TimeGapIndicator gapMs={gapMs} />}
              <MessageBubble
                message={message}
                parentSessionId={sessionId}
                searchQuery={searchQuery}
                matchIndices={matchMap.get(index) || []}
                currentMatchIndex={currentMatchIndex}
              />
            </div>
          );
        })}
      </div>
      {/* Inline editor for active sessions */}
      {isActiveSession && onSendMessage && (
        <div className="shrink-0 bg-gray-800/80 backdrop-blur-sm p-4 shadow-stoody-sm">
          <Editor
            value={inputMessage}
            onChange={setInputMessage}
            placeholder="Send a message to Claude..."
            minHeight="60px"
            maxHeight="200px"
            onSubmit={handleSend}
            disabled={sending}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleSend}
              disabled={sending || !inputMessage.trim()}
              className="px-4 py-2 bg-blurple-500 hover:bg-blurple-600 hover:text-pink-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-stoody transition-all flex items-center gap-2 shadow-stoody-sm"
            >
              {sending ? (
                <span>Sending...</span>
              ) : (
                <>
                  <span>Send</span>
                  <kbd className="text-xs bg-blurple-700/50 px-1.5 py-0.5 rounded-stoody-sm">⌘↵</kbd>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Fallback for raw transcripts
export function RawTranscriptView({ transcript }: { transcript: string }) {
  return (
    <pre className="text-xs text-gray-300 bg-gray-800 rounded-stoody p-4 overflow-auto max-h-96 whitespace-pre-wrap font-mono shadow-stoody-sm">
      {cleanTerminalOutput(transcript)}
    </pre>
  );
}
