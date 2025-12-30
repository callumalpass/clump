import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PRDetail, DiffBar } from './PRDetail';
import type { PRDetail as PRDetailType, SessionSummary, Process, CommandMetadata } from '../types';

// Mock the fetchPR function
vi.mock('../hooks/useApi', () => ({
  fetchPR: vi.fn(),
}));

import { fetchPR } from '../hooks/useApi';

// Mock Markdown component
vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

// Mock PRStartSessionButton component
vi.mock('./PRStartSessionButton', () => ({
  PRStartSessionButton: ({
    pr,
    commands,
    onStart,
  }: {
    pr: { number: number };
    commands: CommandMetadata[];
    onStart: (pr: { number: number }, command: CommandMetadata) => void;
  }) => (
    <button
      data-testid={`start-session-btn`}
      onClick={() => commands[0] && onStart(pr, commands[0])}
    >
      Start Session
    </button>
  ),
}));

function createMockPRDetail(overrides: Partial<PRDetailType> = {}): PRDetailType {
  return {
    number: 42,
    title: 'Add new feature',
    body: 'This PR adds a new feature to the application.',
    state: 'open',
    labels: ['enhancement', 'needs-review'],
    author: 'testuser',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-16T15:30:00Z',
    head_ref: 'feature/new-feature',
    base_ref: 'main',
    additions: 150,
    deletions: 30,
    changed_files: 8,
    comments_count: 2,
    url: 'https://github.com/test/repo/pull/42',
    comments: [
      { id: 1, author: 'reviewer1', body: 'Looks good!', created_at: '2024-01-15T12:00:00Z' },
      { id: 2, author: 'reviewer2', body: 'Please add tests.', created_at: '2024-01-15T14:00:00Z' },
    ],
    ...overrides,
  };
}

function createMockSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'session-abc123',
    encoded_path: '-home-user-projects-test',
    repo_path: '/home/user/projects/test',
    title: 'PR Review Session',
    model: 'claude-3-opus',
    start_time: '2024-01-16T10:30:00Z',
    end_time: '2024-01-16T10:45:00Z',
    message_count: 10,
    modified_at: '2024-01-16T10:45:00Z',
    file_size: 2048,
    entities: [{ kind: 'pr', number: 42 }],
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
    mode: 'pty',
    ...overrides,
  };
}

function createMockCommand(overrides: Partial<CommandMetadata> = {}): CommandMetadata {
  return {
    id: 'cmd-1',
    name: 'Review PR',
    shortName: 'Review',
    description: 'Review this pull request',
    category: 'pr',
    template: 'Review PR #{{number}}',
    source: 'builtin',
    ...overrides,
  };
}

describe('PRDetail', () => {
  const mockPR = createMockPRDetail();
  const defaultProps = {
    repoId: 1,
    prNumber: 42,
    prCommands: [createMockCommand()],
    onStartSession: vi.fn(),
    sessions: [],
    processes: [],
    onSelectSession: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchPR as ReturnType<typeof vi.fn>).mockResolvedValue(mockPR);
  });

  describe('Loading State', () => {
    it('shows loading skeleton initially', () => {
      (fetchPR as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));
      render(<PRDetail {...defaultProps} />);

      // Should show skeleton elements
      expect(document.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0);
    });
  });

  describe('Basic Rendering', () => {
    it('renders PR title and number after loading', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('#42 Add new feature')).toBeInTheDocument();
      });
    });

    it('renders PR state badge for open PR', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        const stateBadge = screen.getByText('open');
        expect(stateBadge).toBeInTheDocument();
        expect(stateBadge).toHaveClass('text-green-400');
      });
    });

    it('renders PR state badge for merged PR', async () => {
      (fetchPR as ReturnType<typeof vi.fn>).mockResolvedValue(createMockPRDetail({ state: 'merged' }));
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        const stateBadge = screen.getByText('merged');
        expect(stateBadge).toBeInTheDocument();
        expect(stateBadge).toHaveClass('text-purple-400');
      });
    });

    it('renders PR state badge for closed PR', async () => {
      (fetchPR as ReturnType<typeof vi.fn>).mockResolvedValue(createMockPRDetail({ state: 'closed' }));
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        const stateBadge = screen.getByText('closed');
        expect(stateBadge).toBeInTheDocument();
        expect(stateBadge).toHaveClass('text-red-400');
      });
    });

    it('renders PR labels', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('enhancement')).toBeInTheDocument();
        expect(screen.getByText('needs-review')).toBeInTheDocument();
      });
    });

    it('renders GitHub link', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        const link = screen.getByText('View on GitHub →');
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', 'https://github.com/test/repo/pull/42');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });

    it('renders branch information', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('feature/new-feature')).toBeInTheDocument();
        expect(screen.getByText('main')).toBeInTheDocument();
      });
    });

    it('renders additions and deletions', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('+150')).toBeInTheDocument();
        expect(screen.getByText('-30')).toBeInTheDocument();
      });
    });

    it('renders changed files count', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('8 files changed')).toBeInTheDocument();
      });
    });
  });

  describe('PR Description', () => {
    it('renders PR body using Markdown component', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        // Multiple markdown elements (PR body and comments), so use getAllByTestId
        const markdownElements = screen.getAllByTestId('markdown');
        expect(markdownElements.some(el => el.textContent === 'This PR adds a new feature to the application.')).toBe(true);
      });
    });

    it('renders placeholder when PR has no body', async () => {
      (fetchPR as ReturnType<typeof vi.fn>).mockResolvedValue(createMockPRDetail({ body: '' }));
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No description provided.')).toBeInTheDocument();
      });
    });

    it('renders author and creation date', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('testuser')).toBeInTheDocument();
        expect(screen.getByText(/Opened by/)).toBeInTheDocument();
      });
    });
  });

  describe('Comments', () => {
    it('renders comments section with count', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Comments (2)')).toBeInTheDocument();
      });
    });

    it('renders comment authors and content', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('reviewer1')).toBeInTheDocument();
        expect(screen.getByText('reviewer2')).toBeInTheDocument();
      });

      // Comments are rendered via Markdown mock
      const markdowns = screen.getAllByTestId('markdown');
      const commentMarkdowns = markdowns.filter(m =>
        m.textContent === 'Looks good!' || m.textContent === 'Please add tests.'
      );
      expect(commentMarkdowns.length).toBe(2);
    });

    it('renders no comments message when empty', async () => {
      (fetchPR as ReturnType<typeof vi.fn>).mockResolvedValue(createMockPRDetail({ comments: [] }));
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Comments (0)')).toBeInTheDocument();
        expect(screen.getByText('No comments yet on this pull request.')).toBeInTheDocument();
      });
    });
  });

  describe('Start Session Button', () => {
    it('renders the start session button', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('start-session-btn')).toBeInTheDocument();
      });
    });

    it('calls onStartSession when button is clicked', async () => {
      const onStartSession = vi.fn();
      render(<PRDetail {...defaultProps} onStartSession={onStartSession} />);

      await waitFor(() => {
        expect(screen.getByTestId('start-session-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('start-session-btn'));

      expect(onStartSession).toHaveBeenCalledWith(defaultProps.prCommands[0]);
    });
  });

  describe('Related Sessions', () => {
    it('does not render sessions section when no sessions are linked', async () => {
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('#42 Add new feature')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Sessions \(/)).not.toBeInTheDocument();
    });

    it('renders sessions section with count when sessions exist', async () => {
      const session = createMockSession();
      render(<PRDetail {...defaultProps} sessions={[session]} />);

      await waitFor(() => {
        expect(screen.getByText('Sessions (1)')).toBeInTheDocument();
      });
    });

    it('renders session titles', async () => {
      const session = createMockSession({ title: 'Code Review Session' });
      render(<PRDetail {...defaultProps} sessions={[session]} />);

      await waitFor(() => {
        expect(screen.getByText('Code Review Session')).toBeInTheDocument();
      });
    });

    it('filters sessions to only show those linked to this PR', async () => {
      const linkedSession = createMockSession({
        session_id: 'linked-session',
        title: 'Linked Session',
        entities: [{ kind: 'pr', number: 42 }],
      });
      const unlinkedSession = createMockSession({
        session_id: 'unlinked-session',
        title: 'Unlinked Session',
        entities: [{ kind: 'pr', number: 99 }],
      });

      render(
        <PRDetail
          {...defaultProps}
          sessions={[linkedSession, unlinkedSession]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Sessions (1)')).toBeInTheDocument();
        expect(screen.getByText('Linked Session')).toBeInTheDocument();
        expect(screen.queryByText('Unlinked Session')).not.toBeInTheDocument();
      });
    });

    it('calls onSelectSession when session is clicked', async () => {
      const session = createMockSession();
      const onSelectSession = vi.fn();
      render(
        <PRDetail
          {...defaultProps}
          sessions={[session]}
          onSelectSession={onSelectSession}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('PR Review Session')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('PR Review Session'));

      expect(onSelectSession).toHaveBeenCalledWith(session);
    });
  });

  describe('Error Handling', () => {
    it('shows error message when PR not found', async () => {
      (fetchPR as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));
      render(<PRDetail {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Pull request not found')).toBeInTheDocument();
      });
    });
  });
});

describe('DiffBar', () => {

  it('returns null when total is 0', () => {
    const { container } = render(<DiffBar additions={0} deletions={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders 5 blocks by default', () => {
    const { container } = render(<DiffBar additions={50} deletions={50} />);
    const blocks = container.querySelectorAll('span');
    expect(blocks.length).toBe(5);
  });

  it('respects maxBlocks prop', () => {
    const { container } = render(<DiffBar additions={50} deletions={50} maxBlocks={10} />);
    const blocks = container.querySelectorAll('span');
    expect(blocks.length).toBe(10);
  });

  it('shows all green blocks when only additions', () => {
    const { container } = render(<DiffBar additions={100} deletions={0} />);
    const greenBlocks = container.querySelectorAll('.bg-green-500');
    const redBlocks = container.querySelectorAll('.bg-red-500');
    expect(greenBlocks.length).toBe(5);
    expect(redBlocks.length).toBe(0);
  });

  it('shows all red blocks when only deletions', () => {
    const { container } = render(<DiffBar additions={0} deletions={100} />);
    const greenBlocks = container.querySelectorAll('.bg-green-500');
    const redBlocks = container.querySelectorAll('.bg-red-500');
    expect(greenBlocks.length).toBe(0);
    expect(redBlocks.length).toBe(5);
  });

  it('shows proportional blocks for mixed changes', () => {
    // 80% additions, 20% deletions = 4 green, 1 red
    const { container } = render(<DiffBar additions={80} deletions={20} />);
    const greenBlocks = container.querySelectorAll('.bg-green-500');
    const redBlocks = container.querySelectorAll('.bg-red-500');
    expect(greenBlocks.length).toBe(4);
    expect(redBlocks.length).toBe(1);
  });

  it('shows at least one of each type when both exist with extreme ratio', () => {
    // 999 additions, 1 deletion - should still show at least 1 red
    const { container } = render(<DiffBar additions={999} deletions={1} />);
    const greenBlocks = container.querySelectorAll('.bg-green-500');
    const redBlocks = container.querySelectorAll('.bg-red-500');
    expect(greenBlocks.length).toBe(4);
    expect(redBlocks.length).toBe(1);
  });

  it('shows at least one green when additions are minimal', () => {
    // 1 addition, 999 deletions - should still show at least 1 green
    const { container } = render(<DiffBar additions={1} deletions={999} />);
    const greenBlocks = container.querySelectorAll('.bg-green-500');
    const redBlocks = container.querySelectorAll('.bg-red-500');
    expect(greenBlocks.length).toBe(1);
    expect(redBlocks.length).toBe(4);
  });

  it('shows equal split for 50/50 ratio', () => {
    // 50/50 split with 5 blocks = 2 or 3 each (Math.round)
    const { container } = render(<DiffBar additions={50} deletions={50} />);
    const greenBlocks = container.querySelectorAll('.bg-green-500');
    const redBlocks = container.querySelectorAll('.bg-red-500');
    // Math.round(0.5 * 5) = 3 green, 2 red
    expect(greenBlocks.length).toBe(3);
    expect(redBlocks.length).toBe(2);
  });

  it('displays correct tooltip with formatted numbers', () => {
    render(<DiffBar additions={1500} deletions={300} />);
    const container = screen.getByTitle('+1,500 additions, -300 deletions');
    expect(container).toBeInTheDocument();
  });

  it('has correct aria-label for accessibility', () => {
    render(<DiffBar additions={10} deletions={5} />);
    const container = screen.getByLabelText('10 additions, 5 deletions');
    expect(container).toBeInTheDocument();
  });

  it('blocks have hover scale effect class', () => {
    const { container } = render(<DiffBar additions={50} deletions={50} />);
    const blocks = container.querySelectorAll('span');
    blocks.forEach(block => {
      expect(block).toHaveClass('hover:scale-125');
    });
  });
});
