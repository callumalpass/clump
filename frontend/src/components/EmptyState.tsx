import { ReactNode, useState, useEffect, useRef } from 'react';

// Standard icons used across empty states
const Icons = {
  issues: (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  prs: (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  ),
  sessions: (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  filter: (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  ),
  search: (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  schedules: (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  cursor: (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
    </svg>
  ),
  error: (
    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
};

export type EmptyStateIconType = keyof typeof Icons;

/**
 * TypewriterText - Animates text with a typing effect
 * Shows text appearing character by character with a blinking cursor
 */
export interface TypewriterTextProps {
  text: string;
  /** Delay between each character in ms */
  charDelay?: number;
  /** Initial delay before typing starts in ms */
  startDelay?: number;
  /** Whether to show the blinking cursor */
  showCursor?: boolean;
  /** Class name for the text */
  className?: string;
}

export function TypewriterText({
  text,
  charDelay = 50,
  startDelay = 300,
  showCursor = true,
  className = '',
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const indexRef = useRef(0);
  const hasStartedRef = useRef(false);

  // Check for reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    // Skip animation if reduced motion is preferred
    if (prefersReducedMotion) {
      setDisplayedText(text);
      setIsDone(true);
      return;
    }

    // Reset state when text changes
    if (hasStartedRef.current && text !== displayedText.slice(0, text.length)) {
      setDisplayedText('');
      indexRef.current = 0;
      setIsTyping(false);
      setIsDone(false);
      hasStartedRef.current = false;
    }

    // Start typing after initial delay
    const startTimer = setTimeout(() => {
      setIsTyping(true);
      hasStartedRef.current = true;
    }, startDelay);

    return () => clearTimeout(startTimer);
  }, [text, startDelay, prefersReducedMotion]);

  useEffect(() => {
    if (!isTyping || prefersReducedMotion) return;

    if (indexRef.current < text.length) {
      const charTimer = setTimeout(() => {
        setDisplayedText(text.slice(0, indexRef.current + 1));
        indexRef.current += 1;
      }, charDelay);

      return () => clearTimeout(charTimer);
    } else {
      setIsDone(true);
      setIsTyping(false);
    }
  }, [isTyping, displayedText, text, charDelay, prefersReducedMotion]);

  return (
    <span className={`typewriter-text ${className}`}>
      {displayedText}
      {showCursor && !isDone && (
        <span className="typewriter-cursor" aria-hidden="true">|</span>
      )}
    </span>
  );
}

interface EmptyStateProps {
  /** Icon to display - use preset name or provide custom ReactNode */
  icon?: EmptyStateIconType | ReactNode;
  /** Main heading text */
  title: string;
  /** Secondary descriptive text */
  description?: string;
  /** Optional action button(s) */
  action?: ReactNode;
  /** Size variant - affects padding and text sizes */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show the floating animation on the icon */
  animate?: boolean;
  /** Whether to show the title with a typewriter effect */
  typewriter?: boolean;
  /** Custom className for the container */
  className?: string;
}

/**
 * EmptyState - A consistent empty state component for lists and panels
 *
 * Features:
 * - Preset icons for common use cases (issues, prs, sessions, etc.)
 * - Support for custom icons
 * - Size variants for different contexts
 * - Optional floating animation
 * - Action button slot
 */
export function EmptyState({
  icon = 'cursor',
  title,
  description,
  action,
  size = 'md',
  animate = true,
  typewriter = false,
  className = '',
}: EmptyStateProps) {
  // Resolve icon - either use preset or render custom
  const iconContent = typeof icon === 'string' ? Icons[icon as EmptyStateIconType] : icon;

  // Size-based classes
  const sizeClasses = {
    sm: {
      container: 'p-4 max-w-xs',
      iconWrapper: 'w-12 h-12 mb-3',
      title: 'text-sm font-medium mb-0.5',
      description: 'text-xs mb-2',
    },
    md: {
      container: 'p-6 max-w-sm',
      iconWrapper: 'w-14 h-14 mb-4',
      title: 'text-base font-medium mb-1',
      description: 'text-sm mb-3',
    },
    lg: {
      container: 'p-8 max-w-md',
      iconWrapper: 'w-16 h-16 mb-5',
      title: 'text-lg font-medium mb-2',
      description: 'text-sm mb-4',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className={`flex items-center justify-center flex-1 p-4 ${className}`}>
      <div className={`text-center rounded-xl bg-gray-800/40 border border-gray-750/50 empty-state-enter ${classes.container}`}>
        {/* Icon */}
        <div
          className={`rounded-full bg-gray-700/50 flex items-center justify-center mx-auto ${classes.iconWrapper} ${
            animate ? 'empty-state-icon-float' : ''
          }`}
        >
          {iconContent}
        </div>

        {/* Title */}
        <p className={`text-gray-300 ${classes.title}`}>
          {typewriter ? <TypewriterText text={title} /> : title}
        </p>

        {/* Description */}
        {description && (
          <p className={`text-gray-400 ${classes.description}`}>
            {description}
          </p>
        )}

        {/* Action */}
        {action && (
          <div className="mt-3">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * EmptyStateAction - A styled button for use in EmptyState action slot
 */
interface EmptyStateActionProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}

export function EmptyStateAction({ onClick, children, variant = 'secondary' }: EmptyStateActionProps) {
  const baseClasses = 'px-3 py-1.5 text-xs rounded transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 btn-squish';
  const variantClasses = variant === 'primary'
    ? 'bg-blurple-500 hover:bg-blue-700 text-white focus-visible:ring-blue-500'
    : 'bg-gray-700 hover:bg-gray-600 text-gray-200 focus-visible:ring-gray-500';

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${variantClasses}`}
    >
      {children}
    </button>
  );
}
