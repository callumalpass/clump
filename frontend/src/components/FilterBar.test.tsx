import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import {
  SearchInput,
  StateToggle,
  SessionStatusToggle,
  SortControl,
  LabelSelect,
  FilterBar,
  FilterBarRow,
  FilterGroup,
  ItemCount,
  RefreshButton,
  ActiveFiltersIndicator,
  ClearFiltersButton,
} from './FilterBar';

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with placeholder', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Search..." />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders with custom placeholder', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Find items..." />);
    expect(screen.getByPlaceholderText('Find items...')).toBeInTheDocument();
  });

  it('displays the current value', () => {
    render(<SearchInput value="test query" onChange={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('test query');
  });

  it('debounces onChange calls', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={300} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test' } });

    // Should not call immediately
    expect(onChange).not.toHaveBeenCalled();

    // Advance past debounce time
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith('test');
  });

  it('uses custom debounce time', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={500} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test' } });

    // Advance partway
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).not.toHaveBeenCalled();

    // Complete the debounce
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenCalledWith('test');
  });

  it('cancels pending debounce on new input', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={300} />);

    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'first' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    fireEvent.change(input, { target: { value: 'second' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should only be called once with final value
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('second');
  });

  it('syncs with external value changes', () => {
    const { rerender } = render(<SearchInput value="initial" onChange={vi.fn()} />);

    let input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('initial');

    rerender(<SearchInput value="updated" onChange={vi.fn()} />);

    input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('updated');
  });

  it('shows clear button when input has value', () => {
    render(<SearchInput value="test" onChange={vi.fn()} />);

    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    expect(clearButton).toBeInTheDocument();
    expect(clearButton).not.toHaveClass('pointer-events-none');
  });

  it('hides clear button when input is empty', () => {
    render(<SearchInput value="" onChange={vi.fn()} />);

    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    expect(clearButton).toHaveClass('pointer-events-none');
    expect(clearButton).toHaveClass('opacity-0');
  });

  it('clears input when clear button is clicked', () => {
    const onChange = vi.fn();
    render(<SearchInput value="test" onChange={onChange} />);

    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.click(clearButton);

    // Should call onChange immediately with empty string (no debounce on clear)
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('cleans up debounce timeout on unmount', () => {
    const onChange = vi.fn();
    const { unmount } = render(<SearchInput value="" onChange={onChange} debounceMs={300} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test' } });

    unmount();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Should not have been called due to unmount cleanup
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange if value matches after debounce', () => {
    const onChange = vi.fn();
    render(<SearchInput value="same" onChange={onChange} debounceMs={300} />);

    const input = screen.getByRole('textbox');
    // Change to same value
    fireEvent.change(input, { target: { value: 'same' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should not call onChange since value didn't change
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has accessible label from placeholder', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Search items..." />);

    const input = screen.getByLabelText('Search items');
    expect(input).toBeInTheDocument();
  });
});

describe('StateToggle', () => {
  it('renders all three state buttons', () => {
    render(<StateToggle value="open" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });

  it('marks current state as pressed', () => {
    render(<StateToggle value="open" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Closed' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange when a different state is clicked', () => {
    const onChange = vi.fn();
    render(<StateToggle value="open" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Closed' }));
    expect(onChange).toHaveBeenCalledWith('closed');
  });

  it('calls onChange when same state is clicked', () => {
    const onChange = vi.fn();
    render(<StateToggle value="open" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onChange).toHaveBeenCalledWith('open');
  });

  it('updates pressed state when value changes', () => {
    const { rerender } = render(<StateToggle value="open" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');

    rerender(<StateToggle value="closed" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Closed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('has accessible group label', () => {
    render(<StateToggle value="open" onChange={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Filter by state' })).toBeInTheDocument();
  });
});

describe('SessionStatusToggle', () => {
  it('renders all three status buttons', () => {
    render(<SessionStatusToggle value="all" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyzed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });

  it('marks current status as pressed', () => {
    render(<SessionStatusToggle value="analyzed" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Analyzed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'New' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange when status is clicked', () => {
    const onChange = vi.fn();
    render(<SessionStatusToggle value="all" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyzed' }));
    expect(onChange).toHaveBeenCalledWith('analyzed');
  });

  it('has accessible group label', () => {
    render(<SessionStatusToggle value="all" onChange={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Filter by session status' })).toBeInTheDocument();
  });

  it('shows tooltips on buttons', () => {
    render(<SessionStatusToggle value="all" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Analyzed' })).toHaveAttribute('title', 'Has session');
    expect(screen.getByRole('button', { name: 'New' })).toHaveAttribute('title', 'No sessions yet');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('title', 'Show all');
  });
});

describe('SortControl', () => {
  const defaultOptions = [
    { value: 'created', label: 'Created' },
    { value: 'updated', label: 'Updated' },
    { value: 'comments', label: 'Comments' },
  ];

  it('renders sort dropdown with options', () => {
    render(
      <SortControl
        sortValue="created"
        orderValue="desc"
        options={defaultOptions}
        onSortChange={vi.fn()}
        onOrderChange={vi.fn()}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Created' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Updated' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Comments' })).toBeInTheDocument();
  });

  it('displays current sort value', () => {
    render(
      <SortControl
        sortValue="updated"
        orderValue="desc"
        options={defaultOptions}
        onSortChange={vi.fn()}
        onOrderChange={vi.fn()}
      />
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('updated');
  });

  it('calls onSortChange when selection changes', () => {
    const onSortChange = vi.fn();
    render(
      <SortControl
        sortValue="created"
        orderValue="desc"
        options={defaultOptions}
        onSortChange={onSortChange}
        onOrderChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'comments' } });
    expect(onSortChange).toHaveBeenCalledWith('comments');
  });

  it('renders order toggle button with desc icon', () => {
    render(
      <SortControl
        sortValue="created"
        orderValue="desc"
        options={defaultOptions}
        onSortChange={vi.fn()}
        onOrderChange={vi.fn()}
      />
    );

    const orderButton = screen.getByTitle(/^Newest first/);
    expect(orderButton).toBeInTheDocument();
  });

  it('renders order toggle button with asc icon', () => {
    render(
      <SortControl
        sortValue="created"
        orderValue="asc"
        options={defaultOptions}
        onSortChange={vi.fn()}
        onOrderChange={vi.fn()}
      />
    );

    const orderButton = screen.getByTitle(/^Oldest first/);
    expect(orderButton).toBeInTheDocument();
  });

  it('toggles order from desc to asc', () => {
    const onOrderChange = vi.fn();
    render(
      <SortControl
        sortValue="created"
        orderValue="desc"
        options={defaultOptions}
        onSortChange={vi.fn()}
        onOrderChange={onOrderChange}
      />
    );

    fireEvent.click(screen.getByTitle(/^Newest first/));
    expect(onOrderChange).toHaveBeenCalledWith('asc');
  });

  it('toggles order from asc to desc', () => {
    const onOrderChange = vi.fn();
    render(
      <SortControl
        sortValue="created"
        orderValue="asc"
        options={defaultOptions}
        onSortChange={vi.fn()}
        onOrderChange={onOrderChange}
      />
    );

    fireEvent.click(screen.getByTitle(/^Oldest first/));
    expect(onOrderChange).toHaveBeenCalledWith('desc');
  });

  it('has accessible labels', () => {
    render(
      <SortControl
        sortValue="created"
        orderValue="desc"
        options={defaultOptions}
        onSortChange={vi.fn()}
        onOrderChange={vi.fn()}
      />
    );

    expect(screen.getByRole('group', { name: 'Sort options' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sort by')).toBeInTheDocument();
  });
});

describe('LabelSelect', () => {
  const availableLabels = ['bug', 'enhancement', 'documentation', 'help wanted'];

  it('renders Labels prefix', () => {
    render(<LabelSelect selectedLabels={[]} availableLabels={availableLabels} onChange={vi.fn()} />);
    expect(screen.getByText('Labels:')).toBeInTheDocument();
  });

  it('does not render when no labels available', () => {
    const { container } = render(<LabelSelect selectedLabels={[]} availableLabels={[]} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows selected labels as chips', () => {
    render(
      <LabelSelect selectedLabels={['bug', 'enhancement']} availableLabels={availableLabels} onChange={vi.fn()} />
    );

    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('enhancement')).toBeInTheDocument();
  });

  it('shows + Add button when unselected labels exist', () => {
    render(<LabelSelect selectedLabels={[]} availableLabels={availableLabels} onChange={vi.fn()} />);

    expect(screen.getByText('+ Add')).toBeInTheDocument();
  });

  it('hides + Add button when all labels are selected', () => {
    render(
      <LabelSelect selectedLabels={availableLabels} availableLabels={availableLabels} onChange={vi.fn()} />
    );

    expect(screen.queryByText('+ Add')).not.toBeInTheDocument();
  });

  it('opens dropdown when + Add is clicked', () => {
    render(<LabelSelect selectedLabels={[]} availableLabels={availableLabels} onChange={vi.fn()} />);

    fireEvent.click(screen.getByText('+ Add'));

    // All labels should be visible in dropdown
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('enhancement')).toBeInTheDocument();
  });

  it('adds label when clicked in dropdown', () => {
    const onChange = vi.fn();
    render(<LabelSelect selectedLabels={[]} availableLabels={availableLabels} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add'));
    fireEvent.click(screen.getByText('bug'));

    expect(onChange).toHaveBeenCalledWith(['bug']);
  });

  it('removes label when chip is clicked', () => {
    const onChange = vi.fn();
    render(
      <LabelSelect selectedLabels={['bug', 'enhancement']} availableLabels={availableLabels} onChange={onChange} />
    );

    // Find the bug chip button and click it
    const bugButton = screen.getAllByRole('button').find(
      (btn) => btn.textContent?.includes('bug') && btn.textContent?.includes('×')
    );
    fireEvent.click(bugButton!);

    expect(onChange).toHaveBeenCalledWith(['enhancement']);
  });

  it('closes dropdown after selecting a label', () => {
    render(<LabelSelect selectedLabels={[]} availableLabels={availableLabels} onChange={vi.fn()} />);

    fireEvent.click(screen.getByText('+ Add'));
    expect(screen.getByText('documentation')).toBeInTheDocument();

    fireEvent.click(screen.getByText('bug'));

    // Dropdown should close
    const dropdown = document.querySelector('.max-h-48');
    expect(dropdown).not.toBeInTheDocument();
  });

  it('hides already selected labels from dropdown', () => {
    render(
      <LabelSelect selectedLabels={['bug']} availableLabels={availableLabels} onChange={vi.fn()} />
    );

    fireEvent.click(screen.getByText('+ Add'));

    const dropdownButtons = document.querySelectorAll('.max-h-48 button');
    const labels = Array.from(dropdownButtons).map((b) => b.textContent);

    expect(labels).not.toContain('bug');
    expect(labels).toContain('enhancement');
    expect(labels).toContain('documentation');
  });

  it('closes dropdown when clicking outside', () => {
    render(<LabelSelect selectedLabels={[]} availableLabels={availableLabels} onChange={vi.fn()} />);

    fireEvent.click(screen.getByText('+ Add'));
    expect(document.querySelector('.max-h-48')).toBeInTheDocument();

    // Click on the backdrop
    const backdrop = document.querySelector('.fixed.inset-0');
    fireEvent.click(backdrop!);

    expect(document.querySelector('.max-h-48')).not.toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  it('renders children', () => {
    render(
      <FilterBar>
        <div data-testid="child">Content</div>
      </FilterBar>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies container styling', () => {
    render(
      <FilterBar>
        <div>Content</div>
      </FilterBar>
    );

    const container = screen.getByText('Content').parentElement;
    expect(container).toHaveClass('flex', 'flex-col');
  });
});

describe('FilterBarRow', () => {
  it('renders children', () => {
    render(
      <FilterBarRow>
        <div data-testid="child">Row content</div>
      </FilterBarRow>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies row styling', () => {
    render(
      <FilterBarRow>
        <div>Content</div>
      </FilterBarRow>
    );

    const row = screen.getByText('Content').parentElement;
    expect(row).toHaveClass('flex', 'items-center');
  });

  it('accepts custom className', () => {
    render(
      <FilterBarRow className="custom-class">
        <div>Content</div>
      </FilterBarRow>
    );

    const row = screen.getByText('Content').parentElement;
    expect(row).toHaveClass('custom-class');
  });
});

describe('FilterGroup', () => {
  it('renders children', () => {
    render(
      <FilterGroup>
        <div data-testid="child">Group content</div>
      </FilterGroup>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(
      <FilterGroup label="Status">
        <div>Content</div>
      </FilterGroup>
    );

    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    render(
      <FilterGroup>
        <div>Content</div>
      </FilterGroup>
    );

    const group = screen.getByText('Content').parentElement;
    // Should only have the child, no label span
    expect(group?.querySelectorAll('span').length).toBe(0);
  });

  it('accepts custom className', () => {
    render(
      <FilterGroup className="custom-class">
        <div>Content</div>
      </FilterGroup>
    );

    // The content is wrapped in an inner div, so we need to go up two levels to find the outer container
    const group = screen.getByText('Content').parentElement?.parentElement;
    expect(group).toHaveClass('custom-class');
  });
});

describe('ItemCount', () => {
  it('renders singular form for count of 1', () => {
    render(<ItemCount count={1} singular="item" />);
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('renders plural form for count greater than 1', () => {
    render(<ItemCount count={5} singular="item" />);
    expect(screen.getByText('5 items')).toBeInTheDocument();
  });

  it('renders plural form for count of 0', () => {
    render(<ItemCount count={0} singular="item" />);
    expect(screen.getByText('0 items')).toBeInTheDocument();
  });

  it('uses custom plural when provided', () => {
    render(<ItemCount count={5} singular="mouse" plural="mice" />);
    expect(screen.getByText('5 mice')).toBeInTheDocument();
  });

  it('uses singular with custom plural for count of 1', () => {
    render(<ItemCount count={1} singular="mouse" plural="mice" />);
    expect(screen.getByText('1 mouse')).toBeInTheDocument();
  });
});

describe('RefreshButton', () => {
  it('renders refresh button', () => {
    render(<RefreshButton onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Refresh data' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<RefreshButton onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('disables button when loading', () => {
    render(<RefreshButton onClick={vi.fn()} loading />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('shows loading state in aria-label', () => {
    render(<RefreshButton onClick={vi.fn()} loading />);

    expect(screen.getByRole('button', { name: 'Refreshing data' })).toBeInTheDocument();
  });

  it('shows different title when loading', () => {
    render(<RefreshButton onClick={vi.fn()} loading />);

    expect(screen.getByRole('button')).toHaveAttribute('title', 'Refreshing...');
  });

  it('adds spin animation when loading', () => {
    render(<RefreshButton onClick={vi.fn()} loading />);

    const svg = screen.getByRole('button').querySelector('svg');
    expect(svg).toHaveClass('animate-spin');
  });
});

describe('ActiveFiltersIndicator', () => {
  it('does not render when filterCount is 0', () => {
    const { container } = render(<ActiveFiltersIndicator onClick={vi.fn()} filterCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not render when filterCount is negative', () => {
    const { container } = render(<ActiveFiltersIndicator onClick={vi.fn()} filterCount={-1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders when filterCount is positive', () => {
    render(<ActiveFiltersIndicator onClick={vi.fn()} filterCount={3} />);
    expect(screen.getByText('3 filters')).toBeInTheDocument();
  });

  it('uses singular form for 1 filter', () => {
    render(<ActiveFiltersIndicator onClick={vi.fn()} filterCount={1} />);
    expect(screen.getByText('1 filter')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ActiveFiltersIndicator onClick={onClick} filterCount={2} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('has accessible label', () => {
    render(<ActiveFiltersIndicator onClick={vi.fn()} filterCount={3} />);
    expect(screen.getByRole('button', { name: 'Clear 3 active filters' })).toBeInTheDocument();
  });

  it('uses singular in accessible label for 1 filter', () => {
    render(<ActiveFiltersIndicator onClick={vi.fn()} filterCount={1} />);
    expect(screen.getByRole('button', { name: 'Clear 1 active filter' })).toBeInTheDocument();
  });
});

describe('ClearFiltersButton', () => {
  it('does not render when show is false', () => {
    const { container } = render(<ClearFiltersButton onClick={vi.fn()} show={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders when show is true', () => {
    render(<ClearFiltersButton onClick={vi.fn()} show />);
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ClearFiltersButton onClick={onClick} show />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
