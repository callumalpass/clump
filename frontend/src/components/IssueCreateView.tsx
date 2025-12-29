import { useState } from 'react';
import type { Issue } from '../types';
import { createIssue, useLabels, useAssignees } from '../hooks/useApi';
import { Editor } from './Editor';

interface IssueCreateViewProps {
  repoId: number;
  onCancel: () => void;
  onCreated: (issue: Issue) => void;
}

export function IssueCreateView({ repoId, onCancel, onCreated }: IssueCreateViewProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);

  const { labels, loading: labelsLoading } = useLabels(repoId);
  const { assignees, loading: assigneesLoading } = useAssignees(repoId);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const issue = await createIssue(repoId, {
        title: title.trim(),
        body: body.trim(),
        labels: selectedLabels,
        assignees: selectedAssignees,
      });
      onCreated(issue);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create issue');
    } finally {
      setSubmitting(false);
    }
  };

  const createToggle = <T,>(setState: React.Dispatch<React.SetStateAction<T[]>>) =>
    (item: T) => setState(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);

  const toggleLabel = createToggle(setSelectedLabels);
  const toggleAssignee = createToggle(setSelectedAssignees);

  // Get color for a label
  const getLabelColor = (labelName: string): string => {
    const label = labels.find(l => l.name === labelName);
    return label?.color ? `#${label.color}` : '#6b7280';
  };

  return (
    <div className="p-4 overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Create New Issue</h2>
        <button
          onClick={onCancel}
          className="p-1 text-gray-400 hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Cancel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Title */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue title"
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-transparent"
          autoFocus
        />
      </div>

      {/* Description */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
        <Editor
          value={body}
          onChange={setBody}
          placeholder="Add a description... (Markdown supported)"
          minHeight="200px"
          maxHeight="400px"
          onSubmit={handleSubmit}
        />
      </div>

      {/* Labels */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">Labels</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedLabels.map(labelName => (
            <span
              key={labelName}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
              style={{ backgroundColor: getLabelColor(labelName), color: '#fff' }}
            >
              {labelName}
              <button
                onClick={() => toggleLabel(labelName)}
                className="hover:opacity-70 rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
              >
                ×
              </button>
            </span>
          ))}
          <div className="relative">
            <button
              onClick={() => setShowLabelDropdown(!showLabelDropdown)}
              className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
            >
              + Add label
            </button>
            {showLabelDropdown && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10 max-h-60 overflow-auto">
                {labelsLoading ? (
                  <div className="p-2 text-xs text-gray-400">Loading...</div>
                ) : labels.length === 0 ? (
                  <div className="p-2 text-xs text-gray-400">No labels available</div>
                ) : (
                  <div className="p-1">
                    {labels
                      .filter(l => !selectedLabels.includes(l.name))
                      .map(label => (
                        <button
                          key={label.name}
                          onClick={() => {
                            toggleLabel(label.name);
                            setShowLabelDropdown(false);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1 text-xs text-left hover:bg-gray-700 rounded focus:outline-none focus:bg-gray-700"
                        >
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: `#${label.color}` }}
                          />
                          {label.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assignees */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-1">Assignees</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedAssignees.map(assignee => (
            <span
              key={assignee}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-900/50 text-blue-300"
            >
              @{assignee}
              <button
                onClick={() => toggleAssignee(assignee)}
                className="hover:opacity-70 rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
              >
                ×
              </button>
            </span>
          ))}
          <div className="relative">
            <button
              onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
              className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
            >
              + Add assignee
            </button>
            {showAssigneeDropdown && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10 max-h-60 overflow-auto">
                {assigneesLoading ? (
                  <div className="p-2 text-xs text-gray-400">Loading...</div>
                ) : assignees.length === 0 ? (
                  <div className="p-2 text-xs text-gray-400">No assignees available</div>
                ) : (
                  <div className="p-1">
                    {assignees
                      .filter(a => !selectedAssignees.includes(a))
                      .map(assignee => (
                        <button
                          key={assignee}
                          onClick={() => {
                            toggleAssignee(assignee);
                            setShowAssigneeDropdown(false);
                          }}
                          className="w-full px-2 py-1 text-xs text-left hover:bg-gray-700 rounded focus:outline-none focus:bg-gray-700"
                        >
                          @{assignee}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !title.trim()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
        >
          {submitting ? 'Creating...' : 'Create Issue'}
        </button>
      </div>
    </div>
  );
}
