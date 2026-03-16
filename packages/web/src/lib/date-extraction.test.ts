/**
 * Unit tests — date-extraction stub (Story 1.2, Task 4)
 *
 * These tests cover the current stub behaviour AND document the expected
 * behaviour once Story 1.5 wires in Chrono.js.
 */
import { describe, expect, it } from 'vitest';
import { extractDateFromText } from './date-extraction.js';

describe('extractDateFromText (stub)', () => {
  it('returns the original text as cleanTitle', () => {
    const result = extractDateFromText('Buy milk tomorrow at 8am');
    expect(result.cleanTitle).toBe('Buy milk tomorrow at 8am');
  });

  it('returns null dueDate (stub — no NLP yet)', () => {
    const result = extractDateFromText('Buy milk tomorrow at 8am');
    expect(result.dueDate).toBeNull();
  });

  it('handles text with no date phrase', () => {
    const result = extractDateFromText('Pick up dry cleaning');
    expect(result.cleanTitle).toBe('Pick up dry cleaning');
    expect(result.dueDate).toBeNull();
  });

  it('handles empty string', () => {
    const result = extractDateFromText('');
    expect(result.cleanTitle).toBe('');
    expect(result.dueDate).toBeNull();
  });
});
