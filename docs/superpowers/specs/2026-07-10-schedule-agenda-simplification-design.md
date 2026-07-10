# Schedule / Calendar — Agenda-First Simplification (mobile + desktop)

- **Date:** 2026-07-10
- **Status:** Design (approved for planning)
- **Author:** Claude (brainstormed with Dame)
- **Surfaces:** Content Calendar (`/calendar` + the `calendar` tab in `OutstandManager`) and the campaign Schedule Review panel (`ScheduleReviewScreen`).

## 1. Problem

Users find the scheduling experience hard to navigate — most acutely on mobile, but the desktop view is weak too. Concretely, from the current code:

- **Mobile calendar is a dead-ish end.** `CalendarTab` hides the Day/Week/Month/Today controls on phones (`hidden md:flex`), leaving only two small chevron arrows that step **one week at a time**. There is no "Today", no month overview, no way to jump to a far date without many taps. The mobile "Schedule a Post" button in `DayStrip` calls `onSwitchTab?.('compose')`, but on the standalone `/calendar` page `onSwitchTab` is **not passed**, so the button silently does nothing.
- **Desktop Month view conveys almost nothing.** `MonthGrid` cells are ~56px tall and show only coloured **dots** — you can't tell *what* is scheduled without clicking into each day.
- **The Review & Confirm panel dead-ends.** `ScheduleReviewScreen` (the screen in the user's screenshot) shows a `ScheduleTimeline` whose dots are absolutely positioned by timestamp and **overlap** on a narrow screen when posts are close together. Its empty state is "No scheduled posts yet" above a **disabled** "Confirm & Schedule All Posts" button — a dead-end with no next action — while the header still reads "0 deliverables · ✦ Donny Optimized" (contradictory).
- **Two mental models.** Mobile (day-strip) and desktop (grids) look and behave differently, and the review panel is a third pattern.

## 2. Goal

**The simplest possible workflow: one list, one button — everywhere.** Both mobile and desktop open to the same **Agenda** — a single scrolling, day-by-day list of what's coming up, with one **＋ Schedule** button and a "Today" control always visible. Nothing to learn, nothing to configure before value appears.

Guided by the project North Star ("less typing = more margin", delete every step) and the Musk's-algorithm ordering: **delete** the forced view-choice and dead-ends; **simplify** what remains; **do not** destroy working functionality.

### Success criteria

- On a phone, a user can see what's scheduled and reach any date in ≤ 2 taps (month-jump), with a persistent "Today".
- "＋ Schedule" always opens the composer (no silent no-op) on every surface.
- The Review panel never dead-ends: a populated state is a clean day-list; an empty state explains and offers one action.
- Desktop and mobile share one Agenda component and one mental model.
- **Desktop Week/Month grids and drag-to-reschedule are preserved unchanged** (still reachable via a toggle); only the *default* changes and Month becomes readable.

## 3. Scope

### In scope

- **Agenda becomes the default view** in `CalendarTab` on both breakpoints.
  - **Mobile:** Agenda **replaces** `DayStrip` as the single view (there is no grid on mobile today, so this is already effectively single-view).
  - **Desktop:** Agenda is the default; **Week / Month remain** as an optional segmented toggle. `DayGrid` / `WeekGrid` (incl. drag-to-reschedule) are untouched.
- **Month view readability (desktop):** `MonthGrid` cells show a couple of post **chips** (`time · title`, platform-tinted) with "+K more" instead of bare dots. (P2 — separable; see §9.)
- **"＋ Schedule" wiring:** a single primary button on the Agenda that routes to the composer, including fixing the standalone `/calendar` dead-end.
- **Review & Confirm redesign** (`ScheduleReviewScreen`): replace the overlapping `ScheduleTimeline` with the shared Agenda day-list; fix the empty state and the contradictory header.
- **Month-jump control:** tapping the month label opens a compact month picker (bottom sheet on mobile, popover on desktop) that scrolls the agenda to the chosen day.

### Out of scope (YAGNI — not now)

- Desktop right-rail "This week" summary card / a new Donny summary widget (the existing `DonnyWeeklyPlanner` keeps rendering as-is).
- Richer Week-grid cards (thumbnails), keyboard navigation, drag-to-reschedule *inside* the agenda.
- Any change to how posts are **created/published**, to the Outstand data layer, or to `donny_scheduled_posts` schema.
- Merging the standalone `/calendar` page and the `OutstandManager` calendar tab (pre-existing duplication; left alone).
- Consolidating the two data sources (Outstand `Post` vs `donny_scheduled_posts`) — the Agenda adapts to both instead.

## 4. Architecture

Small, independently-testable units with clear boundaries. The presentational Agenda knows nothing about Outstand or Supabase — each surface adapts its own data into a normalized model.

### Unit 1 — `AgendaItem` normalized model + adapters (pure, unit-tested)

`src/components/schedule/agenda/agendaModel.ts`

```ts
export type AgendaItemKind = 'post' | 'deadline';

export interface AgendaItem {
  id: string;
  date: string;              // ISO; the moment it's anchored to
  kind: AgendaItemKind;
  title: string;             // caption/title or campaign title (deadline)
  platform?: string;         // 'instagram' | 'tiktok' | ... (posts only)
  contentType?: string;      // 'photo' | 'video_reel' | ... → emoji
  status?: string;           // 'scheduled' | 'published' | 'failed'
  onClick?: () => void;      // set by the host surface
}
```

Pure helpers (no React):
- `groupByDay(items, { from?: Date }): AgendaDay[]` — filter to `from` forward (default today, local midnight), sort ascending, group by local calendar day; **drop empty days**; return `{ dateKey, date, label, items }`.
- `relativeDayLabel(date, today): string` — "Today" / "Tomorrow" / weekday+date.
- Adapters (each pure, own file, own tests):
  - `outstandPostToAgendaItem(post: Post): AgendaItem` — uses existing `getCaption`, `getUniqueNetworks`, `scheduledAt ?? publishedAt`, `isScheduled` status.
  - `deadlineToAgendaItem(d: CampaignDeadline): AgendaItem`.

  (The review panel keeps its own `PostCard` list and does **not** use these adapters — see Unit 6.)

**Boundary:** given raw items, it returns grouped days. No I/O, no dates-from-`Date.now()` inside pure fns except a passed-in `today`/`from` for testability.

### Unit 2 — `AgendaView` presentational component

`src/components/schedule/agenda/AgendaView.tsx`

Props: `{ days: AgendaDay[]; today: Date; onJumpToDate?(d: Date); onScheduleClick?(): void; onTodayClick?(): void; showScheduleButton?: boolean; emptyState?: ReactNode; header?: 'full' | 'none' }`.

Renders: a sticky header (month label → opens month-jump; "Today" pill), day groups (`AgendaDayHeader` + `AgendaItemRow` list), and — when `showScheduleButton` — a `＋ Schedule` button (FAB on mobile, inline button on desktop). Deadlines render as a pink inline row (reuse existing deadline styling). Empty overall → render `emptyState`.

Sub-components: `AgendaItemRow` (emoji/thumb + title + `time · Platform`, tap → `item.onClick`), `AgendaDayHeader` (relative label), `MonthJumpControl` (see Unit 3).

**Touch targets ≥ 44px; use `dc-*` tokens / brand-adjacent neutrals (honor the "no flat-gray badges" rule).**

### Unit 3 — `MonthJumpControl`

`src/components/schedule/agenda/MonthJumpControl.tsx`

A button showing the current month; on click opens a compact month picker — **bottom `Sheet` on mobile, `Popover` on desktop** (shadcn primitives already in use). Picking a day calls `onJumpToDate(day)`. The picker is a lightweight month grid (reuse `getMonthGridDates`-style logic from `MonthGrid`; do not import the desktop grid). Marks today and days-with-content with a teal dot (host passes a `hasContent(day)` predicate).

### Unit 4 — `CalendarTab` integration

`src/components/outstand/CalendarTab.tsx`

- Add `'agenda'` to `CalendarView`; **default `view = 'agenda'`**.
- **Mobile:** render `<AgendaView>` (fed from `filteredPosts` + `campaignDeadlines` + `sponsorshipEvents` via adapters). **Remove `DayStrip`** from the render (component may stay in the tree/file but is no longer mounted here). Because Agenda is now the mobile view, the `hidden md:flex` view toggle stays desktop-only — mobile is single-view by design.
- **Desktop:** segmented control gains an **Agenda** option, shown first/active by default; `DayGrid`/`WeekGrid`/`MonthGrid` unchanged and still selectable. When `view === 'agenda'`, render `<AgendaView>` (desktop layout: inline header + `＋ Schedule` button, centered max-width list).
- `onJumpToDate(day)` → `setCurrentDate(day)` / `setSelectedDay(day)` and stay in agenda.
- `onScheduleClick` reused for the `＋` (see Unit 5).
- The `headerLabel` / chevron logic stays for grid views; Agenda uses its own sticky month header, so the top chevron row is hidden while `view === 'agenda'`.

### Unit 5 — `＋ Schedule` wiring (fix the dead-end)

- In `OutstandManager`, `onSwitchTab('compose')` already works — keep it.
- Add an optional `onSchedule?: () => void` prop to `CalendarTab`; when absent it falls back to the existing `onSwitchTab?.('compose')` (so `OutstandManager` keeps working with no change).
- The standalone `ContentCalendar` page passes `onSchedule={() => navigate('/dashboard/{role}/social?tab=compose')}` (role from `profile.role`; `OutstandManager` already reads `?tab`). This removes the silent no-op.
- `AgendaView.onScheduleClick` calls whichever handler `CalendarTab` resolves.

### Unit 6 — `ScheduleReviewScreen` redesign

`src/components/schedule/ScheduleReviewScreen.tsx`

- **Populated:** the screen already renders `posts` as a clean vertical list of `PostCard`s (each shows its date + Edit Caption / Change Date buttons). **Keep the `PostCard` list as-is** and **remove only `ScheduleTimeline`** — the overlapping-dot component that is the actual mobile bug. `ScheduleStatsRow` stays (post/cross-post/spread counts). Do **not** swap `PostCard` for `AgendaView` here: that would discard the per-card edit affordances. (The Agenda work is for the *calendar* surface; the review panel just needs the broken timeline removed and its states fixed.)
- **Header:** show `posts.length` posts (not "deliverables"); show the "✦ Donny Optimized" badge **only when `posts.length > 0`**.
- **Empty state (keystone):** instead of the dead-end, render a friendly block: icon + "No posts scheduled yet" + one-line explanation of what happens next + a **single primary action**. Exact copy/action to be finalized in the plan, but the rule is: *never a lone disabled button*. The sticky "Confirm & Schedule All Posts" footer is only shown when there is something to confirm.
- The right-side `Sheet` container is retained (full-width on mobile already); no bottom-sheet conversion needed for v1.

### Unit 7 — `MonthGrid` rich chips (desktop, P2)

`src/components/outstand/calendar/MonthGrid.tsx`

- Increase cell min-height; render up to **2** post chips per day (`time · short-title`, platform-tinted using existing `NETWORK_COLORS`) + "+K more"; keep the deadline/sponsorship markers. Clicking a chip → `onPostClick`; clicking empty cell space → `onDayClick` (unchanged). Desktop-only (`hidden md:block` stays). No data changes.

## 5. Data flow

```
Content Calendar surface
  Outstand usePosts() → Post[] ─┐
  campaignDeadlines ────────────┼─→ adapters → AgendaItem[] → groupByDay → AgendaView
  sponsorshipEvents ────────────┘

Review panel surface (unchanged data path)
  useScheduledPosts(campaignId, planGroupId) → ScheduledPost[] → PostCard list
     (ScheduleTimeline removed; empty state + header fixed)
```

The calendar surface feeds the shared `AgendaView` through the normalized `AgendaItem`; the review panel keeps its existing `PostCard` list. No shared fetching; each surface owns its query (unchanged).

## 6. Behavior details

- **Upcoming-only default:** the calendar Agenda shows today forward. Past dates are reached via month-jump (picking a past day sets `currentDate`; the list then renders from that day). The review-panel Agenda shows all posts in the plan (from the earliest), since a plan may start today.
- **Empty days are hidden** — only days with a post/deadline/sponsorship appear; near days get "Today"/"Tomorrow" labels.
- **Deadlines & sponsorships** fold into the day groups as their own row kinds (reuse the existing pink deadline styling and `SponsorshipMarkerDetail`).
- **Platform filter pills** are retained above the Agenda (existing `platformFilter` still filters `filteredPosts`).
- **Overall empty state (calendar):** "Nothing scheduled yet" + a `＋ Schedule` CTA (not a dead-end).

## 7. Error / edge handling

- Posts with a null/invalid timestamp are skipped by the adapter (never crash the group).
- `isLoading` keeps the existing `DCSkeleton` treatment.
- Month-jump to a month with no content still scrolls/sets the date and shows the empty state.
- Desktop grid views retain all current behavior and error handling; nothing removed.

## 8. Testing

- **Pure units (vitest):** `groupByDay` (empty-day dropping, ordering, `from` filter, day-boundary/local-tz), `relativeDayLabel`, all three adapters (field mapping, null timestamp skip, platform/emoji resolution).
- **Component (RTL):** `AgendaView` renders day groups + empty state + fires `onScheduleClick` / `onJumpToDate`; `ScheduleReviewScreen` populated vs empty (no disabled-only footer; badge hidden at 0).
- **Manual, both viewports (per CLAUDE.md):** mobile agenda scroll + month-jump + Today + ＋ opens composer; desktop agenda default + toggle to Week/Month (grids + drag still work) + Month chips; review panel from a campaign. Then `verify-prod` after deploy.

## 9. Build order (for the plan)

1. Unit 1 (model + adapters) + tests.
2. Unit 2 (`AgendaView`) + Unit 3 (`MonthJumpControl`) + tests.
3. Unit 4 (`CalendarTab` integration — agenda default; mobile replaces DayStrip; desktop toggle).
4. Unit 5 (＋ Schedule wiring, incl. standalone-page fix).
5. Unit 6 (`ScheduleReviewScreen` redesign).
6. Unit 7 (`MonthGrid` chips — P2; can ship separately).

Each step: `npm run build` → verify → proceed. Desktop `lg:` classes for the grids are not touched.

## 10. Explicit non-goals / preserved invariants

- **No desktop functionality removed.** Week/Month grids, hourly Day view, and drag-to-reschedule stay and stay reachable.
- **No data/schema/edge-function change.** Frontend-only.
- **Mobile-only vs desktop-only discipline:** mobile changes use base classes; desktop uses `lg:`/`md:` — never cross-applied.
- **Design system:** `dc-*` tokens, pill buttons, brand-adjacent neutrals (no flat-gray badges/banners).
