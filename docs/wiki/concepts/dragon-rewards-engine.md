---
title: Dragon Rewards Engine (DRE)
type: concept
created: 2026-06-27
updated: 2026-06-27
sources: [2026-06-27-dre-engine-tiers-badges.md]
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
- **Supabase default-privilege gotcha (caught by the live advisor on prod apply):**
  Supabase grants `EXECUTE` to `anon`/`authenticated` via `ALTER DEFAULT PRIVILEGES`, so
  `revoke … from public` does NOT lock down a `SECURITY DEFINER` function — you must
  `revoke … from anon, authenticated` explicitly, or those RPCs (which return cross-user
  data, bypassing RLS) stay callable via `/rest/v1/rpc/…`. Static review (incl. Codex)
  reasons about standard Postgres `PUBLIC` semantics and misses this; run `get_advisors`
  (security) after any `SECURITY DEFINER` function DDL.

## See Also

- [[DragonCandy — Dragon Rewards Engine (DRE) Full System Spec]] — the 6-phase parent.
- [[DragonShare]] — the main event source the engine consumes.
- [[Notification Delivery]] — the bell choke point.
- [[Data Flywheel]] — DRE feeds the moat.
- [[Supabase]] — RLS, pg_cron, Vault patterns reused.
