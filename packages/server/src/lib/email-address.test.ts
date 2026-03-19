import { describe, expect, it } from 'vitest';
import {
  deriveEmailToken,
  extractTokenFromAddress,
  generateForwardingAddress,
} from './email-address.js';

const TEST_SECRET = 'test-secret-32-chars-long-enough';
const TEST_DOMAIN = 'fwd.test.io';

describe('deriveEmailToken', () => {
  it('returns a 16-char lowercase hex string', () => {
    const token = deriveEmailToken('any-user-id', TEST_SECRET);
    expect(token).toHaveLength(16);
    expect(token).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic — same userId + secret always yields same token', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    expect(deriveEmailToken(userId, TEST_SECRET)).toBe(
      deriveEmailToken(userId, TEST_SECRET),
    );
  });

  it('produces different tokens for different userIds', () => {
    const a = deriveEmailToken('user-a', TEST_SECRET);
    const b = deriveEmailToken('user-b', TEST_SECRET);
    expect(a).not.toBe(b);
  });

  it('produces different tokens for same userId with different secrets', () => {
    const userId = 'user-1';
    expect(deriveEmailToken(userId, 'secret-a')).not.toBe(
      deriveEmailToken(userId, 'secret-b'),
    );
  });
});

describe('generateForwardingAddress', () => {
  it('returns a valid email address with the given domain', () => {
    const addr = generateForwardingAddress('user-1', TEST_SECRET, TEST_DOMAIN);
    expect(addr).toMatch(/^[0-9a-f]{16}@fwd\.test\.io$/);
  });

  it('is deterministic', () => {
    const userId = 'stable-user-id';
    const addr1 = generateForwardingAddress(userId, TEST_SECRET, TEST_DOMAIN);
    const addr2 = generateForwardingAddress(userId, TEST_SECRET, TEST_DOMAIN);
    expect(addr1).toBe(addr2);
  });

  it('produces no collisions across 10,000 synthetic user IDs', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const userId = `user-${i}-${Math.random()}`;
      const addr = generateForwardingAddress(userId, TEST_SECRET, TEST_DOMAIN);
      expect(seen.has(addr)).toBe(false);
      seen.add(addr);
    }
    expect(seen.size).toBe(10_000);
  });
});

describe('extractTokenFromAddress', () => {
  it('returns the token local-part from a valid address', () => {
    const addr = generateForwardingAddress('user-x', TEST_SECRET, TEST_DOMAIN);
    const token = extractTokenFromAddress(addr);
    expect(token).toHaveLength(16);
    expect(token).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns null for an address with wrong-length local part', () => {
    expect(extractTokenFromAddress('short@domain.io')).toBeNull();
  });

  it('returns null for an address with non-hex local part', () => {
    expect(extractTokenFromAddress('zzzzzzzzzzzzzzzz@domain.io')).toBeNull();
  });

  it('returns null for a malformed address with no @', () => {
    expect(extractTokenFromAddress('nodomain')).toBeNull();
  });
});
