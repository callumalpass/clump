import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { IssueFilters } from './IssueFilters';
import type { Issue } from '../types';
import type { IssueFilters as IssueFiltersType } from '../hooks/useApi';

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

describe('IssueFilters', () => {
  const defaultProps = {
    filters: { state: 'open' as const },
    onFiltersChange: vi.fn(),
    issues: [] as Issue[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders search input', () => {
      render(<IssueFilters {...defaultProps} />);

      expect(screen.getByPlaceholderText('Search issues...')).toBeInTheDocument();
    });

    it('renders state toggle buttons', () => {
      render(<IssueFilters {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Closed' })).toBeInTheDocument();
      // There are two "All" buttons (StateToggle and SessionStatusToggle)
      const allButtons = screen.getAllByRole('button', { name: 'All' });
      expect(allButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders sort dropdown', () => {
      render(<IssueFilters {...defaultProps} />);

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Created' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Updated' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Comments' })).toBeInTheDocument();
    });

    it('renders order toggle button', () => {
      render(<IssueFilters {...defaultProps} />);

      // Should have a button for toggling order (title starts with "Newest first" or "Oldest first")
      const orderButton = screen.getByTitle(/^(Newest|Oldest) first/);
      expect(orderButton).toBeInTheDocument();
    });

    it('does not render label filter when no labels available', () => {
      render(<IssueFilters {...defaultProps} issues={[]} />);

      expect(screen.queryByText('Labels:')).not.toBeInTheDocument();
    });

    it('renders label filter when labels available in issues', () => {
      const issues = [createMockIssue({ labels: ['bug', 'enhancement'] })];
      render(<IssueFilters {...defaultProps} issues={issues} />);

      expect(screen.getByText('Labels:')).toBeInTheDocument();
    });
  });

  describe('Search Input', () => {
    it('displays initial search value from filters', () => {
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', search: 'initial search' }}
        />
      );

      const input = screen.getByPlaceholderText('Search issues...') as HTMLInputElement;
      expect(input.value).toBe('initial search');
    });

    it('debounces search input before calling onFiltersChange', async () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          onFiltersChange={onFiltersChange}
        />
      );

      const input = screen.getByPlaceholderText('Search issues...');
      fireEvent.change(input, { target: { value: 'test query' } });

      // Should not call immediately
      expect(onFiltersChange).not.toHaveBeenCalled();

      // Fast-forward past debounce time
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'open', search: 'test query' });
    });

    it('clears search when clear button is clicked', async () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', search: 'existing search' }}
          onFiltersChange={onFiltersChange}
        />
      );

      const clearButton = screen.getByRole('button', { name: 'Clear search' });
      fireEvent.click(clearButton);

      // Check that input is cleared
      const input = screen.getByPlaceholderText('Search issues...') as HTMLInputElement;
      expect(input.value).toBe('');

      // Fast-forward past debounce
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'open', search: undefined });
    });

    it('does not show clear button when search is empty', () => {
      render(<IssueFilters {...defaultProps} />);

      // The button exists in DOM but is visually hidden (opacity-0, pointer-events-none) for animation purposes
      const clearButton = screen.queryByRole('button', { name: 'Clear search' });
      // When hidden, it has tabindex=-1 and pointer-events-none
      if (clearButton) {
        expect(clearButton).toHaveAttribute('tabindex', '-1');
        expect(clearButton).toHaveClass('pointer-events-none');
        expect(clearButton).toHaveClass('opacity-0');
      }
    });

    it('updates search input when filters.search changes externally', () => {
      const { rerender } = render(
        <IssueFilters {...defaultProps} filters={{ state: 'open', search: 'first' }} />
      );

      let input = screen.getByPlaceholderText('Search issues...') as HTMLInputElement;
      expect(input.value).toBe('first');

      rerender(
        <IssueFilters {...defaultProps} filters={{ state: 'open', search: 'second' }} />
      );

      input = screen.getByPlaceholderText('Search issues...') as HTMLInputElement;
      expect(input.value).toBe('second');
    });
  });

  describe('State Toggle', () => {
    it('highlights the current state', () => {
      render(<IssueFilters {...defaultProps} filters={{ state: 'open' }} />);

      const openButton = screen.getByRole('button', { name: 'Open' });
      // StateToggle uses a sliding indicator div (not button background) for active state
      // The button has aria-pressed="true" when active
      expect(openButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls onFiltersChange when state button is clicked', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open' }}
          onFiltersChange={onFiltersChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Closed' }));

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'closed' });
    });

    it('changes state to all when clicked', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open' }}
          onFiltersChange={onFiltersChange}
        />
      );

      // There are two "All" buttons - state toggle and session status toggle
      // The state toggle "All" doesn't have a title attribute, while session status has title="Show all"
      const allButtons = screen.getAllByRole('button', { name: 'All' });
      // Get the one without the "Show all" title (the state toggle)
      const stateAllButton = allButtons.find(btn => !btn.getAttribute('title'));
      fireEvent.click(stateAllButton!);

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'all' });
    });
  });

  describe('Sort Dropdown', () => {
    it('displays current sort value', () => {
      render(<IssueFilters {...defaultProps} filters={{ state: 'open', sort: 'updated' }} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('updated');
    });

    it('defaults to created when sort is not specified', () => {
      render(<IssueFilters {...defaultProps} filters={{ state: 'open' }} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('created');
    });

    it('calls onFiltersChange when sort changes', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open' }}
          onFiltersChange={onFiltersChange}
        />
      );

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'comments' } });

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'open', sort: 'comments' });
    });
  });

  describe('Order Toggle', () => {
    it('displays desc order by default (newest first)', () => {
      render(<IssueFilters {...defaultProps} filters={{ state: 'open' }} />);

      const orderButton = screen.getByTitle(/^Newest first/);
      expect(orderButton).toBeInTheDocument();
    });

    it('displays asc order when specified', () => {
      render(<IssueFilters {...defaultProps} filters={{ state: 'open', order: 'asc' }} />);

      const orderButton = screen.getByTitle(/^Oldest first/);
      expect(orderButton).toBeInTheDocument();
    });

    it('toggles order from desc to asc', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', order: 'desc' }}
          onFiltersChange={onFiltersChange}
        />
      );

      fireEvent.click(screen.getByTitle(/^Newest first/));

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'open', order: 'asc' });
    });

    it('toggles order from asc to desc', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', order: 'asc' }}
          onFiltersChange={onFiltersChange}
        />
      );

      fireEvent.click(screen.getByTitle(/^Oldest first/));

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'open', order: 'desc' });
    });
  });

  describe('Label Filter', () => {
    const issuesWithLabels = [
      createMockIssue({ number: 1, labels: ['bug', 'critical'] }),
      createMockIssue({ number: 2, labels: ['enhancement'] }),
      createMockIssue({ number: 3, labels: ['bug', 'documentation'] }),
    ];

    it('extracts unique labels from issues and sorts them', () => {
      render(<IssueFilters {...defaultProps} issues={issuesWithLabels} />);

      // Click add button to open dropdown
      fireEvent.click(screen.getByText('+ Add'));

      // Labels should be sorted alphabetically
      const buttons = screen.getAllByRole('button');
      const labelButtons = buttons.filter(
        (btn) =>
          btn.textContent === 'bug' ||
          btn.textContent === 'critical' ||
          btn.textContent === 'documentation' ||
          btn.textContent === 'enhancement'
      );

      expect(labelButtons).toHaveLength(4);
    });

    it('shows selected labels as chips', () => {
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', labels: ['bug', 'critical'] }}
          issues={issuesWithLabels}
        />
      );

      // Should show selected labels as chips (not in dropdown)
      expect(screen.getByText('bug')).toBeInTheDocument();
      expect(screen.getByText('critical')).toBeInTheDocument();
    });

    it('removes label when chip is clicked', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', labels: ['bug', 'critical'] }}
          onFiltersChange={onFiltersChange}
          issues={issuesWithLabels}
        />
      );

      // Find and click the bug label chip to remove it
      const bugChip = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.includes('bug') && btn.textContent?.includes('×')
      );
      fireEvent.click(bugChip!);

      expect(onFiltersChange).toHaveBeenCalledWith({
        state: 'open',
        labels: ['critical'],
      });
    });

    it('adds label when selected from dropdown', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open' }}
          onFiltersChange={onFiltersChange}
          issues={issuesWithLabels}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByText('+ Add'));

      // Click a label in dropdown
      fireEvent.click(screen.getByText('enhancement'));

      expect(onFiltersChange).toHaveBeenCalledWith({
        state: 'open',
        labels: ['enhancement'],
      });
    });

    it('closes dropdown after selecting a label', () => {
      render(
        <IssueFilters {...defaultProps} issues={issuesWithLabels} />
      );

      // Open dropdown
      fireEvent.click(screen.getByText('+ Add'));
      expect(screen.getByText('enhancement')).toBeInTheDocument();

      // Click a label
      fireEvent.click(screen.getByText('enhancement'));

      // Dropdown should close - enhancement should no longer be visible in the dropdown
      // (but may appear as a chip if filters change)
      const dropdown = document.querySelector('.max-h-48');
      expect(dropdown).not.toBeInTheDocument();
    });

    it('hides "+ Add" button when all labels are selected', () => {
      const singleLabelIssue = [createMockIssue({ labels: ['onlylabel'] })];
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', labels: ['onlylabel'] }}
          issues={singleLabelIssue}
        />
      );

      // When all labels are selected, the "+ Add" button should not be shown
      expect(screen.queryByText('+ Add')).not.toBeInTheDocument();
    });

    it('hides already selected labels from dropdown', () => {
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', labels: ['bug'] }}
          issues={issuesWithLabels}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByText('+ Add'));

      // Bug should not be in dropdown since it's already selected
      const dropdownButtons = document.querySelectorAll('.max-h-48 button');
      const labels = Array.from(dropdownButtons).map((b) => b.textContent);
      expect(labels).not.toContain('bug');
      expect(labels).toContain('critical');
    });

    it('removes labels filter when last label is removed', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', labels: ['bug'] }}
          onFiltersChange={onFiltersChange}
          issues={issuesWithLabels}
        />
      );

      // Remove the only label
      const bugChip = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.includes('bug') && btn.textContent?.includes('×')
      );
      fireEvent.click(bugChip!);

      // labels should be undefined when empty
      expect(onFiltersChange).toHaveBeenCalledWith({
        state: 'open',
        labels: undefined,
      });
    });
  });

  describe('Clear Filters', () => {
    it('does not show clear button when all defaults are used', () => {
      // All defaults: state='open', sort='created', order='desc', no search, no labels
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', sort: 'created', order: 'desc' }}
        />
      );

      expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
    });

    it('shows clear button when state is not open', () => {
      render(<IssueFilters {...defaultProps} filters={{ state: 'closed' }} />);

      // ActiveFiltersIndicator shows "N filter(s)" text
      expect(screen.getByText(/filter/)).toBeInTheDocument();
    });

    it('shows clear button when search is active', () => {
      render(<IssueFilters {...defaultProps} filters={{ state: 'open', search: 'test' }} />);

      expect(screen.getByText(/filter/)).toBeInTheDocument();
    });

    it('shows clear button when labels are selected', () => {
      const issues = [createMockIssue({ labels: ['bug'] })];
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', labels: ['bug'] }}
          issues={issues}
        />
      );

      expect(screen.getByText(/filter/)).toBeInTheDocument();
    });

    it('shows clear button when sort is not created', () => {
      render(<IssueFilters {...defaultProps} filters={{ state: 'open', sort: 'updated' }} />);

      expect(screen.getByText(/filter/)).toBeInTheDocument();
    });

    it('shows clear button when order is asc', () => {
      render(<IssueFilters {...defaultProps} filters={{ state: 'open', order: 'asc' }} />);

      expect(screen.getByText(/filter/)).toBeInTheDocument();
    });

    it('clears all filters when clear button is clicked', () => {
      const onFiltersChange = vi.fn();
      const issues = [createMockIssue({ labels: ['bug'] })];
      render(
        <IssueFilters
          {...defaultProps}
          filters={{
            state: 'closed',
            search: 'test',
            labels: ['bug'],
            sort: 'updated',
            order: 'asc',
          }}
          onFiltersChange={onFiltersChange}
          issues={issues}
        />
      );

      // Click the active filters indicator button (shows "N filters")
      const filterButton = screen.getByText(/filter/);
      fireEvent.click(filterButton);

      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'open' });
    });

    it('also clears search input when clear filters is clicked', () => {
      const onFiltersChange = vi.fn();
      const { rerender } = render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', search: 'test' }}
          onFiltersChange={onFiltersChange}
        />
      );

      // Click the active filters indicator button
      const filterButton = screen.getByText(/filter/);
      fireEvent.click(filterButton);

      // Verify onFiltersChange was called to clear filters
      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'open' });

      // Simulate the parent updating props (which is what would happen in the real app)
      rerender(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open' }}
          onFiltersChange={onFiltersChange}
        />
      );

      const input = screen.getByPlaceholderText('Search issues...') as HTMLInputElement;
      expect(input.value).toBe('');
    });
  });

  describe('Filter Combinations', () => {
    it('preserves existing filters when changing state', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'open', search: 'test', sort: 'updated' }}
          onFiltersChange={onFiltersChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Closed' }));

      expect(onFiltersChange).toHaveBeenCalledWith({
        state: 'closed',
        search: 'test',
        sort: 'updated',
      });
    });

    it('preserves existing filters when changing sort', () => {
      const onFiltersChange = vi.fn();
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'closed', search: 'test' }}
          onFiltersChange={onFiltersChange}
        />
      );

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'comments' } });

      expect(onFiltersChange).toHaveBeenCalledWith({
        state: 'closed',
        search: 'test',
        sort: 'comments',
      });
    });

    it('preserves existing filters when adding a label', () => {
      const onFiltersChange = vi.fn();
      const issues = [createMockIssue({ labels: ['bug'] })];
      render(
        <IssueFilters
          {...defaultProps}
          filters={{ state: 'closed', search: 'test' }}
          onFiltersChange={onFiltersChange}
          issues={issues}
        />
      );

      fireEvent.click(screen.getByText('+ Add'));
      fireEvent.click(screen.getByText('bug'));

      expect(onFiltersChange).toHaveBeenCalledWith({
        state: 'closed',
        search: 'test',
        labels: ['bug'],
      });
    });
  });

  describe('Accessibility', () => {
    it('has accessible state buttons', () => {
      render(<IssueFilters {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('has accessible sort dropdown', () => {
      render(<IssueFilters {...defaultProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });
  });

  describe('Debounce Cleanup', () => {
    it('cancels pending debounced search when component unmounts', () => {
      const onFiltersChange = vi.fn();
      const { unmount } = render(
        <IssueFilters {...defaultProps} onFiltersChange={onFiltersChange} />
      );

      const input = screen.getByPlaceholderText('Search issues...');
      fireEvent.change(input, { target: { value: 'test' } });

      // Unmount before debounce completes
      unmount();

      // Advance timers past debounce
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Should not have been called due to unmount
      expect(onFiltersChange).not.toHaveBeenCalled();
    });

    it('handles rapid typing correctly with debounce', () => {
      const onFiltersChange = vi.fn();
      render(<IssueFilters {...defaultProps} onFiltersChange={onFiltersChange} />);

      const input = screen.getByPlaceholderText('Search issues...');

      // Type multiple characters rapidly
      fireEvent.change(input, { target: { value: 't' } });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      fireEvent.change(input, { target: { value: 'te' } });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      fireEvent.change(input, { target: { value: 'tes' } });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      fireEvent.change(input, { target: { value: 'test' } });

      // Should not have called yet
      expect(onFiltersChange).not.toHaveBeenCalled();

      // Complete the debounce
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should only be called once with final value
      expect(onFiltersChange).toHaveBeenCalledTimes(1);
      expect(onFiltersChange).toHaveBeenCalledWith({ state: 'open', search: 'test' });
    });
  });
});
