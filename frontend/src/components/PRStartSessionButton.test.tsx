import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PRStartSessionButton } from './PRStartSessionButton';
import type { PR, CommandMetadata } from '../types';

// Helper to create mock PR
function createMockPR(overrides: Partial<PR> = {}): PR {
  return {
    number: 42,
    title: 'Test PR',
    body: 'Test body',
    state: 'open',
    labels: [],
    author: 'testuser',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    head_ref: 'feature-branch',
    base_ref: 'main',
    additions: 100,
    deletions: 50,
    changed_files: 5,
    comments_count: 0,
    url: 'https://github.com/test/repo/pull/42',
    ...overrides,
  };
}

// Helper to create mock commands
function createMockCommands(): CommandMetadata[] {
  return [
    {
      id: 'pr-review',
      name: 'Review PR',
      shortName: 'Review',
      description: 'Review this pull request',
      category: 'pr',
      template: 'Review PR #{number}',
      source: 'builtin',
    },
    {
      id: 'pr-test',
      name: 'Test PR',
      shortName: 'Test',
      description: 'Test the changes in this PR',
      category: 'pr',
      template: 'Test PR #{number}',
      source: 'builtin',
    },
    {
      id: 'pr-merge',
      name: 'Prepare Merge',
      shortName: 'Merge',
      description: 'Prepare this PR for merging',
      category: 'pr',
      template: 'Prepare PR #{number} for merge',
      source: 'builtin',
    },
  ];
}

describe('PRStartSessionButton', () => {
  const mockPR = createMockPR();
  const mockCommands = createMockCommands();
  const mockOnStart = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading button when no commands provided', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={[]}
          onStart={mockOnStart}
        />
      );

      // The button has aria-label "Loading session commands" and text content "Loading"
      const button = screen.getByRole('button', { name: /loading/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('does not show dropdown trigger in loading state', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={[]}
          onStart={mockOnStart}
        />
      );

      // Only the loading button should be present
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
    });
  });

  describe('Command Selection', () => {
    it('selects first command by default', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    });

    it('calls onStart with PR and selected command when main button clicked', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Review' }));

      expect(mockOnStart).toHaveBeenCalledWith(mockPR, mockCommands[0]);
    });

    it('shows dropdown when dropdown trigger clicked', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      expect(screen.getByText('Review PR')).toBeInTheDocument();
      expect(screen.getByText('Test PR')).toBeInTheDocument();
      expect(screen.getByText('Prepare Merge')).toBeInTheDocument();
    });

    it('shows command descriptions in dropdown', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      expect(screen.getByText('Review this pull request')).toBeInTheDocument();
      expect(screen.getByText('Test the changes in this PR')).toBeInTheDocument();
      expect(screen.getByText('Prepare this PR for merging')).toBeInTheDocument();
    });

    it('selects command and calls onStart when command clicked in dropdown', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      fireEvent.click(screen.getByText('Test PR'));

      expect(mockOnStart).toHaveBeenCalledWith(mockPR, mockCommands[1]);
    });

    it('closes dropdown after command selection', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      expect(screen.getByText('Test PR')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Test PR'));

      // Dropdown should be removed from DOM (conditional rendering)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('highlights currently selected command in dropdown', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      // First command should be selected and have bg-gray-750
      const firstCommandButton = screen.getByText('Review PR').closest('button');
      expect(firstCommandButton).toHaveClass('bg-gray-750');

      // First command should have checkmark
      const checkmark = firstCommandButton?.querySelector('svg');
      expect(checkmark).toBeInTheDocument();
    });
  });

  describe('Click Outside Behavior', () => {
    it('closes dropdown when clicking outside', async () => {
      render(
        <div>
          <div data-testid="outside">Outside element</div>
          <PRStartSessionButton
            pr={mockPR}
            commands={mockCommands}
            onStart={mockOnStart}
          />
        </div>
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside'));

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('keeps dropdown open when clicking inside dropdown', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      // Click on command description (inside dropdown but not on button)
      const description = screen.getByText('Review this pull request');
      fireEvent.mouseDown(description);

      // Dropdown should still be visible
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('Event Propagation', () => {
    it('stops propagation when main button clicked', () => {
      const parentHandler = vi.fn();
      render(
        <div onClick={parentHandler}>
          <PRStartSessionButton
            pr={mockPR}
            commands={mockCommands}
            onStart={mockOnStart}
          />
        </div>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Review' }));

      expect(mockOnStart).toHaveBeenCalled();
      expect(parentHandler).not.toHaveBeenCalled();
    });

    it('stops propagation when dropdown trigger clicked', () => {
      const parentHandler = vi.fn();
      render(
        <div onClick={parentHandler}>
          <PRStartSessionButton
            pr={mockPR}
            commands={mockCommands}
            onStart={mockOnStart}
          />
        </div>
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      expect(parentHandler).not.toHaveBeenCalled();
    });

    it('stops propagation when dropdown item clicked', () => {
      const parentHandler = vi.fn();
      render(
        <div onClick={parentHandler}>
          <PRStartSessionButton
            pr={mockPR}
            commands={mockCommands}
            onStart={mockOnStart}
          />
        </div>
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);
      fireEvent.click(screen.getByText('Test PR'));

      expect(parentHandler).not.toHaveBeenCalled();
    });
  });

  describe('Size Variants', () => {
    it('renders with small size', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
          size="sm"
        />
      );

      const mainButton = screen.getByRole('button', { name: 'Review' });
      expect(mainButton).toHaveClass('text-xs');
      expect(mainButton).toHaveClass('py-1');
    });

    it('renders with medium size by default', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const mainButton = screen.getByRole('button', { name: 'Review' });
      expect(mainButton).toHaveClass('text-sm');
      expect(mainButton).toHaveClass('py-2');
    });

    it('renders with explicit medium size', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
          size="md"
        />
      );

      const mainButton = screen.getByRole('button', { name: 'Review' });
      expect(mainButton).toHaveClass('text-sm');
      expect(mainButton).toHaveClass('py-2');
    });
  });

  describe('Custom className', () => {
    it('applies custom className to container', () => {
      const { container } = render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
          className="my-custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('my-custom-class');
    });
  });

  describe('Accessibility', () => {
    it('has proper aria attributes on dropdown trigger', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      expect(dropdownTrigger).toHaveAttribute('aria-haspopup', 'listbox');
      expect(dropdownTrigger).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(dropdownTrigger);

      expect(dropdownTrigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('has focus styles on buttons', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const mainButton = screen.getByRole('button', { name: 'Review' });
      expect(mainButton).toHaveClass('focus:outline-none');
      expect(mainButton).toHaveClass('focus-visible:ring-2');
    });

    it('has role="option" on dropdown items', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(3);
    });

    it('has aria-selected on dropdown items', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
      expect(options[1]).toHaveAttribute('aria-selected', 'false');
      expect(options[2]).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates down with ArrowDown key', async () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      const options = screen.getAllByRole('option');
      // First option should be focused initially
      await waitFor(() => {
        expect(document.activeElement).toBe(options[0]);
      });

      // Press ArrowDown
      fireEvent.keyDown(options[0], { key: 'ArrowDown' });

      await waitFor(() => {
        expect(document.activeElement).toBe(options[1]);
      });
    });

    it('navigates up with ArrowUp key', async () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      const options = screen.getAllByRole('option');
      // First option should be focused initially
      await waitFor(() => {
        expect(document.activeElement).toBe(options[0]);
      });

      // Press ArrowUp (should wrap to last item)
      fireEvent.keyDown(options[0], { key: 'ArrowUp' });

      await waitFor(() => {
        expect(document.activeElement).toBe(options[2]);
      });
    });

    it('closes dropdown with Escape key', async () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      const options = screen.getAllByRole('option');
      fireEvent.keyDown(options[0], { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('jumps to first item with Home key', async () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      const options = screen.getAllByRole('option');
      // Navigate to last item first
      fireEvent.keyDown(options[0], { key: 'End' });

      await waitFor(() => {
        expect(document.activeElement).toBe(options[2]);
      });

      // Press Home to jump to first
      fireEvent.keyDown(options[2], { key: 'Home' });

      await waitFor(() => {
        expect(document.activeElement).toBe(options[0]);
      });
    });

    it('jumps to last item with End key', async () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      const options = screen.getAllByRole('option');
      await waitFor(() => {
        expect(document.activeElement).toBe(options[0]);
      });

      // Press End to jump to last
      fireEvent.keyDown(options[0], { key: 'End' });

      await waitFor(() => {
        expect(document.activeElement).toBe(options[2]);
      });
    });

    it('selects command with Enter key', async () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      const options = screen.getAllByRole('option');
      // Navigate to second option
      fireEvent.keyDown(options[0], { key: 'ArrowDown' });

      await waitFor(() => {
        expect(document.activeElement).toBe(options[1]);
      });

      // Press Enter to select
      fireEvent.keyDown(options[1], { key: 'Enter' });

      expect(mockOnStart).toHaveBeenCalledWith(mockPR, mockCommands[1]);
    });

    it('selects command with Space key', async () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      const options = screen.getAllByRole('option');
      // Navigate to third option
      fireEvent.keyDown(options[0], { key: 'End' });

      await waitFor(() => {
        expect(document.activeElement).toBe(options[2]);
      });

      // Press Space to select
      fireEvent.keyDown(options[2], { key: ' ' });

      expect(mockOnStart).toHaveBeenCalledWith(mockPR, mockCommands[2]);
    });

    it('wraps around when navigating past last item', async () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);

      const options = screen.getAllByRole('option');
      // Navigate to last item
      fireEvent.keyDown(options[0], { key: 'End' });

      await waitFor(() => {
        expect(document.activeElement).toBe(options[2]);
      });

      // Press ArrowDown (should wrap to first)
      fireEvent.keyDown(options[2], { key: 'ArrowDown' });

      await waitFor(() => {
        expect(document.activeElement).toBe(options[0]);
      });
    });
  });

  describe('Toggle Dropdown', () => {
    it('toggles dropdown visibility', () => {
      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });

      // Open dropdown
      fireEvent.click(dropdownTrigger);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      // Close dropdown
      fireEvent.click(dropdownTrigger);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('Command Updates', () => {
    it('selects first command when commands load', async () => {
      const { rerender } = render(
        <PRStartSessionButton
          pr={mockPR}
          commands={[]}
          onStart={mockOnStart}
        />
      );

      expect(screen.getByRole('button', { name: /loading/i })).toBeInTheDocument();

      rerender(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
      });
    });

    it('maintains selected command when new commands arrive', async () => {
      const { rerender } = render(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      // Open dropdown and select second command
      const dropdownTrigger = screen.getByRole('button', { name: 'Select PR session type' });
      fireEvent.click(dropdownTrigger);
      fireEvent.click(screen.getByText('Test PR'));

      // Now the button should show "Test"
      expect(screen.getByRole('button', { name: 'Test' })).toBeInTheDocument();

      // Rerender with same commands
      rerender(
        <PRStartSessionButton
          pr={mockPR}
          commands={mockCommands}
          onStart={mockOnStart}
        />
      );

      // Should still show "Test"
      expect(screen.getByRole('button', { name: 'Test' })).toBeInTheDocument();
    });
  });

  describe('Fallback Display', () => {
    it('shows "Start" when selected command has no shortName', () => {
      const commandsWithoutShortName: CommandMetadata[] = [
        {
          id: 'pr-review',
          name: 'Review PR',
          shortName: '',
          description: 'Review this pull request',
          category: 'pr',
          template: 'Review PR #{number}',
          source: 'builtin',
        },
      ];

      render(
        <PRStartSessionButton
          pr={mockPR}
          commands={commandsWithoutShortName}
          onStart={mockOnStart}
        />
      );

      expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    });
  });
});
