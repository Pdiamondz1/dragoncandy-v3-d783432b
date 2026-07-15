# Session — Schedule / Calendar Agenda-First Simplification (mobile + desktop)

- **Date:** 2026-07-10
- **Branch:** `worktree-DC-20`
- **Type:** Frontend UX (no schema / edge / data change)
- **Spec:** `docs/superpowers/specs/2026-07-10-schedule-agenda-simplification-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-10-schedule-agenda-simplification.md`
- **Trigger:** Founder screenshot of the mobile "Confirm & Schedule All Posts" panel — "schedule calendar not easy to navigate in mobile… we need the simplest UX workflow that's easy for the user to navigate and use." Then: "look for improvements on the desktop view as well."

## What shipped

Made scheduling **agenda-first**: mobile and desktop both default to one scrolling day-by-day
list of upcoming posts, with a single "＋ Schedule" button, an always-visible "Today" control,
and a tap-the-month "jump to date" picker. The desktop Week/Month/Day grids stay as an optional
toggle (drag-to-reschedule untouched); the Month grid gained readable post chips. The campaign
Schedule Review panel dropped an overlapping timeline and got an actionable empty state.

### The design decision that shaped it
The founder's directive — *simplest* workflow — reframed the desktop question away from "add six
features" to "delete the need to choose a view." Answer: **one list, one button, everywhere.**
Agenda is the default; grids are optional, not required to get value. Simplicity is about the
default path, not deleting working alternatives — so the desktop grids + drag-to-reschedule were
preserved (deleting working code would trade marginal simplicity for real functionality loss).

### Units built (8 TDD tasks)
1. **Pure `AgendaItem` model** (`src/components/schedule/agenda/agendaModel.ts`) — `groupByDay`
   (drops empty days, filters from a date, sorts), `relativeDayLabel` (Today/Tomorrow/date),
   `contentTypeEmoji`, `monthMatrix`, `dateKey`/`startOfDay`. All **local-time** date math
   (no UTC/local mixing) so a post never lands on the wrong day.
2. **Adapters** (`agendaAdapters.ts`) — `outstandPostToAgendaItem` (returns `null` on no
   timestamp), `deadlineToAgendaItem`, and (added in the Codex-fix wave) `sponsorshipToAgendaItem`.
   Two data sources (Outstand `Post`, campaign deadlines/sponsorships) normalize into one model.
3. **`AgendaView`** — presentational day-grouped list; post rows, deadline rows, sponsorship rows
   (reuses the existing `SponsorshipMarkerDetail`); sticky header with month-jump + Today + Schedule.
4. **`MonthJumpControl`** — tap the month → mini month-picker; **bottom Sheet on mobile, Popover
   on desktop** (responsive via `useIsMobile`).
5. **`CalendarTab` integration** — added `'agenda'` view, default; mobile renders AgendaView
   (replaced `DayStrip`); desktop adds an Agenda toggle and keeps the grids; chevron header hidden
   in agenda view.
6. **"＋ Schedule" wiring** — new optional `onSchedule` prop; `ContentCalendar` (`/calendar`) now
   navigates to the composer (`/dashboard/{role}/social?tab=compose`), fixing a **silent no-op**
   (the standalone page never passed `onSwitchTab`, so the old Schedule button did nothing).
7. **`ScheduleReviewScreen`** (the screenshot) — removed the overlapping `ScheduleTimeline`
   (kept the `PostCard` list with its Edit/Change-Date buttons), made the header count honest +
   conditional ("N posts · Donny Optimized" only when >0), and replaced the dead-end empty state
   (a lone disabled button) with an explanation + a "Back to campaign" action.
8. **Readable Month cells (P2, desktop)** — `MonthGrid` shows up to 2 post chips (`time · title`,
   platform-tinted) + "+N more" instead of anonymous dots.

## Key decisions / gotchas
- **`variant` is behavioral, not cosmetic.** Opus review caught that `CalendarTab` hardcoded
  `variant="desktop"` on AgendaView — which routes MonthJump to a **Popover**. On mobile that
  gave a desktop popover instead of the bottom Sheet. Fix: responsive `variant={isMobile ? …}`.
  (The plan's own comment "only widens max-width" was wrong — a plan typo the review corrected.)
- **Sponsorship-events regression (Codex P2).** The first cut folded only posts + deadlines into
  the agenda. The old mobile `DayStrip` rendered **sponsorship markers**, and `OutstandManager`
  passes real `sponsorshipEvents` — so mobile users would have lost them. Fixed by adding
  `kind: 'sponsorship'` (3rd item kind) that reuses `SponsorshipMarkerDetail`.
- **Desktop legend mismatch (Opus Important).** The Month grid's status-colored dots became
  network-tinted chips, but the desktop legend still read "Scheduled/Published/Failed/Deadline."
  Fix: render that legend only for the Week/Day grid views (which it actually describes).
- **Two calendar hosts.** `CalendarTab` is used by `/calendar` (`ContentCalendar`) **and** the
  `OutstandManager` social tab — improving CalendarTab fixed both. The composer lives in the
  OutstandManager `compose` tab (reads `?tab`).
- **Two data sources, one view.** The calendar reads Outstand `usePosts()` (`Post`); the review
  panel reads `donny_scheduled_posts` (`ScheduledPost`). They deliberately do NOT share fetching —
  each maps into `AgendaItem`. The review panel kept its own `PostCard` list (didn't adopt
  AgendaView) to preserve its per-card edit affordances.
- Deleted the now-dead `ScheduleTimeline.tsx` (zero consumers after task 7).
- Touch-target discipline: header controls forced to ≥44px (a task-3 review send-back); calendar
  day cells stay `aspect-square` (calendar convention, exempt).

## Affected files (frontend only)
- New: `src/components/schedule/agenda/{agendaModel,agendaAdapters,AgendaView,MonthJumpControl}.tsx(.ts)` + co-located tests.
- Modified: `src/components/outstand/CalendarTab.tsx`, `src/pages/ContentCalendar.tsx`,
  `src/components/schedule/ScheduleReviewScreen.tsx` (+ new test),
  `src/components/outstand/calendar/MonthGrid.tsx` (+ new test).
- Deleted: `src/components/schedule/ScheduleTimeline.tsx`.

## Verification
- 23 co-located tests pass (agenda model/adapters/view/jump, review panel, month chips); typecheck
  + build clean. Claude subagent reviews per task (one Important 44px fix, one Important variant
  fix), whole-branch Opus review (one Important legend fix), and **Codex second review clean after
  one P2 sponsorship fix.** Manual both-viewport browser pass deferred to post-deploy verify-prod
  (the responsive Sheet-vs-Popover switch + agenda scroll are the things to eyeball live).
