---
title: Donny-First Dashboard
type: concept
created: 2026-08-09
updated: 2026-08-09
sources: [2026-08-09-donny-first-dashboard-and-route-blind-spot.md]
tags: [donny, dashboard, business-role, onboarding, feature-flag, phase-a]
---

# Donny-First Dashboard

The business (restaurant) dashboard body becomes Donny: a greeting, what needs the owner's
attention right now, a prompt box, and a few taps that work. Today's body is preserved
verbatim at `/dashboard/business/overview`. Phase A ships behind
`DONNY_FIRST_DASHBOARD_ENABLED`, **default `false`**.

The acceptance bar is the founder's, and it is not a metric: *"My 75 year old mom should be
able to comfortably use the app as soon as they log in… and she's not tech savvy at all."*

## The audit came before the design, and it set the scope

Phase 0 was run against **production**, not assumed, and it is why this feature is smaller
than the brief asked for.

| Finding | Consequence for the design |
|---|---|
| `usePendingActions` → `PendingActionBanners` already produced dismissible, capped, state-derived proposals | **The hard part was built** — it was buried under a greeting, a hero CTA and a frame. The work is restructuring, not construction. |
| Only **four** Donny tools verifiably work on prod: `prepare_campaign`, `find_creators`, `web_search`, `read_url` | The body ships **three** taps, not six |
| `social_*` is **0/7** and blames the user's connection when it fails — the account it named had an **active** Instagram row | Nothing routes to `social_*` |
| Analytics claims were already publicly walked back ([[Honest Analytics]]) | No stats tap, and `useDonnyQuickChips` is deliberately **not** rendered — it returns a "📊 Campaign stats" chip |
| `donny_nudges`: 33 rows ever, 0 acted on | This does **not** build on nudges |
| `donny_tool_executions` has **zero rows** for every consumer sub-agent | Sub-agent failures on prod are invisible; nothing here can be measured through it |

**A tap that produces a shrug is worse than no tap.** That single rule is what reduced the
mockup's six affordances to three.

### The 0% is not evidence

`donny_nudges.acted_at` is never recorded: `executeAction` fires `actOnNudge(nudgeId)` and
then immediately sets `window.location.href`, so the full page load cancels the in-flight
UPDATE. Dismissals land only because dismissing doesn't navigate. **The 0% action rate is an
instrumentation failure, not a behavioural fact** — it is uninterpretable, not damning. Do not
cite it as proof that proposals don't work.

## Architecture

`BusinessDashboard.tsx` is a thin three-way switch, and the order is load-bearing:

1. `isFirstRun && missions` → `FirstRunDashboard` — **checked first**, so a brand-new owner
   always gets the mission list regardless of the flag
2. flag off → `BusinessOverview` (today's body, moved verbatim)
3. flag on → `DonnyHome`

- **`buildDonnyProposals()` is pure.** It takes already-fetched React Query results plus an
  **injected `now`**, and returns `{ blocker, proposals, overflowCount, allProposalIds }`. No
  hooks, no network, no `Date.now()` — so its tests need no mocks and cannot flake on a clock.
- **`DonnyHome` is the container**; `DonnyHomeProposals` and `DonnyHomePrompt` are
  presentational. Every fetch, dismissal write, analytics call and `navigate()` lives in the
  container.
- **Taps open the existing Donny panel** via `openDonnyWithContext()`. `DonnyStage` is
  untouched.

### Phase A launches Donny; it does not become Donny

For one release the dashboard *opens* the panel rather than hosting the conversation. This is
a deliberate trade the founder accepted, not an oversight. Phase B (inline chat) must first
resolve seven hazards verified against code — two of which put **two Donnys on one screen**,
because `DonnyChatView`'s header calls `collapse()` (→ un-hides the panel) and `close()` (→
disables the conversation's queries while the page is still mounted, unrecoverably, since
`setInline()` is mount-only).

## Decisions worth keeping

- **The location-setup blocker is returned separately from the capped list.** It blocks
  campaign creation, promotions *and* DragonShare; ranked below three pending applications it
  would vanish. Structure, not a priority number, keeps it visible.
- **Dismissal is keyed per proposal, not per campaign.** The old
  `pendingBannerDismissed_${campaignId}` key was campaign-scoped, so dismissing an "applied"
  prompt also silenced "submitted content" for the same campaign — Donny went quiet about
  delivered work.
- **Two signals, not four.** "No campaign in 14 days" was **cut**: the hook it was specified
  against selects `id, title, status, deadline` — there is no `created_at`. It was also a nag
  rather than an action. "Social connected, nothing scheduled" is deferred — its query is
  inline in a component, not an exported hook.
- **Route CTAs are validated through `isKnownDonnyRoute` before render**; one that fails
  renders as text with no button. Direct lesson of the twelve dead CTAs in
  [[Donny Data Visibility & Quick-Action Routing]].
- **Deadline signals get their own query — recency is not due-soon.** The first cut fed them from
  `useBusinessActiveCampaigns`, which is `.order('created_at', desc).limit(5)` because it was built
  for the recent-activity widget. A restaurant with more than five campaigns would therefore
  **silently lose the due-tomorrow warning on an older one** — no error, no empty state.
  `useUpcomingCampaignDeadlines` filters the window in SQL (local calendar dates, since `deadline`
  is a Postgres `date`) ordered by `deadline` ascending. **When a list is a means to an end, check
  that its ordering and limit serve the question you are actually asking** — reusing a convenient
  query is how a "needs your attention" surface quietly stops mentioning things. Found by Codex,
  second P2 on this branch.
- **`priority` does not drive cross-kind ordering.** It exists on the exported interface but
  the merge concatenates pending-actions then signals as fixed groups. Annotated as reserved so
  a consumer doesn't assume otherwise.

## Known Issues

- **The both-viewport browser check has never been run**, on any task in this branch.
  Subagents must not type credentials and the change is not deployed — Supabase auth is
  per-origin, so a prod session does not reach a local dev server. Static analysis established
  that all four `RESTAURANT_TOUR` anchors resolve and that the two
  `data-tour="brief-generator"` anchors can never co-mount (`PageTransition` is a keyed
  `motion.div` with **no `AnimatePresence`**, so the outgoing tree unmounts synchronously).
  **Genuinely unchecked: the panel actually opening on tap, the mobile viewport, console
  errors.** Closes at `verify-prod` after merge + flag flip.
- **The `donny-orchestrator` prompt rule is not deployed by merging.** Vercel ships the
  frontend only. Verify by reading the **deployed source** back for the literal string
  `Never end on a dead end` — not the version number.
- **The prompt rule's effect is not statically verifiable.** It needs one live conversation
  forcing a capability gap, confirming Donny neither invents a page name nor bleeds a guessed
  route into `suggested_actions`.
- **`AppChip` may read as disabled.** Its inactive state is `text-dc-text-muted` because it was
  built as a *filter* control ([[Light-App Kit]]); here it is the page's primary affordance,
  and every other documented interactive label in the system is coloured. Mitigated with a
  call-site `text-dc-teal-btn` override — `AppChip` itself untouched, since it is shared with
  genuine filter surfaces. **Still wants a look on a real screen.**
- Three of four business stat tiles remain hardcoded `'—'` on `/overview` (Creators, Spend,
  ROI). Untouched by this work.

## What review caught that authorship did not

Four defects, **all four in code written into the plan** rather than by implementers, and every
one survived the plan's own self-review:

1. **Rating prompts as siblings of the attention frame** — one framed list plus two orphaned
   rows. Caught **two tasks before** the code that would have exhibited it was written.
2. **Dismissal read only the capped three** — so dismissing one row resurrected a lower-ranked
   one already waved off, with its record sitting unread on disk. Fixed by returning
   `allProposalIds` (full ranked list, pre-filter pre-cap).
3. **Two applicants on one campaign minted the same proposal id** — React duplicate-key
   warning, and dismissing one silenced the other. **The normal marketplace case.**
4. **Codex: date-only deadlines compared as instants** — see below.

### The deadline bug is the durable one

`campaigns.deadline` is a Postgres **`date`** (verified against prod `information_schema`), so
it arrives `"YYYY-MM-DD"` and `new Date()` parses it at **UTC midnight**. Comparing that
instant against a mid-day `now` floors downward in **every** timezone, so the `'due today'`
branch was unreachable all day. In America/New_York — where the company is — UTC midnight of
day D is 8pm local on D−1, so *tomorrow's* deadline also read "due today" until it vanished at
8pm.

Fixed by normalizing both endpoints to **local midnight**, and **rounding rather than
flooring**: a calendar day is 23 or 25 hours across a DST transition, and a floored 25-hour
"tomorrow" reads as "today".

**Eight subagent reviews, an opus whole-branch pass and a spec self-review all missed this.
Codex caught it on the first look.** The generalizable point is the one
[[Social Measurement Spine]]'s session already recorded: *diversity of question beats depth of
scrutiny.* Every internal review asked "is this correct?"; Codex asked "what type is that
column, really?"

## See Also

- [[Donny Data Visibility & Quick-Action Routing]] — the route allow-list, its blind spot, and
  the twelve dead CTAs this dashboard's CTA validation exists to prevent
- [[Honest Analytics]] — why no stats tap ships here
- [[Light-App Kit]] — `PageBody` / `AppCard` / `AppChip`, and the filter-vs-affordance tension
- [[Nav Active State]] — the sibling "which surface am I on" concern; nav is untouched by Phase A
- [[Mobile Viewport & Fixed Positioning]] — `PageTransition`'s opacity-only contract, which is
  what makes the two tour anchors provably exclusive
- [[AI Creator Matching]] — `find_creators`, one of the three working taps
