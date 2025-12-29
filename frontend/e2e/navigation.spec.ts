import { test, expect } from '@playwright/test';
import { mockAllApis } from './fixtures/api-mocks';
import { mockRepos, mockIssues, mockPRs, mockSessions, mockSettings, mockSessionCounts, mockCommands } from './fixtures/test-data';

test.describe('Navigation', () => {
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
    await page.goto('/');

    // Select a repo first
    const repoSelector = page.getByRole('button', { name: /select repository/i });
    await repoSelector.click();
    await page.getByText('acme/webapp').click();

    // Wait for repo to be selected
    await expect(page.locator('button', { hasText: 'acme/webapp' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('switches between tabs using clicks', async ({ page }) => {
    // Start on Issues tab (default)
    await expect(page.getByRole('tab', { name: /Issues/i })).toHaveAttribute('aria-selected', 'true');

    // Click PRs tab
    await page.getByRole('tab', { name: /PRs/i }).click();
    await expect(page.getByRole('tab', { name: /PRs/i })).toHaveAttribute('aria-selected', 'true');

    // Click History tab
    await page.getByRole('tab', { name: /History/i }).click();
    await expect(page.getByRole('tab', { name: /History/i })).toHaveAttribute('aria-selected', 'true');

    // Click Schedules tab
    await page.getByRole('tab', { name: /Schedules/i }).click();
    await expect(page.getByRole('tab', { name: /Schedules/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('switches tabs using keyboard shortcuts', async ({ page }) => {
    // Start on Issues tab
    await expect(page.getByRole('tab', { name: /Issues/i })).toHaveAttribute('aria-selected', 'true');

    // Press 2 to go to PRs
    await page.keyboard.press('2');
    await expect(page.getByRole('tab', { name: /PRs/i })).toHaveAttribute('aria-selected', 'true');

    // Press 3 to go to History
    await page.keyboard.press('3');
    await expect(page.getByRole('tab', { name: /History/i })).toHaveAttribute('aria-selected', 'true');

    // Press 4 to go to Schedules
    await page.keyboard.press('4');
    await expect(page.getByRole('tab', { name: /Schedules/i })).toHaveAttribute('aria-selected', 'true');

    // Press 1 to go back to Issues
    await page.keyboard.press('1');
    await expect(page.getByRole('tab', { name: /Issues/i })).toHaveAttribute('aria-selected', 'true');
  });
});
