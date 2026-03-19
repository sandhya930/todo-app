import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, getInboxTasks, getTaskById, getTasksByStatus, markTaskSynced } from './task.service.js';
import { initDb, MIGRATIONS_SQL } from '../lib/db.js';

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function setupTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(MIGRATIONS_SQL);
  initDb(sqlite);
  return sqlite;
}

describe('createTask', () => {
  let sqlite: ReturnType<typeof Database>;

  beforeEach(() => {
    sqlite = setupTestDb();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('creates a task with required fields and returns it', () => {
    const task = createTask({ title: 'Buy groceries', user_id: TEST_USER_ID });

    expect(task.id).toBeTruthy();
    expect(task.title).toBe('Buy groceries');
    expect(task.user_id).toBe(TEST_USER_ID);
    expect(task.status).toBe('inbox');
    expect(task.created_at).toBeTruthy();
    expect(task.updated_at).toBeTruthy();
  });

  it('persists the task to local DB before returning (AC 4)', () => {
    const task = createTask({ title: 'Persisted task', user_id: TEST_USER_ID });
    const fetched = getTaskById(task.id);

    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Persisted task');
  });

  it('sets pending_sync: true on creation (offline-first, AC 8)', () => {
    const task = createTask({ title: 'Offline task', user_id: TEST_USER_ID });
    expect(task.pending_sync).toBe(true);
  });

  it('sets all optional fields to null when not provided', () => {
    const task = createTask({ title: 'Minimal task', user_id: TEST_USER_ID });

    expect(task.due_date).toBeNull();
    expect(task.project_id).toBeNull();
    expect(task.energy_level).toBeNull();
    expect(task.notes).toBeNull();
    expect(task.estimated_duration_minutes).toBeNull();
    expect(task.assignee_user_id).toBeNull();
    expect(task.completed_at).toBeNull();
  });

  it('generates a unique ID for each task', () => {
    const t1 = createTask({ title: 'Task 1', user_id: TEST_USER_ID });
    const t2 = createTask({ title: 'Task 2', user_id: TEST_USER_ID });
    expect(t1.id).not.toBe(t2.id);
  });

  it('accepts title at exactly 500 characters', () => {
    const title = 'a'.repeat(500);
    const task = createTask({ title, user_id: TEST_USER_ID });
    expect(task.title).toBe(title);
  });

  it('rejects title exceeding 500 characters', () => {
    const title = 'a'.repeat(501);
    expect(() => createTask({ title, user_id: TEST_USER_ID })).toThrow();
  });

  it('rejects empty title', () => {
    expect(() => createTask({ title: '', user_id: TEST_USER_ID })).toThrow();
  });

  it('strips HTML tags from title (XSS prevention)', () => {
    const task = createTask({
      title: '<script>alert(1)</script>Buy milk',
      user_id: TEST_USER_ID,
    });
    expect(task.title).toBe('Buy milk');
    expect(task.title).not.toContain('<script>');
  });

  it('simulates offline creation — pending_sync remains true without network', () => {
    // Simulate offline: no network available
    // Task should still be created locally with pending_sync = true
    const task = createTask({ title: 'Offline task', user_id: TEST_USER_ID });

    expect(task.pending_sync).toBe(true);
    expect(task.synced_at).toBeNull();

    // Verify it's retrievable locally even without sync
    const local = getTaskById(task.id);
    expect(local).not.toBeNull();
    expect(local?.pending_sync).toBe(true);
  });

  it('does not block on sync — createTask returns synchronously', () => {
    const start = Date.now();
    createTask({ title: 'Sync timing test', user_id: TEST_USER_ID });
    const elapsed = Date.now() - start;

    // Should return well under 100ms target (AC 3)
    expect(elapsed).toBeLessThan(100);
  });
});

describe('markTaskSynced', () => {
  let sqlite: ReturnType<typeof Database>;

  beforeEach(() => {
    sqlite = setupTestDb();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('clears pending_sync and sets synced_at after successful sync', () => {
    const task = createTask({ title: 'Sync test', user_id: TEST_USER_ID });
    expect(task.pending_sync).toBe(true);

    markTaskSynced(task.id);

    const updated = getTaskById(task.id);
    expect(updated?.pending_sync).toBe(false);
    expect(updated?.synced_at).toBeTruthy();
  });
});

describe('getInboxTasks', () => {
  let sqlite: ReturnType<typeof Database>;

  beforeEach(() => {
    sqlite = setupTestDb();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns tasks ordered newest first', () => {
    // Monotonically increasing per call — avoids cycling so DOMPurify's own
    // toISOString() calls don't collide with the task created_at timestamps.
    // Returns a plain string to prevent infinite recursion from calling
    // new Date().toISOString() inside the mock.
    let tick = 0;
    vi.spyOn(Date.prototype, 'toISOString').mockImplementation(
      () => `2024-01-01T00:00:${String(++tick).padStart(2, '0')}.000Z`,
    );

    createTask({ title: 'First', user_id: TEST_USER_ID });
    createTask({ title: 'Second', user_id: TEST_USER_ID });
    createTask({ title: 'Third', user_id: TEST_USER_ID });

    vi.restoreAllMocks();

    const inbox = getInboxTasks(TEST_USER_ID);
    expect(inbox[0]?.title).toBe('Third');
    expect(inbox[2]?.title).toBe('First');
  });

  it('only returns inbox-status tasks', () => {
    createTask({ title: 'Inbox task', user_id: TEST_USER_ID });
    createTask({ title: 'Active task', user_id: TEST_USER_ID, status: 'active' });

    const inbox = getInboxTasks(TEST_USER_ID);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.title).toBe('Inbox task');
  });
});

describe('getTasksByStatus', () => {
  let sqlite: ReturnType<typeof Database>;

  beforeEach(() => {
    sqlite = setupTestDb();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns tasks matching a single status', () => {
    createTask({ title: 'Inbox task', user_id: TEST_USER_ID, status: 'inbox' });
    createTask({ title: 'Active task', user_id: TEST_USER_ID, status: 'active' });

    const active = getTasksByStatus(TEST_USER_ID, 'active');
    expect(active).toHaveLength(1);
    expect(active[0]?.title).toBe('Active task');
  });

  it('returns tasks matching multiple statuses', () => {
    createTask({ title: 'Inbox task', user_id: TEST_USER_ID, status: 'inbox' });
    createTask({ title: 'Active task', user_id: TEST_USER_ID, status: 'active' });
    createTask({ title: 'Deferred task', user_id: TEST_USER_ID, status: 'deferred' });

    const result = getTasksByStatus(TEST_USER_ID, ['inbox', 'active']);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no matches', () => {
    createTask({ title: 'Inbox task', user_id: TEST_USER_ID, status: 'inbox' });

    const result = getTasksByStatus(TEST_USER_ID, 'completed');
    expect(result).toHaveLength(0);
  });
});
