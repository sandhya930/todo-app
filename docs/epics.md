# Epics — To-Do List Application

**Document Owner:** Sarah (Product Owner)
**Status:** Draft v1.0
**Date:** 2026-03-15
**Source PRD:** [docs/prd.md](./prd.md)

---

## Overview

| Epic | Title | Phase | Priority | Stories |
|---|---|---|---|---|
| EP-01 | Task Capture | MVP (Phase 1) | P0 | 5 |
| EP-02 | Task Organization | MVP (Phase 1) | P0 | 5 |
| EP-03 | Planning & Scheduling | MVP + Growth (Phase 1–2) | P0/P1 | 4 |
| EP-04 | Completion & Motivation | MVP + Growth (Phase 1–2) | P0/P1 | 4 |
| EP-05 | Collaboration & Sharing | Growth (Phase 2) | P1 | 2 |
| EP-06 | Power User & Integrations | Platform (Phase 3) | P1/P2 | 4 |

---

## EP-01 — Task Capture

### Epic Goal

Enable users to capture any task in under 3 seconds via text, voice, or email so that no commitment is ever lost due to friction.

### Epic Description

**Context:**
Task capture is the entry point of the entire system. If capture is slow, requires multiple steps, or feels unreliable, users abandon the app before it can deliver value. This is the single highest-leverage feature for Day-7 retention.

**What's being built:**
- Single-line text capture with natural language date parsing
- Voice input with automatic transcription and task parsing
- Email-to-task forwarding address
- REST API for programmatic task creation
- All capture routes feed into the Inbox view

**Success criteria:**
- Median task capture time ≤ 3 seconds from app open
- Natural language dates parsed correctly for 20+ expressions
- Voice transcription accuracy ≥ 95% in quiet environments
- Zero data loss: tasks persisted locally before remote write

**Integration points:**
- Feeds into: Task Organization (EP-02) via Inbox
- Requires: Core task model, offline-first local database, CRDT sync

---

### Stories

#### US-001 — Instant Text Capture
**As** Alex (overwhelmed professional),
**I want** to capture a task by typing a single line,
**so that** I don't lose momentum switching to a complex form.

**Acceptance Criteria:**
- [ ] App opens directly to a text input field (or floating action button on home)
- [ ] Pressing Enter / tapping "Add" saves the task immediately — no required fields beyond title
- [ ] Task appears in Inbox within 100ms of save
- [ ] Task is persisted locally before any network request
- [ ] Input field clears immediately after save, ready for next capture
- [ ] Max title length: 500 characters; truncation warning at 480

---

#### US-002 — Voice Task Capture
**As** Alex,
**I want** to dictate a task by voice,
**so that** I can capture ideas while commuting or hands-free.

**Acceptance Criteria:**
- [ ] Voice capture accessible via dedicated mic button on home screen
- [ ] On-device transcription (no audio sent to server without opt-in)
- [ ] Natural language date/time extracted from transcription (e.g., "remind me tomorrow" → due date set to next day)
- [ ] User sees transcription text before confirming save; can edit inline
- [ ] Available fully offline
- [ ] Graceful fallback if microphone permission denied: shows permission explanation, links to settings

---

#### US-003 — Email-to-Task Forwarding
**As** Alex,
**I want** to forward an email to create a task,
**so that** action items from email are captured in one tap without leaving my email client.

**Acceptance Criteria:**
- [ ] Each user account has a unique, static forwarding address (e.g., `username+todo@app.domain`)
- [ ] Email subject line becomes the task title
- [ ] Email body is stored as the task's notes field (plain text; HTML stripped to Markdown)
- [ ] Task lands in Inbox within 60 seconds of email receipt
- [ ] Sender address verified against user's registered email to prevent spam injection
- [ ] User notified in-app when email-created task arrives (if app is open)

---

#### US-004 — REST API Task Creation
**As** Dev (power user developer),
**I want** to create tasks via a documented REST API,
**so that** I can integrate the app with my existing tools and scripts.

**Acceptance Criteria:**
- [ ] `POST /api/v1/tasks` endpoint accepts: `title` (required), `due_date`, `project_id`, `notes`, `tags`, `energy_level`, `estimated_duration_minutes`
- [ ] Authentication via Bearer token (API key generated in account settings)
- [ ] Response includes full task object with generated `id` and `created_at`
- [ ] API returns standard HTTP status codes: 201 Created, 400 Bad Request, 401 Unauthorized
- [ ] API documented at `/api/docs` (OpenAPI 3.0 spec)
- [ ] Rate limit: 1,000 requests/hour per API key; `Retry-After` header on 429

---

#### US-005 — Natural Language Date Parsing
**As** any user,
**I want** to type dates like "next Friday" or "in 3 days" in the task title,
**so that** I never have to use a date picker for common scheduling.

**Acceptance Criteria:**
- [ ] Parser runs on task title on save; extracted date/time removed from title and set as `due_date`
- [ ] Supported expressions (minimum): "today", "tomorrow", "next [weekday]", "this [weekday]", "in N days/weeks", "on [date]", "end of month", "end of week", "[time]" (e.g., "at 3pm")
- [ ] Parsed date shown as a chip preview below the input field before save — user can dismiss to keep date-free
- [ ] Parsing is locale-aware (en-US and en-GB date formats supported at launch)
- [ ] If parsing is ambiguous (e.g., "Friday" — this Friday or next Friday?), app uses the soonest future instance

---

### Compatibility Requirements
- [ ] Offline capture: tasks created without connectivity are queued and synced when online
- [ ] All capture routes produce identical task objects (same schema regardless of input method)
- [ ] No network dependency for text or voice capture

### Risk Mitigation
- **Primary Risk:** Voice transcription accuracy degrades in noisy environments
- **Mitigation:** Show transcription for user review before save; "try again" button
- **Rollback Plan:** Voice capture can be feature-flagged off independently; text capture unaffected

### Definition of Done
- [ ] All 5 stories completed with acceptance criteria met
- [ ] Offline capture verified: create tasks in airplane mode; confirm sync on reconnect
- [ ] Performance: median capture time ≤ 3 seconds measured via session recording
- [ ] Voice tested on 3 device types (iOS, Android flagship, Android mid-range)
- [ ] API contract tested with Postman collection; OpenAPI spec published

---

---

## EP-02 — Task Organization

### Epic Goal

Give users clear, opinionated views that surface the right tasks at the right time — eliminating overwhelm by showing less, not more.

### Epic Description

**Context:**
The brainstorming session identified "showing ALL tasks at once" as the worst possible UX pattern. Organization is not about more views — it is about the right defaults. Users should never need to manually triage for daily use; the system's default views must already show a curated, actionable subset.

**What's being built:**
- Today / Upcoming / Inbox / Someday / Completed standard views
- Projects with color and icon
- Focus Mode (one task at a time)
- Energy level tags for state-matching
- Someday list as a guilt-free holding area

**Success criteria:**
- Today view shows ≤ 5 tasks by default and feels focused, not sparse
- Users with ≥ 10 tasks report feeling "in control" rather than "overwhelmed" (NPS proxy)
- Focus Mode activation rate ≥ 15% of daily active users within 30 days

**Integration points:**
- Depends on: EP-01 (Task Capture) for task data
- Feeds into: EP-03 (Planning & Scheduling) which populates Today view

---

### Stories

#### US-010 — Today View
**As** Alex,
**I want** a "Today" view showing only my prioritized tasks for today,
**so that** I open the app and know exactly what to focus on without scrolling a wall of tasks.

**Acceptance Criteria:**
- [ ] Today view is the default home screen after onboarding
- [ ] Shows up to 5 tasks by default; "Show more" expands to all today-assigned tasks
- [ ] Tasks shown: those with `due_date = today` + tasks manually added to today by user
- [ ] If Today is empty, shows a friendly empty state with a prompt to plan today (not a blank screen)
- [ ] Tasks reorderable by drag-and-drop within Today view
- [ ] "Add to today" action available on any task from any view

---

#### US-011 — Focus Mode
**As** Jordan (ADHD user),
**I want** to enter Focus Mode to see only one task at a time,
**so that** I can initiate work without being overwhelmed by the full list.

**Acceptance Criteria:**
- [ ] Focus Mode accessible via button on any task card and via keyboard shortcut (F key / ⌘⇧F)
- [ ] Full-screen view showing: task title, notes (if any), sub-tasks (if any), timer button, complete button
- [ ] All other tasks are hidden; no navigation chrome visible
- [ ] Escape key / swipe down exits Focus Mode and returns to previous view
- [ ] Completing the task in Focus Mode triggers completion animation, then surfaces next task option: "Next up: [task]" with Accept / Exit buttons
- [ ] Focus Mode state persists across app backgrounding (returning shows same task)

---

#### US-012 — Projects
**As** Sam (student),
**I want** to organize tasks into projects by subject or area,
**so that** I can view all coursework or work tasks in one dedicated space.

**Acceptance Criteria:**
- [ ] Create project: name (required, max 50 chars), color (12 preset options), icon (emoji picker)
- [ ] Assign task to project during capture or via edit
- [ ] Project view: shows all tasks in project grouped by status (active, upcoming, someday, completed)
- [ ] Projects sidebar/tab shows task count badge per project
- [ ] Archive project (hides from sidebar; tasks retained and searchable)
- [ ] Free tier: up to 3 active projects; Pro tier: unlimited
- [ ] Default project "Personal" pre-created on signup; cannot be deleted (only renamed)

---

#### US-013 — Energy Level Tags
**As** Alex,
**I want** to tag tasks with an energy level (High Focus / Low Focus / No-Brainer),
**so that** I can match tasks to my current cognitive state instead of forcing deep work when I'm tired.

**Acceptance Criteria:**
- [ ] Energy level is an optional field on every task: `high_focus` | `low_focus` | `no_brainer` | `unset`
- [ ] Visible as a colored icon on task cards (optional, can be hidden in settings)
- [ ] Filter by energy level in Today, Upcoming, and Project views
- [ ] "Pick for me" AI (EP-03) factors energy level into selection
- [ ] Default energy level can be set per project (e.g., Work project defaults to `high_focus`)

---

#### US-014 — Someday List
**As** Alex,
**I want** a "Someday" list that stores ideas without cluttering my Today view,
**so that** I can capture everything without committing to a date and without feeling pressured.

**Acceptance Criteria:**
- [ ] Someday list accessible from main navigation
- [ ] Tasks in Someday have no due date; excluded from Today, Upcoming, and overdue logic
- [ ] Quick-add to Someday: swipe action on any task; also available during capture via "Someday" button
- [ ] Weekly review wizard (EP-03) surfaces Someday items for promotion or archiving
- [ ] Someday list sortable by: date added, title, project, energy level
- [ ] Items auto-archived after 90 days without interaction (with 7-day warning notification)

---

### Compatibility Requirements
- [ ] Views work fully offline; no empty states caused by connectivity loss
- [ ] Projects persist their scroll position between navigations
- [ ] Focus Mode does not interfere with background sync

### Risk Mitigation
- **Primary Risk:** Today view feels empty for new users with few tasks → reduces perceived value
- **Mitigation:** Onboarding flow pre-populates 3 sample tasks; empty state has "Plan your day" CTA
- **Rollback Plan:** Each view is independently feature-flaggable

### Definition of Done
- [ ] All 5 stories completed with acceptance criteria met
- [ ] Focus Mode tested with VoiceOver (iOS) and TalkBack (Android)
- [ ] Today view renders correctly on smallest supported screen (iPhone SE, 375px wide)
- [ ] Projects tested with 0, 1, and 50+ tasks
- [ ] Someday auto-archive tested with mocked 90-day-old tasks

---

---

## EP-03 — Planning & Scheduling

### Epic Goal

Eliminate decision fatigue and remove guilt from missed deadlines through AI-assisted daily planning and forgiving rescheduling mechanics.

### Epic Description

**Context:**
The #1 insight from brainstorming: current apps punish non-completion. The "overdue" label is a guilt trigger that drives app abandonment. This epic replaces punishment with coaching. The AI "Pick for me" feature and deferral mechanic are the two highest-impact differentiators of the entire product.

**What's being built:**
- AI "Pick for me" task selection
- Deferral / forgiveness mechanic (no overdue state)
- Weekly review wizard
- Goal decomposition (AI-assisted breakdown)

**Success criteria:**
- "Pick for me" used by ≥ 30% of DAU within 60 days
- Zero tasks ever display an "overdue" label in the UI
- Weekly review completion rate ≥ 25% of weekly active users
- User NPS question "The app makes me feel in control" scores ≥ 7/10 avg

**Integration points:**
- Depends on: EP-01 (tasks in system), EP-02 (Today view to populate)
- Feeds into: EP-04 (Completion & Motivation via completed tasks)

---

### Stories

#### US-020 — AI "Pick for Me"
**As** Alex,
**I want** an AI button that recommends the single best task to work on right now,
**so that** I can skip decision fatigue and start immediately.

**Acceptance Criteria:**
- [ ] "Pick for me" button prominently displayed in Today view and accessible via keyboard shortcut (P)
- [ ] Algorithm considers (in order): P0-today deadline → energy level match → estimated duration vs. time available → historical completion patterns
- [ ] Surfaces one task only (not a list); shows a one-sentence reason ("This is due today and takes ~20 min")
- [ ] User can tap "Not this one" to get a second suggestion (max 3 skips)
- [ ] If no suitable tasks: friendly message "Your slate is clear — add something or check Someday"
- [ ] v1 (MVP): rule-based algorithm; v2 (Phase 2): ML model trained on user history

---

#### US-021 — Deferral / Forgiveness Mechanic
**As** Jordan,
**I want** tasks I didn't complete to quietly reschedule rather than showing as "overdue",
**so that** opening the app never triggers shame or avoidance.

**Acceptance Criteria:**
- [ ] The word "overdue" does not appear anywhere in the app UI
- [ ] At midnight, any task with `due_date = today` that is not completed changes status to `deferred`
- [ ] Deferred tasks appear at the top of tomorrow's Today view with a soft "Carried over" label (neutral tone, no red)
- [ ] Deferred tasks can be rescheduled, moved to Someday, or completed — but never penalize the streak
- [ ] If a task is deferred 3+ times, app gently asks: "Want to break this into smaller steps or move it to Someday?" (dismissible)
- [ ] Recurring tasks: missed occurrence is silently skipped; next occurrence created on schedule

---

#### US-022 — Weekly Review Wizard
**As** Alex,
**I want** a guided weekly review that helps me process my backlog,
**so that** my lists stay manageable and nothing important falls through the cracks.

**Acceptance Criteria:**
- [ ] Weekly review prompt appears every Sunday between 6pm–9pm (user-adjustable day/time)
- [ ] Wizard steps: (1) Clear Inbox → (2) Review deferred tasks → (3) Review Someday → (4) Plan next week's Today → (5) Celebrate wins (show completed count)
- [ ] Each step shows tasks one at a time with action buttons: Schedule / Move to Someday / Delete / Keep
- [ ] User can exit and resume wizard at any step
- [ ] Completing the full review unlocks a "Weekly Review" badge (see EP-04 streaks)
- [ ] Review stats shown at end: X tasks planned, Y archived, Z promoted from Someday

---

#### US-023 — Goal Decomposition (AI)
**As** Alex,
**I want** to enter a goal and have the app break it into actionable tasks,
**so that** big ambitions become concrete steps I can actually do.

**Acceptance Criteria:**
- [ ] "Start from a goal" option available in new project creation and in Inbox capture
- [ ] User enters a plain-language goal (e.g., "Launch my personal website")
- [ ] AI generates 3–7 milestone tasks with suggested due dates and energy levels
- [ ] User sees a review screen to: approve all, edit individual tasks, delete unwanted tasks, reorder
- [ ] Only confirmed tasks are added to the system; AI suggestions are never auto-saved
- [ ] Privacy notice shown: "Goal text is sent to our AI service. [Privacy Policy link]" with opt-out option that disables the feature

---

### Compatibility Requirements
- [ ] Deferral runs as a background job at midnight in the user's local timezone
- [ ] "Pick for me" degrades gracefully with no tasks: does not error, shows empty state
- [ ] Weekly review wizard state (current step) persists if app is closed mid-review

### Risk Mitigation
- **Primary Risk:** AI goal decomposition generates irrelevant or poor-quality tasks → user loses trust in AI features
- **Mitigation:** User always reviews before saving; explicit "This isn't helpful" feedback button feeds improvement
- **Rollback Plan:** Goal decomposition is an additive feature; disabling it does not affect existing tasks

### Definition of Done
- [ ] All 4 stories completed with acceptance criteria met
- [ ] Deferral midnight job tested across timezone changes (e.g., DST transition)
- [ ] "Pick for me" algorithm tested with: 0 tasks, 1 task, 20+ tasks, all tasks in Someday
- [ ] Weekly review wizard completes end-to-end on both mobile and web
- [ ] Goal decomposition tested with 10 diverse goal prompts; output quality reviewed by PO

---

---

## EP-04 — Completion & Motivation

### Epic Goal

Make finishing tasks feel genuinely rewarding through delight mechanics, habit-forming streaks, and visible progress — turning daily task completion into an identity-reinforcing ritual.

### Epic Description

**Context:**
Completion is the moment of peak emotional value. Current apps waste it with a plain checkbox. This epic transforms completion into a dopamine moment. The streak system creates a habit loop. The weekly digest creates shareable social proof of progress.

**What's being built:**
- Satisfying completion animations (configurable)
- Streak counter with recovery mechanic
- Sub-tasks / micro-completions for complex tasks
- Weekly accomplishment digest email

**Success criteria:**
- ≥ 70% of completions include an animation play-through (not skipped)
- ≥ 50% of users have an active streak ≥ 7 days at Day-30
- Weekly digest open rate ≥ 35% (email industry avg: ~21%)
- Sub-task usage ≥ 20% of Pro users within 60 days

**Integration points:**
- Depends on: EP-01 (tasks), EP-02 (views), EP-03 (Today view drives completion volume)
- Feeds into: EP-05 (accountability partner completion notifications)

---

### Stories

#### US-030 — Completion Animations
**As** Jordan,
**I want** a satisfying animation when I complete a task,
**so that** finishing feels rewarding and I'm motivated to do it again.

**Acceptance Criteria:**
- [ ] Completing a task triggers a particle/confetti animation on the task card (≤ 800ms duration)
- [ ] Audio feedback: subtle chime plays by default; respects device silent/mute switch
- [ ] Animation is configurable: On / Subtle / Off (in Settings → Notifications & Sounds)
- [ ] Completing the last task in Today view triggers an enhanced "All done!" full-screen moment
- [ ] Animations are GPU-accelerated; no frame drops below 60fps on supported devices
- [ ] Reduced Motion accessibility setting disables particle animations; uses fade only

---

#### US-031 — Streak Counter
**As** Jordan,
**I want** a streak counter that tracks my consecutive days of completing tasks,
**so that** I'm motivated to maintain the habit even on difficult days.

**Acceptance Criteria:**
- [ ] Streak counter visible on home screen (Today view header); shows flame icon + count
- [ ] Streak increments when ≥ 1 task is completed in a calendar day (user's local timezone)
- [ ] Streak resets to 0 if 0 tasks completed by midnight
- [ ] **Grace day mechanic:** once per calendar month, user can tap "Use grace day" to preserve a streak on a zero-completion day; grace day balance shown in streak detail view
- [ ] Milestone streak notifications at: 3, 7, 14, 30, 60, 100 days (in-app + optional push)
- [ ] Streak history visible in profile: calendar heatmap of daily completion counts (GitHub-style)

---

#### US-032 — Weekly Accomplishment Digest
**As** Alex,
**I want** a weekly email showing what I accomplished this week,
**so that** I have a record of progress and something to share or reference in performance reviews.

**Acceptance Criteria:**
- [ ] Digest email sent every Sunday evening (default 7pm user's local time; adjustable)
- [ ] Opt-in only: prompted during onboarding; configurable in Settings → Notifications
- [ ] Email contains: total tasks completed, top projects by completion, current streak, personal record comparison, "star task" highlight (user's choice or longest-standing completed task)
- [ ] One-tap unsubscribe link in email footer (CAN-SPAM / GDPR compliant)
- [ ] In-app version of digest available in Profile → Weekly Reports (last 12 weeks)
- [ ] Shareable card: tapping "Share" generates a PNG/image of the week's stats for social sharing

---

#### US-033 — Sub-Tasks / Micro-Completions
**As** Jordan,
**I want** to break a task into small sub-steps I can check off one by one,
**so that** I can start and make progress even when I can't complete the whole thing at once.

**Acceptance Criteria:**
- [ ] Any task can have up to 20 sub-tasks (ordered list)
- [ ] Sub-tasks added inline within the task detail view; each has a title (max 200 chars) and a checkbox
- [ ] Sub-task completion shows a mini celebration (smaller than full task animation)
- [ ] Parent task progress bar shows X/Y sub-tasks complete
- [ ] Parent task auto-completes when all sub-tasks are checked (with confirmation prompt: "All steps done! Mark task complete?")
- [ ] In Focus Mode: sub-tasks shown as a checklist; completing all triggers full-task completion flow
- [ ] Sub-tasks are included in search results

---

### Compatibility Requirements
- [ ] Animations respect iOS/Android Reduce Motion accessibility settings
- [ ] Streak calculation is timezone-safe (no UTC midnight miscounts)
- [ ] Digest email renders correctly in Gmail, Apple Mail, Outlook (tested via Litmus or equivalent)

### Risk Mitigation
- **Primary Risk:** Streak resets cause frustration and abandonment (the "I broke my streak so why bother" effect)
- **Mitigation:** Grace day mechanic; post-reset messaging is supportive ("Day 1 again — you've done it before"); streak recovery shown vs. deleted
- **Rollback Plan:** Streak system is display-only; disabling it does not affect task data

### Definition of Done
- [ ] All 4 stories completed with acceptance criteria met
- [ ] Animations tested on low-end Android device (confirm no performance regression)
- [ ] Streak calculation verified across DST boundary and timezone change scenarios
- [ ] Digest email tested in 5 email clients; unsubscribe verified to work within 10 seconds
- [ ] Sub-tasks tested with: 0, 1, 20 (max), and task with sub-tasks in Focus Mode

---

---

## EP-05 — Collaboration & Sharing

### Epic Goal

Extend the app's reach beyond individual use by enabling shared task lists and accountability-partner connections that leverage social commitment to drive follow-through.

### Epic Description

**Context:**
Brainstorming identified that social accountability outperforms all notification strategies for task completion. This epic does not aim to build a full team project manager — it adds lightweight social mechanics that amplify individual motivation. The accountability partner feature is the highest-ROI collaboration feature for the primary persona.

**What's being built:**
- Accountability partner: share a task with a named person who sees completion/deferral
- Shared lists: household/family task sharing with assignment

**Success criteria:**
- ≥ 10% of Pro users activate at least one accountability partner within 30 days
- Shared list members complete their assigned tasks at a ≥ 20% higher rate than solo users
- Collaboration features do not degrade performance for solo users (no increased load times)

**Integration points:**
- Depends on: EP-01, EP-02, EP-04 (completion events to broadcast)
- Feeds into: EP-06 (team/workspace tier in Phase 3)

---

### Stories

#### US-040 — Accountability Partner
**As** Alex,
**I want** to link a task to an accountability partner who gets notified when I complete or defer it,
**so that** the social commitment helps me follow through on things I'd otherwise procrastinate.

**Acceptance Criteria:**
- [ ] "Add accountability partner" action on any task (tap partner icon on task detail)
- [ ] Partner invited by email; receives email with opt-in link (they do not need an account to receive notifications, but do to see task details)
- [ ] Partner sees a read-only view of the linked task: title, due date, status (not notes)
- [ ] Partner notified via email when task is: completed (celebratory tone) or deferred 2+ times (supportive, not shaming tone)
- [ ] Task owner can remove accountability partner at any time
- [ ] Max 1 accountability partner per task; max 5 active accountability-linked tasks per free user (unlimited Pro)

---

#### US-041 — Shared Lists
**As** a family manager (household user),
**I want** to share a task list with family members and assign tasks to individuals,
**so that** household responsibilities are transparent and everyone knows what they own.

**Acceptance Criteria:**
- [ ] Any list/project can be shared via invite link or email (up to 10 members on free; unlimited on Pro)
- [ ] List owner can assign any task to a member; assignee receives push + email notification
- [ ] All members see the full list and task status in real time (≤ 3 second propagation)
- [ ] Only the task assignee or list owner can mark a task complete
- [ ] List owner can set member permissions: View Only / Can Edit / Can Assign
- [ ] Leaving a shared list removes all its tasks from the user's views; tasks remain for other members
- [ ] Shared lists visually distinguished from personal lists (shared icon indicator)

---

### Compatibility Requirements
- [ ] Collaboration features isolated behind feature flag; disabling does not affect solo task data
- [ ] Shared list sync uses same CRDT layer as personal sync (no separate sync path)
- [ ] Accountability partner email notifications comply with CAN-SPAM and GDPR opt-in requirements

### Risk Mitigation
- **Primary Risk:** Accountability partner notifications feel shaming rather than supportive, causing relationship friction
- **Mitigation:** Notification copy reviewed by UX writer; deferral notifications framed as supportive ("Alex rescheduled — they're still on it!"); no automatic "failed" messaging
- **Rollback Plan:** Accountability partner and shared lists are additive; each independently feature-flaggable

### Definition of Done
- [ ] Both stories completed with acceptance criteria met
- [ ] Accountability partner flow tested end-to-end: invite → accept → complete → notification received
- [ ] Shared list tested with 2, 5, and 10 members simultaneously making changes (conflict resolution verified)
- [ ] All outbound emails verified for CAN-SPAM compliance (unsubscribe, sender info)
- [ ] Partner notification tone reviewed and approved by PO before release

---

---

## EP-06 — Power User & Integrations

### Epic Goal

Extend the app's capabilities for technical and advanced users through keyboard-first navigation, Markdown support, a CLI, and webhooks — making it the task management layer for any workflow.

### Epic Description

**Context:**
Power users (developers, ops teams) have high lifetime value and are influential advocates. They will not adopt a tool that feels like a toy. This epic makes the app scriptable, automatable, and keyboard-native. It also unlocks the platform play: by exposing webhooks and an API, the app becomes connectable to the entire automation ecosystem (Zapier, Make, custom scripts).

**What's being built:**
- Full keyboard navigation + command palette
- Markdown support in task notes/descriptions
- CLI companion (`todo` command)
- Webhooks on task events

**Success criteria:**
- ≥ 60% of desktop web users use keyboard shortcuts at least once per session (Day-30)
- CLI downloads ≥ 500 in first month post-release
- Webhook creation rate ≥ 15% of Pro users
- Zero regressions in mobile UX from desktop keyboard/Markdown additions

**Integration points:**
- Depends on: EP-01 (REST API foundation), EP-02 (views to navigate)
- Unlocks: Phase 3 enterprise/team tier, Zapier/Make connectors

---

### Stories

#### US-050 — Keyboard Navigation & Command Palette
**As** Dev,
**I want** full keyboard navigation and a command palette,
**so that** I never need to use the mouse to manage my tasks.

**Acceptance Criteria:**
- [ ] Command palette opens with ⌘K (Mac) / Ctrl+K (Windows/Linux) from any view
- [ ] Command palette supports: create task, navigate to view, search tasks, run actions on selected task
- [ ] Global keyboard shortcuts (all configurable in Settings):

| Shortcut | Action |
|---|---|
| N | New task |
| F | Focus Mode on selected task |
| E | Edit selected task |
| D | Set due date on selected task |
| P | "Pick for me" |
| ⌘/ or Ctrl+/ | Show keyboard shortcut cheat sheet |
| J / K | Navigate task list up/down |
| Space | Complete selected task |
| Backspace | Delete selected task (with confirm) |

- [ ] All keyboard shortcuts documented in-app and in `/docs/keyboard-shortcuts`
- [ ] Tab order follows logical reading order in all views (WCAG 2.1 AA)

---

#### US-051 — Markdown in Task Notes
**As** Dev,
**I want** Markdown formatting in task notes/descriptions,
**so that** I can add structured information, code snippets, and links to tasks.

**Acceptance Criteria:**
- [ ] Markdown rendered in task detail view (view mode); raw Markdown in edit mode
- [ ] Supported subset (CommonMark): `**bold**`, `_italic_`, `# headings` (H1–H3), `- lists`, `1. ordered lists`, `` `inline code` ``, ` ```code blocks``` `, `[links](url)`, `> blockquote`, `---` horizontal rule
- [ ] Code blocks: syntax highlighting for: JavaScript, TypeScript, Python, Bash, SQL, JSON (via highlight.js or equivalent)
- [ ] Images: not supported in notes (security/storage scope); `![alt](url)` renders as a plain link
- [ ] Edit/preview toggle (not live split-pane — keep UI simple)
- [ ] Markdown in notes is fully searchable (plain text indexed)

---

#### US-052 — CLI Companion
**As** Dev,
**I want** a CLI that mirrors the web app's core actions,
**so that** I can manage tasks from the terminal without context-switching.

**Acceptance Criteria:**
- [ ] Installable via: `npm install -g @todo-app/cli` and `brew install todo-app`
- [ ] Authentication: `todo auth login` — opens browser for OAuth; stores token in `~/.todorc`
- [ ] Core commands:

| Command | Description |
|---|---|
| `todo add "Task title"` | Create task in Inbox |
| `todo add "Task title" --due tomorrow --project Work` | Create task with options |
| `todo list` | List today's tasks |
| `todo list --all` | List all active tasks |
| `todo done <id>` | Complete a task |
| `todo defer <id>` | Defer a task to tomorrow |
| `todo focus` | Start Focus Mode in terminal (fullscreen task display) |
| `todo projects` | List all projects |

- [ ] Output formats: human-readable (default), `--json`, `--csv`
- [ ] Works fully offline; syncs on next command when connectivity restored
- [ ] `todo --help` and `todo <command> --help` documented
- [ ] Tab completion for zsh and bash

---

#### US-053 — Webhooks
**As** Dev,
**I want** to configure webhooks that fire on task events,
**so that** I can trigger external automations (Slack messages, GitHub issues, custom scripts) when tasks change state.

**Acceptance Criteria:**
- [ ] Webhook management in Settings → Integrations → Webhooks
- [ ] Supported events: `task.created`, `task.completed`, `task.deferred`, `task.deleted`, `task.updated`
- [ ] Webhook config: URL (required), secret (for HMAC signature), event filter (one or more events), active/inactive toggle
- [ ] Payload: JSON with event type, task object (full schema), timestamp, user_id
- [ ] HMAC-SHA256 signature in `X-Todo-Signature` header for payload verification
- [ ] Delivery: at-least-once; retry up to 3 times with exponential backoff on non-2xx responses
- [ ] Delivery log (last 50 deliveries per webhook): timestamp, event, status code, response time
- [ ] Max 10 webhooks per Pro account

---

### Compatibility Requirements
- [ ] Keyboard navigation must not interfere with browser/OS shortcuts (test in Chrome, Firefox, Safari)
- [ ] Markdown rendering must be XSS-safe (sanitize all HTML; no raw HTML allowed in Markdown input)
- [ ] CLI versioning: CLI v1.x must remain compatible with API v1; breaking changes require CLI v2
- [ ] Webhooks do not expose task `notes` content by default (opt-in in webhook config for privacy)

### Risk Mitigation
- **Primary Risk:** Markdown XSS vulnerability if user-generated content not properly sanitized
- **Mitigation:** Server-side sanitization via DOMPurify or equivalent before storage; re-sanitize on render; CSP headers enforced
- **Rollback Plan:** Markdown rendering can be toggled to plain-text display without data loss; CLI and webhooks are independent services

### Definition of Done
- [ ] All 4 stories completed with acceptance criteria met
- [ ] Keyboard shortcuts tested in Chrome, Firefox, Safari on macOS and Windows
- [ ] Markdown XSS tested with OWASP XSS cheat sheet payloads — all sanitized
- [ ] CLI tested on macOS (zsh), Ubuntu (bash), and Windows (PowerShell/WSL)
- [ ] Webhook delivery tested with: successful delivery, 500 error with retry, timeout with retry, and delivery log display
- [ ] Security review completed for webhook HMAC implementation

---

---

## Story Manager Handoff

**To:** SM Agent (Story Manager)

Please develop detailed user stories for each of these epics. Key context:

- This is a **greenfield application** — no existing codebase to preserve
- Target tech stack decision is pending (open question OQ-3, OQ-4 in PRD); assume modern mobile-first stack (React Native or native iOS/Android + React web)
- CRDT sync is a foundational architectural requirement — factor into any story touching task state
- **Offline-first** is non-negotiable: every story that creates/modifies task state must include an offline acceptance criterion
- Privacy is a first-class concern: any story touching AI features must include data transparency acceptance criteria
- Personas to keep in mind: Alex (professional), Jordan (ADHD), Sam (student), Dev (power user)
- Phase 1 (MVP) epics are EP-01, EP-02, EP-03, EP-04 — prioritize P0 stories from these first
- EP-05 and EP-06 are Phase 2/3 — do not begin story elaboration until Phase 1 epics are signed off

Each story must include:
1. Standard user story format (As / I want / So that)
2. Acceptance criteria (testable, unambiguous)
3. Notes on offline behavior
4. Notes on accessibility requirements
5. Definition of done specific to the story

---

*Authored by Sarah — Product Owner (BMAD) | Referenced: [docs/prd.md](./prd.md) | Brainstorming: [docs/brainstorm.md](./brainstorm.md)*
