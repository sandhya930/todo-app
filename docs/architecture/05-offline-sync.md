# Architecture Shard 05 — Offline-First & CRDT Sync

**Parent:** [Architecture Index](./index.md)
**Read for:** Story 1.1 (offline task capture), EP-02 views, Story 3.2 (deferral), Story 5.2 (⚠️ multi-user sync spike)

---

## 1. Foundational Decision: Yjs

**Chosen CRDT library: Yjs** (see Architecture Decision AD-001)

Yjs provides:
- Conflict-free merging of concurrent edits (no manual conflict resolution needed)
- Delta sync — only changed bytes travel over the wire
- Provider ecosystem: `y-websocket` (sync server), `y-indexeddb` (web persistence), custom SQLite adapter (mobile)
- Awareness protocol for presence/cursors (useful for shared lists)
- Proven React Native compatibility (pure JS, no native modules required)
- Bundle: ~85KB (Automerge is ~300KB)

---

## 2. Yjs Document Structure

Each user's tasks are stored in a single Yjs document partitioned by the user's ID. For shared projects, additional Yjs documents are created per shared project.

```typescript
// packages/shared/src/crdt/doc-schema.ts

import * as Y from 'yjs';

// Personal tasks document: ydoc-{userId}
// Shared project document: ydoc-project-{projectId}

export function createTaskDoc(): Y.Doc {
  const doc = new Y.Doc();

  // Tasks: Y.Map keyed by task UUID
  const tasks = doc.getMap<Y.Map<any>>('tasks');

  // Projects: Y.Map keyed by project UUID
  const projects = doc.getMap<Y.Map<any>>('projects');

  // SubTasks: Y.Map keyed by subtask UUID
  const subTasks = doc.getMap<Y.Map<any>>('subTasks');

  return doc;
}

// Each task is a Y.Map with the same fields as the Task model
// Example: tasks.get(taskId).get('title') → string
// Example: tasks.get(taskId).set('status', 'completed')
```

### Yjs Field Types

| Task Field | Yjs Type | Notes |
|---|---|---|
| `title` | `Y.Text` | Supports collaborative character-level editing |
| `status` | `string` (in `Y.Map`) | Last-write-wins on this field is acceptable |
| `notes` | `Y.Text` | Collaborative Markdown editing |
| `due_date` | `string` (in `Y.Map`) | LWW acceptable |
| `energy_level` | `string` (in `Y.Map`) | LWW acceptable |
| `pinned_today` | `boolean` (in `Y.Map`) | LWW acceptable |
| `today_sort_order` | `number` (in `Y.Map`) | LWW acceptable |
| `sub_tasks` | `Y.Array` of `Y.Map` | Ordered, supports insertion/deletion |

---

## 3. Client Architecture (Personal Sync)

```
┌──────────────────────────────────────────────────────────┐
│                   CLIENT DEVICE                           │
│                                                           │
│  ┌────────────────┐    ┌──────────────────────────────┐ │
│  │   React/RN UI  │    │     Yjs Document (in memory) │ │
│  │                │◄──►│     Y.Map('tasks')            │ │
│  │  useTaskStore  │    │     Y.Map('projects')         │ │
│  │  (Zustand)     │    └───────────────┬──────────────┘ │
│  └────────────────┘                    │                  │
│                                        │ observe()        │
│                                   ┌────▼─────────────┐   │
│                                   │  SQLite (Drizzle) │   │
│                                   │  Local cache      │   │
│                                   │  (source of truth)│   │
│                                   └────────┬──────────┘   │
└────────────────────────────────────────────┼──────────────┘
                                             │ WebSocket
                                             │ (y-websocket protocol)
                                             │
┌────────────────────────────────────────────▼──────────────┐
│                   SYNC SERVER                              │
│                                                            │
│         y-websocket server                                 │
│         Room: ydoc-{userId}  (personal)                   │
│         Room: ydoc-project-{id} (shared)                  │
└────────────────────────────────────────────────────────────┘
```

### Write Path (Online)

```
1. UI calls taskStore.createTask(data)
2. taskStore generates UUID v7 for task
3. Yjs doc: tasks.set(id, new Y.Map(data))    ← CRDT operation
4. Yjs doc observer fires
5. SQLite write: INSERT INTO tasks (...)       ← local persist (≤ 100ms)
6. UI update: task visible in Inbox           ← immediate
7. (async) Yjs delta sent via WebSocket       ← background sync
8. (async) Server persists to PostgreSQL      ← durable store
```

### Write Path (Offline)

```
1–6. Same as online (SQLite write succeeds without network)
7. WebSocket is disconnected — delta queued in Yjs internal buffer
8. On reconnect: Yjs sends accumulated deltas in order
   Server merges with CRDT semantics (no conflicts for personal docs)
```

### Conflict Scenario (Two Devices)

```
Device A (online):  task.title = "Buy milk"    at T=100
Device B (offline): task.title = "Buy oat milk" at T=110
Device B reconnects at T=200

Resolution: Yjs Y.Text applies character-level merging.
Result: "Buy oat milk" (B's version, higher logical timestamp)

For Y.Map fields (status, due_date): last logical timestamp wins.
This is acceptable because these are single-user fields in personal docs.
```

---

## 4. Client Persistence (SQLite ↔ Yjs)

SQLite is the durable local store. Yjs is the in-memory sync layer. They must stay in sync:

```typescript
// packages/shared/src/crdt/sync-sqlite.ts

export function bindDocToSQLite(doc: Y.Doc, db: DrizzleDB) {
  // On Yjs change: write to SQLite
  doc.getMap('tasks').observe((event) => {
    event.changes.keys.forEach((change, taskId) => {
      if (change.action === 'add' || change.action === 'update') {
        const yjsTask = doc.getMap('tasks').get(taskId);
        db.insert(tasks).values(yjsToSQLite(yjsTask)).onConflictDoUpdate(...);
      }
      if (change.action === 'delete') {
        db.delete(tasks).where(eq(tasks.id, taskId));
      }
    });
  });

  // On app start: hydrate Yjs from SQLite
  async function hydrate() {
    const localTasks = await db.select().from(tasks);
    const ydocTasks = doc.getMap('tasks');
    doc.transact(() => {
      localTasks.forEach(task => {
        if (!ydocTasks.has(task.id)) {
          ydocTasks.set(task.id, sqliteToYjs(task));
        }
      });
    });
  }

  return { hydrate };
}
```

---

## 5. Sync Server (y-websocket)

```typescript
// packages/server/src/sync/sync-server.ts

import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { setupWSConnection } from 'y-websocket/bin/utils';

const wss = new WebSocketServer({ port: 1234 });

wss.on('connection', async (ws, req) => {
  // Extract room name from URL: /sync/ydoc-{userId} or /sync/ydoc-project-{projectId}
  const room = req.url?.replace('/sync/', '') ?? '';

  // Verify JWT/API key from query param or header
  const userId = await authenticateWsConnection(req);
  if (!userId) { ws.close(4001, 'Unauthorized'); return; }

  // Verify user has access to this room
  if (!await canAccessRoom(userId, room)) {
    ws.close(4003, 'Forbidden');
    return;
  }

  // Hand off to y-websocket — handles all CRDT sync protocol
  setupWSConnection(ws, req, { docName: room, gc: true });
});
```

**Persistence:** y-websocket uses `LevelDB` by default. For production, use `y-redis` provider to store Yjs state in Redis for multi-server scaling.

---

## 6. ⚠️ Multi-User Sync (Story 5.2 — Architecture Spike Required)

> **This is the highest-risk architectural piece. Do not implement Story 5.2 without resolving this.**

### The Problem

Personal task sync works because one user's Yjs document only ever needs to be shared between that user's devices. Shared lists require the same Yjs document to be accessible by **multiple different users**.

### Proposed Architecture

**Option A: Per-Project Yjs Document (Recommended)**

```
Personal doc:  ydoc-{userId}        → user's personal tasks
Shared doc:    ydoc-project-{id}    → shared project tasks

When a project is shared:
1. Tasks in that project are migrated to the project's dedicated Yjs doc
2. All project members subscribe to ydoc-project-{projectId}
3. y-websocket server handles fan-out to all connected members

Access control: server verifies ProjectMember.status = 'ACTIVE'
before allowing WebSocket connection to ydoc-project-{id}
```

**Option B: Single User Doc with Cross-Doc References**

Not recommended — complex to implement, fragile across disconnections.

### Fan-Out Implementation

```typescript
// Modified sync server for shared docs
wss.on('connection', async (ws, req) => {
  const room = parseRoom(req.url);

  if (room.type === 'project') {
    // Check ProjectMember record
    const isMember = await db.projectMember.findFirst({
      where: { project_id: room.projectId, user_id: userId, status: 'ACTIVE' }
    });
    if (!isMember) { ws.close(4003, 'Not a member'); return; }
  }

  // y-websocket automatically broadcasts to all connections in the same room
  setupWSConnection(ws, req, { docName: room.name });
});
```

**Key insight:** y-websocket already handles fan-out to all WebSocket connections in the same room name. The only addition needed is the membership access control check.

### Migration When a Project Is Shared

```
1. Server receives POST /api/v1/projects/:id/share
2. Server creates new Yjs doc: ydoc-project-{projectId}
3. Server migrates existing tasks from user's personal doc to project doc
4. Project tasks are removed from ydoc-{userId} and added to ydoc-project-{id}
5. Client syncs both docs going forward (personal + each shared project doc)
```

### Spike Deliverables (Before Story 5.2 Implementation)

- [ ] Prototype: 2 users in the same y-websocket room, verify fan-out
- [ ] Test: offline member reconnects, receives all changes since last disconnect
- [ ] Test: concurrent edits to same task from 2 members, verify CRDT merge
- [ ] Decide: Redis-backed y-websocket for multi-server, or single-instance sufficient for MVP
- [ ] Document: confirmed approach in Story 5.2 Change Log

---

## 7. Offline Queue for Non-CRDT Operations

Some operations are not modeled in Yjs (e.g., AI goal decomposition, webhook management, accountability partner invites). These use a separate pending_operations queue in SQLite:

```typescript
// packages/shared/src/offline/operation-queue.ts

interface PendingOperation {
  id: string;
  type: 'create_accountability_link' | 'invoke_ai_decompose' | 'create_webhook' | ...;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
}

export class OfflineOperationQueue {
  async enqueue(op: Omit<PendingOperation, 'id' | 'created_at' | 'attempts'>) {
    await db.insert(pending_operations).values({ ...op, id: uuidv7(), created_at: now() });
  }

  async flush(apiClient: ApiClient) {
    const ops = await db.select().from(pending_operations).orderBy(asc(pending_operations.created_at));
    for (const op of ops) {
      try {
        await apiClient.execute(op);
        await db.delete(pending_operations).where(eq(pending_operations.id, op.id));
      } catch (e) {
        await db.update(pending_operations).set({ attempts: op.attempts + 1, last_error: e.message })
          .where(eq(pending_operations.id, op.id));
      }
    }
  }
}
```

Queue is flushed on every app foreground event and on every successful network request.

---

## 8. Sync Health & Edge Cases

| Scenario | Handling |
|---|---|
| Device offline for > 30 days | Yjs handles full state vector sync on reconnect (no data loss) |
| User logs in on new device | Server sends full Yjs document state as initial sync |
| Task deleted on device A while device B edits it | Yjs tombstones the deleted entry; edit is lost — acceptable (soft delete preferred) |
| Clock skew between devices | Yjs uses logical clocks (Lamport timestamps), not wall clocks |
| Sync server restart | Yjs state persisted in Redis; no data loss on restart |
| Personal task moved to shared project | Task migrated between Yjs documents (server-initiated migration) |

---

*Next: [06-backend-services.md](./06-backend-services.md) for job queue, email, and webhook delivery.*
