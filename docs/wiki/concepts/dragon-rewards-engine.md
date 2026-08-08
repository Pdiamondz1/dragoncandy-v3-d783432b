---
title: Dragon Rewards Engine (DRE)
type: concept
created: 2026-06-27
updated: 2026-08-08
sources: [2026-06-27-dre-engine-tiers-badges.md, 2026-06-28-dre-go-live-runbook.md, 2026-06-28-dre-rename-creator-standing.md, 2026-08-07-dc-points-visibility.md, 2026-08-08-dc-points-discoverability-and-sync-break.md]
tags: [gamification, rewards, growth, edge-functions, rls, cron]
---
# Dragon Rewards Engine (DRE)

DragonCandy's platform-wide **gamification + growth system**: every valuable user
action earns **Dragon Points (DP)**, which drive tiers, badges, and (in later phases)
referrals and redemption. The full vision is a 16-week, 6-phase program (see the parent
spec [[DragonCandy — Dragon Rewards Engine (DRE) Full System Spec]]); it was decomposed
because it is six independent subsystems. **v1 = "Engine + Tiers + Badges"** (≈ parent
Phases 1–2): the configurable points ledger + an idempotent award engine + the 5-tier
system + tier-badge display. Built on branch `worktree-DC-DRE-AI`; founder-run go-live
pending.

## Why this slice first

Pre-revenue (~30 users, $0 paying), and the parent spec tunes thresholds against
*projected* targets while its later phases spend real cash. v1 is backend-heavy, **zero
cash exposure**, fully reversible, and ledger-first — real activity calibrates the rest
before a dollar is spent. It feeds the [[Data Flywheel]] (every gamified action logs to
the ledger).

## Architecture — idempotent anti-join reconciler

The award engine is a **consumer of events the platform already emits** ([[DragonShare]]
posts/boosts, campaign completions/launches, profile completion, ratings) — no new event
infrastructure. It is a cron-invoked edge function, **not a DB trigger** (the
trigger→`pg_net`→edge-fn path is dead in prod — unset `app.settings` GUCs), mirroring the
`expire-social-hooks` Vault-URL/bearer + `isAuthorizedIngest` + `verify_jwt=false`
pattern.

Per run (`dre-award-engine`, every 5 min):
1. Load `dre_config` (`point_values`, `tier_thresholds`, `go_live_at`).
2. `dre_pending_events()` — a SQL RPC returning source rows that lack a ledger row
   (`NOT EXISTS` on the `(user_id, event_type, source_id)` unique key; "first-X" via
   `GROUP BY … HAVING NOT EXISTS`; milestones via `array_agg(... order by ...)[N]` for the
   Nth-completion timestamp).
3. Award DP via the pure `_shared/dre-rules.ts` `computeAward` (config × 1.0 in v1).
4. Idempotent insert (`upsert … ignoreDuplicates`; `.select()` returns only NEW rows).
5. Recompute each affected user's balance + tier (`dre_user_aggregates()` +
   `resolveTier`) — **balances are summed from the ledger, never incremented**, so
   re-runs are self-healing.
6. Fire one coalesced **in-app bell** for forward awards (see Notifications).

## Configurable from day one

Everything tunable lives in `dre_config` (JSONB): `point_values` (keyed `<role>.<event>`),
`tier_thresholds` (per role), and `go_live_at` — so retuning the economy needs no deploy
(the parent spec's core differentiator, built in early to avoid rework). The pure
`dre-rules.ts` reads config; the engine just orchestrates.

## Tiers

> **Display naming — "Creator standing" (2026-06-28).** The user-facing labels were renamed to read
> mature for an older/professional audience: the currency **"Dragon Points" → "Reputation" (Rep)**, and the
> tier ladder **Egg→Rising · Scout→Established · Knight→Pro · Master→Elite · Legend→Icon** (fantasy emojis
> dropped). This is **display-only** (`src/lib/dragonTiers.ts` labels + `DragonPointsCard`/`DragonTierBadge`
> copy + the `dre-award-engine` award-notification copy); the **keys** (`egg/scout/knight/master/legend`),
> the `dragon_point_*` tables/columns, the `dragon_points_award` notification type, and the `DP` internal
> term are **unchanged** (no migration). The keys below refer to the internal identifiers.

5 tiers (Egg → Scout → Knight → Master → Legend). A tier requires **both** a DP threshold
**and** a verified activity milestone (campaigns completed, + creator avg rating) — points
alone never unlock a tier. `legend` is DP-only (the cap). Presentation
(`src/lib/dragonTiers.ts`) uses brand-adjacent colors, **never gray** (DESIGN_SYSTEM).

## Notifications — in-app only, forward-only, coalesced

One bell per user per run through the [[Notification Delivery]] choke point
(`create-notification`), `type: 'dragon_points_award'` — absent from the email-type map,
so **no email**. `go_live_at` seeds to a far-future sentinel (`2099-01-01`) so the
historical **backfill is silent**; the founder sets the real cutover at go-live to enable
forward bells.

## DC Points visibility (2026-08-07)

v1 built the ledger, the tiers, and the badge but never gave a user anywhere to go: a
bell said "+200 DC Points" and clicking it went nowhere, points showed on two
dashboards with no explanation behind them, and even the founder needed a SQL query
against `dragon_point_events` to answer "what was that for." Branch
`feat/dc-points-visibility` (10 tasks, 22 commits) closed that gap as **honest,
earn-only transparency** — reaching a tier confers a public profile badge and
**nothing else**, the same stance [[Honest Analytics]] took on the analytics tab two
days earlier, chosen explicitly over designing a perk economy the platform doesn't
have.

- **`/rewards` page** — balance, the gap to the next tier stated as a full sentence
  ("Established needs 500 points and 3 completed campaigns"), human-labeled award
  history, and the earn catalog rendered **live from `dre_config.point_values`** so
  retuning the economy needs no deploy and no doc edit.
- **`DcPointsChip`** — always-visible in both top bars (`DashboardLayout` desktop
  header + `MobileTopNav`, mutually exclusive by viewport). Gates: launch flag → brand
  role (brand has no DRE triggers, so its chip would read a permanent 0) → loading
  (renders nothing so the bar doesn't jitter).
- **`dre_my_standing()`** (migration `20260807120000`) — a caller-scoped
  `SECURITY DEFINER` RPC wrapping the service-role-only `dre_user_aggregates`, taking
  **no arguments**; identity comes only from `auth.uid()`, raising if it's null.
  Explicit `revoke ... from public, anon` + `grant ... to authenticated` (the
  Supabase default-privilege gotcha this page already documents below).
- **The bell now names its reason.** `dre-award-engine` carries `event_type` through
  into `_shared/dre-notification.ts`'s `buildAwardNotification(events, tieredUp)`:
  one event → the event's label as the body; multiple → an Oxford-comma join of every
  label; a tier-up appends `" — new standing unlocked"`. Every award sets
  `actionUrl: '/rewards'`, and `getNotificationRoute` gained a `dragon_points_award`
  case that retroactively fixes bells already sent without one.
- **A Donny `rewards_agent`** answers "how many points do I have" / "what did I earn
  that for" / "what do I need for the next tier" strictly from `userContext.user_id`
  — never from tool `input`, since the orchestrator's client is service-role and
  bypasses RLS. It deliberately does **not** call `dre_my_standing()`: that RPC
  derives identity from `auth.uid()`, which is null under a service-role client, so it
  builds the same context directly from `dre_user_aggregates` /
  `dragon_point_balances` / `dragon_point_events` / `dre_config`. Its context string
  carries the same "do not convert to money... never promise redemption, referrals,
  streaks, or perks" line the frontend copy carries, so the two surfaces can't drift
  apart on the honesty stance.
- **Two mirrored pure modules**, not imported across the frontend/edge boundary
  (house pattern — see [[Musk's Algorithm]] applied as "no cross-boundary imports"):
  `src/lib/dragonEvents.ts` / `supabase/functions/_shared/dre-events.ts`
  (event_type → human label, 25 entries, parity-tested) and
  `src/lib/dragonTierGap.ts` (next-tier gap; mirrors `resolveTier`, including that a
  `null avg_rating` FAILS a rating threshold rather than being exempted from one).
- **RAG honesty fix** — two DRE *engineering* wiki docs (a six-phase spec describing
  never-built referrals/streaks/"Hype Weeks"/redemption) were reachable by consumer
  Donny via a `NULL` `scope` column on `donny_knowledge`, so a user asking Donny about
  rewards could get unbuilt-roadmap content back as if it were real. See "RAG scope
  leak" under Known Issues.

**State: SHIPPED AND LIVE (updated 2026-08-08).** Superseding the 2026-08-07 "not yet
deployed / PR not open / Codex not run" snapshot this paragraph used to carry. #378 merged
(`859e8b25`); 3 migrations applied and verified; both edge functions deployed and
boot-checked against `list_edge_functions` with **different flags** —
`dre-award-engine` v9 (`verify_jwt=false`, cron-invoked) and `donny-orchestrator` v74
(`verify_jwt=true`, consumer surface). Prod-verified desktop: balance **4,300 / Rising**,
tier gap as a sentence, labeled history, 0 console errors. Mobile viewport unverified —
`resize_window` leaves `innerWidth` at desktop, so it is a false pass; real emulation
needs CDP `setDeviceMetricsOverride`.

**Codex took 3 rounds, and two of them were the same bug.** Round 1: `/rewards` reachable by
a brand account. Round 2: the identical defect one layer down in
`donny-orchestrator/agents/rewards.ts`, where
`agg?.role === "content_creator" ? "creator." : "business."` handed a brand user the entire
business earn catalog **through generated prose** — a place no UI review can see. One root
cause behind both: a two-way fallback silently absorbing a third role. Brand has no DRE
triggers, so the honest answer is "nothing to earn here," not a catalog. **A `? :` fallback
on a role enum should name every branch it intends to serve.**

## Discoverability follow-up (2026-08-08, PR #398)

Founder report minutes after #378 shipped: *"On the dashboard the DC points section is not
clickable and there's no page for it in the navigation panel."* Both real — #378 built the
page, chip, notification and Donny agent but left the two dashboard cards inert. **A balance
with nowhere to click is the same dead end as the "+200 DC Points" bell that started this
whole thread**; it had just moved one screen over.

- `DragonPointsCard` is now a `Link` to `/rewards`. Business and creator dashboards share the
  component, so one change closed the "points on two dashboards with no explanation" half of
  the original complaint.
- "DC Points" added to the business + creator **sidebar nav** and **drawer menu** (not the
  mobile bottom nav — 5 slots, full). Brand excluded: the **5th** place that decision is
  written down, now with a test asserting it.
- **Two gates, not one.** Role lives in the static nav arrays; the `DRAGON_REWARDS_ENABLED`
  launch flag is a hook, so it is applied at both render sites via `withDcPointsGate()`.
  Without the second gate, turning the flag off would leave a nav entry pointing at a page
  rendering "DC Points are not available." — recreating the dead end being fixed.

Prod-verified: three routes to `/rewards` (sidebar item, chip `aria-label="4,300 DC Points"`,
card `aria-label="View your DC Points"`), 0 console errors on a cold load.

## Key Decisions

- **FK `profiles.id`, not `auth.users.id`** — DRE is a consumer feature; the `auth.users`
  rule is only for internal-only AIOS tables (see [[Internal-Only AIOS Users]]).
- **`public_dragon_tiers` view** exposes `user_id, tier` ONLY (never `balance`) so the
  tier badge renders on public profiles under the own-row `dragon_point_balances` RLS —
  mirrors the existing `public_*` profile views.
- **Reserved columns** (`multiplier_applied`, `streak_*`, `total_redeemed`) ship defaulted
  so Phase 3 (daily-boost multipliers, streaks) and Phase 5 (redemption) need no migration.

## Known Issues / deferred

- Deferred to later phases: referrals + share-card/UTM viral loop (no referral infra
  yet), daily boosts/Hype Weeks, streak *awards*, redemption + leaderboards, brand-role
  triggers (brand role is feature-flag-hidden), the no-code admin config UI.
- `campaign_launched` uses `status <> 'draft'` (ever-left-draft), not `= 'published'`
  (`campaign_status` progresses past `published`). Creator-completion `occurred_at` uses
  `COALESCE(completed_at, updated_at)`; the `campaigns` table has no `completed_at`.
  **Confirmed still true and now user-visible (2026-08-07):** `business.campaign_launched`
  pays 150 points on **every** campaign launch, not just the first — one prod business
  has collected it 7 times. The earn catalog on `/rewards` and Donny's `rewards_agent`
  now surface this publicly. Left unchanged deliberately; retuning is a `dre_config`
  JSONB edit, a product decision rather than a bug fix.
- **Stale cached tier (found 2026-08-07, pre-existing and system-wide, not fixed).**
  `dragon_point_balances.tier` is recomputed only when a user earns a new ledger event
  (`dre-award-engine` step 5); `dre_pending_events()` gates `creator.five_star` on
  `rv.rating = 5` exactly, so a sub-5-star review lowers a creator's `avg_rating`
  without firing any event — the cached tier outlives the rating that earned it.
  `DragonTierBadge` on public profiles has rendered that same cached value since June.
  `/rewards`'s tier-gap calculator (`dragonTierGap.ts`) deliberately **trusts** the
  cached tier rather than re-deriving it — re-deriving would create a *visible*
  contradiction with the public badge on the same cached data, trading a quiet
  inconsistency for a loud one — pinned by a trust-boundary test. Root-cause fix
  (recompute `tier` on rating change, not only on a new ledger event) is filed as a
  follow-up against `dre-award-engine`, out of scope for a UI-visibility branch.
- **RAG scope leak (found + fixed 2026-08-07).** Two DRE *engineering* wiki docs —
  including a 29,810-char six-phase spec describing referrals, streaks, "Hype Weeks,"
  and redemption that were **never built** — carried `scope` NULL in `donny_knowledge`,
  and `match_donny_knowledge`'s consumer filter (`scope IS NULL OR scope <> 'internal'`)
  treats NULL as consumer-visible. So a user asking consumer Donny about DC Points
  could retrieve unbuilt-roadmap content and get it back as if it were real — the exact
  failure mode this branch's honesty stance exists to avoid, just via the knowledge
  layer instead of the UI. Root cause: `donny-knowledge-sync/index.ts` rebuilds `scope`
  from the sync payload on **every** call including updates, so a one-off
  `UPDATE donny_knowledge SET scope='internal'` (migration `20260807120200`) would have
  been silently reverted by the committed `post-merge` hook's `npm run sync:wiki` the
  moment this PR (which touches `docs/` heavily) merged. Fixed in both halves: the
  migration corrects the rows now, and `FORCE_INTERNAL` in
  `supabase/scripts/sync-wiki-to-donny.mjs` — an unconditional `Set` of exact
  `"<dir>/<filename>"` strings, with a fail-loud count-assertion guard added in the
  final fix wave — forces `scope: 'internal'` for those 2 files on every future sync.
  **Structural gap, not closed:** `FORCE_INTERNAL` is filename-keyed, so renaming
  either backing file drops it out of the set; the guard turns that into a loud sync
  failure rather than a silent one, but a more durable fix (e.g. a `rag_scope: internal`
  frontmatter field on the wiki page itself) is still worth doing. See
  [[Self-Improving App]], whose Known Issues previously claimed internal-scoped rows
  stay invisible to consumer Donny "on every path" — true for the `sync-internal-docs.mjs`
  strategy-library path that claim was verified against, not for this consumer
  `sync-wiki-to-donny.mjs` path, which this incident is the counterexample to.
- **Supabase default-privilege gotcha (caught by the live advisor on prod apply):**
  Supabase grants `EXECUTE` to `anon`/`authenticated` via `ALTER DEFAULT PRIVILEGES`, so
  `revoke … from public` does NOT lock down a `SECURITY DEFINER` function — you must
  `revoke … from anon, authenticated` explicitly, or those RPCs (which return cross-user
  data, bypassing RLS) stay callable via `/rest/v1/rpc/…`. Static review (incl. Codex)
  reasons about standard Postgres `PUBLIC` semantics and misses this; run `get_advisors`
  (security) after any `SECURITY DEFINER` function DDL.

## Go-Live Runbook & Readiness Check (2026-06-28)

A read-only prod probe + engine-code read, prepared for the founder's launch decision.
**This is a founder business decision, not an engineering deploy** — the engine is fully
deployed and running; "go-live" only flips a config value.

### Readiness snapshot (prod `zocahiffooqdybdhguqv`)
- `dre-award-engine` deployed (v1, ACTIVE); cron **jobid 7 live** (`*/5 * * * *`).
- **The silent backfill already ran:** `dragon_point_events` = **98 rows**,
  `dragon_point_balances` = **24 users** (points + tiers computed), `dre_pending_events()`
  = **0** (caught up). Idempotent + ledger-summed, so the cron self-heals each run.
- `dre_config.go_live_at` = `2099-01-01T00:00:00Z` (the sentinel — unchanged).

### What `go_live_at` actually gates (read before flipping)
Awards are inserted **unconditionally** every run (`dre-award-engine` step 3). `go_live_at`
is used at **only one place** — step 6, line ~94 — to suppress the in-app bell for awards
whose `occurred_at` predates it. So:
- **Points / tiers / badges are already computed.** They are *displayed* by `DragonPointsCard`
  (dashboards) + `DragonTierBadge` (public profiles), now **gated behind the
  `DRAGON_REWARDS_ENABLED` feature flag** (added 2026-06-28, seeded **OFF**) — so the display is
  **hidden until you flip that flag** (it was ungated at the readiness probe; see the ⚠️ note).
  The ledger keeps accruing regardless.
- Flipping `go_live_at` does **not** reveal the UI (the **flag** does) — it **only turns on
  forward-going award notifications**. So go-live is **two switches** (see Runbook).

### ⚠️ Readiness flag — resolved by the UI gate
The readiness probe found the ~24 backfilled users could **already see** their Dragon Points +
tier badge with no announcement, because `go_live_at` gates only the bell and the UI had **no
gate**. **This is now fixed:** the display is gated behind **`DRAGON_REWARDS_ENABLED`** (seeded
**OFF**), so the points/tiers UI is hidden for everyone — authenticated *and* anonymous
(`feature_flags` has a public read; `dre_config` does not, which is why the flag, not
`go_live_at`, gates the UI) — until you launch. Spec:
`docs/superpowers/specs/2026-06-28-dre-ui-launch-gate-design.md`.

### Flip = launch the announcement (what happens)
Setting `go_live_at` to a real cutover (usually "now") means the next cron run fires one
coalesced in-app bell (`type:'dragon_points_award'`, no email) per user for any award with
`occurred_at >= go_live_at` — i.e. **forward activity only**. The 98 already-backfilled
events stay silent (their `occurred_at` < cutover) — the intended "no retroactive spam".

### Runbook (founder, when launching Dragon Rewards is a business "go") — TWO switches
1. **Pre-flight (read-only):** `select count(*) from dre_pending_events();` ≈ 0 (caught up);
   spot-check a few `dragon_point_balances` rows' `balance`/`tier` against the `dre_config`
   `tier_thresholds`; decide the cutover timestamp (usually now).
2. **Reveal the UI (feature flag — no deploy, anon-safe):**
   `update feature_flags set is_enabled = true, updated_at = now() where name = 'DRAGON_REWARDS_ENABLED';`
   → `DragonPointsCard` + `DragonTierBadge` appear.
3. **Enable the bell (`dre_config`, admin-gated write):**
   `update dre_config set config_value = to_jsonb('<ISO-cutover>'::text), updated_at = now()
   where config_key = 'go_live_at';` → forward awards notify.
   (Either order is safe; do both as one coordinated launch — one switch without the other =
   a partial launch: flag-only = visible but silent; go_live-only = notified but UI hidden.)
4. **Verify (within ~5 min, the cron cadence):** perform/seed one forward qualifying action,
   then confirm a new `dragon_point_events` row AND a `dragon_points_award` notification landed,
   and the UI now shows for a backfilled user.
5. **Watch:** the cron is idempotent (anti-join + summed balances) — no manual re-runs.

### Rollback — partial (know before flipping)
- **UI: fully reversible** — set `DRAGON_REWARDS_ENABLED` back to `false` and the display hides
  again immediately (the gate added 2026-06-28).
- **Bells: not reversible** — setting `go_live_at` back to a future date **stops future** bells
  but does NOT un-send already-fired notifications or un-award points (balances are summed from
  the persistent ledger by design). So treat the **bell** flip as effectively irreversible; the
  UI flag is safe to toggle.

## See Also

- [[DragonCandy — Dragon Rewards Engine (DRE) Full System Spec]] — the 6-phase parent.
- [[DragonShare]] — the main event source the engine consumes.
- [[Notification Delivery]] — the bell choke point.
- [[Data Flywheel]] — DRE feeds the moat.
- [[Supabase]] — RLS, pg_cron, Vault patterns reused.
- [[Honest Analytics]] — the same "a claim may not outrun its evidence" stance the
  2026-08-07 visibility work applied to points/tiers/perks.
- [[Self-Improving App]] — owns the `donny_knowledge` scope mechanism the 2026-08-07
  RAG leak was found in.
