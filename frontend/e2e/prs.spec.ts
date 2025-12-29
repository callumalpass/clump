import { test, expect } from '@playwright/test';
import { mockAllApis, mockPRDetail } from './fixtures/api-mocks';
import { mockRepos, mockIssues, mockPRs, mockSessions, mockSettings, mockSessionCounts, mockCommands } from './fixtures/test-data';

test.describe('Pull Requests', () => {
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

    // Mock PR detail (repoId = 1 for acme/webapp)
    await mockPRDetail(page, 1, {
      ...mockPRs[0]!,
      comments: [
        { id: 1, author: 'reviewer', body: 'Please add tests', created_at: '2024-01-17T08:00:00Z' },
      ],
    });

    await page.goto('/');

    // Select repo and switch to PRs tab
    const repoSelector = page.getByRole('button', { name: /select repository/i });
    await repoSelector.click();
    await page.getByText('acme/webapp').click();

    // Wait for repo to be selected, then switch to PRs
    await expect(page.locator('button', { hasText: 'acme/webapp' }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('tab', { name: /PRs/i }).click();
  });

  test('displays PR list controls', async ({ page }) => {
    // Wait for PRs tab to be active
    await expect(page.getByRole('tab', { name: /PRs/i })).toHaveAttribute('aria-selected', 'true');

    // Check that PR list controls are visible
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /open/i })).toBeVisible();
  });

  test('can switch between open and closed PRs', async ({ page }) => {
    // Wait for PRs tab to be active
    await expect(page.getByRole('tab', { name: /PRs/i })).toHaveAttribute('aria-selected', 'true');

    // Click closed filter
    await page.getByRole('button', { name: /closed/i }).click();

    // Should still be on PRs tab
    await expect(page.getByRole('tab', { name: /PRs/i })).toHaveAttribute('aria-selected', 'true');
  });
});
