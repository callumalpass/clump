import { useState, useEffect, useCallback } from 'react';
import type {
  ScheduledJob,
  ScheduledJobRun,
  ScheduledJobRunsResponse,
  ScheduledJobCreate,
  ScheduledJobUpdate,
} from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export function useSchedules(repoId: number | null) {
  const [schedules, setSchedules] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(repoId !== null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);
      const data = await fetchJson<ScheduledJob[]>(
        `${API_BASE}/repos/${repoId}/schedules`,
        { signal }
      );
      setSchedules(data);
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to fetch schedules');
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (!repoId) {
      setSchedules([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    refresh(controller.signal);

    return () => controller.abort();
  }, [repoId, refresh]);

  const createSchedule = async (data: ScheduledJobCreate): Promise<ScheduledJob> => {
    if (!repoId) throw new Error('No repository selected');

    const schedule = await fetchJson<ScheduledJob>(
      `${API_BASE}/repos/${repoId}/schedules`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    setSchedules((prev) => [schedule, ...prev]);
    return schedule;
  };

  const updateSchedule = async (
    scheduleId: number,
    data: ScheduledJobUpdate
  ): Promise<ScheduledJob> => {
    if (!repoId) throw new Error('No repository selected');

    const schedule = await fetchJson<ScheduledJob>(
      `${API_BASE}/repos/${repoId}/schedules/${scheduleId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
    setSchedules((prev) =>
      prev.map((s) => (s.id === scheduleId ? schedule : s))
    );
    return schedule;
  };

  const deleteSchedule = async (scheduleId: number): Promise<void> => {
    if (!repoId) throw new Error('No repository selected');

    await fetchJson(`${API_BASE}/repos/${repoId}/schedules/${scheduleId}`, {
      method: 'DELETE',
    });
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
  };

  const triggerNow = async (scheduleId: number): Promise<void> => {
    if (!repoId) throw new Error('No repository selected');

    await fetchJson(`${API_BASE}/repos/${repoId}/schedules/${scheduleId}/run`, {
      method: 'POST',
    });
    // Refresh to get updated last_run info
    await refresh();
  };

  const pauseSchedule = async (scheduleId: number): Promise<ScheduledJob> => {
    if (!repoId) throw new Error('No repository selected');

    const schedule = await fetchJson<ScheduledJob>(
      `${API_BASE}/repos/${repoId}/schedules/${scheduleId}/pause`,
      { method: 'POST' }
    );
    setSchedules((prev) =>
      prev.map((s) => (s.id === scheduleId ? schedule : s))
    );
    return schedule;
  };

  const resumeSchedule = async (scheduleId: number): Promise<ScheduledJob> => {
    if (!repoId) throw new Error('No repository selected');

    const schedule = await fetchJson<ScheduledJob>(
      `${API_BASE}/repos/${repoId}/schedules/${scheduleId}/resume`,
      { method: 'POST' }
    );
    setSchedules((prev) =>
      prev.map((s) => (s.id === scheduleId ? schedule : s))
    );
    return schedule;
  };

  return {
    schedules,
    loading,
    error,
    refresh: () => refresh(),
    createSchedule,
    updateSchedule,
    deleteSchedule,
    triggerNow,
    pauseSchedule,
    resumeSchedule,
  };
}

export async function fetchScheduleRuns(
  repoId: number,
  scheduleId: number,
  limit: number = 20,
  offset: number = 0
): Promise<ScheduledJobRunsResponse> {
  return fetchJson<ScheduledJobRunsResponse>(
    `${API_BASE}/repos/${repoId}/schedules/${scheduleId}/runs?limit=${limit}&offset=${offset}`
  );
}

/**
 * Hook for fetching schedule details and paginated runs.
 */
export function useScheduleDetail(repoId: number | null, scheduleId: number | null) {
  const [schedule, setSchedule] = useState<ScheduledJob | null>(null);
  const [runs, setRuns] = useState<ScheduledJobRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const RUNS_PER_PAGE = 10;

  // Reset state immediately when scheduleId changes to prevent showing stale data
  useEffect(() => {
    setSchedule(null);
    setRuns([]);
    setRunsTotal(0);
    setRunsPage(1);
    setError(null);
  }, [scheduleId]);

  // Fetch schedule and runs with proper cancellation
  useEffect(() => {
    if (!repoId || !scheduleId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch schedule
        const scheduleResponse = await fetch(
          `${API_BASE}/repos/${repoId}/schedules/${scheduleId}`,
          { signal: controller.signal }
        );
        if (!scheduleResponse.ok) {
          const error = await scheduleResponse.json().catch(() => ({ detail: scheduleResponse.statusText }));
          throw new Error(error.detail || `HTTP ${scheduleResponse.status}`);
        }
        const scheduleData = await scheduleResponse.json();

        // Fetch runs
        const runsResponse = await fetch(
          `${API_BASE}/repos/${repoId}/schedules/${scheduleId}/runs?limit=${RUNS_PER_PAGE}&offset=0`,
          { signal: controller.signal }
        );
        if (!runsResponse.ok) {
          const error = await runsResponse.json().catch(() => ({ detail: runsResponse.statusText }));
          throw new Error(error.detail || `HTTP ${runsResponse.status}`);
        }
        const runsData = await runsResponse.json();

        // Only update state if not cancelled
        if (!cancelled) {
          setSchedule(scheduleData);
          setRuns(runsData.runs);
          setRunsTotal(runsData.total);
          setRunsPage(1);
          setError(null);
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch schedule');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [repoId, scheduleId]);

  const fetchRuns = useCallback(async (page: number = 1) => {
    if (!repoId || !scheduleId) return;
    try {
      const offset = (page - 1) * RUNS_PER_PAGE;
      const data = await fetchScheduleRuns(repoId, scheduleId, RUNS_PER_PAGE, offset);
      setRuns(data.runs);
      setRunsTotal(data.total);
      setRunsPage(page);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch runs');
    }
  }, [repoId, scheduleId]);

  const refresh = useCallback(async () => {
    if (!repoId || !scheduleId) return;
    setLoading(true);
    try {
      const [scheduleData, runsData] = await Promise.all([
        fetchJson<ScheduledJob>(`${API_BASE}/repos/${repoId}/schedules/${scheduleId}`),
        fetchScheduleRuns(repoId, scheduleId, RUNS_PER_PAGE, (runsPage - 1) * RUNS_PER_PAGE),
      ]);
      setSchedule(scheduleData);
      setRuns(runsData.runs);
      setRunsTotal(runsData.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  }, [repoId, scheduleId, runsPage]);

  const updateSchedule = async (data: ScheduledJobUpdate): Promise<ScheduledJob> => {
    if (!repoId || !scheduleId) throw new Error('No schedule selected');

    const updated = await fetchJson<ScheduledJob>(
      `${API_BASE}/repos/${repoId}/schedules/${scheduleId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
    setSchedule(updated);
    return updated;
  };

  const triggerNow = async (): Promise<void> => {
    if (!repoId || !scheduleId) throw new Error('No schedule selected');

    await fetchJson(`${API_BASE}/repos/${repoId}/schedules/${scheduleId}/run`, {
      method: 'POST',
    });
    await refresh();
  };

  const pauseSchedule = async (): Promise<ScheduledJob> => {
    if (!repoId || !scheduleId) throw new Error('No schedule selected');

    const updated = await fetchJson<ScheduledJob>(
      `${API_BASE}/repos/${repoId}/schedules/${scheduleId}/pause`,
      { method: 'POST' }
    );
    setSchedule(updated);
    return updated;
  };

  const resumeSchedule = async (): Promise<ScheduledJob> => {
    if (!repoId || !scheduleId) throw new Error('No schedule selected');

    const updated = await fetchJson<ScheduledJob>(
      `${API_BASE}/repos/${repoId}/schedules/${scheduleId}/resume`,
      { method: 'POST' }
    );
    setSchedule(updated);
    return updated;
  };

  return {
    schedule,
    runs,
    runsTotal,
    runsPage,
    runsTotalPages: Math.ceil(runsTotal / RUNS_PER_PAGE),
    loading,
    error,
    refresh,
    goToRunsPage: fetchRuns,
    updateSchedule,
    triggerNow,
    pauseSchedule,
    resumeSchedule,
  };
}

// Cron expression helpers
export const CRON_PRESETS = [
  { label: 'Every morning at 9am (weekdays)', value: '0 9 * * 1-5' },
  { label: 'Every morning at 9am (daily)', value: '0 9 * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every Monday at 9am', value: '0 9 * * 1' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
];

export function describeCron(cron: string): string {
  // Simple human-readable descriptions for common patterns
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayMonth, month, dayWeek] = parts as [string, string, string, string, string];

  // Every X minutes
  if (minute.startsWith('*/') && hour === '*') {
    return `Every ${minute.slice(2)} minutes`;
  }

  // Every hour
  if (minute === '0' && hour === '*' && dayMonth === '*' && month === '*' && dayWeek === '*') {
    return 'Every hour';
  }

  // Every X hours
  if (minute === '0' && hour.startsWith('*/')) {
    return `Every ${hour.slice(2)} hours`;
  }

  // Daily at specific time
  if (dayMonth === '*' && month === '*' && dayWeek === '*') {
    const h = parseInt(hour);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h || 12;
    return `Daily at ${displayHour}:${minute.padStart(2, '0')} ${period}`;
  }

  // Weekdays at specific time
  if (dayMonth === '*' && month === '*' && dayWeek === '1-5') {
    const h = parseInt(hour);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h || 12;
    return `Weekdays at ${displayHour}:${minute.padStart(2, '0')} ${period}`;
  }

  // Weekly (specific day)
  if (dayMonth === '*' && month === '*' && /^[0-6]$/.test(dayWeek)) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const h = parseInt(hour);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h || 12;
    return `${days[parseInt(dayWeek)]}s at ${displayHour}:${minute.padStart(2, '0')} ${period}`;
  }

  return cron;
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMs < 0) {
    // Past
    const absMins = Math.abs(diffMins);
    const absHours = Math.abs(diffHours);
    const absDays = Math.abs(diffDays);

    if (absMins < 1) return 'just now';
    if (absMins < 60) return `${absMins}m ago`;
    if (absHours < 24) return `${absHours}h ago`;
    if (absDays < 7) return `${absDays}d ago`;
    return date.toLocaleDateString();
  } else {
    // Future
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `in ${diffMins}m`;
    if (diffHours < 24) return `in ${diffHours}h`;
    if (diffDays < 7) return `in ${diffDays}d`;
    return date.toLocaleDateString();
  }
}
