import { memo } from 'react';

/** Consistent focus ring styling for accessibility */
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900';

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
 */
export const Pagination = memo(function Pagination({
  page,
  totalPages,
  onPageChange,
  showKeyboardHints = true,
}: PaginationProps) {
  const safeTotal = Math.max(totalPages, 1);
  const progress = safeTotal > 1 ? ((page - 1) / (safeTotal - 1)) * 100 : 100;

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
        <span className="px-2 text-gray-300 tabular-nums min-w-[48px] text-center">
          {page} / {safeTotal}
        </span>
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
