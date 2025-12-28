import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PRList } from './PRList';
import type { PR, SessionSummary, CommandMetadata } from '../types';

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
      data-testid={`start-session-${pr.number}`}
      onClick={() => commands[0] && onStart(pr, commands[0])}
    >
      Start
    </button>
  ),
}));

function createMockPR(overrides: Partial<PR> = {}): PR {
  return {
    number: 1,
    title: 'Test PR',
    body: 'PR body',
    state: 'open',
    labels: [],
    author: 'testuser',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    head_ref: 'feature-branch',
    base_ref: 'main',
    additions: 100,
    deletions: 50,
    changed_files: 5,
    comments_count: 0,
    url: 'https://github.com/test/repo/pull/1',
    ...overrides,
  };
}

function createMockSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'session-1',
    encoded_path: '-home-user-projects-test',
    repo_path: '/home/user/projects/test',
    title: 'Test Session',
    model: 'claude-3-opus',
    start_time: '2024-01-15T10:30:00Z',
    end_time: null,
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

function createMockCommand(overrides: Partial<CommandMetadata> = {}): CommandMetadata {
  return {
    id: 'cmd-1',
    name: 'Review PR',
    shortName: 'Review',
    description: 'Review this PR',
    category: 'pr',
    template: 'Review PR #{{number}}',
    source: 'builtin',
    ...overrides,
  };
}

describe('PRList', () => {
  const defaultProps = {
    prs: [] as PR[],
    selectedPR: null,
    onSelectPR: vi.fn(),
    prCommands: [createMockCommand()],
    onStartSession: vi.fn(),
    loading: false,
    filters: { state: 'open' as const },
    onFiltersChange: vi.fn(),
    page: 1,
    totalPages: 1,
    total: 0,
    onPageChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('renders skeleton items when loading', () => {
      render(<PRList {...defaultProps} loading={true} />);

      // Should show skeleton shimmer elements
      const skeletons = document.querySelectorAll('.skeleton-shimmer');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows filter tabs even when loading', () => {
      render(<PRList {...defaultProps} loading={true} />);

      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.getByText('Closed')).toBeInTheDocument();
      // There are two "All" buttons (StateToggle and SessionStatusToggle), so use getAllByText
      expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Empty State', () => {
    it('renders empty state when no PRs and not loading', () => {
      render(<PRList {...defaultProps} prs={[]} loading={false} />);

      // With default filters (state: 'open'), shows generic empty state
      expect(screen.getByText('No pull requests')).toBeInTheDocument();
      expect(screen.getByText('This repository has no PRs yet')).toBeInTheDocument();
    });

    it('shows correct empty message for closed filter', () => {
      render(<PRList {...defaultProps} prs={[]} loading={false} filters={{ state: 'closed' }} />);

      // With filters active, shows "no matching" message
      expect(screen.getByText('No matching pull requests')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
    });

    it('shows correct empty message for all filter', () => {
      render(<PRList {...defaultProps} prs={[]} loading={false} filters={{ state: 'all' }} />);

      // With 'all' filter (not default 'open'), shows "no matching" message
      expect(screen.getByText('No matching pull requests')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
    });

    it('does not show empty state when loading', () => {
      render(<PRList {...defaultProps} prs={[]} loading={true} />);

      expect(screen.queryByText('No pull requests')).not.toBeInTheDocument();
      expect(screen.queryByText('No matching pull requests')).not.toBeInTheDocument();
    });
  });

  describe('PR Rendering', () => {
    it('renders PR list', () => {
      const prs = [
        createMockPR({ number: 1, title: 'First PR' }),
        createMockPR({ number: 2, title: 'Second PR' }),
      ];

      render(<PRList {...defaultProps} prs={prs} />);

      expect(screen.getByText('First PR')).toBeInTheDocument();
      expect(screen.getByText('Second PR')).toBeInTheDocument();
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
    });

    it('displays PR author and file stats', () => {
      const prs = [createMockPR({
        author: 'john_doe',
        additions: 100,
        deletions: 50,
        changed_files: 5
      })];

      render(<PRList {...defaultProps} prs={prs} />);

      expect(screen.getByText(/by john_doe/)).toBeInTheDocument();
      expect(screen.getByText('+100')).toBeInTheDocument();
      expect(screen.getByText('-50')).toBeInTheDocument();
      expect(screen.getByText('5 files')).toBeInTheDocument();
    });

    it('uses singular form for 1 file', () => {
      const prs = [createMockPR({ changed_files: 1 })];

      render(<PRList {...defaultProps} prs={prs} />);

      expect(screen.getByText('1 file')).toBeInTheDocument();
    });

    it('renders branch information', () => {
      const prs = [createMockPR({ head_ref: 'my-feature', base_ref: 'develop' })];

      render(<PRList {...defaultProps} prs={prs} />);

      expect(screen.getByText('my-feature')).toBeInTheDocument();
      expect(screen.getByText('develop')).toBeInTheDocument();
    });

    it('renders PR labels', () => {
      const prs = [createMockPR({ labels: ['bug', 'urgent'] })];

      render(<PRList {...defaultProps} prs={prs} />);

      expect(screen.getByText('bug')).toBeInTheDocument();
      expect(screen.getByText('urgent')).toBeInTheDocument();
    });

    it('does not render labels section when no labels', () => {
      const prs = [createMockPR({ labels: [] })];

      const { container } = render(<PRList {...defaultProps} prs={prs} />);

      // The labels container should not be present
      const labelContainer = container.querySelector('.flex.items-center.gap-1\\.5.mt-1.flex-wrap');
      expect(labelContainer).not.toBeInTheDocument();
    });
  });

  describe('PR Selection', () => {
    it('calls onSelectPR when PR is clicked', () => {
      const onSelectPR = vi.fn();
      const prs = [createMockPR({ number: 42, title: 'Click Me' })];

      render(<PRList {...defaultProps} prs={prs} onSelectPR={onSelectPR} />);

      fireEvent.click(screen.getByText('Click Me'));

      expect(onSelectPR).toHaveBeenCalledWith(42);
    });

    it('highlights selected PR', () => {
      const prs = [
        createMockPR({ number: 1, title: 'PR 1' }),
        createMockPR({ number: 2, title: 'PR 2' }),
      ];

      render(<PRList {...defaultProps} prs={prs} selectedPR={1} />);

      const selectedItem = screen.getByText('PR 1').closest('.p-3');
      expect(selectedItem).toHaveClass('border-blue-500');
      expect(selectedItem).toHaveClass('list-item-selected');
    });

    it('does not highlight unselected PRs', () => {
      const prs = [
        createMockPR({ number: 1, title: 'PR 1' }),
        createMockPR({ number: 2, title: 'PR 2' }),
      ];

      render(<PRList {...defaultProps} prs={prs} selectedPR={1} />);

      const unselectedItem = screen.getByText('PR 2').closest('.p-3');
      expect(unselectedItem).toHaveClass('border-transparent');
      expect(unselectedItem).not.toHaveClass('list-item-selected');
    });
  });

  describe('Session Status Indicators', () => {
    it('shows running indicator for PRs with active sessions', () => {
      const prs = [createMockPR({ number: 1 })];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [{ kind: 'pr', number: 1 }],
          is_active: true,
        }),
      ];

      render(<PRList {...defaultProps} prs={prs} sessions={sessions} />);

      const runningIndicator = document.querySelector('.bg-yellow-500.animate-pulse');
      expect(runningIndicator).toBeInTheDocument();
    });

    it('shows completed indicator for PRs with finished sessions', () => {
      const prs = [createMockPR({ number: 1 })];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [{ kind: 'pr', number: 1 }],
          is_active: false,
        }),
      ];

      render(<PRList {...defaultProps} prs={prs} sessions={sessions} />);

      const completedIndicator = document.querySelector('.bg-green-500:not(.animate-pulse)');
      expect(completedIndicator).toBeInTheDocument();
    });

    it('shows session count in PR metadata', () => {
      const prs = [createMockPR({ number: 1 })];
      const sessions = [
        createMockSession({
          entities: [{ kind: 'pr', number: 1 }],
          is_active: false,
        }),
        createMockSession({
          session_id: 'sess-2',
          entities: [{ kind: 'pr', number: 1 }],
          is_active: false,
        }),
      ];

      render(<PRList {...defaultProps} prs={prs} sessions={sessions} />);

      expect(screen.getByText(/2 sessions/)).toBeInTheDocument();
    });

    it('uses singular form for 1 session', () => {
      const prs = [createMockPR({ number: 1 })];
      const sessions = [
        createMockSession({
          entities: [{ kind: 'pr', number: 1 }],
          is_active: false,
        }),
      ];

      render(<PRList {...defaultProps} prs={prs} sessions={sessions} />);

      expect(screen.getByText(/1 session$/)).toBeInTheDocument();
    });

    it('does not show indicator when no sessions', () => {
      const prs = [createMockPR({ number: 1 })];

      render(<PRList {...defaultProps} prs={prs} sessions={[]} />);

      const runningIndicator = document.querySelector('.bg-yellow-500.animate-pulse');
      const completedIndicator = document.querySelector('.w-2.h-2.rounded-full.bg-green-500');
      expect(runningIndicator).not.toBeInTheDocument();
      expect(completedIndicator).not.toBeInTheDocument();
    });
  });

  describe('State Filter', () => {
    it('renders all filter tabs', () => {
      render(<PRList {...defaultProps} />);

      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.getByText('Closed')).toBeInTheDocument();
      // There are two "All" buttons (StateToggle and SessionStatusToggle)
      expect(screen.getAllByText('All').length).toBe(2);
    });

    it('highlights active filter tab', () => {
      render(<PRList {...defaultProps} filters={{ state: 'closed' }} />);

      const closedButton = screen.getByText('Closed');
      // StateToggle uses a sliding indicator div (not button background) for active state
      // The button has aria-pressed="true" when active
      expect(closedButton).toHaveAttribute('aria-pressed', 'true');

      const openButton = screen.getByText('Open');
      expect(openButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('calls onFiltersChange when filter is clicked', () => {
      const onFiltersChange = vi.fn();

      render(<PRList {...defaultProps} onFiltersChange={onFiltersChange} />);

      fireEvent.click(screen.getByText('Closed'));

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'closed' });
    });

    it('calls onFiltersChange with all when All tab is clicked', () => {
      const onFiltersChange = vi.fn();

      render(<PRList {...defaultProps} onFiltersChange={onFiltersChange} />);

      // The StateToggle's "All" button is the one that doesn't have a title attribute
      // Find all "All" buttons and click the one without title="Show all"
      const allButtons = screen.getAllByText('All');
      const stateToggleAllButton = allButtons.find(btn => !btn.hasAttribute('title'));
      fireEvent.click(stateToggleAllButton!);

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'all' });
    });
  });

  describe('PR Count Display', () => {
    it('displays correct PR count', () => {
      const prs = [
        createMockPR({ number: 1 }),
        createMockPR({ number: 2 }),
        createMockPR({ number: 3 }),
      ];

      render(<PRList {...defaultProps} prs={prs} total={3} />);

      // The count appears in both ItemCount (filter bar) and pagination footer
      expect(screen.getAllByText('3 PRs').length).toBeGreaterThanOrEqual(1);
    });

    it('uses singular form for 1 PR', () => {
      const prs = [createMockPR({ number: 1 })];

      render(<PRList {...defaultProps} prs={prs} total={1} />);

      // ItemCount uses singular form for 1 item
      expect(screen.getByText('1 PR')).toBeInTheDocument();
    });

    it('shows 0 PRs when empty and loading shows skeletons', () => {
      render(<PRList {...defaultProps} prs={[]} loading={true} total={0} />);

      // Count should still show even when loading
      expect(screen.getByText('0 PRs')).toBeInTheDocument();
    });
  });

  describe('Start Session', () => {
    it('calls onStartSession when start button is clicked', () => {
      const onStartSession = vi.fn();
      const prs = [createMockPR({ number: 1 })];
      const commands = [createMockCommand()];

      render(
        <PRList
          {...defaultProps}
          prs={prs}
          prCommands={commands}
          onStartSession={onStartSession}
        />
      );

      fireEvent.click(screen.getByTestId('start-session-1'));

      expect(onStartSession).toHaveBeenCalledWith(
        expect.objectContaining({ number: 1 }),
        expect.objectContaining({ id: 'cmd-1' })
      );
    });

    it('renders start button for each PR', () => {
      const prs = [
        createMockPR({ number: 1 }),
        createMockPR({ number: 2 }),
        createMockPR({ number: 3 }),
      ];

      render(<PRList {...defaultProps} prs={prs} />);

      expect(screen.getByTestId('start-session-1')).toBeInTheDocument();
      expect(screen.getByTestId('start-session-2')).toBeInTheDocument();
      expect(screen.getByTestId('start-session-3')).toBeInTheDocument();
    });
  });

  describe('Multiple Sessions Per PR', () => {
    it('groups sessions correctly by PR number', () => {
      const prs = [
        createMockPR({ number: 1, title: 'PR 1' }),
        createMockPR({ number: 2, title: 'PR 2' }),
      ];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [{ kind: 'pr', number: 1 }],
          is_active: false,
        }),
        createMockSession({
          session_id: 'sess-2',
          entities: [{ kind: 'pr', number: 1 }],
          is_active: false,
        }),
        createMockSession({
          session_id: 'sess-3',
          entities: [{ kind: 'pr', number: 2 }],
          is_active: false,
        }),
      ];

      render(<PRList {...defaultProps} prs={prs} sessions={sessions} />);

      // PR 1 should have 2 sessions, PR 2 should have 1 session
      expect(screen.getByText(/2 sessions/)).toBeInTheDocument();
      expect(screen.getByText(/1 session$/)).toBeInTheDocument();
    });

    it('handles sessions with multiple PR entities', () => {
      const prs = [
        createMockPR({ number: 1, title: 'PR 1' }),
        createMockPR({ number: 2, title: 'PR 2' }),
      ];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [
            { kind: 'pr', number: 1 },
            { kind: 'pr', number: 2 },
          ],
          is_active: false,
        }),
      ];

      render(<PRList {...defaultProps} prs={prs} sessions={sessions} />);

      // Both PRs should show 1 session
      const sessionCounts = screen.getAllByText(/1 session/);
      expect(sessionCounts).toHaveLength(2);
    });

    it('ignores sessions with issue entities when counting PR sessions', () => {
      const prs = [createMockPR({ number: 1 })];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [{ kind: 'issue', number: 1 }], // Issue, not PR
          is_active: false,
        }),
      ];

      render(<PRList {...defaultProps} prs={prs} sessions={sessions} />);

      // Should not show any session count since the entity is an issue
      expect(screen.queryByText(/session/)).not.toBeInTheDocument();
    });

    it('prioritizes running session indicator over completed', () => {
      const prs = [createMockPR({ number: 1 })];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [{ kind: 'pr', number: 1 }],
          is_active: false, // Completed
        }),
        createMockSession({
          session_id: 'sess-2',
          entities: [{ kind: 'pr', number: 1 }],
          is_active: true, // Running
        }),
      ];

      render(<PRList {...defaultProps} prs={prs} sessions={sessions} />);

      // Should show running indicator (yellow pulse) even though one session is completed
      const runningIndicator = document.querySelector('.bg-yellow-500.animate-pulse');
      expect(runningIndicator).toBeInTheDocument();

      // Should not show completed indicator (green without pulse) as standalone
      // The green indicator shows only when there are NO active sessions
      const completedIndicators = document.querySelectorAll('.w-2.h-2.rounded-full.bg-green-500:not(.animate-pulse)');
      expect(completedIndicators).toHaveLength(0);
    });
  });

  describe('Accessibility', () => {
    it('has accessible filter buttons with focus states', () => {
      render(<PRList {...defaultProps} />);

      const filterButtons = screen.getAllByRole('button').filter(btn =>
        btn.textContent === 'Open' || btn.textContent === 'Closed' || btn.textContent === 'All'
      );

      filterButtons.forEach(button => {
        expect(button).toHaveClass('focus:outline-none');
        expect(button).toHaveClass('focus-visible:ring-2');
        expect(button).toHaveClass('focus-visible:ring-blue-500');
      });
    });

    it('uses title attributes for truncated content', () => {
      const prs = [createMockPR({
        title: 'A very long PR title that might get truncated',
        head_ref: 'feature/very-long-branch-name',
        base_ref: 'main'
      })];

      render(<PRList {...defaultProps} prs={prs} />);

      const titleElement = screen.getByText('A very long PR title that might get truncated');
      expect(titleElement).toHaveAttribute('title', 'A very long PR title that might get truncated');

      const headRef = screen.getByText('feature/very-long-branch-name');
      expect(headRef).toHaveAttribute('title', 'feature/very-long-branch-name');
    });
  });

  describe('Edge Cases', () => {
    it('handles PR with zero additions/deletions', () => {
      const prs = [createMockPR({ additions: 0, deletions: 0 })];

      render(<PRList {...defaultProps} prs={prs} />);

      expect(screen.getByText('+0')).toBeInTheDocument();
      expect(screen.getByText('-0')).toBeInTheDocument();
    });

    it('handles PR with empty labels array', () => {
      const prs = [createMockPR({ labels: [] })];

      const { container } = render(<PRList {...defaultProps} prs={prs} />);

      // Should not render labels section at all
      const labelsContainer = container.querySelector('.flex.items-center.gap-1\\.5.mt-1.flex-wrap');
      expect(labelsContainer).not.toBeInTheDocument();
    });

    it('handles undefined sessions prop', () => {
      const prs = [createMockPR({ number: 1 })];

      // sessions is undefined (not passed)
      render(<PRList {...defaultProps} prs={prs} sessions={undefined} />);

      // Should render without errors and not show session indicators
      expect(screen.getByText('Test PR')).toBeInTheDocument();
      expect(screen.queryByText(/session/)).not.toBeInTheDocument();
    });

    it('handles empty sessions array', () => {
      const prs = [createMockPR({ number: 1 })];

      render(<PRList {...defaultProps} prs={prs} sessions={[]} />);

      expect(screen.getByText('Test PR')).toBeInTheDocument();
      expect(screen.queryByText(/session/)).not.toBeInTheDocument();
    });
  });
});
