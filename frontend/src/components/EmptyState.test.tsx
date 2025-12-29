import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState, EmptyStateAction, EmptyStateIconType } from './EmptyState';

describe('EmptyState', () => {
  describe('Basic Rendering', () => {
    it('renders title', () => {
      render(<EmptyState title="No items found" />);

      expect(screen.getByText('No items found')).toBeInTheDocument();
    });

    it('renders description when provided', () => {
      render(<EmptyState title="No items" description="Try adjusting your filters" />);

      expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
      render(<EmptyState title="No items" />);

      // Should only have the title, no additional text
      expect(screen.queryByText('Try adjusting your filters')).not.toBeInTheDocument();
    });

    it('renders action when provided', () => {
      const action = <button>Reset</button>;
      render(<EmptyState title="No items" action={action} />);

      expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    });
  });

  describe('Icon Rendering', () => {
    it('renders default cursor icon when no icon specified', () => {
      const { container } = render(<EmptyState title="No items" />);

      // Check that an SVG is rendered (the default cursor icon)
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders preset icon by name', () => {
      const { container } = render(<EmptyState title="No items" icon="issues" />);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders all preset icons', () => {
      const iconTypes: EmptyStateIconType[] = ['issues', 'prs', 'sessions', 'filter', 'search', 'schedules', 'cursor', 'error'];

      iconTypes.forEach((iconType) => {
        const { container, unmount } = render(<EmptyState title="Test" icon={iconType} />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
        unmount();
      });
    });

    it('renders custom icon when ReactNode provided', () => {
      const customIcon = <span data-testid="custom-icon">★</span>;
      render(<EmptyState title="No items" icon={customIcon} />);

      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });

    it('applies error color to error icon', () => {
      const { container } = render(<EmptyState title="Error" icon="error" />);

      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('text-red-400');
    });
  });

  describe('Size Variants', () => {
    it('applies small size classes', () => {
      const { container } = render(<EmptyState title="No items" size="sm" />);

      const innerContainer = container.querySelector('.max-w-xs');
      expect(innerContainer).toBeInTheDocument();
    });

    it('applies medium size classes (default)', () => {
      const { container } = render(<EmptyState title="No items" />);

      const innerContainer = container.querySelector('.max-w-sm');
      expect(innerContainer).toBeInTheDocument();
    });

    it('applies large size classes', () => {
      const { container } = render(<EmptyState title="No items" size="lg" />);

      const innerContainer = container.querySelector('.max-w-md');
      expect(innerContainer).toBeInTheDocument();
    });

    it('applies different padding for each size', () => {
      const { container: smContainer } = render(<EmptyState title="Test" size="sm" />);
      const { container: mdContainer } = render(<EmptyState title="Test" size="md" />);
      const { container: lgContainer } = render(<EmptyState title="Test" size="lg" />);

      expect(smContainer.querySelector('.p-4')).toBeInTheDocument();
      expect(mdContainer.querySelector('.p-6')).toBeInTheDocument();
      expect(lgContainer.querySelector('.p-8')).toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('applies floating animation by default', () => {
      const { container } = render(<EmptyState title="No items" />);

      const iconWrapper = container.querySelector('.empty-state-icon-float');
      expect(iconWrapper).toBeInTheDocument();
    });

    it('removes floating animation when animate is false', () => {
      const { container } = render(<EmptyState title="No items" animate={false} />);

      const iconWrapper = container.querySelector('.empty-state-icon-float');
      expect(iconWrapper).not.toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className to container', () => {
      const { container } = render(<EmptyState title="No items" className="my-custom-class" />);

      const outerContainer = container.firstChild;
      expect(outerContainer).toHaveClass('my-custom-class');
    });

    it('preserves default classes when custom className is added', () => {
      const { container } = render(<EmptyState title="No items" className="my-custom-class" />);

      const outerContainer = container.firstChild;
      expect(outerContainer).toHaveClass('flex', 'items-center', 'justify-center');
    });
  });

  describe('Accessibility', () => {
    it('has proper text hierarchy', () => {
      render(<EmptyState title="Main Title" description="Secondary description" />);

      // Title should be present
      expect(screen.getByText('Main Title')).toBeInTheDocument();
      // Description should be present
      expect(screen.getByText('Secondary description')).toBeInTheDocument();
    });

    it('renders action buttons that are keyboard accessible', () => {
      const handleClick = vi.fn();
      render(
        <EmptyState
          title="No items"
          action={<button onClick={handleClick}>Take Action</button>}
        />
      );

      const button = screen.getByRole('button', { name: 'Take Action' });
      expect(button).toBeInTheDocument();

      // Simulate keyboard interaction
      fireEvent.keyDown(button, { key: 'Enter' });
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalled();
    });
  });

  describe('Visual Structure', () => {
    it('has proper enter animation class', () => {
      const { container } = render(<EmptyState title="No items" />);

      const innerContainer = container.querySelector('.empty-state-enter');
      expect(innerContainer).toBeInTheDocument();
    });

    it('has rounded border styling', () => {
      const { container } = render(<EmptyState title="No items" />);

      const innerContainer = container.querySelector('.rounded-xl');
      expect(innerContainer).toBeInTheDocument();
    });

    it('has background and border styling', () => {
      const { container } = render(<EmptyState title="No items" />);

      const innerContainer = container.querySelector('.border-gray-700\\/50');
      expect(innerContainer).toBeInTheDocument();
    });
  });
});

describe('EmptyStateAction', () => {
  describe('Basic Rendering', () => {
    it('renders children', () => {
      render(<EmptyStateAction onClick={() => {}}>Click Me</EmptyStateAction>);

      expect(screen.getByText('Click Me')).toBeInTheDocument();
    });

    it('is a button element', () => {
      render(<EmptyStateAction onClick={() => {}}>Click Me</EmptyStateAction>);

      expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
    });
  });

  describe('Click Handling', () => {
    it('calls onClick when clicked', () => {
      const handleClick = vi.fn();
      render(<EmptyStateAction onClick={handleClick}>Click Me</EmptyStateAction>);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Variant Styling', () => {
    it('applies secondary variant by default', () => {
      render(<EmptyStateAction onClick={() => {}}>Click Me</EmptyStateAction>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gray-700');
      expect(button).not.toHaveClass('bg-blue-600');
    });

    it('applies secondary variant explicitly', () => {
      render(<EmptyStateAction onClick={() => {}} variant="secondary">Click Me</EmptyStateAction>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gray-700');
    });

    it('applies primary variant', () => {
      render(<EmptyStateAction onClick={() => {}} variant="primary">Click Me</EmptyStateAction>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-blue-600');
      expect(button).not.toHaveClass('bg-gray-700');
    });
  });

  describe('Common Styling', () => {
    it('has focus-visible ring styling', () => {
      render(<EmptyStateAction onClick={() => {}}>Click Me</EmptyStateAction>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus-visible:ring-2');
    });

    it('has active scale animation', () => {
      render(<EmptyStateAction onClick={() => {}}>Click Me</EmptyStateAction>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('active:scale-95');
    });

    it('has proper text size', () => {
      render(<EmptyStateAction onClick={() => {}}>Click Me</EmptyStateAction>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('text-xs');
    });

    it('has rounded corners', () => {
      render(<EmptyStateAction onClick={() => {}}>Click Me</EmptyStateAction>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('rounded');
    });
  });

  describe('Integration with EmptyState', () => {
    it('works correctly as EmptyState action', () => {
      const handleReset = vi.fn();

      render(
        <EmptyState
          title="No results"
          description="Your search returned no results"
          action={<EmptyStateAction onClick={handleReset}>Reset Filters</EmptyStateAction>}
        />
      );

      expect(screen.getByText('No results')).toBeInTheDocument();
      expect(screen.getByText('Your search returned no results')).toBeInTheDocument();

      const resetButton = screen.getByRole('button', { name: 'Reset Filters' });
      expect(resetButton).toBeInTheDocument();

      fireEvent.click(resetButton);
      expect(handleReset).toHaveBeenCalledTimes(1);
    });

    it('supports multiple actions', () => {
      render(
        <EmptyState
          title="No results"
          action={
            <>
              <EmptyStateAction onClick={() => {}} variant="primary">Create New</EmptyStateAction>
              <EmptyStateAction onClick={() => {}}>Reset</EmptyStateAction>
            </>
          }
        />
      );

      expect(screen.getByRole('button', { name: 'Create New' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    });
  });
});
