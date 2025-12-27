import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StartSessionButton, type SessionableIssue } from './StartSessionButton';
import type { CommandMetadata } from '../types';

function createMockIssue(overrides: Partial<SessionableIssue> = {}): SessionableIssue {
  return {
    number: 42,
    title: 'Test Issue',
    body: 'This is a test issue body',
    ...overrides,
  };
}

function createMockCommand(overrides: Partial<CommandMetadata> = {}): CommandMetadata {
  return {
    id: 'cmd-1',
    name: 'Analyze Issue',
    shortName: 'Analyze',
    description: 'Analyze the issue and suggest fixes',
    template: 'analyze {{issue}}',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('StartSessionButton', () => {
  const defaultProps = {
    issue: createMockIssue(),
    commands: [] as CommandMetadata[],
    onStart: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading button when no commands provided', () => {
      render(<StartSessionButton {...defaultProps} commands={[]} />);

      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Loading...');
      expect(button).toBeDisabled();
    });

    it('has correct styling for loading state', () => {
      render(<StartSessionButton {...defaultProps} commands={[]} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gray-600', 'cursor-not-allowed');
    });
  });

  describe('With Commands', () => {
    const commands = [
      createMockCommand({ id: 'cmd-1', name: 'Analyze Issue', shortName: 'Analyze', description: 'Analyze the issue deeply' }),
      createMockCommand({ id: 'cmd-2', name: 'Fix Issue', shortName: 'Fix', description: 'Fix the issue' }),
    ];

    it('renders main button with first command shortName', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      // Main button should show first command's shortName - use getAllByText since it appears in dropdown too
      const buttons = screen.getAllByRole('button');
      const mainButton = buttons.find(btn => btn.textContent === 'Analyze');
      expect(mainButton).toBeInTheDocument();
    });

    it('renders dropdown trigger button', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      const dropdownButton = screen.getByLabelText('Select session type');
      expect(dropdownButton).toBeInTheDocument();
    });

    it('calls onStart with selected command when main button clicked', () => {
      const onStart = vi.fn();
      const issue = createMockIssue();

      render(
        <StartSessionButton
          {...defaultProps}
          issue={issue}
          commands={commands}
          onStart={onStart}
        />
      );

      // Click the main button - it's the first button with "Analyze" text that is NOT the dropdown item
      const buttons = screen.getAllByRole('button');
      const mainButton = buttons.find(btn => btn.textContent === 'Analyze');
      fireEvent.click(mainButton!);

      expect(onStart).toHaveBeenCalledWith(issue, commands[0]);
    });

    it('shows dropdown menu when dropdown trigger clicked', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      // Should show all command names in dropdown
      expect(screen.getByText('Analyze Issue')).toBeInTheDocument();
      expect(screen.getByText('Fix Issue')).toBeInTheDocument();
    });

    it('hides dropdown by default', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      // Dropdown should have opacity-0 and pointer-events-none when hidden
      const dropdown = screen.getByRole('button', { name: 'Select session type' })
        .parentElement?.querySelector('[class*="absolute"]');
      expect(dropdown).toHaveClass('opacity-0', 'pointer-events-none');
    });

    it('shows dropdown when trigger clicked', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      const dropdown = dropdownButton.parentElement?.querySelector('[class*="absolute"]');
      expect(dropdown).toHaveClass('opacity-100');
      expect(dropdown).not.toHaveClass('pointer-events-none');
    });

    it('selects command and starts session when command clicked in dropdown', () => {
      const onStart = vi.fn();
      const issue = createMockIssue();

      render(
        <StartSessionButton
          {...defaultProps}
          issue={issue}
          commands={commands}
          onStart={onStart}
        />
      );

      // Open dropdown
      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      // Click second command
      fireEvent.click(screen.getByText('Fix Issue'));

      expect(onStart).toHaveBeenCalledWith(issue, commands[1]);
    });

    it('closes dropdown after selecting command', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      // Open dropdown
      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      // Click a command
      fireEvent.click(screen.getByText('Fix Issue'));

      // Dropdown should be closed
      const dropdown = dropdownButton.parentElement?.querySelector('[class*="absolute"]');
      expect(dropdown).toHaveClass('opacity-0');
    });

    it('shows checkmark next to selected command', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      // Open dropdown
      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      // First command should be selected (default)
      // Find the button for the first command and check for checkmark SVG
      const analyzeButton = screen.getAllByRole('button').find(
        btn => btn.textContent?.includes('Analyze') && btn.textContent?.includes('Analyze the issue')
      );
      expect(analyzeButton?.querySelector('svg')).toBeInTheDocument();
    });

    it('highlights selected command in dropdown', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      // Open dropdown
      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      // First command should have bg-gray-700 (selected style)
      const commandButtons = screen.getAllByRole('button').filter(
        btn => btn.classList.contains('w-full')
      );
      expect(commandButtons[0]).toHaveClass('bg-gray-700');
    });

    it('displays command descriptions in dropdown', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      // Open dropdown
      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      expect(screen.getByText('Analyze the issue deeply')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    const commands = [createMockCommand()];

    it('applies small size classes when size="sm"', () => {
      render(
        <StartSessionButton
          {...defaultProps}
          commands={commands}
          size="sm"
        />
      );

      const mainButton = screen.getByText('Analyze');
      expect(mainButton).toHaveClass('text-xs', 'py-1');
    });

    it('applies medium size classes when size="md"', () => {
      render(
        <StartSessionButton
          {...defaultProps}
          commands={commands}
          size="md"
        />
      );

      const mainButton = screen.getByText('Analyze');
      expect(mainButton).toHaveClass('text-sm', 'py-2');
    });

    it('defaults to medium size', () => {
      render(
        <StartSessionButton
          {...defaultProps}
          commands={commands}
        />
      );

      const mainButton = screen.getByText('Analyze');
      expect(mainButton).toHaveClass('text-sm', 'py-2');
    });
  });

  describe('Custom className', () => {
    it('applies custom className to container', () => {
      const commands = [createMockCommand()];

      const { container } = render(
        <StartSessionButton
          {...defaultProps}
          commands={commands}
          className="my-custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('my-custom-class');
    });
  });

  describe('Click Outside Behavior', () => {
    const commands = [createMockCommand(), createMockCommand({ id: 'cmd-2', name: 'Other' })];

    it('closes dropdown when clicking outside', () => {
      render(
        <div>
          <StartSessionButton {...defaultProps} commands={commands} />
          <div data-testid="outside">Outside element</div>
        </div>
      );

      // Open dropdown
      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      // Verify dropdown is open
      let dropdown = dropdownButton.parentElement?.querySelector('[class*="absolute"]');
      expect(dropdown).toHaveClass('opacity-100');

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside'));

      // Dropdown should be closed
      dropdown = dropdownButton.parentElement?.querySelector('[class*="absolute"]');
      expect(dropdown).toHaveClass('opacity-0');
    });
  });

  describe('Accessibility', () => {
    const commands = [createMockCommand()];

    it('has aria-expanded on dropdown trigger', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      const dropdownButton = screen.getByLabelText('Select session type');
      expect(dropdownButton).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(dropdownButton);

      expect(dropdownButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('has aria-haspopup on dropdown trigger', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      const dropdownButton = screen.getByLabelText('Select session type');
      expect(dropdownButton).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('has focus ring styles on buttons', () => {
      render(<StartSessionButton {...defaultProps} commands={commands} />);

      const mainButton = screen.getByText('Analyze');
      expect(mainButton).toHaveClass('focus:outline-none', 'focus:ring-2');
    });
  });

  describe('Event Propagation', () => {
    const commands = [createMockCommand()];

    it('stops event propagation when dropdown trigger clicked', () => {
      const parentClick = vi.fn();

      render(
        <div onClick={parentClick}>
          <StartSessionButton {...defaultProps} commands={commands} />
        </div>
      );

      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      expect(parentClick).not.toHaveBeenCalled();
    });

    it('stops event propagation when command selected from dropdown', () => {
      const parentClick = vi.fn();

      render(
        <div onClick={parentClick}>
          <StartSessionButton {...defaultProps} commands={commands} />
        </div>
      );

      // Open dropdown
      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);

      // Click command in dropdown
      const commandButtons = screen.getAllByRole('button').filter(
        btn => btn.classList.contains('w-full')
      );
      fireEvent.click(commandButtons[0]);

      expect(parentClick).not.toHaveBeenCalled();
    });
  });

  describe('Fallback shortName', () => {
    it('shows "Start" when selectedCommand has no shortName', () => {
      const commands = [createMockCommand({ shortName: undefined })];

      render(<StartSessionButton {...defaultProps} commands={commands} />);

      expect(screen.getByText('Start')).toBeInTheDocument();
    });
  });

  describe('Command Selection Persistence', () => {
    it('remembers selected command across dropdown opens', () => {
      const commands = [
        createMockCommand({ id: 'cmd-1', name: 'Analyze', shortName: 'Analyze' }),
        createMockCommand({ id: 'cmd-2', name: 'Fix Issue', shortName: 'Fix' }),
      ];

      render(<StartSessionButton {...defaultProps} commands={commands} />);

      // Open dropdown and select second command
      const dropdownButton = screen.getByLabelText('Select session type');
      fireEvent.click(dropdownButton);
      fireEvent.click(screen.getByText('Fix Issue'));

      // Main button should now show "Fix"
      expect(screen.getByText('Fix')).toBeInTheDocument();

      // Open dropdown again - second command should still be selected
      fireEvent.click(dropdownButton);

      const commandButtons = screen.getAllByRole('button').filter(
        btn => btn.classList.contains('w-full')
      );
      // Second command should have selected styling
      expect(commandButtons[1]).toHaveClass('bg-gray-700');
    });
  });
});
