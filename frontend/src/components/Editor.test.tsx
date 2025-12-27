import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock view instance - must be defined before vi.mock calls
const mockView = {
  destroy: vi.fn(),
  focus: vi.fn(),
  dispatch: vi.fn(),
  state: {
    doc: {
      toString: () => '',
      length: 0,
    },
  },
  dom: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
};

const mockPlaceholder = vi.fn(() => ({}));
const mockEditorStateCreate = vi.fn(() => ({
  doc: {
    toString: () => '',
  },
}));
const mockReadOnlyOf = vi.fn(() => ({}));

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: (...args: unknown[]) => mockEditorStateCreate(...args),
    readOnly: {
      of: (...args: unknown[]) => mockReadOnlyOf(...args),
    },
  },
  Prec: {
    highest: (ext: unknown) => ext,
  },
}));

vi.mock('@codemirror/view', () => {
  return {
    EditorView: class {
      constructor() {
        Object.assign(this, mockView);
      }
      destroy = mockView.destroy;
      focus = mockView.focus;
      dispatch = mockView.dispatch;
      state = mockView.state;
      dom = mockView.dom;
      static theme = () => ({});
      static lineWrapping = {};
      static updateListener = { of: () => ({}) };
    },
    keymap: {
      of: () => ({}),
    },
    placeholder: (...args: unknown[]) => mockPlaceholder(...args),
  };
});

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: () => ({}),
  historyKeymap: [],
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => ({}),
}));

vi.mock('@replit/codemirror-vim', () => ({
  vim: () => ({}),
  Vim: {
    defineEx: vi.fn(),
  },
  getCM: () => ({
    state: {
      vim: {
        mode: 'normal',
        visualMode: false,
      },
    },
  }),
}));

// Import component after mocks are set up
import { Editor } from './Editor';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Editor', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders the editor container', () => {
      const { container } = render(<Editor {...defaultProps} />);

      expect(container.querySelector('.relative')).toBeInTheDocument();
    });

    it('renders vim toggle button', () => {
      render(<Editor {...defaultProps} />);

      expect(screen.getByRole('button', { name: /vim/i })).toBeInTheDocument();
    });

    it('applies custom minHeight style', () => {
      const { container } = render(<Editor {...defaultProps} minHeight="200px" />);

      const editorContainer = container.querySelector('[style*="min-height"]');
      expect(editorContainer).toHaveStyle({ minHeight: '200px' });
    });

    it('applies custom maxHeight style', () => {
      const { container } = render(<Editor {...defaultProps} maxHeight="600px" />);

      const editorContainer = container.querySelector('[style*="max-height"]');
      expect(editorContainer).toHaveStyle({ maxHeight: '600px' });
    });

    it('applies disabled styling when disabled', () => {
      const { container } = render(<Editor {...defaultProps} disabled={true} />);

      const editorContainer = container.querySelector('.opacity-50');
      expect(editorContainer).toBeInTheDocument();
    });
  });

  describe('Vim Mode', () => {
    it('shows vim toggle button with disabled state by default', () => {
      localStorageMock.getItem.mockReturnValue(null);

      render(<Editor {...defaultProps} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });
      expect(vimButton).toHaveClass('text-gray-500');
    });

    it('shows vim toggle button with enabled state when localStorage has true', () => {
      localStorageMock.getItem.mockReturnValue('true');

      render(<Editor {...defaultProps} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });
      expect(vimButton).toHaveClass('text-green-400');
    });

    it('toggles vim mode when button is clicked', () => {
      localStorageMock.getItem.mockReturnValue(null);

      render(<Editor {...defaultProps} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });
      fireEvent.click(vimButton);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('editor-vim-mode', 'true');
    });

    it('disables vim mode when clicking toggle while enabled', () => {
      localStorageMock.getItem.mockReturnValue('true');

      render(<Editor {...defaultProps} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });
      fireEvent.click(vimButton);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('editor-vim-mode', 'false');
    });

    it('uses controlled vimMode prop when provided', () => {
      render(<Editor {...defaultProps} vimMode={true} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });
      expect(vimButton).toHaveClass('text-green-400');
    });

    it('calls onVimModeChange when vim mode toggles', () => {
      const onVimModeChange = vi.fn();

      render(<Editor {...defaultProps} vimMode={false} onVimModeChange={onVimModeChange} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });
      fireEvent.click(vimButton);

      expect(onVimModeChange).toHaveBeenCalledWith(true);
    });

    it('shows vim mode indicator when vim is enabled', () => {
      localStorageMock.getItem.mockReturnValue('true');

      render(<Editor {...defaultProps} />);

      expect(screen.getByText(/-- NORMAL --/)).toBeInTheDocument();
    });

    it('does not show vim mode indicator when vim is disabled', () => {
      localStorageMock.getItem.mockReturnValue(null);

      render(<Editor {...defaultProps} />);

      expect(screen.queryByText(/-- NORMAL --/)).not.toBeInTheDocument();
    });
  });

  describe('Submit Hint', () => {
    it('shows submit hint when onSubmit is provided', () => {
      render(<Editor {...defaultProps} onSubmit={() => {}} />);

      expect(screen.getByText(/Ctrl\+Enter/)).toBeInTheDocument();
    });

    it('does not show submit hint when onSubmit is not provided', () => {
      render(<Editor {...defaultProps} />);

      expect(screen.queryByText(/Ctrl\+Enter/)).not.toBeInTheDocument();
    });

    it('shows vim-specific submit hint when vim mode is enabled', () => {
      localStorageMock.getItem.mockReturnValue('true');

      render(<Editor {...defaultProps} onSubmit={() => {}} />);

      expect(screen.getByText(/Ctrl\+Enter or :submit/)).toBeInTheDocument();
    });

    it('shows regular submit hint when vim mode is disabled', () => {
      localStorageMock.getItem.mockReturnValue(null);

      render(<Editor {...defaultProps} onSubmit={() => {}} />);

      const hint = screen.getByText(/Ctrl\+Enter/);
      expect(hint.textContent).toBe('Ctrl+Enter to submit');
    });
  });

  describe('Placeholder', () => {
    it('calls placeholder function when placeholder prop is provided', () => {
      render(<Editor {...defaultProps} placeholder="Enter your message..." />);

      expect(mockPlaceholder).toHaveBeenCalledWith('Enter your message...');
    });

    it('does not call placeholder when prop is empty string', () => {
      mockPlaceholder.mockClear();
      render(<Editor {...defaultProps} placeholder="" />);

      // With empty string placeholder, the component skips adding it
      expect(mockPlaceholder).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('destroys editor view on unmount', () => {
      const { unmount } = render(<Editor {...defaultProps} />);

      unmount();

      expect(mockView.destroy).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('vim toggle button has accessible title when enabled', () => {
      localStorageMock.getItem.mockReturnValue('true');

      render(<Editor {...defaultProps} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });
      expect(vimButton).toHaveAttribute('title', 'Vim mode enabled (click to disable)');
    });

    it('vim toggle button has accessible title when disabled', () => {
      localStorageMock.getItem.mockReturnValue(null);

      render(<Editor {...defaultProps} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });
      expect(vimButton).toHaveAttribute('title', 'Click to enable Vim mode');
    });

    it('vim toggle button is focusable', () => {
      render(<Editor {...defaultProps} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });
      expect(vimButton).toHaveAttribute('type', 'button');
    });
  });

  describe('Edge cases', () => {
    it('handles localStorage errors gracefully on read', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      // Should not throw
      expect(() => render(<Editor {...defaultProps} />)).not.toThrow();
    });

    it('handles localStorage setItem errors gracefully', () => {
      localStorageMock.getItem.mockReturnValue(null);
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      render(<Editor {...defaultProps} />);

      const vimButton = screen.getByRole('button', { name: /vim/i });

      // Should not throw when clicking toggle
      expect(() => fireEvent.click(vimButton)).not.toThrow();
    });
  });

  describe('Style classes', () => {
    it('applies border styles to container', () => {
      const { container } = render(<Editor {...defaultProps} />);

      const editorContainer = container.querySelector('.border-gray-600');
      expect(editorContainer).toBeInTheDocument();
    });

    it('applies focus ring styles', () => {
      const { container } = render(<Editor {...defaultProps} />);

      const editorContainer = container.querySelector('.focus-within\\:ring-2');
      expect(editorContainer).toBeInTheDocument();
    });

    it('applies cursor-not-allowed when disabled', () => {
      const { container } = render(<Editor {...defaultProps} disabled={true} />);

      const editorContainer = container.querySelector('.cursor-not-allowed');
      expect(editorContainer).toBeInTheDocument();
    });
  });

  describe('Value synchronization', () => {
    it('creates editor with initial value', () => {
      render(<Editor {...defaultProps} value="initial text" />);

      expect(mockEditorStateCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          doc: 'initial text',
        })
      );
    });
  });

  describe('Focus behavior', () => {
    it('focuses editor when autoFocus is true and vim is disabled', () => {
      localStorageMock.getItem.mockReturnValue(null);

      render(<Editor {...defaultProps} autoFocus={true} />);

      expect(mockView.focus).toHaveBeenCalled();
    });
  });
});
