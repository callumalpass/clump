import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainContentArea, type MainContentAreaProps, type Tab } from './MainContentArea';
import type { Repo, Issue, PR, SessionSummary, Process, CommandsResponse, Tag } from '../types';

// Mock the child components to simplify testing
vi.mock('./IssueDetail', () => ({
  IssueDetail: ({ issueNumber }: { issueNumber: number }) => (
    <div data-testid="issue-detail">Issue #{issueNumber}</div>
  ),
}));

vi.mock('./IssueCreateView', () => ({
  IssueCreateView: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="issue-create-view">
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

vi.mock('./PRDetail', () => ({
  PRDetail: ({ prNumber }: { prNumber: number }) => (
    <div data-testid="pr-detail">PR #{prNumber}</div>
  ),
}));

vi.mock('./ScheduleDetail', () => ({
  ScheduleDetail: ({ scheduleId }: { scheduleId: number }) => (
    <div data-testid="schedule-detail">Schedule #{scheduleId}</div>
  ),
}));

vi.mock('./SessionPanel', () => ({
  SessionPanel: ({ emptyStateVariant }: { emptyStateVariant?: string }) => (
    <div data-testid="session-panel">Session Panel ({emptyStateVariant})</div>
  ),
}));

// Mock react-resizable-panels
vi.mock('react-resizable-panels', () => ({
  Group: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="panel-group" className={className}>{children}</div>
  ),
  Panel: ({ children, className, panelRef }: { children: React.ReactNode; className?: string; panelRef?: React.Ref<unknown> }) => (
    <div data-testid="panel" className={className}>{children}</div>
  ),
  Separator: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="resize-handle" className={className}>{children}</div>
  ),
}));

// Helper factories
function createMockRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 1,
    name: 'test-repo',
    owner: 'test-owner',
    full_name: 'test-owner/test-repo',
    local_path: '/path/to/repo',
    encoded_path: 'encoded-path',
    github_url: 'https://github.com/test-owner/test-repo',
    ...overrides,
  };
}

function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: 'Test Issue',
    body: 'Test body',
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

function createMockPR(overrides: Partial<PR> = {}): PR {
  return {
    number: 1,
    title: 'Test PR',
    body: 'Test body',
    state: 'open',
    labels: [],
    author: 'testuser',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    url: 'https://github.com/test/repo/pull/1',
    head_ref: 'feature-branch',
    base_ref: 'main',
    draft: false,
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

function createMockCommands(): CommandsResponse {
  return {
    issue: [
      { id: 'fix', name: 'Fix Issue', shortName: 'Fix', description: 'Fix this issue', category: 'issue', template: 'Fix #{{number}}', source: 'builtin' },
    ],
    pr: [
      { id: 'review', name: 'Review PR', shortName: 'Review', description: 'Review this PR', category: 'pr', template: 'Review PR #{{number}}', source: 'builtin' },
    ],
    schedule: [],
    general: [],
  };
}

function createDefaultProps(overrides: Partial<MainContentAreaProps> = {}): MainContentAreaProps {
  return {
    layoutMode: 'empty',
    activeTab: 'issues',
    listEmpty: false,
    selectedRepo: null,
    selectedIssue: null,
    selectedPR: null,
    selectedSchedule: null,
    activeIssueNumber: null,
    activePRNumber: null,
    issuePanelCollapsed: false,
    onIssuePanelCollapsedChange: vi.fn(),
    issues: [],
    prs: [],
    sessions: [],
    openSessions: [],
    processes: [],
    commands: createMockCommands(),
    tags: [],
    issueTagsMap: {},
    activeTabSessionId: null,
    activeProcessId: null,
    viewingSessionId: null,
    sessionViewModes: {},
    onStartIssueSession: vi.fn(),
    onSelectSession: vi.fn(),
    onContinueSession: vi.fn(),
    onAddTagToIssue: vi.fn(),
    onRemoveTagFromIssue: vi.fn(),
    onCreateTag: vi.fn(),
    onStartPRSession: vi.fn(),
    onScheduleDeleted: vi.fn(),
    onScheduleUpdated: vi.fn(),
    onCancelIssueCreate: vi.fn(),
    onIssueCreated: vi.fn(),
    onSelectSessionTab: vi.fn(),
    onCloseSessionTab: vi.fn(),
    onNewSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onUpdateSessionTitle: vi.fn(),
    onCloseViewingSession: vi.fn(),
    onSetViewMode: vi.fn(),
    onKillProcess: vi.fn(),
    onKillSession: vi.fn(),
    onClearActiveProcess: vi.fn(),
    onShowIssue: vi.fn(),
    onShowPR: vi.fn(),
    onShowSchedule: vi.fn(),
    onEntitiesChange: vi.fn(),
    needsAttention: vi.fn(),
    onRefreshIssues: vi.fn(),
    onTabChange: vi.fn(),
    ...overrides,
  };
}

describe('MainContentArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty State', () => {
    const repo = createMockRepo();

    describe('Simplified Empty State (list has items)', () => {
      it('renders simplified empty state when list has items but nothing selected', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: false, activeTab: 'issues', selectedRepo: repo })} />);

        expect(screen.getByText('Select an issue to view details')).toBeInTheDocument();
        expect(screen.getByText('or start a session to work on it')).toBeInTheDocument();
      });

      it('shows context-specific message for PRs tab', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: false, activeTab: 'prs', selectedRepo: repo })} />);

        expect(screen.getByText('Select a pull request to view details')).toBeInTheDocument();
        expect(screen.getByText('or start a session to review it')).toBeInTheDocument();
      });

      it('shows context-specific message for History tab', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: false, activeTab: 'history', selectedRepo: repo })} />);

        expect(screen.getByText('Select a session to view details')).toBeInTheDocument();
        expect(screen.getByText('browse past sessions and their transcripts')).toBeInTheDocument();
      });

      it('shows context-specific message for Schedules tab', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: false, activeTab: 'schedules', selectedRepo: repo })} />);

        expect(screen.getByText('Select a schedule to view details')).toBeInTheDocument();
        expect(screen.getByText('manage automated sessions')).toBeInTheDocument();
      });

      it('does not show keyboard shortcut hints in simplified empty state', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: false, selectedRepo: repo })} />);

        expect(screen.queryByText('Command palette')).not.toBeInTheDocument();
        expect(screen.queryByText('All shortcuts')).not.toBeInTheDocument();
      });
    });

    describe('Full Empty State (list is empty)', () => {
      it('renders full empty state when list is empty', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, activeTab: 'issues', selectedRepo: repo })} />);

        expect(screen.getByText('No issues to display')).toBeInTheDocument();
        expect(screen.getByText('Check your filters or switch to a different state')).toBeInTheDocument();
      });

      it('shows different messages for empty PRs list', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, activeTab: 'prs', selectedRepo: repo })} />);

        expect(screen.getByText('No pull requests to display')).toBeInTheDocument();
      });

      it('shows different messages for empty History list', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, activeTab: 'history', selectedRepo: repo })} />);

        expect(screen.getByText('No sessions yet')).toBeInTheDocument();
      });

      it('shows different messages for empty Schedules list', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, activeTab: 'schedules', selectedRepo: repo })} />);

        expect(screen.getByText('No schedules yet')).toBeInTheDocument();
        expect(screen.getByText('Create a schedule to automate recurring tasks')).toBeInTheDocument();
      });

      it('shows keyboard shortcut hints in full empty state', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, selectedRepo: repo })} />);

        expect(screen.getByText('Command palette')).toBeInTheDocument();
        expect(screen.getByText('All shortcuts')).toBeInTheDocument();
      });

      it('renders quick navigation buttons', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, selectedRepo: repo })} />);

        expect(screen.getByRole('button', { name: /Issues/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /PRs/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /History/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Schedules/i })).toBeInTheDocument();
      });

      it('highlights current tab in quick navigation', () => {
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, activeTab: 'issues', selectedRepo: repo })} />);

        const issuesButton = screen.getByRole('button', { name: /Issues/i });
        expect(issuesButton).toHaveAttribute('aria-current', 'page');
        expect(issuesButton).toBeDisabled();
      });

      it('calls onTabChange when clicking navigation buttons', () => {
        const onTabChange = vi.fn();
        render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, onTabChange, selectedRepo: repo })} />);

        fireEvent.click(screen.getByRole('button', { name: /PRs/i }));

        expect(onTabChange).toHaveBeenCalledWith('prs');
      });
    });
  });

  describe('Layout Modes', () => {
    describe('issue-sessions layout', () => {
      it('renders issue detail with session panel side by side', () => {
        const repo = createMockRepo();
        const issues = [createMockIssue({ number: 42 })];

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'issue-sessions',
          selectedRepo: repo,
          activeIssueNumber: 42,
          issues,
        })} />);

        expect(screen.getByTestId('issue-detail')).toBeInTheDocument();
        expect(screen.getByText('Issue #42')).toBeInTheDocument();
        expect(screen.getByTestId('session-panel')).toBeInTheDocument();
      });

      it('renders context panel header for issue', () => {
        const repo = createMockRepo();
        const issues = [createMockIssue({ number: 1 })];

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'issue-sessions',
          selectedRepo: repo,
          activeIssueNumber: 1,
          issues,
          issuePanelCollapsed: false,
        })} />);

        expect(screen.getByText('Issue Context')).toBeInTheDocument();
      });

      it('calls onIssuePanelCollapsedChange when collapse button clicked', () => {
        const onIssuePanelCollapsedChange = vi.fn();
        const repo = createMockRepo();
        const issues = [createMockIssue({ number: 1 })];

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'issue-sessions',
          selectedRepo: repo,
          activeIssueNumber: 1,
          issues,
          issuePanelCollapsed: false,
          onIssuePanelCollapsedChange,
        })} />);

        const collapseButton = screen.getByRole('button', { name: /collapse issue context panel/i });
        fireEvent.click(collapseButton);

        expect(onIssuePanelCollapsedChange).toHaveBeenCalledWith(true);
      });
    });

    describe('pr-sessions layout', () => {
      it('renders PR detail with session panel side by side', () => {
        const repo = createMockRepo();
        const prs = [createMockPR({ number: 123 })];

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'pr-sessions',
          selectedRepo: repo,
          activePRNumber: 123,
          prs,
        })} />);

        expect(screen.getByTestId('pr-detail')).toBeInTheDocument();
        expect(screen.getByText('PR #123')).toBeInTheDocument();
        expect(screen.getByTestId('session-panel')).toBeInTheDocument();
      });

      it('renders context panel header for PR', () => {
        const repo = createMockRepo();
        const prs = [createMockPR({ number: 1 })];

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'pr-sessions',
          selectedRepo: repo,
          activePRNumber: 1,
          prs,
          issuePanelCollapsed: false,
        })} />);

        expect(screen.getByText('PR Context')).toBeInTheDocument();
      });
    });

    describe('schedule-sessions layout', () => {
      it('renders schedule detail with session panel', () => {
        const repo = createMockRepo();

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'schedule-sessions',
          selectedRepo: repo,
          selectedSchedule: 5,
        })} />);

        expect(screen.getByTestId('schedule-detail')).toBeInTheDocument();
        expect(screen.getByText('Schedule #5')).toBeInTheDocument();
        expect(screen.getByTestId('session-panel')).toBeInTheDocument();
      });
    });

    describe('issue-only layout', () => {
      it('renders only issue detail without session panel', () => {
        const repo = createMockRepo();
        const issues = [createMockIssue({ number: 7 })];

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'issue-only',
          selectedRepo: repo,
          selectedIssue: 7,
          issues,
        })} />);

        expect(screen.getByTestId('issue-detail')).toBeInTheDocument();
        expect(screen.getByText('Issue #7')).toBeInTheDocument();
        expect(screen.queryByTestId('session-panel')).not.toBeInTheDocument();
      });
    });

    describe('pr-only layout', () => {
      it('renders only PR detail without session panel', () => {
        const repo = createMockRepo();
        const prs = [createMockPR({ number: 99 })];

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'pr-only',
          selectedRepo: repo,
          selectedPR: 99,
          prs,
        })} />);

        expect(screen.getByTestId('pr-detail')).toBeInTheDocument();
        expect(screen.getByText('PR #99')).toBeInTheDocument();
        expect(screen.queryByTestId('session-panel')).not.toBeInTheDocument();
      });
    });

    describe('schedule-only layout', () => {
      it('renders only schedule detail without session panel', () => {
        const repo = createMockRepo();

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'schedule-only',
          selectedRepo: repo,
          selectedSchedule: 3,
        })} />);

        expect(screen.getByTestId('schedule-detail')).toBeInTheDocument();
        expect(screen.getByText('Schedule #3')).toBeInTheDocument();
        expect(screen.queryByTestId('session-panel')).not.toBeInTheDocument();
      });
    });

    describe('sessions-only layout', () => {
      it('renders only session panel', () => {
        const repo = createMockRepo();
        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'sessions-only',
          selectedRepo: repo,
        })} />);

        expect(screen.getByTestId('session-panel')).toBeInTheDocument();
        expect(screen.queryByTestId('issue-detail')).not.toBeInTheDocument();
        expect(screen.queryByTestId('pr-detail')).not.toBeInTheDocument();
      });
    });

    describe('issue-create layout', () => {
      it('renders issue creation form', () => {
        const repo = createMockRepo();

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'issue-create',
          selectedRepo: repo,
        })} />);

        expect(screen.getByTestId('issue-create-view')).toBeInTheDocument();
      });

      it('does not render issue create view without selected repo', () => {
        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'issue-create',
          selectedRepo: null,
        })} />);

        expect(screen.queryByTestId('issue-create-view')).not.toBeInTheDocument();
      });

      it('calls onCancelIssueCreate when cancel clicked', () => {
        const onCancelIssueCreate = vi.fn();
        const repo = createMockRepo();

        render(<MainContentArea {...createDefaultProps({
          layoutMode: 'issue-create',
          selectedRepo: repo,
          onCancelIssueCreate,
        })} />);

        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

        expect(onCancelIssueCreate).toHaveBeenCalled();
      });
    });
  });

  describe('Collapsible Context Panel', () => {
    it('shows collapsed state with vertical label when collapsed', () => {
      const repo = createMockRepo();
      const issues = [createMockIssue({ number: 1 })];

      render(<MainContentArea {...createDefaultProps({
        layoutMode: 'issue-sessions',
        selectedRepo: repo,
        activeIssueNumber: 1,
        issues,
        issuePanelCollapsed: true,
      })} />);

      // Should show expand button and vertical "Issue" label
      expect(screen.getByRole('button', { name: /expand issue context panel/i })).toBeInTheDocument();
    });

    it('shows PR label when collapsed in PR context', () => {
      const repo = createMockRepo();
      const prs = [createMockPR({ number: 1 })];

      render(<MainContentArea {...createDefaultProps({
        layoutMode: 'pr-sessions',
        selectedRepo: repo,
        activePRNumber: 1,
        prs,
        issuePanelCollapsed: true,
      })} />);

      // Should show expand button for PR context
      expect(screen.getByRole('button', { name: /expand pr context panel/i })).toBeInTheDocument();
    });
  });

  describe('Resize Handle', () => {
    it('renders resize handle between panels', () => {
      const repo = createMockRepo();
      const issues = [createMockIssue({ number: 1 })];

      render(<MainContentArea {...createDefaultProps({
        layoutMode: 'issue-sessions',
        selectedRepo: repo,
        activeIssueNumber: 1,
        issues,
      })} />);

      expect(screen.getByTestId('resize-handle')).toBeInTheDocument();
    });

    it('has proper styling classes', () => {
      const repo = createMockRepo();
      const issues = [createMockIssue({ number: 1 })];

      render(<MainContentArea {...createDefaultProps({
        layoutMode: 'issue-sessions',
        selectedRepo: repo,
        activeIssueNumber: 1,
        issues,
      })} />);

      const handle = screen.getByTestId('resize-handle');
      expect(handle).toHaveClass('resize-handle');
    });
  });

  describe('Keyboard Hints', () => {
    const repo = createMockRepo();

    it('renders keyboard hint badges in full empty state', () => {
      render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, selectedRepo: repo })} />);

      // Check for keyboard shortcut badges
      const kbdElements = document.querySelectorAll('.kbd-hint');
      expect(kbdElements.length).toBeGreaterThan(0);
    });

    it('displays shortcut numbers for tab navigation', () => {
      render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: true, selectedRepo: repo })} />);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  describe('Icon Rendering', () => {
    const repo = createMockRepo();

    it('renders issue icon in empty state for issues tab', () => {
      const { container } = render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: false, activeTab: 'issues', selectedRepo: repo })} />);

      // Issue icon has a circle with stroke
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders clock icon in empty state for history tab', () => {
      const { container } = render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: false, activeTab: 'history', selectedRepo: repo })} />);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders calendar icon in empty state for schedules tab', () => {
      const { container } = render(<MainContentArea {...createDefaultProps({ layoutMode: 'empty', listEmpty: false, activeTab: 'schedules', selectedRepo: repo })} />);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });
});
