import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IssueDetail } from './IssueDetail';
import type { IssueDetail as IssueDetailType, SessionSummary, Process, Tag, CommandMetadata } from '../types';
import * as useApi from '../hooks/useApi';

// Mock the API hooks
vi.mock('../hooks/useApi', () => ({
  fetchIssue: vi.fn(),
  closeIssue: vi.fn(),
  reopenIssue: vi.fn(),
}));

// Mock Markdown component
vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

// Mock Editor component
vi.mock('./Editor', () => ({
  Editor: ({
    value,
    onChange,
    placeholder,
    disabled,
    onSubmit,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    onSubmit?: () => void;
  }) => (
    <textarea
      data-testid="comment-editor"
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

// Mock StartSessionButton component
vi.mock('./StartSessionButton', () => ({
  StartSessionButton: ({
    issue,
    commands,
    onStart,
  }: {
    issue: { number: number };
    commands: CommandMetadata[];
    onStart: (issue: { number: number }, command: CommandMetadata) => void;
  }) => (
    <button
      data-testid="start-session-btn"
      onClick={() => commands[0] && onStart(issue, commands[0])}
    >
      Start Session
    </button>
  ),
}));

function createMockIssue(overrides: Partial<IssueDetailType> = {}): IssueDetailType {
  return {
    number: 42,
    title: 'Fix bug in login',
    body: 'There is a bug in the login flow that needs to be fixed.',
    state: 'open',
    labels: ['bug', 'priority-high'],
    author: 'reporter',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-16T15:30:00Z',
    comments_count: 2,
    url: 'https://github.com/test/repo/issues/42',
    comments: [
      {
        id: 1,
        author: 'developer1',
        body: 'I can reproduce this issue.',
        created_at: '2024-01-15T12:00:00Z',
      },
      {
        id: 2,
        author: 'developer2',
        body: 'Working on a fix.',
        created_at: '2024-01-16T09:00:00Z',
      },
    ],
    ...overrides,
  };
}

function createMockSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'session-abc123',
    encoded_path: '-home-user-projects-test',
    repo_path: '/home/user/projects/test',
    title: 'Bug Fix Session',
    model: 'claude-3-opus',
    start_time: '2024-01-16T10:30:00Z',
    end_time: '2024-01-16T10:45:00Z',
    message_count: 10,
    modified_at: '2024-01-16T10:45:00Z',
    file_size: 2048,
    entities: [{ kind: 'issue', number: 42 }],
    tags: [],
    starred: false,
    is_active: false,
    ...overrides,
  };
}

function createMockProcess(overrides: Partial<Process> = {}): Process {
  return {
    id: 'process-123',
    working_dir: '/home/user/projects/test',
    created_at: '2024-01-16T11:00:00Z',
    session_id: null,
    claude_session_id: 'session-abc123',
    ...overrides,
  };
}

function createMockTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    repo_id: 1,
    name: 'important',
    color: '#ff0000',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockCommand(overrides: Partial<CommandMetadata> = {}): CommandMetadata {
  return {
    id: 'cmd-1',
    name: 'Fix Issue',
    shortName: 'Fix',
    description: 'Work on fixing this issue',
    category: 'issue',
    template: 'Fix issue #{{number}}: {{title}}',
    source: 'builtin',
    ...overrides,
  };
}

describe('IssueDetail', () => {
  const defaultProps = {
    repoId: 1,
    issueNumber: 42,
    issueCommands: [createMockCommand()],
    onStartSession: vi.fn(),
    sessions: [],
    processes: [],
    expandedSessionId: null,
    onToggleSession: vi.fn(),
    onSelectSession: vi.fn(),
    onContinueSession: vi.fn(),
    tags: [],
    issueTags: [],
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onCreateTag: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useApi.fetchIssue as ReturnType<typeof vi.fn>).mockResolvedValue(createMockIssue());
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading skeleton initially', () => {
      // Make the promise never resolve to keep loading state
      (useApi.fetchIssue as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

      render(<IssueDetail {...defaultProps} />);

      // Should show skeleton shimmers
      const skeletons = document.querySelectorAll('.skeleton-shimmer');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Issue Not Found', () => {
    it('renders not found message when issue is null', async () => {
      (useApi.fetchIssue as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Issue not found')).toBeInTheDocument();
      });
    });
  });

  describe('Basic Rendering', () => {
    it('renders issue title and number', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('#42 Fix bug in login')).toBeInTheDocument();
      });
    });

    it('renders issue state badge for open issue', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        const stateBadge = screen.getByText('open');
        expect(stateBadge).toBeInTheDocument();
        expect(stateBadge).toHaveClass('text-green-400');
      });
    });

    it('renders issue state badge for closed issue', async () => {
      (useApi.fetchIssue as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockIssue({ state: 'closed' })
      );

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        const stateBadge = screen.getByText('closed');
        expect(stateBadge).toBeInTheDocument();
        expect(stateBadge).toHaveClass('text-purple-400');
      });
    });

    it('renders issue labels', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('bug')).toBeInTheDocument();
        expect(screen.getByText('priority-high')).toBeInTheDocument();
      });
    });

    it('renders GitHub link', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        const link = screen.getByText('View on GitHub →');
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', 'https://github.com/test/repo/issues/42');
        expect(link).toHaveAttribute('target', '_blank');
      });
    });
  });

  describe('Issue Body', () => {
    it('renders issue body using Markdown component', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        const markdowns = screen.getAllByTestId('markdown');
        expect(markdowns[0]).toHaveTextContent('There is a bug in the login flow');
      });
    });

    it('renders placeholder when issue has no body', async () => {
      (useApi.fetchIssue as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockIssue({ body: '' })
      );

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No description provided.')).toBeInTheDocument();
      });
    });

    it('renders author and creation date', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('reporter')).toBeInTheDocument();
        expect(screen.getByText(/Opened by/)).toBeInTheDocument();
      });
    });
  });

  describe('Issue Actions', () => {
    it('shows Close Issue button for open issues', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Close Issue')).toBeInTheDocument();
      });
    });

    it('shows Reopen Issue button for closed issues', async () => {
      (useApi.fetchIssue as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockIssue({ state: 'closed' })
      );

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Reopen Issue')).toBeInTheDocument();
      });
    });

    it('calls closeIssue when Close Issue is clicked', async () => {
      (useApi.closeIssue as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Close Issue')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close Issue'));

      await waitFor(() => {
        expect(useApi.closeIssue).toHaveBeenCalledWith(1, 42);
      });
    });

    it('calls reopenIssue when Reopen Issue is clicked', async () => {
      (useApi.fetchIssue as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockIssue({ state: 'closed' })
      );
      (useApi.reopenIssue as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Reopen Issue')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Reopen Issue'));

      await waitFor(() => {
        expect(useApi.reopenIssue).toHaveBeenCalledWith(1, 42);
      });
    });

    it('shows loading state while closing issue', async () => {
      // Make closeIssue hang
      (useApi.closeIssue as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {})
      );

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Close Issue')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close Issue'));

      await waitFor(() => {
        expect(screen.getByText('Closing...')).toBeInTheDocument();
      });
    });

    it('shows error message when close fails', async () => {
      (useApi.closeIssue as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permission denied')
      );

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Close Issue')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close Issue'));

      await waitFor(() => {
        expect(screen.getByText('Permission denied')).toBeInTheDocument();
      });
    });
  });

  describe('Comments', () => {
    it('renders comments count', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Comments (2)')).toBeInTheDocument();
      });
    });

    it('renders comment authors and content', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('developer1')).toBeInTheDocument();
        expect(screen.getByText('developer2')).toBeInTheDocument();
      });
    });

    it('renders placeholder when no comments exist', async () => {
      (useApi.fetchIssue as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockIssue({ comments: [], comments_count: 0 })
      );

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No comments yet.')).toBeInTheDocument();
      });
    });

    it('renders comment editor', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('comment-editor')).toBeInTheDocument();
      });
    });

    it('posts comment when form is submitted', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('comment-editor')).toBeInTheDocument();
      });

      const editor = screen.getByTestId('comment-editor');
      fireEvent.change(editor, { target: { value: 'My new comment' } });

      fireEvent.click(screen.getByText('Comment'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/repos/1/issues/42/comments',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: 'My new comment' }),
          })
        );
      });
    });

    it('shows error when comment posting fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ detail: 'Failed to post' }),
      });

      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('comment-editor')).toBeInTheDocument();
      });

      const editor = screen.getByTestId('comment-editor');
      fireEvent.change(editor, { target: { value: 'My new comment' } });
      fireEvent.click(screen.getByText('Comment'));

      await waitFor(() => {
        expect(screen.getByText('Failed to post')).toBeInTheDocument();
      });
    });

    it('disables comment button when input is empty', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        const button = screen.getByText('Comment');
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Tags', () => {
    it('renders tags section', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Tags:')).toBeInTheDocument();
      });
    });

    it('renders existing issue tags', async () => {
      const tag = createMockTag({ name: 'important', color: '#ff0000' });
      render(<IssueDetail {...defaultProps} issueTags={[tag]} />);

      await waitFor(() => {
        expect(screen.getByText('important')).toBeInTheDocument();
      });
    });

    it('renders add tag button', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('+ Add tag')).toBeInTheDocument();
      });
    });

    it('shows tag dropdown when add tag is clicked', async () => {
      const availableTag = createMockTag({ id: 2, name: 'available-tag' });
      render(<IssueDetail {...defaultProps} tags={[availableTag]} />);

      await waitFor(() => {
        expect(screen.getByText('+ Add tag')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ Add tag'));

      expect(screen.getByText('Available tags')).toBeInTheDocument();
      expect(screen.getByText('available-tag')).toBeInTheDocument();
    });

    it('calls onAddTag when available tag is clicked', async () => {
      const availableTag = createMockTag({ id: 2, name: 'available-tag' });
      const onAddTag = vi.fn();
      render(<IssueDetail {...defaultProps} tags={[availableTag]} onAddTag={onAddTag} />);

      await waitFor(() => {
        expect(screen.getByText('+ Add tag')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ Add tag'));
      fireEvent.click(screen.getByText('available-tag'));

      expect(onAddTag).toHaveBeenCalledWith(2);
    });

    it('calls onRemoveTag when tag remove button is clicked', async () => {
      const tag = createMockTag({ id: 1, name: 'removable' });
      const onRemoveTag = vi.fn();
      render(<IssueDetail {...defaultProps} issueTags={[tag]} onRemoveTag={onRemoveTag} />);

      await waitFor(() => {
        expect(screen.getByText('removable')).toBeInTheDocument();
      });

      // Click the × button
      fireEvent.click(screen.getByTitle('Remove tag'));

      expect(onRemoveTag).toHaveBeenCalledWith(1);
    });

    it('allows creating new tag', async () => {
      const onCreateTag = vi.fn().mockResolvedValue({ id: 3, name: 'new-tag', color: '#00ff00' });
      const onAddTag = vi.fn();
      render(<IssueDetail {...defaultProps} onCreateTag={onCreateTag} onAddTag={onAddTag} />);

      await waitFor(() => {
        expect(screen.getByText('+ Add tag')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ Add tag'));

      const input = screen.getByPlaceholderText('Tag name');
      fireEvent.change(input, { target: { value: 'new-tag' } });
      fireEvent.click(screen.getByText('Add'));

      await waitFor(() => {
        expect(onCreateTag).toHaveBeenCalledWith('new-tag', expect.any(String));
        expect(onAddTag).toHaveBeenCalledWith(3);
      });
    });
  });

  describe('Related Sessions', () => {
    it('does not render sessions section when no sessions are linked', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('#42 Fix bug in login')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Sessions \(/)).not.toBeInTheDocument();
    });

    it('renders sessions section with count when sessions exist', async () => {
      const session = createMockSession();
      render(<IssueDetail {...defaultProps} sessions={[session]} />);

      await waitFor(() => {
        expect(screen.getByText('Sessions (1)')).toBeInTheDocument();
      });
    });

    it('filters sessions to only show those linked to this issue', async () => {
      const linkedSession = createMockSession({
        session_id: 'linked',
        title: 'Linked Session',
        entities: [{ kind: 'issue', number: 42 }],
      });
      const unlinkedSession = createMockSession({
        session_id: 'unlinked',
        title: 'Unlinked Session',
        entities: [{ kind: 'issue', number: 99 }],
      });
      const prSession = createMockSession({
        session_id: 'pr-session',
        title: 'PR Session',
        entities: [{ kind: 'pr', number: 42 }],
      });

      render(
        <IssueDetail
          {...defaultProps}
          sessions={[linkedSession, unlinkedSession, prSession]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Sessions (1)')).toBeInTheDocument();
        expect(screen.getByText('Linked Session')).toBeInTheDocument();
      });

      expect(screen.queryByText('Unlinked Session')).not.toBeInTheDocument();
      expect(screen.queryByText('PR Session')).not.toBeInTheDocument();
    });

    it('calls onSelectSession when session is clicked', async () => {
      const session = createMockSession();
      const onSelectSession = vi.fn();
      render(
        <IssueDetail
          {...defaultProps}
          sessions={[session]}
          onSelectSession={onSelectSession}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Bug Fix Session')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Bug Fix Session'));

      expect(onSelectSession).toHaveBeenCalledWith(session);
    });

    it('shows running indicator for active sessions', async () => {
      const session = createMockSession({
        session_id: 'active-session',
        is_active: true,
      });
      const process = createMockProcess({
        claude_session_id: 'active-session',
      });

      render(
        <IssueDetail
          {...defaultProps}
          sessions={[session]}
          processes={[process]}
        />
      );

      await waitFor(() => {
        const indicator = document.querySelector('.bg-yellow-500.animate-pulse');
        expect(indicator).toBeInTheDocument();
        expect(screen.getByText('Process running - click to view')).toBeInTheDocument();
      });
    });
  });

  describe('Start Session Button', () => {
    it('renders the start session button', async () => {
      render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('start-session-btn')).toBeInTheDocument();
      });
    });

    it('calls onStartSession when button is clicked', async () => {
      const onStartSession = vi.fn();
      render(<IssueDetail {...defaultProps} onStartSession={onStartSession} />);

      await waitFor(() => {
        expect(screen.getByTestId('start-session-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('start-session-btn'));

      expect(onStartSession).toHaveBeenCalledWith(defaultProps.issueCommands[0]);
    });
  });

  describe('Reload on Prop Changes', () => {
    it('reloads issue when issueNumber changes', async () => {
      const { rerender } = render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(useApi.fetchIssue).toHaveBeenCalledWith(1, 42);
      });

      rerender(<IssueDetail {...defaultProps} issueNumber={43} />);

      await waitFor(() => {
        expect(useApi.fetchIssue).toHaveBeenCalledWith(1, 43);
      });
    });

    it('reloads issue when repoId changes', async () => {
      const { rerender } = render(<IssueDetail {...defaultProps} />);

      await waitFor(() => {
        expect(useApi.fetchIssue).toHaveBeenCalledWith(1, 42);
      });

      rerender(<IssueDetail {...defaultProps} repoId={2} />);

      await waitFor(() => {
        expect(useApi.fetchIssue).toHaveBeenCalledWith(2, 42);
      });
    });
  });
});
