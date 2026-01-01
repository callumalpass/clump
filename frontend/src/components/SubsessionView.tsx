import { useState, useEffect } from 'react';
import type { SubsessionDetail, TranscriptMessage, ToolUse, CLIType } from '../types';
import { fetchSubsession } from '../hooks/useApi';
import { Markdown } from './Markdown';
import { CLI_DISPLAY } from './CLISelector';

// Max nesting depth for subsessions
const MAX_DEPTH = 3;

// Format token count for display
function formatTokens(count: number | undefined): string {
  if (count === undefined || count === null) return '0';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

interface SubsessionViewProps {
  agentId: string;
  parentSessionId: string;
  depth?: number;
  cliType?: CLIType;
}

export function SubsessionView({ agentId, parentSessionId, depth = 1, cliType = 'claude' }: SubsessionViewProps) {
  const [detail, setDetail] = useState<SubsessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load subsession on mount
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchSubsession(parentSessionId, agentId)
      .then(setDetail)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [parentSessionId, agentId]);

  if (loading) {
    return (
      <div className="p-3 text-center">
        <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent" />
        <span className="ml-2 text-xs text-gray-400">Loading agent session...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-xs text-red-400 bg-red-900/20 rounded">
        Failed to load subsession: {error}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-3 text-xs text-gray-400">
        No subsession data available
      </div>
    );
  }

  const totalTokens = detail.total_input_tokens + detail.total_output_tokens;

  return (
    <div className="border-l-2 border-purple-500/50 ml-2 pl-3 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded font-mono">
          agent-{agentId}
        </span>
        <span className="text-gray-500">
          {detail.messages.length} messages
        </span>
        {totalTokens > 0 && (
          <span className="text-gray-600">
            {formatTokens(totalTokens)} tokens
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-3">
        {detail.messages.map((message, index) => (
          <SubsessionMessage
            key={message.uuid || index}
            message={message}
            parentSessionId={parentSessionId}
            depth={depth}
            cliType={cliType}
          />
        ))}
      </div>
    </div>
  );
}

interface SubsessionMessageProps {
  message: TranscriptMessage;
  parentSessionId: string;
  depth: number;
  cliType?: CLIType;
}

function SubsessionMessage({ message, parentSessionId, depth, cliType = 'claude' }: SubsessionMessageProps) {
  const isUser = message.role === 'user';
  const agentName = CLI_DISPLAY[cliType]?.name || 'Claude';
  const agentColor = CLI_DISPLAY[cliType]?.color || 'text-green-400';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[90%] ${isUser ? 'ml-4' : 'mr-4'}`}>
        {/* Role indicator */}
        <div className={`text-xs mb-1 flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className={isUser ? 'text-blue-400' : agentColor}>
            {isUser ? 'You' : agentName}
          </span>
          {message.timestamp && (
            <span className="text-gray-500">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Message content */}
        <div
          className={`rounded-lg px-2 py-1.5 text-sm ${
            isUser
              ? 'bg-blue-900/30 border border-blue-800/50'
              : 'bg-gray-800/50 border border-gray-700/50'
          }`}
        >
          {/* Thinking - collapsed by default */}
          {message.thinking && (
            <SubsessionThinking thinking={message.thinking} />
          )}

          {/* Main content */}
          {message.content && (
            <div className="text-gray-200">
              <Markdown>{message.content}</Markdown>
            </div>
          )}

          {/* Tool uses */}
          {message.tool_uses.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {message.tool_uses.map((tool) => (
                <SubsessionToolUse
                  key={tool.id}
                  tool={tool}
                  parentSessionId={parentSessionId}
                  depth={depth}
                  cliType={cliType}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubsessionThinking({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = thinking.slice(0, 100);
  const hasMore = thinking.length > 100;

  return (
    <div className="mb-1.5 text-xs border border-gray-600/50 rounded bg-gray-900/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1 px-1.5 py-0.5 hover:bg-gray-800/50 text-left transition-colors"
      >
        <span className="text-amber-500 text-[10px]">💭</span>
        {!expanded && (
          <span className="text-gray-500 truncate flex-1 italic text-[10px]">
            {hasMore ? preview + '...' : preview}
          </span>
        )}
        <svg
          className={`w-2.5 h-2.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-1.5 py-1 border-t border-gray-600/50 text-gray-400 italic text-[10px] whitespace-pre-wrap max-h-40 overflow-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}

interface SubsessionToolUseProps {
  tool: ToolUse;
  parentSessionId: string;
  depth: number;
  cliType?: CLIType;
}

function SubsessionToolUse({ tool, parentSessionId, depth, cliType = 'claude' }: SubsessionToolUseProps) {
  const [expanded, setExpanded] = useState(false);
  const [subsessionExpanded, setSubsessionExpanded] = useState(false);

  const hasSpawnedAgent = !!tool.spawned_agent_id;
  const canExpandSubsession = hasSpawnedAgent && depth < MAX_DEPTH;

  // Truncate input display
  const inputPreview = JSON.stringify(tool.input).slice(0, 80);
  const hasMore = JSON.stringify(tool.input).length > 80;

  return (
    <div className="text-[10px] border border-gray-600/50 rounded bg-gray-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-1.5 py-0.5 hover:bg-gray-750/50 text-left transition-colors"
      >
        <span className="text-purple-400 font-mono">{tool.name}</span>
        <span className="text-gray-500 truncate flex-1">
          {hasMore ? inputPreview + '...' : inputPreview}
        </span>
        {hasSpawnedAgent && (
          <span className="px-1 py-0.5 bg-purple-900/50 text-purple-300 rounded text-[9px]">
            agent
          </span>
        )}
        <svg
          className={`w-2.5 h-2.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-1.5 py-1 border-t border-gray-600/50">
          <pre className="text-[10px] text-gray-300 whitespace-pre-wrap overflow-auto max-h-32">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
        </div>
      )}

      {/* Nested subsession expansion */}
      {canExpandSubsession && (
        <div className="border-t border-gray-600/50">
          <button
            onClick={() => setSubsessionExpanded(!subsessionExpanded)}
            className="w-full flex items-center gap-1.5 px-1.5 py-1 hover:bg-purple-900/20 text-left transition-colors text-purple-400"
          >
            <svg
              className={`w-3 h-3 transition-transform ${subsessionExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-[10px]">
              {subsessionExpanded ? 'Hide' : 'View'} agent session
            </span>
            <span className="text-gray-500 font-mono text-[9px]">
              agent-{tool.spawned_agent_id}
            </span>
          </button>

          {subsessionExpanded && (
            <SubsessionView
              agentId={tool.spawned_agent_id!}
              parentSessionId={parentSessionId}
              depth={depth + 1}
              cliType={cliType}
            />
          )}
        </div>
      )}

      {/* Show message if max depth reached */}
      {hasSpawnedAgent && !canExpandSubsession && (
        <div className="px-1.5 py-1 border-t border-gray-600/50 text-[9px] text-gray-500 italic">
          agent-{tool.spawned_agent_id} (max nesting depth reached)
        </div>
      )}
    </div>
  );
}
