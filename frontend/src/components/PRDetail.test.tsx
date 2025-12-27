import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PRDetail } from './PRDetail';
import type { PR, SessionSummary, Process, CommandMetadata } from '../types';

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

function createMockPR(overrides: Partial<PR> = {}): PR {
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
    url: 'https://github.com/test/repo/pull/42',
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
  const defaultProps = {
    pr: createMockPR(),
    prCommands: [createMockCommand()],
    onStartSession: vi.fn(),
    sessions: [],
    processes: [],
    onSelectSession: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders PR title and number', () => {
      render(<PRDetail {...defaultProps} />);

      expect(screen.getByText('#42 Add new feature')).toBeInTheDocument();
    });

    it('renders PR state badge for open PR', () => {
      render(<PRDetail {...defaultProps} />);

      const stateBadge = screen.getByText('open');
      expect(stateBadge).toBeInTheDocument();
      expect(stateBadge).toHaveClass('text-green-400');
    });

    it('renders PR state badge for merged PR', () => {
      const mergedPR = createMockPR({ state: 'merged' });
      render(<PRDetail {...defaultProps} pr={mergedPR} />);

      const stateBadge = screen.getByText('merged');
      expect(stateBadge).toBeInTheDocument();
      expect(stateBadge).toHaveClass('text-purple-400');
    });

    it('renders PR state badge for closed PR', () => {
      const closedPR = createMockPR({ state: 'closed' });
      render(<PRDetail {...defaultProps} pr={closedPR} />);

      const stateBadge = screen.getByText('closed');
      expect(stateBadge).toBeInTheDocument();
      expect(stateBadge).toHaveClass('text-red-400');
    });

    it('renders PR labels', () => {
      render(<PRDetail {...defaultProps} />);

      expect(screen.getByText('enhancement')).toBeInTheDocument();
      expect(screen.getByText('needs-review')).toBeInTheDocument();
    });

    it('renders GitHub link', () => {
      render(<PRDetail {...defaultProps} />);

      const link = screen.getByText('View on GitHub →');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://github.com/test/repo/pull/42');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders branch information', () => {
      render(<PRDetail {...defaultProps} />);

      expect(screen.getByText('feature/new-feature')).toBeInTheDocument();
      expect(screen.getByText('main')).toBeInTheDocument();
    });

    it('renders additions and deletions', () => {
      render(<PRDetail {...defaultProps} />);

      expect(screen.getByText('+150')).toBeInTheDocument();
      expect(screen.getByText('-30')).toBeInTheDocument();
    });

    it('renders changed files count singular', () => {
      const singleFilePR = createMockPR({ changed_files: 1 });
      render(<PRDetail {...defaultProps} pr={singleFilePR} />);

      expect(screen.getByText('1 file changed')).toBeInTheDocument();
    });

    it('renders changed files count plural', () => {
      render(<PRDetail {...defaultProps} />);

      expect(screen.getByText('8 files changed')).toBeInTheDocument();
    });
  });

  describe('PR Description', () => {
    it('renders PR body using Markdown component', () => {
      render(<PRDetail {...defaultProps} />);

      const markdown = screen.getByTestId('markdown');
      expect(markdown).toHaveTextContent('This PR adds a new feature to the application.');
    });

    it('renders placeholder when PR has no body', () => {
      const prWithoutBody = createMockPR({ body: '' });
      render(<PRDetail {...defaultProps} pr={prWithoutBody} />);

      expect(screen.getByText('No description provided.')).toBeInTheDocument();
    });

    it('renders author and creation date', () => {
      render(<PRDetail {...defaultProps} />);

      expect(screen.getByText('testuser')).toBeInTheDocument();
      // Date format depends on locale, but it should be present
      expect(screen.getByText(/Opened by/)).toBeInTheDocument();
    });
  });

  describe('Start Session Button', () => {
    it('renders the start session button', () => {
      render(<PRDetail {...defaultProps} />);

      expect(screen.getByTestId('start-session-btn')).toBeInTheDocument();
    });

    it('calls onStartSession when button is clicked', () => {
      const onStartSession = vi.fn();
      render(<PRDetail {...defaultProps} onStartSession={onStartSession} />);

      fireEvent.click(screen.getByTestId('start-session-btn'));

      expect(onStartSession).toHaveBeenCalledWith(defaultProps.prCommands[0]);
    });
  });

  describe('Related Sessions', () => {
    it('does not render sessions section when no sessions are linked', () => {
      render(<PRDetail {...defaultProps} />);

      expect(screen.queryByText(/Sessions \(/)).not.toBeInTheDocument();
    });

    it('renders sessions section with count when sessions exist', () => {
      const session = createMockSession();
      render(<PRDetail {...defaultProps} sessions={[session]} />);

      expect(screen.getByText('Sessions (1)')).toBeInTheDocument();
    });

    it('renders session titles', () => {
      const session = createMockSession({ title: 'Code Review Session' });
      render(<PRDetail {...defaultProps} sessions={[session]} />);

      expect(screen.getByText('Code Review Session')).toBeInTheDocument();
    });

    it('renders untitled session placeholder', () => {
      const session = createMockSession({ title: null });
      render(<PRDetail {...defaultProps} sessions={[session]} />);

      expect(screen.getByText('Untitled session')).toBeInTheDocument();
    });

    it('filters sessions to only show those linked to this PR', () => {
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
      const issueSession = createMockSession({
        session_id: 'issue-session',
        title: 'Issue Session',
        entities: [{ kind: 'issue', number: 42 }],
      });

      render(
        <PRDetail
          {...defaultProps}
          sessions={[linkedSession, unlinkedSession, issueSession]}
        />
      );

      expect(screen.getByText('Sessions (1)')).toBeInTheDocument();
      expect(screen.getByText('Linked Session')).toBeInTheDocument();
      expect(screen.queryByText('Unlinked Session')).not.toBeInTheDocument();
      expect(screen.queryByText('Issue Session')).not.toBeInTheDocument();
    });

    it('sorts sessions by modified date (newest first)', () => {
      const olderSession = createMockSession({
        session_id: 'older',
        title: 'Older Review',
        modified_at: '2024-01-15T10:00:00Z',
      });
      const newerSession = createMockSession({
        session_id: 'newer',
        title: 'Newer Review',
        modified_at: '2024-01-16T10:00:00Z',
      });

      render(
        <PRDetail
          {...defaultProps}
          sessions={[olderSession, newerSession]}
        />
      );

      // Get all session title elements within the sessions list
      const sessionElements = screen.getAllByText(/Review$/);
      expect(sessionElements[0]).toHaveTextContent('Newer Review');
      expect(sessionElements[1]).toHaveTextContent('Older Review');
    });

    it('calls onSelectSession when session is clicked', () => {
      const session = createMockSession();
      const onSelectSession = vi.fn();
      render(
        <PRDetail
          {...defaultProps}
          sessions={[session]}
          onSelectSession={onSelectSession}
        />
      );

      fireEvent.click(screen.getByText('PR Review Session'));

      expect(onSelectSession).toHaveBeenCalledWith(session);
    });

    it('shows green indicator for completed sessions', () => {
      const session = createMockSession({ is_active: false });
      render(<PRDetail {...defaultProps} sessions={[session]} />);

      const indicator = document.querySelector('.bg-green-500');
      expect(indicator).toBeInTheDocument();
    });

    it('shows pulsing yellow indicator for actively running sessions', () => {
      const session = createMockSession({
        session_id: 'active-session',
        is_active: true,
      });
      const process = createMockProcess({
        claude_session_id: 'active-session',
      });

      render(
        <PRDetail
          {...defaultProps}
          sessions={[session]}
          processes={[process]}
        />
      );

      const indicator = document.querySelector('.bg-yellow-500.animate-pulse');
      expect(indicator).toBeInTheDocument();
    });

    it('shows running process message for active sessions', () => {
      const session = createMockSession({
        session_id: 'active-session',
        is_active: true,
      });
      const process = createMockProcess({
        claude_session_id: 'active-session',
      });

      render(
        <PRDetail
          {...defaultProps}
          sessions={[session]}
          processes={[process]}
        />
      );

      expect(screen.getByText('Process running - click to view')).toBeInTheDocument();
    });
  });

  describe('Multiple Sessions', () => {
    it('renders multiple linked sessions', () => {
      const sessions = [
        createMockSession({
          session_id: 'session-1',
          title: 'First Review',
          modified_at: '2024-01-16T10:00:00Z',
        }),
        createMockSession({
          session_id: 'session-2',
          title: 'Second Review',
          modified_at: '2024-01-17T10:00:00Z',
        }),
        createMockSession({
          session_id: 'session-3',
          title: 'Third Review',
          modified_at: '2024-01-18T10:00:00Z',
        }),
      ];

      render(<PRDetail {...defaultProps} sessions={sessions} />);

      expect(screen.getByText('Sessions (3)')).toBeInTheDocument();
      expect(screen.getByText('First Review')).toBeInTheDocument();
      expect(screen.getByText('Second Review')).toBeInTheDocument();
      expect(screen.getByText('Third Review')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles PR with no labels', () => {
      const prWithoutLabels = createMockPR({ labels: [] });
      render(<PRDetail {...defaultProps} pr={prWithoutLabels} />);

      // Should still render without errors
      expect(screen.getByText('#42 Add new feature')).toBeInTheDocument();
    });

    it('handles empty sessions array', () => {
      render(<PRDetail {...defaultProps} sessions={[]} />);

      expect(screen.queryByText(/Sessions \(/)).not.toBeInTheDocument();
    });

    it('handles session with no entities', () => {
      const sessionWithNoEntities = createMockSession({ entities: [] });
      render(<PRDetail {...defaultProps} sessions={[sessionWithNoEntities]} />);

      // Should not show any sessions since none are linked to this PR
      expect(screen.queryByText(/Sessions \(/)).not.toBeInTheDocument();
    });

    it('handles undefined onSelectSession', () => {
      const session = createMockSession();
      render(
        <PRDetail
          {...defaultProps}
          sessions={[session]}
          onSelectSession={undefined}
        />
      );

      // Should not throw when clicking
      fireEvent.click(screen.getByText('PR Review Session'));
    });
  });

  describe('Accessibility', () => {
    it('has accessible GitHub link', () => {
      render(<PRDetail {...defaultProps} />);

      const link = screen.getByText('View on GitHub →');
      expect(link.tagName).toBe('A');
    });

    it('has clickable session items', () => {
      const session = createMockSession();
      render(<PRDetail {...defaultProps} sessions={[session]} />);

      // Find the session item container with cursor-pointer class
      const sessionItem = screen.getByText('PR Review Session').closest('.cursor-pointer');
      expect(sessionItem).toBeInTheDocument();
    });
  });
});
