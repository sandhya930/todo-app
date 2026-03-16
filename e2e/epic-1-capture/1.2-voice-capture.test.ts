/**
 * E2E Tests — Story 1.2: Voice Task Capture
 * Location: e2e/epic-1-capture/1.2-voice-capture.test.ts
 *
 * Requires: Playwright, running dev server at http://localhost:5173
 * Run with: pnpm --filter web test:e2e
 *
 * NOTE: Real microphone access is not available in CI. These tests use a
 * Playwright browser context with a mock STT implementation injected via
 * page.addInitScript(). A real device/browser run is required for the
 * full manual test plan.
 */
import { expect, test } from '@playwright/test';

test.describe('Voice Task Capture (Story 1.2)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject a mock SpeechRecognition before the app loads so the mic button
    // renders (the real Web Speech API is not available in Playwright).
    await page.addInitScript(() => {
      // Minimal SpeechRecognition stub — fires onend immediately with a
      // pre-set transcript injected via window.__mockTranscript.
      class MockSpeechRecognition extends EventTarget {
        continuous = false;
        interimResults = false;
        lang = '';
        onresult: ((e: Event) => void) | null = null;
        onerror: ((e: Event) => void) | null = null;
        onend: (() => void) | null = null;

        start() {
          const transcript = (window as Record<string, unknown>)['__mockTranscript'] as string ?? '';
          if (transcript && this.onresult) {
            const resultItem = Object.assign([{ transcript, confidence: 1 }], {
              isFinal: true,
              length: 1,
            });
            const event = Object.assign(new Event('result'), {
              resultIndex: 0,
              results: [resultItem],
            });
            this.onresult(event);
          }
          this.onend?.();
        }

        stop() { this.onend?.(); }
        abort() {}
      }

      (window as Record<string, unknown>)['SpeechRecognition'] = MockSpeechRecognition;
      // Grant mic permission — no real device needed.
      (navigator.permissions as unknown as Record<string, unknown>)['query'] = async () =>
        ({ state: 'granted' });
    });

    await page.goto('/inbox');
    await page.waitForSelector('[data-testid="voice-capture-mic-btn"]');
    // Mark privacy notice as seen so tests skip the modal.
    await page.evaluate(() => localStorage.setItem('voice_privacy_notice_seen', '1'));
  });

  test('mic button accessible on home screen (AC 1)', async ({ page }) => {
    await expect(page.locator('[data-testid="voice-capture-mic-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="voice-capture-mic-btn"]')).toHaveAttribute(
      'aria-label',
      'Start voice capture',
    );
  });

  test('dictate task → review → save → task appears in Inbox (AC 8)', async ({ page }) => {
    // Set the transcript the mock STT will return.
    await page.evaluate(() => {
      (window as Record<string, unknown>)['__mockTranscript'] = 'Book dentist appointment';
    });

    await page.click('[data-testid="voice-capture-mic-btn"]');

    // Review screen should appear.
    await page.waitForSelector('[data-testid="voice-review"]');
    await expect(page.locator('[data-testid="voice-review-input"]')).toHaveValue(
      'Book dentist appointment',
    );

    await page.click('[data-testid="voice-save-btn"]');

    // Task should appear in Inbox.
    await expect(
      page.locator('[data-testid="task-card"]').filter({ hasText: 'Book dentist appointment' }),
    ).toBeVisible();
  });

  test('user can edit transcript before saving (AC 4)', async ({ page }) => {
    await page.evaluate(() => {
      (window as Record<string, unknown>)['__mockTranscript'] = 'Buy groceries';
    });

    await page.click('[data-testid="voice-capture-mic-btn"]');
    await page.waitForSelector('[data-testid="voice-review"]');

    await page.fill('[data-testid="voice-review-input"]', 'Buy oat milk');
    await page.click('[data-testid="voice-save-btn"]');

    await expect(
      page.locator('[data-testid="task-card"]').filter({ hasText: 'Buy oat milk' }),
    ).toBeVisible();
  });

  test('empty transcript shows disabled Save and Try again button (AC 7)', async ({ page }) => {
    await page.evaluate(() => {
      (window as Record<string, unknown>)['__mockTranscript'] = '';
    });

    await page.click('[data-testid="voice-capture-mic-btn"]');
    await page.waitForSelector('[data-testid="voice-review"]');

    await expect(page.locator('[data-testid="voice-save-btn"]')).toBeDisabled();
    await expect(page.locator('[data-testid="voice-try-again-btn"]')).toBeVisible();
  });

  test('privacy notice shown on first use', async ({ page }) => {
    // Clear the flag to simulate first use.
    await page.evaluate(() => localStorage.removeItem('voice_privacy_notice_seen'));
    await page.click('[data-testid="voice-capture-mic-btn"]');
    await expect(page.locator('[data-testid="voice-privacy-notice"]')).toBeVisible();
  });
});
