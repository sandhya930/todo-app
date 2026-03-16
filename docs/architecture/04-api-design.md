# Architecture Shard 04 — API Design

**Parent:** [Architecture Index](./index.md)
**Read for:** Story 1.4 (REST API), Story 6.3 (CLI), Story 6.4 (Webhooks), any story adding new endpoints

---

## 1. API Conventions

| Convention | Value |
|---|---|
| Base path | `/api/v1` |
| Auth | `Authorization: Bearer <token>` — either Supabase JWT or API key |
| Content-Type | `application/json` |
| IDs | UUID v7 (string) |
| Timestamps | ISO 8601 UTC (`2026-03-16T10:00:00Z`) |
| Dates | ISO 8601 date-only (`2026-03-16`) |
| Pagination | Cursor-based: `?cursor=<id>&limit=50` |
| Errors | `{ "error": "<code>", "message": "<human>", "details"?: {} }` |
| Docs | OpenAPI 3.0 at `/api/docs` (Swagger UI) |

---

## 2. Authentication Flow

### 2.1 JWT (Web/Mobile users)

```
Client → Supabase Auth (OAuth/email) → receives JWT
Client → GET /api/v1/tasks
  headers: Authorization: Bearer <supabase-jwt>
Server → @fastify/jwt verifies signature with Supabase public key
Server → extracts user_id from jwt.sub
Server → scopes all queries to user_id
```

### 2.2 API Key (Developer / CLI)

```
User → POST /api/v1/auth/api-keys → receives key (shown ONCE)
CLI / script → GET /api/v1/tasks
  headers: Authorization: Bearer todo_<key>
Server → strips prefix, SHA-256 hashes key, looks up ApiKey record
Server → checks revoked_at IS NULL
Server → extracts user_id from ApiKey.user_id
```

### 2.3 Auth Middleware

```typescript
// Fastify preHandler — applied to all /api/v1/* routes except /api/docs
async function authenticate(request, reply) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return reply.code(401).send({ error: 'unauthorized' });

  // Try JWT first
  if (!token.startsWith('todo_')) {
    const payload = await verifySupabaseJwt(token);
    request.userId = payload.sub;
    return;
  }

  // API key
  const user = await resolveApiKey(token);
  if (!user) return reply.code(401).send({ error: 'invalid_api_key' });
  request.userId = user.id;
}
```

---

## 3. Endpoint Reference

### 3.1 Tasks

```
POST   /api/v1/tasks                    Create task (Story 1.4)
GET    /api/v1/tasks                    List tasks (with filters)
GET    /api/v1/tasks/:id                Get single task
PATCH  /api/v1/tasks/:id                Update task (partial update)
DELETE /api/v1/tasks/:id                Delete task
GET    /api/v1/tasks/pick-for-me        AI task selection (Story 3.1)
```

#### POST /api/v1/tasks

Request:
```json
{
  "title": "Buy groceries",          // required, max 500 chars
  "due_date": "2026-03-17",          // optional, YYYY-MM-DD
  "project_id": "uuid",              // optional
  "notes": "string",                 // optional, max 10000 chars, Markdown
  "energy_level": "no_brainer",      // optional: high_focus | low_focus | no_brainer
  "estimated_duration_minutes": 20,  // optional
  "status": "inbox"                  // optional, default: inbox
}
```

Response `201 Created`:
```json
{
  "id": "019526b0-1234-7abc-...",
  "title": "Buy groceries",
  "status": "inbox",
  "due_date": null,
  "project_id": null,
  "energy_level": null,
  "notes": null,
  "source": "api",
  "created_at": "2026-03-16T10:00:00Z",
  "updated_at": "2026-03-16T10:00:00Z"
}
```

#### GET /api/v1/tasks

Query parameters:
```
status=inbox|active|deferred|someday|completed|today
project_id=uuid
energy_level=high_focus|low_focus|no_brainer
due_date_from=YYYY-MM-DD
due_date_to=YYYY-MM-DD
search=string                         (full-text search)
cursor=uuid                           (pagination cursor)
limit=50                              (default 50, max 100)
```

Response `200 OK`:
```json
{
  "data": [ /* Task[] */ ],
  "cursor": "uuid-of-last-item",
  "has_more": true
}
```

#### PATCH /api/v1/tasks/:id

All fields optional (partial update):
```json
{
  "title": "string",
  "status": "completed",
  "due_date": "2026-03-18",
  "project_id": "uuid",
  "notes": "string",
  "energy_level": "high_focus",
  "pinned_today": true,
  "today_sort_order": 2
}
```

Triggers webhook dispatch for `task.updated` **only if** `title`, `due_date`, `project_id`, `energy_level`, `status`, or `notes` changed (not on `today_sort_order`, `pinned_today`).

#### GET /api/v1/tasks/pick-for-me

Response `200 OK`:
```json
{
  "task": { /* Task */ },
  "reason": "This is due today and takes about 20 minutes.",
  "skip_count": 0
}
```

Query param: `?skip_ids=uuid1,uuid2,uuid3` (up to 3 already-skipped IDs)

---

### 3.2 Projects

```
POST   /api/v1/projects                 Create project (Story 2.3)
GET    /api/v1/projects                 List projects
GET    /api/v1/projects/:id             Get project with task counts
PATCH  /api/v1/projects/:id             Update project
DELETE /api/v1/projects/:id             Archive project (soft delete)
POST   /api/v1/projects/:id/share       Enable sharing, get share token (Story 5.2)
POST   /api/v1/projects/join            Join via invite token (Story 5.2)
GET    /api/v1/projects/:id/members     List members (Story 5.2)
DELETE /api/v1/projects/:id/members/:memberId  Remove member / leave
```

---

### 3.3 Sub-Tasks

```
POST   /api/v1/tasks/:taskId/subtasks   Create sub-task (Story 4.4)
PATCH  /api/v1/tasks/:taskId/subtasks/:id  Update sub-task
DELETE /api/v1/tasks/:taskId/subtasks/:id  Delete sub-task
PATCH  /api/v1/tasks/:taskId/subtasks/reorder  Reorder (body: { ids: string[] })
```

---

### 3.4 Auth / API Keys

```
GET    /api/v1/auth/api-keys            List API keys (name, prefix, created_at — no key)
POST   /api/v1/auth/api-keys            Create API key (returns key ONCE)
DELETE /api/v1/auth/api-keys/:id        Revoke API key
GET    /api/v1/auth/me                  Current user profile
PATCH  /api/v1/auth/me                  Update user preferences
```

POST /api/v1/auth/api-keys response (`201`):
```json
{
  "id": "uuid",
  "name": "My Script",
  "key": "todo_abc12345...",            // shown ONCE — client must save it
  "key_prefix": "todo_abc1",
  "scopes": ["read", "write"],
  "created_at": "..."
}
```

---

### 3.5 AI Endpoints

```
POST   /api/v1/ai/decompose-goal        Goal → tasks (Story 3.4)
```

POST /api/v1/ai/decompose-goal:
```json
// Request
{ "goal": "Launch my personal website by end of month" }

// Response 200
{
  "tasks": [
    {
      "title": "Choose a domain name",
      "suggested_due_date": "2026-03-18",
      "energy_level": "low_focus",
      "sort_order": 1
    },
    ...
  ]
}
```

Rate limited: 10 requests/day per user (tracked in Redis).

---

### 3.6 Webhooks

```
GET    /api/v1/webhooks                         List webhooks (Story 6.4)
POST   /api/v1/webhooks                         Create webhook
PATCH  /api/v1/webhooks/:id                     Update webhook
DELETE /api/v1/webhooks/:id                     Delete webhook
GET    /api/v1/webhooks/:id/deliveries          Delivery log (last 50)
POST   /api/v1/webhooks/:id/deliveries/:deliveryId/resend  Resend delivery
```

POST /api/v1/webhooks request:
```json
{
  "url": "https://hooks.example.com/todo",   // HTTPS required
  "secret": "my-secret-string",              // stored AES-256-GCM encrypted
  "events": ["task.completed", "task.created"],
  "include_notes": false,
  "active": true
}
```

POST /api/v1/webhooks response (secret shown **once**):
```json
{
  "id": "uuid",
  "url": "https://hooks.example.com/todo",
  "secret": "my-secret-string",             // ONLY returned on creation
  "events": ["task.completed", "task.created"],
  "include_notes": false,
  "active": true,
  "created_at": "..."
}
```

Subsequent GET responses: `"secret": "[hidden]"` — never returned again.

---

### 3.7 Accountability (Story 5.1)

```
POST   /api/v1/tasks/:taskId/accountability     Add accountability partner
DELETE /api/v1/tasks/:taskId/accountability     Remove accountability partner
GET    /api/v1/accountability/accept            Accept invite (query: ?token=)
GET    /api/v1/accountability/unsubscribe       Unsubscribe from notifications (query: ?token=)
```

---

### 3.8 Digest / Stats (Story 4.3)

```
GET    /api/v1/stats/weekly             Weekly stats for digest / in-app report
GET    /api/v1/stats/streak             Current streak data + heatmap (last 90 days)
POST   /api/v1/digest/share-card        Generate shareable PNG; returns R2 URL
```

---

## 4. Error Codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `validation_error` | Request body/params failed Zod validation |
| 401 | `unauthorized` | Missing or invalid auth token |
| 403 | `forbidden` | Authenticated but not permitted for this resource |
| 403 | `pro_required` | Feature requires Pro tier (e.g., webhooks for free user) |
| 404 | `not_found` | Resource does not exist or belongs to another user |
| 409 | `conflict` | e.g., duplicate API key name |
| 422 | `unprocessable` | Business logic error (e.g., "http:// URL rejected for webhook") |
| 429 | `rate_limited` | Rate limit exceeded; `Retry-After` header set |
| 500 | `internal_error` | Unexpected server error; logged with Sentry |

```json
// Example 403 Pro gate
{
  "error": "pro_required",
  "message": "Webhooks are a Pro feature. Upgrade to create webhooks.",
  "feature": "webhooks",
  "upgrade_url": "https://app.domain/upgrade"
}
```

---

## 5. Rate Limiting

All rate limits use Redis sliding window counters, keyed by user ID.

| Endpoint Group | Limit | Window |
|---|---|---|
| All API endpoints (authenticated) | 1,000 req | 1 hour |
| POST /api/v1/tasks | 100 | 1 hour |
| POST /api/v1/ai/decompose-goal | 10 | 24 hours |
| POST /api/v1/auth/api-keys | 10 | 24 hours |

Rate limit response (`429`):
```
HTTP/1.1 429 Too Many Requests
Retry-After: 1800
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1710590400
```

---

## 6. OpenAPI Spec

The OpenAPI 3.0 spec is auto-generated by `@fastify/swagger` from route schemas. All routes must include:

```typescript
// Example Fastify route with schema
fastify.post('/api/v1/tasks', {
  schema: {
    tags: ['tasks'],
    summary: 'Create a new task',
    security: [{ bearerAuth: [] }],
    body: CreateTaskSchema,          // Zod schema converted to JSON Schema
    response: {
      201: TaskResponseSchema,
      400: ErrorSchema,
      401: ErrorSchema,
    },
  },
  preHandler: [authenticate],
  handler: createTaskHandler,
});
```

Live Swagger UI: `GET /api/docs`
Raw OpenAPI JSON: `GET /api/docs/json`

---

*Next: [05-offline-sync.md](./05-offline-sync.md) for CRDT sync architecture.*
