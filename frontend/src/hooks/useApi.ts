import { useState, useEffect, useCallback } from 'react';
import type {
  Repo, Issue, IssueDetail, PR, PRDetail, Process,
  SessionSummary, SessionDetail, SessionListResponse, EntityLink,
  ClaudeCodeSettings, ProcessCreateOptions, Tag, IssueTagsMap, GitHubLabel,
  CommandsResponse, CommandMetadata, SubsessionDetail,
  RepoSessionCount, SessionCountsResponse, StatsResponse
} from '../types';

export interface EntityInput {
  kind: string;  // "issue" or "pr"
  number: number;
}

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
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
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
      setError(e instanceof Error ? e.message : 'Failed to fetch repos');
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
interface IssueListResponse {
  issues: Issue[];
  total: number;
  page: number;
  per_page: number;
}

export type SessionStatusFilter = 'all' | 'analyzed' | 'unanalyzed';

export interface IssueFilters {
  state?: 'open' | 'closed' | 'all';
  search?: string;
  labels?: string[];
  sort?: 'created' | 'updated' | 'comments';
  order?: 'asc' | 'desc';
  sessionStatus?: SessionStatusFilter;  // Client-side filter for issues with/without sessions
}

export function useIssues(repoId: number | null, filters: IssueFilters = {}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(30);
  // Start with loading=true if we have a repoId to prevent "No issues found" flash
  const [loading, setLoading] = useState(repoId !== null);
  const [error, setError] = useState<string | null>(null);

  // Extract filter values with defaults
  const { state = 'open', search, labels, sort = 'created', order = 'desc' } = filters;

  // Stable reference for labels to avoid re-renders from array reference changes
  const labelsKey = labels?.join(',') ?? '';

  const fetchPage = useCallback(async (pageNum: number, signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);

      // Build query params
      const params = new URLSearchParams();
      params.set('state', state);
      params.set('sort', sort);
      params.set('order', order);
      params.set('page', pageNum.toString());
      params.set('per_page', perPage.toString());

      if (search) {
        params.set('search', search);
      }
      if (labels && labels.length > 0) {
        labels.forEach(label => params.append('labels', label));
      }

      const data = await fetchJson<IssueListResponse>(
        `${API_BASE}/repos/${repoId}/issues?${params}`,
        { signal }
      );
      setIssues(data.issues ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page);
      setError(null);
    } catch (e) {
      // Ignore abort errors
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  }, [repoId, state, search, labels, sort, order, perPage]);

  const refresh = useCallback(() => fetchPage(page), [fetchPage, page]);

  const goToPage = useCallback((pageNum: number) => {
    setPage(pageNum);
    fetchPage(pageNum);
  }, [fetchPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (!repoId) {
      // Clear issues and reset loading when no repo selected
      setIssues([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setPage(1);
    fetchPage(1, controller.signal);

    return () => controller.abort();
  }, [repoId, state, search, labelsKey, sort, order]);

  const totalPages = Math.ceil(total / perPage);

  return { issues, loading, error, refresh, page, totalPages, total, goToPage };
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

interface PRListResponse {
  prs: PR[];
  total: number;
  page: number;
  per_page: number;
}

export function usePRs(repoId: number | null, filters: PRFilters = {}) {
  const [prs, setPRs] = useState<PR[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(30);
  // Start with loading=true if we have a repoId to prevent "No PRs" flash
  const [loading, setLoading] = useState(repoId !== null);
  const [error, setError] = useState<string | null>(null);

  // Extract filter values with defaults
  const { state = 'open', search, sort = 'created', order = 'desc' } = filters;

  const fetchPage = useCallback(async (pageNum: number, signal?: AbortSignal) => {
    if (!repoId) return;

    try {
      setLoading(true);

      // Build query params
      const params = new URLSearchParams();
      params.set('state', state);
      params.set('sort', sort);
      params.set('order', order);
      params.set('page', pageNum.toString());
      params.set('per_page', perPage.toString());

      if (search) {
        params.set('search', search);
      }

      const data = await fetchJson<PRListResponse>(
        `${API_BASE}/repos/${repoId}/prs?${params}`,
        { signal }
      );
      setPRs(data.prs ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page);
      setError(null);
    } catch (e) {
      // Ignore abort errors
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to fetch PRs');
    } finally {
      setLoading(false);
    }
  }, [repoId, state, search, sort, order, perPage]);

  const refresh = useCallback(() => fetchPage(page), [fetchPage, page]);

  const goToPage = useCallback((pageNum: number) => {
    setPage(pageNum);
    fetchPage(pageNum);
  }, [fetchPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (!repoId) {
      // Clear PRs and reset loading when no repo selected
      setPRs([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setPage(1);
    fetchPage(1, controller.signal);

    return () => controller.abort();
  }, [repoId, state, search, sort, order]);

  const totalPages = Math.ceil(total / perPage);

  return { prs, loading, error, refresh, page, totalPages, total, goToPage };
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
        // Claude Code options
        permission_mode: options?.permission_mode,
        allowed_tools: options?.allowed_tools,
        disallowed_tools: options?.disallowed_tools,
        max_turns: options?.max_turns,
        model: options?.model,
        resume_session: options?.resume_session,
      }),
    });
    setProcesses((prev) => [...prev, process]);
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
export interface SessionFilters {
  repoPath?: string;
  starred?: boolean;
  hasEntities?: boolean;
  search?: string;
  isActive?: boolean;
  sort?: 'created' | 'updated' | 'messages';
  order?: 'asc' | 'desc';
}

export function useSessions(filters: SessionFilters = {}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(30);
  const [loading, setLoading] = useState(true);

  const { repoPath, starred, hasEntities, search, isActive, sort, order } = filters;

  // Internal fetch that optionally shows loading state
  const fetchPage = useCallback(async (pageNum: number, showLoading: boolean) => {
    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams();
      if (repoPath) params.set('repo_path', repoPath);
      if (starred !== undefined) params.set('starred', starred.toString());
      if (hasEntities !== undefined) params.set('has_entities', hasEntities.toString());
      if (isActive !== undefined) params.set('is_active', isActive.toString());
      if (search) params.set('search', search);
      if (sort) params.set('sort', sort);
      if (order) params.set('order', order);
      params.set('limit', perPage.toString());
      params.set('offset', ((pageNum - 1) * perPage).toString());

      const data = await fetchJson<SessionListResponse>(
        `${API_BASE}/sessions?${params}`
      );
      setSessions(data.sessions);
      setTotal(data.total);
      setPage(pageNum);
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [repoPath, starred, hasEntities, search, isActive, sort, order, perPage]);

  // Public refresh - silent by default for polling
  const refresh = useCallback(() => fetchPage(page, false), [fetchPage, page]);

  const goToPage = useCallback((pageNum: number) => {
    fetchPage(pageNum, true);
  }, [fetchPage]);

  // Initial load and when filters change - reset to page 1
  useEffect(() => {
    setPage(1);
    fetchPage(1, true);
  // fetchPage captures all filter values, so we just need it as a dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage]);

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

  const totalPages = Math.ceil(total / perPage);

  return { sessions, total, loading, refresh, continueSession, deleteSession, updateSessionMetadata, page, totalPages, goToPage };
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
      setError(e instanceof Error ? e.message : 'Failed to fetch settings');
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
          mcp_github: merged.mcp_github,
        }),
      });
      setSettings(data);
      setError(null);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
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
      setError(e instanceof Error ? e.message : 'Failed to reset settings');
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
      // Ignore abort errors
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to fetch tags');
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
      // Ignore abort errors
      if (e instanceof Error && e.name === 'AbortError') return;
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
      // Ignore abort errors
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to fetch labels');
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
      // Ignore abort errors
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to fetch assignees');
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
      setError(e instanceof Error ? e.message : 'Failed to fetch commands');
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
      // Ignore abort errors
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to fetch stats');
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
