import { Page } from '@playwright/test';
import type { Repo, Issue, PR, SessionSummary, ClaudeCodeSettings, CommandsResponse } from '../../src/types';

interface SessionListResponse {
  sessions: SessionSummary[];
  total: number;
}

interface SessionCountsResponse {
  counts: Array<{ repo_id: number; total: number; active: number }>;
}

/**
 * Mock all API endpoints with provided data.
 * Call this at the start of each test to set up a consistent state.
 */
export async function mockAllApis(
  page: Page,
  options: {
    repos?: Repo[];
    issues?: Issue[];
    prs?: PR[];
    sessions?: SessionSummary[];
    settings?: ClaudeCodeSettings;
    sessionCounts?: SessionCountsResponse;
    commands?: CommandsResponse;
  }
) {
  const {
    repos = [],
    issues = [],
    prs = [],
    sessions = [],
    settings,
    sessionCounts,
    commands,
  } = options;

  // Mock WebSocket endpoints
  await page.route('**/api/events', async (route) => {
    await route.fulfill({ status: 426, body: 'WebSocket not mocked' });
  });

  await page.route('**/api/hooks/ws', async (route) => {
    await route.fulfill({ status: 426, body: 'WebSocket not mocked' });
  });

  // Mock repos endpoint - /api/repos
  await page.route('**/api/repos', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(repos),
      });
    } else {
      await route.continue();
    }
  });

  // Mock issues endpoint - /api/repos/{id}/issues
  await page.route('**/api/repos/*/issues*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const url = new URL(route.request().url());
    const state = url.searchParams.get('state') || 'open';
    const filteredIssues = issues.filter(
      (i) => state === 'all' || i.state === state
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: filteredIssues,
        total: filteredIssues.length,
        page: 1,
        per_page: 30,
      }),
    });
  });

  // Mock PRs endpoint - /api/repos/{id}/prs
  await page.route('**/api/repos/*/prs*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const url = new URL(route.request().url());
    const state = url.searchParams.get('state') || 'open';
    const filteredPRs = prs.filter(
      (p) => state === 'all' || p.state === state
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: filteredPRs,
        total: filteredPRs.length,
        page: 1,
        per_page: 30,
      }),
    });
  });

  // Mock sessions endpoint - /api/sessions
  await page.route('**/api/sessions', async (route) => {
    if (route.request().method() === 'GET') {
      const response: SessionListResponse = {
        sessions,
        total: sessions.length,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    } else {
      await route.continue();
    }
  });

  // Mock session counts - /api/sessions/counts
  await page.route('**/api/sessions/counts*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionCounts || { counts: [] }),
    });
  });

  // Mock settings endpoint - /api/settings/claude
  await page.route('**/api/settings/claude', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settings || {
          permission_mode: 'default',
          allowed_tools: [],
          disallowed_tools: [],
          max_turns: 50,
          model: 'claude-sonnet-4-20250514',
          headless_mode: false,
          output_format: 'text',
          mcp_github: false,
          default_allowed_tools: ['Read', 'Write', 'Edit', 'Bash'],
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock commands endpoint - /api/commands
  await page.route('**/api/commands*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(commands || { issue: [], pr: [], general: [] }),
    });
  });

  // Mock processes endpoint - /api/processes
  await page.route('**/api/processes', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ processes: [] }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock tags endpoint - /api/repos/{id}/tags
  await page.route('**/api/repos/*/tags*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tags: [] }),
    });
  });

  // Mock issue tags endpoint - /api/repos/{id}/issue-tags
  await page.route('**/api/repos/*/issue-tags*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ issue_tags: {} }),
    });
  });

  // Mock stats endpoint - /api/stats
  await page.route('**/api/stats*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        last_computed_date: new Date().toISOString().split('T')[0],
        total_sessions: sessions.length,
        total_messages: sessions.reduce((sum, s) => sum + s.message_count, 0),
        daily_activity: [],
        daily_model_tokens: [],
        model_usage: [],
        hourly_distribution: [],
        week_stats: { date: '', message_count: 0, session_count: 0, tool_call_count: 0 },
        total_estimated_cost_usd: 0,
      }),
    });
  });

  // Mock schedules endpoint - /api/schedules
  await page.route('**/api/schedules*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Mock labels endpoint - /api/repos/{id}/labels
  await page.route('**/api/repos/*/labels*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ labels: [] }),
    });
  });
}

/**
 * Mock a specific issue detail endpoint.
 */
export async function mockIssueDetail(page: Page, repoId: number, issue: Issue & { comments?: Array<{ id: number; author: string; body: string; created_at: string }> }) {
  await page.route(`**/api/repos/${repoId}/issues/${issue.number}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...issue,
        comments: issue.comments || [],
      }),
    });
  });
}

/**
 * Mock a specific PR detail endpoint.
 */
export async function mockPRDetail(page: Page, repoId: number, pr: PR & { comments?: Array<{ id: number; author: string; body: string; created_at: string }> }) {
  await page.route(`**/api/repos/${repoId}/prs/${pr.number}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...pr,
        comments: pr.comments || [],
      }),
    });
  });
}

/**
 * Mock a specific session detail endpoint.
 */
export async function mockSessionDetail(page: Page, sessionId: string, detail: object) {
  await page.route(`**/api/sessions/${sessionId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(detail),
    });
  });
}
