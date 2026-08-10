# Donny-first creator dashboard (Phase 3)

**Date:** 2026-08-10
**Branch:** `worktree-dc-donny-1st-creators` (base `6df77138`)
**Scope:** creator role only, frontend only. No migration, no RLS change, no edge-function deploy.

## What shipped

`/dashboard/creator` becomes the Donny-first body the business role already ships (#423, #426,
#428, #429): greeting, attention list, prompt box, two taps. The old body is preserved **verbatim**
at a new `/dashboard/creator/overview`, mirroring how #411 extracted `BusinessOverview`.

The shared pieces were made genuinely role-generic — a third role supplies its own hooks, builder
and copy and edits none of them:

- `useDonnyHomeConversation` — conversation state
- `DonnyHomeShell` — layout, holds no state
- `useDonnyHomeInteractions` — dismissal state, the two-pass proposal build, view tracking, four
  handlers (extracted during `/simplify`; both containers had byte-identical copies)

## The prod audit overturned three assumptions before any code was written

1. **All 17 "pending" invitations on prod are expired by `expires_at`** — yet every one points at a
   still-`published` campaign with no application, and `useCreateApplication` ignores expiry. Gating
   the nudge on a column that does not gate the underlying action would have hidden live
   opportunities. The hook deliberately does **not** filter on `expires_at`.
2. **Only two of Donny's taps are creator-real.** `rewards_agent` returns real standing.
   `billing_agent` reads `organizations` and would hand a creator the **restaurant** subscription
   catalog. **No** agent can answer "find work" — `find_creators` returns creators, `campaign_agent`
   returns only campaigns the creator is already in. Shipped two taps; find-work and get-paid became
   route-based attention items.
3. **18 creator profiles but only 15 `creator_profiles` rows** — hence `.maybeSingle()` everywhere a
   per-user row is read.

## Durable findings

### `donny_tool_executions` cannot prove a sub-agent tap — for ANY role

Its insert sits inside the `isSocialTool(toolName) && mcpBridge` branch of
`donny-orchestrator/index.ts`. So no sub-agent has **ever** been logged, for any role — including
the two taps the business dashboard already shipped. Anything that reasons "zero rows ⇒ never
worked" from that table is reasoning from an instrument that was never wired to the thing being
measured. Taps must be proven at the data layer, or by a real signed-in interaction.

This corrects a claim in `PROJECT_CONTEXT.md`.

### `billing_agent` is wrong for creators — a live defect, routed around rather than fixed

It resolves subscription context through `organizations`, which a creator does not have. A creator
asking about money would be shown the restaurant catalog and an "Upgrade to Starter" CTA. This phase
avoided routing creators to it; it is still live for anyone who reaches it another way.

### `stripe_onboarding_complete` now has two disagreeing readers in the frontend

- `useCreatorPayoutState` reads the column directly (correct for this surface — the alternative puts
  a Stripe round-trip on the path gating first paint).
- `useTransactionReadiness` → `check-creator-payout-status` re-verifies against live Stripe and
  **self-heals** the column.

The column goes stale-**false** (#173 — the webhook never delivers). The resolution was **copy, not
plumbing**: every payout row that can meet an already-onboarded creator is worded to be true in both
worlds — *"Check your payout setup so you can get paid"*, never *"you aren't set up"*. Only the
never-started branch, where `stripe_account_id` is null and there is nothing to be stale about, says
"set up". A false "you aren't set up" on the page's top row is the #357 false-"verify your email"
class.

### One number cannot answer two questions

`collaborationCount` was a lifetime count used both to rank payout ("has this creator ever worked or
earned" — correct) and to gate "nothing on your plate" ("is anything in flight" — wrong). On prod
**11 of 16 collaborations are already `completed`**, so a creator who simply finished their last
campaign counted as busy, the find-work nudge never fired, and an onboarded creator in that state
rendered **zero rows** in the flagship attention region — indistinguishable from a bug.

Split into `collaborationCount` (lifetime work/earnings) and `activeCollaborationCount` (in flight).
Codex then found the lifetime count still included **`cancelled`**, which is not evidence of
earnings — so a creator whose only collaboration fell through got "set up payouts" ranked above
"find your next campaign", which is configuration before value (`PROJECT_CONTEXT` §7). Now an
allowlist: `.in('status', ['active','completed'])`, `collaboration_status` verified via `pg_enum` as
exactly `active | completed | cancelled`.

**A gate must be about the same thing as the claim it licenses.**

### Writing the test found the half the review had not named

Fixing the count exposed a second defect: the `merged` array branched on `hasMoneyOrWork` into two
hand-written lists, and the money-first list **omitted the find-work item entirely** — so it was
unreachable for anyone who had ever worked, independent of the count. The body is now written once
and `hasMoneyOrWork` decides only which **end** the payout row sits at, so no branch can silently
drop an item again.

### A safeguard resting on "in practice X never happens" is not a safeguard

Spec §4.6 dismissed the zero-size tour-anchor hazard because "item E guarantees every creator has at
least one row, so it is never empty". That was false — and it was the load-bearing reason the hazard
was left alone. Codex then found the hazard live: `NeedsAttentionSection` hides itself with CSS
`:has()`, so the `data-tour` wrapper survives at **full width and zero height**, and `DCTour`
spotlit it — a ~16px hole punched in the dim layer with an arrow pointing at blank page.

Fixed at the **mechanism**, not per page: `DCTour` now treats a zero-size target as absent, which
its own absent-target path already degrades honestly (centred popover, no cutout). All three roles
can hit this. The first guard used `width > 0 || height > 0` and still spotlit the wrapper — only
its *height* collapses — and the new test caught it. First `DCTour` tests in the codebase.

### `useTour` is role-keyed and has no page awareness

Both `CreatorDonnyHome` and `CreatorOverview` render a `TourButton`, so a creator can start the same
tour from either page and **every step must resolve on both**. That is why the business role
duplicated `data-tour="brief-generator"` onto `BusinessOverview.tsx`. Now enforced by
`creatorTourAnchors.test.tsx`, because the invariant rotting silently is exactly how the creator
tour broke.

That test also carries its own lesson: the first version asserted the anchor's `childElementCount >
0`, which is **unfalsifiable** — `DonnyHomeProposals`' `!children` early return is dead code for
this container (`RatingPromptManager` is always passed and a React element is always truthy), so the
section renders and counts as one child even when CSS-hidden and empty. It would have passed in
exactly the case it was written to catch. **Count the thing the user sees, not the container that
holds it** — and prove an assertion falsifiable rather than assuming it.

## Process notes

- Two implementer subagents wrote correct code, then stalled indefinitely waiting on their own
  background typecheck/build/vitest jobs and never reported — one of them twice, including after an
  explicit "run in the foreground" instruction. Recovery that worked: the controller verifies in the
  foreground, commits with the brief's exact message, writes the report with a provenance header,
  and dispatches the reviewer normally.
- Five independent review passes each caught something the others missed, and **two of the last
  three findings were errors in the fixes rather than in the original work** — the argument for the
  loop over a single pass.

## Verification

typecheck clean · lint 0 errors · build clean · **241 test files / 2406 tests passing**.

`DonnyHome.test.tsx` reports **37 passed with the file untouched by the entire branch diff** — the
proof that the extraction and the later refactor are a move, not a rewrite, and that the live
business dashboard is behaviourally unchanged.

**Not yet done:** both-viewport `verify-prod` (including the first live exercise of the two taps,
which `donny_tool_executions` can never confirm), and the Donny RAG sync after merge.

## Open exposure

`DONNY_FIRST_DASHBOARD_ENABLED` is already `true` and both roles share it by documented choice, so
**merging is the creator launch** — there is no switch that disables the creator surface while
leaving the founder-verified business dashboard on. Rollback is a code revert taking both.
