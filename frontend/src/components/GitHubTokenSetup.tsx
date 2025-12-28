import { useState, useEffect } from 'react';
import { AlertMessage } from './AlertMessage';

interface TokenStatus {
  configured: boolean;
  masked_token: string | null;
}

interface GitHubTokenSetupProps {
  onTokenConfigured?: () => void;
}

export function GitHubTokenSetup({ onTokenConfigured }: GitHubTokenSetupProps) {
  const [status, setStatus] = useState<TokenStatus>({ configured: false, masked_token: null });
  const [isEditing, setIsEditing] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/settings/github-token');
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error('Failed to fetch token status:', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.log('Submitting token...');

    try {
      console.log('Making POST request...');
      const res = await fetch('/api/settings/github-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      console.log('Response status:', res.status);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to save token');
      }

      const data = await res.json();
      console.log('Response data:', data);
      setStatus(data);
      setToken('');
      setIsEditing(false);
      onTokenConfigured?.();
    } catch (e) {
      console.error('Error saving token:', e);
      setError(e instanceof Error ? e.message : 'Failed to save token');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await fetch('/api/settings/github-token', { method: 'DELETE' });
      setStatus({ configured: false, masked_token: null });
    } catch (e) {
      console.error('Failed to remove token:', e);
    }
  };

  // Show banner if not configured
  if (!status.configured && !isEditing) {
    return (
      <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-4 m-4">
        <div className="flex items-start gap-3">
          <span className="text-yellow-500 text-xl">⚠️</span>
          <div className="flex-1">
            <h3 className="text-yellow-300 font-medium mb-1">GitHub Token Required</h3>
            <p className="text-yellow-200/80 text-sm mb-3">
              Without a GitHub token, you're limited to 60 API requests per hour.
              Add a Personal Access Token to increase this to 5,000/hour.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded"
              >
                Add Token
              </button>
              <a
                href="https://github.com/settings/tokens/new?description=Claude%20Code%20Hub&scopes=repo,read:org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-yellow-400 hover:text-yellow-300 text-sm underline"
              >
                Create token on GitHub →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Token input form
  if (isEditing) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 m-4">
        <h3 className="text-white font-medium mb-3">Configure GitHub Token</h3>

        <div className="bg-gray-900 rounded p-3 mb-4 text-sm">
          <p className="text-gray-300 mb-2">Create a token with these permissions:</p>
          <ul className="text-gray-400 list-disc list-inside space-y-1">
            <li><code className="bg-gray-700 px-1 rounded">repo</code> - Full access to repositories</li>
            <li><code className="bg-gray-700 px-1 rounded">read:org</code> - Read org membership (optional)</li>
          </ul>
          <a
            href="https://github.com/settings/tokens/new?description=Claude%20Code%20Hub&scopes=repo,read:org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 text-blue-400 hover:text-blue-300 underline"
          >
            Create new token on GitHub →
          </a>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm mb-3"
            required
          />

          {error && (
            <AlertMessage type="error" message={error} className="mb-3" />
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
            >
              {loading ? 'Saving...' : 'Save Token'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setToken('');
                setError('');
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Token configured - show status
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-green-900/30 border-b border-gray-700">
      <span className="text-green-500">✓</span>
      <span className="text-sm text-gray-300">
        GitHub token: <code className="text-green-400">{status.masked_token}</code>
      </span>
      <button
        onClick={() => setIsEditing(true)}
        className="text-gray-400 hover:text-white text-xs ml-2"
      >
        Change
      </button>
      <button
        onClick={handleRemove}
        className="text-gray-400 hover:text-red-400 text-xs"
      >
        Remove
      </button>
    </div>
  );
}
