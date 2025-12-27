import { useState, useEffect, useCallback } from 'react';
import type { Repo, Issue, IssueDetail, PR, Session, Analysis } from '../types';

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

export function useIssues(repoId: number | null, state: string = 'open') {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (pageNum: number) => {
    if (!repoId) return;

    try {
      setLoading(true);
      const data = await fetchJson<IssueListResponse>(
        `${API_BASE}/repos/${repoId}/issues?state=${state}&page=${pageNum}&per_page=${perPage}`
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
  }, [repoId, state, perPage]);

  const refresh = useCallback(() => fetchPage(page), [fetchPage, page]);

  const goToPage = useCallback((pageNum: number) => {
    setPage(pageNum);
    fetchPage(pageNum);
  }, [fetchPage]);

  useEffect(() => {
    setPage(1);
    fetchPage(1);
  }, [repoId, state]);

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

// Sessions
export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<{ sessions: Session[] }>(`${API_BASE}/sessions`);
      setSessions(data.sessions);
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const createSession = async (
    repoId: number,
    prompt?: string,
    analysisType: string = 'custom',
    entityId?: string,
    title: string = 'New Analysis'
  ) => {
    const session = await fetchJson<Session>(`${API_BASE}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        repo_id: repoId,
        prompt,
        analysis_type: analysisType,
        entity_id: entityId,
        title,
      }),
    });
    setSessions((prev) => [...prev, session]);
    return session;
  };

  const killSession = async (sessionId: string) => {
    await fetchJson(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  return { sessions, loading, refresh, createSession, killSession };
}

// Analyses
export function useAnalyses(repoId?: number, search?: string) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (repoId) params.set('repo_id', repoId.toString());
      if (search) params.set('search', search);

      const data = await fetchJson<{ analyses: Analysis[]; total: number }>(
        `${API_BASE}/analyses?${params}`
      );
      setAnalyses(data.analyses);
      setTotal(data.total);
    } catch (e) {
      console.error('Failed to fetch analyses:', e);
    } finally {
      setLoading(false);
    }
  }, [repoId, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { analyses, total, loading, refresh };
}
