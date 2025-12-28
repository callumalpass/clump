import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationView, RawTranscriptView } from './ConversationView';
import type { ParsedTranscript, TranscriptMessage, ToolUse } from '../types';

// Mock scrollTo for jsdom
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock the dependent components
vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('./Editor', () => ({
  Editor: ({
    value,
    onChange,
    placeholder,
    onSubmit,
    disabled,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    onSubmit?: () => void;
    disabled?: boolean;
  }) => (
    <textarea
      data-testid="editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.metaKey && onSubmit) {
          onSubmit();
        }
      }}
    />
  ),
}));

vi.mock('./SubsessionView', () => ({
  SubsessionView: ({
    agentId,
    parentSessionId,
  }: {
    agentId: string;
    parentSessionId: string;
  }) => (
    <div data-testid="subsession-view" data-agent-id={agentId} data-parent={parentSessionId}>
      Subsession: {agentId}
    </div>
  ),
}));

function createMockMessage(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    uuid: 'msg-1',
    role: 'user',
    content: 'Hello, Claude!',
    timestamp: '2024-01-15T10:30:00Z',
    tool_uses: [],
    ...overrides,
  };
}

function createMockTranscript(overrides: Partial<ParsedTranscript> = {}): ParsedTranscript {
  return {
    session_id: 'test-session-123',
    messages: [
      createMockMessage({ uuid: 'msg-1', role: 'user', content: 'Hello, Claude!' }),
      createMockMessage({
        uuid: 'msg-2',
        role: 'assistant',
        content: 'Hello! How can I help you?',
        model: 'claude-3-opus-20240229',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_tokens: 10,
          cache_creation_tokens: 5,
        },
      }),
    ],
    model: 'claude-3-opus-20240229',
    total_input_tokens: 100,
    total_output_tokens: 50,
    total_cache_read_tokens: 10,
    total_cache_creation_tokens: 5,
    start_time: '2024-01-15T10:30:00Z',
    end_time: '2024-01-15T10:35:00Z',
    ...overrides,
  };
}

describe('ConversationView', () => {
  const defaultProps = {
    transcript: createMockTranscript(),
    sessionId: 'test-session-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty State', () => {
    it('renders empty state when no messages', () => {
      const emptyTranscript = createMockTranscript({ messages: [] });
      render(<ConversationView transcript={emptyTranscript} />);

      expect(screen.getByText('No messages in transcript')).toBeInTheDocument();
      expect(screen.getByText('This conversation appears to be empty')).toBeInTheDocument();
    });
  });

  describe('Message Rendering', () => {
    it('renders user and assistant messages', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByText('Hello, Claude!')).toBeInTheDocument();
      expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
    });

    it('displays role indicators for messages', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByText('You')).toBeInTheDocument();
      expect(screen.getByText('Claude')).toBeInTheDocument();
    });

    it('displays timestamps for messages', () => {
      render(<ConversationView {...defaultProps} />);

      // Should show formatted time
      const timeElements = screen.getAllByText(/\d{1,2}:\d{2}:\d{2}/);
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  describe('Session Stats', () => {
    it('displays model name', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByText('Opus 4.5')).toBeInTheDocument();
    });

    it('displays token counts', () => {
      render(<ConversationView {...defaultProps} />);

      // Total tokens
      expect(screen.getByText('150 tokens')).toBeInTheDocument();
    });

    it('displays cache stats when present', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByText('10 cached')).toBeInTheDocument();
    });

    it('displays message count', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByText('2 messages')).toBeInTheDocument();
    });

    it('displays duration', () => {
      render(<ConversationView {...defaultProps} />);

      // 5 minutes
      expect(screen.getByText('5m')).toBeInTheDocument();
    });

    it('displays git branch when present', () => {
      const transcript = createMockTranscript({ git_branch: 'feature/test' });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('feature/test')).toBeInTheDocument();
    });

    it('displays summary when present', () => {
      const transcript = createMockTranscript({ summary: 'This is a summary of the session' });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('This is a summary of the session')).toBeInTheDocument();
    });
  });

  describe('Tool Use Display', () => {
    it('renders Edit tool display', () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'I will edit the file.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Edit',
                input: {
                  file_path: '/path/to/file.ts',
                  old_string: 'const a = 1',
                  new_string: 'const a = 2',
                },
              },
            ],
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('file.ts')).toBeInTheDocument();
    });

    it('renders Read tool display', () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Reading the file.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Read',
                input: { file_path: '/path/to/readme.md' },
              },
            ],
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByText('readme.md')).toBeInTheDocument();
    });

    it('renders Bash tool display', () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Running command.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Bash',
                input: { command: 'npm test', description: 'Run tests' },
              },
            ],
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('Bash')).toBeInTheDocument();
      expect(screen.getByText('npm test')).toBeInTheDocument();
    });

    it('renders Write tool display', () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Writing file.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Write',
                input: { file_path: '/path/to/new.txt', content: 'Hello world' },
              },
            ],
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('Write')).toBeInTheDocument();
      expect(screen.getByText('new.txt')).toBeInTheDocument();
    });

    it('renders Grep tool display', () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Searching.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Grep',
                input: { pattern: 'TODO', path: '/src' },
              },
            ],
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('Grep')).toBeInTheDocument();
      expect(screen.getByText('TODO')).toBeInTheDocument();
    });

    it('renders Glob tool display', () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Finding files.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Glob',
                input: { pattern: '**/*.ts' },
              },
            ],
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('Glob')).toBeInTheDocument();
      expect(screen.getByText('**/*.ts')).toBeInTheDocument();
    });

    it('renders Task (agent) tool display', () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Spawning agent.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Task',
                input: {
                  prompt: 'Do something complex',
                  description: 'Complex task',
                  subagent_type: 'Explore',
                },
                spawned_agent_id: 'abc1234',
              },
            ],
          }),
        ],
      });
      render(<ConversationView {...defaultProps} transcript={transcript} />);

      expect(screen.getByText('Task')).toBeInTheDocument();
      expect(screen.getByText('Explore')).toBeInTheDocument();
    });

    it('renders generic tool display for unknown tools', () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Using custom tool.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'CustomTool',
                input: { key: 'value' },
              },
            ],
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('CustomTool')).toBeInTheDocument();
    });

    it('expands tool display on click', async () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Reading file.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Read',
                input: { file_path: '/full/path/to/file.ts', offset: 10, limit: 50 },
              },
            ],
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      // Click to expand
      const readButton = screen.getByText('Read').closest('button');
      fireEvent.click(readButton!);

      // Should show full path
      await waitFor(() => {
        expect(screen.getByText('/full/path/to/file.ts')).toBeInTheDocument();
      });
    });
  });

  describe('Thinking Display', () => {
    it('renders thinking block when present', () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Response here.',
            thinking: 'Let me think about this...',
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText(/Thinking/)).toBeInTheDocument();
    });

    it('expands thinking block on click', async () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Response here.',
            thinking: 'Let me think about this carefully and consider all options...',
          }),
        ],
      });
      render(<ConversationView transcript={transcript} />);

      const thinkingButton = screen.getByText(/Thinking/).closest('button');
      fireEvent.click(thinkingButton!);

      await waitFor(() => {
        expect(
          screen.getByText('Let me think about this carefully and consider all options...')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('highlights search matches in content', () => {
      render(
        <ConversationView
          {...defaultProps}
          searchQuery="Claude"
          onMatchesFound={vi.fn()}
        />
      );

      // Should have highlighted text
      const marks = document.querySelectorAll('mark');
      expect(marks.length).toBeGreaterThan(0);
    });

    it('reports match count to parent', () => {
      const onMatchesFound = vi.fn();
      render(
        <ConversationView
          {...defaultProps}
          searchQuery="Hello"
          onMatchesFound={onMatchesFound}
        />
      );

      expect(onMatchesFound).toHaveBeenCalledWith(expect.any(Number));
    });

    it('handles empty search query', () => {
      const onMatchesFound = vi.fn();
      render(
        <ConversationView
          {...defaultProps}
          searchQuery=""
          onMatchesFound={onMatchesFound}
        />
      );

      expect(onMatchesFound).toHaveBeenCalledWith(0);
    });
  });

  describe('Active Session Input', () => {
    it('renders input editor for active sessions', () => {
      render(
        <ConversationView
          {...defaultProps}
          isActiveSession={true}
          onSendMessage={vi.fn()}
        />
      );

      expect(screen.getByTestId('editor')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('does not render input for inactive sessions', () => {
      render(<ConversationView {...defaultProps} isActiveSession={false} />);

      expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    });

    it('calls onSendMessage when send button is clicked', async () => {
      const onSendMessage = vi.fn();
      render(
        <ConversationView
          {...defaultProps}
          isActiveSession={true}
          onSendMessage={onSendMessage}
        />
      );

      const editor = screen.getByTestId('editor');
      fireEvent.change(editor, { target: { value: 'New message' } });

      const sendButton = screen.getByRole('button', { name: /send/i });
      fireEvent.click(sendButton);

      expect(onSendMessage).toHaveBeenCalledWith('New message');
    });

    it('disables send button when input is empty', () => {
      render(
        <ConversationView
          {...defaultProps}
          isActiveSession={true}
          onSendMessage={vi.fn()}
        />
      );

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeDisabled();
    });
  });

  describe('Subsession Display', () => {
    it('shows subsession expansion button for tools with spawned agents', async () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Running task.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Task',
                input: { prompt: 'Test', subagent_type: 'Explore' },
                spawned_agent_id: 'abc1234',
              },
            ],
          }),
        ],
      });
      render(<ConversationView {...defaultProps} transcript={transcript} />);

      expect(screen.getByText(/view agent session/i)).toBeInTheDocument();
    });

    it('expands subsession view on click', async () => {
      const transcript = createMockTranscript({
        messages: [
          createMockMessage({
            uuid: 'msg-1',
            role: 'assistant',
            content: 'Running task.',
            tool_uses: [
              {
                id: 'tool-1',
                name: 'Task',
                input: { prompt: 'Test', subagent_type: 'Explore' },
                spawned_agent_id: 'abc1234',
              },
            ],
          }),
        ],
      });
      render(<ConversationView {...defaultProps} transcript={transcript} />);

      const expandButton = screen.getByText(/view agent session/i);
      fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByTestId('subsession-view')).toBeInTheDocument();
      });
    });
  });
});

describe('RawTranscriptView', () => {
  it('renders raw transcript text', () => {
    render(<RawTranscriptView transcript="Hello, this is raw output" />);

    expect(screen.getByText('Hello, this is raw output')).toBeInTheDocument();
  });

  it('strips ANSI escape codes', () => {
    const rawWithAnsi = '\x1b[32mGreen text\x1b[0m and normal';
    render(<RawTranscriptView transcript={rawWithAnsi} />);

    expect(screen.getByText('Green text and normal')).toBeInTheDocument();
  });

  it('removes duplicate consecutive lines', () => {
    const rawWithDuplicates = 'Line 1\nLine 1\nLine 2\nLine 2\nLine 3';
    render(<RawTranscriptView transcript={rawWithDuplicates} />);

    const text = screen.getByText(/Line 1/).textContent;
    // Should only appear once
    expect(text?.match(/Line 1/g)?.length).toBe(1);
  });

  it('handles empty transcript', () => {
    render(<RawTranscriptView transcript="" />);

    // Should render without crashing
    expect(document.querySelector('pre')).toBeInTheDocument();
  });
});

describe('Helper Functions', () => {
  describe('formatTokens', () => {
    it('formats token counts correctly', () => {
      // This tests the display indirectly through the component
      const transcript = createMockTranscript({
        total_input_tokens: 1500000,
        total_output_tokens: 0,
      });
      render(<ConversationView transcript={transcript} />);

      // 1.5M tokens
      expect(screen.getByText('1.5M tokens')).toBeInTheDocument();
    });

    it('formats thousands correctly', () => {
      const transcript = createMockTranscript({
        total_input_tokens: 1500,
        total_output_tokens: 500,
      });
      render(<ConversationView transcript={transcript} />);

      expect(screen.getByText('2.0K tokens')).toBeInTheDocument();
    });
  });

  describe('getModelName', () => {
    it('shows Opus 4.5 for opus models', () => {
      const transcript = createMockTranscript({ model: 'claude-3-opus-20240229' });
      render(<ConversationView transcript={transcript} />);
      expect(screen.getByText('Opus 4.5')).toBeInTheDocument();
    });

    it('shows Sonnet for sonnet models', () => {
      const transcript = createMockTranscript({ model: 'claude-3-sonnet' });
      render(<ConversationView transcript={transcript} />);
      expect(screen.getByText('Sonnet')).toBeInTheDocument();
    });

    it('shows Haiku for haiku models', () => {
      const transcript = createMockTranscript({ model: 'claude-3-haiku' });
      render(<ConversationView transcript={transcript} />);
      expect(screen.getByText('Haiku')).toBeInTheDocument();
    });

    it('shows Unknown for missing model', () => {
      const transcript = createMockTranscript({ model: undefined });
      render(<ConversationView transcript={transcript} />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('getDuration', () => {
    it('shows seconds for short durations', () => {
      const transcript = createMockTranscript({
        start_time: '2024-01-15T10:30:00Z',
        end_time: '2024-01-15T10:30:45Z',
      });
      render(<ConversationView transcript={transcript} />);
      expect(screen.getByText('45s')).toBeInTheDocument();
    });

    it('shows minutes for medium durations', () => {
      const transcript = createMockTranscript({
        start_time: '2024-01-15T10:30:00Z',
        end_time: '2024-01-15T10:45:00Z',
      });
      render(<ConversationView transcript={transcript} />);
      expect(screen.getByText('15m')).toBeInTheDocument();
    });

    it('shows hours for long durations', () => {
      const transcript = createMockTranscript({
        start_time: '2024-01-15T10:00:00Z',
        end_time: '2024-01-15T12:30:00Z',
      });
      render(<ConversationView transcript={transcript} />);
      expect(screen.getByText('2.5h')).toBeInTheDocument();
    });

    it('shows dash when timestamps are missing', () => {
      const transcript = createMockTranscript({
        start_time: undefined,
        end_time: undefined,
      });
      render(<ConversationView transcript={transcript} />);
      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });
});
