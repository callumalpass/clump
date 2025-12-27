import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionList, SessionFilter } from './SessionList';
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
    filter: 'all' as SessionFilter,
    onFilterChange: vi.fn(),
    total: 0,
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
      render(<SessionList {...defaultProps} filter="starred" />);

      const starredButton = screen.getByRole('button', { name: 'Starred' });
      expect(starredButton).toHaveClass('bg-blue-600');

      const allButton = screen.getByRole('button', { name: 'All' });
      expect(allButton).not.toHaveClass('bg-blue-600');
    });

    it('calls onFilterChange when a filter is clicked', () => {
      const onFilterChange = vi.fn();
      render(<SessionList {...defaultProps} onFilterChange={onFilterChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Active' }));

      expect(onFilterChange).toHaveBeenCalledWith('active');
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

      expect(screen.getByTitle('Refresh sessions')).toBeInTheDocument();
    });

    it('does not render refresh button when onRefresh not provided', () => {
      render(<SessionList {...defaultProps} onRefresh={undefined} />);

      expect(screen.queryByTitle('Refresh sessions')).not.toBeInTheDocument();
    });

    it('calls onRefresh when refresh button clicked', () => {
      const onRefresh = vi.fn();
      render(<SessionList {...defaultProps} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByTitle('Refresh sessions'));

      expect(onRefresh).toHaveBeenCalled();
    });

    it('disables refresh button when loading', () => {
      render(<SessionList {...defaultProps} onRefresh={vi.fn()} loading={true} />);

      const refreshButton = screen.getByTitle('Refresh sessions');
      expect(refreshButton).toBeDisabled();
    });

    it('shows spinning animation when loading', () => {
      render(<SessionList {...defaultProps} onRefresh={vi.fn()} loading={true} />);

      const refreshButton = screen.getByTitle('Refresh sessions');
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
      render(<SessionList {...defaultProps} sessions={[]} loading={false} filter="all" />);

      expect(screen.getByText('No Claude sessions found')).toBeInTheDocument();
      expect(screen.getByText('Sessions from Claude Code will appear here')).toBeInTheDocument();
    });

    it('shows filter-specific empty message for active filter', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={false} filter="active" />);

      expect(screen.getByText('No active sessions')).toBeInTheDocument();
      expect(screen.getByText('Try selecting a different filter')).toBeInTheDocument();
    });

    it('shows filter-specific empty message for starred filter', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={false} filter="starred" />);

      expect(screen.getByText('No starred sessions')).toBeInTheDocument();
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
    it('shows duration for completed sessions with both start and end time', () => {
      const sessions = [
        createMockSession({
          is_active: false,
          start_time: '2024-01-15T10:30:00Z',
          end_time: '2024-01-15T10:35:00Z',  // 5 minute duration
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      // The calculateDuration function should show "5m" for 5 minutes
      expect(screen.getByTitle('Total duration')).toBeInTheDocument();
    });

    it('does not show duration when start_time is missing', () => {
      const sessions = [
        createMockSession({
          is_active: false,
          start_time: null,
          end_time: '2024-01-15T10:35:00Z',
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.queryByTitle('Total duration')).not.toBeInTheDocument();
    });

    it('does not show duration when end_time is missing for completed sessions', () => {
      const sessions = [
        createMockSession({
          is_active: false,
          start_time: '2024-01-15T10:30:00Z',
          end_time: null,
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      expect(screen.queryByTitle('Total duration')).not.toBeInTheDocument();
    });

    it('shows elapsed timer instead of duration for active sessions', () => {
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
      expect(filterButton).toHaveClass('focus:ring-2', 'focus:ring-blue-500');
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
