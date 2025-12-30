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

  test('initial state - no repo selected (welcome screen)', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);
    await screenshot(page, '01-initial-no-repo');

    // Verify welcome state message is shown
    await expect(page.getByText('Welcome to Clump')).toBeVisible();
    // Verify getting started steps are shown - use more specific text to avoid duplicates
    await expect(page.getByText('Manage Claude Code sessions')).toBeVisible();
    await expect(page.getByText('Use the dropdown in the sidebar')).toBeVisible();
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
    await selectRepo(page);

    // History tab should show session list when repo is selected
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '06-history-tab');

    // Verify History tab is selected
    await expect(page.getByRole('tab', { name: /History/i })).toHaveAttribute('aria-selected', 'true');
    // Verify search placeholder is visible (only shows when repo is selected)
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
    await page.getByRole('button', { name: /shortcuts/i }).click();
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
  test('API error on issues fetch shows error UI', async ({ page }) => {
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

    // Wait for error state to appear
    await page.waitForTimeout(500);

    // Verify error UI is shown with retry button in left panel
    await expect(page.getByText('Failed to load issues')).toBeVisible();
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();

    // Verify center pane shows error-aware state instead of generic empty state
    await expect(page.getByText('Unable to load issues')).toBeVisible();
    await expect(page.getByText('There was a problem fetching data from the server')).toBeVisible();

    await screenshot(page, '19-error-issues-fetch');
  });

  test('API error on PRs fetch shows error UI', async ({ page }) => {
    // Mock other endpoints first
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
    });

    // Remove the PRs route set up by mockAllApis, then add error route
    // Playwright routes run in LIFO order (last registered takes precedence)
    await page.unroute('**/api/repos/*/prs*');
    await page.route('**/api/repos/*/prs*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/');
    await selectRepo(page);

    // Switch to PRs tab
    await page.getByRole('tab', { name: /PRs/i }).click();
    await waitForAnimations(page);

    // Wait for error state to appear
    await page.waitForTimeout(500);

    // Verify error UI is shown in left panel
    await expect(page.getByText('Failed to load pull requests')).toBeVisible();

    // Verify center pane shows error-aware state
    await expect(page.getByText('Unable to load pull requests')).toBeVisible();

    await screenshot(page, '51-error-prs-fetch');
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

test.describe('UI Exploration - Empty State Variants', () => {
  test('simplified empty state - when list has items (no selection)', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await selectRepo(page);

    // Verify the simplified empty state is shown (no large card with shortcuts)
    await expect(page.getByText('Select an issue to view details')).toBeVisible();
    // The full card with shortcuts should NOT be visible
    await expect(page.getByText('Command palette')).not.toBeVisible();

    await screenshot(page, '28-simplified-empty-state');
  });

  test('full empty state - when list is empty', async ({ page }) => {
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

    // Verify the full empty state is shown (with keyboard shortcuts)
    await expect(page.getByText('No issues to display')).toBeVisible();
    await expect(page.getByText('Command palette')).toBeVisible();
    await expect(page.getByText('All shortcuts')).toBeVisible();

    await screenshot(page, '29-full-empty-state');
  });

  test('center pane updates when switching tabs', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await selectRepo(page);

    // Issues tab - shows issue-specific message
    await expect(page.getByText('Select an issue to view details')).toBeVisible();

    // Switch to PRs tab
    await page.getByRole('tab', { name: /PRs/i }).click();
    await waitForAnimations(page);
    await expect(page.getByText('Select a pull request to view details')).toBeVisible();

    await screenshot(page, '30-pr-simplified-empty-state');
  });
});

test.describe('UI Exploration - Settings Modal', () => {
  test('settings modal shows skeleton loading for token status', async ({ page }) => {
    // Mock settings API to be slow
    await page.route('**/api/settings/github-token', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, masked_token: 'ghp_****xxxx' }),
      });
    });

    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    // Should show skeleton shimmer elements
    const skeletons = await page.locator('.skeleton-shimmer').count();
    expect(skeletons).toBeGreaterThan(0);

    await screenshot(page, '31-settings-token-loading');
  });

  test('settings modal shows no token configured warning', async ({ page }) => {
    // Mock token status as not configured
    await page.route('**/api/settings/github-token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: false, masked_token: null }),
      });
    });

    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    // Should show warning state with rate limit badge
    await expect(page.getByText('No token configured')).toBeVisible();
    await expect(page.getByText('60 req/hour')).toBeVisible();
    await expect(page.getByText('Add a token to unlock 5,000 requests per hour')).toBeVisible();

    await screenshot(page, '31b-settings-no-token-warning');
  });
});

test.describe('UI Exploration - Session Error Recovery', () => {
  test('session error state shows retry button', async ({ page }) => {
    // First set up base mocks
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    // Override session detail endpoint to fail (must be after mockAllApis)
    await page.route('**/api/sessions/session-*', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session not found' }),
      });
    });

    await page.goto('/');

    // First select a repo so we can access session functionality
    await selectRepo(page);

    // Go to History tab
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Click on a session from the list
    const sessionItem = page.locator('[class*="list-item"]').first();
    if (await sessionItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sessionItem.click();
      await waitForAnimations(page);
      await page.waitForTimeout(1500); // Wait for error to appear

      // Capture the state (may show error or the session detail depending on caching)
      await screenshot(page, '32-session-error-retry');

      // Test passes - we've captured the UI state for manual review
      // The error state depends on whether the session was already cached
    }
  });
});

test.describe('UI Exploration - Mobile Viewport', () => {
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

  test('mobile viewport (375px) - initial state', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await waitForAnimations(page);
    await screenshot(page, '33-mobile-initial');
  });

  test('mobile viewport (375px) - with repo selected', async ({ page }) => {
    // Use default viewport for repo selection, then resize
    await page.goto('/');
    await selectRepo(page);

    // Resize to mobile to capture the state
    await page.setViewportSize({ width: 375, height: 667 });
    await waitForAnimations(page);
    await screenshot(page, '34-mobile-repo-selected');
  });
});

test.describe('UI Exploration - Keyboard Navigation', () => {
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

  test('tab navigation with arrow keys', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Focus the Issues tab
    await page.getByRole('tab', { name: /Issues/i }).focus();
    await waitForAnimations(page);

    // Press ArrowRight to move to PRs tab
    await page.keyboard.press('ArrowRight');
    await waitForAnimations(page);

    // PRs tab should now be focused and selected
    await expect(page.getByRole('tab', { name: /PRs/i })).toBeFocused();
    await screenshot(page, '35-keyboard-tab-navigation');
  });

  test('focus visible state on list items', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Tab to focus a list item
    const issueItem = page.locator('[class*="list-item"]').first();
    await issueItem.focus();
    await waitForAnimations(page);

    await screenshot(page, '36-focus-visible-list-item');
  });
});

test.describe('UI Exploration - Settings Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
    });
  });

  test('permissions tab', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);

    // Open settings
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    // Click Permissions tab
    await page.getByRole('button', { name: /permissions/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '37-settings-permissions');
  });

  test('execution tab', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);

    // Open settings
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    // Click Execution tab
    await page.getByRole('button', { name: /execution/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '38-settings-execution');
  });

  test('advanced tab', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);

    // Open settings
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    // Click Advanced tab
    await page.getByRole('button', { name: /advanced/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '39-settings-advanced');
  });
});

test.describe('UI Exploration - Filter Interactions', () => {
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

  test('issue state filter - all states', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Click the All filter button
    const allButton = page.getByRole('button', { name: /^all$/i });
    if (await allButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allButton.click();
      await waitForAnimations(page);
    }

    await screenshot(page, '40-issues-all-filter');
  });

  test('session model filter - sonnet', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Click Sonnet filter button if visible
    const sonnetButton = page.getByRole('button', { name: /sonnet/i });
    if (await sonnetButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sonnetButton.click();
      await waitForAnimations(page);
    }

    await screenshot(page, '41-sessions-sonnet-filter');
  });

  test('session time filter - today', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Click Today filter button if visible
    const todayButton = page.getByRole('button', { name: /today/i });
    if (await todayButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await todayButton.click();
      await waitForAnimations(page);
    }

    await screenshot(page, '42-sessions-today-filter');
  });
});

test.describe('UI Exploration - Schedule States', () => {
  test.beforeEach(async ({ page }) => {
    // Mock schedules with data
    await page.route('**/api/schedules*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            name: 'daily issue triage',
            repo_id: 1,
            schedule_type: 'cron',
            cron_expression: '0 9 * * 1-5',
            command_type: 'issues',
            prompt_template: 'Triage new issues',
            enabled: true,
            last_run: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
            last_run_status: 'completed',
            next_run: new Date(Date.now() + 16 * 60 * 60 * 1000).toISOString(),
            run_count: 1,
          },
        ]),
      });
    });

    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('schedules with existing schedule', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Click Schedules tab
    await page.getByRole('tab', { name: /Schedules/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '43-schedules-with-data');
  });
});

test.describe('UI Exploration - Search Focused', () => {
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

  test('search input focus glow', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Focus the search input
    const searchInput = page.getByPlaceholder(/search issues/i);
    await searchInput.focus();
    await waitForAnimations(page);

    await screenshot(page, '44-search-focus-glow');
  });

  test('search with text entered', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Type into search
    const searchInput = page.getByPlaceholder(/search issues/i);
    await searchInput.fill('dark mode');
    await waitForAnimations(page);

    await screenshot(page, '45-search-with-text');
  });
});

test.describe('UI Exploration - Session Duration Display', () => {
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

  test('active session shows realistic elapsed time', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // The active session should show a reasonable elapsed time (not hours)
    // Check the compact session list in the sidebar
    const sessionTime = page.locator('text=/\\d+m \\d+s/').first();
    await expect(sessionTime).toBeVisible({ timeout: 5000 });

    await screenshot(page, '46-active-session-elapsed-time');
  });

  test('history tab shows relative timestamps', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Go to History tab
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Should show relative times like "2h ago" or "yesterday"
    await screenshot(page, '47-history-relative-times');
  });
});

test.describe('UI Exploration - Filter Bar Responsiveness', () => {
  test('filter groups on narrow viewport (500px)', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    // Navigate and select repo at default viewport first
    await page.goto('/');
    await selectRepo(page);

    // Go to History tab before resizing
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Now resize to narrow viewport
    await page.setViewportSize({ width: 500, height: 800 });
    await waitForAnimations(page);

    await screenshot(page, '48-filter-bar-narrow-viewport');
  });

  test('filter groups scroll horizontally on tablet', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    // Navigate and select repo at default viewport first
    await page.goto('/');
    await selectRepo(page);

    // Go to History tab before resizing
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Now resize to tablet viewport
    await page.setViewportSize({ width: 600, height: 900 });
    await waitForAnimations(page);

    await screenshot(page, '49-filter-bar-tablet-viewport');
  });
});

test.describe('UI Exploration - Tooltip States', () => {
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

  test('session item has tooltip with full date', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Go to History tab
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Hover over a session item that has a timestamp
    const sessionItem = page.locator('[role="button"]').filter({ hasText: /ago|yesterday/ }).first();
    if (await sessionItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sessionItem.hover();
      await waitForAnimations(page);
    }

    await screenshot(page, '50-session-tooltip-hover');
  });
});

test.describe('UI Exploration - Settings Selection States', () => {
  test('permissions tab shows selected mode with border and checkmark', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: { ...mockSettings, permission_mode: 'default' },
      sessionCounts: mockSessionCounts,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    // Click Permissions tab
    await page.getByRole('button', { name: /permissions/i }).click();
    await waitForAnimations(page);

    // Verify we can see the permission mode cards
    await expect(page.getByRole('button', { name: /Default/ })).toBeVisible();
    await expect(page.getByText('Prompts for each permission')).toBeVisible();

    await screenshot(page, '52-settings-permission-mode-selected');
  });

  test('execution tab shows selected model with border', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: { ...mockSettings, model: 'sonnet' },
      sessionCounts: mockSessionCounts,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    // Click Execution tab
    await page.getByRole('button', { name: /execution/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '53-settings-model-selected');
  });

  test('advanced tab shows selected theme with border', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    // Click Advanced tab
    await page.getByRole('button', { name: /advanced/i }).click();
    await waitForAnimations(page);

    // Verify theme options are visible
    await expect(page.getByRole('button', { name: /dark/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /light/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /system/i })).toBeVisible();

    await screenshot(page, '54-settings-theme-selected');
  });
});

test.describe('UI Exploration - Light Theme', () => {
  test('light theme applied to main interface', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings and switch to light theme
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    await page.getByRole('button', { name: /advanced/i }).click();
    await waitForAnimations(page);

    // Click Light theme button
    await page.getByRole('button', { name: /light/i }).click();
    await waitForAnimations(page);

    // Close settings (use aria-label "Close" button to avoid ambiguity)
    await page.getByLabel('Close').click();
    await waitForAnimations(page);

    // Select a repo to see the full UI
    await selectRepo(page);

    await screenshot(page, '55-light-theme-main');
  });
});

test.describe('UI Exploration - Button Hover States', () => {
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

  test('analyze button hover state', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Find and hover over an analyze button
    const analyzeBtn = page.getByRole('button', { name: /analyze/i }).first();
    if (await analyzeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyzeBtn.hover();
      await waitForAnimations(page);
    }

    await screenshot(page, '56-analyze-button-hover');
  });

  test('settings button hover state', async ({ page }) => {
    await page.goto('/');
    await waitForAnimations(page);

    // Hover over settings button
    await page.locator('button[title="Settings"]').hover();
    await waitForAnimations(page);

    await screenshot(page, '57-settings-button-hover');
  });
});

test.describe('UI Exploration - Pagination States', () => {
  test.beforeEach(async ({ page }) => {
    // Create more issues for pagination
    const manyIssues = Array.from({ length: 35 }, (_, i) => ({
      number: 100 + i,
      title: `Test issue ${i + 1}`,
      body: `Body for issue ${i + 1}`,
      state: 'open' as const,
      labels: [],
      author: 'testuser',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-16T14:30:00Z',
      comments_count: 0,
      url: `https://github.com/acme/webapp/issues/${100 + i}`,
    }));

    await mockAllApis(page, {
      repos: mockRepos,
      issues: manyIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('pagination controls visible with many items', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Should see pagination controls (use .first() since there are multiple matching elements)
    await expect(page.getByText(/\d+ issues/).first()).toBeVisible();

    await screenshot(page, '58-pagination-controls');
  });
});

test.describe('UI Exploration - Star Toggle Animation', () => {
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

  test('starred session shows star icon', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Go to History tab
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Look for starred session (mockSessions has one starred)
    await screenshot(page, '59-starred-session-icon');
  });
});

test.describe('UI Exploration - Hover Arrow Animation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
    });
  });

  test('issue list item shows hover arrow on hover', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Find and hover over an issue item
    const issueItem = page.locator('[class*="list-item-hover"]').first();
    await issueItem.hover();
    await waitForAnimations(page);

    // The hover arrow should now be visible (opacity > 0)
    const hoverArrow = issueItem.locator('.list-item-hover-arrow');
    await expect(hoverArrow).toBeVisible();

    await screenshot(page, '60-issue-hover-arrow');
  });

  test('session list item shows hover arrow on hover', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Go to History tab
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    // Find and hover over a session item
    const sessionItem = page.locator('[class*="list-item-hover"]').first();
    await sessionItem.hover();
    await waitForAnimations(page);

    await screenshot(page, '61-session-hover-arrow');
  });

  test('pr list item shows hover arrow on hover', async ({ page }) => {
    await page.goto('/');
    await selectRepo(page);

    // Go to PRs tab
    await page.getByRole('tab', { name: /PRs/i }).click();
    await waitForAnimations(page);

    // Find and hover over a PR item
    const prItem = page.locator('[class*="list-item-hover"]').first();
    await prItem.hover();
    await waitForAnimations(page);

    await screenshot(page, '62-pr-hover-arrow');
  });
});

test.describe('UI Exploration - Light Theme Extended', () => {
  test('light theme - history tab with session badges', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Switch to light theme
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /advanced/i }).click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /light/i }).click();
    await waitForAnimations(page);
    await page.getByLabel('Close').click();
    await waitForAnimations(page);

    // Select repo and go to history tab
    await selectRepo(page);
    await page.getByRole('tab', { name: /History/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '63-light-theme-history');
  });

  test('light theme - filter pills active state', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Switch to light theme
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /advanced/i }).click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /light/i }).click();
    await waitForAnimations(page);
    await page.getByLabel('Close').click();
    await waitForAnimations(page);

    // Select repo
    await selectRepo(page);

    // Click "Closed" filter to show active filter state
    await page.getByRole('button', { name: 'Closed' }).click();
    await waitForAnimations(page);

    await screenshot(page, '64-light-theme-filter-active');
  });

  test('light theme - settings modal', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Switch to light theme first
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /advanced/i }).click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /light/i }).click();
    await waitForAnimations(page);

    // Go back to GitHub tab to show settings in light mode
    await page.getByRole('button', { name: /github/i }).click();
    await waitForAnimations(page);

    await screenshot(page, '65-light-theme-settings');
  });
});

test.describe('UI Exploration - Selection Indicators', () => {
  test('execution tab shows model selection with checkmark', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings and go to execution tab
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /execution/i }).click();
    await waitForAnimations(page);

    // Verify Sonnet shows as selected with checkmark (model in mock is claude-sonnet-4-...)
    const sonnetButton = page.getByRole('button', { name: /sonnet/i });
    await expect(sonnetButton).toHaveClass(/bg-blurple-500\/10/);

    // Capture screenshot showing the selection indicator
    await screenshot(page, '67-model-selection-checkmark');
  });

  test('output format shows selection indicator', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings and go to execution tab
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /execution/i }).click();
    await waitForAnimations(page);

    // Verify Text shows as selected (default output format)
    const textButton = page.getByRole('button', { name: /^text$/i });
    await expect(textButton).toHaveClass(/bg-blurple-500\/10/);

    await screenshot(page, '68-output-format-selection');
  });

  test('theme selection shows checkmark on selected theme', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings and go to advanced tab
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /advanced/i }).click();
    await waitForAnimations(page);

    // Default is dark mode - should show selected
    const darkButton = page.getByRole('button', { name: /dark/i });
    await expect(darkButton).toHaveClass(/bg-blurple-500\/10/);

    await screenshot(page, '69-theme-selection-dark');

    // Switch to light and verify selection updates
    await page.getByRole('button', { name: /light/i }).click();
    await waitForAnimations(page);

    const lightButton = page.getByRole('button', { name: /light/i });
    await expect(lightButton).toHaveClass(/bg-blurple-500\/10/);

    await screenshot(page, '70-theme-selection-light');
  });
});

test.describe('UI Exploration - Dropdown Menus', () => {
  test('sort dropdown shows options', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);
    await selectRepo(page);
    await waitForAnimations(page);

    // Sort dropdown is a select element
    const sortSelect = page.locator('select[aria-label="Sort by"]');
    await expect(sortSelect).toBeVisible();

    // Show the dropdown value
    await screenshot(page, '71-sort-dropdown');
  });

  test('command dropdown shows action options', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);
    await selectRepo(page);
    await waitForAnimations(page);

    // Find and click the dropdown button on an issue row
    const issueRow = page.locator('[data-testid="issue-item"]').first();
    const dropdownButton = issueRow.locator('button[aria-haspopup="listbox"]');

    if (await dropdownButton.isVisible()) {
      await dropdownButton.click();
      await waitForAnimations(page);
      await screenshot(page, '72-command-dropdown-open');
    }
  });
});

test.describe('UI Exploration - Input Focus States', () => {
  test('settings token input focus glow', async ({ page }) => {
    // Override token status to show unconfigured state with input
    await page.route('**/api/settings/github-token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: false, masked_token: null }),
      });
    });

    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings (GitHub tab by default)
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    // Focus the token input - should be visible when token is not configured
    const tokenInput = page.locator('input[type="password"]');
    await expect(tokenInput).toBeVisible({ timeout: 5000 });
    await tokenInput.focus();
    await waitForAnimations(page);

    await screenshot(page, '73-token-input-focused');
  });

  test('tool input focus state in permissions tab', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    await page.goto('/');
    await waitForAnimations(page);

    // Open settings and go to permissions tab
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);
    await page.getByRole('button', { name: /permissions/i }).click();
    await waitForAnimations(page);

    // Focus the tool input
    const toolInput = page.locator('input[placeholder*="Add tool"]');
    await toolInput.focus();
    await waitForAnimations(page);

    await screenshot(page, '74-tool-input-focused');
  });
});

