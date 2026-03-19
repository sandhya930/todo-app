/**
 * E2E Tests — Story 1.3: Email-to-Task Forwarding
 *
 * NOTE: These tests require:
 *   - A running dev server (pnpm dev)
 *   - An email sandbox (e.g., Mailhog) configured via INGEST_EMAIL_DOMAIN
 *   - Valid INGEST_EMAIL_SECRET set in environment
 *
 * They are excluded from CI unit/integration runs and must be run manually
 * or in a dedicated E2E stage with the full infrastructure stack.
 *
 * Stub tests below document the intended E2E scenarios.
 */
import { describe, it } from 'vitest';

describe('Email forwarding E2E (requires email sandbox + running server)', () => {
  it.todo('forward email from registered address → task appears in Inbox within 60s (AC 4)');
  it.todo('forward email from different address → no task created (AC 5)');
  it.todo('forward email with no subject → task title is "Email task — [date]" (AC 8)');
  it.todo('Settings page shows unique forwarding address with working copy button (AC 1)');
  it.todo('in-app toast "New task from email" appears when app is open (AC 6)');
});
