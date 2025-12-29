import { useState, useLayoutEffect, useRef } from 'react';

export interface TabIndicatorStyle {
  left: number;
  width: number;
}

export interface UseTabIndicatorOptions {
  /** Whether the tab container is visible/mounted. When false, indicator updates are skipped. */
  enabled?: boolean;
  /** Watch for resize changes on tab elements and container */
  watchResize?: boolean;
}

/**
 * Custom hook for managing animated tab indicator positioning.
 *
 * Returns a ref for the container, a Map ref for individual tabs, and the current indicator style.
 * The indicator style updates automatically when the active tab changes.
 *
 * @example
 * ```tsx
 * const { containerRef, tabRefs, indicatorStyle } = useTabIndicator(activeTab);
 *
 * return (
 *   <div ref={containerRef}>
 *     {tabs.map(tab => (
 *       <button ref={el => el && tabRefs.current.set(tab.id, el)}>
 *         {tab.label}
 *       </button>
 *     ))}
 *     <div style={{ left: indicatorStyle.left, width: indicatorStyle.width }} />
 *   </div>
 * );
 * ```
 */
export function useTabIndicator<T extends HTMLElement = HTMLElement>(
  activeTab: string | null,
  options: UseTabIndicatorOptions = {}
): {
  containerRef: React.RefObject<T>;
  tabRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  indicatorStyle: TabIndicatorStyle;
} {
  const { enabled = true, watchResize = false } = options;

  const containerRef = useRef<T>(null);
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<TabIndicatorStyle>({ left: 0, width: 0 });

  useLayoutEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const updateIndicator = () => {
      const activeTabElement = activeTab ? tabRefs.current.get(activeTab) : null;
      if (activeTabElement) {
        const containerRect = container.getBoundingClientRect();
        const tabRect = activeTabElement.getBoundingClientRect();
        setIndicatorStyle({
          left: tabRect.left - containerRect.left,
          width: tabRect.width,
        });
      } else {
        // No active tab - hide indicator
        setIndicatorStyle({ left: 0, width: 0 });
      }
    };

    // Initial update - use rAF to ensure DOM has settled
    const rafId = requestAnimationFrame(updateIndicator);

    // Optional: Watch for size changes
    let resizeObserver: ResizeObserver | null = null;
    if (watchResize) {
      resizeObserver = new ResizeObserver(updateIndicator);
      tabRefs.current.forEach((el) => resizeObserver!.observe(el));
      resizeObserver.observe(container);
      window.addEventListener('resize', updateIndicator);
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (watchResize) {
        resizeObserver?.disconnect();
        window.removeEventListener('resize', updateIndicator);
      }
    };
  }, [activeTab, enabled, watchResize]);

  return { containerRef, tabRefs, indicatorStyle };
}
