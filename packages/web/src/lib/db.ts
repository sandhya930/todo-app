/**
 * Database abstraction layer.
 *
 * Browser: uses better-sqlite3 via the Node.js shim during tests,
 * or wa-sqlite (OPFS) in production builds.
 *
 * In tests: call initDb(betterSqlite3Database) to inject a test DB.
 * In browser: call initDb() with no args to open OPFS-backed SQLite.
 *
 * All application code imports `getDb()` — never construct directly.
 */
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@todo-app/shared';

export type AppDb = BetterSQLite3Database<typeof schema>;

let _db: AppDb | null = null;

/**
 * Initialize the database. Must be called once at app startup (or in test setup).
 * @param sqliteInstance - A better-sqlite3 Database instance.
 *   In production this comes from the OPFS adapter.
 *   In tests this comes from `new Database(':memory:')`.
 */
export function initDb(sqliteInstance: Parameters<typeof drizzle>[0]): AppDb {
  _db = drizzle(sqliteInstance, { schema });
  return _db;
}

export function getDb(): AppDb {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.');
  return _db;
}

/** SQL for creating the tasks table — run on first launch / migration. */
export const MIGRATIONS_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    project_id              TEXT,
    title                   TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'inbox',
    notes                   TEXT,
    due_date                TEXT,
    energy_level            TEXT,
    pinned_today            INTEGER NOT NULL DEFAULT 0,
    today_sort_order        INTEGER,
    deferred_count          INTEGER NOT NULL DEFAULT 0,
    last_deferred_at        TEXT,
    deferral_prompt_shown   INTEGER NOT NULL DEFAULT 0,
    estimated_duration_minutes INTEGER,
    assignee_user_id        TEXT,
    source                  TEXT NOT NULL DEFAULT 'manual',
    completed_at            TEXT,
    last_interacted_at      TEXT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    pending_sync            INTEGER NOT NULL DEFAULT 1,
    synced_at               TEXT
  );

  CREATE TABLE IF NOT EXISTS pending_operations (
    id          TEXT PRIMARY KEY,
    operation   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_user_due    ON tasks(user_id, due_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_pending     ON tasks(user_id, pending_sync);
`;
