---
title: Schedule Agenda View
type: concept
created: 2026-07-10
updated: 2026-07-10
sources: [2026-07-10-schedule-agenda-simplification.md]
tags: [scheduling, calendar, ux, mobile, outstand, donny]
---
# Schedule Agenda View

The scheduling surface is **agenda-first**: on both mobile and desktop the calendar defaults to
one scrolling day-by-day list of upcoming posts — a single "＋ Schedule" button, an always-visible
"Today" control, and a tap-the-month "jump to date" picker. Grids are optional, not the entry point.

This came from a founder directive to make scheduling the **simplest** thing to navigate on a
phone. The reframe that shaped it: *simplicity is the default path, not the removal of options.*
So the answer was **one list, one button, everywhere** — not adding features. The desktop
Week / Month / Day grids (with drag-to-reschedule) were kept as an optional toggle rather than
deleted; deleting working functionality would trade marginal simplicity for real loss.

## Architecture

A small **pure model** normalizes two unrelated data sources into one presentational view:

- `agendaModel.ts` — `AgendaItem` (`{id, date, kind: 'post'|'deadline'|'sponsorship', title,
  platform?, contentType?, status?, sponsorship?, onClick?}`), `groupByDay` (drops empty days,
  filters from a date, sorts), `relativeDayLabel` (Today/Tomorrow/date), `contentTypeEmoji`,
  `monthMatrix`, `dateKey`/`startOfDay`. **All date math is local-time** — no UTC/local mixing, so
  a post never renders on the wrong day. Fully unit-tested, no React, no I/O.
- `agendaAdapters.ts` — `outstandPostToAgendaItem` (`null` when no timestamp), `deadlineToAgendaItem`,
  `sponsorshipToAgendaItem`. The **calendar** reads [[Outstand]] `usePosts()` (`Post`); the **campaign
  review panel** reads `donny_scheduled_posts` (`ScheduledPost`). They do NOT share fetching — each
  host maps its own data into `AgendaItem`.
- `AgendaView.tsx` — day-grouped list; post rows, pink deadline rows, and sponsorship rows that
  reuse the existing `SponsorshipMarkerDetail`. Sticky header = month-jump + Today + Schedule.
- `MonthJumpControl.tsx` — mini month-picker; **bottom Sheet on mobile, Popover on desktop**,
  chosen by `useIsMobile()` (a *behavioral* difference Tailwind classes can't express).

`CalendarTab` (used by both `/calendar` `ContentCalendar` **and** the `OutstandManager` social tab)
renders `AgendaView` as the default `'agenda'` view; on mobile it replaced the old `DayStrip`; on
desktop it added an Agenda toggle beside the kept grids.

## Key Decisions

- **`variant` is behavioral, not cosmetic.** It routes the month-jump to Sheet (mobile) vs Popover
  (desktop). Hardcoding `variant="desktop"` silently gave mobile a desktop popover — must be
  responsive (`useIsMobile`). Caught in review; the plan's "only widens max-width" note was wrong.
- **"＋ Schedule" must actually open the composer.** The standalone `/calendar` page never passed
  `onSwitchTab`, so the old Schedule button was a silent no-op. New optional `onSchedule` prop →
  `ContentCalendar` navigates to `/dashboard/{role}/social?tab=compose`.
- **Review panel keeps its `PostCard` list** (its per-card Edit / Change-Date buttons) — only the
  overlapping `ScheduleTimeline` was removed. Its empty state now explains + offers "Back to
  campaign" instead of a lone disabled button; the "Donny Optimized" badge shows only when >0.
- **Touch targets ≥44px** on the agenda header controls; calendar day cells stay `aspect-square`
  (calendar convention, exempt).

## Known Issues

- **Desktop Month legend** was gated to the Week/Day grids only — it described status-colored dots,
  but the Month view now uses **network-tinted chips**. A per-network Month legend is a follow-up.
- Month chip tints only distinguish Instagram/TikTok; YouTube falls through to the Instagram teal
  (cosmetic; inherited from the plan). Sponsorship events surface in the agenda but aren't in the
  month-jump "has content" dots.
- Manual both-viewport verification is a post-deploy `verify-prod` step (the Sheet-vs-Popover
  switch and agenda scroll are the things to confirm live).

## See Also
- [[Outstand]] — the social-posting bridge whose `Post` feeds the calendar agenda.
- [[Donny AI]] — scheduling is part of its intelligence layer; `donny_scheduled_posts` feeds the review panel.
- [[Campaign Delivery, Scheduling & Notifications Session]] — the auto cross-scheduling that produces the review panel's posts.
