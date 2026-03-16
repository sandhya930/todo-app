# Architecture Shard 10 — Infrastructure

**Parent:** [Architecture Index](./index.md)
**Read for:** DevOps setup, deployment, environment configuration, monitoring, CI/CD

---

## 1. Hosting Overview

| Service | Provider | Notes |
|---|---|---|
| API Server (Fastify) | **Railway** | Auto-deploy from `main` branch; scales horizontally |
| Sync Server (y-websocket) | Railway | Separate Railway service; needs persistent WebSocket |
| PostgreSQL | **Supabase** (hosted) | Managed PostgreSQL 15, PgBouncer built-in, daily backups |
| Redis | **Upstash** | Serverless Redis; BullMQ + rate limiting |
| Object Storage | **Cloudflare R2** | Digest PNG images; S3-compatible API |
| Web App (React) | **Cloudflare Pages** | Edge-deployed static assets + PWA service worker |
| Mobile (iOS + Android) | **Expo EAS Build** | Managed builds + OTA updates via Expo |
| Email | **Resend** | Transactional email sending |
| Domain / CDN | **Cloudflare** | DNS, DDoS protection, edge caching |

**Rationale:** Railway for simplicity (no K8s overhead for an MVP), Supabase for managed PostgreSQL + Auth, Cloudflare Pages for edge-hosted web app (zero cold starts). Can migrate to AWS/GCP at scale.

---

## 2. Environment Configuration

Three environments:

| Environment | Purpose | Deploy trigger |
|---|---|---|
| `development` | Local dev | Manual |
| `staging` | Pre-release testing, E2E tests | Push to `develop` branch |
| `production` | Live users | Push to `main` branch (via PR merge) |

### Environment Variables (per service)

```
# Shared (all services)
NODE_ENV=production|staging|development
APP_BASE_URL=https://app.domain

# API Server
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...       # non-pooled, for Prisma migrations
REDIS_URL=rediss://...
SUPABASE_JWT_SECRET=...
SUPABASE_SERVICE_KEY=...
OPENAI_API_KEY=...
RESEND_API_KEY=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=todo-app-assets
WEBHOOK_SECRET_ENCRYPTION_KEY=...  # 64 hex chars (256-bit)
EMAIL_INGEST_DOMAIN=app.domain
PORT=3000

# Feature flags
FF_VOICE_CAPTURE=false
FF_EMAIL_INGEST=false
FF_GOAL_DECOMPOSITION=false
FF_ACCOUNTABILITY_PARTNER=false
FF_SHARED_LISTS=false
FF_WEBHOOKS=false

# Sync Server
SYNC_PORT=1234
DATABASE_URL=...                   # Same DB — for ProjectMember access checks
SUPABASE_JWT_SECRET=...

# Web App (build-time env, baked into bundle)
VITE_API_BASE_URL=https://api.app.domain
VITE_SYNC_URL=wss://sync.app.domain
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...        # Public anon key only — safe to expose
VITE_POSTHOG_KEY=...
VITE_SENTRY_DSN=...
```

**Secret management:** Railway Secrets for server vars; Cloudflare Pages env vars for web. Never commit `.env` files.

---

## 3. Docker Configuration

```dockerfile
# packages/server/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/server/package.json ./packages/server/
COPY packages/shared/package.json ./packages/shared/
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
RUN pnpm --filter server build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY packages/server/prisma ./prisma

# Run Prisma migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

EXPOSE 3000
```

```yaml
# docker-compose.yml (local development)
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/todo_dev
      REDIS_URL: redis://redis:6379
    depends_on: [db, redis]

  sync:
    build:
      context: .
      dockerfile: packages/server/Dockerfile.sync
    ports:
      - "1234:1234"

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: todo_dev
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

---

## 4. CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: todo_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Prisma migrations
        run: pnpm --filter server prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/todo_test

      - name: Lint
        run: pnpm lint

      - name: Type check
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm test:unit --coverage

      - name: Integration tests
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/todo_test
          REDIS_URL: redis://localhost:6379

      # Audit: "overdue" must never appear in source code
      - name: Anti-overdue audit
        run: |
          if grep -r "overdue" packages/ --include="*.ts" --include="*.tsx" \
              --exclude-dir=node_modules --exclude="*.test.ts" -l; then
            echo "ERROR: 'overdue' found in source code. This violates the forgiveness mechanic."
            exit 1
          fi

  e2e:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v4
      - name: Run Playwright E2E
        run: pnpm test:e2e

  deploy-staging:
    needs: [test, e2e]
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Railway (staging)
        run: railway up --service api --environment staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  deploy-production:
    needs: [test, e2e]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production          # Requires manual approval
    steps:
      - name: Deploy to Railway (production)
        run: railway up --service api --environment production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

---

## 5. Database Migrations

```bash
# Development: create and apply migration
pnpm --filter server prisma migrate dev --name "add_webhook_table"

# Production: apply migrations (runs in Dockerfile CMD)
pnpm --filter server prisma migrate deploy

# Never run 'migrate reset' in production
# Schema changes must be additive (no column drops without two-step migration)
```

**Migration safety rules:**
1. Never drop columns — add new ones, deprecate old ones
2. Never rename columns — add new column, copy data, remove old in a later migration
3. All new columns must have defaults (not nullable without default in PostgreSQL)
4. Test migrations against a copy of production data before deploying

---

## 6. Monitoring & Observability

| Tool | What It Monitors |
|---|---|
| **Sentry** | Error tracking (server + web + mobile); alerts on new errors |
| **PostHog** | Product analytics; funnel tracking; feature flag rollout |
| **Railway Metrics** | CPU, memory, request volume, latency |
| **Upstash Console** | Redis memory usage, BullMQ queue depths |
| **Supabase Dashboard** | DB query performance, connection pool health |
| **Resend Dashboard** | Email delivery rates, bounce rates |
| **Pino Logger** | Structured JSON logs; aggregated in Railway log drain |

### Key Alerts (configure in Sentry / Railway)

| Alert | Threshold |
|---|---|
| API error rate | > 1% of requests result in 5xx |
| API p95 latency | > 500ms |
| BullMQ failed jobs | > 10 in any queue in 5 minutes |
| DB connection pool exhaustion | > 90% connections used |
| Sync server disconnections | > 100/minute |
| Redis memory | > 80% of allocated |

---

## 7. Backup & Recovery

| Data | Backup Strategy | RTO | RPO |
|---|---|---|---|
| PostgreSQL | Supabase daily snapshots + WAL streaming | 4 hours | 1 hour |
| Redis (BullMQ) | Upstash Redis persistence (AOF) | 1 hour | 5 min |
| R2 (Images) | Cloudflare R2 versioning | 1 hour | 0 (versioned) |
| Client SQLite | User's device only — CRDT sync to server is durable store | N/A | Server sync |

---

## 8. Performance Targets & Scaling

### Current Architecture Limits (single Railway instance)

| Metric | Estimated Limit |
|---|---|
| Concurrent API connections | ~1,000 (Fastify) |
| Concurrent WebSocket sync connections | ~500 (y-websocket) |
| BullMQ job throughput | ~500 jobs/sec |
| PostgreSQL connections | 25 (PgBouncer pool) |

### Scale-Up Path (when needed)

1. **Horizontal scaling:** Railway auto-scales API server instances (stateless; Redis handles shared state)
2. **Sync server:** Add Redis adapter for y-websocket to enable multi-instance sync server
3. **Read replicas:** Supabase read replicas for reporting/analytics queries
4. **CDN caching:** Cloudflare cache for `GET /api/v1/projects` and `GET /api/v1/tasks` (with cache invalidation on write)

---

## 9. Local Development Setup

```bash
# 1. Clone repo
git clone https://github.com/org/todo-app && cd todo-app

# 2. Install dependencies
pnpm install

# 3. Start infrastructure
docker compose up -d db redis

# 4. Set up environment
cp packages/server/.env.example packages/server/.env
# Edit .env with local values

# 5. Run migrations
pnpm --filter server prisma migrate dev

# 6. Start all services in parallel
pnpm dev
# Starts: API server (3000), sync server (1234), web (5173), mobile (Expo)
```

---

*Architecture documentation complete. Return to [index.md](./index.md) for the full shard map.*
