import { useState } from 'react';
import type { Repo } from '../types';

interface RepoSelectorProps {
  repos: Repo[];
  selectedRepo: Repo | null;
  onSelectRepo: (repo: Repo) => void;
  onAddRepo: (localPath: string) => Promise<Repo>;
}

export function RepoSelector({
  repos,
  selectedRepo,
  onSelectRepo,
  onAddRepo,
}: RepoSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
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

  return (
    <div className="p-2 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <select
          value={selectedRepo?.id ?? ''}
          onChange={(e) => {
            const repo = repos.find((r) => r.id === Number(e.target.value));
            if (repo) onSelectRepo(repo);
          }}
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select repository...</option>
          {repos.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.owner}/{repo.name}
            </option>
          ))}
        </select>
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
            className="w-full px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-gray-900"
          >
            {isLoading ? 'Adding...' : 'Add Repository'}
          </button>
        </form>
      )}
    </div>
  );
}
