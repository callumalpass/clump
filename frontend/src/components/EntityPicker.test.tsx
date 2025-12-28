import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { EntityPicker } from './EntityPicker';
import type { Issue, PR, EntityLink } from '../types';

function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: 'Test Issue',
    body: 'Issue body',
    state: 'open',
    labels: [],
    author: 'testuser',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:30:00Z',
    comments_count: 0,
    url: 'https://github.com/owner/repo/issues/1',
    ...overrides,
  };
}

function createMockPR(overrides: Partial<PR> = {}): PR {
  return {
    number: 10,
    title: 'Test PR',
    body: 'PR body',
    state: 'open',
    labels: [],
    author: 'prauthor',
    created_at: '2024-01-15T09:00:00Z',
    updated_at: '2024-01-15T11:00:00Z',
    head_ref: 'feature-branch',
    base_ref: 'main',
    additions: 50,
    deletions: 10,
    changed_files: 3,
    comments_count: 0,
    url: 'https://github.com/owner/repo/pull/10',
    ...overrides,
  };
}

describe('EntityPicker', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    entityType: 'issue' as const,
    issues: [] as Issue[],
    prs: [] as PR[],
    linkedEntities: [] as EntityLink[],
    onAdd: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('does not render when isOpen is false', () => {
      render(<EntityPicker {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('renders modal when isOpen is true', () => {
      render(<EntityPicker {...defaultProps} />);

      expect(screen.getByRole('heading', { name: 'Link Issue' })).toBeInTheDocument();
    });

    it('renders with "Link PR" title when entityType is pr', () => {
      render(<EntityPicker {...defaultProps} entityType="pr" />);

      expect(screen.getByRole('heading', { name: 'Link PR' })).toBeInTheDocument();
    });

    it('renders search input with correct placeholder for issues', () => {
      render(<EntityPicker {...defaultProps} entityType="issue" />);

      expect(screen.getByPlaceholderText('Search issues...')).toBeInTheDocument();
    });

    it('renders search input with correct placeholder for PRs', () => {
      render(<EntityPicker {...defaultProps} entityType="pr" />);

      expect(screen.getByPlaceholderText('Search PRs...')).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(<EntityPicker {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('shows "No issues available" when no issues exist', () => {
      render(<EntityPicker {...defaultProps} issues={[]} />);

      expect(screen.getByText('No issues available')).toBeInTheDocument();
    });

    it('shows "No PRs available" when no PRs exist', () => {
      render(<EntityPicker {...defaultProps} entityType="pr" prs={[]} />);

      expect(screen.getByText('No PRs available')).toBeInTheDocument();
    });

    it('shows "No issues found" when search yields no results', () => {
      const issues = [createMockIssue({ number: 1, title: 'First Issue' })];
      render(<EntityPicker {...defaultProps} issues={issues} />);

      const searchInput = screen.getByPlaceholderText('Search issues...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No issues found')).toBeInTheDocument();
    });

    it('shows "No PRs found" when PR search yields no results', () => {
      const prs = [createMockPR({ number: 10, title: 'First PR' })];
      render(<EntityPicker {...defaultProps} entityType="pr" prs={prs} />);

      const searchInput = screen.getByPlaceholderText('Search PRs...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No PRs found')).toBeInTheDocument();
    });
  });

  describe('Issue List', () => {
    it('renders list of issues', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'First Issue' }),
        createMockIssue({ number: 2, title: 'Second Issue' }),
      ];
      render(<EntityPicker {...defaultProps} issues={issues} />);

      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('First Issue')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('Second Issue')).toBeInTheDocument();
    });

    it('displays issue state and author', () => {
      const issues = [
        createMockIssue({ number: 1, state: 'open', author: 'alice' }),
        createMockIssue({ number: 2, state: 'closed', author: 'bob' }),
      ];
      render(<EntityPicker {...defaultProps} issues={issues} />);

      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.getByText(/alice/)).toBeInTheDocument();
      expect(screen.getByText('Closed')).toBeInTheDocument();
      expect(screen.getByText(/bob/)).toBeInTheDocument();
    });
  });

  describe('PR List', () => {
    it('renders list of PRs', () => {
      const prs = [
        createMockPR({ number: 10, title: 'First PR' }),
        createMockPR({ number: 20, title: 'Second PR' }),
      ];
      render(<EntityPicker {...defaultProps} entityType="pr" prs={prs} />);

      expect(screen.getByText('#10')).toBeInTheDocument();
      expect(screen.getByText('First PR')).toBeInTheDocument();
      expect(screen.getByText('#20')).toBeInTheDocument();
      expect(screen.getByText('Second PR')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('filters issues by number', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'First' }),
        createMockIssue({ number: 12, title: 'Second' }),
        createMockIssue({ number: 123, title: 'Third' }),
      ];
      render(<EntityPicker {...defaultProps} issues={issues} />);

      const searchInput = screen.getByPlaceholderText('Search issues...');
      fireEvent.change(searchInput, { target: { value: '12' } });

      expect(screen.queryByText('#1')).not.toBeInTheDocument();
      expect(screen.getByText('#12')).toBeInTheDocument();
      expect(screen.getByText('#123')).toBeInTheDocument();
    });

    it('filters issues by title (case insensitive)', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'Bug in login' }),
        createMockIssue({ number: 2, title: 'Feature request' }),
        createMockIssue({ number: 3, title: 'Login page redesign' }),
      ];
      render(<EntityPicker {...defaultProps} issues={issues} />);

      const searchInput = screen.getByPlaceholderText('Search issues...');
      fireEvent.change(searchInput, { target: { value: 'LOGIN' } });

      expect(screen.getByText('Bug in login')).toBeInTheDocument();
      expect(screen.queryByText('Feature request')).not.toBeInTheDocument();
      expect(screen.getByText('Login page redesign')).toBeInTheDocument();
    });

    it('resets search when modal is reopened', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'First' }),
        createMockIssue({ number: 2, title: 'Second' }),
      ];

      const { rerender } = render(<EntityPicker {...defaultProps} issues={issues} />);

      const searchInput = screen.getByPlaceholderText('Search issues...');
      fireEvent.change(searchInput, { target: { value: 'First' } });

      // Close modal
      rerender(<EntityPicker {...defaultProps} issues={issues} isOpen={false} />);

      // Reopen modal
      rerender(<EntityPicker {...defaultProps} issues={issues} isOpen={true} />);

      // Search should be reset and both items visible
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
      expect((screen.getByPlaceholderText('Search issues...') as HTMLInputElement).value).toBe('');
    });
  });

  describe('Linked Entity Indication', () => {
    it('marks already linked issues as linked', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'Linked Issue' }),
        createMockIssue({ number: 2, title: 'Unlinked Issue' }),
      ];
      const linkedEntities: EntityLink[] = [{ kind: 'issue', number: 1 }];

      render(<EntityPicker {...defaultProps} issues={issues} linkedEntities={linkedEntities} />);

      expect(screen.getByText('Linked')).toBeInTheDocument();
    });

    it('marks already linked PRs as linked', () => {
      const prs = [
        createMockPR({ number: 10, title: 'Linked PR' }),
        createMockPR({ number: 20, title: 'Unlinked PR' }),
      ];
      const linkedEntities: EntityLink[] = [{ kind: 'pr', number: 10 }];

      render(
        <EntityPicker {...defaultProps} entityType="pr" prs={prs} linkedEntities={linkedEntities} />
      );

      expect(screen.getByText('Linked')).toBeInTheDocument();
    });

    it('does not mark issue as linked when PR with same number is linked', () => {
      const issues = [createMockIssue({ number: 1, title: 'Issue #1' })];
      const linkedEntities: EntityLink[] = [{ kind: 'pr', number: 1 }];

      render(<EntityPicker {...defaultProps} issues={issues} linkedEntities={linkedEntities} />);

      expect(screen.queryByText('Linked')).not.toBeInTheDocument();
    });

    it('disables linked items', () => {
      const issues = [createMockIssue({ number: 1, title: 'Linked Issue' })];
      const linkedEntities: EntityLink[] = [{ kind: 'issue', number: 1 }];

      render(<EntityPicker {...defaultProps} issues={issues} linkedEntities={linkedEntities} />);

      const button = screen.getByRole('button', { name: /Linked Issue/ });
      expect(button).toBeDisabled();
    });
  });

  describe('Adding Entities', () => {
    it('calls onAdd when clicking an unlinked issue', async () => {
      const onAdd = vi.fn().mockResolvedValue(undefined);
      const issues = [createMockIssue({ number: 5, title: 'Click Me' })];

      render(<EntityPicker {...defaultProps} issues={issues} onAdd={onAdd} />);

      const button = screen.getByRole('button', { name: /Click Me/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(onAdd).toHaveBeenCalledWith('issue', 5);
      });
    });

    it('calls onAdd when clicking an unlinked PR', async () => {
      const onAdd = vi.fn().mockResolvedValue(undefined);
      const prs = [createMockPR({ number: 15, title: 'PR to Add' })];

      render(<EntityPicker {...defaultProps} entityType="pr" prs={prs} onAdd={onAdd} />);

      const button = screen.getByRole('button', { name: /PR to Add/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(onAdd).toHaveBeenCalledWith('pr', 15);
      });
    });

    it('does not call onAdd for already linked items', () => {
      const onAdd = vi.fn().mockResolvedValue(undefined);
      const issues = [createMockIssue({ number: 1, title: 'Linked Issue' })];
      const linkedEntities: EntityLink[] = [{ kind: 'issue', number: 1 }];

      render(
        <EntityPicker {...defaultProps} issues={issues} linkedEntities={linkedEntities} onAdd={onAdd} />
      );

      const button = screen.getByRole('button', { name: /Linked Issue/ });
      fireEvent.click(button);

      expect(onAdd).not.toHaveBeenCalled();
    });

    it('shows loading state while adding', async () => {
      let resolveAdd: () => void;
      const onAdd = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveAdd = resolve;
          })
      );
      const issues = [createMockIssue({ number: 1, title: 'Adding Issue' })];

      render(<EntityPicker {...defaultProps} issues={issues} onAdd={onAdd} />);

      const button = screen.getByRole('button', { name: /Adding Issue/ });
      fireEvent.click(button);

      // Button should show loading state
      await waitFor(() => {
        expect(button.className).toContain('cursor-wait');
      });

      // Resolve the promise
      resolveAdd!();

      await waitFor(() => {
        expect(button.className).not.toContain('cursor-wait');
      });
    });

    it('prevents double-clicking while adding', async () => {
      let resolveAdd: () => void;
      const onAdd = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveAdd = resolve;
          })
      );
      const issues = [createMockIssue({ number: 1, title: 'No Double Click' })];

      render(<EntityPicker {...defaultProps} issues={issues} onAdd={onAdd} />);

      const button = screen.getByRole('button', { name: /No Double Click/ });

      // Click once to start adding
      fireEvent.click(button);

      // Click again immediately
      fireEvent.click(button);

      // Should only be called once
      expect(onAdd).toHaveBeenCalledTimes(1);

      // Resolve and wait for state to settle
      await act(async () => {
        resolveAdd!();
      });
    });
  });

  describe('Modal Closing', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<EntityPicker {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when clicking backdrop', () => {
      const onClose = vi.fn();
      render(<EntityPicker {...defaultProps} onClose={onClose} />);

      // The backdrop is the first div with bg-black/60 class
      const backdrop = document.querySelector('.bg-black\\/60');
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<EntityPicker {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });

    it('does not respond to Escape when modal is closed', () => {
      const onClose = vi.fn();
      render(<EntityPicker {...defaultProps} isOpen={false} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Search Input Autofocus', () => {
    it('autofocuses search input when modal opens', () => {
      render(<EntityPicker {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search issues...');
      expect(document.activeElement).toBe(searchInput);
    });
  });

  describe('Issue State Display', () => {
    it('shows Open state with correct styling', () => {
      const issues = [createMockIssue({ number: 1, state: 'open' })];
      render(<EntityPicker {...defaultProps} issues={issues} />);

      const openText = screen.getByText('Open');
      expect(openText).toHaveClass('text-green-400');
    });

    it('shows Closed state with correct styling', () => {
      const issues = [createMockIssue({ number: 1, state: 'closed' })];
      render(<EntityPicker {...defaultProps} issues={issues} />);

      const closedText = screen.getByText('Closed');
      expect(closedText).toHaveClass('text-gray-400');
    });
  });

  describe('Entity Number Styling', () => {
    it('shows issue numbers with green styling', () => {
      const issues = [createMockIssue({ number: 42 })];
      render(<EntityPicker {...defaultProps} issues={issues} />);

      const numberElement = screen.getByText('#42');
      expect(numberElement).toHaveClass('text-green-400');
    });

    it('shows PR numbers with purple styling', () => {
      const prs = [createMockPR({ number: 99 })];
      render(<EntityPicker {...defaultProps} entityType="pr" prs={prs} />);

      const numberElement = screen.getByText('#99');
      expect(numberElement).toHaveClass('text-purple-400');
    });
  });

  describe('Large Lists', () => {
    it('handles a large list of issues', () => {
      const issues = Array.from({ length: 100 }, (_, i) =>
        createMockIssue({ number: i + 1, title: `Issue ${i + 1}` })
      );
      render(<EntityPicker {...defaultProps} issues={issues} />);

      // First and last should be visible in the DOM
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#100')).toBeInTheDocument();
    });

    it('filters large lists correctly', () => {
      const issues = Array.from({ length: 100 }, (_, i) =>
        createMockIssue({ number: i + 1, title: `Issue ${i + 1}` })
      );
      render(<EntityPicker {...defaultProps} issues={issues} />);

      const searchInput = screen.getByPlaceholderText('Search issues...');
      fireEvent.change(searchInput, { target: { value: 'Issue 50' } });

      expect(screen.getByText('Issue 50')).toBeInTheDocument();
      expect(screen.queryByText('Issue 49')).not.toBeInTheDocument();
      expect(screen.queryByText('Issue 51')).not.toBeInTheDocument();
    });
  });

  describe('Mixed Linked Entities', () => {
    it('correctly identifies linked entities when both issues and PRs are linked', () => {
      const issues = [
        createMockIssue({ number: 1, title: 'Issue 1' }),
        createMockIssue({ number: 2, title: 'Issue 2' }),
      ];
      const linkedEntities: EntityLink[] = [
        { kind: 'issue', number: 1 },
        { kind: 'pr', number: 100 }, // PR, should not affect issues
      ];

      render(<EntityPicker {...defaultProps} issues={issues} linkedEntities={linkedEntities} />);

      // Only issue 1 should show as linked
      const linkedTexts = screen.getAllByText('Linked');
      expect(linkedTexts).toHaveLength(1);

      // Issue 1 button should be disabled
      const issue1Button = screen.getByRole('button', { name: /Issue 1/ });
      expect(issue1Button).toBeDisabled();

      // Issue 2 button should be enabled
      const issue2Button = screen.getByRole('button', { name: /Issue 2/ });
      expect(issue2Button).not.toBeDisabled();
    });
  });
});
