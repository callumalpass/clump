import { test, expect, Page } from '@playwright/test';
import { mockAllApis, mockIssueDetail, mockPRDetail, mockSessionDetail } from './fixtures/api-mocks';
import { mockRepos, mockIssues, mockPRs, mockSessions, mockCommands, mockSessionCounts, mockSettings } from './fixtures/test-data';

/**
 * Screenshot generation for README and documentation.
 * Run with: npx playwright test screenshots.spec.ts
 * Screenshots are saved to: docs/images/
 */

const SCREENSHOT_DIR = '../docs/images';

test.describe('Screenshots for README', () => {
  test.beforeEach(async ({ page }) => {
    // Set viewport for consistent screenshots
    await page.setViewportSize({ width: 1400, height: 900 });
  });

  async function selectRepo(page: Page, repoName: string = 'acme/webapp') {
    const repoSelector = page.getByRole('button', { name: /select repository/i });
    await repoSelector.click();
    await page.getByText(repoName).click();
    await expect(page.locator('button', { hasText: repoName }).first()).toBeVisible({ timeout: 10000 });
  }

  async function waitForAnimations(page: Page) {
    await page.waitForTimeout(300);
  }

  test('01 - welcome screen', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
      settings: mockSettings,
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();
    await expect(page.getByText('Welcome to Clump')).toBeVisible();
    await waitForAnimations(page);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/welcome.png`,
      animations: 'disabled',
    });
  });

  test('02 - issues view', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
      settings: mockSettings,
    });

    await mockIssueDetail(page, 1, {
      ...mockIssues[0]!,
      comments: [
        {
          id: 1,
          author: 'reviewer',
          body: 'This would be a great addition! Dark mode is essential for accessibility.',
          created_at: '2024-01-16T12:00:00Z',
        },
        {
          id: 2,
          author: 'johndoe',
          body: 'Thanks for the feedback! I\'ll start working on the implementation.',
          created_at: '2024-01-16T14:00:00Z',
        },
      ],
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();
    await selectRepo(page);
    await expect(page.getByText('Add dark mode support')).toBeVisible({ timeout: 10000 });
    await page.getByText('Add dark mode support').click();
    await expect(page.getByText('requested a dark mode')).toBeVisible({ timeout: 5000 });
    await waitForAnimations(page);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/issues-view.png`,
      animations: 'disabled',
    });
  });

  test('03 - PR review interface', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
      settings: mockSettings,
    });

    await mockPRDetail(page, 1, {
      ...mockPRs[0]!,
      comments: [
        {
          id: 1,
          author: 'reviewer1',
          body: 'Great implementation! The OAuth2 flow looks solid. Just one minor suggestion on error handling.',
          created_at: '2024-01-17T08:00:00Z',
        },
      ],
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();
    await selectRepo(page);
    await page.getByRole('tab', { name: /PRs/i }).click();
    await expect(page.getByText('implement user authentication')).toBeVisible({ timeout: 10000 });
    await page.getByText('implement user authentication').click();
    await expect(page.getByText('OAuth2 authentication')).toBeVisible({ timeout: 5000 });
    await waitForAnimations(page);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/prs-view.png`,
      animations: 'disabled',
    });
  });

  test('04 - active sessions', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
      settings: mockSettings,
    });

    // Mock the session detail for the active session
    await mockSessionDetail(page, mockSessions[1].session_id, {
      ...mockSessions[1],
      messages: [
        {
          uuid: 'msg-1',
          role: 'user',
          content: 'Please review this authentication PR for security issues.',
          timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          tool_uses: [],
        },
        {
          uuid: 'msg-2',
          role: 'assistant',
          content: 'I\'ll review the authentication PR for security issues. Let me start by examining the OAuth2 implementation and token handling.',
          timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
          tool_uses: [
            { name: 'Read', input: { file_path: 'src/auth/oauth.ts' } },
            { name: 'Grep', input: { pattern: 'token', path: 'src/' } },
          ],
          model: 'claude-sonnet-4-20250514',
        },
      ],
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();
    await selectRepo(page);

    // Go to History tab to see sessions including the active one
    await page.getByRole('tab', { name: /History/i }).click();
    await expect(page.getByText('Review authentication PR')).toBeVisible({ timeout: 10000 });

    // Click the active session to show it in the panel
    await page.getByText('Review authentication PR').click();
    await waitForAnimations(page);
    await page.waitForTimeout(500); // Extra wait for session to load

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/active-sessions.png`,
      animations: 'disabled',
    });
  });

  test('05 - session history', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
      settings: mockSettings,
    });

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
          content: 'I\'ll help you implement dark mode. Let me start by analyzing the current theming setup and identifying the key components that need to support theme switching.',
          timestamp: '2024-01-17T10:00:30Z',
          tool_uses: [
            { name: 'Read', input: { file_path: 'src/App.tsx' } },
            { name: 'Glob', input: { pattern: '**/*.css' } },
          ],
          model: 'claude-sonnet-4-20250514',
        },
      ],
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();
    await selectRepo(page);
    await page.getByRole('tab', { name: /History/i }).click();
    await expect(page.getByText('Implement dark mode')).toBeVisible({ timeout: 10000 });

    // Click on the session to show transcript
    await page.getByText('Implement dark mode').click();
    await waitForAnimations(page);
    await page.waitForTimeout(500); // Extra wait for transcript to load

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/history-view.png`,
      animations: 'disabled',
    });
  });

  test('06 - schedules', async ({ page }) => {
    // Mock schedules with data
    await page.route('**/api/schedules*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            name: 'Daily issue triage',
            repo_id: 1,
            schedule_type: 'cron',
            cron_expression: '0 9 * * 1-5',
            command_type: 'issues',
            prompt_template: 'Review and triage new issues',
            enabled: true,
            last_run: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
            last_run_status: 'completed',
            next_run: new Date(Date.now() + 16 * 60 * 60 * 1000).toISOString(),
            run_count: 12,
          },
          {
            id: 2,
            name: 'Weekly PR review',
            repo_id: 1,
            schedule_type: 'cron',
            cron_expression: '0 10 * * 1',
            command_type: 'prs',
            prompt_template: 'Review all open PRs',
            enabled: true,
            last_run: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            last_run_status: 'completed',
            next_run: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
            run_count: 5,
          },
        ]),
      });
    });

    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
      settings: mockSettings,
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();
    await selectRepo(page);
    await page.getByRole('tab', { name: /Schedules/i }).click();
    await waitForAnimations(page);
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/schedules.png`,
      animations: 'disabled',
    });
  });

  test('07 - settings modal', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
      settings: mockSettings,
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();
    await page.locator('button[title="Settings"]').click();
    await waitForAnimations(page);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/settings.png`,
      animations: 'disabled',
    });
  });

  test('08 - command palette', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
      settings: mockSettings,
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();
    await selectRepo(page);
    await page.keyboard.press('Control+k');
    await waitForAnimations(page);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/command-palette.png`,
      animations: 'disabled',
    });
  });
});
