import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandEditor } from './CommandEditor';
import type { CommandMetadata } from '../types';
import * as useApiModule from '../hooks/useApi';

// Mock the useApi module
vi.mock('../hooks/useApi', () => ({
  createCommand: vi.fn(),
  updateCommand: vi.fn(),
  deleteCommand: vi.fn(),
}));

// Helper to create mock command
function createMockCommand(overrides: Partial<CommandMetadata> = {}): CommandMetadata {
  return {
    id: 'cmd-1',
    name: 'Test Command',
    shortName: 'Test',
    description: 'A test command description',
    category: 'issue',
    template: 'Please investigate issue #{{number}}: {{title}}',
    source: 'builtin',
    ...overrides,
  };
}

// Helper to create commands list
function createMockCommands(
  issueCommands: Partial<CommandMetadata>[] = [],
  prCommands: Partial<CommandMetadata>[] = []
): { issue: CommandMetadata[]; pr: CommandMetadata[] } {
  return {
    issue: issueCommands.map((cmd, idx) =>
      createMockCommand({ id: `issue-${idx}`, category: 'issue', ...cmd })
    ),
    pr: prCommands.map((cmd, idx) =>
      createMockCommand({ id: `pr-${idx}`, category: 'pr', ...cmd })
    ),
  };
}

// Helper to get form inputs by placeholder
function getNameInput() {
  return screen.getByPlaceholderText('Fix Suggestion');
}

function getShortNameInput() {
  return screen.getByPlaceholderText('Fix');
}

function getDescriptionInput() {
  return screen.getByPlaceholderText('Analyze root cause and suggest a fix approach');
}

function getTemplateInput() {
  return screen.getByPlaceholderText('Please analyze this issue and suggest a fix...');
}

describe('CommandEditor', () => {
  const defaultProps = {
    commands: createMockCommands(),
    repoPath: null as string | null,
    onRefresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    vi.mocked(useApiModule.createCommand).mockResolvedValue(createMockCommand());
    vi.mocked(useApiModule.updateCommand).mockResolvedValue(createMockCommand());
    vi.mocked(useApiModule.deleteCommand).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders category tabs', () => {
      render(<CommandEditor {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'issue Commands' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'pr Commands' })).toBeInTheDocument();
    });

    it('shows issue tab selected by default', () => {
      render(<CommandEditor {...defaultProps} />);

      const issueTab = screen.getByRole('button', { name: 'issue Commands' });
      expect(issueTab).toHaveClass('bg-blue-600');
    });

    it('shows empty state when no commands exist', () => {
      render(<CommandEditor {...defaultProps} commands={createMockCommands()} />);

      expect(screen.getByText('No issue commands defined')).toBeInTheDocument();
      expect(screen.getByText('Create one to get started')).toBeInTheDocument();
    });

    it('renders command list when commands exist', () => {
      const commands = createMockCommands([
        { name: 'Investigate', shortName: 'Inv', description: 'Investigate the issue' },
        { name: 'Fix Bug', shortName: 'FixB', description: 'Fix the issue' },
      ]);

      render(<CommandEditor {...defaultProps} commands={commands} />);

      expect(screen.getByText('Investigate')).toBeInTheDocument();
      expect(screen.getByText('Inv')).toBeInTheDocument();
      expect(screen.getByText('Fix Bug')).toBeInTheDocument();
    });

    it('shows add command button', () => {
      render(<CommandEditor {...defaultProps} />);

      expect(screen.getByRole('button', { name: '+ Add Issue Command' })).toBeInTheDocument();
    });

    it('shows storage info', () => {
      render(<CommandEditor {...defaultProps} />);

      expect(screen.getByText(/Commands are stored as markdown files/)).toBeInTheDocument();
      expect(screen.getByText('.claude/commands/')).toBeInTheDocument();
    });

    it('shows source badge for builtin commands', () => {
      const commands = createMockCommands([{ source: 'builtin' }]);
      render(<CommandEditor {...defaultProps} commands={commands} />);

      expect(screen.getByText('builtin')).toBeInTheDocument();
    });

    it('shows source badge for repo commands with different styling', () => {
      const commands = createMockCommands([{ source: 'repo' }]);
      render(<CommandEditor {...defaultProps} commands={commands} />);

      const repoBadge = screen.getByText('repo');
      expect(repoBadge).toHaveClass('bg-green-900/50', 'text-green-400');
    });
  });

  describe('Category Tab Switching', () => {
    it('switches to PR tab when clicked', () => {
      const commands = createMockCommands(
        [{ name: 'Issue Command' }],
        [{ name: 'PR Command' }]
      );
      render(<CommandEditor {...defaultProps} commands={commands} />);

      // Initially shows issue commands
      expect(screen.getByText('Issue Command')).toBeInTheDocument();

      // Switch to PR tab
      fireEvent.click(screen.getByRole('button', { name: 'pr Commands' }));

      // Now shows PR commands
      expect(screen.queryByText('Issue Command')).not.toBeInTheDocument();
      expect(screen.getByText('PR Command')).toBeInTheDocument();
    });

    it('updates add button text when switching categories', () => {
      render(<CommandEditor {...defaultProps} />);

      expect(screen.getByRole('button', { name: '+ Add Issue Command' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'pr Commands' }));

      expect(screen.getByRole('button', { name: '+ Add PR Command' })).toBeInTheDocument();
    });

    it('closes editor when switching categories', async () => {
      render(<CommandEditor {...defaultProps} />);

      // Open new command editor
      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));
      expect(screen.getByText('New Command')).toBeInTheDocument();

      // Switch to PR tab
      fireEvent.click(screen.getByRole('button', { name: 'pr Commands' }));

      // Editor should be closed
      expect(screen.queryByText('New Command')).not.toBeInTheDocument();
    });
  });

  describe('Creating New Commands', () => {
    it('shows editor form when add button is clicked', () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      expect(screen.getByText('New Command')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Short Name (for button)')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Prompt Template')).toBeInTheDocument();
      expect(getNameInput()).toBeInTheDocument();
      expect(getShortNameInput()).toBeInTheDocument();
      expect(getDescriptionInput()).toBeInTheDocument();
      expect(getTemplateInput()).toBeInTheDocument();
    });

    it('shows validation error when required fields are empty', async () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(screen.getByText('Name, short name, and description are required')).toBeInTheDocument();
      });
    });

    it('shows validation error when only name is filled', async () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      fireEvent.change(getNameInput(), { target: { value: 'My Command' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(screen.getByText('Name, short name, and description are required')).toBeInTheDocument();
      });
    });

    it('creates command with all required fields', async () => {
      const onRefresh = vi.fn();
      render(<CommandEditor {...defaultProps} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      fireEvent.change(getNameInput(), { target: { value: 'My Command' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'MC' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test description' } });
      fireEvent.change(getTemplateInput(), { target: { value: 'Please do {{number}}' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(useApiModule.createCommand).toHaveBeenCalledWith(
          'issue',
          {
            name: 'My Command',
            shortName: 'MC',
            description: 'Test description',
            template: 'Please do {{number}}',
          },
          undefined
        );
      });

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it('creates command for PR category when on PR tab', async () => {
      render(<CommandEditor {...defaultProps} />);

      // Switch to PR tab
      fireEvent.click(screen.getByRole('button', { name: 'pr Commands' }));
      fireEvent.click(screen.getByRole('button', { name: '+ Add PR Command' }));

      fireEvent.change(getNameInput(), { target: { value: 'Review PR' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'Rev' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Review the PR' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(useApiModule.createCommand).toHaveBeenCalledWith(
          'pr',
          expect.any(Object),
          undefined
        );
      });
    });

    it('closes editor after successful save', async () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));
      expect(screen.getByText('New Command')).toBeInTheDocument();

      fireEvent.change(getNameInput(), { target: { value: 'My Command' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'MC' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(screen.queryByText('New Command')).not.toBeInTheDocument();
      });
    });

    it('shows error message when create fails', async () => {
      vi.mocked(useApiModule.createCommand).mockRejectedValue(new Error('Failed to create'));

      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      fireEvent.change(getNameInput(), { target: { value: 'My Command' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'MC' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to create')).toBeInTheDocument();
      });
    });

    it('shows generic error for non-Error exceptions', async () => {
      vi.mocked(useApiModule.createCommand).mockRejectedValue('string error');

      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      fireEvent.change(getNameInput(), { target: { value: 'My Command' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'MC' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to save command')).toBeInTheDocument();
      });
    });

    it('trims whitespace from input fields when saving', async () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      fireEvent.change(getNameInput(), { target: { value: '  My Command  ' } });
      fireEvent.change(getShortNameInput(), { target: { value: '  MC  ' } });
      fireEvent.change(getDescriptionInput(), { target: { value: '  Test description  ' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(useApiModule.createCommand).toHaveBeenCalledWith(
          'issue',
          {
            name: 'My Command',
            shortName: 'MC',
            description: 'Test description',
            template: '',
          },
          undefined
        );
      });
    });
  });

  describe('Editing Commands', () => {
    it('shows edit form when edit button is clicked', () => {
      const commands = createMockCommands([
        { name: 'Investigate', shortName: 'Inv', description: 'Check the issue', template: 'Check {{number}}' },
      ]);
      render(<CommandEditor {...defaultProps} commands={commands} />);

      // Find and click edit button
      const editButton = screen.getByRole('button', { name: 'Edit' });
      fireEvent.click(editButton);

      expect(screen.getByText('Edit: Investigate')).toBeInTheDocument();
      expect(getNameInput()).toHaveValue('Investigate');
      expect(getShortNameInput()).toHaveValue('Inv');
      expect(getDescriptionInput()).toHaveValue('Check the issue');
    });

    it('populates template field in edit form', () => {
      const commands = createMockCommands([
        { name: 'Investigate', template: 'Check {{number}}' },
      ]);
      render(<CommandEditor {...defaultProps} commands={commands} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(getTemplateInput()).toHaveValue('Check {{number}}');
    });

    it('updates command when save is clicked', async () => {
      const onRefresh = vi.fn();
      const commands = createMockCommands([
        { id: 'cmd-123', name: 'Investigate', shortName: 'Inv', description: 'Check it', template: 'Template here' },
      ]);
      render(<CommandEditor {...defaultProps} commands={commands} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      fireEvent.change(getNameInput(), { target: { value: 'Updated Name' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(useApiModule.updateCommand).toHaveBeenCalledWith(
          'issue',
          'cmd-123',
          {
            name: 'Updated Name',
            shortName: 'Inv',
            description: 'Check it',
            template: 'Template here',
          },
          undefined
        );
      });

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it('clears error when opening edit form', async () => {
      vi.mocked(useApiModule.createCommand).mockRejectedValue(new Error('Create failed'));

      render(<CommandEditor {...defaultProps} commands={createMockCommands([{ name: 'Cmd' }])} />);

      // Create an error by failing to save a new command
      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));
      fireEvent.change(getNameInput(), { target: { value: 'Test' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'T' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(screen.getByText('Create failed')).toBeInTheDocument();
      });

      // Close the editor
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Now open edit on existing command
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      // Error should be cleared
      expect(screen.queryByText('Create failed')).not.toBeInTheDocument();
    });
  });

  describe('Deleting Commands', () => {
    it('shows delete confirmation and deletes on confirm', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const onRefresh = vi.fn();
      const commands = createMockCommands([
        { id: 'cmd-123', name: 'Delete Me', source: 'repo' },
      ]);

      render(<CommandEditor {...defaultProps} commands={commands} repoPath="/repo" onRefresh={onRefresh} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(confirmSpy).toHaveBeenCalledWith('Delete command "Delete Me"?');

      await waitFor(() => {
        expect(useApiModule.deleteCommand).toHaveBeenCalledWith('issue', 'cmd-123', '/repo');
      });

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });

      confirmSpy.mockRestore();
    });

    it('does not delete when confirmation is cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const commands = createMockCommands([{ id: 'cmd-123', name: 'Keep Me' }]);

      render(<CommandEditor {...defaultProps} commands={commands} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(useApiModule.deleteCommand).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('shows error when delete fails', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(useApiModule.deleteCommand).mockRejectedValue(new Error('Delete failed'));

      const commands = createMockCommands([{ id: 'cmd-123', name: 'Test' }]);
      render(<CommandEditor {...defaultProps} commands={commands} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });

      confirmSpy.mockRestore();
    });

    it('shows generic error for non-Error delete exceptions', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(useApiModule.deleteCommand).mockRejectedValue('string error');

      const commands = createMockCommands([{ id: 'cmd-123', name: 'Test' }]);
      render(<CommandEditor {...defaultProps} commands={commands} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to delete command')).toBeInTheDocument();
      });

      confirmSpy.mockRestore();
    });

    it('uses repo path for repo commands', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const commands = createMockCommands([{ id: 'cmd-123', name: 'Repo Cmd', source: 'repo' }]);

      render(<CommandEditor {...defaultProps} commands={commands} repoPath="/path/to/repo" />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(useApiModule.deleteCommand).toHaveBeenCalledWith('issue', 'cmd-123', '/path/to/repo');
      });

      confirmSpy.mockRestore();
    });

    it('does not use repo path for builtin commands', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const commands = createMockCommands([{ id: 'cmd-123', name: 'Builtin Cmd', source: 'builtin' }]);

      render(<CommandEditor {...defaultProps} commands={commands} repoPath="/path/to/repo" />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(useApiModule.deleteCommand).toHaveBeenCalledWith('issue', 'cmd-123', undefined);
      });

      confirmSpy.mockRestore();
    });
  });

  describe('Editor Form Controls', () => {
    it('closes editor when cancel button is clicked', () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));
      expect(screen.getByText('New Command')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('New Command')).not.toBeInTheDocument();
    });

    it('closes editor when X button is clicked', () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));
      expect(screen.getByText('New Command')).toBeInTheDocument();

      // Find the close X button in the header
      const closeButton = document.querySelector('.hover\\:text-white svg')?.closest('button');
      if (closeButton) {
        fireEvent.click(closeButton);
      }

      expect(screen.queryByText('New Command')).not.toBeInTheDocument();
    });

    it('shows saving state on save button', async () => {
      // Make createCommand hang
      vi.mocked(useApiModule.createCommand).mockImplementation(() => new Promise(() => {}));

      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      fireEvent.change(getNameInput(), { target: { value: 'Test' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'T' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Saving...' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
      });
    });

    it('updates name input value', () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      const nameInput = getNameInput();
      fireEvent.change(nameInput, { target: { value: 'New Name' } });

      expect(nameInput).toHaveValue('New Name');
    });

    it('updates short name input value', () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      const shortNameInput = getShortNameInput();
      fireEvent.change(shortNameInput, { target: { value: 'SN' } });

      expect(shortNameInput).toHaveValue('SN');
    });

    it('updates description input value', () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      const descInput = getDescriptionInput();
      fireEvent.change(descInput, { target: { value: 'A new description' } });

      expect(descInput).toHaveValue('A new description');
    });

    it('updates template textarea value', () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      const templateInput = getTemplateInput();
      fireEvent.change(templateInput, { target: { value: 'Check {{title}}' } });

      expect(templateInput).toHaveValue('Check {{title}}');
    });
  });

  describe('Save to Repo Checkbox', () => {
    it('does not show checkbox when no repoPath', () => {
      render(<CommandEditor {...defaultProps} repoPath={null} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      expect(screen.queryByLabelText(/Save to current repo/)).not.toBeInTheDocument();
    });

    it('shows checkbox when repoPath is provided', () => {
      render(<CommandEditor {...defaultProps} repoPath="/home/user/my-project" />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      expect(screen.getByLabelText(/Save to current repo/)).toBeInTheDocument();
      expect(screen.getByText(/my-project/)).toBeInTheDocument();
    });

    it('checkbox is checked by default', () => {
      render(<CommandEditor {...defaultProps} repoPath="/home/user/project" />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      const checkbox = screen.getByLabelText(/Save to current repo/);
      expect(checkbox).toBeChecked();
    });

    it('can uncheck save to repo checkbox', () => {
      render(<CommandEditor {...defaultProps} repoPath="/home/user/project" />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      const checkbox = screen.getByLabelText(/Save to current repo/);
      fireEvent.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    it('saves to repo when checkbox is checked', async () => {
      render(<CommandEditor {...defaultProps} repoPath="/home/user/project" />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      fireEvent.change(getNameInput(), { target: { value: 'Test' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'T' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(useApiModule.createCommand).toHaveBeenCalledWith(
          'issue',
          expect.any(Object),
          '/home/user/project'
        );
      });
    });

    it('saves globally when checkbox is unchecked', async () => {
      render(<CommandEditor {...defaultProps} repoPath="/home/user/project" />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      fireEvent.change(getNameInput(), { target: { value: 'Test' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'T' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test' } });

      // Uncheck the save to repo checkbox
      fireEvent.click(screen.getByLabelText(/Save to current repo/));

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(useApiModule.createCommand).toHaveBeenCalledWith(
          'issue',
          expect.any(Object),
          undefined
        );
      });
    });

    it('uses repo path for update when checkbox is checked', async () => {
      const commands = createMockCommands([{ id: 'cmd-1', name: 'Edit Me' }]);
      render(<CommandEditor {...defaultProps} commands={commands} repoPath="/path/to/repo" />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      // Ensure checkbox is checked (default)
      const checkbox = screen.getByLabelText(/Save to current repo/);
      expect(checkbox).toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(useApiModule.updateCommand).toHaveBeenCalledWith(
          'issue',
          'cmd-1',
          expect.any(Object),
          '/path/to/repo'
        );
      });
    });
  });

  describe('Template Placeholder Hint', () => {
    it('shows template placeholder hint', () => {
      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      expect(screen.getByText(/for placeholders/)).toBeInTheDocument();
    });
  });

  describe('Error Display', () => {
    it('shows error in a styled error box', async () => {
      vi.mocked(useApiModule.createCommand).mockRejectedValue(new Error('API Error'));

      render(<CommandEditor {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      fireEvent.change(getNameInput(), { target: { value: 'Test' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'T' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        const errorBox = screen.getByText('API Error').closest('div');
        expect(errorBox).toHaveClass('bg-red-900/50', 'border-red-700');
      });
    });

    it('clears error when opening new command form', async () => {
      vi.mocked(useApiModule.createCommand).mockRejectedValueOnce(new Error('Error 1'));
      vi.mocked(useApiModule.createCommand).mockResolvedValueOnce(createMockCommand());

      render(<CommandEditor {...defaultProps} />);

      // Create first error
      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));
      fireEvent.change(getNameInput(), { target: { value: 'Test' } });
      fireEvent.change(getShortNameInput(), { target: { value: 'T' } });
      fireEvent.change(getDescriptionInput(), { target: { value: 'Test' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Command' }));

      await waitFor(() => {
        expect(screen.getByText('Error 1')).toBeInTheDocument();
      });

      // Cancel and create new
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: '+ Add Issue Command' }));

      // Error should be cleared
      expect(screen.queryByText('Error 1')).not.toBeInTheDocument();
    });
  });
});
