import { memo, useState, useRef, useEffect } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = () => {
    const newPage = parseInt(inputValue, 10);
    if (!isNaN(newPage) && newPage >= 1 && newPage <= safeTotal && newPage !== page) {
      onPageChange(newPage);
    } else {
      setInputValue(String(page));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setInputValue(String(page));
      setIsEditing(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
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
          <div className="flex items-center gap-0.5 min-w-[48px] justify-center">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ''))}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
              className={`w-8 px-1 py-0.5 text-xs text-center bg-gray-700 border border-blue-500 rounded tabular-nums text-white ${focusRing}`}
              aria-label="Enter page number"
            />
            <span className="text-gray-500 text-xs">/ {safeTotal}</span>
          </div>
        ) : (
          <button
            onClick={() => safeTotal > 1 && setIsEditing(true)}
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
        <div className="h-4 w-12 rounded mx-1 skeleton-shimmer" />
        <div className={`h-7 ${variant === 'compact' ? 'w-14' : 'w-16'} rounded skeleton-shimmer`} />
      </div>
      <div className="w-16 h-0.5 rounded-full skeleton-shimmer" />
    </div>
  );
});
