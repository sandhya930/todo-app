/**
 * NLP date extraction from natural-language text.
 *
 * TODO(story-1.5 — US-005): Replace this stub with the full Chrono.js
 * implementation. The production version lives in `./nlp-date.ts` and will
 * be wired in here:
 *
 *   import { parseDateFromTitle } from './nlp-date.js';
 *
 *   export function extractDateFromText(text: string): DateExtractionResult {
 *     const result = parseDateFromTitle(text);
 *     return {
 *       cleanTitle: result.cleanTitle,
 *       dueDate: result.date?.toISOString() ?? null,
 *     };
 *   }
 *
 * Until Story 1.5 is merged this stub returns the original text unchanged
 * with no due date — all ACs for Story 1.2 that do NOT require date
 * extraction remain fully satisfied.
 */

export interface DateExtractionResult {
  /** The task title with any date/time phrase removed. */
  cleanTitle: string;
  /** ISO 8601 due-date string, or null if no date was detected. */
  dueDate: string | null;
}

/**
 * Extract a date/time phrase from a natural-language string.
 *
 * STUB — always returns { cleanTitle: text, dueDate: null }.
 * Story 1.5 replaces this with Chrono.js parsing.
 */
export function extractDateFromText(text: string): DateExtractionResult {
  return { cleanTitle: text, dueDate: null };
}
