import { useState } from 'react';
import type { CommandMetadata } from '../types';
import { createCommand, updateCommand, deleteCommand } from '../hooks/useApi';

interface CommandEditorProps {
  commands: { issue: CommandMetadata[]; pr: CommandMetadata[] };
  repoPath?: string | null;
  onRefresh: () => void;
}

type Category = 'issue' | 'pr';

interface EditingCommand {
  id?: string;
  category: Category;
  name: string;
  shortName: string;
  description: string;
  template: string;
  isNew: boolean;
}

export function CommandEditor({ commands, repoPath, onRefresh }: CommandEditorProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category>('issue');
  const [editing, setEditing] = useState<EditingCommand | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveToRepo, setSaveToRepo] = useState(true);

  const currentCommands = selectedCategory === 'issue' ? commands.issue : commands.pr;

  const handleEdit = (cmd: CommandMetadata) => {
    setEditing({
      id: cmd.id,
      category: cmd.category as Category,
      name: cmd.name,
      shortName: cmd.shortName,
      description: cmd.description,
      template: cmd.template,
      isNew: false,
    });
    setError(null);
  };

  const handleNew = () => {
    setEditing({
      category: selectedCategory,
      name: '',
      shortName: '',
      description: '',
      template: '',
      isNew: true,
    });
    setError(null);
  };

  const handleSave = async () => {
    if (!editing) return;

    // Validate
    if (!editing.name.trim() || !editing.shortName.trim() || !editing.description.trim()) {
      setError('Name, short name, and description are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const targetPath = saveToRepo && repoPath ? repoPath : undefined;
      const commandData = {
        name: editing.name.trim(),
        shortName: editing.shortName.trim(),
        description: editing.description.trim(),
        template: editing.template,
      };

      if (editing.isNew) {
        await createCommand(editing.category, commandData, targetPath);
      } else if (editing.id) {
        await updateCommand(editing.category, editing.id, commandData, targetPath);
      }

      setEditing(null);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save command');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cmd: CommandMetadata) => {
    if (!confirm(`Delete command "${cmd.name}"?`)) return;

    try {
      const targetPath = cmd.source === 'repo' && repoPath ? repoPath : undefined;
      await deleteCommand(cmd.category as Category, cmd.id, targetPath);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete command');
    }
  };

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex gap-2">
        {(['issue', 'pr'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setSelectedCategory(cat);
              setEditing(null);
            }}
            className={`px-3 py-1.5 text-sm rounded capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {cat} Commands
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded p-3">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Command list or editor */}
      {editing ? (
        <div className="space-y-4 bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              {editing.isNew ? 'New Command' : `Edit: ${editing.name}`}
            </h3>
            <button
              onClick={() => setEditing(null)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Fix Suggestion"
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Short Name (for button)</label>
              <input
                type="text"
                value={editing.shortName}
                onChange={(e) => setEditing({ ...editing, shortName: e.target.value })}
                placeholder="Fix"
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Analyze root cause and suggest a fix approach"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Prompt Template
              <span className="text-gray-500 ml-2">
                (Use {'{{number}}'}, {'{{title}}'}, {'{{body}}'} for placeholders)
              </span>
            </label>
            <textarea
              value={editing.template}
              onChange={(e) => setEditing({ ...editing, template: e.target.value })}
              placeholder="Please analyze this issue and suggest a fix..."
              rows={8}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {repoPath && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="saveToRepo"
                checked={saveToRepo}
                onChange={(e) => setSaveToRepo(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800"
              />
              <label htmlFor="saveToRepo" className="text-sm text-gray-400">
                Save to current repo ({repoPath.split('/').pop()})
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {saving ? 'Saving...' : 'Save Command'}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Command list */}
          <div className="space-y-2">
            {currentCommands.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No {selectedCategory} commands defined</p>
                <p className="text-sm mt-1">Create one to get started</p>
              </div>
            ) : (
              currentCommands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="bg-gray-800 rounded-lg p-3 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{cmd.name}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
                        {cmd.shortName}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        cmd.source === 'repo'
                          ? 'bg-green-900/50 text-green-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}>
                        {cmd.source === 'repo' ? 'repo' : 'builtin'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 truncate">{cmd.description}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleEdit(cmd)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(cmd)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add button */}
          <button
            onClick={handleNew}
            className="w-full py-2 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            + Add {selectedCategory === 'issue' ? 'Issue' : 'PR'} Command
          </button>
        </>
      )}

      <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
        Commands are stored as markdown files in <code className="bg-gray-800 px-1 rounded">.claude/commands/</code>
      </div>
    </div>
  );
}
