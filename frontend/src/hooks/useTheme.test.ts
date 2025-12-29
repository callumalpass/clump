import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme, type Theme } from './useTheme';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore;
    },
  };
})();

// Mock matchMedia
const createMatchMediaMock = (matches: boolean) => ({
  matches,
  media: '',
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

describe('useTheme', () => {
  let originalLocalStorage: Storage;
  let originalMatchMedia: typeof window.matchMedia;
  let matchMediaMock: ReturnType<typeof createMatchMediaMock>;

  beforeEach(() => {
    // Save originals
    originalLocalStorage = window.localStorage;
    originalMatchMedia = window.matchMedia;

    // Setup mocks
    localStorageMock.clear();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

    matchMediaMock = createMatchMediaMock(true); // Default to dark mode preference
    window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);

    // Clear any previous data-theme attribute
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(window, 'localStorage', { value: originalLocalStorage, writable: true });
    window.matchMedia = originalMatchMedia;
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('returns dark theme by default when no preference is stored', () => {
      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('dark');
      expect(result.current.resolvedTheme).toBe('dark');
      expect(result.current.isDark).toBe(true);
      expect(result.current.isLight).toBe(false);
    });

    it('returns stored theme preference from localStorage', () => {
      localStorageMock._setStore({ 'stoody-theme': 'light' });

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('light');
      expect(result.current.resolvedTheme).toBe('light');
      expect(result.current.isDark).toBe(false);
      expect(result.current.isLight).toBe(true);
    });

    it('returns system theme preference when stored', () => {
      localStorageMock._setStore({ 'stoody-theme': 'system' });

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('system');
      // Resolved theme depends on matchMedia mock (true = dark)
      expect(result.current.resolvedTheme).toBe('dark');
      expect(result.current.isDark).toBe(true);
    });

    it('resolves system theme to light when system prefers light', () => {
      localStorageMock._setStore({ 'stoody-theme': 'system' });
      matchMediaMock = createMatchMediaMock(false); // Light mode preference
      window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('system');
      expect(result.current.resolvedTheme).toBe('light');
      expect(result.current.isLight).toBe(true);
    });

    it('defaults to dark when localStorage contains invalid value', () => {
      localStorageMock._setStore({ 'stoody-theme': 'invalid-theme' });

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('dark');
      expect(result.current.resolvedTheme).toBe('dark');
    });
  });

  describe('setTheme', () => {
    it('updates theme to dark', () => {
      localStorageMock._setStore({ 'stoody-theme': 'light' });
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');
      expect(result.current.resolvedTheme).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('stoody-theme', 'dark');
    });

    it('updates theme to light', () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('light');
      });

      expect(result.current.theme).toBe('light');
      expect(result.current.resolvedTheme).toBe('light');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('stoody-theme', 'light');
    });

    it('updates theme to system', () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('system');
      });

      expect(result.current.theme).toBe('system');
      // Resolved theme depends on matchMedia (true = dark)
      expect(result.current.resolvedTheme).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('stoody-theme', 'system');
    });
  });

  describe('DOM theme application', () => {
    it('applies light theme attribute to document when theme is light', () => {
      localStorageMock._setStore({ 'stoody-theme': 'light' });

      renderHook(() => useTheme());

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('removes theme attribute for dark theme', () => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorageMock._setStore({ 'stoody-theme': 'dark' });

      renderHook(() => useTheme());

      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    it('applies correct theme when switching from dark to light', () => {
      const { result } = renderHook(() => useTheme());

      expect(document.documentElement.getAttribute('data-theme')).toBeNull();

      act(() => {
        result.current.setTheme('light');
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('applies correct theme when switching from light to dark', () => {
      localStorageMock._setStore({ 'stoody-theme': 'light' });
      const { result } = renderHook(() => useTheme());

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      act(() => {
        result.current.setTheme('dark');
      });

      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });
  });

  describe('System theme detection', () => {
    it('detects dark system preference', () => {
      matchMediaMock = createMatchMediaMock(true);
      window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);
      localStorageMock._setStore({ 'stoody-theme': 'system' });

      const { result } = renderHook(() => useTheme());

      expect(result.current.resolvedTheme).toBe('dark');
    });

    it('detects light system preference', () => {
      matchMediaMock = createMatchMediaMock(false);
      window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);
      localStorageMock._setStore({ 'stoody-theme': 'system' });

      const { result } = renderHook(() => useTheme());

      expect(result.current.resolvedTheme).toBe('light');
    });

    it('listens for system theme changes when in system mode', () => {
      localStorageMock._setStore({ 'stoody-theme': 'system' });

      renderHook(() => useTheme());

      // Should have added an event listener for 'change'
      expect(matchMediaMock.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('does not listen for system theme changes when not in system mode', () => {
      localStorageMock._setStore({ 'stoody-theme': 'dark' });

      renderHook(() => useTheme());

      // Should not have added event listener
      expect(matchMediaMock.addEventListener).not.toHaveBeenCalled();
    });

    it('removes event listener when switching away from system mode', () => {
      localStorageMock._setStore({ 'stoody-theme': 'system' });

      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(matchMediaMock.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('Cross-tab synchronization', () => {
    it('listens for storage events', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      renderHook(() => useTheme());

      expect(addEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));
    });

    it('removes storage listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useTheme());
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));
    });

    it('updates theme when storage event is received', () => {
      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('dark');

      act(() => {
        // Simulate storage event from another tab
        const storageEvent = new StorageEvent('storage', {
          key: 'stoody-theme',
          newValue: 'light',
        });
        window.dispatchEvent(storageEvent);
      });

      expect(result.current.theme).toBe('light');
    });

    it('ignores storage events for other keys', () => {
      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('dark');

      act(() => {
        const storageEvent = new StorageEvent('storage', {
          key: 'other-key',
          newValue: 'light',
        });
        window.dispatchEvent(storageEvent);
      });

      // Theme should remain unchanged
      expect(result.current.theme).toBe('dark');
    });

    it('ignores storage events with invalid theme values', () => {
      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('dark');

      act(() => {
        const storageEvent = new StorageEvent('storage', {
          key: 'stoody-theme',
          newValue: 'invalid-value',
        });
        window.dispatchEvent(storageEvent);
      });

      // Theme should remain unchanged
      expect(result.current.theme).toBe('dark');
    });

    it('ignores storage events with null value', () => {
      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('dark');

      act(() => {
        const storageEvent = new StorageEvent('storage', {
          key: 'stoody-theme',
          newValue: null,
        });
        window.dispatchEvent(storageEvent);
      });

      // Theme should remain unchanged
      expect(result.current.theme).toBe('dark');
    });
  });

  describe('Helper properties', () => {
    it('isDark is true for dark theme', () => {
      localStorageMock._setStore({ 'stoody-theme': 'dark' });
      const { result } = renderHook(() => useTheme());

      expect(result.current.isDark).toBe(true);
      expect(result.current.isLight).toBe(false);
    });

    it('isLight is true for light theme', () => {
      localStorageMock._setStore({ 'stoody-theme': 'light' });
      const { result } = renderHook(() => useTheme());

      expect(result.current.isDark).toBe(false);
      expect(result.current.isLight).toBe(true);
    });

    it('isDark is true for system theme with dark preference', () => {
      matchMediaMock = createMatchMediaMock(true);
      window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);
      localStorageMock._setStore({ 'stoody-theme': 'system' });

      const { result } = renderHook(() => useTheme());

      expect(result.current.isDark).toBe(true);
      expect(result.current.isLight).toBe(false);
    });

    it('isLight is true for system theme with light preference', () => {
      matchMediaMock = createMatchMediaMock(false);
      window.matchMedia = vi.fn().mockReturnValue(matchMediaMock);
      localStorageMock._setStore({ 'stoody-theme': 'system' });

      const { result } = renderHook(() => useTheme());

      expect(result.current.isDark).toBe(false);
      expect(result.current.isLight).toBe(true);
    });
  });

  describe('setTheme function stability', () => {
    it('setTheme function is stable across re-renders', () => {
      const { result, rerender } = renderHook(() => useTheme());

      const setTheme1 = result.current.setTheme;
      rerender();
      const setTheme2 = result.current.setTheme;

      expect(setTheme1).toBe(setTheme2);
    });
  });
});
