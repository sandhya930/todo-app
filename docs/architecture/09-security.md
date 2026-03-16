# Architecture Shard 09 — Security

**Parent:** [Architecture Index](./index.md)
**Read for:** Story 1.4 (API keys), Story 6.2 (Markdown XSS), Story 6.4 (HMAC signing, AES-256 secrets)

---

## 1. Authentication & Authorization

### 1.1 Supabase Auth (End Users)

- Google OAuth, Apple Sign In, email+password, magic link
- Issues RS256-signed JWTs; short expiry (1 hour) + refresh tokens
- JWT `sub` claim = user UUID; all DB queries scope to this ID
- Row-Level Security (RLS) policies on Supabase PostgreSQL as defense-in-depth

### 1.2 API Keys (Developers / CLI)

**Storage:** SHA-256 hash only. The plaintext key is never stored.

```typescript
// packages/server/src/services/api-key.service.ts

import { createHash, randomBytes } from 'crypto';

export class ApiKeyService {
  generate(): { key: string; hash: string; prefix: string } {
    const raw = randomBytes(32).toString('hex');       // 64 hex chars
    const key = `todo_${raw}`;                         // prefix for easy identification
    const hash = createHash('sha256').update(key).digest('hex');
    const prefix = key.slice(0, 9);                    // "todo_abcd" — shown in UI
    return { key, hash, prefix };
  }

  async create(userId: string, name: string, scopes: string[]) {
    const { key, hash, prefix } = this.generate();

    await prisma.apiKey.create({
      data: { user_id: userId, name, key_hash: hash, key_prefix: prefix, scopes },
    });

    // Return key ONCE — never retrievable again
    return key;
  }

  async verify(bearerToken: string): Promise<string | null> {
    if (!bearerToken.startsWith('todo_')) return null;
    const hash = createHash('sha256').update(bearerToken).digest('hex');
    const apiKey = await prisma.apiKey.findFirst({
      where: { key_hash: hash, revoked_at: null },
    });
    if (!apiKey) return null;

    // Update last_used_at (async, don't block)
    void prisma.apiKey.update({ where: { id: apiKey.id }, data: { last_used_at: new Date() } });

    return apiKey.user_id;
  }
}
```

### 1.3 Authorization Rules

All endpoints enforce ownership. Users cannot access other users' data.

```typescript
// Middleware applied to all resource endpoints
async function requireOwnership(request, reply) {
  const resource = await db.findById(request.params.id);
  if (resource.user_id !== request.userId) {
    return reply.code(404).send({ error: 'not_found' }); // 404 not 403 — don't leak existence
  }
}
```

**Note:** Return 404 (not 403) when a resource exists but belongs to another user. This prevents enumeration attacks.

---

## 2. Webhook Secret Encryption (Story 6.4)

Webhook secrets are used for HMAC signing at delivery time. They must be recoverable (not one-way hashed). AES-256-GCM provides authenticated encryption.

```typescript
// packages/server/src/lib/crypto.ts

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.WEBHOOK_SECRET_ENCRYPTION_KEY!, 'hex');
// WEBHOOK_SECRET_ENCRYPTION_KEY must be 64 hex chars (= 32 bytes = 256 bits)
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const ALGORITHM = 'aes-256-gcm';

export function encryptAES256GCM(plaintext: string): string {
  const iv = randomBytes(12);                          // 96-bit IV (GCM standard)
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();                 // 16-byte auth tag

  // Store as: iv(24 hex) + authTag(32 hex) + encrypted(N hex)
  return iv.toString('hex') + authTag.toString('hex') + encrypted.toString('hex');
}

export function decryptAES256GCM(stored: string): string {
  const iv = Buffer.from(stored.slice(0, 24), 'hex');
  const authTag = Buffer.from(stored.slice(24, 56), 'hex');
  const encrypted = Buffer.from(stored.slice(56), 'hex');

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
```

**Key management:**
- Key stored only in environment variables — never in DB or code
- Key rotation: add a `key_version` field to `Webhook.secret_encrypted`, re-encrypt on next write
- If `WEBHOOK_SECRET_ENCRYPTION_KEY` is compromised: revoke, rotate, re-encrypt all webhook secrets

---

## 3. HMAC-SHA256 Webhook Signing (Story 6.4)

```typescript
// packages/server/src/lib/crypto.ts (continued)

export function computeHMAC(secret: string, rawBody: string): string {
  return createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
}

// Verification (for receiver documentation / tests)
export function verifyHMAC(secret: string, rawBody: string, signatureHeader: string): boolean {
  const expected = `sha256=${computeHMAC(secret, rawBody)}`;
  // Timing-safe comparison prevents timing attacks
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
```

**Delivery headers:**
```
X-Todo-Signature: sha256={hex_digest}
X-Todo-Event: task.completed
X-Todo-Delivery: {deliveryId}
Content-Type: application/json
User-Agent: TodoApp-Webhook/1.0
```

**Receiver verification (reference for API docs):**

```python
import hmac, hashlib
def verify(secret: str, body: bytes, header: str) -> bool:
    expected = 'sha256=' + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)
```

```javascript
const crypto = require('crypto');
function verify(secret, rawBody, header) {
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(header));
}
```

---

## 4. XSS Prevention (Story 6.2)

All Markdown content must pass through two sanitisation layers:

### Layer 1: Server-side (before storage)

```typescript
// packages/server/src/services/task.service.ts

import createDOMPurify from 'isomorphic-dompurify';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window as any);

function sanitizeNotes(raw: string): string {
  // Store raw Markdown text — strip any HTML tags entirely
  // (Markdown is stored as-is; HTML is stripped at storage time)
  return DOMPurify.sanitize(raw, { ALLOWED_TAGS: [] });
}
```

### Layer 2: Render-time (on client, after Markdown → HTML)

```typescript
// packages/web/src/lib/markdown.ts

export function renderMarkdown(raw: string): string {
  const html = marked.parse(raw) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','strong','em','h1','h2','h3','ul','ol','li',
                   'code','pre','a','blockquote','hr','span','br'],
    ALLOWED_ATTR: ['href', 'class'],
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],  // belt-and-suspenders
  });
}
```

### XSS Test Vectors (must all be neutralised at both layers)

| Payload | Expected Outcome |
|---|---|
| `<script>alert(1)</script>` | Tags stripped entirely |
| `<img src=x onerror=alert(1)>` | Tag stripped; no event handler |
| `[click me](javascript:alert(1))` | `href` → `#` or stripped |
| `<a href="data:text/html,<script>alert(1)</script>">` | Tag stripped |
| ` ```html\n<script>alert(1)</script>\n``` ` | Rendered as literal text in `<code>` block |

### Content Security Policy

```typescript
// packages/server/src/middleware/csp.ts
fastify.addHook('onSend', (request, reply, payload, done) => {
  reply.header('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +                    // NO 'unsafe-inline', NO 'unsafe-eval'
    "style-src 'self' 'unsafe-inline'; " +     // Tailwind uses inline styles
    "img-src 'self' data: blob:; " +           // data: for digest PNG, blob: for clipboard
    "connect-src 'self' wss://sync.app.domain;" // WebSocket for Yjs
  );
  done();
});
```

---

## 5. Input Validation

All API inputs validated with Zod before reaching service layer:

```typescript
// packages/shared/src/validation/task.schema.ts

import { z } from 'zod';

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(10_000).optional().nullable(),
  energy_level: z.enum(['high_focus', 'low_focus', 'no_brainer']).optional().nullable(),
  estimated_duration_minutes: z.number().int().min(1).max(1440).optional().nullable(),
  status: z.enum(['inbox', 'active', 'someday']).default('inbox'),
});

export const WebhookCreateSchema = z.object({
  url: z.string().url().refine(url => url.startsWith('https://'), {
    message: 'Webhook URL must use HTTPS',
  }),
  secret: z.string().min(8).max(256),
  events: z.array(z.enum(['task.created','task.completed','task.deferred','task.deleted','task.updated'])).min(1),
  include_notes: z.boolean().default(false),
  active: z.boolean().default(true),
});
```

---

## 6. Security Headers

| Header | Value |
|---|---|
| `Content-Security-Policy` | See above |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(self)` |

---

## 7. Rate Limiting Anti-Abuse

Beyond API rate limits (see [04-api-design.md](./04-api-design.md)):

```typescript
// packages/server/src/middleware/rate-limit.ts

// Webhook URL validation: reject private IP ranges (SSRF prevention)
function isWebhookUrlSafe(url: string): boolean {
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // Block localhost, private IP ranges, AWS metadata endpoint
  const blocked = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,                  // Link-local (AWS metadata: 169.254.169.254)
    /^::1$/,                        // IPv6 loopback
    /^fc00:/i,                      // IPv6 private
  ];

  return !blocked.some(pattern => pattern.test(hostname));
}
```

**Server-Side Request Forgery (SSRF):** Webhook URL validation must block private IP ranges before any HTTP request is made to the webhook URL.

---

## 8. Data Privacy

| Concern | Approach |
|---|---|
| GDPR right to export | `GET /api/v1/auth/me/export` — returns all user data as JSON |
| GDPR right to delete | `DELETE /api/v1/auth/me` — deletes user + cascade deletes all tasks/projects |
| Accountability partner emails | Stored minimally; deleted when link removed |
| Webhook delivery logs | Payload HASH only (not payload) stored; 30-day retention |
| AI goal content | Not stored server-side; passes through OpenAI proxy and discarded |
| Analytics | PostHog with IP anonymisation; no task content in events |

---

## 9. `.todorc` Security (CLI — Story 6.3)

```typescript
// packages/cli/src/auth.ts

import { writeFileSync, chmodSync } from 'fs';

function saveToken(token: string, email: string) {
  const config = JSON.stringify({ token, user_email: email, api_base_url: API_BASE });
  writeFileSync(RC_PATH, config, { encoding: 'utf8', flag: 'w' });
  chmodSync(RC_PATH, 0o600);    // User read/write only — no group/world access
}

// NEVER log token to stdout/stderr
// NEVER include token in --json output
```

---

*Next: [10-infrastructure.md](./10-infrastructure.md) for deployment, CI/CD, and monitoring.*
