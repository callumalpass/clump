import { test, expect } from '@playwright/test';
import { mockAllApis, mockSessionDetail } from './fixtures/api-mocks';
import { mockRepos, mockIssues, mockSessions, mockSettings, mockSessionCounts, mockCommands } from './fixtures/test-data';

test.describe('Sessions', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, {
      repos: mockRepos,
      issues: mockIssues,
      sessions: mockSessions,
      settings: mockSettings,
      sessionCounts: mockSessionCounts,
      commands: mockCommands,
    });

    // Mock session detail
    await mockSessionDetail(page, mockSessions[0]!.session_id, {
      ...mockSessions[0],
      messages: [
        {
          uuid: 'msg-1',
          role: 'user',
          content: 'Implement dark mode for the application',
          timestamp: '2024-01-17T10:00:00Z',
          tool_uses: [],
        },
        {
          uuid: 'msg-2',
          role: 'assistant',
          content: 'I\'ll help you implement dark mode. Let me start by analyzing the current styling...',
          timestamp: '2024-01-17T10:01:00Z',
          tool_uses: [],
          model: 'claude-sonnet-4-20250514',
        },
      ],
      metadata: {
        session_id: mockSessions[0]!.session_id,
        entities: mockSessions[0]!.entities,
        tags: mockSessions[0]!.tags,
        starred: mockSessions[0]!.starred,
      },
      total_input_tokens: 1500,
      total_output_tokens: 3200,
      total_cache_read_tokens: 500,
      total_cache_creation_tokens: 0,
    });

    await page.goto('/');

    // Select repo
    const repoSelector = page.getByRole('button', { name: /select repository/i });
    await repoSelector.click();
    await page.getByText('acme/webapp').click();

    // Wait for repo to be selected
    await expect(page.locator('button', { hasText: 'acme/webapp' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('displays History tab with session controls', async ({ page }) => {
    // Switch to History tab
    await page.getByRole('tab', { name: /History/i }).click();

    // Verify we're on History tab
    await expect(page.getByRole('tab', { name: /History/i })).toHaveAttribute('aria-selected', 'true');

    // Check that session list controls are visible
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('can switch to History tab and back', async ({ page }) => {
    // Switch to History tab
    await page.getByRole('tab', { name: /History/i }).click();
    await expect(page.getByRole('tab', { name: /History/i })).toHaveAttribute('aria-selected', 'true');

    // Switch back to Issues tab
    await page.getByRole('tab', { name: /Issues/i }).click();
    await expect(page.getByRole('tab', { name: /Issues/i })).toHaveAttribute('aria-selected', 'true');
  });
});
