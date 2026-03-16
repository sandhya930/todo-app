# Product Requirements Document — To-Do List Application

**Document Owner:** Sarah (Product Owner)
**Status:** Draft v1.0
**Date:** 2026-03-15
**Source:** Derived from [Brainstorming Session](./brainstorm.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [Target Users & Personas](#4-target-users--personas)
5. [User Stories](#5-user-stories)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Technical Considerations](#8-technical-considerations)
9. [Competitive Landscape](#9-competitive-landscape)
10. [Release Roadmap](#10-release-roadmap)
11. [Out of Scope](#11-out-of-scope)
12. [Open Questions](#12-open-questions)

---

## 1. Executive Summary

This document defines the requirements for a modern, intelligent To-Do List application. The product's core thesis — derived from first-principles analysis — is that **the real problem being solved is not list-making; it is reducing the gap between intention and action**.

Existing apps over-optimize for task capture and under-optimize for task completion. They act as judges (overdue, missed, failed) rather than coaches. Our application will differentiate on three axes:

1. **Frictionless capture** — the fastest path from thought to stored commitment
2. **Intelligent daily planning** — AI that surfaces the right task at the right moment
3. **Forgiveness mechanics** — a system that celebrates progress and removes guilt

The primary target market is the **overwhelmed knowledge worker** (25–45), with a high-value secondary market in **neurodivergent users (ADHD)** who are chronically underserved by existing productivity tools.

---

## 2. Problem Statement

### 2.1 Core Problem

Users accumulate task lists but fail to act on them. The growing list becomes a source of anxiety rather than empowerment, triggering a shame-avoidance loop that causes app abandonment.

**Key evidence:**
- Average user retention in productivity apps drops **60% within the first month**
- Most users use fewer than **20% of available features** — indicating over-complexity
- Notification fatigue causes users to silence apps, severing the primary re-engagement mechanism

### 2.2 Root Causes

| Cause | Symptom | Impact |
|---|---|---|
| Too many tasks visible at once | Overwhelm, paralysis | User abandons daily review |
| Overdue tasks trigger guilt | Avoidance behavior | App opened less frequently |
| No guidance on *what to do next* | Decision fatigue | Tasks created but never actioned |
| Rigid scheduling model | Tasks miss deadlines, feel like failures | Loss of trust in the system |
| Capture friction (multi-step input) | Ideas lost before recorded | System feels incomplete |

### 2.3 Opportunity

A product that **closes the capture-to-completion loop** with AI assistance, forgiveness mechanics, and focus tooling can capture significant market share from an underserved emotional need that no current app fully addresses.

---

## 3. Goals & Success Metrics

### 3.1 Product Goals

| # | Goal |
|---|---|
| G1 | Reduce task creation friction to under 3 seconds from thought to saved |
| G2 | Increase weekly task completion rate vs. competitors |
| G3 | Achieve 40%+ Day-30 user retention (industry avg: ~40%) |
| G4 | Establish clear emotional brand differentiation: coach, not judge |
| G5 | Deliver a viable freemium business model with clear premium conversion |

### 3.2 Key Performance Indicators (KPIs)

| Metric | Target (6-month post-launch) | Measurement |
|---|---|---|
| Day-7 retention | ≥ 60% | Cohort analysis |
| Day-30 retention | ≥ 40% | Cohort analysis |
| Tasks completed / user / week | ≥ 7 | In-app analytics |
| Task capture time | ≤ 3 seconds (median) | Session recording |
| Daily active users / monthly active users | ≥ 35% | Analytics |
| Freemium → paid conversion | ≥ 5% | Revenue analytics |
| App Store rating | ≥ 4.5 stars | Store reviews |

### 3.3 Anti-Goals

- We are **not** optimizing for number of features shipped
- We are **not** optimizing for tasks *created* — only tasks *completed*
- We are **not** building an all-in-one project management tool (that is scope creep)

---

## 4. Target Users & Personas

### 4.1 Primary Persona — Alex, The Overwhelmed Professional

| Attribute | Detail |
|---|---|
| **Age** | 32 |
| **Role** | Senior marketing manager at a mid-size tech company |
| **Tools** | Currently uses Notion + a paper notebook; syncing is a pain |
| **Pain points** | Too many meetings generating undocumented action items; no system for what to do "right now"; guilt over unfinished tasks |
| **Goals** | Capture everything, never drop the ball, feel in control |
| **Motivators** | Career advancement, reputation for reliability |
| **Key features needed** | Meeting-to-task conversion, smart "right now" suggestions, time-aware filtering |

### 4.2 Secondary Persona — Jordan, The ADHD User

| Attribute | Detail |
|---|---|
| **Age** | 27 |
| **Role** | UX designer, freelance |
| **Tools** | Has tried 10+ productivity apps; abandons each within weeks |
| **Pain points** | Overwhelmed by long lists; executive dysfunction blocks task initiation; notifications feel punitive |
| **Goals** | Start tasks without overthinking; build consistent habits; feel accomplished |
| **Motivators** | Dopamine hits from completion; reduced shame; visible streaks |
| **Key features needed** | One task at a time mode, micro-completions, gentle nudges, body doubling |

### 4.3 Tertiary Persona — Sam, The Student

| Attribute | Detail |
|---|---|
| **Age** | 20 |
| **Role** | University undergraduate, part-time job |
| **Tools** | Uses phone calendar and sticky notes |
| **Pain points** | Deadlines spread across multiple courses; no way to see everything at once; no focus support during study sessions |
| **Goals** | Never miss a deadline, pass exams, balance work and study |
| **Motivators** | Grades, stress reduction, peer comparison |
| **Key features needed** | Deadline countdown, Pomodoro timer, project/subject organization |

### 4.4 Power User Persona — Dev, The Developer

| Attribute | Detail |
|---|---|
| **Age** | 35 |
| **Role** | Senior software engineer |
| **Tools** | Linear at work, OmniFocus personally, custom scripts |
| **Pain points** | Cannot automate current tool; no CLI; Markdown not supported everywhere |
| **Goals** | Integrate task management into existing development workflow |
| **Motivators** | Efficiency, control, scriptability |
| **Key features needed** | REST API, webhooks, CLI, Vim keybindings, Markdown |

---

## 5. User Stories

### Epic 1 — Task Capture

| ID | User Story | Priority | Acceptance Criteria |
|---|---|---|---|
| US-001 | As Alex, I want to capture a task by typing a single line so that I don't lose momentum | P0 | Task saved in ≤ 1 tap/keystroke after app is open; natural language parsing applied |
| US-002 | As Alex, I want to dictate a task by voice so that I can capture it while commuting | P0 | Voice input transcribed and parsed into task with title, optional date; available offline |
| US-003 | As Alex, I want to forward an email to create a task so that action items from email are never lost | P1 | Unique forwarding email address; subject becomes task title; email body stored as note |
| US-004 | As Dev, I want to create tasks via REST API so that I can integrate with my tools | P2 | Full CRUD API; authentication via API key; documented at /api/docs |
| US-005 | As Alex, I want natural language date parsing ("next Friday", "in 3 days") so that I don't have to use a date picker | P0 | Dates parsed correctly for 20+ natural language expressions in English |

### Epic 2 — Task Organization

| ID | User Story | Priority | Acceptance Criteria |
|---|---|---|---|
| US-010 | As Alex, I want to see a "Today" view with only my prioritized tasks so that I'm not overwhelmed | P0 | Today view shows ≤ 5 tasks by default; user can add more; clearly separated from backlog |
| US-011 | As Jordan, I want to enter "Focus Mode" to see only one task at a time so that I can initiate without being overwhelmed | P0 | Focus mode hides all tasks except current; full-screen; escape returns to list |
| US-012 | As Sam, I want to organize tasks by project/subject so that I can view all coursework in one place | P0 | Projects support name, color, icon; tasks assigned to one project; project view shows all tasks |
| US-013 | As Alex, I want to tag tasks with energy level (High Focus / Low Focus / No-Brainer) so that I can match tasks to my current state | P1 | Energy tags available on task creation/edit; filterable in all views |
| US-014 | As Alex, I want a "Someday" list that doesn't clutter my Today view so that low-priority ideas are preserved without noise | P1 | Someday list accessible but excluded from Today/Upcoming; items surfaced via weekly review |

### Epic 3 — Planning & Scheduling

| ID | User Story | Priority | Acceptance Criteria |
|---|---|---|---|
| US-020 | As Alex, I want an AI "Pick for me" button that suggests the best task to work on right now so that I avoid decision fatigue | P0 | AI considers: due date, energy tag, estimated duration, time available, user history; explains its reasoning |
| US-021 | As Alex, I want overdue tasks to auto-defer rather than show as "overdue" so that I don't feel guilty opening the app | P0 | No "overdue" label exists; missed tasks move to deferred state and appear in next-day planning |
| US-022 | As Sam, I want a weekly review wizard that helps me triage my backlog so that nothing falls through the cracks | P1 | Weekly review prompt on Sunday evening; wizard walks through inbox, someday, upcoming |
| US-023 | As Alex, I want to start from a goal and have the app break it down into tasks so that big objectives become actionable | P1 | Goal entry → AI generates milestone tasks; user approves/edits; tasks auto-added to backlog |

### Epic 4 — Completion & Motivation

| ID | User Story | Priority | Acceptance Criteria |
|---|---|---|---|
| US-030 | As Jordan, I want satisfying completion animations so that finishing tasks feels rewarding | P0 | Minimum: confetti animation on completion; sound optional (respect system mute); configurable |
| US-031 | As Jordan, I want a streak counter that tracks my daily completion habit so that I feel motivated to maintain it | P0 | Daily streak shown on home screen; streak broken if 0 tasks completed in a calendar day; streak recovery mechanic available (grace day) |
| US-032 | As Alex, I want a weekly accomplishment digest email so that I can see what I achieved and share it | P1 | Email sent every Sunday; shows tasks completed, streaks, top project; opt-in; shareable image generated |
| US-033 | As Jordan, I want tasks to be breakable into micro-steps so that I can start without full executive function available | P1 | Any task can have up to 20 sub-steps; sub-steps show completion progress; parent marks done when all sub-steps done |

### Epic 5 — Collaboration & Sharing

| ID | User Story | Priority | Acceptance Criteria |
|---|---|---|---|
| US-040 | As Alex, I want to assign a task to an accountability partner who gets notified on completion so that social pressure helps me follow through | P1 | Share any task with any user (email invite); shared user sees task in read-only view; notified on completion/deferral |
| US-041 | As a family manager, I want to share a list with household members and assign tasks so that chores are managed transparently | P1 | Lists shareable with up to 10 members (free tier); task assignment; assignee gets push notification |

### Epic 6 — Power User & Integrations

| ID | User Story | Priority | Acceptance Criteria |
|---|---|---|---|
| US-050 | As Dev, I want full keyboard navigation and a command palette so that I never need the mouse | P1 | All CRUD actions keyboard-accessible; ⌘K / Ctrl+K opens command palette |
| US-051 | As Dev, I want Markdown support in task descriptions so that I can format notes and embed code snippets | P1 | CommonMark subset: bold, italic, headers, lists, code blocks, links; rendered in view mode |
| US-052 | As Dev, I want a CLI that mirrors the web app so that I can manage tasks from the terminal | P2 | `todo` CLI: `add`, `done`, `list`, `today`, `focus`; config via ~/.todorc; auth via API key |
| US-053 | As Dev, I want webhooks on task events so that I can trigger automations | P2 | Configurable webhooks for: task.created, task.completed, task.deferred; payload documented |

---

## 6. Functional Requirements

### 6.1 Core Task Model

A task MUST have:
- `id` — unique identifier (UUID)
- `title` — string, required, max 500 characters
- `status` — enum: `inbox | active | deferred | completed | archived`
- `created_at` — timestamp

A task MAY have:
- `due_date` — date/datetime
- `project_id` — foreign key to Project
- `energy_level` — enum: `high_focus | low_focus | no_brainer`
- `notes` — Markdown text, max 10,000 characters
- `sub_tasks` — ordered list of sub-task objects (max 20)
- `tags` — string array (max 10)
- `recurrence_rule` — iCalendar RRULE string
- `estimated_duration_minutes` — integer
- `assignee_id` — user foreign key (shared tasks)
- `accountability_partner_id` — user foreign key

### 6.2 Views & Navigation

| View | Description | Default |
|---|---|---|
| **Today** | Up to 5 AI-prioritized tasks for today | Home screen |
| **Upcoming** | Tasks due in the next 7 days | Secondary tab |
| **Inbox** | Unprocessed captured tasks | Badge on nav |
| **Projects** | All tasks grouped by project | Nav menu |
| **Someday** | Deferred low-priority items | Nav menu |
| **Completed** | Historical archive | Nav menu |
| **Focus Mode** | Single-task full-screen view | Activated per task |
| **Search** | Full-text across all tasks | ⌘K / search icon |

### 6.3 AI Features

| Feature | Description | MVP? |
|---|---|---|
| Natural language date parsing | Parse "next Monday", "in 2 hours", "end of month" | Yes |
| "Pick for me" | Select optimal task based on time, energy, deadline, history | Yes |
| Goal decomposition | Break a goal statement into milestone tasks | Phase 2 |
| Smart deferral suggestions | Suggest reschedule time when deferring a task | Phase 2 |
| Time estimation | Learn user's actual task durations; suggest estimates | Phase 2 |

### 6.4 Notification Strategy

To prevent notification fatigue:
- Default: **1 notification per day** — morning check-in ("Here's your focus plan for today")
- Optional: due-date reminders (user sets per task)
- Optional: accountability partner notifications (opt-in)
- **NO** overdue alerts — deferral is automatic and silent
- Notifications must respect device Do Not Disturb settings

### 6.5 Recurrence

- iCalendar RRULE standard for recurrence patterns
- Smart detection: after 3 manual same-time completions, app suggests converting to recurring task
- Missed recurring tasks defer to next occurrence without creating a guilt backlog

### 6.6 Search

- Full-text search across title, notes, tags
- Filter by: project, status, energy level, due date range, tag
- Natural language search: "tasks due this week in the Work project"
- Search results show within 200ms

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Requirement | Target |
|---|---|
| App launch to interactive (cold start, mobile) | ≤ 2 seconds |
| Task save latency (local write) | ≤ 100ms |
| Search results | ≤ 200ms |
| Sync propagation to second device | ≤ 3 seconds |
| API response time (p95) | ≤ 300ms |

### 7.2 Reliability & Availability

- **Offline-first**: full read/write functionality with no internet connection
- **Sync**: Conflict-free Replicated Data Types (CRDTs) for multi-device sync — last-write-wins is not acceptable
- **Uptime**: 99.9% monthly SLA for sync and API services
- **Data durability**: zero data loss guarantee; tasks persisted locally before remote write

### 7.3 Security & Privacy

- End-to-end encryption for task content (at-rest and in-transit)
- Task content is **never** used to train AI models without explicit user opt-in
- GDPR and CCPA compliant: right to export, right to delete
- OAuth 2.0 / OIDC for authentication; support Google, Apple, email+password
- API keys scoped to read-only or read-write; revocable at any time

### 7.4 Accessibility

- WCAG 2.1 AA compliance minimum
- Full VoiceOver (iOS) and TalkBack (Android) support
- Minimum contrast ratio: 4.5:1 for all text
- All interactions keyboard-accessible on desktop

### 7.5 Platform Support

| Platform | Priority | Notes |
|---|---|---|
| iOS (iPhone + iPad) | P0 | Native Swift app |
| Android | P0 | Native Kotlin app |
| Web (modern browsers) | P0 | Progressive Web App (PWA); offline capable |
| macOS | P1 | Catalyst or native; Menu Bar integration |
| CLI (`todo`) | P2 | Node.js; npm installable |

---

## 8. Technical Considerations

### 8.1 Architecture Principles

- **Offline-first**: local database (SQLite / Realm) is the source of truth; server syncs asynchronously
- **CRDT sync**: use a proven CRDT library (e.g., Yjs, Automerge) for conflict-free multi-device sync
- **API-first**: all features accessible via documented REST API; mobile/web are API consumers
- **Event-driven**: task state changes emit events for webhooks, analytics, and AI model inputs

### 8.2 AI/ML Stack

- Natural language date parsing: local model (on-device) for privacy and speed
- "Pick for me" AI: cloud model with user's anonymized history; opt-in
- Goal decomposition: LLM-based with prompt templates; privacy-preserving (task content not stored server-side by default)

### 8.3 Data Model Highlights

```
User
  └─ Projects []
       └─ Tasks []
            ├─ SubTasks []
            ├─ Tags []
            └─ Attachments []

SharedList
  ├─ Owner (User)
  ├─ Members (User[])
  └─ Tasks []
```

### 8.4 Integration Points (Phase 2)

| Integration | Purpose |
|---|---|
| Google Calendar / Apple Calendar | Auto-convert meeting attendee action items to tasks |
| Gmail / Outlook | Email-to-task forwarding address |
| Slack | `/todo add [task]` slash command |
| Zapier / Make | No-code automation connectors |
| Health apps (Apple Health, Fitbit) | Energy level inference from sleep/activity data |

---

## 9. Competitive Landscape

| Competitor | Strengths | Weaknesses | Our Differentiation |
|---|---|---|---|
| **Todoist** | Cross-platform, mature, integrations | Guilt-inducing overdue system, AI feels bolted-on | Forgiveness mechanics, native AI planner |
| **Things 3** | Beautiful UX, Mac/iOS native | No Android, no collaboration, no API | Accessibility + cross-platform |
| **TickTick** | Feature-rich, Pomodoro built-in | Cluttered UI, overwhelming | Focus-first UX, ADHD design |
| **Microsoft To Do** | Free, Outlook integration | Boring UX, no AI, no power tools | Delight, AI, developer tooling |
| **Notion** | Highly flexible | Not designed for daily task management, slow | Speed, focus, mobile-first |
| **OmniFocus** | Power user features, GTD | Expensive, steep learning curve, Apple-only | Accessible power: simple by default, complex on demand |

**Our positioning:** The only task app that acts as your **coach, not your judge** — combining the delight of Things 3, the AI intelligence of a personal assistant, and the accessibility of a neurodivergent-friendly design.

---

## 10. Release Roadmap

### Phase 1 — MVP (Month 1–3)

**Theme:** "Capture everything. Do the right thing next."

**Scope:**
- [ ] Core task model (title, status, due date, notes)
- [ ] Natural language date parsing
- [ ] Today / Inbox / Upcoming / Someday / Completed views
- [ ] Focus Mode (one task at a time)
- [ ] "Pick for me" AI button (v1: rule-based; v2: ML)
- [ ] Forgiveness/deferral mechanic (no overdue label)
- [ ] Satisfying completion animations
- [ ] Streak counter
- [ ] Offline-first with CRDT sync
- [ ] iOS + Android + Web
- [ ] Google / Apple / Email sign-in
- [ ] Freemium model: unlimited tasks, 3 projects free; unlimited projects on Pro

**Success gate:** Day-30 retention ≥ 35%, App Store rating ≥ 4.3

---

### Phase 2 — Growth (Month 4–6)

**Theme:** "Your AI planning partner."

**Scope:**
- [ ] Projects (unlimited on Pro)
- [ ] Energy level tags + energy-based filtering
- [ ] Goal decomposition (AI)
- [ ] Accountability partner sharing
- [ ] Sub-tasks / micro-completions
- [ ] Weekly review wizard
- [ ] Weekly accomplishment digest email
- [ ] Pomodoro timer per task
- [ ] Markdown in task descriptions
- [ ] Full keyboard navigation + command palette
- [ ] Calendar integration (Google Calendar, Apple Calendar)
- [ ] Recurrence with smart detection

**Success gate:** Freemium → Pro conversion ≥ 4%, WAU growth ≥ 15% MoM

---

### Phase 3 — Platform (Month 7–12)

**Theme:** "Power tools and teams."

**Scope:**
- [ ] REST API (public, documented)
- [ ] Webhooks
- [ ] CLI companion (`todo`)
- [ ] Shared lists (collaboration)
- [ ] Slack integration
- [ ] Zapier / Make connectors
- [ ] macOS native app (Menu Bar widget)
- [ ] Team/workspace tier (pricing TBD)
- [ ] Template marketplace (reusable checklist templates)
- [ ] Advanced analytics dashboard

---

## 11. Out of Scope

The following are explicitly excluded from all three phases and require a separate product decision to include:

- Full project management (Gantt charts, dependencies, resource planning)
- Time tracking / billing (beyond simple Pomodoro)
- File storage / document management
- Video or audio meeting recording
- Enterprise SSO / SCIM provisioning (Phase 3+ review)
- Public task boards (social discovery of others' tasks)
- E-ink hardware companion device

---

## 12. Open Questions

| # | Question | Owner | Target Resolution |
|---|---|---|---|
| OQ-1 | What is the primary monetization model — freemium with project limit, or time-based trial? | Product + Business | Before MVP launch |
| OQ-2 | Should "Pick for me" AI be opt-in (privacy) or opt-out (default on)? | Product + Legal | Before MVP launch |
| OQ-3 | Which CRDT library should we adopt? Yjs vs. Automerge vs. custom? | Engineering | Architecture spike (Week 2) |
| OQ-4 | Do we build the natural language parser in-house or license (e.g., Duckling, Chrono)? | Engineering | Architecture spike (Week 2) |
| OQ-5 | What is the ADHD / neurodivergent user acquisition strategy — organic, partnership with ADHD communities? | Marketing | Go-to-market planning |
| OQ-6 | Should streak recovery ("grace day") be unlimited or limited to 1 per month? | Product | User testing (Phase 1 beta) |
| OQ-7 | What data do we store server-side for AI features vs. keeping on-device? | Product + Legal + Engineering | Privacy architecture review |
| OQ-8 | Is Android a simultaneous launch with iOS or delayed? | Engineering | Resource planning |

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Deferred** | A task that was not completed by its due date and has been auto-rescheduled without penalty |
| **Focus Mode** | A full-screen single-task view designed to minimize distraction |
| **Forgiveness Mechanic** | Any system design that removes guilt or penalty from non-completion |
| **Inbox** | Captured tasks that have not yet been processed into a project or scheduled |
| **Pick for me** | AI feature that selects the single most appropriate task to work on now |
| **Someday List** | A holding area for tasks with no committed date |
| **Streak** | A counter of consecutive days on which the user completed at least one task |
| **CRDT** | Conflict-free Replicated Data Type — a data structure enabling offline-first sync without conflicts |

---

## Appendix B — Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-15 | Adopt "no overdue" forgiveness mechanic | Brainstorming identified guilt as primary retention killer; validated by Red Hat analysis |
| 2026-03-15 | Primary persona = overwhelmed professional, not student | Larger addressable market and higher willingness to pay for Pro tier |
| 2026-03-15 | Offline-first with CRDTs (not last-write-wins) | Non-negotiable for mobile users; data integrity is foundational trust |
| 2026-03-15 | ADHD / neurodivergent users as explicit design target | Underserved, vocal, loyal segment; good-for-ADHD design is good for everyone |

---

*Authored by Sarah — Product Owner (BMAD) | Based on brainstorming session facilitated by Mary — Business Analyst (BMAD)*
*Review with architect and dev agents before implementation begins.*
