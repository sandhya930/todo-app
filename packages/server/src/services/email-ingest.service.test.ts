import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTaskTitle,
  buildTaskNotes,
  handleInboundEmail,
  isSenderAuthorised,
  isAddressOwner,
  normaliseEmail,
  TITLE_MAX_LENGTH,
  type EmailIngestDeps,
  type InboundEmailPayload,
  type UserRecord,
} from './email-ingest.service.js';
import { generateForwardingAddress } from '../lib/email-address.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret-at-least-32-chars-ok';
const TEST_DOMAIN = 'fwd.test.io';
const TEST_USER: UserRecord = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'alice@example.com',
  emailIngestToken: '',
};

function makeForwardingAddress(userId: string): string {
  return generateForwardingAddress(userId, TEST_SECRET, TEST_DOMAIN);
}

function makeDeps(overrides: Partial<EmailIngestDeps> = {}): EmailIngestDeps {
  return {
    findUserByToken: vi.fn(async () => TEST_USER),
    persistTask: vi.fn(async (input) => ({
      id: 'task-1',
      title: input.title,
      notes: input.notes,
      source: input.source,
    })),
    notifyUser: vi.fn(),
    ingestSecret: TEST_SECRET,
    ...overrides,
  };
}

function makePayload(overrides: Partial<InboundEmailPayload> = {}): InboundEmailPayload {
  return {
    from: 'alice@example.com',
    to: makeForwardingAddress(TEST_USER.id),
    subject: 'Follow up with design team',
    text: 'Please review the mockups.',
    html: '<p>Please <strong>review</strong> the mockups.</p>',
    receivedAt: 1710000000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildTaskTitle
// ---------------------------------------------------------------------------

describe('buildTaskTitle', () => {
  it('returns the subject when non-empty', () => {
    expect(buildTaskTitle('Buy milk')).toBe('Buy milk');
  });

  it('trims leading/trailing whitespace', () => {
    expect(buildTaskTitle('  Book dentist  ')).toBe('Book dentist');
  });

  it(`truncates subject to ${TITLE_MAX_LENGTH} chars (AC 7)`, () => {
    const long = 'A'.repeat(600);
    expect(buildTaskTitle(long)).toHaveLength(TITLE_MAX_LENGTH);
  });

  it('falls back to "Email task — YYYY-MM-DD" when subject is empty (AC 8)', () => {
    const title = buildTaskTitle('', 1710000000);
    expect(title).toMatch(/^Email task — \d{4}-\d{2}-\d{2}$/);
  });

  it('falls back using current date when receivedAt is absent', () => {
    const title = buildTaskTitle('  ');
    expect(title).toMatch(/^Email task — \d{4}-\d{2}-\d{2}$/);
  });

  it('returns exactly 500 chars for a 500-char subject (no truncation)', () => {
    const subject = 'B'.repeat(500);
    expect(buildTaskTitle(subject)).toHaveLength(500);
  });
});

// ---------------------------------------------------------------------------
// buildTaskNotes
// ---------------------------------------------------------------------------

describe('buildTaskNotes', () => {
  it('converts HTML body to Markdown', () => {
    const notes = buildTaskNotes('<p>Hello <strong>world</strong></p>', '');
    expect(notes).toContain('**world**');
  });

  it('falls back to plain text when HTML is empty', () => {
    const notes = buildTaskNotes('', 'Plain text body');
    expect(notes).toBe('Plain text body');
  });

  it('returns null when both body fields are empty', () => {
    expect(buildTaskNotes('', '')).toBeNull();
    expect(buildTaskNotes('   ', '   ')).toBeNull();
  });

  it('strips script tags from HTML body', () => {
    const notes = buildTaskNotes(
      '<p>ok</p><script>alert("xss")</script>',
      '',
    );
    expect(notes).not.toContain('script');
    expect(notes).not.toContain('alert');
    expect(notes).toContain('ok');
  });
});

// ---------------------------------------------------------------------------
// normaliseEmail / isSenderAuthorised
// ---------------------------------------------------------------------------

describe('normaliseEmail', () => {
  it('strips display name and lowercases', () => {
    expect(normaliseEmail('Alice <ALICE@Example.com>')).toBe('alice@example.com');
  });

  it('handles bare email address', () => {
    expect(normaliseEmail('Alice@Example.COM')).toBe('alice@example.com');
  });
});

describe('isSenderAuthorised', () => {
  it('returns true when from matches user email (case-insensitive)', () => {
    expect(isSenderAuthorised('ALICE@Example.com', 'alice@example.com')).toBe(true);
  });

  it('returns true with display name in from field', () => {
    expect(isSenderAuthorised('Alice Smith <alice@example.com>', 'alice@example.com')).toBe(true);
  });

  it('returns false when from is a different email', () => {
    expect(isSenderAuthorised('evil@attacker.com', 'alice@example.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAddressOwner
// ---------------------------------------------------------------------------

describe('isAddressOwner', () => {
  it('returns true when to address matches userId + secret', () => {
    const to = makeForwardingAddress(TEST_USER.id);
    expect(isAddressOwner(to, TEST_USER.id, TEST_SECRET)).toBe(true);
  });

  it('returns false for wrong userId', () => {
    const to = makeForwardingAddress(TEST_USER.id);
    expect(isAddressOwner(to, 'wrong-user-id', TEST_SECRET)).toBe(false);
  });

  it('returns false for invalid address format', () => {
    expect(isAddressOwner('bad@address.io', TEST_USER.id, TEST_SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleInboundEmail — integration
// ---------------------------------------------------------------------------

describe('handleInboundEmail', () => {
  let deps: EmailIngestDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('creates a task for a valid inbound email', async () => {
    const result = await handleInboundEmail(makePayload(), deps);
    expect(result.status).toBe('created');
    expect(result.taskId).toBe('task-1');
    expect(deps.persistTask).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER.id,
        title: 'Follow up with design team',
        source: 'email',
      }),
    );
  });

  it('notifies the user after task creation (AC 6)', async () => {
    await handleInboundEmail(makePayload(), deps);
    expect(deps.notifyUser).toHaveBeenCalledWith(TEST_USER.id, expect.objectContaining({ id: 'task-1' }));
  });

  it('silently rejects when user is not found (AC 5)', async () => {
    deps = makeDeps({ findUserByToken: vi.fn(async () => null) });
    const result = await handleInboundEmail(makePayload(), deps);
    expect(result.status).toBe('rejected');
    expect(deps.persistTask).not.toHaveBeenCalled();
  });

  it('silently rejects when sender does not match user email (AC 5)', async () => {
    const result = await handleInboundEmail(
      makePayload({ from: 'attacker@evil.com' }),
      deps,
    );
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('sender-not-authorised');
    expect(deps.persistTask).not.toHaveBeenCalled();
  });

  it('uses fallback title for empty subject (AC 8)', async () => {
    await handleInboundEmail(makePayload({ subject: '' }), deps);
    const call = vi.mocked(deps.persistTask).mock.calls[0]![0];
    expect(call.title).toMatch(/^Email task — \d{4}-\d{2}-\d{2}$/);
  });

  it('truncates subject > 500 chars (AC 7)', async () => {
    const long = 'X'.repeat(600);
    await handleInboundEmail(makePayload({ subject: long }), deps);
    const call = vi.mocked(deps.persistTask).mock.calls[0]![0];
    expect(call.title).toHaveLength(500);
  });

  it('rejects when to address token is invalid', async () => {
    const result = await handleInboundEmail(
      makePayload({ to: 'invalid@fwd.test.io' }),
      deps,
    );
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('invalid-to-address');
  });

  it('sets notes to null when body is empty', async () => {
    await handleInboundEmail(makePayload({ html: '', text: '' }), deps);
    const call = vi.mocked(deps.persistTask).mock.calls[0]![0];
    expect(call.notes).toBeNull();
  });

  it('returns error status when persistTask throws', async () => {
    deps = makeDeps({
      persistTask: vi.fn(async () => { throw new Error('DB down'); }),
    });
    const result = await handleInboundEmail(makePayload(), deps);
    expect(result.status).toBe('error');
    expect(result.reason).toBe('DB down');
  });
});
