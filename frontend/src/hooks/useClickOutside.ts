import { useEffect, RefObject } from 'react';

/**
 * Hook that detects clicks outside of specified elements and calls a callback.
 * Useful for closing dropdowns, modals, or any dismissible UI elements.
 *
 * @param refs - Array of refs to elements that should be considered "inside"
 * @param callback - Function to call when a click outside is detected
 * @param enabled - Optional flag to enable/disable the listener (default: true)
 */
export function useClickOutside(
  refs: RefObject<HTMLElement | null>[],
  callback: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isOutsideAll = refs.every(
        (ref) => ref.current && !ref.current.contains(target)
      );
      if (isOutsideAll) {
        callback();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [refs, callback, enabled]);
}
