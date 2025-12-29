import { useState, useEffect, useRef, useCallback } from 'react';
import type { Repo, RepoSessionCount } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { focusRing } from '../utils/styles';

interface RepoSelectorProps {
  repos: Repo[];
  selectedRepo: Repo | null;
  onSelectRepo: (repo: Repo) => void;
  onAddRepo: (localPath: string) => Promise<Repo>;
  onDeleteRepo?: (id: number) => Promise<void>;
  sessionCounts?: Map<number, RepoSessionCount>;
}

export function RepoSelector({
  repos,
  selectedRepo,
  onSelectRepo,
  onAddRepo,
  onDeleteRepo,
  sessionCounts,
}: RepoSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [localPath, setLocalPath] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [deleteConfirmRepo, setDeleteConfirmRepo] = useState<Repo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await onAddRepo(localPath);
      setLocalPath('');
      setIsAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRepo = useCallback((repo: Repo) => {
    onSelectRepo(repo);
    setIsOpen(false);
    setHighlightedIndex(-1);
    buttonRef.current?.focus();
  }, [onSelectRepo]);

  const handleDeleteClick = useCallback((e: React.MouseEvent, repo: Repo) => {
    e.stopPropagation();
    setDeleteConfirmRepo(repo);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmRepo || !onDeleteRepo) return;

    setIsDeleting(true);
    try {
      await onDeleteRepo(deleteConfirmRepo.id);
      setDeleteConfirmRepo(null);
      // If we deleted the selected repo, clear the selection
      if (selectedRepo?.id === deleteConfirmRepo.id) {
        // Find another repo to select, or null if none
        const remainingRepos = repos.filter(r => r.id !== deleteConfirmRepo.id);
        if (remainingRepos.length > 0) {
          onSelectRepo(remainingRepos[0]!);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete repository');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteConfirmRepo, onDeleteRepo, selectedRepo, repos, onSelectRepo]);

  // Reset highlighted index when dropdown opens/closes
  useEffect(() => {
    if (isOpen) {
      // Find currently selected repo index to start highlighting there
      const selectedIndex = repos.findIndex(r => r.id === selectedRepo?.id);
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, repos, selectedRepo?.id]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < repos.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : repos.length - 1
        );
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        const selectedItem = repos[highlightedIndex];
        if (highlightedIndex >= 0 && selectedItem) {
          handleSelectRepo(selectedItem);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        buttonRef.current?.focus();
        break;
      case 'Home':
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setHighlightedIndex(repos.length - 1);
        break;
    }
  }, [isOpen, repos, highlightedIndex, handleSelectRepo]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[role="option"]');
      const item = items[highlightedIndex];
      // scrollIntoView may not be available in test environments (JSDOM)
      if (item && typeof item.scrollIntoView === 'function') {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen, highlightedIndex]);

  // Get counts for selected repo
  const selectedCounts = selectedRepo ? sessionCounts?.get(selectedRepo.id) : undefined;

  return (
    <div className="p-2 border-b border-gray-700">
      <div className="flex items-center gap-2">
        {/* Custom dropdown */}
        <div className="relative flex-1">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            onKeyDown={handleKeyDown}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 text-left flex items-center justify-between transition-colors"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Select repository"
          >
            <span className="flex items-center gap-2 min-w-0">
              {selectedRepo ? (
                <>
                  <span className="truncate">{selectedRepo.owner}/{selectedRepo.name}</span>
                  {selectedCounts && selectedCounts.active > 0 && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                      {selectedCounts.active}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-gray-400">Select repository...</span>
              )}
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {isOpen && (
            <>
              {/* Backdrop to close dropdown - subtle overlay for visual hierarchy */}
              <div
                className="fixed inset-0 z-10 bg-black/20 transition-opacity"
                onClick={() => setIsOpen(false)}
              />

              <div
                ref={dropdownRef}
                className="absolute z-20 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-64 overflow-auto dropdown-menu-enter"
                role="listbox"
                aria-label="Repository list"
                onKeyDown={handleKeyDown}
              >
                {repos.length === 0 ? (
                  <div className="px-4 py-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-300 font-medium">No repositories added</p>
                    <p className="text-xs text-gray-500 mt-0.5">Click + to add one</p>
                  </div>
                ) : (
                  repos.map((repo, index) => {
                    const counts = sessionCounts?.get(repo.id);
                    const isSelected = selectedRepo?.id === repo.id;
                    const isHighlighted = highlightedIndex === index;

                    return (
                      <div
                        key={repo.id}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectRepo(repo)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`group/repo w-full px-3 py-2 text-sm text-left flex items-center justify-between transition-colors cursor-pointer ${
                          isHighlighted
                            ? 'bg-blue-600/30 text-white'
                            : isSelected
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-200 hover:bg-gray-700'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {isSelected && (
                            <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          <span className={`truncate ${!isSelected ? 'ml-6' : ''}`}>{repo.owner}/{repo.name}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0 ml-2">
                          {counts && counts.active > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                              {counts.active}
                            </span>
                          )}
                          {counts && counts.total > 0 && (
                            <span className="text-xs text-gray-500 group-hover/repo:hidden">
                              {counts.total} session{counts.total !== 1 ? 's' : ''}
                            </span>
                          )}
                          {onDeleteRepo && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteClick(e, repo)}
                              className={`p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/15 transition-all ${
                                counts && counts.total > 0 ? 'hidden group-hover/repo:block' : 'opacity-0 group-hover/repo:opacity-100'
                              } ${focusRing}`}
                              title={`Remove ${repo.owner}/${repo.name}`}
                              aria-label={`Remove ${repo.owner}/${repo.name} from list`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-2 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {isAdding ? '×' : '+'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mt-2 space-y-2">
          <input
            type="text"
            placeholder="Local path (e.g., ~/projects/my-repo)"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            required
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500">
            Owner and repo name will be detected from the git remote
          </p>
          {error && <div className="text-red-400 text-xs">{error}</div>}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
          >
            {isLoading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isLoading ? 'Adding...' : 'Add Repository'}
          </button>
        </form>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmRepo !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmRepo(null)}
        title="Remove Repository"
        message={deleteConfirmRepo
          ? `Remove "${deleteConfirmRepo.owner}/${deleteConfirmRepo.name}" from the list? This will delete all saved sessions and data for this repository.`
          : ''
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  );
}
