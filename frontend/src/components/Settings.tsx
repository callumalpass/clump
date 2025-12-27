import { useState, useEffect } from 'react';
import { useClaudeSettings } from '../hooks/useApi';
import type { PermissionMode, OutputFormat } from '../types';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const { settings, loading, error, saving, updateSettings, resetSettings } = useClaudeSettings();
  const [customTool, setCustomTool] = useState('');
  const [activeTab, setActiveTab] = useState<'permissions' | 'execution' | 'advanced'>('permissions');

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#161b22] border border-gray-700 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Claude Code Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {(['permissions', 'execution', 'advanced'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm capitalize ${
                activeTab === tab
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-400">Loading settings...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded p-3 mb-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {settings && activeTab === 'permissions' && (
            <div className="space-y-6">
              {/* Permission Mode */}
              <div>
                <label className="block text-sm font-medium mb-2">Permission Mode</label>
                <p className="text-xs text-gray-400 mb-3">
                  Controls how Claude Code handles tool permissions
                </p>
                <div className="grid grid-cols-2 gap-2">
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
                      className={`p-3 rounded border text-left ${
                        settings.permission_mode === mode.value
                          ? 'border-blue-500 bg-blue-900/30'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="font-medium text-sm">{mode.label}</div>
                      <div className="text-xs text-gray-400">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Allowed Tools */}
              <div>
                <label className="block text-sm font-medium mb-2">Allowed Tools</label>
                <p className="text-xs text-gray-400 mb-3">
                  Tools that are auto-approved without prompting
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {settings.allowed_tools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 rounded text-sm"
                    >
                      {tool}
                      <button
                        onClick={() => handleRemoveTool(tool)}
                        disabled={saving}
                        className="text-gray-400 hover:text-red-400"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTool}
                    onChange={(e) => setCustomTool(e.target.value)}
                    placeholder="Add tool (e.g., Bash(npm:*))"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTool()}
                  />
                  <button
                    onClick={handleAddTool}
                    disabled={saving || !customTool.trim()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm"
                  >
                    Add
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Defaults: {settings.default_allowed_tools.join(', ')}
                </p>
              </div>
            </div>
          )}

          {settings && activeTab === 'execution' && (
            <div className="space-y-6">
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

              {/* Model */}
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <p className="text-xs text-gray-400 mb-3">
                  Claude model to use for analysis
                </p>
                <div className="flex gap-2">
                  {['sonnet', 'opus', 'haiku'].map((model) => (
                    <button
                      key={model}
                      onClick={() => handleModelChange(model)}
                      disabled={saving}
                      className={`flex-1 px-4 py-2 rounded border capitalize ${
                        settings.model === model
                          ? 'border-blue-500 bg-blue-900/30'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Format */}
              <div>
                <label className="block text-sm font-medium mb-2">Output Format</label>
                <p className="text-xs text-gray-400 mb-3">
                  Format for headless mode output
                </p>
                <div className="flex gap-2">
                  {[
                    { value: 'text', label: 'Text' },
                    { value: 'json', label: 'JSON' },
                    { value: 'stream-json', label: 'Stream JSON' },
                  ].map((format) => (
                    <button
                      key={format.value}
                      onClick={() => handleOutputFormatChange(format.value as OutputFormat)}
                      disabled={saving}
                      className={`flex-1 px-4 py-2 rounded border ${
                        settings.output_format === format.value
                          ? 'border-blue-500 bg-blue-900/30'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      {format.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {settings && activeTab === 'advanced' && (
            <div className="space-y-6">
              {/* MCP GitHub */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.mcp_github}
                    onChange={(e) => handleMcpGithubChange(e.target.checked)}
                    disabled={saving}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800"
                  />
                  <div>
                    <div className="text-sm font-medium">Enable GitHub MCP Server</div>
                    <div className="text-xs text-gray-400">
                      Allows Claude to interact with GitHub directly via MCP
                    </div>
                  </div>
                </label>
              </div>

              {/* Reset */}
              <div className="pt-4 border-t border-gray-700">
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-sm"
                >
                  Reset to Defaults
                </button>
                <p className="text-xs text-gray-400 mt-2">
                  This will reset all Claude Code settings to their default values.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 bg-[#0d1117]">
          <div className="text-xs text-gray-400">
            {saving ? 'Saving...' : 'Changes are saved automatically'}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
