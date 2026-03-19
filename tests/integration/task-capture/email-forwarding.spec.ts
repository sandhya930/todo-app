/**
 * Integration Tests — Story 1.3: Email-to-Task Forwarding
 *
 * Tests the full inbound email webhook pipeline:
 *   inbound payload → EmailIngestService → task persisted → notification dispatched
 *
 * Uses in-memory mocks for findUserByToken and persistTask.
 * SSE notifier is tested via the exported notifyUser function.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleInboundEmail } from '../../../packages/server/src/services/email-ingest.service.js';
import {
  addConnection,
  clearAllConnections,
  connectionCount,
} from '../../../packages/server/src/lib/sse-notifier.js';
import { generateForwardingAddress } from '../../../packages/server/src/lib/email-address.js';
import type {
  EmailIngestDeps,
  InboundEmailPayload,
  UserRecord,
} from '../../../packages/server/src/services/email-ingest.service.js';
import type { FastifyReply } from 'fastify';

const TEST_SECRET = 'integration-test-secret-32-chars';
const TEST_DOMAIN = 'fwd.test.io';

const USER: UserRecord = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  email: 'user@example.com',
  emailIngestToken: '',
};

const FORWARDING_ADDRESS = generateForwardingAddress(USER.id, TEST_SECRET, TEST_DOMAIN);

function makeDeps(overrides: Partial<EmailIngestDeps> = {}): EmailIngestDeps {
  return {
    findUserByToken: vi.fn(async () => USER),
    persistTask: vi.fn(async (input) => ({
      id: 'task-integration-1',
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
    from: USER.email,
    to: FORWARDING_ADDRESS,
    subject: 'Action item from client call',
    text: 'Please send revised proposal by Friday.',
    html: '<p>Please send <strong>revised proposal</strong> by Friday.</p>',
    receivedAt: 1710000000,
    ...overrides,
  };
}

describe('Email forwarding integration', () => {
  beforeEach(() => {
    clearAllConnections();
  });

  it('valid inbound email → task created in DB with correct title and notes (AC 2, 3)', async () => {
    const deps = makeDeps();
    const result = await handleInboundEmail(makePayload(), deps);

    expect(result.status).toBe('created');
    expect(deps.persistTask).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER.id,
        title: 'Action item from client call',
        source: 'email',
      }),
    );

    const call = vi.mocked(deps.persistTask).mock.calls[0]![0];
    // HTML body should be converted to Markdown (AC 3)
    expect(call.notes).toContain('**revised proposal**');
  });

  it('unauthorized sender → task NOT created (AC 5)', async () => {
    const deps = makeDeps();
    const result = await handleInboundEmail(
      makePayload({ from: 'attacker@evil.com' }),
      deps,
    );

    expect(result.status).toBe('rejected');
    expect(deps.persistTask).not.toHaveBeenCalled();
  });

  it('unknown forwarding address → task NOT created (AC 5)', async () => {
    const deps = makeDeps({ findUserByToken: vi.fn(async () => null) });
    const result = await handleInboundEmail(makePayload(), deps);

    expect(result.status).toBe('rejected');
    expect(deps.persistTask).not.toHaveBeenCalled();
  });

  it('real-time notification dispatched after task creation (AC 6)', async () => {
    const notifyUser = vi.fn();
    const deps = makeDeps({ notifyUser });

    await handleInboundEmail(makePayload(), deps);

    expect(notifyUser).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({ id: 'task-integration-1' }),
    );
  });

  it('SSE connection receives notification event', async () => {
    const mockWrite = vi.fn();
    const mockReply = { raw: { write: mockWrite } } as unknown as FastifyReply;
    addConnection(USER.id, mockReply);
    expect(connectionCount(USER.id)).toBe(1);

    // Simulate what the route does after task creation
    const { notifyUser } = await import(
      '../../../packages/server/src/lib/sse-notifier.js'
    );
    notifyUser(USER.id, { taskId: 'task-integration-1', title: 'Action item from client call' });

    expect(mockWrite).toHaveBeenCalledWith(
      expect.stringContaining('"type":"task.created"'),
    );
    expect(mockWrite).toHaveBeenCalledWith(
      expect.stringContaining('"taskId":"task-integration-1"'),
    );
  });

  it('empty subject uses fallback title (AC 8)', async () => {
    const deps = makeDeps();
    await handleInboundEmail(makePayload({ subject: '' }), deps);
    const call = vi.mocked(deps.persistTask).mock.calls[0]![0];
    expect(call.title).toMatch(/^Email task — \d{4}-\d{2}-\d{2}$/);
  });

  it('long subject is truncated to 500 chars (AC 7)', async () => {
    const deps = makeDeps();
    await handleInboundEmail(makePayload({ subject: 'Z'.repeat(600) }), deps);
    const call = vi.mocked(deps.persistTask).mock.calls[0]![0];
    expect(call.title).toHaveLength(500);
  });
});
