import { useState, useEffect, useMemo } from 'react';
import type { Issue, PR, EntityLink } from '../types';

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
      <div className="relative bg-[#161b22] border border-gray-700 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[70vh] overflow-hidden modal-content-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            Link {entityType === 'issue' ? 'Issue' : 'PR'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-700">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
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
              className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto max-h-[calc(70vh-140px)]">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              {search
                ? `No ${entityType === 'issue' ? 'issues' : 'PRs'} found`
                : `No ${entityType === 'issue' ? 'issues' : 'PRs'} available`}
            </div>
          ) : (
            <div className="divide-y divide-gray-700/50">
              {items.map((item) => {
                const linked = isLinked(item.number);
                const isAdding = adding === item.number;

                return (
                  <button
                    key={item.number}
                    onClick={() => handleAdd(item.number)}
                    disabled={linked || isAdding}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      linked
                        ? 'opacity-50 cursor-not-allowed bg-gray-800/30'
                        : isAdding
                        ? 'bg-blue-900/20 cursor-wait'
                        : 'hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Number */}
                      <span
                        className={`text-sm font-mono shrink-0 ${
                          entityType === 'issue' ? 'text-green-400' : 'text-purple-400'
                        }`}
                      >
                        #{item.number}
                      </span>

                      {/* Title */}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white truncate">{item.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {item.state === 'open' ? (
                            <span className="text-green-400">Open</span>
                          ) : (
                            <span className="text-gray-400">Closed</span>
                          )}
                          {' · '}
                          {item.author}
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="shrink-0">
                        {linked ? (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Linked
                          </span>
                        ) : isAdding ? (
                          <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
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
