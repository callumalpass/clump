import { useState, useEffect, useCallback } from 'react';
import type { Repo, Issue, IssueDetail, PR, Process, Session, SessionEntity, ClaudeCodeSettings, ProcessCreateOptions, Tag, IssueTagsMap, TranscriptResponse } from '../types';

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

  const addRepo = async (owner: string, name: string, localPath: string) => {
    const repo = await fetchJson<Repo>(`${API_BASE}/repos`, {
      method: 'POST',
      body: JSON.stringify({ owner, name, local_path: localPath }),
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

export interface IssueFilters {
  state?: 'open' | 'closed' | 'all';
  search?: string;
  labels?: string[];
  sort?: 'created' | 'updated' | 'comments';
  order?: 'asc' | 'desc';
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

  const fetchPage = useCallback(async (pageNum: number) => {
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
        `${API_BASE}/repos/${repoId}/issues?${params}`
      );
      setIssues(data.issues);
      setTotal(data.total);
      setPage(data.page);
      setError(null);
    } catch (e) {
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
    if (repoId) {
      setLoading(true);
      setPage(1);
      fetchPage(1);
    } else {
      // Clear issues and reset loading when no repo selected
      setIssues([]);
      setTotal(0);
      setLoading(false);
    }
  }, [repoId, state, search, JSON.stringify(labels), sort, order]);

  const totalPages = Math.ceil(total / perPage);

  return { issues, loading, error, refresh, page, totalPages, total, goToPage };
}

export async function fetchIssue(repoId: number, issueNumber: number): Promise<IssueDetail> {
  return fetchJson<IssueDetail>(`${API_BASE}/repos/${repoId}/issues/${issueNumber}`);
}

// PRs
export function usePRs(repoId: number | null, state: string = 'open') {
  const [prs, setPRs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!repoId) return;

    try {
      setLoading(true);
      const data = await fetchJson<PR[]>(
        `${API_BASE}/repos/${repoId}/prs?state=${state}`
      );
      setPRs(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch PRs');
    } finally {
      setLoading(false);
    }
  }, [repoId, state]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { prs, loading, error, refresh };
}

// Processes (PTY processes running Claude Code)
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

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
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

  return { processes, loading, refresh, createProcess, resumeProcess, killProcess, addProcess };
}

// Sessions
export type SessionStatusFilter = 'all' | 'running' | 'completed' | 'failed';

export function useSessions(repoId?: number, search?: string, statusFilter?: SessionStatusFilter) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (repoId) params.set('repo_id', repoId.toString());
      if (search) params.set('search', search);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);

      const data = await fetchJson<{ sessions: Session[]; total: number }>(
        `${API_BASE}/sessions?${params}`
      );
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    } finally {
      setLoading(false);
    }
  }, [repoId, search, statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const deleteSession = async (sessionId: number) => {
    await fetchJson(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setTotal((prev) => prev - 1);
  };

  const continueSession = async (sessionId: number): Promise<Process> => {
    const result = await fetchJson<Process>(
      `${API_BASE}/sessions/${sessionId}/continue`,
      { method: 'POST' }
    );
    // Update the session status to running in local state
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, status: 'running', process_id: result.id } : s
      )
    );
    return result;
  };

  return { sessions, total, loading, refresh, deleteSession, continueSession };
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!repoId) {
      setTags([]);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchJson<{ tags: Tag[] }>(`${API_BASE}/repos/${repoId}/tags`);
      setTags(data.tags);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch tags');
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  return { tags, loading, error, refresh, createTag, updateTag, deleteTag };
}

// Issue Tags (bulk loading for issue list)
export function useIssueTags(repoId: number | null) {
  const [issueTagsMap, setIssueTagsMap] = useState<IssueTagsMap>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!repoId) {
      setIssueTagsMap({});
      return;
    }

    try {
      setLoading(true);
      const data = await fetchJson<{ issue_tags: IssueTagsMap }>(`${API_BASE}/repos/${repoId}/issue-tags`);
      setIssueTagsMap(data.issue_tags);
    } catch (e) {
      console.error('Failed to fetch issue tags:', e);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  return { issueTagsMap, loading, refresh, addTagToIssue, removeTagFromIssue };
}

// Transcripts
export async function fetchTranscript(sessionId: number): Promise<TranscriptResponse> {
  return fetchJson<TranscriptResponse>(`${API_BASE}/sessions/${sessionId}/transcript`);
}

// Session Entity Management
export async function addEntityToSession(
  sessionId: number,
  kind: string,
  number: number
): Promise<SessionEntity> {
  return fetchJson<SessionEntity>(`${API_BASE}/sessions/${sessionId}/entities`, {
    method: 'POST',
    body: JSON.stringify({ kind, number }),
  });
}

export async function removeEntityFromSession(
  sessionId: number,
  entityId: number
): Promise<void> {
  await fetchJson(`${API_BASE}/sessions/${sessionId}/entities/${entityId}`, {
    method: 'DELETE',
  });
}
