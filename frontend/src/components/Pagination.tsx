import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { focusRing } from '../utils/styles';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Show keyboard shortcuts on buttons */
  showKeyboardHints?: boolean;
}

/**
 * Reusable pagination control with visual progress indicator.
 * Shows prev/next buttons with a subtle progress bar indicating position.
 * Click on the page number to jump to a specific page.
 */
export const Pagination = memo(function Pagination({
  page,
  totalPages,
  onPageChange,
  showKeyboardHints = true,
}: PaginationProps) {
  const safeTotal = Math.max(totalPages, 1);
  const progress = safeTotal > 1 ? ((page - 1) / (safeTotal - 1)) * 100 : 100;

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(page));
  const [isShaking, setIsShaking] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Sync input value when page changes externally
  useEffect(() => {
    if (!isEditing) {
      setInputValue(String(page));
    }
  }, [page, isEditing]);

  // Trigger shake animation for invalid input
  const triggerShake = useCallback(() => {
    setIsShaking(true);
    // Remove the class after animation completes to allow re-triggering
    const timer = setTimeout(() => setIsShaking(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = () => {
    const newPage = parseInt(inputValue, 10);
    if (!isNaN(newPage) && newPage >= 1 && newPage <= safeTotal && newPage !== page) {
      onPageChange(newPage);
      setIsEditing(false);
    } else if (inputValue === String(page)) {
      // Same page, just close without shake
      setIsEditing(false);
    } else {
      // Invalid input - shake and reset
      triggerShake();
      setInputValue(String(page));
      // Keep editing mode open briefly so user sees the reset
      setTimeout(() => setIsEditing(false), 400);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setInputValue(String(page));
      setIsEditing(false);
    }
  };

  // Show first/last buttons when there are enough pages to make them useful
  const showFirstLast = safeTotal > 3;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        {/* First page button - only show when useful */}
        {showFirstLast && (
          <button
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            className={`btn-secondary p-1 text-xs rounded bg-gray-700 hover:bg-gray-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${focusRing}`}
            aria-label="Go to first page"
            title="First page"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}

        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={`btn-secondary px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${focusRing} flex items-center gap-1.5`}
          aria-label="Go to previous page (press [ key)"
          title="Previous page ([)"
        >
          {showKeyboardHints && <kbd className="kbd-hint">[</kbd>}
          <span>Prev</span>
        </button>

        {/* Clickable page indicator with inline edit */}
        {isEditing ? (
          <div
            className={`flex items-center gap-0.5 min-w-[48px] justify-center ${isShaking ? 'input-shake' : ''} ${
              isAnimating && !prefersReducedMotion ? 'page-number-flip-in' : ''
            }`}
            onAnimationEnd={() => setIsAnimating(false)}
          >
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ''))}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
              className={`w-8 px-1 py-0.5 text-xs text-center bg-gray-700 border rounded tabular-nums text-white transition-colors ${
                isShaking ? 'border-red-500' : 'border-blue-500'
              } ${focusRing}`}
              aria-label="Enter page number"
              aria-invalid={isShaking}
            />
            <span className="text-gray-500 text-xs">/ {safeTotal}</span>
          </div>
        ) : (
          <button
            onClick={() => {
              if (safeTotal > 1) {
                setIsAnimating(true);
                setIsEditing(true);
              }
            }}
            disabled={safeTotal <= 1}
            className={`px-2 py-0.5 text-xs text-gray-300 tabular-nums min-w-[48px] text-center rounded transition-colors ${
              safeTotal > 1
                ? 'hover:bg-gray-700 hover:text-white cursor-pointer'
                : 'cursor-default'
            } ${focusRing}`}
            title={safeTotal > 1 ? 'Click to jump to page' : undefined}
            aria-label={`Page ${page} of ${safeTotal}${safeTotal > 1 ? '. Click to jump to a specific page' : ''}`}
          >
            {page} / {safeTotal}
          </button>
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={`btn-secondary px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${focusRing} flex items-center gap-1.5`}
          aria-label="Go to next page (press ] key)"
          title="Next page (])"
        >
          <span>Next</span>
          {showKeyboardHints && <kbd className="kbd-hint">]</kbd>}
        </button>

        {/* Last page button - only show when useful */}
        {showFirstLast && (
          <button
            onClick={() => onPageChange(safeTotal)}
            disabled={page >= safeTotal}
            className={`btn-secondary p-1 text-xs rounded bg-gray-700 hover:bg-gray-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${focusRing}`}
            aria-label="Go to last page"
            title="Last page"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
      {/* Subtle progress indicator */}
      {safeTotal > 1 && (
        <div
          className="w-16 h-0.5 bg-gray-700 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={page}
          aria-valuemin={1}
          aria-valuemax={safeTotal}
          aria-label={`Page ${page} of ${safeTotal}`}
        >
          <div
            className="h-full bg-blue-500/60 rounded-full transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
});

interface PaginationSkeletonProps {
  /** Width variant for skeleton */
  variant?: 'default' | 'compact';
}

/**
 * Skeleton loading state for pagination.
 */
export const PaginationSkeleton = memo(function PaginationSkeleton({
  variant = 'default',
}: PaginationSkeletonProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <div className={`h-7 ${variant === 'compact' ? 'w-14' : 'w-16'} rounded skeleton-shimmer`} />
        <div className="h-5 w-12 rounded mx-1 skeleton-shimmer" />
        <div className={`h-7 ${variant === 'compact' ? 'w-14' : 'w-16'} rounded skeleton-shimmer`} />
      </div>
      <div className="w-16 h-0.5 rounded-full skeleton-shimmer" />
    </div>
  );
});
