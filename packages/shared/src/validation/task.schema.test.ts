import { describe, expect, it } from 'vitest';
import { TITLE_MAX_LENGTH, TITLE_WARN_LENGTH, CreateTaskSchema } from './task.schema.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('CreateTaskSchema', () => {
  describe('title validation', () => {
    it('accepts a valid title', () => {
      const result = CreateTaskSchema.safeParse({ title: 'Buy groceries', user_id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects empty title', () => {
      const result = CreateTaskSchema.safeParse({ title: '', user_id: VALID_UUID });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/required/i);
    });

    it('accepts title at exactly max length (500 chars)', () => {
      const title = 'a'.repeat(TITLE_MAX_LENGTH);
      const result = CreateTaskSchema.safeParse({ title, user_id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects title exceeding max length (501 chars)', () => {
      const title = 'a'.repeat(TITLE_MAX_LENGTH + 1);
      const result = CreateTaskSchema.safeParse({ title, user_id: VALID_UUID });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/500/);
    });

    it('WARN_LENGTH constant is 480', () => {
      expect(TITLE_WARN_LENGTH).toBe(480);
    });

    it('MAX_LENGTH constant is 500', () => {
      expect(TITLE_MAX_LENGTH).toBe(500);
    });
  });

  describe('status enum', () => {
    it('defaults to inbox when status not provided', () => {
      const result = CreateTaskSchema.safeParse({ title: 'Test', user_id: VALID_UUID });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.status).toBe('inbox');
    });

    it('accepts all valid statuses', () => {
      const statuses = ['inbox', 'active', 'deferred', 'someday', 'completed', 'archived'] as const;
      for (const status of statuses) {
        const result = CreateTaskSchema.safeParse({ title: 'Test', user_id: VALID_UUID, status });
        expect(result.success, `status '${status}' should be valid`).toBe(true);
      }
    });

    it('rejects "overdue" status — overdue is never stored', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Test',
        user_id: VALID_UUID,
        status: 'overdue' as never,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields', () => {
    it('accepts due_date in YYYY-MM-DD format', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Test',
        user_id: VALID_UUID,
        due_date: '2026-03-20',
      });
      expect(result.success).toBe(true);
    });

    it('rejects malformed due_date', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Test',
        user_id: VALID_UUID,
        due_date: '20/03/2026',
      });
      expect(result.success).toBe(false);
    });

    it('accepts null optional fields', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Test',
        user_id: VALID_UUID,
        due_date: null,
        project_id: null,
        energy_level: null,
        notes: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid energy_level values', () => {
      const levels = ['high_focus', 'low_focus', 'no_brainer'] as const;
      for (const energy_level of levels) {
        const result = CreateTaskSchema.safeParse({ title: 'Test', user_id: VALID_UUID, energy_level });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid energy_level', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Test',
        user_id: VALID_UUID,
        energy_level: 'extreme' as never,
      });
      expect(result.success).toBe(false);
    });

    it('rejects notes exceeding 10000 chars', () => {
      const result = CreateTaskSchema.safeParse({
        title: 'Test',
        user_id: VALID_UUID,
        notes: 'x'.repeat(10_001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('source', () => {
    it('defaults to manual', () => {
      const result = CreateTaskSchema.safeParse({ title: 'Test', user_id: VALID_UUID });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.source).toBe('manual');
    });
  });
});
