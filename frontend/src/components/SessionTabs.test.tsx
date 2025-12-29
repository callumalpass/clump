import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionTabs } from './SessionTabs';
import type { SessionSummary, Process } from '../types';

// Mock the ElapsedTimer component to avoid timing issues in tests
vi.mock('./ElapsedTimer', () => ({
  ElapsedTimer: ({ startTime, className }: { startTime: string; className?: string }) => (
    <span data-testid="elapsed-timer" className={className}>{startTime}</span>
  ),
}));

// Mock matchMedia for prefers-reduced-motion detection
const createMatchMediaMock = (matches: boolean) => ({
  matches,
  media: '',
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

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

function createMockProcess(overrides: Partial<Process> = {}): Process {
  return {
    id: 'proc-1',
    working_dir: '/home/user/projects/test',
    created_at: '2024-01-15T10:30:00Z',
    session_id: 1,
    claude_session_id: 'session-1',
    ...overrides,
  };
}

describe('SessionTabs', () => {
  const defaultProps = {
    sessions: [] as SessionSummary[],
    processes: [] as Process[],
    activeSessionId: null,
    onSelectSession: vi.fn(),
    onCloseSession: vi.fn(),
    onNewSession: vi.fn(),
  };

  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    // Save original and setup mock for window.matchMedia
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue(createMatchMediaMock(false));
  });

  afterEach(() => {
    // Restore original
    window.matchMedia = originalMatchMedia;
  });

  it('renders empty state with new session button', () => {
    render(<SessionTabs {...defaultProps} />);

    expect(screen.getByRole('button', { name: /create new session/i })).toBeInTheDocument();
  });

  it('renders session tabs', () => {
    const sessions = [
      createMockSession({ session_id: 'session-1', title: 'First Session' }),
      createMockSession({ session_id: 'session-2', title: 'Second Session' }),
    ];

    render(<SessionTabs {...defaultProps} sessions={sessions} />);

    expect(screen.getByText('First Session')).toBeInTheDocument();
    expect(screen.getByText('Second Session')).toBeInTheDocument();
  });

  it('truncates long session titles', () => {
    const longTitle = 'This is a very long session title that should be truncated';
    const sessions = [createMockSession({ title: longTitle })];

    render(<SessionTabs {...defaultProps} sessions={sessions} />);

    // Title should be truncated with ellipsis
    const truncatedText = screen.getByText(/This is a very long session/);
    expect(truncatedText.textContent?.endsWith('...')).toBe(true);
  });

  it('uses "Untitled" for sessions without a title', () => {
    const sessions = [createMockSession({ title: null })];

    render(<SessionTabs {...defaultProps} sessions={sessions} />);

    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('highlights active session tab', () => {
    const sessions = [
      createMockSession({ session_id: 'session-1', title: 'Session 1' }),
      createMockSession({ session_id: 'session-2', title: 'Session 2' }),
    ];

    render(
      <SessionTabs
        {...defaultProps}
        sessions={sessions}
        activeSessionId="session-1"
      />
    );

    const activeTab = screen.getByText('Session 1').closest('[role="tab"]');
    // Active tab has white text color (not gray-400)
    expect(activeTab).toHaveClass('text-white');
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onSelectSession when tab is clicked', () => {
    const onSelectSession = vi.fn();
    const sessions = [createMockSession({ session_id: 'session-1', title: 'Click Me' })];

    render(
      <SessionTabs
        {...defaultProps}
        sessions={sessions}
        onSelectSession={onSelectSession}
      />
    );

    fireEvent.click(screen.getByText('Click Me'));

    expect(onSelectSession).toHaveBeenCalledWith('session-1');
  });

  it('calls onCloseSession when close button is clicked', () => {
    const onCloseSession = vi.fn();
    const onSelectSession = vi.fn();
    const sessions = [createMockSession({ session_id: 'session-1', title: 'Session 1' })];

    render(
      <SessionTabs
        {...defaultProps}
        sessions={sessions}
        onCloseSession={onCloseSession}
        onSelectSession={onSelectSession}
      />
    );

    const closeButton = screen.getByRole('button', { name: /close session 1/i });
    fireEvent.click(closeButton);

    expect(onCloseSession).toHaveBeenCalledWith('session-1');
    // Should not select the session when closing
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it('calls onNewSession when new session button is clicked', () => {
    const onNewSession = vi.fn();

    render(<SessionTabs {...defaultProps} onNewSession={onNewSession} />);

    fireEvent.click(screen.getByRole('button', { name: /create new session/i }));

    expect(onNewSession).toHaveBeenCalled();
  });

  it('shows running indicator for active sessions with processes', () => {
    const sessions = [
      createMockSession({
        session_id: 'session-1',
        title: 'Running Session',
        is_active: true,
      }),
    ];
    const processes = [
      createMockProcess({
        claude_session_id: 'session-1',
        created_at: '2024-01-15T10:30:00Z',
      }),
    ];

    render(
      <SessionTabs
        {...defaultProps}
        sessions={sessions}
        processes={processes}
      />
    );

    // Should show the pulsing indicator (blurple-400 background for running sessions)
    const statusDot = document.querySelector('.bg-blurple-400.animate-pulse');
    expect(statusDot).toBeInTheDocument();
  });

  it('shows completed indicator for inactive sessions', () => {
    const sessions = [
      createMockSession({
        session_id: 'session-1',
        title: 'Completed Session',
        is_active: false,
      }),
    ];

    render(<SessionTabs {...defaultProps} sessions={sessions} />);

    // Should show the mint indicator (completed)
    const statusDot = document.querySelector('.bg-mint-400');
    expect(statusDot).toBeInTheDocument();
  });

  it('shows elapsed timer for running sessions', () => {
    const sessions = [
      createMockSession({
        session_id: 'session-1',
        title: 'Running Session',
        is_active: true,
      }),
    ];
    const processes = [
      createMockProcess({
        claude_session_id: 'session-1',
        created_at: '2024-01-15T10:30:00Z',
      }),
    ];

    render(
      <SessionTabs
        {...defaultProps}
        sessions={sessions}
        processes={processes}
      />
    );

    expect(screen.getByTestId('elapsed-timer')).toBeInTheDocument();
  });

  it('does not show elapsed timer for completed sessions', () => {
    const sessions = [
      createMockSession({
        session_id: 'session-1',
        title: 'Completed Session',
        is_active: false,
      }),
    ];

    render(<SessionTabs {...defaultProps} sessions={sessions} />);

    expect(screen.queryByTestId('elapsed-timer')).not.toBeInTheDocument();
  });

  it('shows full title as tooltip', () => {
    const fullTitle = 'This is the full session title';
    const sessions = [createMockSession({ title: fullTitle })];

    render(<SessionTabs {...defaultProps} sessions={sessions} />);

    const tabButton = screen.getByTitle(fullTitle);
    expect(tabButton).toBeInTheDocument();
  });

  it('renders multiple tabs in order', () => {
    const sessions = [
      createMockSession({ session_id: 'session-1', title: 'First' }),
      createMockSession({ session_id: 'session-2', title: 'Second' }),
      createMockSession({ session_id: 'session-3', title: 'Third' }),
    ];

    render(<SessionTabs {...defaultProps} sessions={sessions} />);

    const tabs = screen.getAllByRole('tab');

    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent('First');
    expect(tabs[1]).toHaveTextContent('Second');
    expect(tabs[2]).toHaveTextContent('Third');
  });

  it('supports keyboard navigation with Enter key', () => {
    const onSelectSession = vi.fn();
    const sessions = [createMockSession({ session_id: 'session-1', title: 'Test Session' })];

    render(
      <SessionTabs
        {...defaultProps}
        sessions={sessions}
        onSelectSession={onSelectSession}
      />
    );

    const tab = screen.getByRole('tab');
    fireEvent.keyDown(tab, { key: 'Enter' });

    expect(onSelectSession).toHaveBeenCalledWith('session-1');
  });

  it('supports keyboard navigation with Space key', () => {
    const onSelectSession = vi.fn();
    const sessions = [createMockSession({ session_id: 'session-1', title: 'Test Session' })];

    render(
      <SessionTabs
        {...defaultProps}
        sessions={sessions}
        onSelectSession={onSelectSession}
      />
    );

    const tab = screen.getByRole('tab');
    fireEvent.keyDown(tab, { key: ' ' });

    expect(onSelectSession).toHaveBeenCalledWith('session-1');
  });
});
