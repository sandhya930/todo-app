# Architecture Shard 02 — Technology Stack

**Parent:** [Architecture Index](./index.md)
**Read for:** Project scaffolding, dependency selection, "which library?" questions

---

## 1. Language & Runtime

| Layer | Language | Runtime | Version |
|---|---|---|---|
| Server | TypeScript | Node.js | ≥ 20 LTS |
| Web | TypeScript | Browser (Vite) | ES2022 target |
| Mobile | TypeScript | React Native (Hermes) | RN 0.74+ |
| CLI | TypeScript → compiled JS | Node.js | ≥ 18 |
| Shared packages | TypeScript | N/A (library) | Strict mode |

**TypeScript config:** `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true` across all packages.

---

## 2. Package Management & Monorepo

| Tool | Version | Purpose |
|---|---|---|
| **pnpm** | ≥ 9 | Package manager |
| **pnpm workspaces** | built-in | Monorepo management |
| **Turborepo** | ≥ 2 | Build caching and task orchestration |

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

---

## 3. Frontend — Web

| Dependency | Version | Purpose |
|---|---|---|
| **React** | 19 | UI framework |
| **Vite** | 5 | Build tool, dev server |
| **React Router** | 6 | Client-side routing |
| **Zustand** | 4 | Global UI state (lightweight, no boilerplate) |
| **TanStack Query** | 5 | Server state, caching, background sync |
| **Tailwind CSS** | 4 | Utility-first styling |
| **Radix UI** | latest | Headless accessible component primitives |
| **Framer Motion** | 11 | Animations (completion animations, transitions) |
| **marked** | 14 | Markdown → HTML rendering |
| **highlight.js** | 11 | Syntax highlighting (tree-shaken: JS/TS/Python/Bash/SQL/JSON) |
| **DOMPurify** | 3 | XSS sanitisation (render-time) |
| **isomorphic-dompurify** | 2 | XSS sanitisation (server-side, Story 6.2) |
| **cmdk** | 1 | Command palette primitive (Story 6.1) |
| **react-hot-toast** | 2 | Toast notifications |
| **date-fns** | 3 | Date formatting (not parsing — Chrono.js handles parsing) |

---

## 4. Frontend — Mobile (React Native)

| Dependency | Version | Purpose |
|---|---|---|
| **React Native** | 0.74+ | Mobile framework |
| **Expo** | SDK 51+ | Build tools, native modules |
| **Expo Router** | 3 | File-based navigation |
| **React Native Reanimated** | 3 | GPU-accelerated animations (Story 4.1) |
| **React Native Gesture Handler** | 2 | Swipe/drag gestures |
| **react-native-markdown-display** | 7 | Markdown rendering (no WebView) |
| **@react-native-clipboard/clipboard** | 1 | Clipboard for code block copy button |
| **expo-speech** | latest | Voice synthesis (if needed) |
| **expo-av** | latest | Completion sound playback |
| **expo-sqlite** | 14 | SQLite local database |
| **better-sqlite3** | 9 | SQLite for CLI (Node.js) |
| **@react-native-voice/voice** | 3 | On-device speech-to-text (Story 1.2) |
| **react-native-confetti-cannon** | 1 | Confetti animation (Story 4.1) |

---

## 5. Shared Package

| Dependency | Purpose |
|---|---|
| **zod** | Runtime schema validation; shared between client and server |
| **chrono-node** | NLP date parsing (Story 1.5) |
| **yjs** | CRDT data structures |
| **y-protocols** | Yjs sync/awareness protocol |
| **uuid** | UUID v7 generation (time-sortable) |

---

## 6. Server

| Dependency | Version | Purpose |
|---|---|---|
| **Fastify** | 4 | HTTP framework |
| **@fastify/cors** | 9 | CORS middleware |
| **@fastify/rate-limit** | 9 | Rate limiting (Story 1.4: 1000 req/hr per API key) |
| **@fastify/jwt** | 8 | JWT verification (Supabase JWT) |
| **@fastify/swagger** | 8 | OpenAPI 3.0 spec generation (`/api/docs`) |
| **@fastify/swagger-ui** | 4 | Swagger UI at `/api/docs` |
| **Prisma** | 5 | ORM + migrations for PostgreSQL |
| **@prisma/client** | 5 | Generated Prisma client |
| **BullMQ** | 5 | Job queue (email, webhooks, cron jobs) |
| **ioredis** | 5 | Redis client |
| **y-websocket** | 2 | Yjs sync server (WebSocket) |
| **nodemailer** / **Resend SDK** | latest | Email sending (Story 4.3) |
| **openai** | 4 | OpenAI API client (server-side only, Story 3.4) |
| **@aws-sdk/client-s3** | 3 | R2/S3 for digest image uploads |
| **sharp** | 0.33 | PNG generation for digest share card |
| **zod** | 3 | Request validation |
| **pino** | 8 | Structured logging |

---

## 7. Database

### 7.1 Server — PostgreSQL

| Tool | Version | Purpose |
|---|---|---|
| **PostgreSQL** | 15+ | Primary relational database |
| **Supabase** | hosted | Managed PostgreSQL + Auth + Row-Level Security |
| **PgBouncer** | built-in (Supabase) | Connection pooling |
| **Prisma** | 5 | Schema management, migrations, type-safe queries |

### 7.2 Client — SQLite

| Tool | Version | Purpose |
|---|---|---|
| **expo-sqlite** | 14 | SQLite on iOS/Android via Expo |
| **better-sqlite3** | 9 | SQLite on Node.js (CLI offline cache) |
| **Drizzle ORM** | 0.30+ | Type-safe SQLite queries on client |
| **Drizzle Kit** | 0.20+ | SQLite migrations on client |

### 7.3 Cache / Queue

| Tool | Version | Purpose |
|---|---|---|
| **Redis** | 7 | BullMQ backing store, rate limit counters |
| **BullMQ** | 5 | Job queue with retry/cron support |

---

## 8. Authentication

| Service | Purpose |
|---|---|
| **Supabase Auth** | OAuth (Google, Apple), email+password, magic link |
| **JWT** (RS256) | API authentication; verified server-side via `@fastify/jwt` |
| **API Keys** | Developer integrations; SHA-256 hashed in DB; Bearer token in `Authorization` header |

Auth flow:
1. User signs in via Supabase Auth (client-side OAuth)
2. Supabase issues a JWT (RS256 signed)
3. Client includes JWT in all API requests: `Authorization: Bearer <jwt>`
4. Fastify verifies JWT signature using Supabase public key
5. User ID extracted from JWT `sub` claim; used for all data scoping

---

## 9. Testing

| Layer | Framework | Config |
|---|---|---|
| Unit tests | **Vitest** | Co-located with source files (`*.test.ts`) |
| API integration | **Supertest** + Vitest | `tests/integration/` — hits real test DB |
| Web E2E | **Playwright** | `e2e/` — runs against local dev server |
| Mobile E2E | **Detox** | `e2e/mobile/` — runs on iOS/Android simulator |
| Accessibility | **axe-core** + Playwright | Integrated in E2E suite |
| Visual regression | **Playwright screenshots** | Component snapshot tests |

Test coverage targets:
- Unit: ≥ 80% for service files; ≥ 85% for security-critical code (crypto, auth)
- Integration: all REST endpoints tested
- E2E: critical user journeys (create task, complete task, sync, auth)

---

## 10. Tooling

| Tool | Purpose |
|---|---|
| **ESLint** + `@typescript-eslint` | Linting (strict rules) |
| **Prettier** | Code formatting |
| **Husky** + `lint-staged` | Pre-commit hooks |
| **commitlint** | Conventional commit messages |
| **GitHub Actions** | CI/CD pipeline |
| **Sentry** | Error tracking (web, mobile, server) |
| **PostHog** | Product analytics (opt-in events only) |
| **Prisma Studio** | DB inspection in development |

---

## 11. Environment Variables (Required)

```bash
# Server
DATABASE_URL=postgresql://...          # Supabase PostgreSQL connection string
DIRECT_URL=postgresql://...            # Direct (non-pooled) for Prisma migrations
REDIS_URL=redis://...
SUPABASE_JWT_SECRET=...               # For JWT verification
SUPABASE_SERVICE_KEY=...              # Server-side Supabase admin operations
OPENAI_API_KEY=...                    # OpenAI (server-side only — NEVER on client)
RESEND_API_KEY=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
WEBHOOK_SECRET_ENCRYPTION_KEY=...    # AES-256 key for webhook secrets (Story 6.4)
EMAIL_INGEST_DOMAIN=...              # e.g., app.domain for email-to-task
APP_BASE_URL=https://app.domain

# Feature flags
FF_VOICE_CAPTURE=false
FF_EMAIL_INGEST=false
FF_GOAL_DECOMPOSITION=false
FF_ACCOUNTABILITY_PARTNER=false
FF_SHARED_LISTS=false
FF_WEBHOOKS=false
```

---

*Next: [03-data-models.md](./03-data-models.md) for the complete database schema.*
