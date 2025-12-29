import { useEffect } from 'react';
import type { StatsResponse } from '../types';
import { StatsView } from './StatsView';
import { useTheme } from '../hooks/useTheme';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: StatsResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function StatsModal({ isOpen, onClose, stats, loading, error, onRefresh }: StatsModalProps) {
  const { isLight } = useTheme();

  // Theme-aware colors
  const modalBg = isLight ? 'bg-white' : 'bg-[#161b22]';
  const modalBorder = isLight ? 'border-[#dfe6e9]' : 'border-gray-700';
  const headerBorder = isLight ? 'border-[#dfe6e9]' : 'border-gray-700';
  const textPrimary = isLight ? 'text-[#2d3436]' : 'text-white';
  const textMuted = isLight ? 'text-[#636e72]' : 'text-gray-400';
  const hoverBg = isLight ? 'hover:bg-[#f4f4f0]' : 'hover:bg-gray-700';
  const focusOffset = isLight ? 'focus-visible:ring-offset-white' : 'focus-visible:ring-offset-gray-900';
  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-enter">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative ${modalBg} border ${modalBorder} rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col mx-4 modal-content-enter`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${headerBorder}`}>
          <h2 className={`text-lg font-semibold ${textPrimary}`}>Usage Statistics</h2>
          <button
            onClick={onClose}
            className={`p-1 ${hoverBg} rounded ${textMuted} hover:text-[#e84393] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6c5ce7] focus-visible:ring-offset-1 ${focusOffset}`}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <StatsView
            stats={stats}
            loading={loading}
            error={error}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    </div>
  );
}
