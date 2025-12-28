import { useState } from 'react';
import type { Repo, RepoSessionCount } from '../types';

interface RepoSelectorProps {
  repos: Repo[];
  selectedRepo: Repo | null;
  onSelectRepo: (repo: Repo) => void;
  onAddRepo: (localPath: string) => Promise<Repo>;
  sessionCounts?: Map<number, RepoSessionCount>;
}

export function RepoSelector({
  repos,
  selectedRepo,
  onSelectRepo,
  onAddRepo,
  sessionCounts,
}: RepoSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [localPath, setLocalPath] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

  const handleSelectRepo = (repo: Repo) => {
    onSelectRepo(repo);
    setIsOpen(false);
  };

  // Get counts for selected repo
  const selectedCounts = selectedRepo ? sessionCounts?.get(selectedRepo.id) : undefined;

  return (
    <div className="p-2 border-b border-gray-700">
      <div className="flex items-center gap-2">
        {/* Custom dropdown */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left flex items-center justify-between"
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

              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-64 overflow-auto">
                {repos.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">No repositories added</div>
                ) : (
                  repos.map((repo) => {
                    const counts = sessionCounts?.get(repo.id);
                    const isSelected = selectedRepo?.id === repo.id;

                    return (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => handleSelectRepo(repo)}
                        className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-gray-700 transition-colors ${
                          isSelected ? 'bg-gray-700 text-white' : 'text-gray-200'
                        }`}
                      >
                        <span className="truncate">{repo.owner}/{repo.name}</span>
                        <span className="flex items-center gap-2 shrink-0 ml-2">
                          {counts && counts.active > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                              {counts.active}
                            </span>
                          )}
                          {counts && counts.total > 0 && (
                            <span className="text-xs text-gray-500">
                              {counts.total} session{counts.total !== 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-2 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-gray-900"
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
    </div>
  );
}
