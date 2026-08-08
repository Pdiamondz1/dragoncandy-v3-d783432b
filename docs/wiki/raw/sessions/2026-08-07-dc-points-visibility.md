# Session: DC Points visibility, explanation, and Donny knowledge (2026-08-07)

Branch: `feat/dc-points-visibility` (10-task plan, 22 commits, off `origin/main`).
Status at write time: all 10 tasks complete and reviewed clean; full suite green; final
whole-branch review done with one fix wave. **3 migrations applied + verified on prod.
The 2 edge functions (`dre-award-engine`, `donny-orchestrator`) NOT deployed. PR NOT yet
open. Mandatory Codex second review NOT run** — `codex review --base main` hit an OpenAI
usage limit ("try again at Aug 8th, 2026 8:55 AM").

## What prompted it

A business user received an in-app bell — "You earned DC Points / +200 DC Points" — with
no way to learn what earned them, and clicking it went nowhere. Points appeared on two
dashboard pages with no destination behind them. The founder could not answer "what was
that for" either without a SQL query against `dragon_point_events`.

Verified prod state going in: the Dragon Rewards Engine v1 was fully live
(`DRAGON_REWARDS_ENABLED` true, `go_live_at` 2026-06-28, 26 users holding 25,150 points,
25 event types priced in `dre_config.point_values`).

## The central product decision

Ship **honest, earn-only transparency**. Reaching a tier confers a public profile badge
and **nothing else** — no redemption, no perks, no referral loop. The founder chose this
explicitly over designing a perk economy, because promising rewards that do not exist is
the same failure mode [[Honest Analytics]] corrected in the analytics tab two days
earlier. Every surface this branch touches (page copy, chip, notification, Donny's
`rewards_agent`) carries the same "do not convert to money" line so none of them can
drift from it independently.

## What shipped

1. **`/rewards` page** (`src/pages/DcPointsPage.tsx`, route registered in `App.tsx`,
   wraps itself in `DashboardLayout` — routes under `<ProtectedRoute>` get no chrome
   otherwise, caught in pre-flight before Task 1). Shows balance, the gap to the next
   tier stated as a full sentence ("Established needs 500 points and 3 completed
   campaigns"), a human-labeled award history, and the earn catalog rendered live from
   `dre_config.point_values` — so retuning the economy needs no deploy and no doc edit.
2. **`DcPointsChip`** (`src/components/rewards/DcPointsChip.tsx`) — always-visible in
   both top bars (`DashboardLayout`'s desktop header and `MobileTopNav`, which render
   mutually exclusively by viewport, so this is one chip mount, not two). Gates in this
   order: `DRAGON_REWARDS_ENABLED` flag → `profile.role === 'brand'` (brand has no DRE
   triggers, so a brand chip would read a permanent 0) → `isLoading` (renders nothing
   while resolving, so the top bar doesn't jitter). Reuses `useDragonPoints`'s React
   Query cache, so mounting it costs no extra request on pages that already render the
   dashboard card.
3. **`dre_my_standing()`** (migration `20260807120000`) — a caller-scoped
   `SECURITY DEFINER` RPC wrapping the service-role-only `dre_user_aggregates`. Takes
   **no arguments** — identity comes only from `auth.uid()` — and raises
   `forbidden: authentication required` if it's null. Explicit `revoke ... from public,
   anon` + `grant ... to authenticated` (the Supabase default-privilege gotcha this
   codebase has hit before: `ALTER DEFAULT PRIVILEGES` grants `anon`/`authenticated`
   EXECUTE regardless of a bare `revoke from public`).
4. **Two pure, tested modules**, both mirrored across the frontend/edge boundary rather
   than imported across it (house pattern — zero `src/` files import from
   `supabase/functions/`; 4 existing sibling pairs already do this):
   - `src/lib/dragonEvents.ts` / `supabase/functions/_shared/dre-events.ts` —
     event_type → human label, with a parity test asserting the two stay in sync.
     25 entries, not 24 (a pre-existing tally in an unrelated report undercounted by
     one; the shipped code is correct).
   - `src/lib/dragonTierGap.ts` — the next-tier gap calculator, deliberately **trusting
     the cached `standing.tier`** rather than re-deriving it from raw aggregates (see
     "Stale cached tier" below) — mirrors `resolveTier`'s semantics, including that a
     `null avg_rating` FAILS a rating threshold (an untested creator hasn't earned a
     rating-gated tier yet, it hasn't been exempted from one).
5. **The notification names its reason.** `dre-award-engine` now carries `event_type`
   through its award batch into `_shared/dre-notification.ts`'s pure
   `buildAwardNotification(events, tieredUp)`: single event → title
   `"You earned {N} DC Points"`, body is that event's label (e.g. "Completed your
   business profile"); multiple events → body is an **Oxford-comma join** of every
   event's label ("Completed your business profile, Launched your first campaign, and
   Received a 5-star review"); a tier-up appends `" — new standing unlocked"`.
   `actionUrl: '/rewards'` is set on every award. `getNotificationRoute` gained a
   `dragon_points_award` case, which **retroactively fixes bells already sent** without
   an `action_url` (the route falls back to the type-based route when `action_url` is
   absent, and now prefers an explicit `action_url` when present — pinned by a
   corrected test in the final fix wave, since the original test's `action_url` and the
   type-fallback route were identical and could not have caught a regression).
6. **A Donny `rewards_agent` sub-agent**
   (`supabase/functions/donny-orchestrator/agents/rewards.ts`) answering "how many
   points do I have" / "what did I earn that for" / "what do I need for the next tier"
   from the caller's own standing. Every query is `.eq('user_id', userId)` where
   `userId = userContext.user_id` — the orchestrator's Supabase client is service-role
   and bypasses RLS, so an id from the tool's `input` must never scope a query here.
   It deliberately does **NOT** call `dre_my_standing()` — that RPC derives identity
   from `auth.uid()`, which is null under a service-role client, so it would raise on
   every call. It builds the same `DRAGON_TIER_LABELS`/`getDragonEvent` context
   directly from `dre_user_aggregates`, `dragon_point_balances`, `dragon_point_events`,
   and `dre_config`, and its context string carries the same "DC Points do not convert
   to money, credit, or discounts... never promise redemption, referrals, streaks, or
   perks" line as the frontend copy.
7. **Help article rewrite** (migration `20260807120100`) — replaced stale/roadmap
   language with the real 25-entry catalog and real tier thresholds, matching the prod
   seed exactly (a reviewer audited all 25 point values + both tier ladders against
   migration `20260627000000` — zero mismatches). Preserved the screenshot inserted by
   an earlier migration byte-identical (a first attempt would have dropped it — the
   migration replaces `body` wholesale and that screenshot's insert guard
   (`body NOT LIKE '%...png%'`) has already fired once and will never re-fire, so
   losing it here would have been permanent).
8. **An honesty fix to the RAG scope** (migration `20260807120200` +
   `supabase/scripts/sync-wiki-to-donny.mjs`). Two DRE *engineering* wiki docs — a
   29,810-char six-phase spec describing referrals, streaks, "Hype Weeks," and point
   redemption that were **never built** — were reachable by consumer Donny.
   `match_donny_knowledge`'s consumer filter is `scope IS NULL OR scope <> 'internal'`,
   and those two rows had `scope` NULL, so consumer Donny (and, by extension, any user
   who asked it about rewards) could retrieve unbuilt-roadmap content and represent it
   as real. Root cause: `donny-knowledge-sync/index.ts` builds `scope` fresh from the
   sync payload on **every** call, including UPDATEs, and `sync-wiki-to-donny.mjs`
   never set it for these two files. **Fixed in two halves, both necessary**: the
   migration corrects the 4 existing `donny_knowledge` rows for the 2 paths now, and
   `FORCE_INTERNAL` — an unconditional `Set` of exact `"<dir>/<filename>"` strings —
   forces `scope: 'internal'` for those same 2 files on every future sync. Without the
   second half, the committed `post-merge` hook runs `npm run sync:wiki` on this very
   PR's own merge (it touches `docs/` heavily) and would have silently reverted the
   migration within minutes.

## Notable findings along the way (documented, not fixed)

- **A stale cached tier is possible, and it's pre-existing / system-wide, not new to
  this branch.** `dragon_point_balances.tier` is recomputed only when a user earns a
  new ledger event (`dre-award-engine` step 5). `dre_pending_events()` gates
  `creator.five_star` on `rv.rating = 5` exactly — so a 2-star review lowers a
  creator's `avg_rating` without firing any ledger event, and the cached tier outlives
  the rating that earned it. `DragonTierBadge` on public profiles has rendered that
  same cached value since June with no one noticing. `/rewards` and
  `dragonTierGap.ts` deliberately **trust** the cached tier rather than re-deriving it
  from raw aggregates — re-deriving would create a *visible* contradiction between the
  page's gap line and the public badge, trading a quiet inconsistency for a loud one.
  A trust-boundary test (`dragonTierGap.test.ts`) pins this so a future "just re-derive
  it" refactor fails loudly. Filed as a follow-up on the engine itself, not fixed here
  — fixing `dre-award-engine`'s recompute trigger was out of this plan's scope.
- **`business.campaign_launched` pays 150 points on every campaign, not just the
  first.** One prod business has collected it seven times. This was already true and
  undocumented; it is now publicly visible in the earn catalog on `/rewards` and via
  Donny, and was left deliberately unchanged — retuning is a `dre_config` JSONB edit,
  a product decision, not an engineering one.

## Verification

Full suite: 903 tests / 89 files, 0 failures (after merging 6 commits of `origin/main`
mid-branch with a clean, non-overlapping merge). `npm run typecheck` clean, `npm run
lint` 0 errors, `npm run build` OK. `edge-function-reviewer` PASS on
`donny-orchestrator` (bundling path traced from `agents/`, no backtick hazard,
`verify_jwt=true` confirmed live). `data-exposure-reviewer` PASS on Task 8 (all 4
`rewards_agent` queries confirmed scoped to `userContext.user_id`, never request input).
Final whole-branch review traced the end-to-end path, re-checked all 25 point values
against the prod seed, and swept every honest-copy surface (page/chip/builder/tool/help
article) by reading, not regex — one fix wave (commit `fa73588f`) removed a soft
"not available **yet**" roadmap-flavored phrase from the flag-off page copy, added a
fail-loud count assertion to `FORCE_INTERNAL` (proven both ways: throws before any
network call when a backing file is renamed, silent when correct), corrected a vacuous
`getNotificationRoute` test, and fixed two drifted claims in the spec doc.

## Open / next

- Get Codex clean when the OpenAI quota resets (2026-08-08 08:55), open the PR.
- Deploy `dre-award-engine` (`--no-verify-jwt`, mirrors `expire-social-hooks`) and
  `donny-orchestrator` (**without** that flag — it is user-JWT-authenticated).
- Merge, then verify on prod: a real award fires a bell naming its reason and linking
  to `/rewards`; the chip renders in both top bars; Donny answers a DC Points question
  from the asker's own standing only.
- Root-cause follow-up: make `dragon_point_balances.tier` recompute when a rating
  changes, not only when a new ledger event fires (see "stale cached tier" above).
- `FORCE_INTERNAL`'s rename-blind spot: it's keyed on exact filenames, so renaming
  either backing wiki file drops it out silently (the new count-assertion guard turns
  that into a loud sync failure, but a more durable fix — e.g. a `rag_scope: internal`
  frontmatter field — is worth doing later instead of another exact-string entry).
