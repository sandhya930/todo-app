/**
 * Task status enum.
 * IMPORTANT: "overdue" is intentionally absent — use "deferred" instead.
 * Auto-deferral runs at midnight via the deferral job (Story 3.2).
 */
export const TASK_STATUSES = ['inbox', 'active', 'deferred', 'someday', 'completed', 'archived'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ENERGY_LEVELS = ['high_focus', 'low_focus', 'no_brainer'] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];

export const TASK_SOURCES = ['manual', 'ai_decomp', 'email', 'api', 'voice'] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

/**
 * Core Task interface — shared between web, mobile, server, and CLI.
 * Matches the Drizzle client schema and Prisma server schema.
 */
export interface Task {
  // Required fields (Story 1.1)
  id: string;                          // UUID v4
  user_id: string;
  title: string;                       // max 500 chars
  status: TaskStatus;
  created_at: string;                  // ISO 8601 UTC
  updated_at: string;

  // Optional fields (Story 1.1 — defined but null/unset in this story)
  due_date: string | null;             // YYYY-MM-DD
  project_id: string | null;
  energy_level: EnergyLevel | null;
  notes: string | null;                // raw Markdown (Story 6.2)
  estimated_duration_minutes: number | null;
  assignee_user_id: string | null;
  source: TaskSource;

  // Story 2.1 fields (added later — defined here for schema completeness)
  pinned_today: boolean;
  today_sort_order: number | null;

  // Story 3.2 fields
  deferred_count: number;
  last_deferred_at: string | null;
  deferral_prompt_shown: boolean;

  // Story 4.3 fields
  completed_at: string | null;
  last_interacted_at: string | null;

  // Offline sync (Story 1.1)
  pending_sync: boolean;               // true until successfully synced to server
  synced_at: string | null;           // last successful sync timestamp
}

/**
 * Input shape for creating a new task (Story 1.1 scope).
 * Only title is required; all other fields are optional.
 */
export interface CreateTaskInput {
  title: string;
  user_id: string;
  due_date?: string | null;
  project_id?: string | null;
  energy_level?: EnergyLevel | null;
  notes?: string | null;
  estimated_duration_minutes?: number | null;
  status?: TaskStatus;
  source?: TaskSource;
}
