# Architecture Shard 07 — Frontend Architecture

**Parent:** [Architecture Index](./index.md)
**Read for:** All EP-02 stories, EP-04 Story 4.1 (animations), EP-06 Stories 6.1/6.2 (keyboard nav, Markdown), any UI/UX implementation

---

## 1. Cross-Platform Strategy

The app has two frontends that share a maximum of logic:

```
packages/shared/          ← shared TypeScript: types, validation, CRDT, NLP, utils
packages/web/             ← React + Vite (web + PWA)
packages/mobile/          ← React Native + Expo (iOS + Android)
```

**Shared between web and mobile:**
- All TypeScript types (`Task`, `Project`, `User`, etc.)
- Zod validation schemas
- Yjs CRDT document schemas
- Chrono.js date parsing wrapper
- Business logic utilities (pickForMe algorithm, stripMarkdown, etc.)
- API client (using `fetch` — available in both environments)

**NOT shared (platform-specific):**
- UI components (React DOM vs React Native components)
- Navigation (React Router vs Expo Router)
- Storage (IndexedDB/localStorage vs expo-sqlite)
- Animation (Framer Motion vs React Native Reanimated)
- Push notifications (web push vs Expo notifications)

---

## 2. Web App Architecture

### 2.1 Directory Structure

```
packages/web/src/
├── main.tsx                   # Entry point
├── router.tsx                 # React Router v6 routes
├── stores/                    # Zustand stores
│   ├── task.store.ts          # Task state + CRDT bindings
│   ├── ui.store.ts            # UI state (selectedTaskId, focus mode, etc.)
│   └── auth.store.ts          # Auth state
├── hooks/                     # Custom hooks
│   ├── useTaskList.ts         # Filtered task queries from local DB
│   ├── useTodayTasks.ts
│   ├── useKeyboardShortcuts.ts  # Story 6.1
│   └── useSync.ts             # Yjs sync provider
├── components/
│   ├── tasks/
│   │   ├── TaskCard.tsx
│   │   ├── TaskDetail.tsx
│   │   ├── QuickCapture.tsx
│   │   └── SubTaskList.tsx
│   ├── views/
│   │   ├── TodayView.tsx
│   │   ├── InboxView.tsx
│   │   ├── ProjectView.tsx
│   │   ├── SomedayView.tsx
│   │   └── CompletedView.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── MainLayout.tsx
│   │   └── FocusMode.tsx
│   ├── ui/                    # Radix UI primitives
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   └── ...
│   └── CommandPalette.tsx     # Story 6.1
├── lib/
│   ├── api.ts                 # API client (typed fetch)
│   ├── db.ts                  # Drizzle SQLite (browser via wa-sqlite or OPFS)
│   ├── sync.ts                # Yjs provider setup
│   └── markdown.ts            # marked + DOMPurify (Story 6.2)
└── styles/
    └── global.css             # Tailwind + custom CSS
```

### 2.2 State Management

**Rule:** Local data (tasks, projects) lives in SQLite/Yjs. Only ephemeral UI state lives in Zustand.

```typescript
// packages/web/src/stores/ui.store.ts

interface UIState {
  selectedTaskId: string | null;    // Story 6.1: J/K navigation
  focusModeTaskId: string | null;   // Story 2.2: Focus Mode
  commandPaletteOpen: boolean;      // Story 6.1
  currentView: ViewName;
  isSyncing: boolean;
  isOffline: boolean;
}

// Task state is derived from SQLite via Drizzle queries (TanStack Query)
// NOT stored in Zustand — prevents stale state divergence from CRDT
```

### 2.3 Data Fetching Pattern

```typescript
// packages/web/src/hooks/useTodayTasks.ts

// All task data comes from local SQLite, not the server API
// TanStack Query manages caching and refetch
export function useTodayTasks() {
  return useQuery({
    queryKey: ['tasks', 'today'],
    queryFn: () => db.select().from(tasks)
      .where(
        or(
          eq(tasks.pinned_today, true),
          and(
            eq(tasks.due_date, today()),
            inArray(tasks.status, ['active', 'inbox', 'deferred'])
          )
        )
      )
      .orderBy(asc(tasks.today_sort_order), asc(tasks.created_at))
      .limit(5),                     // Today view default: 5 tasks
    // Stale immediately — always reads from local DB
    staleTime: 0,
  });
}
```

### 2.4 SQLite in Browser

Web app uses SQLite via **OPFS (Origin Private File System)** with the `wa-sqlite` WASM driver:

```typescript
// packages/web/src/lib/db.ts
import { drizzle } from 'drizzle-orm/wa-sqlite';
import { OPFSSQLite } from 'wa-sqlite';

export async function initDb() {
  const sqlite = await OPFSSQLite.create('todo-app.db');
  return drizzle(sqlite, { schema });
}
```

Fallback: If OPFS not available (older browsers), fall back to in-memory SQLite (data lost on reload — show banner).

---

## 3. Mobile App Architecture (React Native + Expo)

### 3.1 Directory Structure

```
packages/mobile/
├── app/                       # Expo Router (file-based routing)
│   ├── (tabs)/
│   │   ├── today.tsx
│   │   ├── inbox.tsx
│   │   └── projects.tsx
│   ├── task/
│   │   └── [id].tsx           # Task detail
│   ├── focus/
│   │   └── index.tsx          # Focus Mode (Story 2.2)
│   └── settings/
│       └── index.tsx
├── components/                # RN-specific components
│   ├── TaskCard.tsx
│   ├── QuickCapture.tsx
│   ├── VoiceCapture.tsx       # Story 1.2
│   ├── CompletionAnimation.tsx # Story 4.1
│   └── MarkdownView.tsx       # Story 6.2 (react-native-markdown-display)
├── lib/
│   ├── db.ts                  # expo-sqlite + Drizzle
│   ├── sync.ts                # Yjs provider (y-websocket client)
│   └── notifications.ts      # Expo push notifications
└── hooks/                     # Mobile-specific hooks
```

### 3.2 Navigation (Expo Router)

```
/ (tabs)
  /today          → Today view
  /inbox          → Inbox
  /projects       → Projects list
/task/:id         → Task detail (modal stack)
/focus            → Focus Mode (full-screen)
/settings         → Settings
/auth/login       → Auth flow
/review           → Weekly review wizard (Story 3.3)
```

### 3.3 Expo SQLite Setup

```typescript
// packages/mobile/lib/db.ts
import * as ExpoSQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

const sqlite = ExpoSQLite.openDatabaseSync('todo-app.db');
export const db = drizzle(sqlite, { schema });
```

---

## 4. Completion Animations (Story 4.1)

**Rule:** All animations use `transform` and `opacity` only — never `top`, `left`, `width`, `height` (causes layout thrashing, drops frames).

### Web (Framer Motion)

```typescript
// packages/web/src/components/tasks/TaskCard.tsx

import { motion, AnimatePresence } from 'framer-motion';

function TaskCompletionAnimation({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      initial={{ scale: 1, opacity: 1 }}
      animate={{ scale: 0.95, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      onAnimationComplete={onComplete}
    />
  );
}

// Confetti: use canvas-confetti (web) — GPU composited via canvas element
```

### Mobile (React Native Reanimated)

```typescript
// packages/mobile/components/CompletionAnimation.tsx

import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

export function CompletionAnimation({ onComplete }: { onComplete: () => void }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Runs on UI thread — guaranteed 60fps
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  function play() {
    scale.value = withTiming(0.95, { duration: 300 });
    opacity.value = withTiming(0, { duration: 300 }, () => {
      runOnJS(onComplete)();
    });
  }

  return <Animated.View style={animatedStyle}>{/* task card */}</Animated.View>;
}
```

### Reduce Motion

```typescript
// Check at animation call site
import { AccessibilityInfo } from 'react-native';  // RN
import { useReducedMotion } from 'framer-motion';   // Web

// If reduced motion: use opacity fade only (no scale, no particles)
```

---

## 5. Keyboard Navigation (Story 6.1) — Web Only

### KeyboardShortcutManager

```typescript
// packages/web/src/lib/keyboard-shortcuts.ts

const DEFAULT_SHORTCUTS: Record<string, string> = {
  newTask: 'n',
  focusMode: 'f',
  editTask: 'e',
  setDueDate: 'd',
  pickForMe: 'p',
  cheatSheet: 'cmd+/',
  nextTask: 'j',
  prevTask: 'k',
  completeTask: 'space',
  deleteTask: 'backspace',
  commandPalette: 'cmd+k',
  goToToday: 'g+t',         // chord
  goToInbox: 'g+i',
  goToSomeday: 'g+s',
};

export class KeyboardShortcutManager {
  private bindings: Record<string, string>;
  private chordState: { key: string; timestamp: number } | null = null;

  constructor(userBindings: Record<string, string> = {}) {
    this.bindings = { ...DEFAULT_SHORTCUTS, ...userBindings };
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Skip if focus is in a text input (AC 7)
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ||
        el?.getAttribute('contenteditable') === 'true') return;

    // Check chord window (G+T etc.)
    if (this.chordState && Date.now() - this.chordState.timestamp < 500) {
      const chord = `${this.chordState.key}+${e.key.toLowerCase()}`;
      const action = this.findAction(chord);
      if (action) { this.dispatch(action); this.chordState = null; return; }
    }

    const key = this.buildKeyString(e);

    // Arm chord if key is a chord starter
    if (['g'].includes(key)) {
      this.chordState = { key, timestamp: Date.now() };
      return;
    }

    const action = this.findAction(key);
    if (action) { e.preventDefault(); this.dispatch(action); }
  };
}
```

### Command Palette (cmdk)

```typescript
// packages/web/src/components/CommandPalette.tsx

import { Command } from 'cmdk';

export function CommandPalette({ open, onClose }: Props) {
  return (
    <Command.Dialog open={open} onOpenChange={onClose}>
      <Command.Input placeholder="Search tasks and commands..." autoFocus />
      <Command.List>
        <Command.Group heading="Commands">
          <Command.Item onSelect={() => { openQuickCapture(); onClose(); }}>
            New task
          </Command.Item>
          {/* ... */}
        </Command.Group>
        <Command.Group heading="Tasks">
          {matchingTasks.map(task => (
            <Command.Item key={task.id} onSelect={() => navigateToTask(task.id)}>
              {task.title}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

---

## 6. Markdown Rendering (Story 6.2)

### Web

```typescript
// packages/web/src/lib/markdown.ts

import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import DOMPurify from 'dompurify';

// Register only the 6 required languages (tree-shaking)
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);

marked.setOptions({
  highlight: (code, lang) => hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : code,
  breaks: true,
  gfm: false,    // No GFM (no tables, no strikethrough, no task checkboxes)
});

// Image token: replace with placeholder
const renderer = new marked.Renderer();
renderer.image = (_href, _title, text) =>
  `<span class="image-placeholder">[image: ${text}]</span>`;
marked.use({ renderer });

export function renderMarkdown(raw: string): string {
  const html = marked.parse(raw) as string;
  // Double sanitisation: server-side (before storage) + render-time (here)
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','strong','em','h1','h2','h3','ul','ol','li','code','pre','a','blockquote','hr','span'],
    ALLOWED_ATTR: ['href', 'class'],
    ALLOW_DATA_ATTR: false,
  });
}
```

### Mobile (React Native)

```typescript
// packages/mobile/components/MarkdownView.tsx

import Markdown from 'react-native-markdown-display';

export function MarkdownView({ content }: { content: string }) {
  return (
    <Markdown
      rules={{
        // Override image rule: render as text placeholder
        image: (node) => (
          <Text key={node.key} style={styles.imagePlaceholder}>
            [image: {node.attributes.alt}]
          </Text>
        ),
      }}
    >
      {content}
    </Markdown>
  );
}
```

---

## 7. Focus Mode (Story 2.2)

Focus Mode is a full-screen overlay that renders on top of the current view. On web, it's a fixed-position React portal. On mobile, it's a modal screen via Expo Router.

**State persistence:** `activeFocusTaskId` stored in SQLite `user_preferences` JSON column, so Focus Mode survives app backgrounding.

```typescript
// Web: render as portal over everything
export function FocusMode() {
  const { focusModeTaskId, exitFocusMode } = useUIStore();

  return createPortal(
    <div className="fixed inset-0 z-50 bg-background">
      {/* Full-screen task display */}
    </div>,
    document.body
  );
}
```

---

## 8. Progressive Web App (PWA)

The web app is a PWA for offline capability in the browser:

```
packages/web/public/
├── manifest.json      # PWA manifest
└── sw.js              # Service Worker (generated by vite-plugin-pwa)
```

Service worker caches:
- App shell (HTML, CSS, JS) — cache-first
- Static assets — cache-first
- API calls — network-first with SQLite fallback (CRDT handles conflicts)

---

*Next: [08-ai-features.md](./08-ai-features.md) for Pick for Me, Goal Decomposition, and NLP date parsing.*
