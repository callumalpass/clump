import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'stoody-theme';

/**
 * Get the resolved theme based on system preference.
 */
function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get the stored theme preference from localStorage.
 */
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'dark';
}

/**
 * Check if user prefers reduced motion.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Apply the theme to the document with optional transition animation.
 */
function applyTheme(theme: Theme, animate = false) {
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;

  // Add transition class for smooth theme switching (respects reduced motion)
  if (animate && !prefersReducedMotion()) {
    document.documentElement.classList.add('theme-transitioning');
    // Remove the class after the transition completes
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 300);
  }

  if (resolvedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * Hook for managing theme preference.
 * Supports dark, light, and system (follows OS preference).
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => {
    const stored = getStoredTheme();
    return stored === 'system' ? getSystemTheme() : stored;
  });

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);
    setResolvedTheme(theme === 'system' ? getSystemTheme() : theme);
  }, [theme]);

  // Listen for system theme changes when using 'system' preference
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      applyTheme('system');
      setResolvedTheme(getSystemTheme());
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Listen for storage changes to sync across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const newTheme = e.newValue as Theme;
        if (newTheme === 'light' || newTheme === 'dark' || newTheme === 'system') {
          setThemeState(newTheme);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem(STORAGE_KEY, newTheme);
    // Animate the transition when user explicitly changes theme
    applyTheme(newTheme, true);
    setThemeState(newTheme);
  }, []);

  return {
    theme,
    resolvedTheme,
    setTheme,
    isDark: resolvedTheme === 'dark',
    isLight: resolvedTheme === 'light',
  };
}
