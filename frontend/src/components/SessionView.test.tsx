import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionView, ViewMode } from './SessionView';
import type { SessionSummary, SessionDetail, Issue, PR, EntityLink, TranscriptMessage } from '../types';
import * as useApiModule from '../hooks/useApi';
import * as useProcessWebSocketModule from '../hooks/useProcessWebSocket';

// Mock dependencies
vi.mock('../hooks/useApi');
vi.mock('../hooks/useProcessWebSocket');
vi.mock('./Terminal', () => ({
  Terminal: ({ processId, onConnectionChange }: { processId: string; onConnectionChange?: (connected: boolean) => void }) => {
    // Use useEffect to properly trigger the callback after mount
    const React = require('react');
    React.useEffect(() => {
      if (onConnectionChange) {
        // Use setTimeout to ensure the callback runs in a separate tick,
        // avoiding act() warnings by allowing React to finish rendering first
        const timeoutId = setTimeout(() => {
          onConnectionChange(true);
        }, 0);
        return () => clearTimeout(timeoutId);
      }
    }, [onConnectionChange]);
    return <div data-testid="terminal">Terminal: {processId}</div>;
  },
}));
vi.mock('./ConversationView', () => ({
  ConversationView: ({
    searchQuery,
    onMatchesFound,
    onSendMessage,
  }: {
    transcript?: unknown;
    searchQuery?: string;
    onMatchesFound?: (count: number) => void;
    onSendMessage?: (msg: string) => void;
  }) => {
    // Use useEffect to properly trigger the callback after mount/update
    const { useEffect } = require('react');
    useEffect(() => {
      if (searchQuery && onMatchesFound) {
        onMatchesFound(searchQuery === 'test' ? 3 : 0);
      }
    }, [searchQuery, onMatchesFound]);
    return (
      <div data-testid="conversation-view">
        <span data-testid="search-query">{searchQuery || ''}</span>
        <button data-testid="send-message-btn" onClick={() => onSendMessage?.('test message')}>
          Send
        </button>
      </div>
    );
  },
}));
vi.mock('./EntityPicker', () => ({
  EntityPicker: ({
    isOpen,
    onClose,
    entityType,
    onAdd,
  }: {
    isOpen: boolean;
    onClose: () => void;
    entityType: string;
    onAdd: (kind: string, number: number) => void;
  }) => isOpen ? (
    <div data-testid="entity-picker">
      <span data-testid="entity-type">{entityType}</span>
      <button data-testid="add-entity" onClick={() => { onAdd(entityType, 42); onClose(); }}>
        Add #{entityType === 'issue' ? 42 : 123}
      </button>
      <button data-testid="close-picker" onClick={onClose}>Close</button>
    </div>
  ) : null,
}));

// Helper to create mock session summary
function createMockSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'session-uuid-123',
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

// Helper to create mock session detail
function createMockDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session_id: 'session-uuid-123',
    encoded_path: '-home-user-projects-test',
    repo_path: '/home/user/projects/test',
    repo_name: 'owner/test-repo',
    messages: [
      {
        uuid: 'msg-1',
        role: 'user',
        content: 'Hello Claude',
        timestamp: '2024-01-15T10:30:00Z',
        tool_uses: [],
      },
      {
        uuid: 'msg-2',
        role: 'assistant',
        content: 'Hello! How can I help you today?',
        timestamp: '2024-01-15T10:30:05Z',
        tool_uses: [],
      },
    ] as TranscriptMessage[],
    summary: 'Test session summary',
    model: 'claude-3-sonnet',
    total_input_tokens: 100,
    total_output_tokens: 200,
    total_cache_read_tokens: 50,
    total_cache_creation_tokens: 25,
    start_time: '2024-01-15T10:30:00Z',
    end_time: '2024-01-15T10:35:00Z',
    claude_code_version: '1.0.0',
    git_branch: 'main',
    metadata: {
      session_id: 'session-uuid-123',
      title: 'Test Session',
      summary: 'Test session summary',
      repo_path: '/home/user/projects/test',
      entities: [],
      tags: [],
      starred: false,
    },
    is_active: false,
    ...overrides,
  };
}

function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 42,
    title: 'Test Issue',
    body: 'Issue body',
    state: 'open',
    labels: ['bug'],
    author: 'testuser',
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    comments_count: 2,
    url: 'https://github.com/owner/repo/issues/42',
    ...overrides,
  };
}

describe('SessionView', () => {
  let mockFetchSessionDetail: ReturnType<typeof vi.fn>;
  let mockAddEntityToSession: ReturnType<typeof vi.fn>;
  let mockRemoveEntityFromSession: ReturnType<typeof vi.fn>;
  let mockSendInput: ReturnType<typeof vi.fn>;

  const defaultProps = {
    session: createMockSession(),
    processId: null as string | null,
    onClose: vi.fn(),
    onContinue: vi.fn(),
    onDelete: vi.fn(),
    onTitleChange: vi.fn(),
    onShowIssue: vi.fn(),
    onShowPR: vi.fn(),
    issues: [] as Issue[],
    prs: [] as PR[],
    onEntitiesChange: vi.fn(),
    viewMode: undefined as ViewMode | undefined,
    onViewModeChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();

    // Setup mocks
    mockFetchSessionDetail = vi.fn().mockResolvedValue(createMockDetail());
    mockAddEntityToSession = vi.fn().mockImplementation((_sessionId, kind, number) =>
      Promise.resolve({ kind, number } as EntityLink)
    );
    mockRemoveEntityFromSession = vi.fn().mockResolvedValue(undefined);
    mockSendInput = vi.fn();

    vi.mocked(useApiModule.fetchSessionDetail).mockImplementation(mockFetchSessionDetail);
    vi.mocked(useApiModule.addEntityToSession).mockImplementation(mockAddEntityToSession);
    vi.mocked(useApiModule.removeEntityFromSession).mockImplementation(mockRemoveEntityFromSession);
    vi.mocked(useProcessWebSocketModule.useProcessWebSocket).mockReturnValue({
      isConnected: false,
      sendInput: mockSendInput,
      sendResize: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Loading State', () => {
    it('renders loading skeleton while fetching session detail', () => {
      mockFetchSessionDetail.mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<SessionView {...defaultProps} />);

      expect(screen.getByText('Test Session')).toBeInTheDocument();
      // Should show skeleton elements
      expect(document.querySelector('.skeleton-shimmer')).toBeInTheDocument();
    });

    it('fetches session detail on mount', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(mockFetchSessionDetail).toHaveBeenCalledWith('session-uuid-123');
      });
    });
  });

  describe('Error State', () => {
    it('displays error message when fetch fails', async () => {
      mockFetchSessionDetail.mockRejectedValue(new Error('Network error'));
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load session')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows retry button that reloads session on click', async () => {
      mockFetchSessionDetail.mockRejectedValueOnce(new Error('Network error'));
      mockFetchSessionDetail.mockResolvedValueOnce(createMockDetail());

      render(<SessionView {...defaultProps} />);

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('Failed to load session')).toBeInTheDocument();
      });

      // Find and click retry button
      const retryButton = screen.getByRole('button', { name: /try again/i });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);

      // Should show loading then success
      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      // Should have called fetch twice (initial + retry)
      expect(mockFetchSessionDetail).toHaveBeenCalledTimes(2);
    });
  });

  describe('Transcript View (Default)', () => {
    it('renders conversation view after loading', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });
    });

    it('shows title from detail metadata', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Session')).toBeInTheDocument();
      });
    });

    it('shows session date in footer', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        // The date should be rendered (format depends on locale)
        expect(screen.getByText(/Session:/)).toBeInTheDocument();
      });
    });
  });

  describe('Close Button', () => {
    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      render(<SessionView {...defaultProps} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Continue Button', () => {
    it('shows continue button for completed sessions', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();
      });
    });

    it('calls onContinue when continue button is clicked', async () => {
      const onContinue = vi.fn();
      render(<SessionView {...defaultProps} onContinue={onContinue} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
      expect(onContinue).toHaveBeenCalled();
    });

    it('hides continue button for active sessions', async () => {
      const activeSession = createMockSession({ is_active: true });
      render(<SessionView {...defaultProps} session={activeSession} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Continue/i })).not.toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('toggles search bar when search button is clicked', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      const searchButton = screen.getByRole('button', { name: 'Search transcript' });
      fireEvent.click(searchButton);

      expect(screen.getByPlaceholderText('Search in transcript...')).toBeInTheDocument();
    });

    it('closes search bar when clicking close button', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      // Open search
      fireEvent.click(screen.getByRole('button', { name: 'Search transcript' }));
      expect(screen.getByPlaceholderText('Search in transcript...')).toBeInTheDocument();

      // Close search
      const closeSearchButton = screen.getByRole('button', { name: 'Close search (Esc)' });
      fireEvent.click(closeSearchButton);

      expect(screen.queryByPlaceholderText('Search in transcript...')).not.toBeInTheDocument();
    });

    it('passes search query to conversation view', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      // Open search and type
      fireEvent.click(screen.getByRole('button', { name: 'Search transcript' }));
      const searchInput = screen.getByPlaceholderText('Search in transcript...');
      fireEvent.change(searchInput, { target: { value: 'test query' } });

      expect(screen.getByTestId('search-query')).toHaveTextContent('test query');
    });

    it('shows match count when there are matches', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      // Open search and type a query that matches
      fireEvent.click(screen.getByRole('button', { name: 'Search transcript' }));
      const searchInput = screen.getByPlaceholderText('Search in transcript...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Wait for match count to update (mocked to return 3)
      await waitFor(() => {
        expect(screen.getByText('1 of 3')).toBeInTheDocument();
      });
    });

    it('shows no matches message when search has no results', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Search transcript' }));
      const searchInput = screen.getByPlaceholderText('Search in transcript...');
      fireEvent.change(searchInput, { target: { value: 'nomatch' } });

      await waitFor(() => {
        expect(screen.getByText('No matches')).toBeInTheDocument();
      });
    });
  });

  describe('Copy/Export Functionality', () => {
    it('shows copy button when detail is loaded', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Copy transcript to clipboard' })).toBeInTheDocument();
      });
    });

    it('copies transcript to clipboard when copy button is clicked', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Copy transcript to clipboard' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Copy transcript to clipboard' }));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      });
    });

    it('shows copied confirmation after copying', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Copy transcript to clipboard' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Copy transcript to clipboard' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Copied to clipboard' })).toBeInTheDocument();
      });
    });

    it('shows export dropdown with format options', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Download transcript' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Download transcript' }));

      expect(screen.getByText('Markdown')).toBeInTheDocument();
      expect(screen.getByText('Plain text')).toBeInTheDocument();
      expect(screen.getByText('JSON')).toBeInTheDocument();
    });
  });

  describe('Entity Management', () => {
    it('shows entity chips when session has entities', async () => {
      const sessionWithEntities = createMockSession({
        entities: [
          { kind: 'issue', number: 42 },
          { kind: 'pr', number: 123 },
        ],
      });
      render(<SessionView {...defaultProps} session={sessionWithEntities} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      expect(screen.getByText('#42')).toBeInTheDocument();
      expect(screen.getByText('#123')).toBeInTheDocument();
    });

    it('calls onShowIssue when issue entity chip is clicked', async () => {
      const onShowIssue = vi.fn();
      const sessionWithEntities = createMockSession({
        entities: [{ kind: 'issue', number: 42 }],
      });
      render(<SessionView {...defaultProps} session={sessionWithEntities} onShowIssue={onShowIssue} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('#42'));
      expect(onShowIssue).toHaveBeenCalledWith(42);
    });

    it('opens entity picker from actions menu', async () => {
      render(<SessionView {...defaultProps} issues={[createMockIssue()]} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      // Open actions menu
      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
      expect(screen.getByText('Link Issue')).toBeInTheDocument();

      // Click link issue
      fireEvent.click(screen.getByText('Link Issue'));

      expect(screen.getByTestId('entity-picker')).toBeInTheDocument();
      expect(screen.getByTestId('entity-type')).toHaveTextContent('issue');
    });

    it('adds entity when selected from picker', async () => {
      render(<SessionView {...defaultProps} issues={[createMockIssue()]} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      // Open actions menu and link issue
      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
      fireEvent.click(screen.getByText('Link Issue'));

      // Add entity from picker
      fireEvent.click(screen.getByTestId('add-entity'));

      await waitFor(() => {
        expect(mockAddEntityToSession).toHaveBeenCalledWith('session-uuid-123', 'issue', 42);
      });
    });

    it('removes entity when unlink button is clicked', async () => {
      const sessionWithEntities = createMockSession({
        entities: [{ kind: 'issue', number: 42 }],
      });
      render(<SessionView {...defaultProps} session={sessionWithEntities} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      // Find the unlink button (x button next to the entity chip)
      const unlinkButtons = screen.getAllByRole('button', { name: 'Unlink' });
      fireEvent.click(unlinkButtons[0]);

      await waitFor(() => {
        expect(mockRemoveEntityFromSession).toHaveBeenCalledWith('session-uuid-123', 0);
      });
    });
  });

  describe('Delete Functionality', () => {
    it('shows delete option in actions menu for completed sessions', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('hides delete option for active sessions', async () => {
      const activeSession = createMockSession({ is_active: true });
      render(<SessionView {...defaultProps} session={activeSession} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('shows confirmation modal when delete is clicked', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
      fireEvent.click(screen.getByText('Delete'));

      expect(screen.getByText('Delete Session')).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone')).toBeInTheDocument();
    });

    it('calls onDelete when confirmed', async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      render(<SessionView {...defaultProps} onDelete={onDelete} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
      fireEvent.click(screen.getByText('Delete'));

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.getByText('Delete Session')).toBeInTheDocument();
      });

      // Find the confirm delete button in the modal (it's a different button from the menu)
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(onDelete).toHaveBeenCalled();
      });
    });

    it('closes modal when cancel is clicked', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
      fireEvent.click(screen.getByText('Delete'));

      expect(screen.getByText('Delete Session')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('Delete Session')).not.toBeInTheDocument();
    });
  });

  describe('Title Editing', () => {
    it('allows editing title when onTitleChange is provided', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      const title = screen.getByText('Test Session');
      fireEvent.click(title);

      const input = screen.getByDisplayValue('Test Session');
      expect(input).toBeInTheDocument();
    });

    it('saves title on Enter key', async () => {
      const onTitleChange = vi.fn().mockResolvedValue(undefined);
      render(<SessionView {...defaultProps} onTitleChange={onTitleChange} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      const title = screen.getByText('Test Session');
      fireEvent.click(title);

      const input = screen.getByDisplayValue('Test Session');
      fireEvent.change(input, { target: { value: 'New Title' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(onTitleChange).toHaveBeenCalledWith('New Title');
      });
    });

    it('cancels editing on Escape key', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      const title = screen.getByText('Test Session');
      fireEvent.click(title);

      const input = screen.getByDisplayValue('Test Session');
      fireEvent.keyDown(input, { key: 'Escape' });

      // Should no longer be editing
      expect(screen.queryByDisplayValue('Test Session')).not.toBeInTheDocument();
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });
  });

  describe('Active Session with Terminal', () => {
    it('shows terminal view when processId is provided and viewMode is terminal', async () => {
      render(
        <SessionView
          {...defaultProps}
          processId="process-123"
          session={createMockSession({ is_active: true })}
          viewMode="terminal"
        />
      );

      expect(screen.getByTestId('terminal')).toBeInTheDocument();
      expect(screen.getByText('Terminal: process-123')).toBeInTheDocument();
    });

    it('shows view mode toggle for active sessions with processId', async () => {
      render(
        <SessionView
          {...defaultProps}
          processId="process-123"
          session={createMockSession({ is_active: true })}
          viewMode="transcript"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Transcript' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Terminal' })).toBeInTheDocument();
    });

    it('calls onViewModeChange when switching views', async () => {
      const onViewModeChange = vi.fn();
      render(
        <SessionView
          {...defaultProps}
          processId="process-123"
          session={createMockSession({ is_active: true })}
          viewMode="transcript"
          onViewModeChange={onViewModeChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
      expect(onViewModeChange).toHaveBeenCalledWith('terminal');
    });

    it('shows Live indicator for active sessions', async () => {
      render(
        <SessionView
          {...defaultProps}
          session={createMockSession({ is_active: true })}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('shows connection status in terminal view', async () => {
      render(
        <SessionView
          {...defaultProps}
          processId="process-123"
          session={createMockSession({ is_active: true })}
          viewMode="terminal"
        />
      );

      // Initially shows connecting/disconnected, then connected after mock callback
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('opens search on Ctrl+F', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search in transcript...')).toBeInTheDocument();
      });
    });

    it('closes search on Escape', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      // Open search
      fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search in transcript...')).toBeInTheDocument();
      });

      // Close with Escape
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByPlaceholderText('Search in transcript...')).not.toBeInTheDocument();
    });
  });

  describe('Session Data Fetching', () => {
    it('fetches session detail for active sessions in transcript mode', async () => {
      const activeSession = createMockSession({ is_active: true });
      render(<SessionView {...defaultProps} session={activeSession} viewMode="transcript" />);

      // Initial fetch should happen
      await waitFor(() => {
        expect(mockFetchSessionDetail).toHaveBeenCalledWith('session-uuid-123');
      });
    });

    it('fetches session detail for completed sessions', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(mockFetchSessionDetail).toHaveBeenCalledWith('session-uuid-123');
      });
    });

    it('shows terminal view immediately for active sessions with processId', async () => {
      const activeSession = createMockSession({ is_active: true });
      render(
        <SessionView
          {...defaultProps}
          session={activeSession}
          processId="process-123"
          viewMode="terminal"
        />
      );

      // Terminal should render immediately
      expect(screen.getByTestId('terminal')).toBeInTheDocument();

      // Wait for the mock terminal's connection callback to complete
      await waitFor(() => {
        // The mock terminal calls onConnectionChange(true) after mount
        expect(screen.getByTestId('terminal')).toBeInTheDocument();
      });
    });
  });

  describe('No Transcript Available', () => {
    it('shows empty state when no messages', async () => {
      mockFetchSessionDetail.mockResolvedValue(createMockDetail({ messages: [] }));
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        // ConversationView should still render with empty transcript
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });
    });
  });

  describe('Format Export Functions', () => {
    it('exports transcript in different formats', async () => {
      render(<SessionView {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
      });

      // Check that all format options are shown in the dropdown
      const downloadButton = screen.getByRole('button', { name: 'Download transcript' });
      fireEvent.click(downloadButton);

      expect(screen.getByText('.md')).toBeInTheDocument();
      expect(screen.getByText('.txt')).toBeInTheDocument();
      expect(screen.getByText('.json')).toBeInTheDocument();
    });
  });
});
