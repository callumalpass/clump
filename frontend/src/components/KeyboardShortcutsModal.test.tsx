import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';

describe('KeyboardShortcutsModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when not open', () => {
      render(<KeyboardShortcutsModal isOpen={false} onClose={vi.fn()} />);

      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
    });

    it('renders modal when open', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('renders navigation shortcuts section', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      expect(screen.getByText('Navigation')).toBeInTheDocument();
      expect(screen.getByText('Focus search in current tab')).toBeInTheDocument();
      expect(screen.getByText('Close modal, deselect, or close terminal')).toBeInTheDocument();
      expect(screen.getByText('Show this help dialog')).toBeInTheDocument();
    });

    it('renders terminal shortcuts section', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      expect(screen.getByText('Terminal')).toBeInTheDocument();
      expect(screen.getByText('Interrupt current command')).toBeInTheDocument();
      expect(screen.getByText('End input / Exit')).toBeInTheDocument();
      expect(screen.getByText('Clear terminal screen')).toBeInTheDocument();
      expect(screen.getByText('Send multiline input (Mac: Option+Enter)')).toBeInTheDocument();
    });

    it('renders quick tips section', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      expect(screen.getByText('Quick Tips')).toBeInTheDocument();
      expect(screen.getByText('Select an issue to view details')).toBeInTheDocument();
      expect(screen.getByText('Start Claude Code session for an issue')).toBeInTheDocument();
      expect(screen.getByText('Resume a previous Claude session')).toBeInTheDocument();
    });

    it('renders keyboard keys with kbd elements', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      // kbd elements don't have a default role, so we check by tag
      const kbds = document.querySelectorAll('kbd');
      expect(kbds.length).toBeGreaterThan(0);
    });

    it('renders footer hint text', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      expect(screen.getByText(/Press/)).toBeInTheDocument();
      expect(screen.getByText(/to close/)).toBeInTheDocument();
    });
  });

  describe('Specific Shortcut Keys', () => {
    it('displays forward slash key for search', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      // Check for / key
      expect(screen.getByText('/')).toBeInTheDocument();
    });

    it('displays Esc key', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      // Multiple Esc keys may exist (one in shortcuts, one in footer)
      const escKeys = screen.getAllByText('Esc');
      expect(escKeys.length).toBeGreaterThanOrEqual(1);
    });

    it('displays question mark key for help', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      // Multiple ? keys may exist (one in shortcuts, one in footer)
      const questionKeys = screen.getAllByText('?');
      expect(questionKeys.length).toBeGreaterThanOrEqual(1);
    });

    it('displays Ctrl key for terminal shortcuts', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      // Multiple Ctrl keys for different shortcuts
      const ctrlKeys = screen.getAllByText('Ctrl');
      expect(ctrlKeys.length).toBeGreaterThanOrEqual(1);
    });

    it('displays modifier keys for terminal shortcuts', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.getByText('D')).toBeInTheDocument();
      expect(screen.getByText('L')).toBeInTheDocument();
    });

    it('displays Alt and Enter for multiline input', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      // Multiple Alt keys exist (Session Tabs and Terminal sections)
      const altKeys = screen.getAllByText('Alt');
      expect(altKeys.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Enter')).toBeInTheDocument();
    });

    it('displays action names in quick tips', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      expect(screen.getByText('Click')).toBeInTheDocument();
      expect(screen.getByText('Analyze')).toBeInTheDocument();
      expect(screen.getByText('Continue')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

      // The backdrop is the element with the onClick that calls onClose
      const backdrop = document.querySelector('.bg-black\\/60');
      expect(backdrop).not.toBeNull();

      fireEvent.click(backdrop!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when modal content is clicked', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

      // Click on the modal content (header)
      fireEvent.click(screen.getByText('Keyboard Shortcuts'));

      // Should not close (only clicking the backdrop or close button should close)
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has accessible close button with aria-label', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      expect(closeButton).toHaveAttribute('aria-label', 'Close');
    });

    it('has proper heading hierarchy', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      // Main title should be h2
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Keyboard Shortcuts');

      // Section titles should be h3
      const h3Elements = screen.getAllByRole('heading', { level: 3 });
      expect(h3Elements).toHaveLength(4);
      expect(h3Elements[0]).toHaveTextContent('Navigation');
      expect(h3Elements[1]).toHaveTextContent('Session Tabs');
      expect(h3Elements[2]).toHaveTextContent('Terminal');
      expect(h3Elements[3]).toHaveTextContent('Quick Tips');
    });

    it('close button is focusable', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      closeButton.focus();
      expect(document.activeElement).toBe(closeButton);
    });
  });

  describe('Styling', () => {
    it('has backdrop blur applied', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      const backdrop = document.querySelector('.backdrop-blur-sm');
      expect(backdrop).not.toBeNull();
    });

    it('has modal container with correct classes', () => {
      render(<KeyboardShortcutsModal {...defaultProps} />);

      // Check for fixed positioning and z-index for modal overlay
      const overlay = document.querySelector('.fixed.inset-0.z-50');
      expect(overlay).not.toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid open/close', () => {
      const onClose = vi.fn();
      const { rerender } = render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();

      rerender(<KeyboardShortcutsModal isOpen={false} onClose={onClose} />);
      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();

      rerender(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('handles onClose being called multiple times', () => {
      const onClose = vi.fn();
      render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(3);
    });
  });
});
