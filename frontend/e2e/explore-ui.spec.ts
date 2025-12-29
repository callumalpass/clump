import { test, expect, Page } from '@playwright/test';
import { mockAllApis, mockIssueDetail, mockPRDetail, mockSessionDetail } from './fixtures/api-mocks';
import { mockRepos, mockIssues, mockPRs, mockSessions, mockSettings, mockSessionCounts, mockCommands } from './fixtures/test-data';

const SCREENSHOT_DIR = 'e2e/screenshots';

/**
 * Helper to take screenshots with consistent naming
 */
async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: false,
  });
}

/**
 * Helper to wait for animations to complete
 */
async function waitForAnimations(page: Page) {
  await page.waitForTimeout(300);
}

/**
 * Helper to select a repository and wait for it to be ready
 */
async function selectRepo(page: Page, repoName: string = 'acme/webapp') {
  const repoSelector = page.getByRole('button', { name: /select repository/i });
  await repoSelector.click();
  await page.getByText(repoName).click();
  // Wait for repo to be selected and data to load
  await expect(page.locator('button', { hasText: repoName }).first()).toBeVisible({ timeout: 10000 });
  await waitForAnimations(page);
}

test.describe('UI Exploration - App States', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('initial state - no repo selected', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);
    await screenshot(page, '01-initial-no-repo');

    // Verify empty state message
    await expect(page.getByText('Select a repository')).toBeVisible();
  });

  test('repo selected - issues tab', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    await screenshot(page, '02-repo-selected-issues');

    // Verify issues tab is selected and controls are visible
    await expect(page.getByRole('tab', { name: /Issues/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByPlaceholder(/search issues/i)).toBeVisible();
  });

  test('issues tab - with selected issue', async ({ page }) => {
    // Mock issue detail
    await mockIssueDetail(page, 1, {
      ...mockIssues[0],
      comments: [
        {
          id: 1,
          author: 'testuser',
          body: 'This would be a great feature!',
          created_at: '2024-01-16T10:00:00Z',
        },
      ],
    });

    await page.goto('/');
    await selectRepo(page);

    // Wait for issues to load then select one (if available)
    const issueItem = page.locator('[class*="list-item"]').first();
    if (await issueItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await issueItem.click();
      await waitForAnimations(page);
    }

    await screenshot(page, '03-issue-selected');
  });

  test('PRs tab - list view', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Click PRs tab
    await page.getByRole('tab', { name: /PRs/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '04-prs-tab');

    // Verify PRs tab is selected
    await expect(page.getByRole('tab', { name: /PRs/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('PRs tab - with selected PR', async ({ page }) => {
    // Mock PR detail
    await mockPRDetail(page, 1, {
      ...mockPRs[0],
      comments: [
        {
          id: 1,
          author: 'reviewer',
          body: 'LGTM! Just a few minor suggestions.',
          created_at: '2024-01-17T08:00:00Z',
        },
      ],
    });

    await page.goto('/');
    await selectRepo(page);

    // Click PRs tab
    await page.getByRole('tab', { name: /PRs/i }).click();
    await waitForAnimations(page);

    // Select a PR (if available)
    const prItem = page.locator('[class*="list-item"]').first();
    if (await prItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await prItem.click();
      await waitForAnimations(page);
    }

    await screenshot(page, '05-pr-selected');
  });

  test('History tab - session list', async ({ page }) => {
    await page.goto('/');

    // History tab should be accessible without repo selection
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '06-history-tab');

    // Verify History tab is selected
    await expect(page.getByRole('tab', { name: /History/i })).toHaveAttribute('aria-selected', 'true');
    // Verify search placeholder is visible
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('History tab - session with active badge', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Look for any sessions in the list
    await screenshot(page, '07-history-active-session');

    // Verify we're on History tab
    await expect(page.getByRole('tab', { name: /History/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('Schedules tab', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Click Schedules tab
    await page.getByRole('tab', { name: /Schedules/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '08-schedules-tab');
  });
});

test.describe('UI Exploration - Modals', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('settings modal', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);

    // Open settings via the gear icon button
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    await screenshot(page, '09-settings-modal');

    // Verify settings modal is open (check for Settings heading)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('keyboard shortcuts modal', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);

    // Open keyboard shortcuts
    await page.getByRole('button', { name: /help/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '10-keyboard-shortcuts-modal');
  });

  test('stats modal', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);

    // Click on stats in header (if visible)
    const statsButton = page.locator('button', { hasText: /msgs today/i });
    if (await statsButton.isVisible()) {
      await statsButton.click();
      await waitForAnimations(page);
      await screenshot(page, '11-stats-modal');
    }
  });
});

test.describe('UI Exploration - Interactive States', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('repo selector dropdown open', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);

    // Open repo dropdown
    await page.getByRole('button', { name: /select repository/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '12-repo-dropdown-open');
  });

  test('issue hover state', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Hover over any list item
    const listItem = page.locator('[class*="list-item"]').first();
    if (await listItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await listItem.hover();
      await waitForAnimations(page);
    }

    await screenshot(page, '13-issue-hover');
  });

  test('tab navigation states', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Hover over PRs tab
    const prsTab = page.getByRole('tab', { name: /PRs/i });
    await prsTab.hover();
    await waitForAnimations(page);

    await screenshot(page, '14-tab-hover');
  });

  test('command palette', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);

    // Open command palette with keyboard
    await page.keyboard.press('Control+k');
    await waitForAnimations(page);

    await screenshot(page, '15-command-palette');

    // Verify command palette is open (check for the input placeholder)
    await expect(page.getByPlaceholder(/type a command/i)).toBeVisible();
  });
});

test.describe('UI Exploration - Viewport Sizes', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('narrow viewport (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/');
    await selectRepo(page);

    await screenshot(page, '16-viewport-768');
  });

  test('wide viewport (1920px)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await selectRepo(page);

    await screenshot(page, '17-viewport-1920');
  });

  test('tall viewport (1200px height)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto('/');
    await selectRepo(page);

    await screenshot(page, '18-viewport-tall');
  });
});

test.describe('UI Exploration - Error States', () => {
  test('API error on issues fetch', async ({ page }) => {
    // Mock other endpoints first
    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
    });

    // Override the issues route with an error
    await page.route('**/api/repos/*/issues*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/');
    await selectRepo(page);

    // Wait a bit for error state to appear
    await page.waitForTimeout(500);

    await screenshot(page, '19-error-issues-fetch');
  });

  test('empty issues list', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: [], // Empty issues
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await selectRepo(page);

    await screenshot(page, '20-empty-issues');
  });

  test('empty sessions list', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: [], // Empty sessions
      settings: mockSettings,
      sessionCounts: { counts: [] },
      commands: mockCommands,
    });

    await page.goto('/');

    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '21-empty-sessions');
  });
});

test.describe('UI Exploration - Filter States', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('issues - closed state filter', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Click the Closed filter button
    const closedButton = page.getByRole('button', { name: /closed/i });
    if (await closedButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closedButton.click();
      await waitForAnimations(page);
    }

    await screenshot(page, '22-issues-closed-filter');
  });

  test('sessions - starred filter', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Look for filter controls (category dropdown or buttons)
    await screenshot(page, '23-sessions-starred-filter');
  });
});

test.describe('UI Exploration - Session Views', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('session detail - transcript view', async ({ page }) => {
    // Mock session detail
    await mockSessionDetail(page, mockSessions[0].session_id, {
      ...mockSessions[0],
      messages: [
        {
          uuid: 'msg-1',
          role: 'user',
          content: 'Please implement dark mode for this application.',
          timestamp: '2024-01-17T10:00:00Z',
          tool_uses: [],
        },
        {
          uuid: 'msg-2',
          role: 'assistant',
          content: 'I\'ll help you implement dark mode. Let me start by analyzing the current theming setup.',
          timestamp: '2024-01-17T10:00:30Z',
          tool_uses: [],
          model: 'claude-sonnet-4-20250514',
        },
      ],
    });

    await page.goto('/');

    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Click on any session in the list
    const sessionItem = page.locator('[class*="list-item"]').first();
    if (await sessionItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sessionItem.click();
      await waitForAnimations(page);
    }

    await screenshot(page, '24-session-transcript');
  });

  test('active sessions section', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Look for active sessions section (CompactSessionList)
    await screenshot(page, '25-active-sessions-section');
  });
});

test.describe('UI Exploration - Resize Handles', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('resize handle hover state', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Find and hover over a resize handle
    const resizeHandle = page.locator('.resize-handle').first();
    if (await resizeHandle.isVisible()) {
      await resizeHandle.hover();
      await waitForAnimations(page);
    }

    await screenshot(page, '26-resize-handle-hover');
  });
});

test.describe('UI Exploration - Loading States', () => {
  test('loading skeleton for issues', async ({ page }) => {
    // Delay the issues response to capture loading state
    await page.route('**/api/repos/*/issues*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: mockIssues,
          total: mockIssues.length,
          page: 1,
          per_page: 30,
        }),
      });
    });

    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
    });

    await page.goto('/');

    // Select repo
    await page.getByRole('button', { name: /select repository/i }).click();
    await page.getByText('acme/webapp').click();

    // Take screenshot quickly during loading
    await page.waitForTimeout(100);
    await screenshot(page, '27-loading-issues');
  });
});
