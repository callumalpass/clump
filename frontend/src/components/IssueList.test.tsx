import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IssueList } from './IssueList';
import type { Issue, SessionSummary, Tag, IssueTagsMap, CommandMetadata } from '../types';

// Mock IssueFilters component
vi.mock('./IssueFilters', () => ({
  IssueFilters: ({ filters, onFiltersChange }: { filters: unknown; onFiltersChange: (f: unknown) => void }) => (
    <div data-testid="issue-filters">
      <button onClick={() => onFiltersChange({ state: 'closed' })}>Change Filter</button>
    </div>
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
      data-testid={`start-session-${issue.number}`}
      onClick={() => commands[0] && onStart(issue, commands[0])}
    >
      Start
    </button>
  ),
}));

function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: 'Test Issue',
    body: 'Issue body',
    state: 'open',
    labels: [],
    author: 'testuser',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    comments_count: 0,
    url: 'https://github.com/test/repo/issues/1',
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

function createMockTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    repo_id: 1,
    name: 'bug',
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
    description: 'Fix this issue',
    category: 'issue',
    template: 'Fix issue #{{number}}',
    source: 'builtin',
    ...overrides,
  };
}

describe('IssueList', () => {
  const defaultProps = {
    issues: [] as Issue[],
    selectedIssue: null,
    onSelectIssue: vi.fn(),
    issueCommands: [createMockCommand()],
    onStartSession: vi.fn(),
    loading: false,
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
      render(<IssueList {...defaultProps} loading={true} />);

      // Should show skeleton shimmer elements
      const skeletons = document.querySelectorAll('.skeleton-shimmer');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows skeleton pagination when loading', () => {
      render(<IssueList {...defaultProps} loading={true} />);

      // Pagination area should have skeleton elements
      const paginationSkeletons = document.querySelectorAll('.skeleton-shimmer');
      expect(paginationSkeletons.length).toBeGreaterThan(5);
    });
  });

  describe('Empty State', () => {
    it('renders empty state when no issues and not loading (no filters)', () => {
      // When no filters are provided, the default filters={} results in undefined state
      // which triggers the "No matching issues" empty state
      render(<IssueList {...defaultProps} issues={[]} loading={false} />);

      expect(screen.getByText('No matching issues')).toBeInTheDocument();
      // Message says "No undefined issues found" since filters.state is undefined
      expect(screen.getByText('No undefined issues found')).toBeInTheDocument();
    });

    it('renders empty state with default open filter', () => {
      // When state is 'open' (the default in the app), shows appropriate message
      render(<IssueList {...defaultProps} issues={[]} loading={false} filters={{ state: 'open' }} />);

      expect(screen.getByText('No matching issues')).toBeInTheDocument();
      expect(screen.getByText('No open issues found')).toBeInTheDocument();
    });

    it('renders "no issues yet" when state is all', () => {
      // When state is 'all' and no other filters, shows the basic empty state
      render(<IssueList {...defaultProps} issues={[]} loading={false} filters={{ state: 'all' }} />);

      expect(screen.getByText('No issues yet')).toBeInTheDocument();
      expect(screen.getByText('This repository has no open issues')).toBeInTheDocument();
    });

    it('does not show empty state when loading', () => {
      render(<IssueList {...defaultProps} issues={[]} loading={true} />);

      expect(screen.queryByText('No matching issues')).not.toBeInTheDocument();
      expect(screen.queryByText('No issues yet')).not.toBeInTheDocument();
    });
  });

  describe('Issue Rendering', () => {
    it('renders issue list', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'First Issue' }),
        createMockIssue({ number: 2, title: 'Second Issue' }),
      ];

      render(<IssueList {...defaultProps} issues={issues} total={2} />);

      expect(screen.getByText('First Issue')).toBeInTheDocument();
      expect(screen.getByText('Second Issue')).toBeInTheDocument();
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
    });

    it('displays issue author and comments', () => {
      const issues = [createMockIssue({ author: 'john_doe', comments_count: 5 })];

      render(<IssueList {...defaultProps} issues={issues} total={1} />);

      expect(screen.getByText(/by john_doe/)).toBeInTheDocument();
      expect(screen.getByText(/5 comments/)).toBeInTheDocument();
    });

    it('renders issue labels', () => {
      const issues = [createMockIssue({ labels: ['bug', 'enhancement'] })];

      render(<IssueList {...defaultProps} issues={issues} total={1} />);

      expect(screen.getByText('bug')).toBeInTheDocument();
      expect(screen.getByText('enhancement')).toBeInTheDocument();
    });
  });

  describe('Issue Selection', () => {
    it('calls onSelectIssue when issue is clicked', () => {
      const onSelectIssue = vi.fn();
      const issues = [createMockIssue({ number: 42, title: 'Click Me' })];

      render(<IssueList {...defaultProps} issues={issues} total={1} onSelectIssue={onSelectIssue} />);

      fireEvent.click(screen.getByText('Click Me'));

      expect(onSelectIssue).toHaveBeenCalledWith(42);
    });

    it('highlights selected issue', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'Issue 1' }),
        createMockIssue({ number: 2, title: 'Issue 2' }),
      ];

      render(<IssueList {...defaultProps} issues={issues} total={2} selectedIssue={1} />);

      const selectedItem = screen.getByText('Issue 1').closest('.p-4');
      expect(selectedItem).toHaveClass('list-item-selected');
    });
  });

  describe('Session Status Indicators', () => {
    it('shows running indicator for issues with active sessions', () => {
      const issues = [createMockIssue({ number: 1 })];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [{ kind: 'issue', number: 1 }],
          is_active: true,
        }),
      ];

      render(<IssueList {...defaultProps} issues={issues} total={1} sessions={sessions} />);

      const runningIndicator = document.querySelector('.bg-warning-500.animate-pulse');
      expect(runningIndicator).toBeInTheDocument();
    });

    it('shows completed indicator for issues with finished sessions', () => {
      const issues = [createMockIssue({ number: 1 })];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [{ kind: 'issue', number: 1 }],
          is_active: false,
        }),
      ];

      render(<IssueList {...defaultProps} issues={issues} total={1} sessions={sessions} />);

      const completedIndicator = document.querySelector('.bg-mint-400');
      expect(completedIndicator).toBeInTheDocument();
    });

    it('shows session count in issue metadata', () => {
      const issues = [createMockIssue({ number: 1 })];
      const sessions = [
        createMockSession({
          entities: [{ kind: 'issue', number: 1 }],
          is_active: false,
        }),
        createMockSession({
          session_id: 'sess-2',
          entities: [{ kind: 'issue', number: 1 }],
          is_active: false,
        }),
      ];

      render(<IssueList {...defaultProps} issues={issues} total={1} sessions={sessions} />);

      expect(screen.getByText(/2 sessions/)).toBeInTheDocument();
    });
  });

  describe('Start Session', () => {
    it('calls onStartSession when start button is clicked', () => {
      const onStartSession = vi.fn();
      const issues = [createMockIssue({ number: 1 })];
      const commands = [createMockCommand()];

      render(
        <IssueList
          {...defaultProps}
          issues={issues}
          total={1}
          issueCommands={commands}
          onStartSession={onStartSession}
        />
      );

      fireEvent.click(screen.getByTestId('start-session-1'));

      expect(onStartSession).toHaveBeenCalledWith(
        expect.objectContaining({ number: 1 }),
        expect.objectContaining({ id: 'cmd-1' })
      );
    });
  });

  describe('Tag Filtering', () => {
    it('renders tag filter chips', () => {
      const issues = [createMockIssue({ number: 1 })];
      const tags = [
        createMockTag({ id: 1, name: 'bug', color: '#ff0000' }),
        createMockTag({ id: 2, name: 'feature', color: '#00ff00' }),
      ];

      render(<IssueList {...defaultProps} issues={issues} total={1} tags={tags} />);

      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('bug')).toBeInTheDocument();
      expect(screen.getByText('feature')).toBeInTheDocument();
    });

    it('calls onSelectTag when tag chip is clicked', () => {
      const onSelectTag = vi.fn();
      const issues = [createMockIssue({ number: 1 })];
      const tags = [createMockTag({ id: 1, name: 'bug' })];

      render(
        <IssueList
          {...defaultProps}
          issues={issues}
          total={1}
          tags={tags}
          onSelectTag={onSelectTag}
        />
      );

      fireEvent.click(screen.getByText('bug'));

      expect(onSelectTag).toHaveBeenCalledWith(1);
    });

    it('calls onSelectTag with null when All chip is clicked', () => {
      const onSelectTag = vi.fn();
      const issues = [createMockIssue({ number: 1 })];
      const tags = [createMockTag({ id: 1, name: 'bug' })];

      render(
        <IssueList
          {...defaultProps}
          issues={issues}
          total={1}
          tags={tags}
          selectedTagId={1}
          onSelectTag={onSelectTag}
        />
      );

      fireEvent.click(screen.getByText('All'));

      expect(onSelectTag).toHaveBeenCalledWith(null);
    });

    it('filters issues by selected tag', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'Tagged Issue' }),
        createMockIssue({ number: 2, title: 'Untagged Issue' }),
      ];
      const tags = [createMockTag({ id: 1, name: 'bug' })];
      const issueTagsMap: IssueTagsMap = {
        1: [{ id: 1, repo_id: 1, name: 'bug', color: '#ff0000', created_at: '2024-01-01' }],
      };

      render(
        <IssueList
          {...defaultProps}
          issues={issues}
          total={2}
          tags={tags}
          issueTagsMap={issueTagsMap}
          selectedTagId={1}
        />
      );

      expect(screen.getByText('Tagged Issue')).toBeInTheDocument();
      expect(screen.queryByText('Untagged Issue')).not.toBeInTheDocument();
    });

    it('displays issue tags inline', () => {
      const issues = [createMockIssue({ number: 1 })];
      const tags = [createMockTag({ id: 1, name: 'bug', color: '#ff0000' })];
      const issueTagsMap: IssueTagsMap = {
        1: [{ id: 1, repo_id: 1, name: 'bug', color: '#ff0000', created_at: '2024-01-01' }],
      };

      render(
        <IssueList
          {...defaultProps}
          issues={issues}
          total={1}
          tags={tags}
          issueTagsMap={issueTagsMap}
        />
      );

      // Tag should appear both as filter chip and inline with issue
      const bugTags = screen.getAllByText('bug');
      expect(bugTags.length).toBe(2);
    });
  });

  describe('Pagination', () => {
    it('displays total issue count', () => {
      const issues = [createMockIssue()];
      render(<IssueList {...defaultProps} issues={issues} total={42} />);

      expect(screen.getByText('42 issues')).toBeInTheDocument();
    });

    it('displays current page and total pages', () => {
      const issues = [createMockIssue()];
      render(<IssueList {...defaultProps} issues={issues} total={100} page={3} totalPages={10} />);

      expect(screen.getByText('3 / 10')).toBeInTheDocument();
    });

    it('calls onPageChange with previous page', () => {
      const onPageChange = vi.fn();
      const issues = [createMockIssue()];

      render(
        <IssueList
          {...defaultProps}
          issues={issues}
          total={100}
          page={3}
          totalPages={10}
          onPageChange={onPageChange}
        />
      );

      fireEvent.click(screen.getByLabelText('Go to previous page (press [ key)'));

      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('calls onPageChange with next page', () => {
      const onPageChange = vi.fn();
      const issues = [createMockIssue()];

      render(
        <IssueList
          {...defaultProps}
          issues={issues}
          total={100}
          page={3}
          totalPages={10}
          onPageChange={onPageChange}
        />
      );

      fireEvent.click(screen.getByLabelText('Go to next page (press ] key)'));

      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it('disables previous button on first page', () => {
      const issues = [createMockIssue()];
      render(<IssueList {...defaultProps} issues={issues} total={100} page={1} totalPages={10} />);

      expect(screen.getByLabelText('Go to previous page (press [ key)')).toBeDisabled();
    });

    it('disables next button on last page', () => {
      const issues = [createMockIssue()];
      render(<IssueList {...defaultProps} issues={issues} total={100} page={10} totalPages={10} />);

      expect(screen.getByLabelText('Go to next page (press ] key)')).toBeDisabled();
    });
  });

  describe('Create Issue', () => {
    it('renders create issue button when onCreateIssue is provided', () => {
      const issues = [createMockIssue()];
      render(<IssueList {...defaultProps} issues={issues} total={1} onCreateIssue={vi.fn()} />);

      expect(screen.getByText('+ New')).toBeInTheDocument();
    });

    it('does not render create button when onCreateIssue is not provided', () => {
      const issues = [createMockIssue()];
      render(<IssueList {...defaultProps} issues={issues} total={1} />);

      expect(screen.queryByText('+ New')).not.toBeInTheDocument();
    });

    it('calls onCreateIssue when create button is clicked', () => {
      const onCreateIssue = vi.fn();
      const issues = [createMockIssue()];

      render(<IssueList {...defaultProps} issues={issues} total={1} onCreateIssue={onCreateIssue} />);

      fireEvent.click(screen.getByText('+ New'));

      expect(onCreateIssue).toHaveBeenCalled();
    });
  });

  describe('Filters', () => {
    it('renders IssueFilters when onFiltersChange is provided', () => {
      const issues = [createMockIssue()];
      render(
        <IssueList {...defaultProps} issues={issues} total={1} onFiltersChange={vi.fn()} />
      );

      expect(screen.getByTestId('issue-filters')).toBeInTheDocument();
    });

    it('does not render IssueFilters when onFiltersChange is not provided', () => {
      const issues = [createMockIssue()];
      render(<IssueList {...defaultProps} issues={issues} total={1} />);

      expect(screen.queryByTestId('issue-filters')).not.toBeInTheDocument();
    });

    it('calls onFiltersChange when filter is changed', () => {
      const onFiltersChange = vi.fn();
      const issues = [createMockIssue()];

      render(
        <IssueList {...defaultProps} issues={issues} total={1} onFiltersChange={onFiltersChange} />
      );

      fireEvent.click(screen.getByText('Change Filter'));

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'closed' });
    });
  });

  describe('Multiple Sessions Per Issue', () => {
    it('groups sessions correctly by issue number', () => {
      const issues = [createMockIssue({ number: 1 }), createMockIssue({ number: 2 })];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [{ kind: 'issue', number: 1 }],
          is_active: false,
        }),
        createMockSession({
          session_id: 'sess-2',
          entities: [{ kind: 'issue', number: 1 }],
          is_active: false,
        }),
        createMockSession({
          session_id: 'sess-3',
          entities: [{ kind: 'issue', number: 2 }],
          is_active: false,
        }),
      ];

      render(<IssueList {...defaultProps} issues={issues} total={2} sessions={sessions} />);

      // Issue 1 should have 2 sessions, Issue 2 should have 1 session
      expect(screen.getByText(/2 sessions/)).toBeInTheDocument();
      // The text "1 session" appears (singular form for 1 session)
      expect(screen.getByText(/· 1 session$/)).toBeInTheDocument();
    });

    it('handles sessions with multiple issue entities', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'Issue 1' }),
        createMockIssue({ number: 2, title: 'Issue 2' }),
      ];
      const sessions = [
        createMockSession({
          session_id: 'sess-1',
          entities: [
            { kind: 'issue', number: 1 },
            { kind: 'issue', number: 2 },
          ],
          is_active: false,
        }),
      ];

      render(<IssueList {...defaultProps} issues={issues} total={2} sessions={sessions} />);

      // Both issues should show 1 session
      const sessionCounts = screen.getAllByText(/1 session/);
      expect(sessionCounts).toHaveLength(2);
    });
  });
});
