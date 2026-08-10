---
title: Donny-First Dashboard
type: concept
created: 2026-08-09
updated: 2026-08-09
sources: [2026-08-09-donny-first-dashboard-and-route-blind-spot.md, 2026-08-09-donny-dashboard-inline-chat.md]
tags: [donny, dashboard, business-role, onboarding, feature-flag, phase-a, phase-b, inline-chat]
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
- **Taps and the prompt box answer IN the page** via `sendMessage()` (Phase B, below). `DonnyStage`
  is untouched.

### Phase A launched Donny; Phase B made the dashboard BE Donny

> **Superseded 2026-08-09.** This section used to read: *"For one release the dashboard opens the
> panel rather than hosting the conversation. This is a deliberate trade the founder accepted, not
> an oversight."* That was accurate when written and is **no longer the behaviour** — the founder
> used Phase A on prod and reported the panel-opening as the defect: *"it opened the chat instead
> of keeping the conversation and details in the dashboard."* Kept rather than deleted because the
> trade was real and the reasoning below is why Phase B is shaped the way it is.

Phase A's prompt box was a **launcher**: `handlePromptSubmit` called `openDonnyWithContext()`,
which `open()`s the panel, `expand()`s it, then sends. That was the design behaving as specified,
not a bug — worth saying plainly, because relabelling it as a defect would hide that the *design*
was wrong for the surface rather than the code.

**The load-bearing blocker was not on §13's list of seven hazards.** `useDonny` gates its queries
on `stage !== 'closed'`, so an inline thread rendered with the panel shut shows a **permanently
empty box** — and empty is indistinguishable from "no messages yet", so it would have passed review
and failed the user.

**Phase B is smaller than the spec's answer, because `stage` was conflating two things.** The spec
proposed a new `inline` stage, which drags in `close()`/`collapse()` guards plus an audit of all six
components that branch on `stage`. But "the panel is visible" and "the conversation is live" are
different facts. `registerInlineConversation()` — a **ref-count**, not a boolean, so two surfaces or
a remount whose new effect precedes the old cleanup cannot switch the conversation off underneath
the one still showing it — separates them. `stage` is byte-unchanged, so the nav button, desktop
panel, mobile sheet and tour anchors behave exactly as before, and **hazards 2, 3, 4 and 7 dissolve
rather than being solved**.

Hazards 1 and 6 are closed by extracting **`DonnyThread`** from `DonnyChatView`: one implementation
for both surfaces, rendering **no panel header** (an inline collapse/close is the "two Donnys on one
screen" hazard) and owning **no scroll container and no `h-full`**, because those differ per surface
— the panel is a fixed-height flex column that scrolls itself, and the dashboard supplies
**`DonnyThreadRegion`** (see below). *(Through #423 the dashboard sat in normal page flow scrolled by
`#main-content`; that is what #429 replaced.)*

### The page stopped growing, and then stopped remembering (#429, #428)

The founder used the shipped Phase B on prod and filed the same defect twice, in two different
words — *"On the Desktop the conversation just keep running down endlessly and there's no scroll
button"* and *"the conversation just runs down endlessly on the mobile and desktop versions is a bad
UX design… once the conversation reaches the 'page length' there needs to be a scroller."* **Two
sessions picked those up in parallel and both built a bounded scroller.** #429 merged first and is
the one that shipped; the other branch was reset onto it and rebuilt to carry only the remainder.
The duplicate was **discarded, not merged** — two implementations of one behaviour is worse than
either. See "What review caught" below for how the collision was found, because it was not found by
looking.

**#429 — the thread became a real scroll container.** `DonnyThreadRegion` owns a bounded scroller
with the composer as a plain flex sibling **beneath** it and a scroll-to-bottom control that appears
only when the reader is away from the bottom (follow-the-reply is suppressed for a reader who has
scrolled up — yanking them back is the defect the control exists to let them undo).

Two things in it are worth keeping past this feature:

- **Not `position: sticky` for the composer — it is INERT anywhere inside `DashboardLayout`.** The
  layout root and the mobile content wrapper carry `overflow-x-hidden`, and per CSS Overflow 3 a
  non-visible overflow on one axis computes the other to `auto`, making them the nearest scroll
  container. Both are `min-h-screen` with content-driven height, so neither ever scrolls and a
  sticky composer silently never pins.
- **`min-h-0 flex-1`, never `h-full`.** A percentage height only resolves against a parent whose
  `height` *property* is definite; every ancestor here uses `min-h`/`max-h` and leaves `height:
  auto`, so it fell back to content height. Measured on the real page: the scroller computed to
  **8337px inside a 145px parent**, so `overflow-y-auto` had nothing to overflow and the thread
  painted straight over the attention list. **jsdom cannot catch this class** — it performs no
  layout, so a class-value pin passes on the broken version too. The proof is a DOM measurement in a
  real browser.

**#428 — the page stopped showing yesterday.** *"We don't need the conversation from yesterday.
Every prompt is fresh upon visit."* Donny keeps ONE conversation per user, shared with the side
panel, so the dashboard **filters** it rather than forking it: the panel stays continuous, the model
still receives its history, and only this surface's display is fresh. `visitBaselineId` is the id of
the last message present when the user first asked here; `visitMessages` is everything after it, and
`hasConversation` keys on that — so arriving with yesterday's thread leaves the page resting.

**Slice by id, never by count or by clock.** Late-arriving history lands *before* the baseline in the
ordered array and stays excluded, and no client clock is involved — a skewed one would hide the very
reply the user is waiting for.

The **greeting collapses** to its label row once a conversation runs (founder's choice), and the
block's max-height drops **26rem → 12rem** to match. The second half is load-bearing: reserving room
for a hero that is no longer rendered hands the reclaimed ~200px back as whitespace and leaves the
thread exactly the size it was. **A collapse that frees space must also spend it**, or the only
visible change is that something disappeared.

## Decisions worth keeping

- **An empty collection is three different facts.** `messages` defaults to `[]` and its query is
  `enabled: !!conversation`, so an empty array means "conversation still loading", "history query in
  flight", or "genuinely none" — and only the third is a fact about the world. Recording the
  fresh-per-visit baseline from `[]` therefore wrote *"this user has no history"* during a cold load,
  and the whole prior thread counted as this visit the moment it arrived. Hence `messagesLoaded`,
  and hence it is **`isSuccess && !isFetching`**, not `isSuccess`: React Query keeps `isSuccess` true
  while a background refetch runs over **cached** data, so `isSuccess` answers *"have we ever
  loaded"* — which is not the question. Both halves found by Codex. **Generalises: any code reading
  `length === 0` as evidence about the world rather than about the array is one slow network away
  from being wrong.**
- **A prop named after a viewport is wrong the moment the trigger changes.** The chips-and-density
  switch was briefly `pinned` ("mobile, mid-conversation"); the real condition is "mid-conversation,
  any width". `compact` describes what the component does and survived the change intact.
- **The suggestion chips are cold-start help and retire with the hero.** "Create a campaign" is for
  someone who has not asked anything yet; keeping them mid-conversation spends a fifth of a phone
  screen suggesting openers to someone already past that. The test asserts **absence**, not
  `disabled` — which also makes a chip tap into `sendMessage`'s silent early return unreachable
  rather than merely discouraged.
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

- **The both-viewport browser check has never been run**, on any task in this branch **or in
  Phase B**. Subagents must not type credentials and the change is not deployed — Supabase auth is
  per-origin, so a prod session does not reach a local dev server. Static analysis established
  that all four `RESTAURANT_TOUR` anchors resolve and that the two
  `data-tour="brief-generator"` anchors can never co-mount (`PageTransition` is a keyed
  `motion.div` with **no `AnimatePresence`**, so the outgoing tree unmounts synchronously).
  **Genuinely unchecked: the inline thread on a real screen, the mobile viewport, console
  errors.** Closes at `verify-prod` after merge + flag flip. **This is now the largest unretired
  risk on this feature** — everything else is proven by tests, source reads or prod SQL; none of it
  has been *seen*.
- **The `donny-orchestrator` prompt rule is not deployed by merging.** Vercel ships the
  frontend only. Verify by reading the **deployed source** back for the literal string
  `Never end on a dead end` — not the version number. **Phase B adds a second string to the same
  deploy**: `_shared/social-analytics.ts`'s `NARROW_BUBBLE_FORMAT` reaches users only through that
  function, so merging ships the table *rendering* fix while the "write plain lines" half stays
  dark. One deploy closes both; verify both strings.
- **`DonnyProposalCta`'s `kind: 'ask'` variant is declared and never constructed.**
  `buildDonnyProposals.ts` types it; nothing in `src/` builds one, so `handleProposalAction`'s
  else-branch is unreachable today. Left alone (Phase A's, plausibly intended for a near-future
  proposal type) — but `ask()`'s `isStreaming` queue branch is documented as a **guard, not a live
  path**, so whoever ships the first `ask` proposal does not silently reintroduce the
  dropped-message defect.
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

### The collision nobody looked for (#428 vs #429)

The most expensive miss on this feature was not a defect — it was **building something that had
already been built**. Two sessions took the founder's two phrasings of one complaint and both
implemented a bounded scroller. #429 merged; #428 spent hours on a parallel implementation, plus
five review rounds on a fixed-composer mechanism that #429's approach makes unnecessary.

**It was found by accident.** A Codex finding about missing `space-y-3` prompted a look at how the
side panel spaced its thread — and `origin/main` turned out to contain a `DonnyThreadRegion` that
did not exist when the branch started.

**The check that would have caught it had been run that morning, and came back clean, because it was
pointed at the wrong paths.** `[scope]` (`git log --oneline HEAD..origin/main -- <paths>`) was run
against the **core docs**; `origin/main` was docs-clean and said nothing about
`src/components/donny/`. **Run it against the source files the branch touches**, not only the docs
the knowledge-sync will edit. On a repo with 30+ worktrees, *"has someone already shipped this?"* has
a real answer available in one command.

The second half of the lesson: **when the parallel implementation landed first and is better, delete
yours.** #429's is better on every axis — a scroll-to-bottom control, and the `min-h-0 flex-1`
measurement that no test in the other branch could have produced. Rebuilding on top of it cost an
hour and removed an entire duplicate mechanism. The instinct to merge both, or to defend work
already done, produces two answers to one question.

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

### Phase B: four Codex rounds, four real findings, one shape

Phase B "looked done" after its first commit — all gates green, negative controls run. Four review
rounds then found four more defects, **none of which a passing suite or a screenshot would show**,
and every one is the same failure: *the code claimed more than it delivered.*

| Round | Defect | Why the tests were silent |
|---|---|---|
| self | Arrival scrolled past the greeting | The comment promised it would not; the code inferred "a reply arrived" from the **message count growing**, and on arrival that count grows 0→N as the query resolves. **Intermittent** — with the thread already cached the count never grew and it behaved correctly. |
| Codex 1 (P1) | `package-lock.json` still had `remark-gfm` as a **dev** dep | `package.json` was fixed; the file that governs `npm ci` was not. `--omit=dev` would ship a production tree missing a runtime import. |
| Codex 1 (P2) | A failed first ask rendered **nothing at all** | The thread was gated on messages/streaming, so an error that produced neither was invisible. `onError` had set it correctly the whole time. |
| Codex 2 (P2) | The fix for that offered a **dead button** | `lastUserMessage` is assigned on the line *after* the `No active conversation` throw, and `retry()` guards on it — so "Try Again" did literally nothing. |
| Codex 3 (P2) | A follow-up typed mid-answer **vanished** | `sendMessage` opens with a *silent* `return` when a send is in flight, while the prompt cleared its box unconditionally. |

**The lesson that generalizes, and it sharpens [[Notification Delivery]]'s "no worse than before is
the wrong bar":** each fix must be judged against **the claim it makes**, comment included. A
half-done dependency move, a visible-but-unrecoverable error, a comment promising a scroll
behaviour the code did not implement, and an input that accepts text it will not send are one
defect wearing four costumes.

**Two corollaries worth keeping:**

- **"The failure is visible now" is not the bar.** Round 1 surfaced the error; round 2 showed that
  surfacing it produced a dead control. The bar is whether *the thing the user did works* — which
  is why the ask is **queued** rather than sent-and-caught.
- **A guard belongs where the event actually enters.** The `busy` check sits in `handleSubmit` as
  well as on the button, because **Enter submits a form without ever consulting the button's
  `disabled` state**. Guarding only the visible control would have left the exact path most people
  use.

## See Also

- [[Donny Data Visibility & Quick-Action Routing]] — the route allow-list, its blind spot, and
  the twelve dead CTAs this dashboard's CTA validation exists to prevent
- [[Honest Analytics]] — why no stats tap ships here, and the sample-size gate the first
  successful `social_*` call exercised
- [[Donny Social Tools]] — the repair whose acceptance test produced both Phase B defects
- [[Light-App Kit]] — `PageBody` / `AppCard` / `AppChip`, and the filter-vs-affordance tension
- [[Nav Active State]] — the sibling "which surface am I on" concern; nav is untouched by Phase A
- [[Mobile Viewport & Fixed Positioning]] — `PageTransition`'s opacity-only contract, which is
  what makes the two tour anchors provably exclusive
- [[AI Creator Matching]] — `find_creators`, one of the three working taps
