import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Client-side SQLite schema (Drizzle).
 * This is the local source of truth on every device.
 * Subset of the server PostgreSQL schema — only fields needed for offline display/queuing.
 */
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  project_id: text('project_id'),
  title: text('title').notNull(),
  status: text('status').notNull().default('inbox'),
  notes: text('notes'),
  due_date: text('due_date'),                     // YYYY-MM-DD
  energy_level: text('energy_level'),
  pinned_today: integer('pinned_today', { mode: 'boolean' }).notNull().default(false),
  today_sort_order: integer('today_sort_order'),
  deferred_count: integer('deferred_count').notNull().default(0),
  last_deferred_at: text('last_deferred_at'),
  deferral_prompt_shown: integer('deferral_prompt_shown', { mode: 'boolean' }).notNull().default(false),
  estimated_duration_minutes: integer('estimated_duration_minutes'),
  assignee_user_id: text('assignee_user_id'),
  source: text('source').notNull().default('manual'),
  completed_at: text('completed_at'),
  last_interacted_at: text('last_interacted_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  // Offline sync tracking (Story 1.1)
  pending_sync: integer('pending_sync', { mode: 'boolean' }).notNull().default(true),
  synced_at: text('synced_at'),
});

/**
 * Pending operations queue — for non-CRDT offline writes
 * (e.g., AI decompose, webhook management).
 * Regular task CRUD uses the CRDT (Yjs) path — see Story 1.1 offline sync.
 */
export const pending_operations = sqliteTable('pending_operations', {
  id: text('id').primaryKey(),
  operation: text('operation').notNull(),         // JSON: { type, entity, payload }
  created_at: text('created_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  last_error: text('last_error'),
});

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
