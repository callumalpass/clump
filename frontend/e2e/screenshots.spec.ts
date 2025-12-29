import { test, expect } from '@playwright/test';
import { mockAllApis, mockIssueDetail, mockPRDetail, mockSessionDetail } from './fixtures/api-mocks';
import { mockRepos, mockIssues, mockPRs, mockSessions, mockCommands, mockSessionCounts } from './fixtures/test-data';

/**
 * Screenshot generation for README and documentation.
 * Run with: npx playwright test screenshots.spec.ts
 * Screenshots are saved to: frontend/screenshots/
 */

test.describe('Screenshots for README', () => {
  test.beforeEach(async ({ page }) => {
    // Set viewport for consistent screenshots
    await page.setViewportSize({ width: 1400, height: 900 });
  });

  async function selectRepo(page: import('@playwright/test').Page, repoName: string = 'acme/webapp') {
    // Click the repo selector dropdown button
    const repoSelector = page.getByRole('button', { name: /select repository/i });
    await repoSelector.click();

    // Wait for dropdown to open and click the repo
    await page.getByText(repoName).click();

    // Wait for repo to be selected (button text changes to show repo name)
    await expect(page.locator('button', { hasText: repoName }).first()).toBeVisible({ timeout: 10000 });
  }

  test('capture main interface with issues', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
    });

    // Mock issue detail for the selected issue (repoId = 1 for acme/webapp)
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

    // Wait for app to fully load
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();

    // Select the repo using dropdown
    await selectRepo(page);

    // Wait for issues to load - use the first mock issue title
    await expect(page.getByText('Add dark mode support')).toBeVisible({ timeout: 10000 });

    // Click on the first issue to show detail
    await page.getByText('Add dark mode support').click();

    // Wait for issue detail panel to appear
    await expect(page.getByText('requested a dark mode')).toBeVisible({ timeout: 5000 });

    // Small delay for animations to complete
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: 'screenshots/issues-view.png',
      animations: 'disabled',
    });
  });

  test('capture PR review interface', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
    });

    // Mock PR detail
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

    // Select repo
    await selectRepo(page);

    // Switch to PRs tab
    await page.getByRole('tab', { name: /PRs/i }).click();

    // Wait for PRs to load
    await expect(page.getByText('implement user authentication')).toBeVisible({ timeout: 10000 });

    // Click on the first PR
    await page.getByText('implement user authentication').click();

    // Wait for detail
    await expect(page.getByText('OAuth2 authentication')).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'screenshots/prs-view.png',
      animations: 'disabled',
    });
  });

  test('capture session history', async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();

    // Select repo
    await selectRepo(page);

    // Switch to History tab
    await page.getByRole('tab', { name: /History/i }).click();

    // Wait for sessions to load
    await expect(page.getByText('Implement dark mode')).toBeVisible({ timeout: 10000 });

    // Wait for layout to stabilize
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'screenshots/history-view.png',
      animations: 'disabled',
    });
  });

  test('capture active session view', async ({ page }) => {
    // Use the existing mockSessions which has an active session (mockSessions[1] has is_active: true)
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      prs: mockPRs,
      sessions: mockSessions,
      commands: mockCommands,
      sessionCounts: mockSessionCounts,
    });

    // Mock issue detail since clicking an active session shows issue context
    await mockIssueDetail(page, 1, {
      ...mockIssues[0]!,
      comments: [],
    });

    await page.goto('/');
    await expect(page.locator('h1:has-text("Clump")')).toBeVisible();

    // Select repo
    await selectRepo(page);

    // The active session should appear in the compact sessions list at the top
    // Wait for the active session to appear
    await expect(page.getByText('Review authentication PR').first()).toBeVisible({ timeout: 10000 });

    // Wait for layout to stabilize
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'screenshots/session-view.png',
      animations: 'disabled',
    });
  });
});
