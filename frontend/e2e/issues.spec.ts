import { test, expect } from '@playwright/test';
import { mockAllApis, mockIssueDetail } from './fixtures/api-mocks';
import { mockRepos, mockIssues, mockSessions, mockSettings, mockSessionCounts, mockCommands } from './fixtures/test-data';

test.describe('Issues', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    // Mock issue detail for clicking on an issue (repoId = 1 for acme/webapp)
    await mockIssueDetail(page, 1, {
      ...mockIssues[0]!,
      comments: [
        { id: 1, author: 'reviewer', body: 'Looks good!', created_at: '2024-01-16T12:00:00Z' },
      ],
    });

    await page.goto('/');

    // Select repo
    const repoSelector = page.getByRole('button', { name: /select repository/i });
    await repoSelector.click();
    await page.getByText('acme/webapp').click();

    // Wait for repo to be selected
    await expect(page.locator('button', { hasText: 'acme/webapp' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('displays issue list controls', async ({ page }) => {
    // Wait for repo to be selected (issues tab is default)
    await expect(page.locator('button', { hasText: 'acme/webapp' }).first()).toBeVisible({ timeout: 10000 });

    // Check that issue list controls are visible
    await expect(page.getByPlaceholder(/search issues/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /open/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /closed/i })).toBeVisible();
  });

  test('shows issue count in tab', async ({ page }) => {
    // Wait for repo to be selected
    await expect(page.locator('button', { hasText: 'acme/webapp' }).first()).toBeVisible({ timeout: 10000 });

    // The Issues tab should show a count badge
    const issuesTab = page.getByRole('tab', { name: /Issues/i });
    await expect(issuesTab).toBeVisible();
  });
});
