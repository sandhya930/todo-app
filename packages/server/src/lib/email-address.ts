/**
 * Forwarding email address generation.
 *
 * Scheme: {16-char-hex-token}@fwd.todoapp.io
 *
 * The token is HMAC-SHA256(userId, INGEST_EMAIL_SECRET).slice(0, 16).
 * This is:
 *   - Deterministic: same userId always yields the same address.
 *   - Unique: UUID v4 userId collisions are astronomically unlikely.
 *   - Non-guessable: requires knowing the server secret.
 *   - Short: 16 hex chars = 64-bit security before needing the secret.
 *
 * Domain is read from INGEST_EMAIL_DOMAIN env var (default: fwd.todoapp.io).
 * The same domain must be configured in the inbound email provider
 * (e.g., SendGrid Inbound Parse MX record).
 */
import { createHmac } from 'node:crypto';

const DEFAULT_DOMAIN = 'fwd.todoapp.io';

/**
 * Returns the configured ingest domain from the environment.
 * Falls back to the default domain when the variable is not set
 * (e.g., in unit tests that don't need a real domain).
 */
export function getIngestDomain(): string {
  return process.env['INGEST_EMAIL_DOMAIN'] ?? DEFAULT_DOMAIN;
}

/**
 * Returns the HMAC secret used to sign forwarding addresses.
 * Throws in production when the variable is absent to surface
 * misconfiguration early.
 */
export function getIngestSecret(): string {
  const secret = process.env['INGEST_EMAIL_SECRET'];
  if (!secret) {
    throw new Error('INGEST_EMAIL_SECRET environment variable is not set.');
  }
  return secret;
}

/**
 * Derives the 16-character hex token for a given userId.
 *
 * @param userId  UUID of the user account.
 * @param secret  HMAC secret — pass explicitly to keep functions pure and
 *                testable without relying on process.env.
 */
export function deriveEmailToken(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(userId).digest('hex').slice(0, 16);
}

/**
 * Generates the full forwarding email address for a user.
 *
 * @param userId  UUID of the user account.
 * @param secret  HMAC secret (default: read from INGEST_EMAIL_SECRET env var).
 * @param domain  Ingest domain (default: read from INGEST_EMAIL_DOMAIN env var).
 */
export function generateForwardingAddress(
  userId: string,
  secret: string = getIngestSecret(),
  domain: string = getIngestDomain(),
): string {
  const token = deriveEmailToken(userId, secret);
  return `${token}@${domain}`;
}

/**
 * Looks up a userId from an inbound email recipient address.
 * Returns null if the address token does not match any known userId.
 *
 * In production this is replaced by a DB lookup
 * (see EmailIngestService.resolveUserByAddress).
 */
export function extractTokenFromAddress(address: string): string | null {
  const local = address.split('@')[0];
  if (!local || local.length !== 16 || !/^[0-9a-f]+$/.test(local)) return null;
  return local;
}
