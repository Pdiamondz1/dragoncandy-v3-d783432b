# Session — Dragon Rewards Engine v1 (Engine + Tiers + Badges)

**Date:** 2026-06-27
**Branch:** `worktree-DC-DRE-AI`
**Spec:** `docs/superpowers/specs/2026-06-27-dre-engine-tiers-badges-design.md`
**Plan:** `docs/superpowers/plans/2026-06-27-dre-engine-tiers-badges.md`
**Parent spec:** `docs/wiki/analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md` (PR #191)

## What this was

The Dragon Rewards Engine (DRE) full spec is a 16-week, 6-phase growth program
(configurable points economy, tiers/badges, daily-boost multipliers, social
share-card referral loop, redemption, admin config panel). It's six independent
subsystems, so it was **decomposed**; this session built the **first sub-project**:
the configurable points ledger + an idempotent award engine + the 5-tier system +
tier-badge display (≈ parent Phases 1–2).

## Why this slice first

DragonCandy is pre-revenue (~30 users, $0 paying). The parent spec tunes thresholds
against *projected* targets that don't exist yet, and its later phases spend real cash
(referral bonuses, equipment grants, subscription credits). This slice is
backend-heavy, **zero cash exposure**, fully reversible, and lays the ledger-first
foundation. The award engine only *consumes events the platform already emits* — it
adds no new event infrastructure.

## Key decisions

- **Award mechanism = cron-invoked edge function** (`dre-award-engine`, every 5 min),
  NOT DB triggers. The trigger→`pg_net`→edge-fn path is known-dead in prod (unset
  `app.settings` GUCs — the campaign-nudge bug). Mirrors the `expire-social-hooks`
  Vault-URL/bearer + `isAuthorizedIngest` + `verify_jwt=false` pattern.
- **Idempotent anti-join reconciler.** A SQL RPC `dre_pending_events()` returns source
  rows that lack a ledger row (`NOT EXISTS` on the `(user_id, event_type, source_id)`
  unique key). The engine awards them, then **recomputes balances from the ledger**
  (sum), never increments — so re-runs are self-healing. Backfill on go-live is free.
- **Config-driven from day one** (`dre_config`): point values + tier thresholds +
  `go_live_at` live in a JSONB table, so retuning needs no deploy. The pure
  `_shared/dre-rules.ts` (`computeAward`, `resolveTier`) reads them.
- **Tier = DP threshold AND a verified activity milestone** (both required — points
  alone never unlock a tier). `legend` is DP-only (the cap).
- **Notifications = in-app bell only, forward-only, coalesced.** One bell per user per
  run via the `create-notification` choke point with `type: 'dragon_points_award'`
  (absent from the email-type map → no email). `go_live_at` seeds to a far-future
  sentinel (`2099-01-01`) so the historical **backfill is silent** until the founder
  sets the real cutover.
- **FK target = `profiles.id`** (consumer feature; every actor has a profiles row) —
  NOT `auth.users.id` (that rule is for internal-only AIOS tables, PR #180).
- **Public tier badge** needs a public read path under the own-row balance RLS → a tiny
  `public_dragon_tiers` view (exposes `user_id, tier` ONLY, never `balance`), mirroring
  the existing `public_*` profile views.

## Shipped (10 code commits + spec/plan)

- `supabase/functions/_shared/dre-rules.ts` (+ `.test.ts`, 8 tests) — pure award/tier.
- `src/lib/dragonTiers.ts` (+ `.test.ts`, 3 tests) — tier presentation (no gray badges).
- `supabase/migrations/20260627000000_dre_engine_schema.sql` — `dre_config`,
  `dragon_point_events` (ledger, unique idempotency key), `dragon_point_balances`
  (materialized cache; `multiplier_applied`/`streak_*`/`total_redeemed` reserved for
  later phases), `public_dragon_tiers` view, `dre_pending_events()` +
  `dre_user_aggregates()` RPCs (SECURITY DEFINER, `service_role`-only), seed config.
- `supabase/migrations/20260627000100_dre_award_cron.sql` — Vault-driven pg_cron.
- `supabase/functions/dre-award-engine/index.ts` (+ `config.toml` `verify_jwt=false`).
- `src/integrations/supabase/types.ts` — surgical add (`dragon_point_balances` +
  `public_dragon_tiers`).
- `src/hooks/useDragonPoints.ts` — `useDragonPoints` (own) + `usePublicDragonTier`.
- `src/components/badges/DragonTierBadge.tsx`,
  `src/components/dragonshare/DragonPointsCard.tsx`.
- DP card on `CreatorDashboard.tsx` + `BusinessDashboard.tsx`; tier badge on
  `PublicCreatorProfile.tsx` + `PublicBusinessProfile.tsx`.

## Gotchas / lessons

- **`campaign_launched` must use `status <> 'draft'`, not `= 'published'`** —
  `campaign_status` is a forward-progressing lifecycle (`verify-campaign-escrow` flips
  launched campaigns to `active`), so `status` holds only the current state; matching
  `='published'` awards ~0 on backfill and misses in-window transitions. (Spec-review
  catch.)
- **`campaign_collaborations` DOES have `completed_at`** (added by a later `ALTER`, not
  the original `CREATE TABLE`); a `CREATE TABLE`-only grep misses it. Creator
  completions source `occurred_at` from `COALESCE(completed_at, updated_at)`; the
  `campaigns` table genuinely has no `completed_at` so the business side uses
  `updated_at`. (Spec-review catch.)
- **Null `occurred_at` would abort the whole batch insert** (`occurred_at` is
  `NOT NULL`) — the engine filters `points_awarded > 0 && r.occurred_at` so one bad
  source row can't stall all awards. (Code-review catch.)
- **False "tier unlocked" for new users** — `priorTier.get(uid)` is `undefined` for a
  user with no balance row; compare against `?? 'egg'`. (Code-review catch.)
- The two RPCs `revoke execute … from public` + `grant … to service_role` (default
  PUBLIC execute would otherwise expose them).

## Reviews

- Claude whole-branch review: no Critical; 1 Important + 2 Minor fixed (committed).
- **Codex second review: clean** ("no discrete, actionable bugs").
- Local: build ✓, typecheck ✓, 11/11 unit tests ✓.

## Founder-run go-live (not automated — touches prod)

Apply both migrations; register Vault `dre_award_engine_url` (+ reuse `aios_ingest_key`);
deploy `dre-award-engine` (`--no-verify-jwt`); **set the real `go_live_at`**; confirm the
cron job; then merge → Lovable deploys the frontend. Then verify prod (both viewports)
and the post-merge hook syncs Donny's RAG.
