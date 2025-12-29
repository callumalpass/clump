import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination, PaginationSkeleton } from './Pagination';

describe('Pagination', () => {
  let mockOnPageChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnPageChange = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Rendering', () => {
    it('renders prev and next buttons', () => {
      render(<Pagination page={1} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
    });

    it('displays current page and total pages', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByText('5 / 10')).toBeInTheDocument();
    });

    it('shows keyboard hints by default', () => {
      render(<Pagination page={1} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByText('[')).toBeInTheDocument();
      expect(screen.getByText(']')).toBeInTheDocument();
    });

    it('hides keyboard hints when showKeyboardHints is false', () => {
      render(
        <Pagination
          page={1}
          totalPages={10}
          onPageChange={mockOnPageChange}
          showKeyboardHints={false}
        />
      );

      expect(screen.queryByText('[')).not.toBeInTheDocument();
      expect(screen.queryByText(']')).not.toBeInTheDocument();
    });

    it('shows first/last buttons when totalPages > 3', () => {
      render(<Pagination page={2} totalPages={5} onPageChange={mockOnPageChange} />);

      expect(screen.getByRole('button', { name: /first page/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /last page/i })).toBeInTheDocument();
    });

    it('hides first/last buttons when totalPages <= 3', () => {
      render(<Pagination page={2} totalPages={3} onPageChange={mockOnPageChange} />);

      expect(screen.queryByRole('button', { name: /first page/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /last page/i })).not.toBeInTheDocument();
    });
  });

  describe('Navigation Buttons', () => {
    it('disables prev button on first page', () => {
      render(<Pagination page={1} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    });

    it('disables next button on last page', () => {
      render(<Pagination page={10} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    });

    it('disables first button on first page', () => {
      render(<Pagination page={1} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByRole('button', { name: /first page/i })).toBeDisabled();
    });

    it('disables last button on last page', () => {
      render(<Pagination page={10} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByRole('button', { name: /last page/i })).toBeDisabled();
    });

    it('calls onPageChange with prev page when prev button clicked', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByRole('button', { name: /previous page/i }));

      expect(mockOnPageChange).toHaveBeenCalledWith(4);
    });

    it('calls onPageChange with next page when next button clicked', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByRole('button', { name: /next page/i }));

      expect(mockOnPageChange).toHaveBeenCalledWith(6);
    });

    it('calls onPageChange with 1 when first button clicked', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByRole('button', { name: /first page/i }));

      expect(mockOnPageChange).toHaveBeenCalledWith(1);
    });

    it('calls onPageChange with last page when last button clicked', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByRole('button', { name: /last page/i }));

      expect(mockOnPageChange).toHaveBeenCalledWith(10);
    });
  });

  describe('Page Number Edit Mode', () => {
    it('enters edit mode when page number is clicked', async () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      expect(screen.getByRole('textbox', { name: /enter page number/i })).toBeInTheDocument();
    });

    it('does not enter edit mode when totalPages is 1', () => {
      render(<Pagination page={1} totalPages={1} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('1 / 1'));

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('pre-fills input with current page number', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      expect(screen.getByRole('textbox')).toHaveValue('5');
    });

    it('focuses and selects input text on edit mode', async () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      const input = screen.getByRole('textbox');
      expect(document.activeElement).toBe(input);
    });

    it('navigates to entered page on Enter key', async () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '8' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnPageChange).toHaveBeenCalledWith(8);
    });

    it('navigates to entered page on blur', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '3' } });
      fireEvent.blur(input);

      expect(mockOnPageChange).toHaveBeenCalledWith(3);
    });

    it('cancels edit mode on Escape key without changing page', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '8' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(mockOnPageChange).not.toHaveBeenCalled();
      // Should exit edit mode
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('rejects invalid page numbers (0)', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '0' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnPageChange).not.toHaveBeenCalled();
    });

    it('rejects invalid page numbers (exceeds total)', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '15' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnPageChange).not.toHaveBeenCalled();
    });

    it('strips non-numeric characters from input', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'abc8def' } });

      expect(input).toHaveValue('8');
    });

    it('does not call onPageChange when entering the same page', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnPageChange).not.toHaveBeenCalled();
    });

    it('shows shake animation on invalid input', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '999' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Progress Indicator', () => {
    it('renders progress bar when totalPages > 1', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('does not render progress bar when totalPages is 1', () => {
      render(<Pagination page={1} totalPages={1} onPageChange={mockOnPageChange} />);

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('sets correct progress bar aria attributes', () => {
      render(<Pagination page={3} totalPages={10} onPageChange={mockOnPageChange} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '3');
      expect(progressbar).toHaveAttribute('aria-valuemin', '1');
      expect(progressbar).toHaveAttribute('aria-valuemax', '10');
    });
  });

  describe('Edge Cases', () => {
    it('handles totalPages of 0 gracefully', () => {
      render(<Pagination page={1} totalPages={0} onPageChange={mockOnPageChange} />);

      // Should show 1/1 as minimum
      expect(screen.getByText('1 / 1')).toBeInTheDocument();
    });

    it('handles negative totalPages gracefully', () => {
      render(<Pagination page={1} totalPages={-5} onPageChange={mockOnPageChange} />);

      // Should show 1/1 as minimum
      expect(screen.getByText('1 / 1')).toBeInTheDocument();
    });

    it('syncs input value when page prop changes externally', () => {
      const { rerender } = render(
        <Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />
      );

      // Enter edit mode
      fireEvent.click(screen.getByText('5 / 10'));
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('5');

      // Exit edit mode first
      fireEvent.keyDown(input, { key: 'Escape' });

      // Now rerender with new page
      rerender(<Pagination page={7} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByText('7 / 10')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-labels on navigation buttons', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(screen.getByRole('button', { name: /go to previous page/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to next page/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to first page/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to last page/i })).toBeInTheDocument();
    });

    it('has proper aria-label on page indicator', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      expect(
        screen.getByRole('button', { name: /page 5 of 10/i })
      ).toBeInTheDocument();
    });

    it('has proper aria-label on edit input', () => {
      render(<Pagination page={5} totalPages={10} onPageChange={mockOnPageChange} />);

      fireEvent.click(screen.getByText('5 / 10'));

      expect(screen.getByRole('textbox', { name: /enter page number/i })).toBeInTheDocument();
    });
  });
});

describe('PaginationSkeleton', () => {
  it('renders skeleton elements', () => {
    const { container } = render(<PaginationSkeleton />);

    const skeletonElements = container.querySelectorAll('.skeleton-shimmer');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it('renders default variant', () => {
    const { container } = render(<PaginationSkeleton />);

    // Default variant has w-16 buttons
    expect(container.querySelector('.w-16')).toBeInTheDocument();
  });

  it('renders compact variant', () => {
    const { container } = render(<PaginationSkeleton variant="compact" />);

    // Compact variant has w-14 buttons
    expect(container.querySelector('.w-14')).toBeInTheDocument();
  });
});
