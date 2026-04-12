# Donny AI Superagent — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Approach:** Clean-Room Core, Reuse Edges (Approach 2)

---

## Overview

Transform Donny from a fragmented set of UI entry points (floating button, dashboard search bars, page-specific CTAs) into a unified superagent available on every page once logged in. Donny becomes the central nav element on mobile and a persistent side panel on desktop, with a two-stage interaction model (compact tray → full chat) designed to minimize typing.

### Goals

- Donny is accessible from every page via a single, prominent entry point
- Users accomplish tasks with minimal typing through tap-to-act cards, context-aware quick chips, and inline notification actions
- The experience is responsive across mobile and desktop
- Existing chat logic, rich cards, and edge functions are preserved

### Non-Goals

- Voice input (Phase 2)
- Swipe gestures on nudge cards
- Shake/tap-hold gestures to summon Donny
- Rebuilding the `useDonny` hook, `donny-chat` edge function, or Supabase data model for conversations

---

## Interaction Model

Three layers working together, with conversational chat as the primary interaction:

| Layer | Role | How it works |
|-------|------|-------------|
| **Ambient** | Draws attention, surfaces opportunities | Notification badge on Donny avatar, nudge cards in tray with inline action buttons |
| **Chat (home)** | Where everything happens | Persistent conversation with message history, rich cards, quick chips |
| **Quick actions** | Embedded in chat and tray | Tap-to-act buttons on cards and chips — no separate command palette |

### "Type LESS" Input Methods (Launch)

1. **Tap-to-act cards** — Rich cards with pre-built action buttons (Approve, View, Pass, Message)
2. **Context-aware quick chips** — Dynamic suggested prompts based on current page, role, and app state
3. **Notification-style nudges** — Compact cards with inline actions, actable without opening full chat

---

## Component Architecture

### New Components

```
App.tsx
├── DonnyProvider (unified context — replaces AIAssistantProvider + AIChatModalContext)
│   ├── [page routes]
│   │
│   ├── DonnyNavButton (center button on mobile, header icon on desktop)
│   │
│   ├── DonnyTray (Stage 1)
│   │   ├── DonnyNudgeCard (actionable notification cards)
│   │   ├── DonnyQuickChips (dynamic, context-aware — reused component)
│   │   └── DonnyTrayInput (minimal input that triggers Stage 2)
│   │
│   └── DonnyChat (Stage 2 — wraps existing internals)
│       ├── DonnyChatHeader
│       ├── DonnyMessage (reused)
│       ├── DonnyRichCard (reused)
│       ├── DonnyTypingIndicator (reused)
│       ├── DonnyQuickChips (reused)
│       └── DonnyChatInput (full input bar)
```

### Components Deleted

| Component | Replaced by |
|-----------|------------|
| `DonnyDock` | `DonnyNavButton` |
| `DonnyAIBar` | Single entry point via `DonnyNavButton` |
| `DonnyChatSheet` | `DonnyTray` + `DonnyChat` |
| `DonnyCampaignCTA` | Quick chip inside tray |
| `AIAssistantProvider` | `DonnyProvider` |
| `AIChatModalContext` | `DonnyProvider` stage state |
| `donny-open-chat` custom events | `DonnyProvider` context calls |

### Components Reused As-Is

- `useDonny` hook (core chat logic, Supabase integration, edge function calls)
- `DonnyMessage` (message rendering with markdown)
- `DonnyRichCard` (creator profiles, campaign summaries, payment confirmations, etc.)
- `DonnyTypingIndicator`
- `DonnyAvatar` (refactored for new size scale and emblem asset)
- `donny-chat` edge function
- Supabase tables: `donny_conversations`, `donny_messages`

---

## DonnyProvider — Unified State Management

Single context replacing `AIAssistantProvider` and `AIChatModalContext`.

### State Interface

```typescript
interface DonnyContextState {
  // UI state machine
  stage: 'closed' | 'tray' | 'chat';

  // Nudges (ambient layer)
  nudges: DonnyNudge[];
  unreadCount: number;

  // Chat (delegates to existing useDonny hook)
  conversation: DonnyConversation | null;
  messages: DonnyMessage[];
  avatarState: DonnyAvatarState;
  isStreaming: boolean;

  // Context awareness
  currentPage: string;
  userRole: 'business' | 'creator' | 'brand';

  // Actions
  open: () => void;           // closed → tray
  expand: () => void;         // tray → chat
  collapse: () => void;       // chat → tray
  close: () => void;          // any → closed
  sendMessage: (msg: string) => void;
  executeAction: (action: NudgeAction) => void;
  dismissNudge: (id: string) => void;
}
```

### State Machine Behaviors

- `open()` always transitions to tray first, never directly to chat
- `expand()` triggered by: typing in tray input, tapping a chip with `requiresChat: true`, or drag-up gesture on mobile
- `collapse()` returns to tray (not closed) — chat history persists
- `currentPage` read from React Router `useLocation()` — quick chips and nudge priority adjust automatically
- `executeAction()` handles tap-to-act buttons without opening chat — action runs, nudge shows confirmation, then auto-dismisses

---

## Nudge Engine

Hybrid architecture: Supabase real-time data + AI personality/prioritization layer.

### Data Flow

```
Supabase Real-time           AI Framing Layer            DonnyProvider
───────────────────          ────────────────            ─────────────
campaign_applications  ─┐
campaign_collaborations─┤    useDonnyNudges hook
messages ──────────────┤──►  fetches raw events ──►     nudges[]
file_uploads ──────────┤     from Supabase, calls       ├─ NudgeCard
campaigns ─────────────┘     donny-nudge-frame           ├─ NudgeCard
                             edge function for           └─ NudgeCard
                             personality + priority
```

### New Hook: `useDonnyNudges`

Subscribes to Supabase real-time channels for role-specific events:

| Role | Events watched |
|------|---------------|
| Business | New applications, content submissions, campaign milestones, payment confirmations |
| Creator | New campaign invitations, application status changes, payment received, review posted |
| Brand | New campaign matches, collaboration updates, creator deliverables |

### Nudge Types

```typescript
interface DonnyNudge {
  id: string;
  type: 'application' | 'content' | 'milestone' | 'payment' | 'invitation' | 'match';
  rawData: Record<string, any>;
  summary: string;                // AI-generated one-liner
  priority: 'high' | 'medium' | 'low';
  actions: NudgeAction[];
  createdAt: string;
  dismissedAt: string | null;
}

interface NudgeAction {
  label: string;
  variant: 'primary' | 'secondary' | 'ghost';
  action: string;       // "approve_application", "view_portfolio", etc.
  payload: Record<string, any>;
}
```

### New Edge Function: `donny-nudge-frame`

Lightweight AI call that takes raw event data and returns a summary + priority. Called once per event, result cached in `donny_nudges` table.

- Input: `{ type: "application", data: { creator_name, campaign_title, rating, followers } }`
- Output: `{ summary: "Luna Rodriguez applied to Summer Campaign — 4.8★, 12.4K followers", priority: "high" }`

### New Supabase Table: `donny_nudges`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| user_id | uuid | FK to profiles |
| type | text | Event type |
| source_table | text | Which table triggered it |
| source_id | uuid | Row ID that triggered it |
| raw_data | jsonb | Original event data |
| summary | text | AI-generated summary |
| priority | text | high / medium / low |
| actions | jsonb | Array of NudgeAction |
| read_at | timestamptz | When user saw it |
| acted_at | timestamptz | When user acted on it |
| dismissed_at | timestamptz | When user dismissed it |
| created_at | timestamptz | When event occurred |

RLS policy: users can only read/update their own nudges.

### Nudge Creation: Database Trigger Approach

Nudges are created server-side via Supabase database webhooks (pg_net) to avoid client-side race conditions across multiple tabs/devices:

1. A database trigger on source tables (e.g., `campaign_applications` INSERT) fires a webhook to the `donny-nudge-frame` edge function
2. The edge function generates the AI summary + priority and inserts a row into `donny_nudges`
3. The client-side `useDonnyNudges` hook subscribes to `donny_nudges` via Supabase real-time and renders new nudges as they appear

### Nudge Lifecycle

1. Event occurs in Supabase → database trigger fires webhook to `donny-nudge-frame`
2. Edge function generates summary + priority → inserts row into `donny_nudges`
3. `useDonnyNudges` real-time subscription picks it up → appears in tray
4. User acts (tap Approve) → `acted_at` set, action executed, card shows confirmation
5. User dismisses → `dismissed_at` set, card fades out

---

## Context-Aware Quick Chips

Dynamic suggestions that change based on page, role, and current app state.

### Chip Interface

```typescript
interface QuickChip {
  label: string;
  message: string;          // sent to Donny when tapped
  variant: 'teal' | 'pink';
  requiresChat: boolean;    // true = expand to Stage 2
}
```

### Chip Mapping by Page

| Page | Business chips | Creator chips |
|------|---------------|---------------|
| Dashboard | "📊 Campaign stats", "✨ Create campaign", "👥 Top creators" | "🔍 Find campaigns", "💰 Earnings summary", "📈 My performance" |
| Campaigns | "📝 Edit campaign", "👀 View applicants", "🚀 Boost this" | "✋ Apply now", "❓ Ask about campaign", "📋 Similar campaigns" |
| Messages | "📨 Unread summary", "⚡ Quick replies", "📎 Send content" | "📨 Unread summary", "⚡ Quick replies", "📎 Send deliverable" |
| Profile | "✏️ Improve my profile", "📸 Update portfolio", "⭐ View reviews" | same |
| Promotions | "🎯 Campaign ideas", "📊 Promo performance", "🆕 Create promo" | "🎯 Available promos", "📊 My submissions" |

### State-Aware Overrides

State-aware chips take priority over page defaults. The tray shows up to 5 chips — state-aware ones fill first, then page defaults fill remaining slots.

- Pending applications → "Review 3 applicants"
- Campaign deadline within 48h → "⏰ Deadline approaching"
- No campaigns created yet → "✨ Create your first campaign"
- Content submitted for review → "📦 Review submitted content"

### `requiresChat` Behavior

- `false` → action executes or result renders in the tray (e.g., "💰 Earnings summary" shows a compact stats card)
- `true` → message sent to Donny, tray expands to Stage 2 (e.g., "✨ Create campaign" needs back-and-forth)

---

## Responsive Layout

### Mobile — Bottom Nav Changes

Donny replaces the center nav button. Nav stays at 5 items per role:

| Role | Nav items |
|------|-----------|
| Business | Dashboard, Campaigns, **Donny (🐉)**, Messages, Profile |
| Creator | Dashboard, Earnings, **Donny (🐉)**, Messages, Profile |
| Brand | Dashboard, Campaigns, **Donny (🐉)**, Messages, Profile |

Displaced actions (Create, Browse, Creators) become quick chips inside the tray.

### Mobile Container Behavior

| Stage | Behavior |
|-------|----------|
| `closed` | Nav button only, optional notification badge with breathing glow |
| `tray` | Bottom sheet at ~35% screen height, dimmed backdrop, drag handle |
| `chat` | Full screen (100% minus status bar), teal gradient header, collapse (▾) button |

Transitions: CSS `transform: translateY()` with spring easing. Drag gestures via touch events — up to expand, down to collapse/dismiss.

### Desktop — Header & Side Panel

Donny trigger in top-right header: `[🔔] [🐉 ³] [Avatar ▾]`

| Stage | Behavior |
|-------|----------|
| `closed` | No panel, page uses full width |
| `tray` | Right panel at 320px, page content reflows via flex layout |
| `chat` | Right panel expands to 420px, page content reflows further |

Panel is a flex child (not overlay) — dashboard grids, campaign lists, etc. reflow naturally.

### Breakpoint

`md` (768px) — below: mobile bottom sheet. At and above: desktop side panel. Uses existing `useMediaQuery` hook.

---

## Donny Emblem & Avatar

The minty green dragon emblem (`src/assets/donny-emblem.png`) replaces all emoji/icon representations.

### Size Scale

| Location | Size | Treatment |
|----------|------|-----------|
| Mobile center nav button | 40px | Circular crop, white border, teal glow shadow, elevated |
| Desktop header trigger | 32px | Circular crop, teal ring on hover, badge overlay |
| Tray header | 28px | Circular crop, subtle teal ring |
| Chat header | 32px | Circular crop, white ring (on teal gradient) |
| Chat message avatar | 24px | Circular crop, no ring |
| Nudge card mini avatar | 20px | Circular crop, no ring |

### Avatar Component

```typescript
interface DonnyAvatarProps {
  size: 'xs' | 'sm' | 'md' | 'lg';    // 20, 24, 28-32, 40px
  state?: DonnyAvatarState;
  showBadge?: boolean;
  badgeCount?: number;
  glow?: boolean;
}
```

### Avatar States

| State | Visual | When |
|-------|--------|------|
| `idle` | Static emblem | Default |
| `thinking` | Pulse animation | Processing a request |
| `celebrating` | Bounce animation (1 cycle) | Successful action |
| `action_needed` | Breathing glow | Unread nudges waiting |

Notification badge: pink accent (`#EC4899`), positioned top-right of avatar.

---

## Migration Plan

### Phase 1: Build new components alongside existing ones

- Add `DonnyProvider`, `DonnyNavButton`, `DonnyTray`, `DonnyChat`, `DonnyNudgeCard`
- Add `donny-nudge-frame` edge function and `donny_nudges` table
- Add `useDonnyNudges` hook
- Copy emblem asset to `src/assets/donny-emblem.png`
- Refactor `DonnyAvatar` for new size scale and emblem

### Phase 2: Wire up and switch over

- Replace center nav button with `DonnyNavButton` in `MobileBottomNav`
- Add Donny trigger to desktop header
- Mount `DonnyTray` and `DonnyChat` inside `DonnyProvider` in `App.tsx`
- Update `navConfig.ts` for displaced center actions → quick chips

### Phase 3: Clean up

- Delete `DonnyDock`, `DonnyAIBar`, `DonnyChatSheet`, `DonnyCampaignCTA`
- Delete `AIAssistantProvider`, `AIChatModalContext`
- Remove `donny-open-chat` custom event listeners
- Remove unused imports and references

### Future: Voice Input

- Add mic button to `DonnyChatInput`
- Use Web Speech API for browser-native speech-to-text
- Transcribed text sent as regular message to Donny

---

## Visual Reference

Mockups created during brainstorming are in `.superpowers/brainstorm/28988-1775951573/`:

- `donny-placement.html` — Nav button placement options
- `donny-stages.html` — Mobile two-stage tray/chat mockup
- `donny-desktop.html` — Desktop side panel mockup
