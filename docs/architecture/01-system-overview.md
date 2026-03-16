# Architecture Shard 01 — System Overview

**Parent:** [Architecture Index](./index.md)
**Read for:** All stories — establish foundational constraints before implementation

---

## 1. Core Architectural Principles

These principles are non-negotiable and take precedence over convenience or speed:

| # | Principle | Implication |
|---|---|---|
| P1 | **Offline-first** | Local SQLite (Yjs doc) is the source of truth. Server sync is asynchronous. Every write must persist locally before returning success to the user. |
| P2 | **CRDT sync, not LWW** | Conflict resolution via Yjs CRDT semantics. Last-write-wins is explicitly rejected as per PRD. |
| P3 | **API-first** | Every feature must be accessible via the REST API. Mobile and web are API consumers — no server-side rendering for business logic. |
| P4 | **Privacy-first AI** | Task content is never sent to external AI services without explicit user consent. All LLM calls are server-side proxied; no API keys on clients. |
| P5 | **Zero "overdue"** | The string "overdue" must not appear in any UI text, API response, or database value. Automated audit in CI. |
| P6 | **Security at every layer** | Defense in depth: input validation, server-side auth, encrypted secrets, signed webhook payloads, XSS-sanitized output. |
| P7 | **Performance budgets are hard limits** | Task save ≤ 100ms (local write), cold start ≤ 2s, search ≤ 200ms, API p95 ≤ 300ms, sync propagation ≤ 3s. |

---

## 2. System Boundaries

### 2.1 What This System Is

- A personal and collaborative task management application
- An offline-capable progressive web app + native mobile app
- An API platform for developer integrations (webhooks, REST, CLI)

### 2.2 What This System Is Not

- A project management tool (no Gantt, dependencies, resource planning)
- A document storage system (no file attachments beyond task notes)
- A real-time chat or communication platform
- A time tracking / billing system

### 2.3 External System Boundaries

```
┌──────────────────────────────────────────────────────┐
│                  OUR SYSTEM BOUNDARY                 │
│                                                      │
│  Web App ──┐                                         │
│  Mobile ───┼──→ API Server ──→ PostgreSQL            │
│  CLI ──────┘         │                               │
│                       ├──→ Redis / BullMQ             │
│                       ├──→ Yjs Sync Server            │
│                       └──→ Local SQLite (clients)     │
│                                                      │
└──────────────────────────────────────────────────────┘
         │                    │                │
         ▼                    ▼                ▼
   Supabase Auth          Resend           OpenAI API
   (OAuth/JWT)           (Email)           (LLM, server-side)
```

---

## 3. Data Flow: Task Creation (Canonical Example)

Understanding this flow unlocks understanding of the whole system:

```
User types task title + presses Enter
         │
         ▼
[Client] parseDateFromTitle(title)          ← Chrono.js, on-device, no network
         │
         ▼
[Client] Create Yjs document update         ← CRDT operation, local only
         │
         ▼
[Client] Write to SQLite via Drizzle        ← Local source of truth (≤ 100ms target)
         │
         ▼
[Client] UI updates immediately             ← Task visible in Inbox
         │
         │ (async, background)
         ▼
[Client] Yjs sends delta to sync server     ← WebSocket connection
         │
         ▼
[Server] y-websocket broadcasts to          ← Other devices / shared list members
         all subscribed sessions
         │
         ▼
[Server] Persistence layer writes to        ← PostgreSQL durable store
         PostgreSQL
         │
         │ (async, background)
         ▼
[Server] BullMQ: dispatch webhook job       ← task.created event (EP-06)
         BullMQ: update streak              ← on task.completed event (EP-04)
```

**Key invariant:** Step 3 (local SQLite write) is the only step that blocks the UI. All subsequent steps are async and fire-and-forget from the user's perspective.

---

## 4. Tier Architecture

### 4.1 Client Tier

| Component | Technology | Responsibility |
|---|---|---|
| Web App | React + Vite (TypeScript) | Full web UI, keyboard navigation, command palette, Markdown |
| Mobile App | React Native + Expo (TypeScript) | iOS + Android, voice capture, push notifications, Focus Mode |
| CLI | Node.js + Commander.js | Terminal task management, offline cache, OAuth flow |
| Shared Package | TypeScript | Types, Zod schemas, Chrono.js wrapper, CRDT helpers |

### 4.2 Server Tier

| Component | Technology | Responsibility |
|---|---|---|
| API Server | Fastify + TypeScript | REST endpoints, auth middleware, rate limiting |
| Sync Server | y-websocket | Yjs CRDT relay for multi-device and multi-user sync |
| Job Workers | BullMQ workers | Email, webhook delivery, deferral, streak reset, digest |

### 4.3 Data Tier

| Store | Technology | Responsibility |
|---|---|---|
| Primary DB | PostgreSQL (Supabase hosted) | Durable task data, user accounts, webhook configs |
| Local DB | SQLite + Drizzle | Client-side offline store (one per device) |
| Cache/Queue | Redis | BullMQ job queues, rate limit counters, session cache |
| Object Store | Cloudflare R2 | Weekly digest PNG images, future attachments |

---

## 5. Feature Flag Strategy

All major features are independently feature-flaggable via environment variables. This enables:
- Gradual rollout without code deployment
- Per-user beta access
- Kill switches for unstable features

| Flag | Controls | Default |
|---|---|---|
| `FF_VOICE_CAPTURE` | Voice task capture (Story 1.2) | `false` (beta) |
| `FF_EMAIL_INGEST` | Email-to-task (Story 1.3) | `false` (beta) |
| `FF_GOAL_DECOMPOSITION` | AI goal decomposition (Story 3.4) | `false` |
| `FF_ACCOUNTABILITY_PARTNER` | Accountability linking (Story 5.1) | `false` |
| `FF_SHARED_LISTS` | Shared project lists (Story 5.2) | `false` |
| `FF_WEBHOOKS` | Webhook delivery (Story 6.4) | `false` (Pro only) |
| `FF_CLI` | CLI API endpoints (Story 6.3) | `true` |

Implementation: simple `process.env.FF_*` checks in the API server; clients receive feature flags in the auth token claims or a dedicated `/api/v1/features` endpoint.

---

## 6. Non-Functional Requirements Cross-Reference

| NFR | Target | Architectural Response |
|---|---|---|
| Task save latency | ≤ 100ms | Local SQLite write; network sync is async |
| Cold start (mobile) | ≤ 2s | Expo optimized bundle; SQLite pre-populated from last session |
| Search results | ≤ 200ms | SQLite FTS5 (full-text search) on client; server search via PostgreSQL `tsvector` |
| Sync propagation | ≤ 3s | Yjs WebSocket delta sync; Redis pub/sub for fan-out |
| API p95 response | ≤ 300ms | Fastify, connection pooling (PgBouncer), Redis caching |
| Offline-first | Full read/write | Yjs + SQLite on client; operation queue for writes |
| 99.9% uptime | Monthly SLA | Supabase hosted Postgres, multi-region on Railway/Render |
| WCAG 2.1 AA | Accessibility | axe-core in CI; focus management in all modal components |

---

## 7. Rejected Alternatives (Key Decisions)

| Decision | Rejected Alternative | Reason Rejected |
|---|---|---|
| Yjs for CRDT | Automerge | Automerge has larger bundle (~300KB vs ~85KB), weaker React Native support |
| Yjs for CRDT | Custom LWW | LWW explicitly rejected in PRD (data integrity requirement) |
| BullMQ | pg-boss | BullMQ more mature, better DX, Redis already needed for rate limiting |
| Supabase Auth | Custom JWT auth | Eliminates auth server complexity; handles Google/Apple OAuth out of box |
| React Native + Expo | Native Swift/Kotlin | 2-person startup: shared codebase is pragmatic; React Native perf sufficient for task app |
| Fastify | Express | Fastify is 2–3× faster, TypeScript-native, better schema validation |
| Prisma | TypeORM | Prisma has better TypeScript DX, safer migrations, Prisma Studio for debugging |

---

*Next: [02-tech-stack.md](./02-tech-stack.md) for complete technology selections with versions.*
