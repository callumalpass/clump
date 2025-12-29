import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabIndicator } from './useTabIndicator';

describe('useTabIndicator', () => {
  let originalRAF: typeof requestAnimationFrame;
  let originalCAF: typeof cancelAnimationFrame;

  beforeEach(() => {
    // Mock requestAnimationFrame to execute immediately
    originalRAF = window.requestAnimationFrame;
    originalCAF = window.cancelAnimationFrame;

    window.requestAnimationFrame = vi.fn((callback) => {
      callback(performance.now());
      return 1;
    });
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
  });

  describe('initial state', () => {
    it('returns initial indicator style with zero values', () => {
      const { result } = renderHook(() => useTabIndicator(null));

      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });
    });

    it('returns container ref', () => {
      const { result } = renderHook(() => useTabIndicator('tab-1'));

      expect(result.current.containerRef).toBeDefined();
      expect(result.current.containerRef.current).toBeNull();
    });

    it('returns tab refs map', () => {
      const { result } = renderHook(() => useTabIndicator('tab-1'));

      expect(result.current.tabRefs).toBeDefined();
      expect(result.current.tabRefs.current).toBeInstanceOf(Map);
    });

    it('returns default options when not provided', () => {
      const { result } = renderHook(() => useTabIndicator('tab-1'));

      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });
      expect(result.current.containerRef).toBeDefined();
      expect(result.current.tabRefs).toBeDefined();
    });
  });

  describe('ref stability', () => {
    it('maintains stable tab refs Map across rerenders', () => {
      const { result, rerender } = renderHook(
        ({ activeTab }) => useTabIndicator(activeTab),
        { initialProps: { activeTab: 'tab-1' } }
      );

      const tabRefsInitial = result.current.tabRefs;

      rerender({ activeTab: 'tab-2' });

      // tabRefs should be the same reference
      expect(result.current.tabRefs).toBe(tabRefsInitial);
    });

    it('maintains stable container ref across rerenders', () => {
      const { result, rerender } = renderHook(
        ({ activeTab }) => useTabIndicator(activeTab),
        { initialProps: { activeTab: 'tab-1' } }
      );

      const containerRefInitial = result.current.containerRef;

      rerender({ activeTab: 'tab-2' });

      // containerRef should be the same reference
      expect(result.current.containerRef).toBe(containerRefInitial);
    });
  });

  describe('type generics', () => {
    it('works with HTMLDivElement generic', () => {
      const { result } = renderHook(() => useTabIndicator<HTMLDivElement>('tab-1'));
      expect(result.current.containerRef).toBeDefined();
    });

    it('works with HTMLUListElement generic', () => {
      const { result } = renderHook(() => useTabIndicator<HTMLUListElement>('tab-1'));
      expect(result.current.containerRef).toBeDefined();
    });

    it('works with default HTMLElement generic', () => {
      const { result } = renderHook(() => useTabIndicator('tab-1'));
      expect(result.current.containerRef).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('handles null active tab', () => {
      const { result } = renderHook(() => useTabIndicator(null));

      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });
    });

    it('handles container ref being null gracefully', () => {
      const { result } = renderHook(() => useTabIndicator<HTMLDivElement>('tab-1'));

      // Container ref is null by default
      expect(result.current.containerRef.current).toBeNull();

      // Should not throw and indicator should be at initial state
      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });
    });

    it('resets indicator when active tab element is not in tabRefs', () => {
      const { result, rerender } = renderHook(
        ({ activeTab }) => useTabIndicator<HTMLDivElement>(activeTab),
        { initialProps: { activeTab: null as string | null } }
      );

      const container = document.createElement('div');
      container.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50, x: 0, y: 0, toJSON: () => ({})
      }));

      // Set container but no tab elements
      (result.current.containerRef as { current: HTMLDivElement | null }).current = container;

      // Try to select a tab that doesn't exist in tabRefs
      rerender({ activeTab: 'non-existent-tab' });

      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });
    });
  });

  describe('enabled option', () => {
    it('skips updates when enabled is false', () => {
      const { result } = renderHook(() =>
        useTabIndicator<HTMLDivElement>('tab-1', { enabled: false })
      );

      const container = document.createElement('div');
      const tabElement = document.createElement('button');

      container.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50, x: 0, y: 0, toJSON: () => ({})
      }));
      tabElement.getBoundingClientRect = vi.fn(() => ({
        left: 10, top: 0, right: 60, bottom: 50, width: 50, height: 50, x: 10, y: 0, toJSON: () => ({})
      }));

      (result.current.containerRef as { current: HTMLDivElement | null }).current = container;
      result.current.tabRefs.current.set('tab-1', tabElement);

      // Should remain at initial state since enabled is false
      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });
    });

    it('updates indicator when enabled changes from false to true', () => {
      const { result, rerender } = renderHook(
        ({ activeTab, enabled }) => useTabIndicator<HTMLDivElement>(activeTab, { enabled }),
        { initialProps: { activeTab: 'tab-1' as string | null, enabled: false } }
      );

      const container = document.createElement('div');
      const tabElement = document.createElement('button');

      container.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50, x: 0, y: 0, toJSON: () => ({})
      }));
      tabElement.getBoundingClientRect = vi.fn(() => ({
        left: 10, top: 0, right: 60, bottom: 50, width: 50, height: 50, x: 10, y: 0, toJSON: () => ({})
      }));

      (result.current.containerRef as { current: HTMLDivElement | null }).current = container;
      result.current.tabRefs.current.set('tab-1', tabElement);

      // Should remain at initial state since enabled is false
      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });

      // Enable it
      rerender({ activeTab: 'tab-1', enabled: true });

      // Now should be updated
      expect(result.current.indicatorStyle).toEqual({ left: 10, width: 50 });
    });
  });

  describe('indicator calculation', () => {
    it('calculates indicator position relative to container', () => {
      const { result, rerender } = renderHook(
        ({ activeTab }) => useTabIndicator<HTMLDivElement>(activeTab),
        { initialProps: { activeTab: null as string | null } }
      );

      // Create mock DOM elements
      const container = document.createElement('div');
      const tabElement = document.createElement('button');

      // Mock getBoundingClientRect - container at position 100
      container.getBoundingClientRect = vi.fn(() => ({
        left: 100, top: 0, right: 300, bottom: 50, width: 200, height: 50, x: 100, y: 0, toJSON: () => ({})
      }));

      // Tab at position 150 (50px from container left)
      tabElement.getBoundingClientRect = vi.fn(() => ({
        left: 150, top: 0, right: 230, bottom: 50, width: 80, height: 50, x: 150, y: 0, toJSON: () => ({})
      }));

      // Set up the refs
      (result.current.containerRef as { current: HTMLDivElement | null }).current = container;
      result.current.tabRefs.current.set('tab-1', tabElement);

      // Trigger update by changing active tab
      rerender({ activeTab: 'tab-1' });

      // Should calculate relative position: 150 - 100 = 50
      expect(result.current.indicatorStyle).toEqual({ left: 50, width: 80 });
    });

    it('updates indicator when switching between tabs', () => {
      const { result, rerender } = renderHook(
        ({ activeTab }) => useTabIndicator<HTMLDivElement>(activeTab),
        { initialProps: { activeTab: null as string | null } }
      );

      const container = document.createElement('div');
      const tab1 = document.createElement('button');
      const tab2 = document.createElement('button');

      container.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, right: 200, bottom: 50, width: 200, height: 50, x: 0, y: 0, toJSON: () => ({})
      }));
      tab1.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, right: 50, bottom: 50, width: 50, height: 50, x: 0, y: 0, toJSON: () => ({})
      }));
      tab2.getBoundingClientRect = vi.fn(() => ({
        left: 60, top: 0, right: 130, bottom: 50, width: 70, height: 50, x: 60, y: 0, toJSON: () => ({})
      }));

      (result.current.containerRef as { current: HTMLDivElement | null }).current = container;
      result.current.tabRefs.current.set('tab-1', tab1);
      result.current.tabRefs.current.set('tab-2', tab2);

      // Select first tab
      rerender({ activeTab: 'tab-1' });
      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 50 });

      // Switch to second tab
      rerender({ activeTab: 'tab-2' });
      expect(result.current.indicatorStyle).toEqual({ left: 60, width: 70 });

      // Switch back to first tab
      rerender({ activeTab: 'tab-1' });
      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 50 });
    });

    it('resets indicator when active tab becomes null', () => {
      const { result, rerender } = renderHook(
        ({ activeTab }) => useTabIndicator<HTMLDivElement>(activeTab),
        { initialProps: { activeTab: null as string | null } }
      );

      const container = document.createElement('div');
      const tabElement = document.createElement('button');

      container.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50, x: 0, y: 0, toJSON: () => ({})
      }));
      tabElement.getBoundingClientRect = vi.fn(() => ({
        left: 10, top: 0, right: 60, bottom: 50, width: 50, height: 50, x: 10, y: 0, toJSON: () => ({})
      }));

      (result.current.containerRef as { current: HTMLDivElement | null }).current = container;
      result.current.tabRefs.current.set('tab-1', tabElement);

      // First select a tab
      rerender({ activeTab: 'tab-1' });
      expect(result.current.indicatorStyle).toEqual({ left: 10, width: 50 });

      // Now set to null
      rerender({ activeTab: null });
      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });
    });
  });

  describe('watchResize option', () => {
    it('accepts watchResize option without error', () => {
      // This test ensures the hook accepts the watchResize option
      // The ResizeObserver functionality is exercised in integration tests
      const { result } = renderHook(() =>
        useTabIndicator<HTMLDivElement>('tab-1', { watchResize: true })
      );

      // Hook should return normally with watchResize enabled
      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });
      expect(result.current.containerRef).toBeDefined();
      expect(result.current.tabRefs).toBeDefined();
    });

    it('works the same with watchResize false', () => {
      const { result } = renderHook(() =>
        useTabIndicator<HTMLDivElement>('tab-1', { watchResize: false })
      );

      expect(result.current.indicatorStyle).toEqual({ left: 0, width: 0 });
      expect(result.current.containerRef).toBeDefined();
      expect(result.current.tabRefs).toBeDefined();
    });

    it('defaults to watchResize false when not provided', () => {
      // Without options, should behave the same as watchResize: false
      const { result: resultWithout } = renderHook(() =>
        useTabIndicator<HTMLDivElement>('tab-1')
      );
      const { result: resultWith } = renderHook(() =>
        useTabIndicator<HTMLDivElement>('tab-1', { watchResize: false })
      );

      expect(resultWithout.current.indicatorStyle).toEqual(resultWith.current.indicatorStyle);
    });
  });
});
