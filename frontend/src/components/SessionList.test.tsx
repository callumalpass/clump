import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionList, SessionListFilters } from './SessionList';
import type { SessionSummary, Process } from '../types';

// Mock ElapsedTimer component
vi.mock('./ElapsedTimer', () => ({
  ElapsedTimer: ({ startTime }: { startTime: string }) => (
    <span data-testid="elapsed-timer">{startTime}</span>
  ),
}));

function createMockSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'session-1',
    encoded_path: '-home-user-projects-test',
    repo_path: '/home/user/projects/test',
    repo_name: 'owner/test-repo',
    title: 'Test Session',
    model: 'claude-3-sonnet',
    start_time: '2024-01-15T10:30:00Z',
    end_time: '2024-01-15T10:35:00Z',
    message_count: 5,
    modified_at: '2024-01-15T10:35:00Z',
    file_size: 1024,
    entities: [],
    tags: [],
    starred: false,
    is_active: false,
    ...overrides,
  };
}

function createMockProcess(overrides: Partial<Process> = {}): Process {
  return {
    id: 'process-1',
    working_dir: '/home/user/projects/test',
    created_at: '2024-01-15T10:30:00Z',
    session_id: null,
    claude_session_id: null,
    ...overrides,
  };
}

describe('SessionList', () => {
  const defaultProps = {
    sessions: [] as SessionSummary[],
    processes: [] as Process[],
    onSelectSession: vi.fn(),
    onContinueSession: vi.fn(),
    onToggleStar: vi.fn(),
    onRefresh: vi.fn(),
    loading: false,
    filters: { category: 'all' } as SessionListFilters,
    onFiltersChange: vi.fn(),
    total: 0,
    page: 1,
    totalPages: 1,
    onPageChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Filter Tabs', () => {
    it('renders all filter tabs', () => {
      render(<SessionList {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Starred' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Linked' })).toBeInTheDocument();
    });

    it('highlights the currently selected filter', () => {
      render(<SessionList {...defaultProps} filters={{ category: 'starred' }} />);

      const starredButton = screen.getByRole('button', { name: 'Starred' });
      expect(starredButton).toHaveClass('bg-blue-600');

      const allButton = screen.getByRole('button', { name: 'All' });
      expect(allButton).not.toHaveClass('bg-blue-600');
    });

    it('calls onFiltersChange when a filter is clicked', () => {
      const onFiltersChange = vi.fn();
      render(<SessionList {...defaultProps} onFiltersChange={onFiltersChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Active' }));

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'active' });
    });

    it('displays session count', () => {
      render(<SessionList {...defaultProps} total={42} />);

      expect(screen.getByText('42 sessions')).toBeInTheDocument();
    });

    it('displays singular form for 1 session', () => {
      render(<SessionList {...defaultProps} total={1} />);

      expect(screen.getByText('1 session')).toBeInTheDocument();
    });
  });

  describe('Refresh Button', () => {
    it('renders refresh button when onRefresh provided', () => {
      render(<SessionList {...defaultProps} onRefresh={vi.fn()} />);

      expect(screen.getByTitle('Refresh')).toBeInTheDocument();
    });

    it('does not render refresh button when onRefresh not provided', () => {
      render(<SessionList {...defaultProps} onRefresh={undefined} />);

      expect(screen.queryByTitle('Refresh')).not.toBeInTheDocument();
    });

    it('calls onRefresh when refresh button clicked', () => {
      const onRefresh = vi.fn();
      render(<SessionList {...defaultProps} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByTitle('Refresh'));

      expect(onRefresh).toHaveBeenCalled();
    });

    it('disables refresh button when loading', () => {
      render(<SessionList {...defaultProps} onRefresh={vi.fn()} loading={true} />);

      // When loading, the title changes to 'Refreshing...'
      const refreshButton = screen.getByTitle('Refreshing...');
      expect(refreshButton).toBeDisabled();
    });

    it('shows spinning animation when loading', () => {
      render(<SessionList {...defaultProps} onRefresh={vi.fn()} loading={true} />);

      // When loading, the title changes to 'Refreshing...'
      const refreshButton = screen.getByTitle('Refreshing...');
      const svg = refreshButton.querySelector('svg');
      expect(svg).toHaveClass('animate-spin');
    });
  });

  describe('Loading State', () => {
    it('renders skeleton items when loading', () => {
      render(<SessionList {...defaultProps} loading={true} />);

      // Should show skeleton shimmer elements
      const skeletons = document.querySelectorAll('.skeleton-shimmer');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows 4 skeleton items when loading', () => {
      const { container } = render(<SessionList {...defaultProps} loading={true} />);

      // Each skeleton item has a container div with p-3 class
      const skeletonItems = container.querySelectorAll('.divide-y > div');
      expect(skeletonItems).toHaveLength(4);
    });
  });

  describe('Empty State', () => {
    it('renders empty state when no sessions and not loading', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={false} filters={{ category: 'all' }} />);

      expect(screen.getByText('No Claude sessions found')).toBeInTheDocument();
      expect(screen.getByText('Sessions from Claude Code will appear here')).toBeInTheDocument();
    });

    it('shows filter-specific empty message for active filter', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={false} filters={{ category: 'active' }} />);

      // When category filter is active (not 'all'), shows "no matching" message
      expect(screen.getByText('No matching sessions')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
    });

    it('shows filter-specific empty message for starred filter', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={false} filters={{ category: 'starred' }} />);

      // When category filter is starred (not 'all'), shows "no matching" message
      expect(screen.getByText('No matching sessions')).toBeInTheDocument();
    });

    it('does not show empty state when loading', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={true} />);

      expect(screen.queryByText('No Claude sessions found')).not.toBeInTheDocument();
    });
  });

  describe('Session Rendering', () => {
    it('renders session list', () => {
      const sessions = [
        createMockSession({ session_id: 'session-1', title: 'First Session' }),
        createMockSession({ session_id: 'session-2', title: 'Second Session' }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={2} />);

      expect(screen.getByText('First Session')).toBeInTheDocument();
      expect(screen.getByText('Second Session')).toBeInTheDocument();
    });

    it('shows "Untitled session" for sessions without title', () => {
      const sessions = [
        createMockSession({ session_id: 'session-1', title: null }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('Untitled session')).toBeInTheDocument();
    });

    it('displays repo name when available', () => {
      const sessions = [
        createMockSession({ repo_name: 'owner/my-repo' }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('owner/my-repo')).toBeInTheDocument();
    });

    it('displays formatted repo path when repo_name not available', () => {
      const sessions = [
        createMockSession({
          repo_name: undefined,
          repo_path: '/home/user/projects/my-project',
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('projects/my-project')).toBeInTheDocument();
    });

    it('displays message count', () => {
      const sessions = [createMockSession({ message_count: 15 })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('15 msgs')).toBeInTheDocument();
    });

    it('displays singular "msg" for single message', () => {
      const sessions = [createMockSession({ message_count: 1 })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('1 msg')).toBeInTheDocument();
    });

    it('displays model name for sonnet', () => {
      const sessions = [createMockSession({ model: 'claude-3-sonnet-20240620' })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('sonnet')).toBeInTheDocument();
    });

    it('displays model name for opus', () => {
      const sessions = [createMockSession({ model: 'claude-opus-4' })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('opus')).toBeInTheDocument();
    });

    it('displays model name for haiku', () => {
      const sessions = [createMockSession({ model: 'claude-3-haiku-20240307' })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('haiku')).toBeInTheDocument();
    });
  });

  describe('Session Status', () => {
    it('shows Active badge for active sessions', () => {
      const sessions = [createMockSession({ is_active: true })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      // Use aria-label to find the status badge, since "Active" also appears in filter tabs
      const activeBadge = screen.getByLabelText('Active session');
      expect(activeBadge).toBeInTheDocument();
      expect(activeBadge).toHaveTextContent('Active');
    });

    it('shows Done badge for completed sessions', () => {
      const sessions = [createMockSession({ is_active: false })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByLabelText('Completed session')).toBeInTheDocument();
    });

    it('shows elapsed timer for active sessions', () => {
      const sessions = [createMockSession({ is_active: true, start_time: '2024-01-15T10:30:00Z' })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByTestId('elapsed-timer')).toBeInTheDocument();
    });

    it('does not show elapsed timer for completed sessions', () => {
      const sessions = [createMockSession({ is_active: false })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.queryByTestId('elapsed-timer')).not.toBeInTheDocument();
    });
  });

  describe('Entity Links', () => {
    it('displays issue entity links', () => {
      const sessions = [
        createMockSession({
          entities: [{ kind: 'issue', number: 42 }],
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    it('displays PR entity links', () => {
      const sessions = [
        createMockSession({
          entities: [{ kind: 'pr', number: 123 }],
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('#123')).toBeInTheDocument();
    });

    it('displays multiple entity links', () => {
      const sessions = [
        createMockSession({
          entities: [
            { kind: 'issue', number: 1 },
            { kind: 'pr', number: 2 },
          ],
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
    });

    it('uses green color for issue entities', () => {
      const sessions = [
        createMockSession({
          entities: [{ kind: 'issue', number: 42 }],
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      const entitySpan = screen.getByText('#42');
      expect(entitySpan).toHaveClass('bg-green-900/30', 'text-green-400');
    });

    it('uses purple color for PR entities', () => {
      const sessions = [
        createMockSession({
          entities: [{ kind: 'pr', number: 42 }],
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      const entitySpan = screen.getByText('#42');
      expect(entitySpan).toHaveClass('bg-purple-900/30', 'text-purple-400');
    });
  });

  describe('Star Functionality', () => {
    it('renders star button when onToggleStar provided', () => {
      const sessions = [createMockSession()];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onToggleStar={vi.fn()}
        />
      );

      expect(screen.getByTitle('Star')).toBeInTheDocument();
    });

    it('does not render star button when onToggleStar not provided', () => {
      const sessions = [createMockSession()];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onToggleStar={undefined}
        />
      );

      expect(screen.queryByTitle('Star')).not.toBeInTheDocument();
    });

    it('shows filled star for starred sessions', () => {
      const sessions = [createMockSession({ starred: true })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onToggleStar={vi.fn()}
        />
      );

      expect(screen.getByTitle('Unstar')).toBeInTheDocument();
    });

    it('calls onToggleStar when star button clicked', () => {
      const onToggleStar = vi.fn();
      const session = createMockSession();

      render(
        <SessionList
          {...defaultProps}
          sessions={[session]}
          total={1}
          onToggleStar={onToggleStar}
        />
      );

      fireEvent.click(screen.getByTitle('Star'));

      expect(onToggleStar).toHaveBeenCalledWith(session);
    });

    it('stops event propagation when star button clicked', () => {
      const onSelectSession = vi.fn();
      const onToggleStar = vi.fn();
      const session = createMockSession();

      render(
        <SessionList
          {...defaultProps}
          sessions={[session]}
          total={1}
          onSelectSession={onSelectSession}
          onToggleStar={onToggleStar}
        />
      );

      fireEvent.click(screen.getByTitle('Star'));

      expect(onToggleStar).toHaveBeenCalled();
      expect(onSelectSession).not.toHaveBeenCalled();
    });
  });

  describe('Continue Session', () => {
    it('shows Continue button for completed sessions', () => {
      const sessions = [createMockSession({ is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onContinueSession={vi.fn()}
        />
      );

      expect(screen.getByTitle('Continue this conversation')).toBeInTheDocument();
    });

    it('does not show Continue button for active sessions', () => {
      const sessions = [createMockSession({ is_active: true })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onContinueSession={vi.fn()}
        />
      );

      expect(screen.queryByTitle('Continue this conversation')).not.toBeInTheDocument();
    });

    it('does not show Continue button when onContinueSession not provided', () => {
      const sessions = [createMockSession({ is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onContinueSession={undefined}
        />
      );

      expect(screen.queryByTitle('Continue this conversation')).not.toBeInTheDocument();
    });

    it('calls onContinueSession when Continue button clicked', () => {
      const onContinueSession = vi.fn();
      const session = createMockSession({ is_active: false });

      render(
        <SessionList
          {...defaultProps}
          sessions={[session]}
          total={1}
          onContinueSession={onContinueSession}
        />
      );

      fireEvent.click(screen.getByTitle('Continue this conversation'));

      expect(onContinueSession).toHaveBeenCalledWith(session);
    });

    it('stops event propagation when Continue button clicked', () => {
      const onSelectSession = vi.fn();
      const onContinueSession = vi.fn();
      const session = createMockSession({ is_active: false });

      render(
        <SessionList
          {...defaultProps}
          sessions={[session]}
          total={1}
          onSelectSession={onSelectSession}
          onContinueSession={onContinueSession}
        />
      );

      fireEvent.click(screen.getByTitle('Continue this conversation'));

      expect(onContinueSession).toHaveBeenCalled();
      expect(onSelectSession).not.toHaveBeenCalled();
    });
  });

  describe('Session Selection', () => {
    it('calls onSelectSession when session row clicked', () => {
      const onSelectSession = vi.fn();
      const session = createMockSession();

      render(
        <SessionList
          {...defaultProps}
          sessions={[session]}
          total={1}
          onSelectSession={onSelectSession}
        />
      );

      // Click on the session title text
      fireEvent.click(screen.getByText('Test Session'));

      expect(onSelectSession).toHaveBeenCalledWith(session);
    });
  });

  describe('Duration Display', () => {
    it('shows relative time for completed sessions with modified_at', () => {
      const modifiedAt = '2024-01-15T10:35:00Z';
      const sessions = [
        createMockSession({
          is_active: false,
          start_time: '2024-01-15T10:30:00Z',
          end_time: '2024-01-15T10:35:00Z',
          modified_at: modifiedAt,
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      // The relative time should be shown with a title containing the full date
      const dateTitle = new Date(modifiedAt).toLocaleString();
      expect(screen.getByTitle(dateTitle)).toBeInTheDocument();
    });

    it('shows elapsed timer for active sessions', () => {
      const sessions = [
        createMockSession({
          is_active: true,
          start_time: '2024-01-15T10:30:00Z',
          end_time: null,
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByTitle('Time elapsed')).toBeInTheDocument();
      expect(screen.getByTestId('elapsed-timer')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper focus ring styling on filter buttons', () => {
      render(<SessionList {...defaultProps} />);

      const filterButton = screen.getByRole('button', { name: 'All' });
      expect(filterButton).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-blue-500');
    });

    it('has proper aria-label on status badges', () => {
      const sessions = [createMockSession({ is_active: true })];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.getByLabelText('Active session')).toBeInTheDocument();
    });

    it('has title attribute on repo path for full path tooltip', () => {
      const sessions = [
        createMockSession({
          repo_name: undefined,
          repo_path: '/very/long/path/to/repository',
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      // formatRepoPath takes the last 2 segments: 'to/repository'
      const repoSpan = screen.getByText('to/repository');
      expect(repoSpan).toHaveAttribute('title', '/very/long/path/to/repository');
    });
  });
});
