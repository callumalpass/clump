import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from './Settings';
import type { ClaudeCodeSettings, CommandMetadata } from '../types';
import * as useApiModule from '../hooks/useApi';
import * as useThemeModule from '../hooks/useTheme';

// Mock the useApi module
vi.mock('../hooks/useApi');

// Mock the useTheme module
vi.mock('../hooks/useTheme');

// Mock the CommandEditor component
vi.mock('./CommandEditor', () => ({
  CommandEditor: ({
    commands,
    repoPath,
    onRefresh,
  }: {
    commands: { issue: CommandMetadata[]; pr: CommandMetadata[] };
    repoPath?: string | null;
    onRefresh: () => void;
  }) => (
    <div data-testid="command-editor">
      <span data-testid="command-count">{commands.issue.length + commands.pr.length}</span>
      <span data-testid="repo-path">{repoPath || 'global'}</span>
      <button data-testid="refresh-commands" onClick={onRefresh}>
        Refresh
      </button>
    </div>
  ),
}));

// Helper to create mock settings
function createMockSettings(overrides: Partial<ClaudeCodeSettings> = {}): ClaudeCodeSettings {
  return {
    permission_mode: 'default',
    allowed_tools: ['Read', 'Write'],
    disallowed_tools: [],
    max_turns: 10,
    model: 'sonnet',
    headless_mode: false,
    output_format: 'text',
    default_allowed_tools: ['Read', 'Glob', 'Grep'],
    ...overrides,
  };
}

// Helper to create mock commands
function createMockCommands(): { issue: CommandMetadata[]; pr: CommandMetadata[] } {
  return {
    issue: [
      { id: 'issue-1', name: 'Investigate', prompt_template: 'Investigate issue #{number}', scope: 'global' },
    ],
    pr: [
      { id: 'pr-1', name: 'Review', prompt_template: 'Review PR #{number}', scope: 'global' },
    ],
  };
}

describe('Settings', () => {
  let mockUpdateSettings: ReturnType<typeof vi.fn>;
  let mockResetSettings: ReturnType<typeof vi.fn>;
  let mockSetTheme: ReturnType<typeof vi.fn>;

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    commands: undefined as { issue: CommandMetadata[]; pr: CommandMetadata[] } | undefined,
    repoPath: null as string | null,
    onRefreshCommands: undefined as (() => void) | undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset fetch mock - default to returning configured token
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****xxxx' }),
    });

    mockUpdateSettings = vi.fn().mockResolvedValue(undefined);
    mockResetSettings = vi.fn().mockResolvedValue(undefined);
    mockSetTheme = vi.fn();

    vi.mocked(useApiModule.useClaudeSettings).mockReturnValue({
      settings: createMockSettings(),
      loading: false,
      error: null,
      saving: false,
      updateSettings: mockUpdateSettings,
      resetSettings: mockResetSettings,
      refresh: vi.fn(),
    });

    // Mock useTheme hook
    vi.mocked(useThemeModule.useTheme).mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
      isDark: true,
      isLight: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(<Settings {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });

    it('renders the modal when isOpen is true', async () => {
      render(<Settings {...defaultProps} />);
      expect(screen.getByText('Settings')).toBeInTheDocument();

      // Wait for async token status fetch to complete
      await waitFor(() => {
        expect(screen.getByText(/Token configured/)).toBeInTheDocument();
      });
    });

    it('shows all tab options', async () => {
      render(<Settings {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'GitHub' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'permissions' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'execution' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'commands' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'advanced' })).toBeInTheDocument();

      // Wait for async token status fetch to complete
      await waitFor(() => {
        expect(screen.getByText(/Token configured/)).toBeInTheDocument();
      });
    });
  });

  describe('Close Functionality', () => {
    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      render(<Settings {...defaultProps} onClose={onClose} />);

      // Wait for token status to be fetched
      await waitFor(() => {
        expect(screen.getByText(/Token configured/)).toBeInTheDocument();
      });

      // Get the footer close button (there are two close buttons - header X and footer)
      const closeButtons = screen.getAllByRole('button', { name: 'Close' });
      fireEvent.click(closeButtons[1]); // Footer close button
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is clicked', async () => {
      const onClose = vi.fn();
      render(<Settings {...defaultProps} onClose={onClose} />);

      // Click the backdrop (first div with onClick)
      const backdrop = document.querySelector('.bg-black\\/60');
      if (backdrop) {
        fireEvent.click(backdrop);
      }
      expect(onClose).toHaveBeenCalled();

      // Wait for async token status fetch to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('calls onClose when Escape key is pressed', async () => {
      const onClose = vi.fn();
      render(<Settings {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();

      // Wait for async token status fetch to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });
  });

  describe('GitHub Tab', () => {
    it('shows GitHub tab by default', async () => {
      render(<Settings {...defaultProps} />);
      expect(screen.getByText('Personal Access Token')).toBeInTheDocument();

      // Wait for async token status fetch to complete
      await waitFor(() => {
        expect(screen.getByText(/Token configured/)).toBeInTheDocument();
      });
    });

    it('shows loading skeleton while fetching token status', async () => {
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      render(<Settings {...defaultProps} />);

      // Should have skeleton shimmer elements
      const skeletonElements = document.querySelectorAll('.skeleton-shimmer');
      expect(skeletonElements.length).toBeGreaterThan(0);
    });

    it('shows two skeleton elements with proper structure during loading', async () => {
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      render(<Settings {...defaultProps} />);

      const skeletonElements = document.querySelectorAll('.skeleton-shimmer');
      // Should have exactly 2 skeleton elements: one for the main box, one for the text line
      expect(skeletonElements.length).toBe(2);

      // First skeleton should be taller (h-12 = 48px box)
      const firstSkeleton = skeletonElements[0];
      expect(firstSkeleton).toHaveClass('h-12');

      // Second skeleton should be smaller text line (h-4 with fixed width)
      const secondSkeleton = skeletonElements[1];
      expect(secondSkeleton).toHaveClass('h-4');
      expect(secondSkeleton).toHaveClass('w-48');
    });

    it('hides skeleton elements after token status loads', async () => {
      let resolveToken: (value: unknown) => void;
      const tokenPromise = new Promise(resolve => {
        resolveToken = resolve;
      });

      global.fetch = vi.fn().mockImplementation(() => tokenPromise);

      render(<Settings {...defaultProps} />);

      // Initially should have skeleton elements
      expect(document.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0);

      // Resolve the token fetch
      await act(async () => {
        resolveToken!({
          ok: true,
          json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****xxxx' }),
        });
      });

      // Wait for the state to update
      await waitFor(() => {
        expect(screen.getByText(/Token configured/)).toBeInTheDocument();
      });

      // Skeleton elements should be gone
      expect(document.querySelectorAll('.skeleton-shimmer').length).toBe(0);
    });

    it('shows token configured status when token exists', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****xxxx' }),
      });

      render(<Settings {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Token configured/)).toBeInTheDocument();
        expect(screen.getByText('ghp_****xxxx')).toBeInTheDocument();
      });
    });

    it('shows warning when no token is configured', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: false, masked_token: null }),
      });

      render(<Settings {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No token configured')).toBeInTheDocument();
      });
    });

    it('allows editing token when change button is clicked', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****xxxx' }),
      });

      render(<Settings {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Change')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Change'));

      expect(screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx')).toBeInTheDocument();
    });

    it('saves new token when form is submitted', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: false, masked_token: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****newtoken' }),
        });

      render(<Settings {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      fireEvent.change(input, { target: { value: 'ghp_testnewtoken123' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Token' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/settings/github-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'ghp_testnewtoken123' }),
        });
      });
    });

    it('shows error when token save fails', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: false, masked_token: null }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ detail: 'Invalid token format' }),
        });

      render(<Settings {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
      fireEvent.change(input, { target: { value: 'invalid' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Token' }));

      await waitFor(() => {
        expect(screen.getByText('Invalid token format')).toBeInTheDocument();
      });
    });

    it('removes token when remove button is clicked', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ configured: true, masked_token: 'ghp_****xxxx' }),
        })
        .mockResolvedValueOnce({
          ok: true,
        });

      render(<Settings {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Remove'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/settings/github-token', {
          method: 'DELETE',
        });
      });
    });
  });

  describe('Permissions Tab', () => {
    it('shows permission settings when tab is selected', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));

      expect(screen.getByText('Permission Mode')).toBeInTheDocument();
      expect(screen.getByText('Allowed Tools')).toBeInTheDocument();
    });

    it('displays current permission mode as selected', async () => {
      vi.mocked(useApiModule.useClaudeSettings).mockReturnValue({
        settings: createMockSettings({ permission_mode: 'acceptEdits' }),
        loading: false,
        error: null,
        saving: false,
        updateSettings: mockUpdateSettings,
        resetSettings: mockResetSettings,
        refresh: vi.fn(),
      });

      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));

      const acceptEditsButton = screen.getByRole('button', { name: /Accept Edits/i });
      // The selected permission mode button uses bg-blurple-500/10 styling (Stoody theme)
      expect(acceptEditsButton).toHaveClass('bg-blurple-500/10');
    });

    it('updates permission mode when clicked', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));
      fireEvent.click(screen.getByRole('button', { name: /Plan Only/i }));

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({ permission_mode: 'plan' });
      });
    });

    it('shows allowed tools list', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));

      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByText('Write')).toBeInTheDocument();
    });

    it('adds a new tool when entered', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));

      const input = screen.getByPlaceholderText('Add tool (e.g., Bash(npm:*))');
      fireEvent.change(input, { target: { value: 'Bash(npm:*)' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          allowed_tools: ['Read', 'Write', 'Bash(npm:*)'],
        });
      });
    });

    it('removes a tool when X is clicked', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));

      // Find the remove button for the 'Read' tool
      const readTool = screen.getByText('Read').closest('span');
      const removeButton = readTool?.querySelector('button');
      if (removeButton) {
        fireEvent.click(removeButton);
      }

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          allowed_tools: ['Write'],
        });
      });
    });
  });

  describe('Execution Tab', () => {
    it('shows execution settings when tab is selected', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'execution' }));

      expect(screen.getByText('Max Turns')).toBeInTheDocument();
      expect(screen.getByText('Model')).toBeInTheDocument();
      expect(screen.getByText('Output Format')).toBeInTheDocument();
    });

    it('updates max turns when slider changes', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'execution' }));

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '25' } });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({ max_turns: 25 });
      });
    });

    it('updates model when selected', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'execution' }));
      fireEvent.click(screen.getByRole('button', { name: 'opus' }));

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({ model: 'opus' });
      });
    });

    it('updates output format when selected', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'execution' }));
      fireEvent.click(screen.getByRole('button', { name: 'JSON' }));

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({ output_format: 'json' });
      });
    });
  });

  describe('Commands Tab', () => {
    it('shows commands tab content when selected', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'commands' }));

      expect(screen.getByText('Session Commands')).toBeInTheDocument();
    });

    it('shows message to select repo when no commands provided', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'commands' }));

      expect(screen.getByText('Select a repository to manage commands')).toBeInTheDocument();
    });

    it('renders CommandEditor when commands are provided', async () => {
      const onRefreshCommands = vi.fn();
      render(
        <Settings
          {...defaultProps}
          commands={createMockCommands()}
          repoPath="/home/user/project"
          onRefreshCommands={onRefreshCommands}
        />
      );

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'commands' }));

      expect(screen.getByTestId('command-editor')).toBeInTheDocument();
      expect(screen.getByTestId('command-count')).toHaveTextContent('2');
      expect(screen.getByTestId('repo-path')).toHaveTextContent('/home/user/project');
    });

    it('calls onRefreshCommands when refresh is clicked in CommandEditor', async () => {
      const onRefreshCommands = vi.fn();
      render(
        <Settings
          {...defaultProps}
          commands={createMockCommands()}
          repoPath="/home/user/project"
          onRefreshCommands={onRefreshCommands}
        />
      );

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'commands' }));
      fireEvent.click(screen.getByTestId('refresh-commands'));

      expect(onRefreshCommands).toHaveBeenCalled();
    });
  });

  describe('Advanced Tab', () => {
    it('shows advanced settings when tab is selected', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));

      expect(screen.getByRole('button', { name: 'Reset to Defaults' })).toBeInTheDocument();
    });

    it('shows confirmation and resets settings when reset button is clicked', async () => {
      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));

      expect(confirmSpy).toHaveBeenCalledWith('Reset all Claude Code settings to defaults?');
      await waitFor(() => {
        expect(mockResetSettings).toHaveBeenCalled();
      });

      confirmSpy.mockRestore();
    });

    it('does not reset when confirmation is cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));

      expect(mockResetSettings).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('shows theme selection options', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));

      expect(screen.getByText('Theme')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Dark/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Light/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /System/i })).toBeInTheDocument();
    });

    it('highlights the current theme selection', async () => {
      vi.mocked(useThemeModule.useTheme).mockReturnValue({
        theme: 'light',
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
        isDark: false,
        isLight: true,
      });

      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));

      // The selected theme button uses bg-blurple-500/10 styling
      const lightButton = screen.getByRole('button', { name: /Light/i });
      expect(lightButton).toHaveClass('bg-blurple-500/10');
    });

    it('calls setTheme when dark theme is selected', async () => {
      vi.mocked(useThemeModule.useTheme).mockReturnValue({
        theme: 'light',
        resolvedTheme: 'light',
        setTheme: mockSetTheme,
        isDark: false,
        isLight: true,
      });

      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));
      fireEvent.click(screen.getByRole('button', { name: /Dark/i }));

      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('calls setTheme when light theme is selected', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));
      fireEvent.click(screen.getByRole('button', { name: /Light/i }));

      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });

    it('calls setTheme when system theme is selected', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));
      fireEvent.click(screen.getByRole('button', { name: /System/i }));

      expect(mockSetTheme).toHaveBeenCalledWith('system');
    });
  });

  describe('Loading State', () => {
    it('shows loading state while settings are being fetched', async () => {
      vi.mocked(useApiModule.useClaudeSettings).mockReturnValue({
        settings: null,
        loading: true,
        error: null,
        saving: false,
        updateSettings: mockUpdateSettings,
        resetSettings: mockResetSettings,
        refresh: vi.fn(),
      });

      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Switch to a tab that shows loading (not GitHub which has its own loading)
      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));

      expect(screen.getByText('Loading settings...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when there is an error', async () => {
      vi.mocked(useApiModule.useClaudeSettings).mockReturnValue({
        settings: createMockSettings(),
        loading: false,
        error: 'Failed to load settings',
        saving: false,
        updateSettings: mockUpdateSettings,
        resetSettings: mockResetSettings,
        refresh: vi.fn(),
      });

      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      expect(screen.getByText('Failed to load settings')).toBeInTheDocument();
    });
  });

  describe('Saving State', () => {
    it('shows saving indicator when saving', async () => {
      vi.mocked(useApiModule.useClaudeSettings).mockReturnValue({
        settings: createMockSettings(),
        loading: false,
        error: null,
        saving: true,
        updateSettings: mockUpdateSettings,
        resetSettings: mockResetSettings,
        refresh: vi.fn(),
      });

      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    it('shows auto-save message when not saving', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      expect(screen.getByText('Changes are saved automatically')).toBeInTheDocument();
    });

    it('disables inputs while saving', async () => {
      vi.mocked(useApiModule.useClaudeSettings).mockReturnValue({
        settings: createMockSettings(),
        loading: false,
        error: null,
        saving: true,
        updateSettings: mockUpdateSettings,
        resetSettings: mockResetSettings,
        refresh: vi.fn(),
      });

      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));

      // Permission mode buttons should be disabled
      const planButton = screen.getByRole('button', { name: /Plan Only/i });
      expect(planButton).toBeDisabled();
    });
  });

  describe('Tab Navigation', () => {
    it('switches between tabs correctly', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete before switching tabs
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Start on GitHub tab
      expect(screen.getByText('Personal Access Token')).toBeInTheDocument();

      // Switch to permissions
      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));
      expect(screen.getByText('Permission Mode')).toBeInTheDocument();

      // Switch to execution
      fireEvent.click(screen.getByRole('button', { name: 'execution' }));
      expect(screen.getByText('Max Turns')).toBeInTheDocument();

      // Switch to commands
      fireEvent.click(screen.getByRole('button', { name: 'commands' }));
      expect(screen.getByText('Session Commands')).toBeInTheDocument();

      // Switch to advanced
      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));
      expect(screen.getByRole('button', { name: 'Reset to Defaults' })).toBeInTheDocument();
    });

    it('highlights the active tab', async () => {
      render(<Settings {...defaultProps} />);

      // Wait for token fetch to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // The active tab gets 'text-white' class, while inactive tabs get 'text-gray-400'
      const githubTab = screen.getByRole('button', { name: 'GitHub' });
      expect(githubTab).toHaveClass('text-white');

      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));

      const permissionsTab = screen.getByRole('button', { name: 'permissions' });
      expect(permissionsTab).toHaveClass('text-white');
      expect(githubTab).not.toHaveClass('text-white');
    });
  });

  describe('Section Dividers', () => {
    it('renders section dividers in permissions tab', async () => {
      const { container } = render(<Settings {...defaultProps} />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'permissions' }));

      // Should have a divider between Permission Mode and Allowed Tools sections
      const dividers = container.querySelectorAll('.border-t.border-gray-750\\/50');
      expect(dividers.length).toBeGreaterThan(0);
    });

    it('renders section dividers in execution tab', async () => {
      const { container } = render(<Settings {...defaultProps} />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'execution' }));

      // Should have dividers between Max Turns, Model, and Output Format sections
      const dividers = container.querySelectorAll('.border-t.border-gray-750\\/50');
      expect(dividers.length).toBeGreaterThanOrEqual(2);
    });

    it('renders section dividers in advanced tab', async () => {
      const { container } = render(<Settings {...defaultProps} />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'advanced' }));

      // Should have dividers between Theme and Reset sections
      const dividers = container.querySelectorAll('.border-t');
      expect(dividers.length).toBeGreaterThan(0);
    });
  });
});
