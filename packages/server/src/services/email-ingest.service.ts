/**
 * Email ingestion service — processes inbound email webhooks and converts
 * them to tasks.
 *
 * Email provider: SendGrid Inbound Parse
 * Webhook payload: application/x-www-form-urlencoded (multipart also supported)
 *
 * Security:
 * - Sender email must match the user's registered account email (AC 5).
 * - Silent rejection for unauthorized senders (no bounce).
 * - Rate limiting is enforced upstream in the route layer.
 */

import { htmlToMarkdown } from '../lib/html-to-markdown.js';
import { extractTokenFromAddress, deriveEmailToken } from '../lib/email-address.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalised inbound email payload (provider-agnostic). */
export interface InboundEmailPayload {
  /** Sender email address (From: header). */
  from: string;
  /** Primary recipient (To: header) — the forwarding address. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** Plain-text body (may be empty). */
  text: string;
  /** HTML body (may be empty). */
  html: string;
  /** Unix timestamp of email receipt (seconds). */
  receivedAt?: number;
}

/** A user record as returned by the user lookup function. */
export interface UserRecord {
  id: string;
  email: string;
  /** The stored forwarding address token (first 16 hex chars of HMAC). */
  emailIngestToken: string;
}

/** A created task record (minimal shape needed by the service). */
export interface CreatedTask {
  id: string;
  title: string;
  notes: string | null;
  source: string;
}

/** Dependencies injected into the service — allows test mocking. */
export interface EmailIngestDeps {
  /**
   * Look up a user by their forwarding address token.
   * Returns null if no user has this token.
   */
  findUserByToken: (token: string) => Promise<UserRecord | null>;

  /**
   * Persist the task to the database.
   * Returns the created task.
   */
  persistTask: (input: {
    userId: string;
    title: string;
    notes: string | null;
    source: 'email';
  }) => Promise<CreatedTask>;

  /**
   * Emit a real-time notification to the user's active sessions.
   * Fire-and-forget — the ingest pipeline does not wait for delivery.
   */
  notifyUser: (userId: string, task: CreatedTask) => void;

  /** HMAC secret used to verify address ownership. */
  ingestSecret: string;
}

// ---------------------------------------------------------------------------
// Title sanitization helpers (AC 7, 8)
// ---------------------------------------------------------------------------

export const TITLE_MAX_LENGTH = 500;

/**
 * Derives the task title from the email subject line.
 * - Truncates to TITLE_MAX_LENGTH chars (AC 7).
 * - Falls back to "Email task — {ISO date}" if subject is empty (AC 8).
 */
export function buildTaskTitle(subject: string, receivedAt?: number): string {
  const trimmed = subject.trim();
  if (!trimmed) {
    const date = new Date(receivedAt ? receivedAt * 1000 : Date.now())
      .toISOString()
      .slice(0, 10); // YYYY-MM-DD
    return `Email task — ${date}`;
  }
  return trimmed.slice(0, TITLE_MAX_LENGTH);
}

/**
 * Converts the email body (HTML preferred, falls back to text) to Markdown.
 * Returns null if both body fields are empty.
 */
export function buildTaskNotes(html: string, text: string): string | null {
  const source = html?.trim() ? html : text;
  if (!source?.trim()) return null;
  const markdown = html?.trim() ? htmlToMarkdown(html) : text.trim();
  return markdown || null;
}

// ---------------------------------------------------------------------------
// Sender verification (AC 5)
// ---------------------------------------------------------------------------

/**
 * Normalises an email address for comparison:
 * - Lowercase
 * - Strip display name (e.g. "Alice <alice@example.com>" → "alice@example.com")
 */
export function normaliseEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/) ?? raw.match(/([^\s,]+@[^\s,]+)/);
  const addr = match ? match[1]! : raw;
  return addr.toLowerCase().trim();
}

/**
 * Returns true if the sender's email matches the user's registered email
 * (case-insensitive, after stripping display names).
 */
export function isSenderAuthorised(fromRaw: string, userEmail: string): boolean {
  return normaliseEmail(fromRaw) === userEmail.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Address verification
// ---------------------------------------------------------------------------

/**
 * Verifies that the inbound `to` address token belongs to the candidate user.
 * Re-derives the HMAC to compare — prevents token forgery if the DB token
 * column is somehow leaked.
 */
export function isAddressOwner(
  toAddress: string,
  userId: string,
  secret: string,
): boolean {
  const inboundToken = extractTokenFromAddress(toAddress);
  if (!inboundToken) return false;
  const expectedToken = deriveEmailToken(userId, secret);
  return inboundToken === expectedToken;
}

// ---------------------------------------------------------------------------
// Main service handler
// ---------------------------------------------------------------------------

export interface HandleInboundResult {
  status: 'created' | 'rejected' | 'error';
  taskId?: string;
  reason?: string;
}

/**
 * Processes one inbound email webhook payload.
 *
 * Returns a result object describing the outcome.
 * Never throws — all errors are caught and returned as `{ status: 'error' }`.
 */
export async function handleInboundEmail(
  payload: InboundEmailPayload,
  deps: EmailIngestDeps,
): Promise<HandleInboundResult> {
  try {
    // 1. Extract token from recipient address.
    const token = extractTokenFromAddress(payload.to);
    if (!token) {
      return { status: 'rejected', reason: 'invalid-to-address' };
    }

    // 2. Look up user by token.
    const user = await deps.findUserByToken(token);
    if (!user) {
      // Silent reject — do not reveal that address exists (AC 5 security note).
      return { status: 'rejected', reason: 'user-not-found' };
    }

    // 3. Verify address ownership (defence in depth).
    if (!isAddressOwner(payload.to, user.id, deps.ingestSecret)) {
      return { status: 'rejected', reason: 'address-mismatch' };
    }

    // 4. Verify sender matches user's registered email (AC 5).
    if (!isSenderAuthorised(payload.from, user.email)) {
      // Silent reject — no bounce (AC 5 security note).
      return { status: 'rejected', reason: 'sender-not-authorised' };
    }

    // 5. Build title and notes (ACs 2, 3, 7, 8).
    const title = buildTaskTitle(payload.subject, payload.receivedAt);
    const notes = buildTaskNotes(payload.html, payload.text);

    // 6. Persist task (AC 2, 4 — within 60 s of receipt).
    const task = await deps.persistTask({
      userId: user.id,
      title,
      notes,
      source: 'email',
    });

    // 7. Notify active sessions (AC 6) — fire-and-forget.
    deps.notifyUser(user.id, task);

    return { status: 'created', taskId: task.id };
  } catch (err) {
    return {
      status: 'error',
      reason: err instanceof Error ? err.message : 'unknown-error',
    };
  }
}
