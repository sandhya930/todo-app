/**
 * Server-Sent Events (SSE) notifier.
 *
 * Maintains a registry of active SSE connections keyed by userId.
 * When an email task is created, the ingest service calls `notifyUser()`
 * to push a real-time event to all of that user's open tabs (AC 6).
 *
 * The SSE endpoint is mounted at GET /api/events and requires a valid
 * JWT (same Supabase auth as all other API routes — Story 1.4).
 *
 * This module is intentionally side-effect-free and purely in-memory.
 * If the server restarts or the user has no open connection, the
 * notification is silently dropped (AC 6: "silent otherwise").
 */

import type { FastifyReply } from 'fastify';

export interface SseConnection {
  userId: string;
  reply: FastifyReply;
}

// In-memory registry: userId → Set of open SSE reply objects.
const registry = new Map<string, Set<FastifyReply>>();

/**
 * Registers an SSE connection for a user.
 * Called when a client opens GET /api/events.
 */
export function addConnection(userId: string, reply: FastifyReply): void {
  if (!registry.has(userId)) {
    registry.set(userId, new Set());
  }
  registry.get(userId)!.add(reply);
}

/**
 * Removes a connection (called on client disconnect / server cleanup).
 */
export function removeConnection(userId: string, reply: FastifyReply): void {
  registry.get(userId)?.delete(reply);
  if (registry.get(userId)?.size === 0) {
    registry.delete(userId);
  }
}

/**
 * Returns the number of active connections for a user (for testing).
 */
export function connectionCount(userId: string): number {
  return registry.get(userId)?.size ?? 0;
}

/**
 * Clears all connections (for test teardown only).
 */
export function clearAllConnections(): void {
  registry.clear();
}

/**
 * Sends a `task.created` SSE event to all active connections for userId.
 * Dead connections are pruned on send failure.
 */
export function notifyUser(
  userId: string,
  payload: { taskId: string; title: string },
): void {
  const connections = registry.get(userId);
  if (!connections || connections.size === 0) return;

  const data = JSON.stringify({ type: 'task.created', ...payload });
  const dead: FastifyReply[] = [];

  for (const reply of connections) {
    try {
      reply.raw.write(`data: ${data}\n\n`);
    } catch {
      dead.push(reply);
    }
  }

  for (const reply of dead) {
    removeConnection(userId, reply);
  }
}
