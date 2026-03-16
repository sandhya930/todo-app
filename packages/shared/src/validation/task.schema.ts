import { z } from 'zod';
import { ENERGY_LEVELS, TASK_SOURCES, TASK_STATUSES } from '../types/task.js';

export const TITLE_MAX_LENGTH = 500;
export const TITLE_WARN_LENGTH = 480;

export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const EnergyLevelSchema = z.enum(ENERGY_LEVELS);
export const TaskSourceSchema = z.enum(TASK_SOURCES);

export const CreateTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(TITLE_MAX_LENGTH, `Title must be ${TITLE_MAX_LENGTH} characters or fewer`),
  user_id: z.string().uuid('user_id must be a valid UUID'),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD')
    .optional()
    .nullable(),
  project_id: z.string().uuid().optional().nullable(),
  energy_level: EnergyLevelSchema.optional().nullable(),
  notes: z.string().max(10_000).optional().nullable(),
  estimated_duration_minutes: z.number().int().min(1).max(1440).optional().nullable(),
  status: TaskStatusSchema.optional().default('inbox'),
  source: TaskSourceSchema.optional().default('manual'),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().min(1).max(TITLE_MAX_LENGTH),
  status: TaskStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  due_date: z.string().nullable(),
  project_id: z.string().uuid().nullable(),
  energy_level: EnergyLevelSchema.nullable(),
  notes: z.string().max(10_000).nullable(),
  estimated_duration_minutes: z.number().int().nullable(),
  assignee_user_id: z.string().uuid().nullable(),
  source: TaskSourceSchema,
  pinned_today: z.boolean(),
  today_sort_order: z.number().int().nullable(),
  deferred_count: z.number().int(),
  last_deferred_at: z.string().nullable(),
  deferral_prompt_shown: z.boolean(),
  completed_at: z.string().nullable(),
  last_interacted_at: z.string().nullable(),
  pending_sync: z.boolean(),
  synced_at: z.string().nullable(),
});
