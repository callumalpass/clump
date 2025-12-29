import { useState, useEffect } from 'react';
import { useClaudeSettings } from '../hooks/useApi';
import { useTheme } from '../hooks/useTheme';
import { useTabIndicator } from '../hooks/useTabIndicator';
import type { PermissionMode, OutputFormat, CommandMetadata } from '../types';
import { CommandEditor } from './CommandEditor';
import { AlertMessage } from './AlertMessage';

interface TokenStatus {
  configured: boolean;
  masked_token: string | null;
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  commands?: { issue: CommandMetadata[]; pr: CommandMetadata[] };
  repoPath?: string | null;
  onRefreshCommands?: () => void;
}

export function Settings({ isOpen, onClose, commands, repoPath, onRefreshCommands }: SettingsProps) {
  const { settings, loading, error, saving, updateSettings, resetSettings } = useClaudeSettings();
  const { theme, setTheme } = useTheme();
  const [customTool, setCustomTool] = useState('');
  const [activeTab, setActiveTab] = useState<'github' | 'permissions' | 'execution' | 'commands' | 'advanced'>('github');

  // Animated tab indicator
  const { containerRef: tabContainerRef, tabRefs, indicatorStyle } = useTabIndicator<HTMLDivElement>(
    activeTab,
    { enabled: isOpen }
  );

  // GitHub token state
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>({ configured: false, masked_token: null });
  const [tokenLoading, setTokenLoading] = useState(false);
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [tokenSaving, setTokenSaving] = useState(false);

  // Fetch token status when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchTokenStatus();
    }
  }, [isOpen]);

  const fetchTokenStatus = async () => {
    setTokenLoading(true);
    try {
      const res = await fetch('/api/settings/github-token');
      if (res.ok) {
        const data = await res.json();
        setTokenStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch token status:', e);
    } finally {
      setTokenLoading(false);
    }
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setTokenError('');
    setTokenSaving(true);

    try {
      const res = await fetch('/api/settings/github-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to save token');
      }

      const data = await res.json();
      setTokenStatus(data);
      setNewToken('');
      setIsEditingToken(false);
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Failed to save token');
    } finally {
      setTokenSaving(false);
    }
  };

  const handleRemoveToken = async () => {
    try {
      await fetch('/api/settings/github-token', { method: 'DELETE' });
      setTokenStatus({ configured: false, masked_token: null });
    } catch (e) {
      console.error('Failed to remove token:', e);
    }
  };

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

  const handlePermissionModeChange = async (mode: PermissionMode) => {
    await updateSettings({ permission_mode: mode });
  };

  const handleAddTool = async () => {
    if (!customTool.trim() || !settings) return;
    const newTools = [...settings.allowed_tools, customTool.trim()];
    await updateSettings({ allowed_tools: newTools });
    setCustomTool('');
  };

  const handleRemoveTool = async (tool: string) => {
    if (!settings) return;
    const newTools = settings.allowed_tools.filter((t) => t !== tool);
    await updateSettings({ allowed_tools: newTools });
  };

  const handleMaxTurnsChange = async (value: number) => {
    await updateSettings({ max_turns: value });
  };

  const handleModelChange = async (model: string) => {
    await updateSettings({ model });
  };

  const handleOutputFormatChange = async (format: OutputFormat) => {
    await updateSettings({ output_format: format });
  };

  const handleMcpGithubChange = async (enabled: boolean) => {
    await updateSettings({ mcp_github: enabled });
  };

  const handleReset = async () => {
    if (confirm('Reset all Claude Code settings to defaults?')) {
      await resetSettings();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-enter">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-gray-900 rounded-stoody-lg shadow-stoody-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col mx-4 modal-content-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-750">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-800 rounded-stoody-sm text-gray-400 hover:text-pink-400 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs with sliding indicator */}
        <div ref={tabContainerRef} className="relative flex border-b border-gray-750 bg-gray-800/50">
          {(['github', 'permissions', 'execution', 'commands', 'advanced'] as const).map((tab) => (
            <button
              key={tab}
              ref={(el) => {
                if (el) tabRefs.current.set(tab, el);
              }}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500 focus-visible:ring-inset transition-all duration-150 ${
                activeTab === tab
                  ? 'text-white'
                  : 'text-gray-400 hover:text-pink-400'
              }`}
            >
              {tab === 'github' ? 'GitHub' : tab}
            </button>
          ))}
          {/* Sliding indicator - animates between tabs */}
          <div
            className="absolute bottom-0 h-0.5 bg-blurple-400 transition-all duration-200 ease-out"
            style={{
              transform: `translateX(${indicatorStyle.left}px)`,
              width: indicatorStyle.width,
            }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {loading && activeTab !== 'github' && (
            <div className="flex items-center justify-center py-8 tab-content-enter">
              <div className="text-gray-400">Loading settings...</div>
            </div>
          )}

          {error && (
            <div className="bg-danger-400/10 rounded-stoody p-4 mb-4">
              <p className="text-danger-400 text-sm">{error}</p>
            </div>
          )}

          {activeTab === 'github' && (
            <div className="space-y-6 tab-content-enter" key="github-tab">
              {/* Token Status */}
              <div>
                <label className="block text-sm font-medium mb-2">Personal Access Token</label>
                <p className="text-xs text-gray-400 mb-3">
                  Required for higher API rate limits (5,000/hour vs 60/hour unauthenticated)
                </p>

                {tokenLoading ? (
                  <div className="space-y-3">
                    <div className="h-12 rounded-stoody bg-gray-800 skeleton-shimmer" />
                    <div className="h-4 w-48 rounded-stoody bg-gray-800 skeleton-shimmer" style={{ animationDelay: '100ms' }} />
                  </div>
                ) : tokenStatus.configured && !isEditingToken ? (
                  <div className="bg-mint-400/10 rounded-stoody p-4 border border-mint-400/20">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-mint-400/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-mint-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-200">Token configured</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-mint-400/20 text-mint-400">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              5,000 req/hour
                            </span>
                          </div>
                          <code className="text-xs text-mint-400/80 mt-1 block truncate">{tokenStatus.masked_token}</code>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setIsEditingToken(true)}
                          className="px-3 py-1.5 text-xs text-gray-400 hover:text-pink-400 hover:bg-gray-800/50 rounded-stoody-sm focus:outline-none focus:text-pink-400 transition-colors"
                        >
                          Change
                        </button>
                        <button
                          onClick={handleRemoveToken}
                          className="px-3 py-1.5 text-xs text-gray-400 hover:text-danger-400 hover:bg-danger-500/10 rounded-stoody-sm focus:outline-none focus:text-danger-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!tokenStatus.configured && !isEditingToken && (
                      <div className="bg-warning-500/10 rounded-stoody p-4 border border-warning-500/20">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-warning-500/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-warning-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-warning-400">No token configured</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-warning-500/20 text-warning-500">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                60 req/hour
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1.5">Add a token to unlock 5,000 requests per hour</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSaveToken} className="space-y-4">
                      <div className="bg-gray-800 rounded-stoody p-4 text-sm">
                        <p className="text-gray-300 mb-2">Create a token with these permissions:</p>
                        <ul className="text-gray-400 list-disc list-inside space-y-1.5 text-xs">
                          <li><code className="bg-gray-750 px-1.5 py-0.5 rounded-stoody-sm">repo</code> - Full access to repositories</li>
                          <li><code className="bg-gray-750 px-1.5 py-0.5 rounded-stoody-sm">read:org</code> - Read org membership (optional)</li>
                        </ul>
                        <a
                          href="https://github.com/settings/tokens/new?description=Claude%20Code%20Hub&scopes=repo,read:org"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-3 text-blurple-400 hover:text-pink-400 text-xs transition-colors"
                        >
                          Create new token on GitHub →
                        </a>
                      </div>

                      <input
                        type="password"
                        value={newToken}
                        onChange={(e) => setNewToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        className="w-full bg-gray-800 border border-gray-750 rounded-stoody px-4 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500 focus:border-blurple-500 transition-colors"
                        required
                      />

                      {tokenError && (
                        <AlertMessage type="error" message={tokenError} />
                      )}

                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={tokenSaving}
                          className="px-5 py-2.5 bg-blurple-500 hover:bg-blurple-600 hover:text-pink-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-stoody transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-400 shadow-stoody-sm"
                        >
                          {tokenSaving ? 'Saving...' : 'Save Token'}
                        </button>
                        {isEditingToken && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingToken(false);
                              setNewToken('');
                              setTokenError('');
                            }}
                            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 hover:text-pink-400 text-sm rounded-stoody transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

          {settings && activeTab === 'permissions' && (
            <div className="space-y-6 tab-content-enter" key="permissions-tab">
              {/* Permission Mode */}
              <div>
                <label className="block text-sm font-medium mb-2">Permission Mode</label>
                <p className="text-xs text-gray-400 mb-3">
                  Controls how Claude Code handles tool permissions
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'default', label: 'Default', desc: 'Prompts for each permission' },
                    { value: 'plan', label: 'Plan Only', desc: 'Read-only analysis, no modifications' },
                    { value: 'acceptEdits', label: 'Accept Edits', desc: 'Auto-accept file edits' },
                    { value: 'bypassPermissions', label: 'Bypass All', desc: 'Skip all prompts (use carefully)' },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => handlePermissionModeChange(mode.value as PermissionMode)}
                      disabled={saving}
                      className={`p-4 rounded-stoody text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500 transition-all border-2 relative ${
                        settings.permission_mode === mode.value
                          ? 'bg-blurple-500/10 border-blurple-400 shadow-stoody-sm'
                          : 'bg-gray-800 border-transparent hover:bg-gray-850 hover:border-gray-700'
                      }`}
                    >
                      {settings.permission_mode === mode.value && (
                        <div className="absolute top-2 right-2">
                          <svg className="w-4 h-4 text-blurple-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      <div className="font-medium text-sm">{mode.label}</div>
                      <div className="text-xs text-gray-400 mt-1">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section divider */}
              <div className="border-t border-gray-750/50" />

              {/* Allowed Tools */}
              <div>
                <label className="block text-sm font-medium mb-2">Allowed Tools</label>
                <p className="text-xs text-gray-400 mb-3">
                  Tools that are auto-approved without prompting
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {settings.allowed_tools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 rounded-stoody text-sm"
                    >
                      {tool}
                      <button
                        onClick={() => handleRemoveTool(tool)}
                        disabled={saving}
                        className="text-gray-400 hover:text-danger-400 focus:outline-none focus:text-danger-400 rounded transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={customTool}
                    onChange={(e) => setCustomTool(e.target.value)}
                    placeholder="Add tool (e.g., Bash(npm:*))"
                    className="flex-1 bg-gray-800 border border-gray-750 rounded-stoody px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500 focus:border-blurple-500 transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTool()}
                  />
                  <button
                    onClick={handleAddTool}
                    disabled={saving || !customTool.trim()}
                    className="px-4 py-2 bg-blurple-500 hover:bg-blurple-600 hover:text-pink-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-stoody text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-400 shadow-stoody-sm"
                  >
                    Add
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Defaults: {settings.default_allowed_tools.join(', ')}
                </p>
              </div>
            </div>
          )}

          {settings && activeTab === 'execution' && (
            <div className="space-y-6 tab-content-enter" key="execution-tab">
              {/* Max Turns */}
              <div>
                <label className="block text-sm font-medium mb-2">Max Turns</label>
                <p className="text-xs text-gray-400 mb-3">
                  Maximum agentic execution steps (0 = unlimited)
                </p>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={settings.max_turns}
                  onChange={(e) => handleMaxTurnsChange(parseInt(e.target.value))}
                  disabled={saving}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0 (unlimited)</span>
                  <span className="text-white font-medium">{settings.max_turns || 'Unlimited'}</span>
                  <span>50</span>
                </div>
              </div>

              {/* Section divider */}
              <div className="border-t border-gray-750/50" />

              {/* Model */}
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <p className="text-xs text-gray-400 mb-3">
                  Claude model to use for analysis
                </p>
                <div className="flex gap-3">
                  {['sonnet', 'opus', 'haiku'].map((model) => (
                    <button
                      key={model}
                      onClick={() => handleModelChange(model)}
                      disabled={saving}
                      className={`flex-1 px-4 py-2.5 rounded-stoody capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500 transition-all border-2 ${
                        settings.model === model
                          ? 'bg-blurple-500/10 border-blurple-400 shadow-stoody-sm'
                          : 'bg-gray-800 border-transparent hover:bg-gray-850 hover:border-gray-700'
                      }`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section divider */}
              <div className="border-t border-gray-750/50" />

              {/* Output Format */}
              <div>
                <label className="block text-sm font-medium mb-2">Output Format</label>
                <p className="text-xs text-gray-400 mb-3">
                  Format for headless mode output
                </p>
                <div className="flex gap-3">
                  {[
                    { value: 'text', label: 'Text' },
                    { value: 'json', label: 'JSON' },
                    { value: 'stream-json', label: 'Stream JSON' },
                  ].map((format) => (
                    <button
                      key={format.value}
                      onClick={() => handleOutputFormatChange(format.value as OutputFormat)}
                      disabled={saving}
                      className={`flex-1 px-4 py-2.5 rounded-stoody focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500 transition-all border-2 ${
                        settings.output_format === format.value
                          ? 'bg-blurple-500/10 border-blurple-400 shadow-stoody-sm'
                          : 'bg-gray-800 border-transparent hover:bg-gray-850 hover:border-gray-700'
                      }`}
                    >
                      {format.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'commands' && (
            <div className="space-y-4 tab-content-enter" key="commands-tab">
              <div>
                <h3 className="text-sm font-medium mb-2">Session Commands</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Commands define the prompts used when starting sessions on issues and PRs.
                  {repoPath && (
                    <span className="block mt-1">
                      Commands can be saved to the current repo or as global defaults.
                    </span>
                  )}
                </p>
              </div>
              {commands && onRefreshCommands ? (
                <CommandEditor
                  commands={commands}
                  repoPath={repoPath}
                  onRefresh={onRefreshCommands}
                />
              ) : (
                <div className="text-gray-400 text-sm">
                  Select a repository to manage commands
                </div>
              )}
            </div>
          )}

          {settings && activeTab === 'advanced' && (
            <div className="space-y-6 tab-content-enter" key="advanced-tab">
              {/* Theme Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Theme</label>
                <p className="text-xs text-gray-400 mb-3">
                  Choose your preferred color scheme
                </p>
                <div className="flex gap-3">
                  {/* Dark mode */}
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-stoody focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500 transition-all border-2 ${
                      theme === 'dark'
                        ? 'bg-blurple-500/10 border-blurple-400 shadow-stoody-sm'
                        : 'bg-gray-800 border-transparent hover:bg-gray-850 hover:border-gray-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    Dark
                  </button>

                  {/* Light mode */}
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-stoody focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500 transition-all border-2 ${
                      theme === 'light'
                        ? 'bg-blurple-500/10 border-blurple-400 shadow-stoody-sm'
                        : 'bg-gray-800 border-transparent hover:bg-gray-850 hover:border-gray-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Light
                  </button>

                  {/* System mode */}
                  <button
                    onClick={() => setTheme('system')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-stoody focus:outline-none focus-visible:ring-2 focus-visible:ring-blurple-500 transition-all border-2 ${
                      theme === 'system'
                        ? 'bg-blurple-500/10 border-blurple-400 shadow-stoody-sm'
                        : 'bg-gray-800 border-transparent hover:bg-gray-850 hover:border-gray-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    System
                  </button>
                </div>
              </div>

              {/* Section divider */}
              <div className="border-t border-gray-750/50" />

              {/* MCP GitHub */}
              <div className="bg-gray-800 rounded-stoody p-4">
                <label className="flex items-center gap-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.mcp_github}
                    onChange={(e) => handleMcpGithubChange(e.target.checked)}
                    disabled={saving}
                    className="w-5 h-5 rounded-stoody-sm border-gray-600 bg-gray-750 focus-visible:ring-2 focus-visible:ring-blurple-500 focus-visible:ring-offset-0 accent-blurple-500"
                  />
                  <div>
                    <div className="text-sm font-medium">Enable GitHub MCP Server</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Allows Claude to interact with GitHub directly via MCP
                    </div>
                  </div>
                </label>
              </div>

              {/* Reset - has its own divider styling with pt-5 border-t */}
              <div className="pt-5 border-t border-gray-750">
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="px-5 py-2.5 bg-danger-500 hover:bg-danger-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-stoody text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-400 shadow-stoody-sm"
                >
                  Reset to Defaults
                </button>
                <p className="text-xs text-gray-400 mt-3">
                  This will reset all Claude Code settings to their default values.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-750 bg-gray-800/50">
          <div className="text-xs text-gray-400">
            {saving ? 'Saving...' : 'Changes are saved automatically'}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-800 hover:bg-gray-750 hover:text-pink-400 rounded-stoody text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
