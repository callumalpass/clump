import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  buildPromptFromTemplate,
  useRepos,
  useIssues,
  usePRs,
  useProcesses,
  useSessions,
  useClaudeSettings,
  useTags,
  useIssueTags,
  useLabels,
  useAssignees,
  useCommands,
  getMimeType,
  downloadExport,
} from './useApi';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse<T>(data: T, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => createMockResponse(data, ok, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(data)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('buildPromptFromTemplate', () => {
  it('replaces single placeholder', () => {
    const template = 'Fix issue #{{number}}';
    const result = buildPromptFromTemplate(template, { number: 42 });
    expect(result).toBe('Fix issue #42');
  });

  it('replaces multiple different placeholders', () => {
    const template = 'Issue {{number}}: {{title}}';
    const result = buildPromptFromTemplate(template, { number: 123, title: 'Bug fix' });
    expect(result).toBe('Issue 123: Bug fix');
  });

  it('replaces same placeholder multiple times', () => {
    const template = '{{name}} is {{name}}';
    const result = buildPromptFromTemplate(template, { name: 'test' });
    expect(result).toBe('test is test');
  });

  it('handles undefined values by converting to empty string', () => {
    const template = 'Value: {{missing}}';
    const result = buildPromptFromTemplate(template, { missing: undefined });
    expect(result).toBe('Value: ');
  });

  it('handles empty context object', () => {
    const template = 'No placeholders here';
    const result = buildPromptFromTemplate(template, {});
    expect(result).toBe('No placeholders here');
  });

  it('leaves unmatched placeholders unchanged', () => {
    const template = '{{found}} and {{notfound}}';
    const result = buildPromptFromTemplate(template, { found: 'yes' });
    expect(result).toBe('yes and {{notfound}}');
  });

  it('handles numeric values', () => {
    const template = 'Count: {{count}}, Price: {{price}}';
    const result = buildPromptFromTemplate(template, { count: 5, price: 19.99 });
    expect(result).toBe('Count: 5, Price: 19.99');
  });

  it('handles empty string values', () => {
    const template = 'Name: {{name}}';
    const result = buildPromptFromTemplate(template, { name: '' });
    expect(result).toBe('Name: ');
  });
});

describe('useRepos', () => {
  it('fetches repos on mount', async () => {
    const mockRepos = [{ id: 1, local_path: '/path/to/repo', name: 'repo' }];
    mockFetch.mockResolvedValueOnce(createMockResponse(mockRepos));

    const { result } = renderHook(() => useRepos());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.repos).toEqual(mockRepos);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith('/api/repos', expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 500));

    const { result } = renderHook(() => useRepos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('HTTP 500: Error');
    expect(result.current.repos).toEqual([]);
  });

  it('adds repo optimistically', async () => {
    const mockRepos = [{ id: 1, local_path: '/path/to/repo', name: 'repo' }];
    const newRepo = { id: 2, local_path: '/new/repo', name: 'new-repo' };

    mockFetch
      .mockResolvedValueOnce(createMockResponse(mockRepos))
      .mockResolvedValueOnce(createMockResponse(newRepo));

    const { result } = renderHook(() => useRepos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.addRepo('/new/repo');
    });

    expect(result.current.repos).toEqual([...mockRepos, newRepo]);
  });

  it('deletes repo from state', async () => {
    const mockRepos = [
      { id: 1, local_path: '/path/1', name: 'repo1' },
      { id: 2, local_path: '/path/2', name: 'repo2' },
    ];

    mockFetch
      .mockResolvedValueOnce(createMockResponse(mockRepos))
      .mockResolvedValueOnce(createMockResponse({}));

    const { result } = renderHook(() => useRepos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteRepo(1);
    });

    expect(result.current.repos).toEqual([{ id: 2, local_path: '/path/2', name: 'repo2' }]);
  });
});

describe('useIssues', () => {
  it('does not fetch when repoId is null', async () => {
    const { result } = renderHook(() => useIssues(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.issues).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches issues when repoId is provided', async () => {
    const mockResponse = {
      issues: [{ number: 1, title: 'Test Issue', state: 'open' }],
      total: 1,
      page: 1,
      per_page: 30,
    };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

    const { result } = renderHook(() => useIssues(1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.issues).toEqual(mockResponse.issues);
    expect(result.current.total).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/repos/1/issues'),
      expect.any(Object)
    );
  });

  it('includes filter parameters in request', async () => {
    const mockResponse = { issues: [], total: 0, page: 1, per_page: 30 };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

    const filters = {
      state: 'closed' as const,
      search: 'bug',
      labels: ['urgent', 'critical'],
      sort: 'updated' as const,
      order: 'asc' as const,
    };

    renderHook(() => useIssues(1, filters));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('state=closed');
    expect(calledUrl).toContain('search=bug');
    expect(calledUrl).toContain('sort=updated');
    expect(calledUrl).toContain('order=asc');
    expect(calledUrl).toContain('labels=urgent');
    expect(calledUrl).toContain('labels=critical');
  });

  it('clears issues when repoId changes to null', async () => {
    const mockResponse = {
      issues: [{ number: 1, title: 'Test Issue', state: 'open' }],
      total: 1,
      page: 1,
      per_page: 30,
    };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

    const { result, rerender } = renderHook(
      ({ repoId }) => useIssues(repoId),
      { initialProps: { repoId: 1 as number | null } }
    );

    await waitFor(() => {
      expect(result.current.issues.length).toBe(1);
    });

    rerender({ repoId: null });

    expect(result.current.issues).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe('usePRs', () => {
  it('does not fetch when repoId is null', async () => {
    const { result } = renderHook(() => usePRs(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.prs).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches PRs with state parameter', async () => {
    const mockPRs = [{ number: 1, title: 'Test PR', state: 'open' }];
    mockFetch.mockResolvedValueOnce(createMockResponse(mockPRs));

    const { result } = renderHook(() => usePRs(1, { state: 'closed' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // URL includes additional default params (sort, order, page, per_page)
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/repos/1/prs');
    expect(calledUrl).toContain('state=closed');
  });
});

describe('useProcesses', () => {
  it('fetches processes on mount', async () => {
    const mockProcesses = {
      processes: [{ id: 'proc-1', repo_id: 1, status: 'running' }],
    };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockProcesses));

    const { result } = renderHook(() => useProcesses());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.processes).toEqual(mockProcesses.processes);
  });

  it('creates process with all options', async () => {
    const mockProcesses = { processes: [] };
    const newProcess = { id: 'proc-new', repo_id: 1, status: 'starting' };

    mockFetch
      .mockResolvedValueOnce(createMockResponse(mockProcesses))
      .mockResolvedValueOnce(createMockResponse(newProcess));

    const { result } = renderHook(() => useProcesses());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createProcess(
        1,
        'Test prompt',
        'issue',
        [{ kind: 'issue', number: 42 }],
        'Test Session',
        { permission_mode: 'default', model: 'claude-3-5-sonnet' }
      );
    });

    expect(mockFetch).toHaveBeenLastCalledWith('/api/processes', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"repo_id":1'),
    }));
  });

  it('kills process and removes from state', async () => {
    const mockProcesses = {
      processes: [
        { id: 'proc-1', repo_id: 1, status: 'running' },
        { id: 'proc-2', repo_id: 1, status: 'running' },
      ],
    };

    mockFetch
      .mockResolvedValueOnce(createMockResponse(mockProcesses))
      .mockResolvedValueOnce(createMockResponse({}));

    const { result } = renderHook(() => useProcesses());

    await waitFor(() => {
      expect(result.current.processes.length).toBe(2);
    });

    await act(async () => {
      await result.current.killProcess('proc-1');
    });

    expect(result.current.processes).toEqual([{ id: 'proc-2', repo_id: 1, status: 'running' }]);
  });
});

describe('useSessions', () => {
  it('fetches sessions on mount', async () => {
    const mockResponse = {
      sessions: [{ session_id: 'sess-1', title: 'Test Session' }],
      total: 1,
    };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sessions).toEqual(mockResponse.sessions);
    expect(result.current.total).toBe(1);
  });

  it('includes filter parameters', async () => {
    const mockResponse = { sessions: [], total: 0 };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

    const filters = {
      repoPath: '/path/to/repo',
      starred: true,
      hasEntities: true,
      search: 'test',
    };

    renderHook(() => useSessions(filters));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('repo_path=%2Fpath%2Fto%2Frepo');
    expect(calledUrl).toContain('starred=true');
    expect(calledUrl).toContain('has_entities=true');
    expect(calledUrl).toContain('search=test');
  });
});

describe('useClaudeSettings', () => {
  it('fetches settings on mount', async () => {
    const mockSettings = {
      permission_mode: 'default',
      model: 'claude-3-5-sonnet',
      max_turns: 10,
    };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockSettings));

    const { result } = renderHook(() => useClaudeSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings).toEqual(mockSettings);
    expect(result.current.error).toBeNull();
  });

  it('updates settings', async () => {
    const initialSettings = { permission_mode: 'default', model: 'claude-3-5-sonnet' };
    const updatedSettings = { permission_mode: 'plan', model: 'claude-3-5-sonnet' };

    mockFetch
      .mockResolvedValueOnce(createMockResponse(initialSettings))
      .mockResolvedValueOnce(createMockResponse(updatedSettings));

    const { result } = renderHook(() => useClaudeSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateSettings({ permission_mode: 'plan' });
    });

    expect(result.current.settings?.permission_mode).toBe('plan');
  });
});

describe('useTags', () => {
  it('does not fetch when repoId is null', async () => {
    const { result } = renderHook(() => useTags(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.tags).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches tags when repoId is provided', async () => {
    const mockTags = { tags: [{ id: 1, name: 'bug', color: '#ff0000' }] };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockTags));

    const { result } = renderHook(() => useTags(1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tags).toEqual(mockTags.tags);
  });

  it('creates tag and sorts alphabetically', async () => {
    const existingTags = { tags: [{ id: 1, name: 'zebra', color: '#000000' }] };
    const newTag = { id: 2, name: 'alpha', color: '#ffffff' };

    mockFetch
      .mockResolvedValueOnce(createMockResponse(existingTags))
      .mockResolvedValueOnce(createMockResponse(newTag));

    const { result } = renderHook(() => useTags(1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createTag('alpha', '#ffffff');
    });

    expect(result.current.tags[0].name).toBe('alpha');
    expect(result.current.tags[1].name).toBe('zebra');
  });
});

describe('useIssueTags', () => {
  it('does not fetch when repoId is null', async () => {
    const { result } = renderHook(() => useIssueTags(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.issueTagsMap).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches issue tags map', async () => {
    const mockData = {
      issue_tags: {
        1: [{ id: 1, name: 'bug' }],
        2: [{ id: 2, name: 'feature' }],
      },
    };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockData));

    const { result } = renderHook(() => useIssueTags(1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.issueTagsMap).toEqual(mockData.issue_tags);
  });
});

describe('useLabels', () => {
  it('does not fetch when repoId is null', async () => {
    const { result } = renderHook(() => useLabels(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.labels).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches labels when repoId is provided', async () => {
    const mockLabels = { labels: [{ name: 'bug', color: 'ff0000' }] };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockLabels));

    const { result } = renderHook(() => useLabels(1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.labels).toEqual(mockLabels.labels);
  });
});

describe('useAssignees', () => {
  it('does not fetch when repoId is null', async () => {
    const { result } = renderHook(() => useAssignees(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.assignees).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches assignees when repoId is provided', async () => {
    const mockAssignees = { assignees: ['user1', 'user2'] };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockAssignees));

    const { result } = renderHook(() => useAssignees(1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.assignees).toEqual(['user1', 'user2']);
  });
});

describe('useCommands', () => {
  it('fetches commands on mount', async () => {
    const mockCommands = {
      issue: [{ id: 'cmd-1', name: 'Fix Issue', shortName: 'fix' }],
      pr: [{ id: 'cmd-2', name: 'Review PR', shortName: 'review' }],
    };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockCommands));

    const { result } = renderHook(() => useCommands());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.commands).toEqual(mockCommands);
  });

  it('includes repoPath in request when provided', async () => {
    const mockCommands = { issue: [], pr: [] };
    mockFetch.mockResolvedValueOnce(createMockResponse(mockCommands));

    renderHook(() => useCommands('/path/to/repo'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('repo_path=%2Fpath%2Fto%2Frepo');
  });
});

describe('getMimeType', () => {
  describe('markdown files', () => {
    it('returns correct MIME type for .md extension', () => {
      expect(getMimeType('session.md')).toBe('text/markdown;charset=utf-8');
    });

    it('returns correct MIME type for .markdown extension', () => {
      expect(getMimeType('document.markdown')).toBe('text/markdown;charset=utf-8');
    });

    it('handles uppercase extensions', () => {
      expect(getMimeType('README.MD')).toBe('text/markdown;charset=utf-8');
    });
  });

  describe('json files', () => {
    it('returns correct MIME type for .json extension', () => {
      expect(getMimeType('data.json')).toBe('application/json;charset=utf-8');
    });

    it('handles uppercase JSON extension', () => {
      expect(getMimeType('config.JSON')).toBe('application/json;charset=utf-8');
    });
  });

  describe('text files', () => {
    it('returns correct MIME type for .txt extension', () => {
      expect(getMimeType('notes.txt')).toBe('text/plain;charset=utf-8');
    });

    it('handles uppercase TXT extension', () => {
      expect(getMimeType('LOG.TXT')).toBe('text/plain;charset=utf-8');
    });
  });

  describe('HTML files', () => {
    it('returns correct MIME type for .html extension', () => {
      expect(getMimeType('page.html')).toBe('text/html;charset=utf-8');
    });

    it('returns correct MIME type for .htm extension', () => {
      expect(getMimeType('index.htm')).toBe('text/html;charset=utf-8');
    });

    it('handles uppercase HTML extensions', () => {
      expect(getMimeType('PAGE.HTML')).toBe('text/html;charset=utf-8');
      expect(getMimeType('INDEX.HTM')).toBe('text/html;charset=utf-8');
    });
  });

  describe('unknown/fallback', () => {
    it('returns octet-stream for unknown extensions', () => {
      expect(getMimeType('file.xyz')).toBe('application/octet-stream');
      expect(getMimeType('data.bin')).toBe('application/octet-stream');
    });

    it('returns octet-stream for files without extension', () => {
      expect(getMimeType('Makefile')).toBe('application/octet-stream');
    });

    it('handles empty filename', () => {
      expect(getMimeType('')).toBe('application/octet-stream');
    });

    it('handles filename with only extension', () => {
      expect(getMimeType('.gitignore')).toBe('application/octet-stream');
    });
  });

  describe('edge cases', () => {
    it('handles multiple dots in filename', () => {
      expect(getMimeType('session.2024.01.15.md')).toBe('text/markdown;charset=utf-8');
      expect(getMimeType('data.backup.json')).toBe('application/json;charset=utf-8');
    });

    it('handles paths with directories', () => {
      expect(getMimeType('/path/to/file.md')).toBe('text/markdown;charset=utf-8');
      expect(getMimeType('folder/subfolder/data.json')).toBe('application/json;charset=utf-8');
    });
  });
});

describe('downloadExport', () => {
  // Mock DOM APIs
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let mockAppendChild: ReturnType<typeof vi.fn>;
  let mockRemoveChild: ReturnType<typeof vi.fn>;
  let mockClick: ReturnType<typeof vi.fn>;
  let mockLink: HTMLAnchorElement;

  beforeEach(() => {
    // Mock URL methods
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    // Mock DOM methods
    mockClick = vi.fn();
    mockLink = {
      href: '',
      download: '',
      click: mockClick,
    } as unknown as HTMLAnchorElement;

    vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
    mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink);
    mockRemoveChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates blob with correct MIME type for markdown files', () => {
    downloadExport('# Hello World', 'document.md');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/markdown;charset=utf-8');
  });

  it('creates blob with correct MIME type for JSON files', () => {
    downloadExport('{"key": "value"}', 'data.json');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json;charset=utf-8');
  });

  it('creates blob with correct MIME type for text files', () => {
    downloadExport('plain text content', 'notes.txt');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/plain;charset=utf-8');
  });

  it('creates blob with correct MIME type for HTML files', () => {
    downloadExport('<html><body>Hello</body></html>', 'page.html');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/html;charset=utf-8');
  });

  it('sets the correct download filename', () => {
    downloadExport('content', 'my-session.md');

    expect(mockLink.download).toBe('my-session.md');
  });

  it('sets the blob URL as href', () => {
    downloadExport('content', 'file.md');

    expect(mockLink.href).toBe('blob:mock-url');
  });

  it('triggers click on the link', () => {
    downloadExport('content', 'file.md');

    expect(mockClick).toHaveBeenCalled();
  });

  it('appends link to body before clicking', () => {
    downloadExport('content', 'file.md');

    expect(mockAppendChild).toHaveBeenCalledWith(mockLink);
  });

  it('removes link from body after clicking', () => {
    downloadExport('content', 'file.md');

    expect(mockRemoveChild).toHaveBeenCalledWith(mockLink);
  });

  it('revokes the object URL after download', () => {
    downloadExport('content', 'file.md');

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('handles empty content', () => {
    downloadExport('', 'empty.md');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });

  it('handles content with special characters', () => {
    const specialContent = '# Title\n\nContent with "quotes" and <tags>';
    downloadExport(specialContent, 'special.md');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });

  it('handles unicode content', () => {
    const unicodeContent = '# 日本語タイトル\n\nEmoji: 🚀 ✨';
    downloadExport(unicodeContent, 'unicode.md');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });
});
