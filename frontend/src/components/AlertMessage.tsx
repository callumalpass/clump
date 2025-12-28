interface AlertMessageProps {
  type: 'error' | 'warning' | 'success' | 'info';
  message: string;
  className?: string;
  /** Optional callback to dismiss the alert. When provided, shows a close button. */
  onDismiss?: () => void;
}

const iconPaths: Record<AlertMessageProps['type'], string> = {
  error: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

// Styles with CSS custom properties for the accent bar glow effect
const styles: Record<AlertMessageProps['type'], { container: string; icon: string; accentColor: string; glowColor: string }> = {
  error: {
    container: 'bg-red-900/30 border-red-700/60 text-red-300',
    icon: 'text-red-400',
    accentColor: '#f87171', // red-400
    glowColor: 'rgba(248, 113, 113, 0.4)',
  },
  warning: {
    container: 'bg-yellow-900/30 border-yellow-700/60 text-yellow-300',
    icon: 'text-yellow-400',
    accentColor: '#facc15', // yellow-400
    glowColor: 'rgba(250, 204, 21, 0.4)',
  },
  success: {
    container: 'bg-green-900/30 border-green-700/60 text-green-300',
    icon: 'text-green-400',
    accentColor: '#4ade80', // green-400
    glowColor: 'rgba(74, 222, 128, 0.4)',
  },
  info: {
    container: 'bg-blue-900/30 border-blue-700/60 text-blue-300',
    icon: 'text-blue-400',
    accentColor: '#60a5fa', // blue-400
    glowColor: 'rgba(96, 165, 250, 0.4)',
  },
};

export function AlertMessage({ type, message, className = '', onDismiss }: AlertMessageProps) {
  const typeStyles = styles[type];
  const iconPath = iconPaths[type];

  return (
    <div
      className={`alert-enter alert-accent flex items-start gap-2 pl-4 pr-3 py-2 rounded-md border text-sm ${typeStyles.container} ${className}`}
      style={{
        '--alert-color': typeStyles.accentColor,
        '--alert-glow': typeStyles.glowColor,
      } as React.CSSProperties}
      role="alert"
      aria-live="polite"
    >
      <svg
        className={`w-4 h-4 mt-0.5 shrink-0 alert-icon-enter ${typeStyles.icon}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
      </svg>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 p-0.5 rounded-sm opacity-60 hover:opacity-100 hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label="Dismiss"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
