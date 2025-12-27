import { useState, useMemo, useRef, useEffect } from 'react';
import type { TranscriptMessage, ToolUse, ParsedTranscript } from '../types';
import { Markdown } from './Markdown';

// Highlight matching text in a string
function HighlightedText({
  text,
  searchQuery,
  isCurrentMatch
}: {
  text: string;
  searchQuery: string;
  isCurrentMatch?: boolean;
}) {
  if (!searchQuery.trim()) {
    return <>{text}</>;
  }

  const parts: React.ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = searchQuery.toLowerCase();
  let lastIndex = 0;
  let matchIndex = 0;

  while (true) {
    const index = lowerText.indexOf(lowerQuery, lastIndex);
    if (index === -1) break;

    // Add text before match
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    // Add highlighted match
    parts.push(
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
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

interface ConversationViewProps {
  transcript: ParsedTranscript;
  searchQuery?: string;
  currentMatchIndex?: number;
  onMatchesFound?: (count: number) => void;
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

function SessionStats({ transcript }: { transcript: ParsedTranscript }) {
  const totalInput = transcript.total_input_tokens ?? 0;
  const totalOutput = transcript.total_output_tokens ?? 0;
  const totalCacheRead = transcript.total_cache_read_tokens ?? 0;
  const totalTokens = totalInput + totalOutput;

  return (
    <div className="bg-gray-850 border-b border-gray-700 px-3 py-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 text-xs">
          {/* Model badge */}
          <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded-full">
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

function ToolUseDisplay({ tool }: { tool: ToolUse }) {
  const [expanded, setExpanded] = useState(false);

  // Truncate input display for brevity
  const inputPreview = JSON.stringify(tool.input).slice(0, 100);
  const hasMore = JSON.stringify(tool.input).length > 100;

  return (
    <div className="mt-2 text-xs border border-gray-600 rounded bg-gray-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-gray-750 text-left"
      >
        <span className="text-purple-400 font-mono">{tool.name}</span>
        <span className="text-gray-500 truncate flex-1">
          {hasMore ? inputPreview + '...' : inputPreview}
        </span>
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
        <div className="p-2 border-t border-gray-600">
          <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-60">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
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
        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-gray-800 text-left"
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
  searchQuery?: string;
  matchIndices?: number[];
  currentMatchIndex?: number;
}

function MessageBubble({ message, searchQuery = '', matchIndices = [], currentMatchIndex }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasMatch = matchIndices.length > 0;
  const hasCurrentMatch = currentMatchIndex !== undefined && matchIndices.includes(currentMatchIndex);

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      data-has-match={hasMatch}
      data-message-uuid={message.uuid}
    >
      <div className={`max-w-[85%] ${isUser ? 'ml-8' : 'mr-8'}`}>
        {/* Role indicator */}
        <div className={`text-xs mb-1 flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className={isUser ? 'text-blue-400' : 'text-green-400'}>
            {isUser ? 'You' : 'Claude'}
          </span>
          {message.timestamp && (
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
        </div>

        {/* Message content */}
        <div
          className={`rounded-lg px-3 py-2 ${
            isUser
              ? 'bg-blue-900/50 border border-blue-800'
              : 'bg-gray-800 border border-gray-700'
          } ${hasCurrentMatch ? 'ring-2 ring-yellow-400' : ''}`}
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
                <ToolUseDisplay key={tool.id} tool={tool} />
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
    <div className="prose prose-invert prose-sm max-w-none">
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} className="whitespace-pre-wrap">
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
  searchQuery = '',
  currentMatchIndex,
  onMatchesFound
}: ConversationViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
        <div className="text-center p-6 rounded-xl bg-gray-800/40 border border-gray-700/50 max-w-xs">
          <div className="w-14 h-14 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-gray-300 font-medium mb-1">No messages in transcript</p>
          <p className="text-gray-500 text-sm">This conversation appears to be empty</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" ref={containerRef}>
      <SessionStats transcript={transcript} />
      <div className="space-y-4 p-3">
        {transcript.messages.map((message, index) => (
          <MessageBubble
            key={message.uuid || index}
            message={message}
            searchQuery={searchQuery}
            matchIndices={matchMap.get(index) || []}
            currentMatchIndex={currentMatchIndex}
          />
        ))}
      </div>
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
