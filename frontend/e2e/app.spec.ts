import { test, expect } from '@playwright/test';
import { mockAllApis } from './fixtures/api-mocks';
import { mockRepos, mockIssues, mockSessions, mockSettings, mockSessionCounts, mockCommands } from './fixtures/test-data';

test.describe('App', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
  });

  test('displays app title and header', async ({ page }) => {
    await page.goto('/');

    // Check title in browser tab
    await expect(page).toHaveTitle('Clump');

    // Check header title - it's an h1 element
    const title = page.locator('h1', { hasText: 'Clump' });
    await expect(title).toBeVisible();

    // Check active processes counter is visible
    await expect(page.getByText(/0 active process/)).toBeVisible();
  });

  test('shows repo selector and can select a repository', async ({ page }) => {
    await page.goto('/');

    // The repo selector is a custom button-based dropdown, not a native combobox
    // Look for the "Select repository..." placeholder button
    const repoSelector = page.getByRole('button', { name: /select repository/i });
    await expect(repoSelector).toBeVisible();

    // Click to open dropdown
    await repoSelector.click();

    // Should see mock repos in dropdown
    await expect(page.getByText('acme/webapp')).toBeVisible();
    await expect(page.getByText('acme/api-server')).toBeVisible();

    // Select a repo
    await page.getByText('acme/webapp').click();

    // Verify the repo is now selected - look for the text in the button area
    await expect(page.locator('button', { hasText: 'acme/webapp' }).first()).toBeVisible();

    // Verify the issues tab is visible
    await expect(page.getByRole('tab', { name: /Issues/i })).toBeVisible();
  });
});
