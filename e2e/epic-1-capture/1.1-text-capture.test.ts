/**
 * E2E Tests — Story 1.1: Instant Text Capture
 * Location: e2e/epic-1-capture/1.1-text-capture.test.ts
 *
 * Requires: Playwright, running dev server at http://localhost:5173
 * Run with: pnpm --filter web test:e2e
 *
 * NOTE: These tests require a running app with an authenticated user session.
 * Auth setup is handled by a global Playwright fixture (to be implemented with Story 1.4).
 * For now, the tests assume the app seeds a test user on startup in development mode.
 */
import { expect, test } from '@playwright/test';

const TITLE_MAX = 500;

test.describe('Instant Text Capture (Story 1.1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/inbox');
    // Wait for the quick capture input to be ready
    await page.waitForSelector('[data-testid="quick-capture-input"]');
  });

  test('open app → type task → press Enter → task appears in Inbox', async ({ page }) => {
    await page.fill('[data-testid="quick-capture-input"]', 'Buy groceries');
    await page.keyboard.press('Enter');

    // Task should appear in Inbox immediately (AC 3)
    await expect(page.locator('[data-testid="task-card"]').filter({ hasText: 'Buy groceries' })).toBeVisible();
    // Input should be cleared (AC 5)
    await expect(page.locator('[data-testid="quick-capture-input"]')).toHaveValue('');
  });

  test('type 500-char title → submit succeeds (AC 6)', async ({ page }) => {
    const longTitle = 'a'.repeat(TITLE_MAX);
    await page.fill('[data-testid="quick-capture-input"]', longTitle);
    await expect(page.locator('[data-testid="quick-capture-submit"]')).not.toBeDisabled();
    await page.click('[data-testid="quick-capture-submit"]');
    await expect(page.locator('[data-testid="task-card"]').first()).toBeVisible();
  });

  test('type 501-char title → submit button is disabled (AC 6)', async ({ page }) => {
    const overLimitTitle = 'a'.repeat(TITLE_MAX + 1);
    await page.fill('[data-testid="quick-capture-input"]', overLimitTitle);
    await expect(page.locator('[data-testid="quick-capture-submit"]')).toBeDisabled();
    await expect(page.locator('[data-testid="char-counter"]')).toBeVisible();
  });

  test('character counter appears at 480 chars', async ({ page }) => {
    const nearLimitTitle = 'a'.repeat(480);
    await page.fill('[data-testid="quick-capture-input"]', nearLimitTitle);
    await expect(page.locator('[data-testid="char-counter"]')).toBeVisible();
    await expect(page.locator('[data-testid="char-counter"]')).toContainText('480/500');
  });

  test('rapid multi-task capture (inbox dump workflow)', async ({ page }) => {
    const tasks = ['Task one', 'Task two', 'Task three'];
    const input = page.locator('[data-testid="quick-capture-input"]');

    for (const title of tasks) {
      await input.fill(title);
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue('');
    }

    for (const title of tasks) {
      await expect(page.locator('[data-testid="task-card"]').filter({ hasText: title })).toBeVisible();
    }
  });
});
