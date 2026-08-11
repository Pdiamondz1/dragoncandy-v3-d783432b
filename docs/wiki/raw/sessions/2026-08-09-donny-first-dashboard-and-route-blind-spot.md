# Session — Donny-first business dashboard (Phase A) + the route-guard blind spot

**Date:** 2026-08-08 → 2026-08-09
**PRs:** #409 (merged `fef2b428`), #410 (open)
**Branches:** `worktree-dc-improvements-22` → `feat/donny-first-dashboard`

Two efforts, one thread. The founder asked for a dashboard where the body *is* Donny.
Auditing whether that was even buildable turned up the route bug first, so it shipped
separately as #409 and the dashboard followed as #410.

---

## Part 1 — the route-guard blind spot (#409)

### What was wrong

`/settings/billing` and `/settings/social` were hardcoded in **12 places across 10 files**.
There is **no top-level `/settings/*` route in `src/App.tsx`** — all 12 hit the catch-all
`NotFound`. Among them:

- the **"Upgrade" CTA gating the paid Weekly Content Plan** — i.e. the revenue path
- the primary **"Connect Outstand"** button on a high-priority `donny_nudges` row
- `/settings/billing/upgrade`, dead twice over (no `/upgrade` sub-route either)

### Why the existing guard did not catch it

`isKnownRoute()` (`supabase/functions/donny-orchestrator/routes.ts`) and its client mirror
`isKnownDonnyRoute()` (`src/lib/donnyRoutes.ts`) validate routes **the LLM invents**. They
never see routes hardcoded in source, in agent prompt text, or in nudge action payloads.

A working guard sat directly beside twelve dead links for two months.

### Three role vocabularies, which is how the fix nearly went wrong

- `profiles.role` → `business_client` | `content_creator` | `brand` (what the route helpers expect)
- `fire-campaign-social-hook` `parties[]` → `restaurant` | `brand` | `creator`, **persisted as
  `party_role`**, so it cannot simply be renamed to match
- other tables carry their own values again

Folding `brand` into the business branch sends a brand user to `/dashboard/business/social`,
which sits behind `BusinessRoute` and **redirects them away — a silent failure, not a 404.**

The first fix attempt copied an adjacent existing ternary, believing that was the
conservative choice. That ternary was itself broken for `brand`. **Codex and
`edge-function-reviewer` independently caught it.** A neighbouring line is not a
specification.

### The fix

Role-aware `billingRoute()` / `socialRoute()` in **both** mirrors, plus a local
`partySocialRoute()` in `fire-campaign-social-hook` because its vocabulary genuinely differs.
`routes.test.ts` now asserts every role-route helper's output passes `isKnownRoute`, plus a
regression test pinning the three dead paths as rejected.

**Creators have no billing route.** `/dashboard/{business,brand}/billing` exist; creators get
`/dashboard/creator/earnings`. Whether a creator should ever see an "Upgrade" CTA at all is an
open product question, not just a routing one.

### The deferral lesson

This was found and correctly diagnosed on **2026-06-07**. The spec
`docs/superpowers/specs/2026-06-07-ios-purchase-cta-gating-design.md:51,167` names the exact
fix; the paired plan says *"Do NOT fix the legacy `/settings/billing` route — out of scope."*
It then stayed broken for two months across the whole pre-launch push.

**A dead link on a money path is not "unrelated."**

---

## Part 2 — the Donny-first dashboard, Phase A (#410)

### What shipped

`/dashboard/business` becomes: a greeting, what needs the owner's attention right now, a
prompt box, and three taps. Today's body moves **verbatim** to `/dashboard/business/overview`
and stays reachable. All of it behind `DONNY_FIRST_DASHBOARD_ENABLED`, **default `false`** —
merging changes nothing for users.

The bar was the founder's: *"My 75 year old mom should be able to comfortably use the app as
soon as they log in."*

### The Phase 0 audit, which set the scope

Run before any design, against production:

- **`usePendingActions` → `PendingActionBanners` already produced state-derived proposals** —
  dismissible, capped at 3, with a "+N more" overflow. **The hard part was already built**,
  just buried under a greeting, a hero CTA and a frame.
- **Only four Donny tools verifiably work on prod**: `prepare_campaign`, `find_creators`,
  `web_search`, `read_url`.
- **`social_*` is 0/7** and, when it fails, Donny tells the user their accounts may not be
  connected. Checked one such account: it has an **active** Instagram row. Third separate
  instance of Donny inventing a cause for its own failure.
- **`donny_tool_executions` has zero rows for every consumer sub-agent** — sub-agent failures
  on prod are invisible.
- **No role gating** — `allTools` is identical for all three roles.
- **`donny_nudges` is a notification feed, not a proposal engine** — 33 rows ever, 0 acted on.
  Its `acted_at` is never recorded because `executeAction` fires the UPDATE then immediately
  sets `window.location.href`, cancelling it. **The 0% is an instrumentation failure, not a
  behavioural fact** — it is uninterpretable, not damning.
- **Three of four business stat tiles are hardcoded `'—'`** (Creators, Spend, ROI).

**This is why the body ships three taps and not six.** A tap that produces a shrug is worse
than no tap.

### Architecture

- `BusinessDashboard.tsx` is a thin three-way switch: first-run → flag-off (`BusinessOverview`)
  → flag-on (`DonnyHome`). **First-run is checked first**, so a brand-new owner always gets the
  mission list regardless of the flag.
- `buildDonnyProposals()` (`src/lib/donny/`) is **pure** — it takes already-fetched React Query
  results plus an injected `now`, so its tests need no mocks and cannot flake on a clock.
- `DonnyHome` is the container; `DonnyHomeProposals` and `DonnyHomePrompt` are presentational.
- Taps open the **existing** Donny panel via `openDonnyWithContext()`. `DonnyStage` is
  untouched. **For one release the dashboard launches Donny rather than being Donny** — a trade
  the founder accepted explicitly. Inline chat is Phase B.

### Decisions worth keeping

- **The location-setup blocker is returned separately from the capped list**, not ranked into
  it. It blocks campaign creation, promotions *and* DragonShare; ranked below three pending
  applications it would vanish.
- **Dismissal is keyed per proposal, not per campaign.** The old
  `pendingBannerDismissed_${campaignId}` key was campaign-scoped, so dismissing an "applied"
  prompt also silenced "submitted content" for the same campaign — Donny went quiet about
  delivered work.
- **Two signals, not four.** The "no campaign in 14 days" signal was **cut**: the hook it was
  specified against selects `id, title, status, deadline` — there is no `created_at`. It was
  also a nag rather than an action.
- **`DonnyHome` deliberately does not render `useDonnyQuickChips`** — that hook matches
  `/dashboard/business` exactly and returns a "📊 Campaign stats" chip, precisely the analytics
  claim the audit rules out.
- **Route CTAs are validated through `isKnownDonnyRoute` before render**; one that fails
  renders as text with no button. Direct lesson of #409.

---

## Defects found in review, not in production

Four, and **all four were in code written into the plan**, not by implementers. Every one
survived the spec self-review.

1. **Rating prompts rendered as siblings of the attention frame.** `NeedsAttentionSection`
   exists to consolidate every "needs you" banner into ONE framed list; the page would have
   shown one tidy list plus two orphaned rows. Caught by Task 4's reviewer **two tasks before
   the code that would have exhibited it was written.**
2. **Dismissal state was read only for the capped three proposals.** Dismiss a 4th-ranked item
   yesterday, dismiss a 1st-ranked one today, and the one already waved off walks back on
   screen with its dismissal record sitting unread on disk. Fixed by adding `allProposalIds`
   (full ranked list, pre-filter pre-cap) to the result shape.
3. **Two creators applying to one campaign minted the same proposal id.** `usePendingActions`
   pushes one row each and `PendingAction` carried no row id, so the id collapsed to
   `pending_action:review_application:<same-campaign>` — a React duplicate-key warning, and
   dismissing one silenced the other. **The normal marketplace case, not an edge case.**
   Inherited from `PendingActionBanners`, but the new code asserted the class was solved.
4. **Codex P2 — date-only deadlines compared as instants.** `campaigns.deadline` is a Postgres
   **`date`** (verified against prod `information_schema`, not assumed), so it arrives
   `"YYYY-MM-DD"` and `new Date()` parses it at **UTC midnight**. Comparing that instant
   against a mid-day `now` floors downward in **every** timezone, so the `'due today'` branch
   was unreachable all day. In America/New_York — where the company is — UTC midnight of day D
   is 8pm local on D−1, so tomorrow's deadline *also* read "due today" until it vanished at
   8pm. One of only two signals the feature ships.
   Fixed by normalizing both endpoints to local midnight, **rounding not flooring** — a DST day
   is 23 or 25 hours and a floored 25-hour "tomorrow" reads as "today".

**Eight subagent reviews, an opus whole-branch pass and a spec self-review all missed #4.
Codex caught it on the first look.**

## A correction the session had to make about itself

Every implementer dispatch carried the instruction *"`npm run test` exits 1 because ~103 test
files fail for pre-existing reasons; judge by counts, not the exit code."* Measured from this
worktree: **210 files / 2033 tests / 0 failed.** Fully green.

The stored note was not stale — it is **location-scoped**. Those failures are vitest
mis-collecting Playwright specs under `.claude/worktrees/**`, and a worktree has no nested
worktrees under it to scan. **From a worktree, a red suite means a real regression**, which is
the opposite of what the dispatches said. Repeating "it's always ~103 red" trains everyone to
ignore the one number that would catch a real break.

(Also: `npm run test | tail -N` reports **tail's** exit code, not vitest's.)

## Not verified

- **The both-viewport browser check was never run**, on any task in this branch. Subagents must
  never type credentials, and the change is not deployed — Supabase auth is per-origin, so a
  prod session does not reach a local dev server. Static analysis narrowed it: all four
  `RESTAURANT_TOUR` anchors resolve, and the two `data-tour="brief-generator"` anchors can never
  co-mount because `PageTransition` is a keyed `motion.div` with **no `AnimatePresence`**, so the
  outgoing tree unmounts synchronously. Genuinely unchecked: **the Donny panel actually opening
  on tap, the mobile viewport, and console errors.**
- **The prompt change is not deployable by merging.** Vercel ships the frontend only.
  `donny-orchestrator` needs its own deploy, verified by reading the **deployed source** back
  for the literal string `Never end on a dead end` — not the version number; a version bump
  proved nothing in #402.
- **The prompt rule's effect cannot be verified statically.** It needs one live conversation
  forcing a capability gap, confirming Donny neither invents a page name nor bleeds a guessed
  route into `suggested_actions`.

## Open design question for the founder

The three taps use `AppChip`, whose inactive state is `text-dc-text-muted` — muted grey on
white — because it was built as a **filter** control that must recede behind content. Here it
*is* the content, and every other documented interactive label in the design system is
coloured. An implementer and two reviewers independently flagged that it may read as
*disabled* to exactly the non-tech-savvy user the design targets. Fixed with a call-site
override to `text-dc-teal-btn`; `AppChip` itself untouched, since it is shared with genuine
filter surfaces where muted is correct. **Still wants a look on a real screen.**

## Follow-ups

- Phase B (inline chat) — seven verified hazards in §13 of the design doc, including two that
  would put **two Donnys on one screen**.
- Creator and brand dashboards.
- The plain-language terminology pass — the bigger lever for the Mom Test.
- **Donny's tools, sequenced instrumentation-first**: `donny_tool_executions` must actually
  write before anything else is fixed, because until it does you cannot tell a fix from a
  coincidence. Then the `social_*` tools or their honest removal, then role gating. Not yet
  specced.
- The RAG seed still hardcodes the dead `/settings/*` paths in `page_paths` (8 places); needs a
  gated `donny_knowledge` write.
