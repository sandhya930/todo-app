# Architecture Shard 06 — Backend Services

**Parent:** [Architecture Index](./index.md)
**Read for:** Story 3.2 (deferral job), Story 4.2 (streak), Story 4.3 (digest), Story 5.1 (accountability email), Story 5.2 (assignment notification), Story 6.4 (webhook delivery)

---

## 1. Job Queue Architecture (BullMQ + Redis)

All background work runs through BullMQ. This provides: retry logic, delayed jobs, cron scheduling, job history, and dead-letter queues.

```
┌─────────────────────────────────────────────────────────┐
│                    BullMQ Queues                         │
│                                                          │
│  email-queue          → EmailWorker                     │
│  webhook-queue        → WebhookWorker                   │
│  deferral-queue       → DeferralWorker  (cron: midnight) │
│  streak-queue         → StreakWorker    (cron: midnight) │
│  digest-queue         → DigestWorker   (cron: Sunday)   │
│  log-pruning-queue    → LogPruningWorker (cron: daily)  │
│  ai-queue             → AiWorker                        │
└─────────────────────────────────────────────────────────┘
```

### Worker Base Pattern

```typescript
// packages/server/src/jobs/base-worker.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { logger } from '../lib/logger';

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
) {
  return new Worker<T>(queueName, processor, {
    connection: redisConnection,
    concurrency: 5,
    limiter: { max: 100, duration: 1000 },
  });
}
```

---

## 2. Deferral Job (Story 3.2)

**Cron:** `0 0 * * *` (midnight UTC) — triggers per user at their local midnight via per-user delayed jobs.

### Implementation

```typescript
// packages/server/src/jobs/deferral.worker.ts

interface DeferralJobData {
  userId: string;
  date: string;         // YYYY-MM-DD in user's timezone
}

export const deferralWorker = createWorker<DeferralJobData>(
  'deferral-queue',
  async (job) => {
    const { userId, date } = job.data;

    // Find all tasks for user where due_date = date AND status = ACTIVE/INBOX
    const tasksToDefer = await prisma.task.findMany({
      where: {
        user_id: userId,
        due_date: new Date(date),
        status: { in: ['ACTIVE', 'INBOX'] },
      },
    });

    for (const task of tasksToDefer) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'DEFERRED',
          deferred_count: { increment: 1 },
          last_deferred_at: new Date(),
          // due_date intentionally NOT changed — shown as "carried over" tomorrow
        },
      });

      // Dispatch task.deferred webhook (Story 6.4)
      await webhookDispatch(userId, 'task.deferred', task);

      // Notify accountability partner if deferred_count reaches 2 (Story 5.1)
      if (task.deferred_count + 1 >= 2) {
        await notifyAccountabilityPartner(task.id, 'deferred');
      }
    }
  }
);

// Scheduler: runs every minute, enqueues per-user deferral jobs at their local midnight
export async function scheduleDeferralJobs() {
  const usersAtMidnight = await getUsersAtMidnight();  // users whose TZ = current UTC midnight
  for (const user of usersAtMidnight) {
    await deferralQueue.add('defer', { userId: user.id, date: getTodayInTz(user.timezone) });
  }
}
```

**Important:** NEVER store `status = 'OVERDUE'`. The word "overdue" must not appear anywhere.

---

## 3. Streak Job (Story 4.2)

**Cron:** Runs at midnight per-user timezone (same scheduler as deferral job).

```typescript
// packages/server/src/jobs/streak.worker.ts

export const streakWorker = createWorker<{ userId: string; date: string }>(
  'streak-queue',
  async (job) => {
    const { userId, date } = job.data;

    const todayCompletion = await prisma.dailyCompletion.findUnique({
      where: { user_id_date: { user_id: userId, date: new Date(date) } },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (todayCompletion && todayCompletion.tasks_completed_count > 0) {
      // Extend streak
      const newStreak = user.current_streak + 1;
      await prisma.user.update({
        where: { id: userId },
        data: {
          current_streak: newStreak,
          longest_streak: Math.max(newStreak, user.longest_streak),
          last_completion_date: new Date(date),
        },
      });
      // Fire milestone notification if at 3/7/14/30/60/100
      await checkMilestone(userId, newStreak);
    } else if (!todayCompletion?.grace_day_used) {
      // Reset streak (grace day not used)
      await prisma.user.update({
        where: { id: userId },
        data: { current_streak: 0 },
      });
    }
    // If grace_day_used = true: streak preserved, no action needed
  }
);
```

### Grace Day Endpoint

```typescript
// POST /api/v1/streak/grace-day
async function useGraceDay(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const currentMonth = new Date().getMonth();
  if (user.grace_day_month === currentMonth && user.grace_days_used_this_month >= 1) {
    throw new AppError('grace_day_exhausted', 'Grace day already used this month');
  }

  const today = getTodayInTz(user.timezone);
  await prisma.$transaction([
    prisma.dailyCompletion.upsert({
      where: { user_id_date: { user_id: userId, date: today } },
      create: { user_id: userId, date: today, grace_day_used: true, tasks_completed_count: 0 },
      update: { grace_day_used: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        grace_days_used_this_month: 1,
        grace_day_month: currentMonth,
      },
    }),
  ]);
}
```

---

## 4. Weekly Digest (Story 4.3)

**Cron:** `0 19 * * 0` (Sunday 7pm UTC) — per-user timezone scheduling via delayed jobs.

```typescript
// packages/server/src/jobs/digest.worker.ts

export const digestWorker = createWorker<{ userId: string }>(
  'digest-queue',
  async (job) => {
    const { userId } = job.data;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId, digest_opted_in: true },
    });

    const stats = await buildWeeklySummary(userId);
    const html = await renderDigestEmail(stats, user);
    const shareCardUrl = await generateShareCard(stats);  // Sharp → R2

    await resend.emails.send({
      from: 'digest@app.domain',
      to: user.email,
      subject: `Your week: ${stats.tasksCompleted} tasks done 🎉`,
      html,
      headers: {
        'List-Unsubscribe': `<https://app.domain/unsubscribe?token=${user.digest_unsubscribe_token}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  }
);

// Aggregate weekly stats
async function buildWeeklySummary(userId: string) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const [completedTasks, streak, topProject] = await Promise.all([
    prisma.task.findMany({
      where: { user_id: userId, status: 'COMPLETED', completed_at: { gte: weekStart, lte: weekEnd } },
      include: { project: { select: { name: true, color: true } } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { current_streak: true, longest_streak: true } }),
    prisma.task.groupBy({
      by: ['project_id'],
      where: { user_id: userId, status: 'COMPLETED', completed_at: { gte: weekStart } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    }),
  ]);

  return {
    tasksCompleted: completedTasks.length,
    topProject,
    currentStreak: streak?.current_streak ?? 0,
    longestStreak: streak?.longest_streak ?? 0,
    completedTasks,
    weekStart,
    weekEnd,
  };
}
```

---

## 5. Email Service (Resend + React Email)

```typescript
// packages/server/src/services/email.service.ts

import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

// All email sending goes through this service
export class EmailService {
  async sendAccountabilityInvite(partner: { email: string; name?: string }, task: Task, owner: User, inviteToken: string) {
    await resend.emails.send({
      from: 'noreply@app.domain',
      to: partner.email,
      subject: `${owner.display_name} invited you to follow a task`,
      react: AccountabilityInviteEmail({ task, owner, inviteToken }),
    });
  }

  async sendTaskCompleted(partner: { email: string }, task: Task, owner: User, unsubscribeToken: string) {
    await resend.emails.send({
      from: 'noreply@app.domain',
      to: partner.email,
      subject: `${owner.display_name} completed "${task.title}" 🎉`,
      react: TaskCompletedEmail({ task, owner }),
      headers: this.unsubscribeHeaders(unsubscribeToken),
    });
  }

  async sendTaskDeferred(partner: { email: string }, task: Task, owner: User, unsubscribeToken: string) {
    // Note: supportive tone only — never shaming
    await resend.emails.send({
      from: 'noreply@app.domain',
      to: partner.email,
      subject: `${owner.display_name} rescheduled "${task.title}"`,
      react: TaskDeferredEmail({ task, owner }),   // copy: "They're still on it!"
      headers: this.unsubscribeHeaders(unsubscribeToken),
    });
  }

  private unsubscribeHeaders(token: string) {
    return {
      'List-Unsubscribe': `<https://app.domain/unsubscribe?token=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
}
```

**Email template location:** `packages/email-templates/src/`
**Framework:** React Email (JSX-based, Outlook-safe HTML output)

---

## 6. Webhook Dispatch Service (Story 6.4)

See [09-security.md](./09-security.md) for HMAC signing details.

```typescript
// packages/server/src/services/webhook-dispatch.service.ts

type WebhookEvent = 'task.created' | 'task.completed' | 'task.deferred' | 'task.deleted' | 'task.updated';

export class WebhookDispatchService {
  async dispatch(userId: string, event: WebhookEvent, task: Task, changes?: Record<string, { from: unknown; to: unknown }>) {
    // Find all active webhooks for this user that subscribe to this event
    const webhooks = await prisma.webhook.findMany({
      where: { user_id: userId, active: true, events: { has: event } },
    });

    for (const webhook of webhooks) {
      const payload = this.buildPayload(event, task, webhook.include_notes, changes);
      await webhookQueue.add('deliver', {
        webhookId: webhook.id,
        taskId: task.id,
        event,
        payload,
        secretEncrypted: webhook.secret_encrypted,
      });
    }
  }

  private buildPayload(event: WebhookEvent, task: Task, includeNotes: boolean, changes?: object) {
    const taskObj: Record<string, unknown> = {
      id: task.id,
      title: task.title,
      status: task.status,
      due_date: task.due_date,
      project_id: task.project_id,
      energy_level: task.energy_level,
      created_at: task.created_at,
      completed_at: task.completed_at,
    };

    // Notes: excluded by default (privacy)
    if (includeNotes && task.notes) taskObj.notes = task.notes;

    // task.deleted: only id + title
    if (event === 'task.deleted') {
      return { event, timestamp: new Date().toISOString(), user_id: task.user_id, task: { id: task.id, title: task.title } };
    }

    const payload: Record<string, unknown> = {
      event,
      timestamp: new Date().toISOString(),
      user_id: task.user_id,
      task: taskObj,
    };

    if (event === 'task.updated' && changes) {
      payload.changes = changes;
    }

    return payload;
  }
}
```

### Webhook Delivery Worker

```typescript
// packages/server/src/jobs/webhook.worker.ts

export const webhookWorker = createWorker<WebhookJobData>(
  'webhook-queue',
  async (job) => {
    const { webhookId, taskId, event, payload, secretEncrypted } = job.data;

    const rawBody = JSON.stringify(payload);
    const secret = decryptAES256GCM(secretEncrypted);           // See security shard
    const signature = computeHMAC(secret, rawBody);

    const deliveryId = uuidv7();
    const startTime = Date.now();

    try {
      const webhook = await prisma.webhook.findUniqueOrThrow({ where: { id: webhookId } });
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Todo-Signature': `sha256=${signature}`,
          'X-Todo-Event': event,
          'X-Todo-Delivery': deliveryId,
          'User-Agent': 'TodoApp-Webhook/1.0',
        },
        body: rawBody,
        signal: AbortSignal.timeout(10_000),                    // 10 second timeout
      });

      const responseTime = Date.now() - startTime;
      const success = response.status >= 200 && response.status < 300;

      await prisma.webhookDelivery.create({
        data: {
          id: deliveryId,
          webhook_id: webhookId,
          task_id: taskId,
          event_type: event,
          payload_hash: sha256(rawBody),
          http_status: response.status,
          response_time_ms: responseTime,
          status: success ? 'DELIVERED' : 'FAILED',
          attempt_count: job.attemptsMade + 1,
          delivered_at: success ? new Date() : null,
          last_attempted_at: new Date(),
        },
      });

      if (!success) throw new Error(`HTTP ${response.status}`);

    } catch (err) {
      // BullMQ handles retry scheduling; max 3 attempts with backoff
      throw err;
    }
  },
  {
    // Exponential backoff: attempt 2 after 1s, attempt 3 after 5s, attempt 4 after 25s
    // (4 total attempts = 1 initial + 3 retries)
    settings: {
      backoffStrategy: (attemptsMade) => [1000, 5000, 25000][attemptsMade - 1] ?? 25000,
    },
  }
);
```

---

## 7. Log Pruning Job (Story 6.4)

**Cron:** Daily `0 3 * * *` (3am UTC — low traffic)

```typescript
// packages/server/src/jobs/log-pruning.worker.ts

export const logPruningWorker = createWorker('log-pruning-queue', async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.webhookDelivery.deleteMany({
    where: { created_at: { lt: thirtyDaysAgo } },
  });
  logger.info({ deletedDeliveries: count }, 'Log pruning complete');
});
```

---

## 8. Service Layer Structure

```
packages/server/src/
├── services/
│   ├── task.service.ts          # createTask, completeTask, updateTask, deleteTask
│   ├── project.service.ts       # create, archive, share
│   ├── webhook-dispatch.service.ts
│   ├── accountability.service.ts
│   ├── streak.service.ts        # recordCompletion, useGraceDay
│   ├── email.service.ts
│   └── ai.service.ts            # goalDecomposition, pickForMe
├── jobs/
│   ├── deferral.worker.ts
│   ├── streak.worker.ts
│   ├── digest.worker.ts
│   ├── webhook.worker.ts
│   ├── log-pruning.worker.ts
│   └── scheduler.ts             # Sets up all cron jobs on server start
└── routes/
    ├── tasks.route.ts
    ├── projects.route.ts
    ├── webhooks.route.ts
    ├── auth.route.ts
    ├── ai.route.ts
    └── stats.route.ts
```

### Task Service — Webhook Dispatch Hooks

All task mutations dispatch webhooks **asynchronously** (enqueue job, don't await delivery):

```typescript
// packages/server/src/services/task.service.ts

export class TaskService {
  async createTask(userId: string, data: CreateTaskInput): Promise<Task> {
    const task = await prisma.task.create({ data: { ...data, user_id: userId, source: 'api' } });
    // Fire-and-forget webhook dispatch
    void webhookDispatch.dispatch(userId, 'task.created', task);
    return task;
  }

  async completeTask(userId: string, taskId: string): Promise<Task> {
    const task = await prisma.task.update({
      where: { id: taskId, user_id: userId },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });
    void webhookDispatch.dispatch(userId, 'task.completed', task);
    void streakService.recordCompletion(userId);
    void accountabilityService.notifyOnCompletion(task);
    return task;
  }

  async updateTask(userId: string, taskId: string, data: UpdateTaskInput): Promise<Task> {
    const before = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    const task = await prisma.task.update({ where: { id: taskId }, data });
    const changes = computeChanges(before, task, ['title', 'due_date', 'project_id', 'energy_level', 'status', 'notes']);
    if (Object.keys(changes).length > 0) {
      void webhookDispatch.dispatch(userId, 'task.updated', task, changes);
    }
    return task;
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await prisma.task.delete({ where: { id: taskId } });
    void webhookDispatch.dispatch(userId, 'task.deleted', task);
  }
}
```

---

*Next: [07-frontend-architecture.md](./07-frontend-architecture.md) for React/React Native architecture.*
