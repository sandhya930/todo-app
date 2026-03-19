import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addConnection,
  clearAllConnections,
  connectionCount,
  notifyUser,
  removeConnection,
} from './sse-notifier.js';
import type { FastifyReply } from 'fastify';

function makeMockReply(): FastifyReply {
  return {
    raw: { write: vi.fn() },
  } as unknown as FastifyReply;
}

describe('SSE notifier', () => {
  beforeEach(() => clearAllConnections());
  afterEach(() => clearAllConnections());

  it('adds and counts connections', () => {
    const r1 = makeMockReply();
    const r2 = makeMockReply();
    addConnection('user-1', r1);
    addConnection('user-1', r2);
    expect(connectionCount('user-1')).toBe(2);
  });

  it('removes a specific connection', () => {
    const r = makeMockReply();
    addConnection('user-1', r);
    removeConnection('user-1', r);
    expect(connectionCount('user-1')).toBe(0);
  });

  it('cleans up user entry when last connection removed', () => {
    const r = makeMockReply();
    addConnection('user-1', r);
    removeConnection('user-1', r);
    expect(connectionCount('user-1')).toBe(0);
  });

  it('notifyUser sends SSE event to all user connections', () => {
    const r1 = makeMockReply();
    const r2 = makeMockReply();
    addConnection('user-1', r1);
    addConnection('user-1', r2);

    notifyUser('user-1', { taskId: 'task-abc', title: 'Buy milk' });

    const expected = `data: ${JSON.stringify({ type: 'task.created', taskId: 'task-abc', title: 'Buy milk' })}\n\n`;
    expect(r1.raw.write).toHaveBeenCalledWith(expected);
    expect(r2.raw.write).toHaveBeenCalledWith(expected);
  });

  it('notifyUser is a no-op when user has no connections', () => {
    // Should not throw
    expect(() => notifyUser('no-connections', { taskId: 't', title: 'T' })).not.toThrow();
  });

  it('prunes dead connections that throw on write', () => {
    const deadReply = {
      raw: { write: vi.fn(() => { throw new Error('stream closed'); }) },
    } as unknown as FastifyReply;
    const liveReply = makeMockReply();

    addConnection('user-2', deadReply);
    addConnection('user-2', liveReply);
    expect(connectionCount('user-2')).toBe(2);

    notifyUser('user-2', { taskId: 't', title: 'T' });

    expect(connectionCount('user-2')).toBe(1);
    expect(liveReply.raw.write).toHaveBeenCalled();
  });
});
