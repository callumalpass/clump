interface AlertMessageProps {
  type: 'error' | 'warning' | 'success' | 'info';
  message: string;
  className?: string;
}

const iconPaths: Record<AlertMessageProps['type'], string> = {
  error: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

const styles: Record<AlertMessageProps['type'], { container: string; icon: string }> = {
  error: {
    container: 'bg-red-900/30 border-red-700/60 text-red-300',
    icon: 'text-red-400',
  },
  warning: {
    container: 'bg-yellow-900/30 border-yellow-700/60 text-yellow-300',
    icon: 'text-yellow-400',
  },
  success: {
    container: 'bg-green-900/30 border-green-700/60 text-green-300',
    icon: 'text-green-400',
  },
  info: {
    container: 'bg-blue-900/30 border-blue-700/60 text-blue-300',
    icon: 'text-blue-400',
  },
};

export function AlertMessage({ type, message, className = '' }: AlertMessageProps) {
  const typeStyles = styles[type];
  const iconPath = iconPaths[type];

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded-md border text-sm ${typeStyles.container} ${className}`}
      role="alert"
    >
      <svg
        className={`w-4 h-4 mt-0.5 shrink-0 ${typeStyles.icon}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
      </svg>
      <span>{message}</span>
    </div>
  );
}
