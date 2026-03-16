# Architecture Shard 03 — Data Models

**Parent:** [Architecture Index](./index.md)
**Read for:** Any story that creates, reads, updates, or deletes data (virtually all stories)

---

## Overview

- **Server database:** PostgreSQL, managed via Prisma schema
- **Client database:** SQLite, managed via Drizzle schema (subset of server fields)
- All IDs are UUID v7 (time-sortable, no sequential leakage)
- All timestamps are stored as UTC; timezone context stored separately in User

---

## 1. Prisma Schema (Server — PostgreSQL)

```prisma
// packages/server/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─────────────────────────────────────────
// USER
// ─────────────────────────────────────────

model User {
  id                    String    @id @default(uuid()) @db.Uuid
  email                 String    @unique
  display_name          String?
  avatar_url            String?
  timezone              String    @default("UTC")         // IANA timezone string
  subscription_tier     Tier      @default(FREE)
  subscription_expires_at DateTime?

  // Preferences (stored as JSON for flexibility)
  preferences           Json      @default("{}")

  // Streak data (Story 4.2)
  current_streak        Int       @default(0)
  longest_streak        Int       @default(0)
  last_completion_date  DateTime?
  grace_days_used_this_month Int @default(0)
  grace_day_month       Int?      // month number when grace_days_used_this_month was last reset

  // Digest (Story 4.3)
  digest_opted_in       Boolean   @default(false)
  digest_send_day       Int       @default(0)            // 0=Sunday
  digest_send_hour      Int       @default(19)
  digest_unsubscribe_token String? @unique

  // Auth (Story 1.4)
  email_ingest_address  String?   @unique               // username+todo@app.domain

  created_at            DateTime  @default(now())
  updated_at            DateTime  @updatedAt

  projects              Project[]
  tasks                 Task[]
  api_keys              ApiKey[]
  daily_completions     DailyCompletion[]
  webhooks              Webhook[]
  accountability_links_as_owner   AccountabilityLink[] @relation("owner")
  accountability_links_as_partner AccountabilityLink[] @relation("partner")
  project_memberships   ProjectMember[]
  weekly_reviews        WeeklyReview[]

  @@index([email])
  @@index([email_ingest_address])
}

enum Tier {
  FREE
  PRO
}

// ─────────────────────────────────────────
// PROJECT
// ─────────────────────────────────────────

model Project {
  id            String    @id @default(uuid()) @db.Uuid
  user_id       String    @db.Uuid
  name          String    @db.VarChar(50)
  color         String    @db.VarChar(7)                // hex color e.g. "#6366F1"
  icon          String?   @db.VarChar(10)               // emoji
  is_default    Boolean   @default(false)
  is_shared     Boolean   @default(false)
  owner_user_id String    @db.Uuid                      // explicit owner (Story 5.2)
  share_token   String?   @unique @db.Uuid              // invite link token

  default_energy_level  EnergyLevel?                    // Story 2.4

  archived_at   DateTime?
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt

  user          User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  tasks         Task[]
  members       ProjectMember[]

  @@index([user_id])
  @@index([share_token])
}

// ─────────────────────────────────────────
// TASK
// ─────────────────────────────────────────

model Task {
  id                      String      @id @default(uuid()) @db.Uuid
  user_id                 String      @db.Uuid
  project_id              String?     @db.Uuid

  // Core fields (Story 1.1)
  title                   String      @db.VarChar(500)
  status                  TaskStatus  @default(INBOX)
  notes                   String?     @db.Text               // raw Markdown (Story 6.2)
  due_date                DateTime?   @db.Date

  // Organization (Story 2.1, 2.4)
  energy_level            EnergyLevel?
  pinned_today            Boolean     @default(false)
  today_sort_order        Int?                               // null = not in Today view

  // Scheduling (Story 2.5, 3.2)
  deferred_count          Int         @default(0)
  last_deferred_at        DateTime?
  deferral_prompt_shown   Boolean     @default(false)        // "break into smaller steps?" prompt
  auto_archive_warned_at  DateTime?                          // Someday 90-day warning (Story 2.5)

  // Completion (Story 4.2, 4.3)
  completed_at            DateTime?
  last_interacted_at      DateTime?

  // Collaboration (Story 5.1, 5.2)
  assignee_user_id        String?     @db.Uuid               // shared list assignment
  accountability_partner_id String?   @db.Uuid               // accountability link

  // AI (Story 3.4)
  source                  TaskSource  @default(MANUAL)       // 'manual' | 'ai_decomp' | 'email' | 'api' | 'voice'

  // Recurrence (PRD 6.5)
  recurrence_rule         String?                            // iCalendar RRULE string
  estimated_duration_minutes Int?

  created_at              DateTime    @default(now())
  updated_at              DateTime    @updatedAt

  user                    User        @relation(fields: [user_id], references: [id], onDelete: Cascade)
  project                 Project?    @relation(fields: [project_id], references: [id], onDelete: SetNull)
  assignee                User?       @relation("task_assignee", fields: [assignee_user_id], references: [id], onDelete: SetNull)
  sub_tasks               SubTask[]
  accountability_links    AccountabilityLink[]
  webhook_deliveries      WebhookDelivery[]

  // Full-text search index (Story 6.2 — plain text, not rendered HTML)
  search_vector           Unsupported("tsvector")?

  @@index([user_id, status])
  @@index([user_id, due_date])
  @@index([project_id])
  @@index([assignee_user_id])
  @@index([user_id, pinned_today])
}

enum TaskStatus {
  INBOX
  ACTIVE
  DEFERRED
  SOMEDAY
  COMPLETED
  ARCHIVED
}

// IMPORTANT: "OVERDUE" is intentionally absent from this enum.
// Overdue logic is handled by the deferral job (Story 3.2), never stored.

enum EnergyLevel {
  HIGH_FOCUS
  LOW_FOCUS
  NO_BRAINER
}

enum TaskSource {
  MANUAL
  AI_DECOMP
  EMAIL
  API
  VOICE
}

// ─────────────────────────────────────────
// SUBTASK (Story 4.4)
// ─────────────────────────────────────────

model SubTask {
  id           String   @id @default(uuid()) @db.Uuid
  task_id      String   @db.Uuid
  title        String   @db.VarChar(200)
  completed    Boolean  @default(false)
  sort_order   Int                                          // 0-based ordering
  completed_at DateTime?
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  task         Task     @relation(fields: [task_id], references: [id], onDelete: Cascade)

  @@index([task_id, sort_order])
}

// ─────────────────────────────────────────
// API KEY (Story 1.4)
// ─────────────────────────────────────────

model ApiKey {
  id           String   @id @default(uuid()) @db.Uuid
  user_id      String   @db.Uuid
  name         String   @db.VarChar(100)                  // user-given label
  key_hash     String   @unique                           // SHA-256(key) — key never stored
  key_prefix   String   @db.VarChar(8)                   // first 8 chars shown in UI e.g. "todo_abc"
  scopes       String[] @default(["read", "write"])      // ["read"] | ["read","write"]
  last_used_at DateTime?
  created_at   DateTime @default(now())
  revoked_at   DateTime?

  user         User     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([key_hash])
  @@index([user_id])
}

// ─────────────────────────────────────────
// DAILY COMPLETION (Story 4.2 — Streak)
// ─────────────────────────────────────────

model DailyCompletion {
  id                    String   @id @default(uuid()) @db.Uuid
  user_id               String   @db.Uuid
  date                  DateTime @db.Date                  // UTC date (converted from user timezone)
  tasks_completed_count Int      @default(0)
  grace_day_used        Boolean  @default(false)

  user                  User     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([user_id, date])
  @@index([user_id, date])
}

// ─────────────────────────────────────────
// ACCOUNTABILITY LINK (Story 5.1)
// ─────────────────────────────────────────

model AccountabilityLink {
  id                    String   @id @default(uuid()) @db.Uuid
  task_id               String   @db.Uuid
  owner_user_id         String   @db.Uuid
  partner_user_id       String?  @db.Uuid                 // null if partner has no account
  partner_email         String
  invite_token          String   @unique @db.Uuid
  unsubscribe_token     String   @unique @db.Uuid
  status                AccountabilityStatus @default(PENDING)
  last_notified_at      DateTime?
  created_at            DateTime @default(now())

  task                  Task     @relation(fields: [task_id], references: [id], onDelete: Cascade)
  owner                 User     @relation("owner", fields: [owner_user_id], references: [id], onDelete: Cascade)
  partner               User?    @relation("partner", fields: [partner_user_id], references: [id], onDelete: SetNull)

  @@index([invite_token])
  @@index([task_id])
  @@index([owner_user_id])
}

enum AccountabilityStatus {
  PENDING
  ACTIVE
  REMOVED
}

// ─────────────────────────────────────────
// PROJECT MEMBER (Story 5.2)
// ─────────────────────────────────────────

model ProjectMember {
  id             String     @id @default(uuid()) @db.Uuid
  project_id     String     @db.Uuid
  user_id        String?    @db.Uuid                      // null while invite is pending
  invited_email  String
  permission     Permission @default(CAN_EDIT)
  status         MemberStatus @default(PENDING)
  invite_token   String     @unique @db.Uuid
  joined_at      DateTime?
  created_at     DateTime   @default(now())

  project        Project    @relation(fields: [project_id], references: [id], onDelete: Cascade)
  user           User?      @relation(fields: [user_id], references: [id], onDelete: SetNull)

  @@index([project_id, status])
  @@index([invite_token])
  @@index([user_id])
}

enum Permission {
  VIEW_ONLY
  CAN_EDIT
  CAN_ASSIGN
  OWNER
}

enum MemberStatus {
  PENDING
  ACTIVE
  LEFT
}

// ─────────────────────────────────────────
// WEBHOOK (Story 6.4)
// ─────────────────────────────────────────

model Webhook {
  id             String   @id @default(uuid()) @db.Uuid
  user_id        String   @db.Uuid
  url            String                                    // HTTPS only
  secret_encrypted String                                  // AES-256-GCM encrypted; never returned in plaintext after creation
  events         String[]                                  // subset of: task.created, task.completed, task.deferred, task.deleted, task.updated
  include_notes  Boolean  @default(false)
  active         Boolean  @default(true)
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt

  user           User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  deliveries     WebhookDelivery[]

  @@index([user_id, active])
}

model WebhookDelivery {
  id                String          @id @default(uuid()) @db.Uuid
  webhook_id        String          @db.Uuid
  task_id           String?         @db.Uuid              // for resend reconstruction
  event_type        String
  payload_hash      String                                 // SHA-256 of payload (not the payload itself)
  http_status       Int?
  response_time_ms  Int?
  attempt_count     Int             @default(1)
  status            DeliveryStatus  @default(PENDING)
  delivered_at      DateTime?
  last_attempted_at DateTime        @default(now())
  created_at        DateTime        @default(now())

  webhook           Webhook         @relation(fields: [webhook_id], references: [id], onDelete: Cascade)
  task              Task?           @relation(fields: [task_id], references: [id], onDelete: SetNull)

  @@index([webhook_id, last_attempted_at])
  @@index([created_at])                                    // for 30-day pruning job
}

enum DeliveryStatus {
  PENDING
  DELIVERED
  FAILED
}

// ─────────────────────────────────────────
// WEEKLY REVIEW (Story 3.3)
// ─────────────────────────────────────────

model WeeklyReview {
  id              String   @id @default(uuid()) @db.Uuid
  user_id         String   @db.Uuid
  started_at      DateTime @default(now())
  completed_at    DateTime?
  current_step    Int      @default(1)                   // 1-5
  tasks_planned   Int      @default(0)
  tasks_archived  Int      @default(0)
  tasks_from_someday Int   @default(0)

  user            User     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, started_at])
}
```

---

## 2. Client SQLite Schema (Drizzle — subset)

The client SQLite schema is a read-optimized subset. Not all server columns need to be on the client — only those needed for offline display and queuing writes.

```typescript
// packages/shared/src/db/client-schema.ts (Drizzle)

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id:                   text('id').primaryKey(),
  user_id:              text('user_id').notNull(),
  project_id:           text('project_id'),
  title:                text('title').notNull(),
  status:               text('status').notNull().default('inbox'),
  notes:                text('notes'),
  due_date:             text('due_date'),                // ISO date string YYYY-MM-DD
  energy_level:         text('energy_level'),
  pinned_today:         integer('pinned_today', { mode: 'boolean' }).default(false),
  today_sort_order:     integer('today_sort_order'),
  deferred_count:       integer('deferred_count').default(0),
  completed_at:         text('completed_at'),
  last_interacted_at:   text('last_interacted_at'),
  assignee_user_id:     text('assignee_user_id'),
  source:               text('source').default('manual'),
  created_at:           text('created_at').notNull(),
  updated_at:           text('updated_at').notNull(),
  // CRDT sync metadata
  yjs_doc_id:           text('yjs_doc_id'),             // Yjs document this task belongs to
  synced_at:            text('synced_at'),              // last successful sync timestamp
});

export const projects = sqliteTable('projects', {
  id:                   text('id').primaryKey(),
  user_id:              text('user_id').notNull(),
  name:                 text('name').notNull(),
  color:                text('color').notNull(),
  icon:                 text('icon'),
  is_default:           integer('is_default', { mode: 'boolean' }).default(false),
  is_shared:            integer('is_shared', { mode: 'boolean' }).default(false),
  default_energy_level: text('default_energy_level'),
  archived_at:          text('archived_at'),
  created_at:           text('created_at').notNull(),
  updated_at:           text('updated_at').notNull(),
});

export const sub_tasks = sqliteTable('sub_tasks', {
  id:           text('id').primaryKey(),
  task_id:      text('task_id').notNull(),
  title:        text('title').notNull(),
  completed:    integer('completed', { mode: 'boolean' }).default(false),
  sort_order:   integer('sort_order').notNull(),
  completed_at: text('completed_at'),
  created_at:   text('created_at').notNull(),
  updated_at:   text('updated_at').notNull(),
});

// Pending operations queue (for offline write queueing)
export const pending_operations = sqliteTable('pending_operations', {
  id:           text('id').primaryKey(),
  operation:    text('operation').notNull(),    // JSON: { type, entity, payload }
  created_at:   text('created_at').notNull(),
  attempts:     integer('attempts').default(0),
  last_error:   text('last_error'),
});
```

---

## 3. Key Relationships Map

```
User (1) ──────────────── (N) Project
User (1) ──────────────── (N) Task
User (1) ──────────────── (N) ApiKey
User (1) ──────────────── (N) DailyCompletion
User (1) ──────────────── (N) Webhook
User (1) ──────────────── (N) WeeklyReview
User (1) ──────────────── (N) AccountabilityLink [as owner]
User (1) ──────────────── (N) AccountabilityLink [as partner]
User (1) ──────────────── (N) ProjectMember

Project (1) ────────────── (N) Task
Project (1) ────────────── (N) ProjectMember

Task (1) ───────────────── (N) SubTask
Task (1) ───────────────── (N) AccountabilityLink
Task (1) ───────────────── (N) WebhookDelivery

Webhook (1) ────────────── (N) WebhookDelivery
```

---

## 4. Field Evolution by Story

As stories are implemented, these fields are added to the Task model. Migrations must be additive (no destructive changes).

| Story | Fields Added to Task |
|---|---|
| 1.1 | `id`, `user_id`, `title`, `status`, `created_at`, `updated_at` |
| 1.3 | `source` (add `'email'` variant) |
| 1.5 | `due_date` |
| 2.1 | `pinned_today`, `today_sort_order` |
| 2.4 | `energy_level` |
| 2.5 | `auto_archive_warned_at`, `last_interacted_at` |
| 3.2 | `deferred_count`, `last_deferred_at`, `deferral_prompt_shown` |
| 3.4 | `source` extended with `'ai_decomp'` |
| 4.3 | `completed_at` |
| 5.1 | `accountability_partner_id` |
| 5.2 | `assignee_user_id` |
| 6.2 | `notes`, `search_vector` |

---

## 5. Free Tier Enforcement

These limits are checked at the **service layer** (not just the API layer) before write operations:

| Feature | Free Limit | Pro Limit | Enforced In |
|---|---|---|---|
| Active projects | 3 | Unlimited | `ProjectService.create()` |
| Shared lists | 1 | Unlimited | `ProjectService.share()` |
| Accountability links | 5 active | Unlimited | `AccountabilityService.create()` |
| Webhooks | 0 | 10 | `WebhookService.create()` |
| Project members | 10 | 10 (clarify with PO) | `ProjectMemberService.invite()` |

---

*Next: [04-api-design.md](./04-api-design.md) for REST API contract.*
