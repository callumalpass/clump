import { useState, useEffect, useMemo } from 'react';
import type { Issue, PR, EntityLink } from '../types';
import { useTheme } from '../hooks/useTheme';

type EntityType = 'issue' | 'pr';

interface EntityPickerProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: EntityType;
  issues: Issue[];
  prs: PR[];
  linkedEntities: EntityLink[];
  onAdd: (kind: string, number: number) => Promise<void>;
}

export function EntityPicker({
  isOpen,
  onClose,
  entityType,
  issues,
  prs,
  linkedEntities,
  onAdd,
}: EntityPickerProps) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<number | null>(null);
  const { isLight } = useTheme();

  // Theme-aware colors
  const modalBg = isLight ? 'bg-white' : 'bg-[#161b22]';
  const modalBorder = isLight ? 'border-[#dfe6e9]' : 'border-gray-700';
  const headerBorder = isLight ? 'border-[#dfe6e9]' : 'border-gray-700';
  const inputBg = isLight ? 'bg-[#f4f4f0]' : 'bg-gray-900';
  const inputBorder = isLight ? 'border-[#dfe6e9]' : 'border-gray-600';
  const textPrimary = isLight ? 'text-[#2d3436]' : 'text-white';
  const textMuted = isLight ? 'text-[#636e72]' : 'text-gray-400';
  const textPlaceholder = isLight ? 'placeholder-[#b2bec3]' : 'placeholder-gray-500';
  const hoverBg = isLight ? 'hover:bg-[#f4f4f0]' : 'hover:bg-gray-700';
  const itemHoverBg = isLight ? 'hover:bg-[#f4f4f0]' : 'hover:bg-gray-800/50';
  const dividerColor = isLight ? 'divide-[#dfe6e9]' : 'divide-gray-700/50';
  const emptyBg = isLight ? 'bg-[#eaeae5]' : 'bg-gray-700/50';

  // Reset search when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setAdding(null);
    }
  }, [isOpen]);

  // Filter items based on search
  const items = useMemo(() => {
    const list = entityType === 'issue' ? issues : prs;
    if (!search.trim()) return list;

    const term = search.toLowerCase();
    return list.filter(
      (item) =>
        item.number.toString().includes(term) ||
        item.title.toLowerCase().includes(term)
    );
  }, [entityType, issues, prs, search]);

  // Check if an item is already linked
  const isLinked = (number: number) =>
    linkedEntities.some((e) => e.kind === entityType && e.number === number);

  const handleAdd = async (number: number) => {
    if (isLinked(number) || adding !== null) return;

    setAdding(number);
    try {
      await onAdd(entityType, number);
    } finally {
      setAdding(null);
    }
  };

  // Handle escape key
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

      {/* Modal */}
      <div className={`relative ${modalBg} border ${modalBorder} rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[70vh] overflow-hidden modal-content-enter`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${headerBorder}`}>
          <h2 className={`text-lg font-semibold ${textPrimary}`}>
            Link {entityType === 'issue' ? 'Issue' : 'PR'}
          </h2>
          <button
            onClick={onClose}
            className={`p-1 ${hoverBg} rounded ${textMuted} hover:text-[#e84393] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className={`px-4 py-3 border-b ${headerBorder}`}>
          <div className="relative">
            <svg
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${entityType === 'issue' ? 'issues' : 'PRs'}...`}
              className={`w-full ${inputBg} border ${inputBorder} rounded-lg pl-10 pr-4 py-2 text-sm ${textPrimary} ${textPlaceholder} focus:outline-none focus:border-[#6c5ce7]`}
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto max-h-[calc(70vh-140px)]">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center empty-state-enter">
              <div className={`w-12 h-12 rounded-full ${emptyBg} flex items-center justify-center mx-auto mb-3 empty-state-icon-float`}>
                <svg className={`w-6 h-6 ${textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className={textMuted}>
                {search
                  ? `No ${entityType === 'issue' ? 'issues' : 'PRs'} found`
                  : `No ${entityType === 'issue' ? 'issues' : 'PRs'} available`}
              </p>
            </div>
          ) : (
            <div className={`divide-y ${dividerColor}`}>
              {items.map((item, index) => {
                const linked = isLinked(item.number);
                const isCurrentlyAdding = adding === item.number;
                const linkedBg = isLight ? 'bg-[#f4f4f0]' : 'bg-gray-800/30';
                const addingBg = isLight ? 'bg-[#6c5ce7]/10' : 'bg-blue-900/20';

                return (
                  <button
                    key={item.number}
                    onClick={() => handleAdd(item.number)}
                    disabled={linked || isCurrentlyAdding}
                    className={`group w-full px-4 py-3 text-left list-item-hover list-item-enter ${
                      linked
                        ? `opacity-50 cursor-not-allowed ${linkedBg}`
                        : isCurrentlyAdding
                        ? `${addingBg} cursor-wait`
                        : itemHoverBg
                    }`}
                    style={{ '--item-index': Math.min(index, 10) } as React.CSSProperties}
                  >
                    <div className="flex items-start gap-3">
                      {/* Number */}
                      <span
                        className={`text-sm font-mono shrink-0 ${
                          entityType === 'issue'
                            ? isLight ? 'text-[#00b894]' : 'text-green-400'
                            : isLight ? 'text-[#6c5ce7]' : 'text-purple-400'
                        }`}
                      >
                        #{item.number}
                      </span>

                      {/* Title */}
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${textPrimary} truncate`}>{item.title}</div>
                        <div className={`text-xs ${isLight ? 'text-[#b2bec3]' : 'text-gray-500'} mt-0.5`}>
                          {item.state === 'open' ? (
                            <span className={isLight ? 'text-[#00b894]' : 'text-green-400'}>Open</span>
                          ) : (
                            <span className={textMuted}>Closed</span>
                          )}
                          {' · '}
                          {item.author}
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="shrink-0 transition-all duration-150">
                        {linked ? (
                          <span className={`status-badge-enter inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${isLight ? 'bg-[#00b894]/20 text-[#00b894]' : 'bg-green-500/20 text-green-400'} done-badge-glow`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Linked
                          </span>
                        ) : isCurrentlyAdding ? (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${isLight ? 'bg-[#6c5ce7]/20 text-[#6c5ce7]' : 'bg-blue-500/20 text-blue-400'}`}>
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Adding
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${isLight ? 'bg-[#eaeae5] text-[#636e72] group-hover:bg-[#6c5ce7]/20 group-hover:text-[#6c5ce7]' : 'bg-gray-600/50 text-gray-400 group-hover:bg-blue-500/20 group-hover:text-blue-400'} transition-colors`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Link
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
