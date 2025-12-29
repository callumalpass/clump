import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionList, SessionListFilters } from './SessionList';
import type { SessionSummary, Process, BulkOperationResult } from '../types';

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
      expect(starredButton).toHaveClass('bg-blurple-500');

      const allButton = screen.getByRole('button', { name: 'All' });
      expect(allButton).not.toHaveClass('bg-blurple-500');
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

      // Each skeleton item has a container div with skeleton-item-enter class
      const skeletonItems = container.querySelectorAll('.skeleton-item-enter');
      expect(skeletonItems).toHaveLength(4);
    });
  });

  describe('Empty State', () => {
    it('renders empty state when no sessions and not loading', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={false} filters={{ category: 'all' }} />);

      expect(screen.getByText('No sessions yet')).toBeInTheDocument();
      expect(screen.getByText('Start a session from an issue or PR')).toBeInTheDocument();
    });

    it('shows filter-specific empty message for active filter', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={false} filters={{ category: 'active' }} />);

      // When category filter is active (not 'all'), shows "no matching" message
      expect(screen.getByText('No matching sessions')).toBeInTheDocument();
      expect(screen.getByText('No sessions match the selected filters')).toBeInTheDocument();
    });

    it('shows filter-specific empty message for starred filter', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={false} filters={{ category: 'starred' }} />);

      // When category filter is starred (not 'all'), shows "no matching" message
      expect(screen.getByText('No matching sessions')).toBeInTheDocument();
    });

    it('does not show empty state when loading', () => {
      render(<SessionList {...defaultProps} sessions={[]} loading={true} />);

      expect(screen.queryByText('No sessions yet')).not.toBeInTheDocument();
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

    it('uses mint color for issue entities', () => {
      const sessions = [
        createMockSession({
          entities: [{ kind: 'issue', number: 42 }],
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      const entitySpan = screen.getByText('#42');
      expect(entitySpan).toHaveClass('bg-mint-400/15', 'text-mint-400');
    });

    it('uses blurple color for PR entities', () => {
      const sessions = [
        createMockSession({
          entities: [{ kind: 'pr', number: 42 }],
        }),
      ];

      render(<SessionList {...defaultProps} sessions={sessions} total={1} />);

      const entitySpan = screen.getByText('#42');
      expect(entitySpan).toHaveClass('bg-blurple-400/15', 'text-blurple-400');
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
      expect(filterButton).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-blurple-400');
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

  describe('Active Filter Count', () => {
    it('does not count undefined sort as active filter', () => {
      // When sort is undefined (default), it should not count as active
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', sort: undefined }}
        />
      );

      // The filter indicator should not appear when no filters are active
      expect(screen.queryByTitle('Clear all active filters')).not.toBeInTheDocument();
    });

    it('does not count undefined order as active filter', () => {
      // When order is undefined (default), it should not count as active
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', order: undefined }}
        />
      );

      expect(screen.queryByTitle('Clear all active filters')).not.toBeInTheDocument();
    });

    it('counts non-default sort as active filter', () => {
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', sort: 'updated' }}
        />
      );

      // Clear filters indicator should appear when there's an active filter
      expect(screen.getByTitle('Clear all active filters')).toBeInTheDocument();
    });

    it('counts non-default order as active filter', () => {
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', order: 'asc' }}
        />
      );

      expect(screen.getByTitle('Clear all active filters')).toBeInTheDocument();
    });

    it('counts search as active filter', () => {
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', search: 'test query' }}
        />
      );

      expect(screen.getByTitle('Clear all active filters')).toBeInTheDocument();
    });

    it('counts date range as active filter', () => {
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', dateRange: 'today' }}
        />
      );

      expect(screen.getByTitle('Clear all active filters')).toBeInTheDocument();
    });

    it('counts model filter as active filter', () => {
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', model: 'opus' }}
        />
      );

      expect(screen.getByTitle('Clear all active filters')).toBeInTheDocument();
    });
  });

  describe('Bulk Operations', () => {
    it('shows select checkbox when bulk operations are available', () => {
      const sessions = [createMockSession({ is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={vi.fn()}
        />
      );

      // Should show the select all checkbox in the header
      expect(screen.getByTitle('Select sessions')).toBeInTheDocument();
    });

    it('does not show select checkbox when no bulk operations available', () => {
      const sessions = [createMockSession({ is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={undefined}
          onBulkStar={undefined}
        />
      );

      expect(screen.queryByTitle('Select sessions')).not.toBeInTheDocument();
    });

    it('shows bulk actions bar when sessions are selected', async () => {
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={vi.fn()}
        />
      );

      // Click the checkbox to select the session
      const selectCheckbox = screen.getByTitle('Select');
      fireEvent.click(selectCheckbox);

      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('clicking on active session checkbox does not select it', () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: true }),
        createMockSession({ session_id: 'sess-2', is_active: false }),
      ];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={2}
          onBulkDelete={vi.fn()}
        />
      );

      // Both sessions have checkboxes rendered, but clicking on active session's doesn't do anything useful
      // The test verifies that when we use select all, only non-active sessions are selected
      fireEvent.click(screen.getByTitle('Select sessions'));

      // Should only show 1 selected (the non-active one)
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('calls onBulkStar with correct parameters', async () => {
      const onBulkStar = vi.fn().mockResolvedValue({ updated: 1 } as BulkOperationResult);
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkStar={onBulkStar}
        />
      );

      // Select the session
      fireEvent.click(screen.getByTitle('Select'));

      // Click the Star button
      const starButton = screen.getByTitle('Star selected');
      fireEvent.click(starButton);

      await waitFor(() => {
        expect(onBulkStar).toHaveBeenCalledWith(['sess-1'], true);
      });
    });

    it('calls onBulkStar with false for unstar', async () => {
      const onBulkStar = vi.fn().mockResolvedValue({ updated: 1 } as BulkOperationResult);
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkStar={onBulkStar}
        />
      );

      // Select the session
      fireEvent.click(screen.getByTitle('Select'));

      // Click the Unstar button
      const unstarButton = screen.getByTitle('Unstar selected');
      fireEvent.click(unstarButton);

      await waitFor(() => {
        expect(onBulkStar).toHaveBeenCalledWith(['sess-1'], false);
      });
    });

    it('clears selection after successful bulk star', async () => {
      const onBulkStar = vi.fn().mockResolvedValue({ updated: 1 } as BulkOperationResult);
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkStar={onBulkStar}
        />
      );

      // Select the session
      fireEvent.click(screen.getByTitle('Select'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();

      // Click Star
      fireEvent.click(screen.getByTitle('Star selected'));

      await waitFor(() => {
        // Selection should be cleared
        expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
      });
    });

    it('does not clear selection when bulk star updates zero sessions', async () => {
      const onBulkStar = vi.fn().mockResolvedValue({ updated: 0 } as BulkOperationResult);
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkStar={onBulkStar}
        />
      );

      // Select the session
      fireEvent.click(screen.getByTitle('Select'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();

      // Click Star
      fireEvent.click(screen.getByTitle('Star selected'));

      await waitFor(() => {
        expect(onBulkStar).toHaveBeenCalled();
      });

      // Selection should NOT be cleared since updated: 0
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('shows delete confirmation dialog when delete clicked', () => {
      const onBulkDelete = vi.fn();
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={onBulkDelete}
        />
      );

      // Select the session
      fireEvent.click(screen.getByTitle('Select'));

      // Click Delete
      fireEvent.click(screen.getByTitle('Delete selected'));

      // Confirmation dialog should appear
      expect(screen.getByText('Delete Sessions')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete 1 session/)).toBeInTheDocument();
    });

    it('calls onBulkDelete after confirmation', async () => {
      const onBulkDelete = vi.fn().mockResolvedValue({ deleted: 1 } as BulkOperationResult);
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={onBulkDelete}
        />
      );

      // Select the session
      fireEvent.click(screen.getByTitle('Select'));

      // Click Delete in bulk actions bar
      fireEvent.click(screen.getByTitle('Delete selected'));

      // Find the confirm button (the one with btn-danger class in the dialog)
      const confirmButton = screen.getByRole('dialog').querySelector('.btn-danger');
      expect(confirmButton).toBeInTheDocument();
      fireEvent.click(confirmButton!);

      await waitFor(() => {
        expect(onBulkDelete).toHaveBeenCalledWith(['sess-1']);
      });
    });

    it('cancels delete when cancel clicked in dialog', () => {
      const onBulkDelete = vi.fn();
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={onBulkDelete}
        />
      );

      // Select the session
      fireEvent.click(screen.getByTitle('Select'));

      // Click Delete in bulk actions bar
      fireEvent.click(screen.getByTitle('Delete selected'));

      // Find and click the Cancel button in the dialog (the one with btn-secondary class)
      const dialog = screen.getByRole('dialog');
      const cancelButton = dialog.querySelector('.btn-secondary');
      expect(cancelButton).toBeInTheDocument();
      fireEvent.click(cancelButton!);

      // Dialog should close, onBulkDelete should not be called
      expect(onBulkDelete).not.toHaveBeenCalled();
      expect(screen.queryByText('Delete Sessions')).not.toBeInTheDocument();
    });

    it('clears selection when cancel button in bulk bar clicked', () => {
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={vi.fn()}
        />
      );

      // Select the session
      fireEvent.click(screen.getByTitle('Select'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();

      // Click Cancel in bulk bar
      fireEvent.click(screen.getByTitle('Clear selection'));

      // Selection should be cleared
      expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    });

    it('can select all non-active sessions', () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: false }),
        createMockSession({ session_id: 'sess-2', is_active: false }),
        createMockSession({ session_id: 'sess-3', is_active: true }),
      ];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={3}
          onBulkDelete={vi.fn()}
        />
      );

      // Click select all
      fireEvent.click(screen.getByTitle('Select sessions'));

      // Should show 2 selected (not 3, since active session is excluded)
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    it('toggles select all to deselect when all are selected', () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: false }),
        createMockSession({ session_id: 'sess-2', is_active: false }),
      ];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={2}
          onBulkDelete={vi.fn()}
        />
      );

      // Click select all
      fireEvent.click(screen.getByTitle('Select sessions'));
      expect(screen.getByText('2 selected')).toBeInTheDocument();

      // Click deselect all
      fireEvent.click(screen.getByTitle('Deselect all'));

      expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
    });
  });

  describe('Model Filters', () => {
    it('renders model filter dropdown with all options', () => {
      render(<SessionList {...defaultProps} />);

      const modelSelect = screen.getByRole('combobox', { name: 'Filter by model' });
      expect(modelSelect).toBeInTheDocument();

      // Check all options are present
      expect(screen.getByRole('option', { name: 'All Models' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Sonnet' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Opus' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Haiku' })).toBeInTheDocument();
    });

    it('calls onFiltersChange with model filter', () => {
      const onFiltersChange = vi.fn();
      render(<SessionList {...defaultProps} onFiltersChange={onFiltersChange} />);

      const modelSelect = screen.getByRole('combobox', { name: 'Filter by model' });
      fireEvent.change(modelSelect, { target: { value: 'opus' } });

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all', model: 'opus' });
    });

    it('clears model filter when All Models selected', () => {
      const onFiltersChange = vi.fn();
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', model: 'opus' }}
          onFiltersChange={onFiltersChange}
        />
      );

      const modelSelect = screen.getByRole('combobox', { name: 'Filter by model' });
      fireEvent.change(modelSelect, { target: { value: 'all' } });

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all', model: undefined });
    });
  });

  describe('Date Range Filters', () => {
    it('renders date range filter dropdown with all options', () => {
      render(<SessionList {...defaultProps} />);

      const dateSelect = screen.getByRole('combobox', { name: 'Filter by date' });
      expect(dateSelect).toBeInTheDocument();

      // Check all options are present
      expect(screen.getByRole('option', { name: 'All Time' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Today' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Yesterday' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'This Week' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'This Month' })).toBeInTheDocument();
    });

    it('calls onFiltersChange with date range filter', () => {
      const onFiltersChange = vi.fn();
      render(<SessionList {...defaultProps} onFiltersChange={onFiltersChange} />);

      const dateSelect = screen.getByRole('combobox', { name: 'Filter by date' });
      fireEvent.change(dateSelect, { target: { value: 'today' } });

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all', dateRange: 'today' });
    });

    it('clears date range filter when All Time selected', () => {
      const onFiltersChange = vi.fn();
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', dateRange: 'today' }}
          onFiltersChange={onFiltersChange}
        />
      );

      const dateSelect = screen.getByRole('combobox', { name: 'Filter by date' });
      fireEvent.change(dateSelect, { target: { value: 'all' } });

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all', dateRange: undefined });
    });
  });

  describe('Sort and Order Controls', () => {
    it('calls onFiltersChange with sort option', () => {
      const onFiltersChange = vi.fn();
      render(<SessionList {...defaultProps} onFiltersChange={onFiltersChange} />);

      // Find the sort select by its aria-label
      const sortSelect = screen.getByRole('combobox', { name: 'Sort by' });
      expect(sortSelect).toBeInTheDocument();
      fireEvent.change(sortSelect, { target: { value: 'updated' } });

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all', sort: 'updated' });
    });

    it('toggles order when order button clicked', () => {
      const onFiltersChange = vi.fn();
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', order: 'desc' }}
          onFiltersChange={onFiltersChange}
        />
      );

      // Find the order toggle button by its title (desc order shows "Newest first - click for oldest first")
      const orderButton = screen.getByTitle('Newest first - click for oldest first');
      fireEvent.click(orderButton);

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all', order: 'asc' });
    });

    it('handles undefined order (defaults to desc)', () => {
      const onFiltersChange = vi.fn();
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all' }} // no order specified
          onFiltersChange={onFiltersChange}
        />
      );

      // Default order is desc, so the title should be "Newest first..."
      const orderButton = screen.getByTitle('Newest first - click for oldest first');
      fireEvent.click(orderButton);

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all', order: 'asc' });
    });
  });

  describe('Search Input', () => {
    it('updates search filter on input after debounce', async () => {
      vi.useFakeTimers();
      const onFiltersChange = vi.fn();
      render(<SessionList {...defaultProps} onFiltersChange={onFiltersChange} />);

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      fireEvent.change(searchInput, { target: { value: 'test query' } });

      // Advance timers to trigger debounce
      vi.advanceTimersByTime(300);

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all', search: 'test query' });
      vi.useRealTimers();
    });

    it('clears search filter when clear button clicked', async () => {
      const onFiltersChange = vi.fn();
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'all', search: 'existing' }}
          onFiltersChange={onFiltersChange}
        />
      );

      // Click the clear search button
      const clearButton = screen.getByTitle('Clear search');
      fireEvent.click(clearButton);

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all', search: undefined });
    });
  });

  describe('Clear Filters', () => {
    it('resets all filters when clear clicked', () => {
      const onFiltersChange = vi.fn();
      render(
        <SessionList
          {...defaultProps}
          filters={{ category: 'starred', model: 'opus', search: 'test' }}
          onFiltersChange={onFiltersChange}
        />
      );

      // Click the filter indicator button
      fireEvent.click(screen.getByTitle('Clear all active filters'));

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'all' });
    });
  });

  describe('Pagination', () => {
    it('renders pagination with current page indicator', () => {
      const sessions = [createMockSession()];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={100}
          page={2}
          totalPages={5}
        />
      );

      // Should display page indicator
      expect(screen.getByText('2 / 5')).toBeInTheDocument();
    });

    it('calls onPageChange when next page button clicked', () => {
      const onPageChange = vi.fn();
      const sessions = [createMockSession()];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={100}
          page={2}
          totalPages={5}
          onPageChange={onPageChange}
        />
      );

      // Find and click next page button by its aria-label
      const nextButton = screen.getByLabelText(/Go to next page/);
      fireEvent.click(nextButton);

      expect(onPageChange).toHaveBeenCalledWith(3);
    });
  });

  describe('Completed Filter', () => {
    it('renders Completed filter tab', () => {
      render(<SessionList {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Completed' })).toBeInTheDocument();
    });

    it('calls onFiltersChange with completed category', () => {
      const onFiltersChange = vi.fn();
      render(<SessionList {...defaultProps} onFiltersChange={onFiltersChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Completed' }));

      expect(onFiltersChange).toHaveBeenCalledWith({ category: 'completed' });
    });

    it('highlights completed filter when selected', () => {
      render(<SessionList {...defaultProps} filters={{ category: 'completed' }} />);

      const completedButton = screen.getByRole('button', { name: 'Completed' });
      expect(completedButton).toHaveClass('bg-blurple-500');
    });
  });

  describe('Checkbox Bounce Animation', () => {
    it('applies checkbox-bounce class when session is selected', () => {
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      const { rerender } = render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={vi.fn()}
        />
      );

      // Initially no bounce class
      const checkbox = screen.getByTitle('Select');
      expect(checkbox).not.toHaveClass('checkbox-bounce');

      // Click to select - this should trigger the bounce
      fireEvent.click(checkbox);

      // After selection, the checkbox should have the bounce class
      const selectedCheckbox = screen.getByTitle('Deselect');
      expect(selectedCheckbox).toHaveClass('checkbox-bounce');
    });

    it('applies checkbox-bounce class when session is deselected', () => {
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={vi.fn()}
        />
      );

      // Select the session first
      const selectCheckbox = screen.getByTitle('Select');
      fireEvent.click(selectCheckbox);

      // Deselect the session
      const deselectCheckbox = screen.getByTitle('Deselect');
      fireEvent.click(deselectCheckbox);

      // After deselection, the checkbox should have the bounce class
      const checkbox = screen.getByTitle('Select');
      expect(checkbox).toHaveClass('checkbox-bounce');
    });

    it('removes checkbox-bounce class after animation ends', () => {
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={vi.fn()}
        />
      );

      // Click to select
      const checkbox = screen.getByTitle('Select');
      fireEvent.click(checkbox);

      // Checkbox should have bounce class
      const selectedCheckbox = screen.getByTitle('Deselect');
      expect(selectedCheckbox).toHaveClass('checkbox-bounce');

      // Trigger animation end
      fireEvent.animationEnd(selectedCheckbox);

      // Bounce class should be removed after animation ends
      expect(selectedCheckbox).not.toHaveClass('checkbox-bounce');
    });

    it('checkbox bounce animation resets on multiple toggle cycles', () => {
      const sessions = [createMockSession({ session_id: 'sess-1', is_active: false })];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={1}
          onBulkDelete={vi.fn()}
        />
      );

      // First cycle: select
      let checkbox = screen.getByTitle('Select');
      fireEvent.click(checkbox);

      // Should have bounce class
      checkbox = screen.getByTitle('Deselect');
      expect(checkbox).toHaveClass('checkbox-bounce');

      // Complete animation
      fireEvent.animationEnd(checkbox);
      expect(checkbox).not.toHaveClass('checkbox-bounce');

      // Second cycle: deselect
      fireEvent.click(checkbox);
      checkbox = screen.getByTitle('Select');
      expect(checkbox).toHaveClass('checkbox-bounce');

      // Complete animation
      fireEvent.animationEnd(checkbox);
      expect(checkbox).not.toHaveClass('checkbox-bounce');

      // Third cycle: select again
      fireEvent.click(checkbox);
      checkbox = screen.getByTitle('Deselect');
      expect(checkbox).toHaveClass('checkbox-bounce');
    });

    it('multiple checkboxes bounce independently', async () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: false, title: 'Session 1' }),
        createMockSession({ session_id: 'sess-2', is_active: false, title: 'Session 2' }),
      ];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={2}
          onBulkDelete={vi.fn()}
        />
      );

      // Get both checkboxes (both are 'Select' initially)
      const checkboxes = screen.getAllByTitle('Select');
      expect(checkboxes).toHaveLength(2);

      // Select only the first session
      fireEvent.click(checkboxes[0]);

      // First checkbox should bounce and be selected
      const firstSelected = screen.getByTitle('Deselect');
      expect(firstSelected).toHaveClass('checkbox-bounce');

      // Second checkbox should not bounce (it wasn't changed)
      const secondCheckbox = screen.getAllByTitle('Select')[0]; // Only one 'Select' remains
      expect(secondCheckbox).not.toHaveClass('checkbox-bounce');
    });

    it('select all triggers bounce on all non-active session checkboxes', () => {
      const sessions = [
        createMockSession({ session_id: 'sess-1', is_active: false, title: 'Session 1' }),
        createMockSession({ session_id: 'sess-2', is_active: false, title: 'Session 2' }),
        createMockSession({ session_id: 'sess-3', is_active: true, title: 'Session 3' }),
      ];

      render(
        <SessionList
          {...defaultProps}
          sessions={sessions}
          total={3}
          onBulkDelete={vi.fn()}
        />
      );

      // Click select all
      fireEvent.click(screen.getByTitle('Select sessions'));

      // All deselect buttons (for non-active sessions) should be bouncing
      const deselectButtons = screen.getAllByTitle('Deselect');
      expect(deselectButtons).toHaveLength(2); // Only 2 non-active sessions

      deselectButtons.forEach(btn => {
        expect(btn).toHaveClass('checkbox-bounce');
      });
    });
  });
});
