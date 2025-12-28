import { useState, useEffect, memo, type MutableRefObject } from 'react';
import { useSchedules, describeCron, formatRelativeTime, CRON_PRESETS } from '../hooks/useSchedules';
import type { ScheduledJob, ScheduledJobCreate, ScheduledJobTargetType, CommandsResponse } from '../types';

interface ScheduleListProps {
  repoId: number;
  repoPath: string;
  commands: CommandsResponse;
  selectedScheduleId?: number | null;
  onSelectSchedule?: (scheduleId: number) => void;
  refreshRef?: MutableRefObject<(() => void) | null>;
}

export function ScheduleList({ repoId, commands, selectedScheduleId, onSelectSchedule, refreshRef }: ScheduleListProps) {
  const {
    schedules,
    loading,
    error,
    createSchedule,
    deleteSchedule,
    triggerNow,
    pauseSchedule,
    resumeSchedule,
    refresh,
  } = useSchedules(repoId);

  // Expose refresh function to parent via ref
  useEffect(() => {
    if (refreshRef) {
      refreshRef.current = refresh;
    }
    return () => {
      if (refreshRef) {
        refreshRef.current = null;
      }
    };
  }, [refreshRef, refresh]);

  const [isCreating, setIsCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleTrigger = async (schedule: ScheduledJob) => {
    try {
      setActionError(null);
      await triggerNow(schedule.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to trigger job');
    }
  };

  const handleDelete = async (schedule: ScheduledJob) => {
    if (!confirm(`Delete schedule "${schedule.name}"?`)) return;
    try {
      setActionError(null);
      await deleteSchedule(schedule.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete schedule');
    }
  };

  const handleTogglePause = async (schedule: ScheduledJob) => {
    try {
      setActionError(null);
      if (schedule.status === 'paused') {
        await resumeSchedule(schedule.id);
      } else {
        await pauseSchedule(schedule.id);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to update schedule');
    }
  };

  const handleCreate = async (data: ScheduledJobCreate) => {
    try {
      setActionError(null);
      await createSchedule(data);
      setIsCreating(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to create schedule');
      throw e;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div>
          <h2 className="text-lg font-medium">Scheduled Jobs</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Automatically run sessions on a schedule
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          New Schedule
        </button>
      </div>

      {/* Error */}
      {(error || actionError) && (
        <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-700 rounded text-sm text-red-300">
          {error || actionError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 skeleton-item-enter"
                style={{ '--item-index': i } as React.CSSProperties}
              >
                {/* Header row skeleton */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-32 rounded skeleton-shimmer" />
                      <div className="h-4 w-14 rounded-full skeleton-shimmer" />
                    </div>
                    <div className="h-4 w-48 rounded skeleton-shimmer mt-2" />
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <div className="w-7 h-7 rounded skeleton-shimmer" />
                    <div className="w-7 h-7 rounded skeleton-shimmer" />
                    <div className="w-7 h-7 rounded skeleton-shimmer" />
                  </div>
                </div>
                {/* Meta row skeleton */}
                <div className="flex items-center gap-4">
                  <div className="h-4 w-24 rounded skeleton-shimmer" />
                  <div className="h-4 w-20 rounded skeleton-shimmer" />
                  <div className="h-4 w-16 rounded skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-12 empty-state-enter">
            <div className="w-16 h-16 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-4 empty-state-icon-float">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-gray-300 font-medium mb-1">No scheduled jobs</h3>
            <p className="text-gray-400 text-sm mb-4">
              Create a schedule to automatically run analyses
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors btn-primary"
            >
              Create your first schedule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                selected={selectedScheduleId === schedule.id}
                onSelect={() => onSelectSchedule?.(schedule.id)}
                onTrigger={() => handleTrigger(schedule)}
                onDelete={() => handleDelete(schedule)}
                onTogglePause={() => handleTogglePause(schedule)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isCreating && (
        <ScheduleCreateModal
          commands={commands}
          onClose={() => setIsCreating(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

interface ScheduleCardProps {
  schedule: ScheduledJob;
  selected?: boolean;
  onSelect?: () => void;
  onTrigger: () => void;
  onDelete: () => void;
  onTogglePause: () => void;
}

const ScheduleCard = memo(function ScheduleCard({ schedule, selected, onSelect, onTrigger, onDelete, onTogglePause }: ScheduleCardProps) {
  const nextRun = schedule.next_run_at
    ? formatRelativeTime(new Date(schedule.next_run_at))
    : 'Not scheduled';

  const isPaused = schedule.status === 'paused';

  return (
    <div
      onClick={onSelect}
      className={`bg-gray-800 rounded-lg p-4 border transition-all duration-150 ease-out cursor-pointer list-item-hover ${
        selected
          ? 'border-blue-500 ring-1 ring-blue-500/50 list-item-selected'
          : isPaused
          ? 'border-gray-600 opacity-60 hover:border-gray-500'
          : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium flex items-center gap-2">
            <span className="truncate">{schedule.name}</span>
            <StatusBadge status={schedule.status} />
          </h3>
          {schedule.description && (
            <p className="text-sm text-gray-400 mt-1 line-clamp-2">{schedule.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onTrigger}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-green-400 transition-all active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-800"
            title="Run now"
            aria-label="Run schedule now"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={onTogglePause}
            className={`p-1.5 hover:bg-gray-700 rounded transition-all active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-800 ${
              isPaused ? 'text-yellow-500 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-400'
            }`}
            title={isPaused ? 'Resume' : 'Pause'}
            aria-label={isPaused ? 'Resume schedule' : 'Pause schedule'}
          >
            {isPaused ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400 transition-all active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-800"
            title="Delete"
            aria-label="Delete schedule"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
        <span className="flex items-center gap-1" title="Schedule">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {describeCron(schedule.cron_expression)}
        </span>
        <span className="flex items-center gap-1" title="Target">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          {schedule.target_type === 'custom' ? 'Custom prompt' : schedule.target_type}
        </span>
        {!isPaused && (
          <span className="text-gray-500">
            Next: {nextRun}
          </span>
        )}
      </div>

      {schedule.last_run_at && (
        <div className="mt-2 text-xs text-gray-500">
          Last run: {formatRelativeTime(new Date(schedule.last_run_at))}
          {schedule.last_run_status && (
            <span className={`ml-1 ${
              schedule.last_run_status === 'completed' ? 'text-green-400' : 'text-red-400'
            }`}>
              ({schedule.last_run_status})
            </span>
          )}
          {schedule.run_count > 0 && (
            <span className="ml-2 text-gray-600">
              {schedule.run_count} run{schedule.run_count !== 1 ? 's' : ''} total
            </span>
          )}
        </div>
      )}
    </div>
  );
});

function StatusBadge({ status }: { status: string }) {
  const config = {
    active: {
      containerClass: 'bg-green-500/20 text-green-400',
      dotClass: 'bg-green-500',
      pulse: false,
      label: 'Schedule is active and will run on its cron schedule',
    },
    paused: {
      containerClass: 'bg-yellow-500/20 text-yellow-400',
      dotClass: 'bg-yellow-500',
      pulse: false,
      label: 'Schedule is paused and will not run until resumed',
    },
    disabled: {
      containerClass: 'bg-gray-500/20 text-gray-400',
      dotClass: 'bg-gray-500',
      pulse: false,
      label: 'Schedule is disabled',
    },
    running: {
      containerClass: 'bg-blue-500/20 text-blue-400 active-badge-glow',
      dotClass: 'bg-blue-500',
      pulse: true,
      label: 'Schedule is currently running',
    },
  };

  const { containerClass, dotClass, pulse, label } = config[status as keyof typeof config] || config.disabled;

  return (
    <span
      className={`status-badge status-badge-enter inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${containerClass}`}
      title={label}
      aria-label={label}
    >
      <span className={`status-dot w-1.5 h-1.5 rounded-full ${dotClass} ${pulse ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

interface ScheduleCreateModalProps {
  commands: CommandsResponse;
  onClose: () => void;
  onCreate: (data: ScheduledJobCreate) => Promise<void>;
}

function ScheduleCreateModal({ commands, onClose, onCreate }: ScheduleCreateModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    cron_expression: '0 9 * * 1-5',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    target_type: 'issues' as ScheduledJobTargetType,
    filter_query: 'state:open',
    command_id: commands.issue[0]?.id || '',
    custom_prompt: '',
    max_items: 10,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }

    if (form.target_type === 'custom' && !form.custom_prompt.trim()) {
      setError('Custom prompt is required');
      return;
    }

    if (form.target_type !== 'custom' && !form.command_id) {
      setError('Command is required');
      return;
    }

    setSaving(true);
    try {
      await onCreate({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        cron_expression: form.cron_expression,
        timezone: form.timezone,
        target_type: form.target_type,
        filter_query: form.filter_query || undefined,
        command_id: form.target_type !== 'custom' ? form.command_id : undefined,
        custom_prompt: form.target_type === 'custom' ? form.custom_prompt : undefined,
        max_items: form.max_items,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  };

  // Get available commands based on target type
  const availableCommands = form.target_type === 'issues'
    ? commands.issue
    : form.target_type === 'prs'
    ? commands.pr
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-enter">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#161b22] border border-gray-700 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col mx-4 modal-content-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Create Scheduled Job</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Daily issue triage"
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Analyze new issues labeled needs-triage"
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium mb-1">Schedule</label>
            <select
              value={form.cron_expression}
              onChange={(e) => setForm((f) => ({ ...f, cron_expression: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CRON_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Cron: {form.cron_expression} ({form.timezone})
            </p>
          </div>

          {/* Target Type */}
          <div>
            <label className="block text-sm font-medium mb-1">Target</label>
            <div className="grid grid-cols-4 gap-2">
              {(['issues', 'prs', 'codebase', 'custom'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((f) => ({
                    ...f,
                    target_type: type,
                    command_id: type === 'issues' ? commands.issue[0]?.id || ''
                      : type === 'prs' ? commands.pr[0]?.id || ''
                      : '',
                  }))}
                  className={`px-3 py-2 text-sm rounded border capitalize ${
                    form.target_type === type
                      ? 'border-blue-500 bg-blue-900/30 text-white'
                      : 'border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Filter (for issues/prs) */}
          {(form.target_type === 'issues' || form.target_type === 'prs') && (
            <div>
              <label className="block text-sm font-medium mb-1">Filter</label>
              <input
                type="text"
                value={form.filter_query}
                onChange={(e) => setForm((f) => ({ ...f, filter_query: e.target.value }))}
                placeholder="state:open label:needs-triage"
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                GitHub-style filter: state:open, label:bug, -label:wontfix
              </p>
            </div>
          )}

          {/* Command (for issues/prs/codebase) */}
          {form.target_type !== 'custom' && (
            <div>
              <label className="block text-sm font-medium mb-1">Command</label>
              <select
                value={form.command_id}
                onChange={(e) => setForm((f) => ({ ...f, command_id: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableCommands.length === 0 ? (
                  <option value="">No commands available</option>
                ) : (
                  availableCommands.map((cmd) => (
                    <option key={cmd.id} value={cmd.id}>
                      {cmd.name} - {cmd.description}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Custom Prompt or Command from any category */}
          {form.target_type === 'custom' && (
            <div className="space-y-4">
              {/* Show all commands from all categories */}
              {(commands.issue.length > 0 || commands.pr.length > 0 || commands.general.length > 0) && (
                <div>
                  <label className="block text-sm font-medium mb-1">Use a command (optional)</label>
                  <select
                    value={form.command_id}
                    onChange={(e) => {
                      const allCommands = [...commands.issue, ...commands.pr, ...commands.general];
                      const cmd = allCommands.find(c => c.id === e.target.value);
                      setForm((f) => ({
                        ...f,
                        command_id: e.target.value,
                        custom_prompt: cmd ? cmd.template : f.custom_prompt,
                      }));
                    }}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Write custom prompt --</option>
                    {commands.general.length > 0 && (
                      <optgroup label="General">
                        {commands.general.map((cmd) => (
                          <option key={`general-${cmd.id}`} value={cmd.id}>
                            {cmd.name} - {cmd.description}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {commands.issue.length > 0 && (
                      <optgroup label="Issue Commands">
                        {commands.issue.map((cmd) => (
                          <option key={`issue-${cmd.id}`} value={cmd.id}>
                            {cmd.name} - {cmd.description}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {commands.pr.length > 0 && (
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
              <div>
                <label className="block text-sm font-medium mb-1">Prompt</label>
                <textarea
                  value={form.custom_prompt}
                  onChange={(e) => setForm((f) => ({ ...f, custom_prompt: e.target.value, command_id: '' }))}
                  placeholder="Run a security audit on all API endpoints..."
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* Max Items */}
          {(form.target_type === 'issues' || form.target_type === 'prs') && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Max items per run: {form.max_items}
              </label>
              <input
                type="range"
                min="1"
                max="50"
                value={form.max_items}
                onChange={(e) => setForm((f) => ({ ...f, max_items: parseInt(e.target.value) }))}
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                Limit how many issues/PRs are processed each run
              </p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
          >
            {saving ? 'Creating...' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
