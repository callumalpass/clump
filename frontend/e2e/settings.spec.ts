import { test, expect } from '@playwright/test';
import { mockAllApis } from './fixtures/api-mocks';
import { mockRepos, mockSessions, mockSettings, mockSessionCounts, mockCommands } from './fixtures/test-data';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });
    await page.goto('/');

    // Wait for app to render
    await expect(page.locator('h1', { hasText: 'Clump' })).toBeVisible({ timeout: 10000 });
  });

  test('opens settings modal when clicking settings button', async ({ page }) => {
    // Find and click settings button (gear icon with title="Settings")
    const settingsButton = page.locator('button[title="Settings"]');
    await settingsButton.click();

    // Settings modal should be visible - look for the heading since it doesn't have role="dialog"
    const settingsHeading = page.getByRole('heading', { name: 'Settings' });
    await expect(settingsHeading).toBeVisible({ timeout: 5000 });

    // Check tabs are visible (they might not have role="tab")
    await expect(page.getByText('GitHub')).toBeVisible();
    await expect(page.getByText('Permissions')).toBeVisible();
  });

  test('closes settings modal with escape key', async ({ page }) => {
    // Open settings
    const settingsButton = page.locator('button[title="Settings"]');
    await settingsButton.click();

    // Verify it's open
    const settingsHeading = page.getByRole('heading', { name: 'Settings' });
    await expect(settingsHeading).toBeVisible({ timeout: 5000 });

    // Press escape
    await page.keyboard.press('Escape');

    // Modal should be closed
    await expect(settingsHeading).not.toBeVisible();
  });
});
