# Architecture — To-Do List Application

**Authored by:** Winston (Architect — BMAD)
**Status:** Draft v1.0
**Date:** 2026-03-16
**Source documents:** [PRD](../prd.md) | [Epics](../epics.md) | [Stories](../stories/)

---

## Purpose

This sharded architecture provides the technical foundation for all 24 development stories across 6 epics. Each shard is scoped so that a dev agent loading only the relevant shard has sufficient context to implement its assigned story without reading the entire architecture.

**Load only what you need.** Cross-references between shards are explicit.

---

## Shard Index

| Shard | File | Read When Implementing |
|---|---|---|
| System Overview | [01-system-overview.md](./01-system-overview.md) | All stories — read once at project start |
| Tech Stack | [02-tech-stack.md](./02-tech-stack.md) | Scaffolding, dependency decisions, any "what library?" question |
| Data Models | [03-data-models.md](./03-data-models.md) | Any story touching the database (EP-01 through EP-06) |
| API Design | [04-api-design.md](./04-api-design.md) | EP-01 Story 1.4, EP-06 Stories 6.3/6.4, any REST endpoint work |
| Offline Sync (CRDT) | [05-offline-sync.md](./05-offline-sync.md) | EP-01 1.1, EP-02, EP-03, EP-05 5.2 (⚠️ multi-user fan-out spike) |
| Backend Services | [06-backend-services.md](./06-backend-services.md) | EP-03 3.2, EP-04 4.2/4.3, EP-05 5.1, EP-06 6.4 (job queue, email, webhooks) |
| Frontend Architecture | [07-frontend-architecture.md](./07-frontend-architecture.md) | All EP-02, EP-04 4.1, EP-06 6.1/6.2 (UI, state, navigation, animation) |
| AI Features | [08-ai-features.md](./08-ai-features.md) | EP-03 3.1/3.4 (Pick for Me, Goal Decomposition, NLP date parsing) |
| Security | [09-security.md](./09-security.md) | EP-01 1.4, EP-06 6.4 (API keys, HMAC, AES-256 secrets, XSS) |
| Infrastructure | [10-infrastructure.md](./10-infrastructure.md) | DevOps, deployment, environment config, monitoring |

---

## Architecture Decision Log

| ID | Decision | Rationale | Stories Affected |
|---|---|---|---|
| AD-001 | CRDT library: **Yjs** | Best React Native support, most active community, smallest bundle (vs Automerge) | All offline-first stories |
| AD-002 | Job queue: **BullMQ + Redis** | Most mature Node.js queue; supports cron/repeatable jobs (deferral, streak, digest) | 3.2, 4.2, 4.3, 5.1, 6.4 |
| AD-003 | ORM: **Prisma** (server) + **Drizzle** (client) | Prisma for migrations/server; Drizzle for edge/lightweight client-side SQLite interop | All DB stories |
| AD-004 | Auth: **Supabase Auth** | Handles Google/Apple/Email OAuth, JWT, Row-Level Security; eliminates custom auth server | 1.4, all protected endpoints |
| AD-005 | Mobile: **React Native + Expo** | Faster cross-platform iteration; shared logic with web; Expo handles native builds | All mobile stories |
| AD-006 | NLP date parsing: **Chrono.js** | On-device, no server call, supports en-US + en-GB, proven library | 1.5 |
| AD-007 | AI/LLM: **OpenAI GPT-4o-mini** (server-side) | Cost-effective; no API key on client; server proxies all LLM calls | 3.4 |
| AD-008 | Email: **Resend** | Modern API, excellent DX, React Email templates, built-in analytics | 4.3, 5.1, 5.2 |
| AD-009 | Secret encryption: **AES-256-GCM** via Node.js `crypto` | Recoverable (needed for HMAC signing); key stored in env var, not DB | 6.4 |
| AD-010 | Frontend web: **React + Vite** | Fast builds, tree-shaking; same component library as React Native via cross-platform libs | All web stories |
| AD-011 | Monorepo: **pnpm workspaces** | Shared types/utilities between web, mobile, server, CLI packages | All stories |

---

## High-Level System Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  React Web  │  │ React Native │  │   CLI (@todo/cli) │   │
│  │   (Vite)    │  │    (Expo)    │  │   (Node.js)       │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                │                    │              │
│  ┌──────▼────────────────▼──────────────┐     │              │
│  │         Local SQLite (Drizzle)        │     │              │
│  │   Yjs Doc (CRDT) — source of truth   │     │              │
│  └──────────────────┬───────────────────┘     │              │
└─────────────────────┼───────────────────────── ┼─────────────┘
                      │ WebSocket (y-websocket)   │ HTTPS REST
                      │                           │
┌─────────────────────▼───────────────────────────▼─────────────┐
│                        SERVER LAYER                            │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Fastify API Server (Node.js/TS)             │ │
│  │  Auth (Supabase JWT) │ REST /api/v1 │ Webhook endpoints  │ │
│  └───────────┬──────────────────────────────────────────────┘ │
│              │                                                  │
│  ┌───────────▼──────────┐  ┌─────────────────────────────┐   │
│  │   PostgreSQL (Prisma) │  │    Redis + BullMQ           │   │
│  │   Primary data store  │  │  Queues: email, webhook,    │   │
│  └──────────────────────┘  │  deferral, streak, digest   │   │
│                              └─────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────┐  ┌────────────────────────────┐     │
│  │  Yjs Sync Server     │  │   External Services        │     │
│  │  (y-websocket)       │  │   Resend (email)           │     │
│  │  Multi-user fan-out  │  │   OpenAI (LLM)             │     │
│  └──────────────────────┘  │   Supabase Auth            │     │
│                              └────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Package Structure

```
todo-app/
├── packages/
│   ├── web/              # React + Vite web app
│   ├── mobile/           # React Native + Expo
│   ├── server/           # Fastify API server
│   ├── cli/              # @todo-app/cli Node.js package
│   ├── shared/           # Shared types, utilities, CRDT logic
│   │   ├── types/        # TypeScript interfaces (Task, Project, User...)
│   │   ├── crdt/         # Yjs doc schemas + sync utilities
│   │   ├── nlp/          # Chrono.js date parsing wrapper
│   │   └── validation/   # Shared Zod schemas
│   └── email-templates/  # React Email templates
├── docs/
│   ├── architecture/     # ← YOU ARE HERE
│   ├── stories/
│   ├── prd.md
│   └── epics.md
└── pnpm-workspace.yaml
```

---

*Read [01-system-overview.md](./01-system-overview.md) next for architectural principles and constraints.*
