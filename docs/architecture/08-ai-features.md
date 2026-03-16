# Architecture Shard 08 — AI Features

**Parent:** [Architecture Index](./index.md)
**Read for:** Story 1.5 (NLP date parsing), Story 3.1 (Pick for Me), Story 3.4 (Goal Decomposition)

---

## 1. Privacy Principles (Non-Negotiable)

| Principle | Implementation |
|---|---|
| Task content never sent to AI without consent | Goal Decomposition requires explicit per-use consent modal |
| No API keys on clients | All OpenAI calls are server-side proxied via `/api/v1/ai/*` |
| Pick for Me is on-device | Rule-based algorithm runs in the shared package — no server call |
| NLP date parsing is on-device | Chrono.js — zero network calls |
| AI results never auto-saved | User always reviews and confirms before any task is created |

---

## 2. NLP Date Parsing (Story 1.5)

**Library:** `chrono-node`
**Location:** `packages/shared/src/nlp/date-parser.ts`
**Runs on:** Client device (web and mobile) — fully offline

```typescript
// packages/shared/src/nlp/date-parser.ts

import * as chrono from 'chrono-node';

export interface ParsedDate {
  date: Date;
  titleWithoutDate: string;  // title with the date expression removed
}

/**
 * Parses natural language date expressions from a task title.
 * Returns null if no date expression found.
 *
 * @param title - Raw task title e.g. "Buy groceries next Friday"
 * @param referenceDate - The date to resolve relative expressions against (default: now)
 * @param locale - 'en-US' | 'en-GB' (affects DD/MM vs MM/DD interpretation)
 */
export function parseDateFromTitle(
  title: string,
  referenceDate: Date = new Date(),
  locale: 'en-US' | 'en-GB' = 'en-US',
): ParsedDate | null {
  const parser = locale === 'en-GB' ? chrono.en_GB : chrono.en;

  const results = parser.parse(title, referenceDate, {
    forwardDate: true,     // "Friday" = next upcoming Friday, not last Friday
  });

  if (results.length === 0) return null;

  const best = results[0];
  const date = best.date();

  // Remove matched text from title
  const titleWithoutDate = (
    title.slice(0, best.index) +
    title.slice(best.index + best.text.length)
  ).trim().replace(/\s+/g, ' ');

  return { date, titleWithoutDate };
}
```

**Supported expressions (minimum):**
- "today", "tomorrow", "yesterday"
- "next Monday", "this Friday", "last Tuesday"
- "in 3 days", "in 2 weeks", "in 1 month"
- "next week", "end of month", "end of week"
- "at 3pm", "at 15:00", "3pm tomorrow"
- "Jan 15", "January 15", "1/15", "15/1" (en-GB)
- "2026-03-20" (ISO)

**UI integration:** Show parsed date as a dismissible chip below the quick-capture input. User sees `📅 Next Friday, Mar 20` before pressing Enter to save. Tapping the chip dismisses the date parse (keeps date-free).

---

## 3. "Pick for Me" Algorithm (Story 3.1)

**Location:** `packages/shared/src/ai/pick-for-me.ts`
**Runs on:** Client device — pure function, no server call in v1

### Algorithm

```typescript
// packages/shared/src/ai/pick-for-me.ts

export interface TaskCandidate {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  energy_level: 'high_focus' | 'low_focus' | 'no_brainer' | null;
  estimated_duration_minutes: number | null;
  deferred_count: number;
  last_interacted_at: string | null;
  pinned_today: boolean;
}

export interface PickResult {
  task: TaskCandidate;
  reason: string;
  score: number;
}

export function pickForMe(
  tasks: TaskCandidate[],
  context: {
    userEnergyLevel?: 'high_focus' | 'low_focus' | 'no_brainer';
    timeAvailableMinutes?: number;
    skipIds?: string[];           // already-skipped task IDs (max 3)
    currentDateISO: string;
  }
): PickResult | null {

  // Filter: active/inbox tasks only, not in skip list
  const candidates = tasks.filter(t =>
    ['inbox', 'active', 'deferred'].includes(t.status) &&
    !context.skipIds?.includes(t.id)
  );

  if (candidates.length === 0) return null;

  // Score each candidate
  const scored = candidates.map(task => ({
    task,
    score: scoreTask(task, context),
    reason: buildReason(task, context),
  }));

  // Sort descending by score, return top
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

function scoreTask(task: TaskCandidate, context: typeof pickForMe extends (t: any, c: infer C) => any ? C : never): number {
  let score = 0;

  // Rule 1: Due today → highest priority
  if (task.due_date === context.currentDateISO) score += 100;

  // Rule 2: Overdue (deferred_count > 0 with old due_date) → high priority
  if (task.deferred_count > 0 && task.due_date && task.due_date < context.currentDateISO) score += 50;

  // Rule 3: Energy level match
  if (context.userEnergyLevel && task.energy_level === context.userEnergyLevel) score += 30;

  // Rule 4: Duration fits available time
  if (context.timeAvailableMinutes && task.estimated_duration_minutes) {
    if (task.estimated_duration_minutes <= context.timeAvailableMinutes) score += 20;
  }

  // Rule 5: Pinned today → boost
  if (task.pinned_today) score += 25;

  // Rule 6: Recently interacted with → slight deprioritize (avoid repetition)
  if (task.last_interacted_at) {
    const hoursSince = (Date.now() - new Date(task.last_interacted_at).getTime()) / 3_600_000;
    if (hoursSince < 2) score -= 10;
  }

  return score;
}

function buildReason(task: TaskCandidate, context: any): string {
  if (task.due_date === context.currentDateISO) return `This is due today.`;
  if (task.deferred_count > 0) return `This has been carried over ${task.deferred_count} time${task.deferred_count > 1 ? 's' : ''}.`;
  if (task.energy_level === context.userEnergyLevel) return `This matches your current energy level.`;
  if (task.estimated_duration_minutes && context.timeAvailableMinutes &&
      task.estimated_duration_minutes <= context.timeAvailableMinutes)
    return `This fits in your available ${context.timeAvailableMinutes} minutes.`;
  return `This looks like a good next step.`;
}
```

**Session skip list:** Stored in `UIStore.skipIds` (in-memory). Reset when user navigates away from Today view. Max 3 skips before showing "Your slate looks manageable for now" message.

**v2 (Phase 2):** Replace scoring function with a server-side ML model trained on completion patterns. API: `GET /api/v1/tasks/pick-for-me?skip_ids=...` — same response format.

---

## 4. Goal Decomposition (Story 3.4)

**Provider:** OpenAI GPT-4o-mini
**Location:** Server-side only — `packages/server/src/services/ai.service.ts`
**Client call:** `POST /api/v1/ai/decompose-goal`

### Privacy Gate

Before making any AI call, the client MUST display:

```
"To break down your goal, we'll send this text to our AI service:

  '[goal text]'

We do not store this text. [Privacy Policy]

[Cancel] [Send to AI →]"
```

This consent is per-use (not a one-time setting), stored in `user.preferences.ai_decomp_consent_shown = true` after first acceptance.

### Prompt Engineering

```typescript
// packages/server/src/services/ai.service.ts

const SYSTEM_PROMPT = `You are a helpful productivity assistant that breaks down goals into concrete, actionable tasks.

Rules:
- Generate 3 to 7 tasks (no more, no fewer)
- Each task should be a single, completable action (not a sub-goal)
- Tasks should be ordered logically (earlier tasks enable later ones)
- Suggest energy levels: high_focus (requires concentration), low_focus (routine), no_brainer (mindless)
- Suggest due dates relative to today's date that create a realistic timeline
- Return ONLY valid JSON — no prose, no markdown, no explanation

Today's date: {DATE}`;

const USER_PROMPT = `Break down this goal into 3-7 tasks:

Goal: {GOAL}

Respond with JSON in this exact format:
{
  "tasks": [
    {
      "title": "string (max 100 chars, imperative verb)",
      "suggested_due_date": "YYYY-MM-DD or null",
      "energy_level": "high_focus | low_focus | no_brainer",
      "sort_order": 1
    }
  ]
}`;

export class AiService {
  async decomposeGoal(goal: string, userId: string): Promise<DecomposeResult> {
    // Rate limit: 10/day per user (tracked in Redis)
    const count = await redis.incr(`ai_decomp:${userId}:${today()}`);
    await redis.expire(`ai_decomp:${userId}:${today()}`, 86400);
    if (count > 10) throw new AppError('rate_limited', 'AI decomposition limit reached (10/day)');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT.replace('{DATE}', todayISO()) },
        { role: 'user', content: USER_PROMPT.replace('{GOAL}', goal) },
      ],
      temperature: 0.3,           // Low temperature: predictable, structured output
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(raw);

    // Validate with Zod before returning to client
    return DecomposeResultSchema.parse(parsed);
  }
}
```

### Client Flow

```
User enters goal text
       ↓
Show privacy consent modal
       ↓ (user confirms)
POST /api/v1/ai/decompose-goal  { goal: "..." }
       ↓ (server calls OpenAI, returns tasks)
Show review screen (Story 3.4 UI)
  - List of suggested tasks
  - Each task: title (editable), due date chip, energy level selector
  - "Delete" button per task
  - "Approve All" / "Cancel" buttons
       ↓ (user approves)
POST /api/v1/tasks for each approved task  (source: 'ai_decomp')
       ↓
Tasks appear in Inbox
```

---

## 5. Email-to-Task Processing (Story 1.3)

Not an AI feature per se, but involves text processing:

```typescript
// packages/server/src/services/email-ingest.service.ts

import { convert } from 'html-to-text';
import sanitizeHtml from 'sanitize-html';

export class EmailIngestService {
  async processInboundEmail(email: InboundEmail): Promise<void> {
    // 1. Verify sender is the user's registered email
    const user = await prisma.user.findFirst({
      where: { email_ingest_address: email.to, email: email.from },
    });
    if (!user) return; // Silently drop unknown senders (no bounce to prevent spam)

    // 2. Extract title (subject line, cleaned)
    const title = email.subject
      .replace(/^(Re:|Fwd?:|FW:)\s*/i, '')
      .trim()
      .slice(0, 500);

    // 3. Convert body to Markdown
    const bodyText = email.html
      ? convert(email.html, {
          selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }],
          wordwrap: null,
        })
      : email.text ?? '';

    // 4. Sanitize (strip any remaining HTML)
    const notes = sanitizeHtml(bodyText, { allowedTags: [] }).trim().slice(0, 10000);

    // 5. Create task
    await taskService.createTask(user.id, {
      title,
      notes: notes || null,
      source: 'email',
      status: 'INBOX',
    });
  }
}
```

---

## 6. Future AI Roadmap

| Feature | Phase | Approach |
|---|---|---|
| Pick for Me v2 (ML) | Phase 2 | Server-side model trained on anonymized completion patterns; opt-in |
| Smart deferral suggestions | Phase 2 | Rule-based initially (suggest same time next week), then ML |
| Time estimation | Phase 2 | Learn actual vs. estimated duration per user; suggest estimates |
| Natural language search | Phase 2 | Semantic embedding search via pgvector extension on PostgreSQL |
| Energy level inference | Phase 3 | Apple Health / Fitbit integration for objective energy data |

---

*Next: [09-security.md](./09-security.md) for auth, encryption, HMAC, and XSS protection.*
