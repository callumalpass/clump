import { useState } from 'react';
import type { ScheduledJob, ScheduledJobUpdate, SessionSummary, CommandsResponse } from '../types';
import { useScheduleDetail, describeCron, formatRelativeTime, CRON_PRESETS } from '../hooks/useSchedules';

interface ScheduleDetailProps {
  repoId: number;
  scheduleId: number;
  onShowSession?: (sessionId: string) => void;
  sessions?: SessionSummary[];
  commands?: CommandsResponse;
  onScheduleDeleted?: () => void;
  onScheduleUpdated?: (schedule: ScheduledJob) => void;
}

export function ScheduleDetail({
  repoId,
  scheduleId,
  onShowSession,
  sessions = [],
  commands,
  onScheduleDeleted,
  onScheduleUpdated,
}: ScheduleDetailProps) {
  const {
    schedule,
    runs,
    runsTotal,
    runsPage,
    runsTotalPages,
    loading,
    error,
    refresh,
    goToRunsPage,
    updateSchedule,
    triggerNow,
    pauseSchedule,
    resumeSchedule,
  } = useScheduleDetail(repoId, scheduleId);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<ScheduledJobUpdate>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [triggering, setTriggering] = useState(false);

  // Get command name for display
  const getCommandName = (commandId: string | null) => {
    if (!commandId || !commands) return commandId;
    const allCommands = [...(commands.issue || []), ...(commands.pr || []), ...(commands.general || [])];
    const cmd = allCommands.find(c => c.id === commandId);
    return cmd?.name || commandId;
  };

  // Find session by ID
  const getSession = (sessionId: string) => {
    return sessions.find(s => s.session_id === sessionId);
  };

  // Start editing
  const handleStartEdit = () => {
    if (!schedule) return;
    setEditForm({
      name: schedule.name,
      description: schedule.description || undefined,
      cron_expression: schedule.cron_expression,
      timezone: schedule.timezone,
      target_type: schedule.target_type,
      filter_query: schedule.filter_query || undefined,
      command_id: schedule.command_id || undefined,
      custom_prompt: schedule.custom_prompt || undefined,
      max_items: schedule.max_items,
      permission_mode: schedule.permission_mode || undefined,
      max_turns: schedule.max_turns || undefined,
      model: schedule.model || undefined,
    });
    setIsEditing(true);
    setActionError(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({});
    setActionError(null);
  };

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    setActionError(null);
    try {
      const updated = await updateSchedule(editForm);
      setIsEditing(false);
      setEditForm({});
      onScheduleUpdated?.(updated);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Handle trigger
  const handleTrigger = async () => {
    setTriggering(true);
    setActionError(null);
    try {
      await triggerNow();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to trigger');
    } finally {
      setTriggering(false);
    }
  };

  // Handle pause/resume
  const handleTogglePause = async () => {
    setActionError(null);
    try {
      if (schedule?.status === 'paused') {
        const updated = await resumeSchedule();
        onScheduleUpdated?.(updated);
      } else {
        const updated = await pauseSchedule();
        onScheduleUpdated?.(updated);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to update status');
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    setActionError(null);
    try {
      await fetch(`/api/repos/${repoId}/schedules/${scheduleId}`, {
        method: 'DELETE',
      });
      onScheduleDeleted?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'paused': return 'text-yellow-400';
      case 'disabled': return 'text-gray-500';
      default: return 'text-gray-400';
    }
  };

  // Get run status icon and color
  const getRunStatusDisplay = (status: string) => {
    switch (status) {
      case 'completed':
        return { icon: '●', color: 'text-green-400', label: 'Completed' };
      case 'running':
        return { icon: '◐', color: 'text-blue-400 animate-pulse', label: 'Running' };
      case 'failed':
        return { icon: '●', color: 'text-red-400', label: 'Failed' };
      case 'pending':
        return { icon: '○', color: 'text-gray-400', label: 'Pending' };
      default:
        return { icon: '○', color: 'text-gray-400', label: status };
    }
  };

  if (loading && !schedule) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 bg-gray-700 rounded w-1/2 mb-4" />
        <div className="h-4 bg-gray-700 rounded w-1/3 mb-8" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-700 rounded w-full" />
          <div className="h-4 bg-gray-700 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (error && !schedule) {
    return (
      <div className="p-6 text-red-400">
        Error: {error}
      </div>
    );
  }

  if (!schedule) return null;

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          {isEditing ? (
            <input
              type="text"
              value={editForm.name || ''}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="text-xl font-semibold bg-gray-800 border border-gray-600 rounded px-2 py-1 w-full mb-2"
            />
          ) : (
            <h2 className="text-xl font-semibold text-white mb-1">{schedule.name}</h2>
          )}
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span className={getStatusColor(schedule.status)}>
              {schedule.status.charAt(0).toUpperCase() + schedule.status.slice(1)}
            </span>
            <span>•</span>
            <span>{describeCron(schedule.cron_expression)}</span>
            {schedule.next_run_at && schedule.status === 'active' && (
              <>
                <span>•</span>
                <span>Next: {formatRelativeTime(new Date(schedule.next_run_at))}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleTrigger}
                disabled={triggering}
                className="px-3 py-1.5 text-sm bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 disabled:opacity-50 transition-colors"
              >
                {triggering ? 'Running...' : 'Run Now'}
              </button>
              <button
                onClick={handleTogglePause}
                className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
              >
                {schedule.status === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={handleStartEdit}
                className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-400 text-sm">
          {actionError}
        </div>
      )}

      {/* Configuration */}
      <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Configuration</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {isEditing ? (
            <>
              <div>
                <label className="block text-gray-500 mb-1">Schedule (Cron)</label>
                <select
                  value={editForm.cron_expression || ''}
                  onChange={(e) => setEditForm({ ...editForm, cron_expression: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200"
                >
                  {CRON_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-500 mb-1">Target</label>
                <select
                  value={editForm.target_type || 'issues'}
                  onChange={(e) => {
                    const newTarget = e.target.value as 'issues' | 'prs' | 'codebase' | 'custom';
                    // Reset command when target changes
                    const newCommands = newTarget === 'issues' ? commands?.issue : newTarget === 'prs' ? commands?.pr : commands?.general;
                    setEditForm({
                      ...editForm,
                      target_type: newTarget,
                      command_id: newCommands?.[0]?.id || undefined
                    });
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200"
                >
                  <option value="issues">Issues</option>
                  <option value="prs">Pull Requests</option>
                  <option value="codebase">Codebase</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              {/* Command (for issues/prs/codebase) */}
              {(editForm.target_type || schedule?.target_type) !== 'custom' && (
                <div>
                  <label className="block text-gray-500 mb-1">Command</label>
                  <select
                    value={editForm.command_id || ''}
                    onChange={(e) => setEditForm({ ...editForm, command_id: e.target.value || undefined })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200"
                  >
                    {(() => {
                      const targetType = editForm.target_type || schedule?.target_type || 'issues';
                      const availableCommands = targetType === 'issues'
                        ? commands?.issue
                        : targetType === 'prs'
                          ? commands?.pr
                          : commands?.general;
                      return availableCommands?.length ? availableCommands.map(cmd => (
                        <option key={cmd.id} value={cmd.id}>{cmd.name} - {cmd.description}</option>
                      )) : <option value="">No commands available</option>;
                    })()}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-gray-500 mb-1">Filter Query</label>
                <input
                  type="text"
                  value={editForm.filter_query || ''}
                  onChange={(e) => setEditForm({ ...editForm, filter_query: e.target.value })}
                  placeholder="e.g., state:open label:bug"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200"
                />
              </div>
              <div>
                <label className="block text-gray-500 mb-1">Max Items</label>
                <input
                  type="number"
                  value={editForm.max_items || 10}
                  onChange={(e) => setEditForm({ ...editForm, max_items: parseInt(e.target.value) || 10 })}
                  min={1}
                  max={100}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-gray-500 mb-1">Description</label>
                <textarea
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 h-20 resize-none"
                  placeholder="Optional description..."
                />
              </div>
              {/* Custom mode: show all commands with optgroups */}
              {(editForm.target_type || schedule?.target_type) === 'custom' && commands && (
                <div className="col-span-2">
                  <label className="block text-gray-500 mb-1">Use a command (optional)</label>
                  <select
                    value={editForm.command_id || ''}
                    onChange={(e) => {
                      const allCommands = [...(commands.issue || []), ...(commands.pr || []), ...(commands.general || [])];
                      const cmd = allCommands.find(c => c.id === e.target.value);
                      setEditForm({
                        ...editForm,
                        command_id: e.target.value || undefined,
                        custom_prompt: cmd?.template || editForm.custom_prompt,
                      });
                    }}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200"
                  >
                    <option value="">-- Write custom prompt --</option>
                    {commands.general && commands.general.length > 0 && (
                      <optgroup label="General">
                        {commands.general.map((cmd) => (
                          <option key={`general-${cmd.id}`} value={cmd.id}>
                            {cmd.name} - {cmd.description}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {commands.issue && commands.issue.length > 0 && (
                      <optgroup label="Issue Commands">
                        {commands.issue.map((cmd) => (
                          <option key={`issue-${cmd.id}`} value={cmd.id}>
                            {cmd.name} - {cmd.description}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {commands.pr && commands.pr.length > 0 && (
                      <optgroup label="PR Commands">
                        {commands.pr.map((cmd) => (
                          <option key={`pr-${cmd.id}`} value={cmd.id}>
                            {cmd.name} - {cmd.description}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-gray-500 mb-1">
                  {(editForm.target_type || schedule?.target_type) === 'custom' ? 'Prompt' : 'Custom Prompt (optional)'}
                </label>
                <textarea
                  value={editForm.custom_prompt || ''}
                  onChange={(e) => setEditForm({
                    ...editForm,
                    custom_prompt: e.target.value,
                    // Clear command_id if in custom mode and user is typing
                    ...(((editForm.target_type || schedule?.target_type) === 'custom') ? { command_id: undefined } : {})
                  })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 h-24 resize-none font-mono text-xs"
                  placeholder={(editForm.target_type || schedule?.target_type) === 'custom'
                    ? "Run a security audit on all API endpoints..."
                    : "Optional custom prompt to override the command's default prompt..."}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-gray-500">Target:</span>
                <span className="ml-2 text-gray-200">
                  {schedule.target_type.charAt(0).toUpperCase() + schedule.target_type.slice(1)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Max Items:</span>
                <span className="ml-2 text-gray-200">{schedule.max_items}</span>
              </div>
              {schedule.filter_query && (
                <div>
                  <span className="text-gray-500">Filter:</span>
                  <span className="ml-2 text-gray-200 font-mono text-xs">{schedule.filter_query}</span>
                </div>
              )}
              {schedule.command_id && (
                <div>
                  <span className="text-gray-500">Command:</span>
                  <span className="ml-2 text-gray-200">{getCommandName(schedule.command_id)}</span>
                </div>
              )}
              {schedule.description && (
                <div className="col-span-2">
                  <span className="text-gray-500">Description:</span>
                  <span className="ml-2 text-gray-300">{schedule.description}</span>
                </div>
              )}
              {schedule.custom_prompt && (
                <div className="col-span-2">
                  <span className="text-gray-500">Custom Prompt:</span>
                  <pre className="mt-1 p-2 bg-gray-900/50 rounded text-gray-300 text-xs font-mono whitespace-pre-wrap">{schedule.custom_prompt}</pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Run History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">
            Run History
            {runsTotal > 0 && (
              <span className="ml-2 text-gray-500">({runsTotal} total)</span>
            )}
          </h3>
          <button
            onClick={() => refresh()}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            Refresh
          </button>
        </div>

        {runs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No runs yet. Click "Run Now" to trigger this schedule.
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const statusDisplay = getRunStatusDisplay(run.status);
              const isExpanded = expandedRunId === run.id;
              const runSessions = run.session_ids?.map(id => getSession(id)).filter(Boolean) || [];

              return (
                <div key={run.id} className="border border-gray-700 rounded-lg overflow-hidden">
                  {/* Run header */}
                  <button
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-800/50 transition-colors text-left"
                  >
                    <span className={`${statusDisplay.color}`}>{statusDisplay.icon}</span>
                    <span className="text-sm text-gray-300">
                      {new Date(run.started_at).toLocaleDateString()} at {new Date(run.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-sm text-gray-500">
                      {run.items_processed}/{run.items_found} processed
                      {run.items_failed > 0 && (
                        <span className="text-red-400 ml-1">({run.items_failed} failed)</span>
                      )}
                    </span>
                    <span className="ml-auto text-gray-500">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </button>

                  {/* Expanded sessions */}
                  {isExpanded && (
                    <div className="border-t border-gray-700 bg-gray-800/30 p-3">
                      {run.error_message && (
                        <div className="text-sm text-red-400 mb-3 p-2 bg-red-900/20 rounded">
                          Error: {run.error_message}
                        </div>
                      )}
                      {runSessions.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-500 mb-2">Sessions created:</div>
                          {runSessions.map((session) => (
                            <button
                              key={session!.session_id}
                              onClick={() => onShowSession?.(session!.session_id)}
                              className="w-full flex items-center gap-2 p-2 bg-gray-700/50 rounded hover:bg-gray-700 transition-colors text-left"
                            >
                              <span className="text-gray-400">→</span>
                              <span className="text-sm text-gray-200 truncate flex-1">
                                {session!.title || 'Untitled Session'}
                              </span>
                              {session!.entities?.length > 0 && (
                                <span className="text-xs text-gray-500">
                                  {session!.entities.map(e => `${e.kind} #${e.number}`).join(', ')}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : run.session_ids && run.session_ids.length > 0 ? (
                        <div className="text-sm text-gray-500">
                          {run.session_ids.length} session(s) created
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">No sessions created</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {runsTotalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => goToRunsPage(runsPage - 1)}
              disabled={runsPage <= 1}
              className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-500">
              Page {runsPage} of {runsTotalPages}
            </span>
            <button
              onClick={() => goToRunsPage(runsPage + 1)}
              disabled={runsPage >= runsTotalPages}
              className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
