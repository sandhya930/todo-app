import { v4 as uuidv4 } from 'uuid';
import DOMPurify from 'dompurify';
import { eq } from 'drizzle-orm';
import {
  CreateTaskSchema,
  tasks,
  type Task,
  type CreateTaskInput,
} from '@todo-app/shared';
import { getDb } from '../lib/db.js';

/**
 * Sanitizes a task title to prevent XSS in the web renderer.
 * Strips all HTML tags — titles are plain text only.
 */
function sanitizeTitle(raw: string): string {
  return DOMPurify.sanitize(raw, { ALLOWED_TAGS: [] }).trim();
}

/**
 * Creates a task and persists it to the local SQLite database.
 *
 * CONTRACT (AC 3, 4):
 * - Local DB write completes synchronously before this function returns.
 * - Network/sync is fire-and-forget AFTER this returns.
 * - Returns the saved Task object immediately.
 *
 * OFFLINE (AC 8):
 * - `pending_sync: true` is always set on creation.
 * - The sync worker (Story CRDT layer) clears this flag after successful server sync.
 * - Task is fully usable offline; no network dependency.
 */
export function createTask(input: CreateTaskInput): Task {
  // 1. Validate input
  const parsed = CreateTaskSchema.parse(input);

  // 2. Sanitize title (XSS prevention per Dev Notes)
  const title = sanitizeTitle(parsed.title);
  if (title.length === 0) {
    throw new Error('Title cannot be empty after sanitization');
  }

  const now = new Date().toISOString();
  const id = uuidv4();

  const newTask: Task = {
    id,
    user_id: parsed.user_id,
    title,
    status: parsed.status ?? 'inbox',
    created_at: now,
    updated_at: now,
    due_date: parsed.due_date ?? null,
    project_id: parsed.project_id ?? null,
    energy_level: parsed.energy_level ?? null,
    notes: parsed.notes ?? null,
    estimated_duration_minutes: parsed.estimated_duration_minutes ?? null,
    assignee_user_id: null,
    source: parsed.source ?? 'manual',
    pinned_today: false,
    today_sort_order: null,
    deferred_count: 0,
    last_deferred_at: null,
    deferral_prompt_shown: false,
    completed_at: null,
    last_interacted_at: now,
    // Offline sync — pending until synced with server
    pending_sync: true,
    synced_at: null,
  };

  // 3. Write to local DB (synchronous — must complete before returning)
  const db = getDb();
  db.insert(tasks).values(newTask).run();

  // 4. Trigger async sync (fire-and-forget — must NOT block return)
  //    The CRDT/Yjs sync layer (Story 1.1 + full arch from Story 05-offline-sync)
  //    will pick this up. For now, a simple sync dispatcher stub.
  void triggerSyncAsync(id);

  return newTask;
}

/**
 * Retrieves a single task by ID from the local DB.
 * Returns null if not found.
 */
export function getTaskById(id: string): Task | null {
  const db = getDb();
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  return row ? (row as Task) : null;
}

/**
 * Retrieves all tasks for a user with the given status(es).
 */
export function getTasksByStatus(userId: string, status: Task['status'] | Task['status'][]): Task[] {
  const db = getDb();
  const statuses = Array.isArray(status) ? status : [status];
  const rows = db
    .select()
    .from(tasks)
    .where(eq(tasks.user_id, userId))
    .all()
    .filter((r) => statuses.includes(r.status as Task['status']));
  return rows as Task[];
}

/**
 * Retrieves all Inbox tasks for a user, ordered by created_at DESC (newest first).
 */
export function getInboxTasks(userId: string): Task[] {
  const db = getDb();
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.user_id, userId))
    .all()
    .filter((r) => r.status === 'inbox')
    .sort((a, b) => b.created_at.localeCompare(a.created_at)) as Task[];
}

/**
 * Marks a task as synced (clears pending_sync flag).
 * Called by the sync worker after successful server sync.
 */
export function markTaskSynced(id: string): void {
  const db = getDb();
  db.update(tasks)
    .set({ pending_sync: false, synced_at: new Date().toISOString() })
    .where(eq(tasks.id, id))
    .run();
}

/**
 * Stub: async sync trigger.
 * In the full implementation this enqueues a Yjs delta via the WebSocket provider.
 * Replaced by the full CRDT sync architecture (docs/architecture/05-offline-sync.md).
 */
async function triggerSyncAsync(_taskId: string): Promise<void> {
  // No-op stub — CRDT sync layer wires this up in Story 1.1 full arch pass
}
