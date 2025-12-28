import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import type { TranscriptMessage, ToolUse, ParsedTranscript } from '../types';
import { Markdown } from './Markdown';
import { Editor } from './Editor';
import { SubsessionView } from './SubsessionView';
import { calculateCost, formatCost } from '../utils/costs';

// Highlight matching text in a string
// Memoized to avoid recomputation on every render
const HighlightedText = memo(function HighlightedText({
  text,
  searchQuery,
  isCurrentMatch
}: {
  text: string;
  searchQuery: string;
  isCurrentMatch?: boolean;
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

      // Add highlighted match
      result.push(
        <mark
          key={`match-${matchIndex}`}
          className={`rounded px-0.5 ${
            isCurrentMatch
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
  }, [text, searchQuery, isCurrentMatch]);

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

// Get human-readable model name
function getModelName(model?: string): string {
  if (!model) return 'Unknown';
  if (model.includes('opus')) return 'Opus 4.5';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model.split('-').slice(-1)[0] || model;
}

// Get model-specific badge styling for visual differentiation
function getModelBadgeStyle(model?: string): string {
  if (!model) return 'bg-gray-700/50 text-gray-400';
  if (model.includes('opus')) return 'bg-amber-900/50 text-amber-300 border border-amber-700/30';
  if (model.includes('haiku')) return 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/30';
  // Default to Sonnet styling (purple)
  return 'bg-purple-900/50 text-purple-300 border border-purple-700/30';
}

// Calculate session duration from timestamps
function getDuration(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) return '-';
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const diffMs = end - start;

  if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m`;
  return `${(diffMs / 3600000).toFixed(1)}h`;
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

  return (
    <div className="bg-gray-850 border-b border-gray-700 px-3 py-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 text-xs">
          {/* Model badge - color-coded by model type */}
          <span className={`px-2 py-0.5 rounded-full ${getModelBadgeStyle(transcript.model)}`}>
            {getModelName(transcript.model)}
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
            <span>{getDuration(transcript.start_time, transcript.end_time)}</span>
          </div>

          {/* Message count */}
          <span className="text-gray-500">
            {transcript.messages.length} messages
          </span>

          {/* Estimated cost */}
          {estimatedCost !== null && (
            <div
              className="flex items-center gap-1 text-amber-400"
              title={`Estimated cost based on ${getModelName(transcript.model)} pricing (Dec 2024)\nInput: ${formatTokens(totalInput)} tokens\nOutput: ${formatTokens(totalOutput)} tokens\nCache read: ${formatTokens(totalCacheRead)} tokens`}
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

// Types for intelligent diffing
type DiffSegment = { type: 'equal' | 'insert' | 'delete'; text: string };
type DiffLine =
  | { type: 'unchanged'; line: string }
  | { type: 'removed'; line: string; segments?: DiffSegment[] }
  | { type: 'added'; line: string; segments?: DiffSegment[] }
  | { type: 'modified'; oldLine: string; newLine: string; oldSegments: DiffSegment[]; newSegments: DiffSegment[] };

// Compute character-level LCS for inline diffing
function computeCharLCS(a: string, b: string): string {
  const m = a.length;
  const n = b.length;

  // For very long strings, fall back to simpler comparison
  if (m * n > 100000) return '';

  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
      }
    }
  }

  // Backtrack
  let lcs = '';
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs = a[i - 1] + lcs;
      i--; j--;
    } else if ((dp[i - 1]?.[j] ?? 0) > (dp[i]?.[j - 1] ?? 0)) {
      i--;
    } else {
      j--;
    }
  }
  return lcs;
}

// Compute word-level diff with inline highlights
function computeInlineDiff(oldStr: string, newStr: string): { oldSegments: DiffSegment[]; newSegments: DiffSegment[] } {
  // Tokenize into words and whitespace
  const tokenize = (s: string) => s.match(/\S+|\s+/g) || [];
  const oldTokens = tokenize(oldStr);
  const newTokens = tokenize(newStr);

  // LCS on tokens
  const m = oldTokens.length;
  const n = newTokens.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
      }
    }
  }

  // Backtrack to build segments
  let i = m, j = n;
  const oldStack: DiffSegment[] = [];
  const newStack: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      oldStack.push({ type: 'equal', text: oldTokens[i - 1]! });
      newStack.push({ type: 'equal', text: newTokens[j - 1]! });
      i--; j--;
    } else if (j > 0 && (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))) {
      newStack.push({ type: 'insert', text: newTokens[j - 1]! });
      j--;
    } else if (i > 0) {
      oldStack.push({ type: 'delete', text: oldTokens[i - 1]! });
      i--;
    }
  }

  // Reverse and merge adjacent same-type segments
  const merge = (stack: DiffSegment[]): DiffSegment[] => {
    const result: DiffSegment[] = [];
    for (let k = stack.length - 1; k >= 0; k--) {
      const seg = stack[k]!;
      if (result.length > 0 && result[result.length - 1]!.type === seg.type) {
        result[result.length - 1]!.text += seg.text;
      } else {
        result.push({ ...seg });
      }
    }
    return result;
  };

  return { oldSegments: merge(oldStack), newSegments: merge(newStack) };
}

// Calculate similarity ratio between two strings (0-1)
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const lcs = computeCharLCS(a, b);
  return (2 * lcs.length) / (a.length + b.length);
}

// Intelligent line-based diff with inline highlighting for modified lines
function computeLineDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  // Use Myers-like diff algorithm via LCS
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
      }
    }
  }

  // Backtrack to get edit script
  type Edit = { type: 'keep' | 'delete' | 'insert'; oldIdx?: number; newIdx?: number };
  const edits: Edit[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.push({ type: 'keep', oldIdx: i - 1, newIdx: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))) {
      edits.push({ type: 'insert', newIdx: j - 1 });
      j--;
    } else {
      edits.push({ type: 'delete', oldIdx: i - 1 });
      i--;
    }
  }

  edits.reverse();

  // Now process edits, looking for delete+insert pairs that should be "modified"
  const result: DiffLine[] = [];
  let idx = 0;

  while (idx < edits.length) {
    const edit = edits[idx]!;

    if (edit.type === 'keep') {
      result.push({ type: 'unchanged', line: oldLines[edit.oldIdx!]! });
      idx++;
    } else if (edit.type === 'delete') {
      // Look ahead for inserts that might pair with this delete
      const deletes: number[] = [];
      while (idx < edits.length && edits[idx]!.type === 'delete') {
        deletes.push(edits[idx]!.oldIdx!);
        idx++;
      }

      const inserts: number[] = [];
      while (idx < edits.length && edits[idx]!.type === 'insert') {
        inserts.push(edits[idx]!.newIdx!);
        idx++;
      }

      // Try to pair similar deletes and inserts as modifications
      const pairedDeletes = new Set<number>();
      const pairedInserts = new Set<number>();

      for (const delIdx of deletes) {
        let bestMatch = -1;
        let bestSim = 0.4; // Minimum similarity threshold

        for (const insIdx of inserts) {
          if (pairedInserts.has(insIdx)) continue;
          const sim = similarity(oldLines[delIdx]!, newLines[insIdx]!);
          if (sim > bestSim) {
            bestSim = sim;
            bestMatch = insIdx;
          }
        }

        if (bestMatch >= 0) {
          pairedDeletes.add(delIdx);
          pairedInserts.add(bestMatch);

          const { oldSegments, newSegments } = computeInlineDiff(
            oldLines[delIdx]!,
            newLines[bestMatch]!
          );

          result.push({
            type: 'modified',
            oldLine: oldLines[delIdx]!,
            newLine: newLines[bestMatch]!,
            oldSegments,
            newSegments
          });
        }
      }

      // Add unpaired deletes
      for (const delIdx of deletes) {
        if (!pairedDeletes.has(delIdx)) {
          result.push({ type: 'removed', line: oldLines[delIdx]! });
        }
      }

      // Add unpaired inserts
      for (const insIdx of inserts) {
        if (!pairedInserts.has(insIdx)) {
          result.push({ type: 'added', line: newLines[insIdx]! });
        }
      }
    } else {
      // Standalone insert
      result.push({ type: 'added', line: newLines[edit.newIdx!]! });
      idx++;
    }
  }

  return result;
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
    <div className="mt-2 text-xs border border-emerald-800/50 rounded-lg bg-gray-800/80 overflow-hidden tool-card-hover">
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

      {expanded && (
        <div className="border-t border-gray-700">
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
                const line = diff.type === 'unchanged' ? diff.line : diff.line;
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
                    {line || ' '}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ READ TOOL ============
function ReadToolDisplay({ tool }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const input = tool.input as {
    file_path?: string;
    offset?: number;
    limit?: number;
  };

  const filePath = input.file_path || 'unknown';
  const fileName = getFileName(filePath);
  const hasRange = input.offset !== undefined || input.limit !== undefined;

  return (
    <div className="mt-2 text-xs border border-blue-800/50 rounded-lg bg-gray-800/80 overflow-hidden tool-card-hover">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-750 text-left transition-colors"
      >
        {/* Read icon */}
        <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-blue-400 font-medium">Read</span>
        <span className="text-gray-300 font-mono truncate flex-1" title={filePath}>
          {fileName}
        </span>
        {hasRange && (
          <span className="text-xs text-gray-500">
            {input.offset !== undefined && `from L${input.offset}`}
            {input.limit !== undefined && ` (${input.limit} lines)`}
          </span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-2 py-1.5 bg-gray-900/50">
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
      )}
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
    <div className="mt-2 text-xs border border-amber-800/50 rounded-lg bg-gray-800/80 overflow-hidden tool-card-hover">
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

      {expanded && (
        <div className="border-t border-gray-700">
          {description && (
            <div className="px-2 py-1 bg-gray-900/50 text-gray-400 text-[10px] border-b border-gray-700">
              {description}
            </div>
          )}
          <pre className="p-2 text-xs text-amber-200/80 whitespace-pre-wrap overflow-auto max-h-60 bg-gray-900/30 font-mono">
            $ {command}
          </pre>
        </div>
      )}
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
    <div className="mt-2 text-xs border border-cyan-800/50 rounded-lg bg-gray-800/80 overflow-hidden tool-card-hover">
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

      {expanded && (
        <div className="border-t border-gray-700">
          <div className="px-2 py-1 bg-gray-900/50 text-gray-500 font-mono text-[10px] truncate">
            {filePath}
          </div>
          <pre className="p-2 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-60 bg-gray-900/30">
            {content}
          </pre>
        </div>
      )}
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
    <div className="mt-2 text-xs border border-orange-800/50 rounded-lg bg-gray-800/80 overflow-hidden tool-card-hover">
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

      {expanded && (
        <div className="border-t border-gray-700 p-2 bg-gray-900/30 space-y-1">
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
      )}
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
    <div className="mt-2 text-xs border border-violet-800/50 rounded-lg bg-gray-800/80 overflow-hidden tool-card-hover">
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

      {expanded && path && (
        <div className="border-t border-gray-700 px-2 py-1.5 bg-gray-900/30">
          <span className="text-gray-500">In: </span>
          <span className="text-gray-300 font-mono">{path}</span>
        </div>
      )}
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
    <div className="mt-2 text-xs border border-purple-800/50 rounded-lg bg-gray-800/80 overflow-hidden tool-card-hover">
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

      {expanded && (
        <div className="border-t border-gray-700">
          {description && (
            <div className="px-2 py-1 bg-gray-900/50 text-gray-400 text-[10px] border-b border-gray-700">
              {description}
            </div>
          )}
          <pre className="p-2 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-40 bg-gray-900/30">
            {prompt}
          </pre>
        </div>
      )}

      {/* Subsession expansion */}
      {hasSpawnedAgent && parentSessionId && (
        <div className="border-t border-gray-700">
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
    <div className="mt-2 text-xs border border-gray-600 rounded-lg bg-gray-800/80 tool-card-hover">
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
      {expanded && (
        <div className="p-2 border-t border-gray-600">
          <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-60">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
        </div>
      )}

      {hasSpawnedAgent && parentSessionId && (
        <div className="border-t border-gray-600">
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
    <div className="mt-2 text-xs border border-gray-600 rounded bg-gray-900">
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
      {expanded && (
        <div className="p-2 border-t border-gray-600 text-gray-400 italic whitespace-pre-wrap">
          {thinking}
        </div>
      )}
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
          <span className={isUser ? 'text-blue-400' : 'text-green-400'}>
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
              className="opacity-0 group-hover/bubble:opacity-70 hover:!opacity-100 p-0.5 rounded transition-opacity text-gray-400 hover:text-white"
              title={showCopied ? 'Copied!' : 'Copy message'}
            >
              {showCopied ? (
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          className={`rounded-lg px-3 py-2 message-bubble-enter ${
            isUser
              ? 'bg-blue-900/40 border border-blue-800/60 message-user'
              : 'bg-gray-800/80 border border-gray-700/60 message-assistant'
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

  return (
    <div className="prose prose-invert prose-sm max-w-none overflow-x-auto break-words">
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} className="whitespace-pre-wrap break-words">
          <HighlightedText
            text={line}
            searchQuery={searchQuery}
            isCurrentMatch={
              currentMatchIndex !== undefined &&
              matchIndices.includes(currentMatchIndex)
            }
          />
          {lineIndex < lines.length - 1 && '\n'}
        </div>
      ))}
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
        <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs empty-state-enter">
          <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4 empty-state-icon-float">
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
        className="flex-1 overflow-auto space-y-4 p-3 min-w-0"
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
        <div className="shrink-0 border-t border-gray-700 bg-gray-900 p-3">
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
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors flex items-center gap-2"
            >
              {sending ? (
                <span>Sending...</span>
              ) : (
                <>
                  <span>Send</span>
                  <kbd className="text-xs bg-blue-700/50 px-1 py-0.5 rounded">⌘↵</kbd>
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
  // Strip ANSI escape codes and clean up terminal animation artifacts
  const cleanTranscript = (text: string): string => {
    let cleaned = text
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // CSI sequences
      .replace(/\x1b\][^\x07]*\x07/g, '')     // OSC sequences (bell terminated)
      .replace(/\x1b\][^\x1b]*\x1b\\/g, '')   // OSC sequences (ST terminated)
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '') // DCS, SOS, PM, APC sequences
      .replace(/\x1b[@-Z\\-_]/g, '')          // Fe sequences
      .replace(/\x1b\[[\?]?[0-9;]*[hl]/g, '') // Mode sequences
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); // Other control chars

    cleaned = cleaned.replace(/\r/g, '');

    const lines = cleaned.split('\n');
    const deduped: string[] = [];
    let prevLine = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' && prevLine === '') continue;
      if (trimmed === prevLine) continue;
      deduped.push(line);
      prevLine = trimmed;
    }

    return deduped.join('\n').replace(/\n{3,}/g, '\n\n');
  };

  return (
    <pre className="text-xs text-gray-300 bg-gray-900 rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap font-mono">
      {cleanTranscript(transcript)}
    </pre>
  );
}
