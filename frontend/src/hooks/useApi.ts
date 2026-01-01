import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Repo, Issue, IssueDetail, PR, PRDetail, Process,
  SessionSummary, SessionDetail, SessionListResponse, EntityLink, EntityKind,
  ClaudeCodeSettings, ProcessCreateOptions, Tag, IssueTagsMap, GitHubLabel,
  CommandsResponse, CommandMetadata, SubsessionDetail,
  RepoSessionCount, SessionCountsResponse, StatsResponse, BulkOperationResult,
  IssueMetadataMap, IssueMetadata, PRMetadataMap, PRMetadata,
  CLIType, CLIInfo, AvailableCLIsResponse, CLISettings
} from '../types';
import { formatLocalDate } from '../utils/time';

export interface EntityInput {
  kind: EntityKind;
  number: number;
}

const API_BASE = '/api';

/**
 * Type guard to check if an error is an AbortError (from AbortController).
 */
function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

/**
 * Extract error message from an unknown error, with a fallback.
 */
function getErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// Generic paginated list hook for Issues, PRs, etc.
interface PaginatedListConfig<TItem, TFilters> {
  /** Base URL path, e.g., `/repos/${repoId}/issues` */
  buildUrl: (repoId: number) => string;
  /** Extract items from response */
  getItems: (response: unknown) => TItem[];
  /** Build URLSearchParams from filters */
  buildParams: (filters: TFilters, page: number, perPage: number) => URLSearchParams;
  /** Error message when fetch fails */
  errorMessage: string;
  /** Dependencies that should trigger a refetch (excluding repoId) */
  getFilterDeps: (filters: TFilters) => unknown[];
}

/** Common filter fields shared between Issues and PRs */
interface BaseEntityFilters {
  state?: 'open' | 'closed' | 'all';
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Build common URLSearchParams for entity lists (Issues, PRs).
 * Handles state, sort, order, pagination, and search.
 */
function buildEntityListParams(
  filters: BaseEntityFilters,
  page: number,
  perPage: number,
  defaults: { state: string; sort: string; order: 'asc' | 'desc' }
): URLSearchParams {
  const { state = defaults.state, search, sort = defaults.sort, order = defaults.order } = filters;
  const params = new URLSearchParams();
  params.set('state', state);
  params.set('sort', sort);
  params.set('order', order);
  params.set('page', page.toString());
  params.set('per_page', perPage.toString());
  if (search) {
    params.set('search', search);
  }
  return params;
}

/**
 * Get common filter dependencies for entity lists.
 * Returns an array of values that should trigger a refetch when changed.
 */
function getEntityFilterDeps(
  filters: BaseEntityFilters,
  defaults: { state: string; sort: string; order: 'asc' | 'desc' }
): unknown[] {
  return [
    filters.state ?? defaults.state,
    filters.search,
    filters.sort ?? defaults.sort,
    filters.order ?? defaults.order,
  ];
}

interface PaginatedListResult<TItem> {
  items: TItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  page: number;
  totalPages: number;
  total: number;
  goToPage: (page: number) => void;
}

interface PaginatedResponse {
  total: number;
  page: number;
}

function usePaginatedList<TItem, TFilters>(
  repoId: number | null,
  filters: TFilters,
  config: PaginatedListConfig<TItem, TFilters>,
  enabled: boolean = true  // Lazy loading: only fetch when enabled
): PaginatedListResult<TItem> {
  const [items, setItems] = useState<TItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(30);
  // Start with loading=true if we have a repoId AND enabled to prevent flash
  const [loading, setLoading] = useState(repoId !== null && enabled);
  const [error, setError] = useState<string | null>(null);
  // Track if we've ever fetched for this repoId (for lazy loading)
  const hasFetchedRef = useRef(false);
  const lastRepoIdRef = useRef<number | null>(null);

  // Reset hasFetched when repoId changes
  if (lastRepoIdRef.current !== repoId) {
    hasFetchedRef.current = false;
    lastRepoIdRef.current = repoId;
  }

  const fetchPage = useCallback(async (pageNum: number, signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);
      const params = config.buildParams(filters, pageNum, perPage);
      const data = await fetchJson<PaginatedResponse>(
        `${API_BASE}${config.buildUrl(repoId)}?${params}`,
        { signal }
      );
      setItems(config.getItems(data));
      setTotal(data.total ?? 0);
      setPage(data.page);
      setError(null);
      hasFetchedRef.current = true;
    } catch (e) {
      if (isAbortError(e)) return;
      setError(getErrorMessage(e, config.errorMessage));
    } finally {
      setLoading(false);
    }
  }, [repoId, filters, perPage, config]);

  const refresh = useCallback(() => fetchPage(page), [fetchPage, page]);

  const goToPage = useCallback((pageNum: number) => {
    setPage(pageNum);
    fetchPage(pageNum);
  }, [fetchPage]);

  // Get filter dependencies to track changes
  const filterDeps = config.getFilterDeps(filters);

  // Reset to page 1 when filters change OR when enabled becomes true (lazy load trigger)
  useEffect(() => {
    if (!repoId) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    // Don't fetch if not enabled
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setPage(1);
    fetchPage(1, controller.signal);

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, enabled, ...filterDeps]);

  const totalPages = Math.ceil(total / perPage);

  return { items, loading, error, refresh, page, totalPages, total, goToPage };
}


// Repos
export function useRepos() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<Repo[]>(`${API_BASE}/repos`);
      setRepos(data);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to fetch repos'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addRepo = async (localPath: string) => {
    const repo = await fetchJson<Repo>(`${API_BASE}/repos`, {
      method: 'POST',
      body: JSON.stringify({ local_path: localPath }),
    });
    setRepos((prev) => [...prev, repo]);
    return repo;
  };

  const deleteRepo = async (id: number) => {
    await fetchJson(`${API_BASE}/repos/${id}`, { method: 'DELETE' });
    setRepos((prev) => prev.filter((r) => r.id !== id));
  };

  return { repos, loading, error, refresh, addRepo, deleteRepo };
}

// Issues
export type SessionStatusFilter = 'all' | 'analyzed' | 'unanalyzed';
export type LocalStatusFilter = 'all' | 'open' | 'in_progress' | 'completed' | 'wontfix' | 'unset';

export interface IssueFilters {
  state?: 'open' | 'closed' | 'all';
  search?: string;
  labels?: string[];
  sort?: 'created' | 'updated' | 'comments';
  order?: 'asc' | 'desc';
  sessionStatus?: SessionStatusFilter;  // Client-side filter for issues with/without sessions
  localStatus?: LocalStatusFilter;  // Client-side filter for local status from sidecar metadata
}

interface IssueListResponse extends PaginatedResponse {
  issues: Issue[];
}

const ISSUE_FILTER_DEFAULTS = { state: 'open', sort: 'created', order: 'desc' as const };

const issuesConfig: PaginatedListConfig<Issue, IssueFilters> = {
  buildUrl: (repoId) => `/repos/${repoId}/issues`,
  getItems: (response) => (response as IssueListResponse).issues ?? [],
  buildParams: (filters, page, perPage) => {
    const params = buildEntityListParams(filters, page, perPage, ISSUE_FILTER_DEFAULTS);
    // Issue-specific: append labels
    if (filters.labels && filters.labels.length > 0) {
      filters.labels.forEach(label => params.append('labels', label));
    }
    return params;
  },
  errorMessage: 'Failed to fetch issues',
  getFilterDeps: (filters) => [
    ...getEntityFilterDeps(filters, ISSUE_FILTER_DEFAULTS),
    filters.labels?.join(',') ?? '',
  ],
};

export function useIssues(repoId: number | null, filters: IssueFilters = {}, enabled: boolean = true) {
  const result = usePaginatedList(repoId, filters, issuesConfig, enabled);
  // Rename 'items' to 'issues' for API compatibility
  return {
    issues: result.items,
    loading: result.loading,
    error: result.error,
    refresh: result.refresh,
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
    goToPage: result.goToPage,
  };
}

export async function fetchIssue(repoId: number, issueNumber: number): Promise<IssueDetail> {
  return fetchJson<IssueDetail>(`${API_BASE}/repos/${repoId}/issues/${issueNumber}`);
}

// PRs
export async function fetchPR(repoId: number, prNumber: number): Promise<PRDetail> {
  return fetchJson<PRDetail>(`${API_BASE}/repos/${repoId}/prs/${prNumber}`);
}

export interface PRFilters {
  state?: 'open' | 'closed' | 'all';
  search?: string;
  sort?: 'created' | 'updated';
  order?: 'asc' | 'desc';
  sessionStatus?: SessionStatusFilter;  // Client-side filter for PRs with/without sessions
}

interface PRListResponse extends PaginatedResponse {
  prs: PR[];
}

const PR_FILTER_DEFAULTS = { state: 'open', sort: 'created', order: 'desc' as const };

const prsConfig: PaginatedListConfig<PR, PRFilters> = {
  buildUrl: (repoId) => `/repos/${repoId}/prs`,
  getItems: (response) => (response as PRListResponse).prs ?? [],
  buildParams: (filters, page, perPage) => buildEntityListParams(filters, page, perPage, PR_FILTER_DEFAULTS),
  errorMessage: 'Failed to fetch PRs',
  getFilterDeps: (filters) => getEntityFilterDeps(filters, PR_FILTER_DEFAULTS),
};

export function usePRs(repoId: number | null, filters: PRFilters = {}, enabled: boolean = true) {
  const result = usePaginatedList(repoId, filters, prsConfig, enabled);
  // Rename 'items' to 'prs' for API compatibility
  return {
    prs: result.items,
    loading: result.loading,
    error: result.error,
    refresh: result.refresh,
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
    goToPage: result.goToPage,
  };
}

// Processes (PTY processes running Claude Code)
// Now event-driven via WebSocket - no polling
export function useProcesses() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<{ processes: Process[] }>(`${API_BASE}/processes`);
      setProcesses(data.processes);
    } catch (e) {
      console.error('Failed to fetch processes:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch only - updates come via WebSocket events
  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProcess = async (
    repoId: number,
    prompt?: string,
    kind: string = 'custom',
    entities: EntityInput[] = [],
    title: string = 'New Session',
    options?: ProcessCreateOptions
  ) => {
    const process = await fetchJson<Process>(`${API_BASE}/processes`, {
      method: 'POST',
      body: JSON.stringify({
        repo_id: repoId,
        prompt,
        kind,
        entities,
        title,
        // CLI selection
        cli_type: options?.cli_type,
        // CLI configuration options
        permission_mode: options?.permission_mode,
        allowed_tools: options?.allowed_tools,
        disallowed_tools: options?.disallowed_tools,
        max_turns: options?.max_turns,
        model: options?.model,
        resume_session: options?.resume_session,
      }),
    });
    // Only add PTY processes to the list (headless sessions have no PTY)
    if (process.mode === 'pty') {
      setProcesses((prev) => [...prev, process]);
    }
    return process;
  };

  const resumeProcess = async (
    repoId: number,
    claudeSessionId: string,
    title: string = 'Continued Session'
  ) => {
    return createProcess(repoId, undefined, 'custom', [], title, {
      resume_session: claudeSessionId,
    });
  };

  const killProcess = async (processId: string) => {
    await fetchJson(`${API_BASE}/processes/${processId}`, { method: 'DELETE' });
    setProcesses((prev) => prev.filter((p) => p.id !== processId));
  };

  const addProcess = (process: Process) => {
    setProcesses((prev) => [...prev, process]);
  };

  const removeProcess = (processId: string) => {
    setProcesses((prev) => prev.filter((p) => p.id !== processId));
  };

  return {
    processes,
    loading,
    refresh,
    createProcess,
    resumeProcess,
    killProcess,
    addProcess,
    removeProcess,
    setProcesses,
  };
}

// Sessions (transcript-first model)
export type ModelFilter = 'all' | 'sonnet' | 'opus' | 'haiku';

export type DateRangePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface SessionFilters {
  repoPath?: string;
  starred?: boolean;
  hasEntities?: boolean;
  search?: string;
  isActive?: boolean;
  model?: ModelFilter;
  sort?: 'created' | 'updated' | 'messages';
  order?: 'asc' | 'desc';
  dateRange?: DateRangePreset;
  dateFrom?: string;  // ISO date string YYYY-MM-DD
  dateTo?: string;    // ISO date string YYYY-MM-DD
}

export function useSessions(filters: SessionFilters = {}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const { repoPath, starred, hasEntities, search, isActive, model, sort, order, dateRange, dateFrom, dateTo } = filters;

  // Internal fetch that optionally shows loading state
  const fetchSessions = useCallback(async (showLoading: boolean) => {
    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams();
      if (repoPath) params.set('repo_path', repoPath);
      if (starred !== undefined) params.set('starred', starred.toString());
      if (hasEntities !== undefined) params.set('has_entities', hasEntities.toString());
      if (isActive !== undefined) params.set('is_active', isActive.toString());
      if (model && model !== 'all') params.set('model', model);
      if (search) params.set('search', search);
      if (sort) params.set('sort', sort);
      if (order) params.set('order', order);

      // Handle date range filtering
      if (dateRange && dateRange !== 'all') {
        const today = new Date();

        if (dateRange === 'today') {
          params.set('date_from', formatLocalDate(today));
          params.set('date_to', formatLocalDate(today));
        } else if (dateRange === 'yesterday') {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          params.set('date_from', formatLocalDate(yesterday));
          params.set('date_to', formatLocalDate(yesterday));
        } else if (dateRange === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          params.set('date_from', formatLocalDate(weekAgo));
          params.set('date_to', formatLocalDate(today));
        } else if (dateRange === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setDate(monthAgo.getDate() - 30);
          params.set('date_from', formatLocalDate(monthAgo));
          params.set('date_to', formatLocalDate(today));
        } else if (dateRange === 'custom') {
          // Use explicit dateFrom/dateTo for custom range
          if (dateFrom) params.set('date_from', dateFrom);
          if (dateTo) params.set('date_to', dateTo);
        }
      }

      const data = await fetchJson<SessionListResponse>(
        `${API_BASE}/sessions?${params}`
      );
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [repoPath, starred, hasEntities, search, isActive, model, sort, order, dateRange, dateFrom, dateTo]);

  // Public refresh - silent by default for polling
  const refresh = useCallback(() => fetchSessions(false), [fetchSessions]);

  // Initial load and when filters change
  useEffect(() => {
    // Clear old sessions immediately to prevent showing stale data from wrong repo
    setSessions([]);
    setTotal(0);
    fetchSessions(true);
  // fetchSessions captures all filter values, so we just need it as a dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSessions]);

  const continueSession = async (sessionId: string, prompt?: string): Promise<Process> => {
    const result = await fetchJson<Process>(
      `${API_BASE}/sessions/${sessionId}/continue`,
      {
        method: 'POST',
        body: prompt ? JSON.stringify({ prompt }) : undefined,
      }
    );
    // Update the session to show as active in local state
    setSessions((prev) =>
      prev.map((s) =>
        s.session_id === sessionId ? { ...s, is_active: true } : s
      )
    );
    return result;
  };

  const killSession = async (sessionId: string): Promise<{ status: string; killed_pty: boolean; killed_headless: boolean }> => {
    const result = await fetchJson<{ status: string; killed_pty: boolean; killed_headless: boolean }>(
      `${API_BASE}/sessions/${sessionId}/kill`,
      { method: 'POST' }
    );
    // Update the session to show as inactive in local state
    setSessions((prev) =>
      prev.map((s) =>
        s.session_id === sessionId ? { ...s, is_active: false } : s
      )
    );
    return result;
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    await fetchJson(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE' });
    // Remove from local state
    setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    setTotal((prev) => prev - 1);
  };

  const updateSessionMetadata = async (
    sessionId: string,
    updates: { title?: string; summary?: string; tags?: string[]; starred?: boolean }
  ) => {
    const result = await fetchJson<SessionSummary>(
      `${API_BASE}/sessions/${sessionId}`,
      { method: 'PATCH', body: JSON.stringify(updates) }
    );
    // Refresh to get updated data
    await refresh();
    return result;
  };

  const bulkDeleteSessions = async (sessionIds: string[]): Promise<BulkOperationResult> => {
    const result = await fetchJson<BulkOperationResult>(`${API_BASE}/sessions/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ session_ids: sessionIds }),
    });
    // Refresh to get updated list
    await refresh();
    return result;
  };

  const bulkUpdateSessions = async (
    sessionIds: string[],
    updates: { starred?: boolean }
  ): Promise<BulkOperationResult> => {
    const result = await fetchJson<BulkOperationResult>(`${API_BASE}/sessions/bulk-update`, {
      method: 'POST',
      body: JSON.stringify({ session_ids: sessionIds, ...updates }),
    });
    // Update local state optimistically for starred status
    if (updates.starred !== undefined) {
      setSessions((prev) =>
        prev.map((s) =>
          sessionIds.includes(s.session_id) ? { ...s, starred: updates.starred! } : s
        )
      );
    }
    return result;
  };

  return { sessions, total, loading, refresh, continueSession, killSession, deleteSession, updateSessionMetadata, bulkDeleteSessions, bulkUpdateSessions };
}

// Active/Recent Sessions (for the always-visible sessions panel)
// Fetches active and recently modified sessions independently of history pagination
export function useActiveSessions(repoPath?: string) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveSessions = useCallback(async (showLoading: boolean = false) => {
    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams();
      if (repoPath) params.set('repo_path', repoPath);
      // Sort by modified_at descending to get most recent first
      params.set('sort', 'updated');
      params.set('order', 'desc');
      // Get enough sessions to show active + recent ones (reduced from 50 for perf)
      params.set('limit', '20');
      params.set('offset', '0');

      const data = await fetchJson<SessionListResponse>(
        `${API_BASE}/sessions?${params}`
      );

      // Filter to active + recently modified (within last 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const prominentSessions = data.sessions.filter(s => {
        if (s.is_active) return true;
        if (s.modified_at) {
          const modified = new Date(s.modified_at);
          return modified > tenMinutesAgo;
        }
        return false;
      });

      setSessions(prominentSessions);
    } catch (e) {
      console.error('Failed to fetch active sessions:', e);
    } finally {
      // Only update loading state if we showed loading indicator
      if (showLoading) setLoading(false);
    }
  }, [repoPath]);

  // Refresh function for external use (silent by default)
  const refresh = useCallback(() => fetchActiveSessions(false), [fetchActiveSessions]);

  // Initial load and when repo changes
  useEffect(() => {
    // Clear old sessions immediately to prevent showing stale data from wrong repo
    setSessions([]);
    fetchActiveSessions(true);
  }, [fetchActiveSessions]);

  return { sessions, loading, refresh };
}

// Session counts per repo (for badges)
// Now event-driven via WebSocket - no polling
export function useSessionCounts() {
  const [counts, setCounts] = useState<Map<number, RepoSessionCount>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<SessionCountsResponse>(`${API_BASE}/sessions/counts`);
      const countsMap = new Map<number, RepoSessionCount>();
      for (const count of data.counts) {
        countsMap.set(count.repo_id, count);
      }
      setCounts(countsMap);
    } catch (e) {
      console.error('Failed to fetch session counts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch only - updates come via WebSocket events
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Update counts from WebSocket event
  const updateCounts = useCallback((newCounts: Record<string, RepoSessionCount>) => {
    setCounts((prev) => {
      const updated = new Map(prev);
      for (const count of Object.values(newCounts)) {
        updated.set(count.repo_id, count);
      }
      return updated;
    });
  }, []);

  return { counts, loading, refresh, updateCounts, setCounts };
}

// Fetch full session detail with transcript
export async function fetchSessionDetail(sessionId: string): Promise<SessionDetail> {
  return fetchJson<SessionDetail>(`${API_BASE}/sessions/${sessionId}`);
}

// Fetch subsession (spawned agent) detail
export async function fetchSubsession(
  sessionId: string,
  agentId: string
): Promise<SubsessionDetail> {
  return fetchJson<SubsessionDetail>(
    `${API_BASE}/sessions/${sessionId}/subsession/${agentId}`
  );
}

// Claude Code Settings
export function useClaudeSettings() {
  const [settings, setSettings] = useState<ClaudeCodeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<ClaudeCodeSettings>(`${API_BASE}/settings/claude`);
      setSettings(data);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to fetch settings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateSettings = async (newSettings: Partial<ClaudeCodeSettings>) => {
    if (!settings) return;

    try {
      setSaving(true);
      const merged = { ...settings, ...newSettings };
      const data = await fetchJson<ClaudeCodeSettings>(`${API_BASE}/settings/claude`, {
        method: 'PUT',
        body: JSON.stringify({
          permission_mode: merged.permission_mode,
          allowed_tools: merged.allowed_tools,
          disallowed_tools: merged.disallowed_tools,
          max_turns: merged.max_turns,
          model: merged.model,
          headless_mode: merged.headless_mode,
          output_format: merged.output_format,
        }),
      });
      setSettings(data);
      setError(null);
      return data;
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to save settings'));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = async () => {
    try {
      setSaving(true);
      await fetchJson(`${API_BASE}/settings/claude/reset`, { method: 'POST' });
      await refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to reset settings'));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return { settings, loading, error, saving, refresh, updateSettings, resetSettings };
}

// Tags
export function useTags(repoId: number | null) {
  const [tags, setTags] = useState<Tag[]>([]);
  // Start with loading=true if we have a repoId
  const [loading, setLoading] = useState(repoId !== null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);
      const data = await fetchJson<{ tags: Tag[] }>(
        `${API_BASE}/repos/${repoId}/tags`,
        { signal }
      );
      setTags(data.tags);
      setError(null);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(getErrorMessage(e, 'Failed to fetch tags'));
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (!repoId) {
      setTags([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    refresh(controller.signal);

    return () => controller.abort();
  }, [repoId, refresh]);

  const createTag = async (name: string, color?: string) => {
    if (!repoId) return;
    const tag = await fetchJson<Tag>(`${API_BASE}/repos/${repoId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
    setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    return tag;
  };

  const updateTag = async (tagId: number, updates: { name?: string; color?: string }) => {
    if (!repoId) return;
    const tag = await fetchJson<Tag>(`${API_BASE}/repos/${repoId}/tags/${tagId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setTags((prev) => prev.map((t) => (t.id === tagId ? tag : t)));
    return tag;
  };

  const deleteTag = async (tagId: number) => {
    if (!repoId) return;
    await fetchJson(`${API_BASE}/repos/${repoId}/tags/${tagId}`, { method: 'DELETE' });
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  };

  return { tags, loading, error, refresh: () => refresh(), createTag, updateTag, deleteTag };
}

// Issue Tags (bulk loading for issue list)
export function useIssueTags(repoId: number | null) {
  const [issueTagsMap, setIssueTagsMap] = useState<IssueTagsMap>({});
  // Start with loading=true if we have a repoId
  const [loading, setLoading] = useState(repoId !== null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);
      const data = await fetchJson<{ issue_tags: IssueTagsMap }>(
        `${API_BASE}/repos/${repoId}/issue-tags`,
        { signal }
      );
      setIssueTagsMap(data.issue_tags);
    } catch (e) {
      if (isAbortError(e)) return;
      console.error('Failed to fetch issue tags:', e);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (!repoId) {
      setIssueTagsMap({});
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    refresh(controller.signal);

    return () => controller.abort();
  }, [repoId, refresh]);

  const addTagToIssue = async (issueNumber: number, tagId: number) => {
    if (!repoId) return;
    const data = await fetchJson<{ tags: Tag[] }>(
      `${API_BASE}/repos/${repoId}/issues/${issueNumber}/tags/${tagId}`,
      { method: 'POST' }
    );
    setIssueTagsMap((prev) => ({ ...prev, [issueNumber]: data.tags }));
  };

  const removeTagFromIssue = async (issueNumber: number, tagId: number) => {
    if (!repoId) return;
    const data = await fetchJson<{ tags: Tag[] }>(
      `${API_BASE}/repos/${repoId}/issues/${issueNumber}/tags/${tagId}`,
      { method: 'DELETE' }
    );
    setIssueTagsMap((prev) => ({ ...prev, [issueNumber]: data.tags }));
  };

  return { issueTagsMap, loading, refresh: () => refresh(), addTagToIssue, removeTagFromIssue };
}

// Issue Metadata (bulk loading for issue list - sidecar files written by Claude)
export function useIssueMetadata(repoId: number | null) {
  const [metadataMap, setMetadataMap] = useState<IssueMetadataMap>({});
  const [loading, setLoading] = useState(repoId !== null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);
      const data = await fetchJson<IssueMetadataMap>(
        `${API_BASE}/repos/${repoId}/issue-metadata`,
        { signal }
      );
      setMetadataMap(data);
    } catch (e) {
      if (isAbortError(e)) return;
      console.error('Failed to fetch issue metadata:', e);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (!repoId) {
      setMetadataMap({});
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    refresh(controller.signal);

    return () => controller.abort();
  }, [repoId, refresh]);

  const updateMetadata = async (issueNumber: number, update: Partial<IssueMetadata>) => {
    if (!repoId) return;
    const data = await fetchJson<IssueMetadata>(
      `${API_BASE}/repos/${repoId}/issues/${issueNumber}/metadata`,
      { method: 'PUT', body: JSON.stringify(update) }
    );
    setMetadataMap((prev) => ({ ...prev, [issueNumber]: data }));
    return data;
  };

  const deleteMetadata = async (issueNumber: number) => {
    if (!repoId) return;
    await fetchJson(
      `${API_BASE}/repos/${repoId}/issues/${issueNumber}/metadata`,
      { method: 'DELETE' }
    );
    setMetadataMap((prev) => {
      const next = { ...prev };
      delete next[issueNumber];
      return next;
    });
  };

  // Refresh a single issue's metadata (e.g., after clicking on it)
  const refreshSingle = useCallback(async (issueNumber: number) => {
    if (!repoId) return;
    try {
      const data = await fetchIssueMetadata(repoId, issueNumber);
      if (data) {
        setMetadataMap((prev) => ({ ...prev, [issueNumber]: data }));
      }
    } catch (e) {
      console.error('Failed to refresh issue metadata:', e);
    }
  }, [repoId]);

  return { metadataMap, loading, refresh: () => refresh(), updateMetadata, deleteMetadata, refreshSingle };
}

// Fetch single issue metadata
export async function fetchIssueMetadata(repoId: number, issueNumber: number): Promise<IssueMetadata | null> {
  try {
    return await fetchJson<IssueMetadata | null>(
      `${API_BASE}/repos/${repoId}/issues/${issueNumber}/metadata`
    );
  } catch {
    return null;
  }
}

// PR Metadata hook
export function usePRMetadata(repoId: number | null) {
  const [metadataMap, setMetadataMap] = useState<PRMetadataMap>({});
  const [loading, setLoading] = useState(repoId !== null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);
      const data = await fetchJson<PRMetadataMap>(
        `${API_BASE}/repos/${repoId}/pr-metadata`,
        { signal }
      );
      setMetadataMap(data);
    } catch (e) {
      if (isAbortError(e)) return;
      console.error('Failed to fetch PR metadata:', e);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (!repoId) {
      setMetadataMap({});
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    refresh(controller.signal);

    return () => controller.abort();
  }, [repoId, refresh]);

  // Refresh a single PR's metadata (e.g., after clicking on it)
  const refreshSingle = useCallback(async (prNumber: number) => {
    if (!repoId) return;
    try {
      const data = await fetchPRMetadata(repoId, prNumber);
      if (data) {
        setMetadataMap((prev) => ({ ...prev, [prNumber]: data }));
      }
    } catch (e) {
      console.error('Failed to refresh PR metadata:', e);
    }
  }, [repoId]);

  return { metadataMap, loading, refresh: () => refresh(), refreshSingle };
}

// Fetch single PR metadata
export async function fetchPRMetadata(repoId: number, prNumber: number): Promise<PRMetadata | null> {
  try {
    return await fetchJson<PRMetadata | null>(
      `${API_BASE}/repos/${repoId}/prs/${prNumber}/metadata`
    );
  } catch {
    return null;
  }
}

// Session Entity Management
export async function addEntityToSession(
  sessionId: string,
  kind: string,
  number: number
): Promise<EntityLink> {
  return fetchJson<EntityLink>(`${API_BASE}/sessions/${sessionId}/entities`, {
    method: 'POST',
    body: JSON.stringify({ kind, number }),
  });
}

export async function removeEntityFromSession(
  sessionId: string,
  entityIdx: number
): Promise<void> {
  await fetchJson(`${API_BASE}/sessions/${sessionId}/entities/${entityIdx}`, {
    method: 'DELETE',
  });
}

// Issue Actions
export async function closeIssue(repoId: number, issueNumber: number): Promise<void> {
  await fetchJson(`${API_BASE}/repos/${repoId}/issues/${issueNumber}/close`, {
    method: 'POST',
  });
}

export async function reopenIssue(repoId: number, issueNumber: number): Promise<void> {
  await fetchJson(`${API_BASE}/repos/${repoId}/issues/${issueNumber}/reopen`, {
    method: 'POST',
  });
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
}

export async function createIssue(repoId: number, params: CreateIssueParams): Promise<Issue> {
  return fetchJson<Issue>(`${API_BASE}/repos/${repoId}/issues`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// GitHub Labels
export async function fetchLabels(repoId: number, signal?: AbortSignal): Promise<GitHubLabel[]> {
  const data = await fetchJson<{ labels: GitHubLabel[] }>(
    `${API_BASE}/repos/${repoId}/labels`,
    { signal }
  );
  return data.labels;
}

export function useLabels(repoId: number | null) {
  const [labels, setLabels] = useState<GitHubLabel[]>([]);
  // Start with loading=true if we have a repoId
  const [loading, setLoading] = useState(repoId !== null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);
      const data = await fetchLabels(repoId, signal);
      setLabels(data);
      setError(null);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(getErrorMessage(e, 'Failed to fetch labels'));
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (!repoId) {
      setLabels([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    refresh(controller.signal);

    return () => controller.abort();
  }, [repoId, refresh]);

  return { labels, loading, error, refresh: () => refresh() };
}

// GitHub Assignees
export async function fetchAssignees(repoId: number, signal?: AbortSignal): Promise<string[]> {
  const data = await fetchJson<{ assignees: string[] }>(
    `${API_BASE}/repos/${repoId}/assignees`,
    { signal }
  );
  return data.assignees;
}

export function useAssignees(repoId: number | null) {
  const [assignees, setAssignees] = useState<string[]>([]);
  // Start with loading=true if we have a repoId
  const [loading, setLoading] = useState(repoId !== null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);
      const data = await fetchAssignees(repoId, signal);
      setAssignees(data);
      setError(null);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(getErrorMessage(e, 'Failed to fetch assignees'));
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (!repoId) {
      setAssignees([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    refresh(controller.signal);

    return () => controller.abort();
  }, [repoId, refresh]);

  return { assignees, loading, error, refresh: () => refresh() };
}

// Commands (slash commands from .claude/commands/)
export function useCommands(repoPath?: string | null) {
  const [commands, setCommands] = useState<CommandsResponse>({ issue: [], pr: [], general: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const params = repoPath ? `?repo_path=${encodeURIComponent(repoPath)}` : '';
      const data = await fetchJson<CommandsResponse>(`${API_BASE}/commands${params}`);
      setCommands(data);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to fetch commands'));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { commands, loading, error, refresh };
}

// Command CRUD operations
export async function createCommand(
  category: 'issue' | 'pr',
  command: { name: string; shortName: string; description: string; template: string },
  repoPath?: string
): Promise<CommandMetadata> {
  const params = repoPath ? `?repo_path=${encodeURIComponent(repoPath)}` : '';
  return fetchJson<CommandMetadata>(`${API_BASE}/commands/${category}${params}`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

export async function updateCommand(
  category: 'issue' | 'pr',
  commandId: string,
  command: { name: string; shortName: string; description: string; template: string },
  repoPath?: string
): Promise<CommandMetadata> {
  const params = repoPath ? `?repo_path=${encodeURIComponent(repoPath)}` : '';
  return fetchJson<CommandMetadata>(`${API_BASE}/commands/${category}/${commandId}${params}`, {
    method: 'PUT',
    body: JSON.stringify(command),
  });
}

export async function deleteCommand(
  category: 'issue' | 'pr',
  commandId: string,
  repoPath?: string
): Promise<void> {
  const params = repoPath ? `?repo_path=${encodeURIComponent(repoPath)}` : '';
  await fetchJson(`${API_BASE}/commands/${category}/${commandId}${params}`, {
    method: 'DELETE',
  });
}

// Build prompt from command template
export function buildPromptFromTemplate(
  template: string,
  context: Record<string, string | number | undefined>
): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value ?? ''));
  }
  return result;
}

// Session Export
export interface SessionExportResponse {
  content: string;
  filename: string;
  format: string;
}

export async function exportSession(
  sessionId: string,
  format: string = 'markdown'
): Promise<SessionExportResponse> {
  return fetchJson<SessionExportResponse>(
    `${API_BASE}/sessions/${sessionId}/export?format=${format}`
  );
}

/**
 * Get the MIME type based on file extension.
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'text/markdown;charset=utf-8';
    case 'json':
      return 'application/json;charset=utf-8';
    case 'txt':
      return 'text/plain;charset=utf-8';
    case 'html':
    case 'htm':
      return 'text/html;charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

// Utility to trigger download of exported content
export function downloadExport(content: string, filename: string): void {
  const mimeType = getMimeType(filename);
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Stats (Claude usage analytics)
export function useStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const data = await fetchJson<StatsResponse>(`${API_BASE}/stats`, { signal });
      setStats(data);
      setError(null);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(getErrorMessage(e, 'Failed to fetch stats'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { stats, loading, error, refresh: () => refresh() };
}

// CLI Management (Multi-CLI support)
export function useAvailableCLIs() {
  const [clis, setCLIs] = useState<CLIInfo[]>([]);
  const [defaultCLI, setDefaultCLI] = useState<CLIType>('claude');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<AvailableCLIsResponse>(`${API_BASE}/cli/available`);
      setCLIs(data.clis);
      setDefaultCLI(data.default_cli);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to fetch available CLIs'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Get installed CLIs only
  const installedCLIs = clis.filter(cli => cli.installed);

  return { clis, installedCLIs, defaultCLI, loading, error, refresh };
}

// Fetch CLI settings
export async function fetchCLISettings(): Promise<CLISettings> {
  return fetchJson<CLISettings>(`${API_BASE}/cli/settings`);
}

// Check if a specific CLI is installed
export async function checkCLIInstalled(cliType: CLIType): Promise<boolean> {
  const data = await fetchJson<{ cli_type: string; installed: boolean }>(
    `${API_BASE}/cli/${cliType}/installed`
  );
  return data.installed;
}
