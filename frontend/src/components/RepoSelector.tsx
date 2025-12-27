import { useState } from 'react';
import type { Repo } from '../types';

interface RepoSelectorProps {
  repos: Repo[];
  selectedRepo: Repo | null;
  onSelectRepo: (repo: Repo) => void;
  onAddRepo: (owner: string, name: string, localPath: string) => Promise<Repo>;
}

export function RepoSelector({
  repos,
  selectedRepo,
  onSelectRepo,
  onAddRepo,
}: RepoSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [owner, setOwner] = useState('');
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await onAddRepo(owner, name, localPath);
      setOwner('');
      setName('');
      setLocalPath('');
      setIsAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repo');
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
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
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
          className="px-2 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded"
        >
          {isAdding ? '×' : '+'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mt-2 space-y-2">
          <input
            type="text"
            placeholder="Owner (e.g., anthropics)"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm"
            required
          />
          <input
            type="text"
            placeholder="Name (e.g., claude-code)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm"
            required
          />
          <input
            type="text"
            placeholder="Local path (e.g., /home/user/repos/claude-code)"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm"
            required
          />
          {error && <div className="text-red-400 text-xs">{error}</div>}
          <button
            type="submit"
            className="w-full px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded"
          >
            Add Repository
          </button>
        </form>
      )}
    </div>
  );
}
