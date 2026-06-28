# Dragon Rewards UI Launch Gate — Design Spec

- **Date:** 2026-06-28
- **Status:** Draft (for review)
- **Branch/worktree:** `DC-Dezzy-AI-2` (branch `feat/dre-ui-launch-gate`)
- **Context:** the DRE go-live readiness check (`docs/wiki/concepts/dragon-rewards-engine.md` §Go-Live
  Runbook) found that ~24 real users already see Dragon Points + tier badges, because `go_live_at` gates
  only the notification bell — the UI has no gate. This adds the missing UI gate.

## 1. Context & problem

The Dragon Rewards Engine is deployed + cron-live; the silent backfill has populated 24 real users'
balances/tiers. The consumer UI — `DragonPointsCard` (creator + business dashboards) and `DragonTierBadge`
(public profiles + inside the card) — renders those values with **no launch gate**, so an unannounced,
un-launched feature is already visible to real users (and to anonymous visitors on public profiles). We want
the Dragon Rewards display **hidden until the founder deliberately launches**, without touching the engine,
the ledger, or the awarding (which stay running — only the *display* is gated).

## 2. Decision: gate on a DB feature flag (not `go_live_at`)

Two facts (verified read-only against prod) rule out the tempting "single `go_live_at` switch":
- The **public profile routes `/creator/:slug` + `/business/:slug` are anon-accessible** (no auth guard in
  `App.tsx`) and render `DragonTierBadge`.
- **`dre_config` is authenticated-read only** (`dre_config_auth_select`, role `authenticated`). Gating the
  badge on `go_live_at` would hide it from **logged-out** profile visitors **even after launch** — a
  post-launch bug.
- **`feature_flags` has a `public` (anon) SELECT policy** ("Feature flags are viewable by everyone"), and the
  app already has a fail-safe `useFeatureFlag(name)` hook (returns `false`/hidden on any error or missing
  row). Anon-safe + the established idiom (cf. the readiness gate, `BRAND_ROLE_ENABLED`).

So the gate is a feature flag **`DRAGON_REWARDS_ENABLED`** (seeded `is_enabled=false`). Trade-off vs
`go_live_at`: launch is a **two-step** action (flip the flag → reveal UI; set `go_live_at` → enable bells) —
documented together in the go-live runbook. This is the price of anon-safety + idiom consistency.

## 3. Goals / non-goals

**Goals:** with the flag off (default), the entire Dragon Rewards display is invisible to everyone
(authenticated + anon); with it on, behavior is exactly as today. Engine/ledger/awarding unchanged.

**Non-goals:** changing the award engine, `dre_config`, `go_live_at`, or any RLS; per-user/rollout-% gating
(v1 honors `is_enabled` only); an admin preview path (QA on staging or by enabling the flag); coupling the UI
to the bell switch.

## 4. Design

### 4.1 Flag accessor (single source of the flag name)
Add `useDragonRewardsEnabled()` to `src/hooks/useDragonPoints.ts` — a one-line wrapper:
`return useFeatureFlag('DRAGON_REWARDS_ENABLED');`. Keeps the flag-name string in one place and gives a
clear, testable seam. (`useFeatureFlag` is react-query-cached by name, so multiple callers share one read.)

### 4.2 Gate the two render entry points (render nothing when off)
- **`src/components/dragonshare/DragonPointsCard.tsx`** — `const enabled = useDragonRewardsEnabled(); if
  (!enabled) return null;` before the card markup. Covers the DP card on creator + business dashboards.
- **`src/components/badges/DragonTierBadge.tsx`** — same guard, `return null` when off. Covers the badge on
  both public profiles (anon-safe) **and**, redundantly, the instance inside `DragonPointsCard`. The badge
  stays a pure presentational component otherwise (the only added dependency is the flag hook).

No call-site edits needed (dashboards + public profiles import the gated components unchanged). Default
(flag missing/off) → the whole display is hidden; fail-safe-off means an unreadable flag also hides it.

### 4.3 Seed the flag (off)
A migration inserts the flag row **idempotently and disabled**:
```sql
insert into public.feature_flags (name, description, is_enabled)
select 'DRAGON_REWARDS_ENABLED',
       'Gates the consumer Dragon Rewards display (DragonPointsCard + DragonTierBadge). OFF until founder launch.',
       false
where not exists (select 1 from public.feature_flags where name = 'DRAGON_REWARDS_ENABLED');
```
(`WHERE NOT EXISTS` form — idempotent without assuming a unique constraint on `name`.)

### 4.4 Launch (documented in the go-live runbook)
Founder, at launch: (1) `update feature_flags set is_enabled=true, updated_at=now() where
name='DRAGON_REWARDS_ENABLED';` → UI appears; (2) set `dre_config.go_live_at` → bells fire forward. Either
order is safe; the runbook lists both. Rollback for the UI is symmetric (flip the flag off → hidden again),
unlike `go_live_at` notifications.

## 5. Scope of change

- **Create:** `supabase/migrations/<ts>_seed_dragon_rewards_enabled_flag.sql` (the off flag).
- **Edit:** `src/hooks/useDragonPoints.ts` (add `useDragonRewardsEnabled`),
  `src/components/dragonshare/DragonPointsCard.tsx` + `src/components/badges/DragonTierBadge.tsx` (gate).
- **Test:** a component test — each gated component renders `null` when the flag is off and its content when
  on (mock `useFeatureFlag`).
- **Docs:** add the flag-flip step to the DRE go-live runbook (`concepts/dragon-rewards-engine.md`);
  knowledge-sync.
- **None of:** award-engine / `dre_config` / RLS / `go_live_at` change; no new table; no edge-function change.

## 6. Verification

1. `npm run build` (worktree) + `npx vitest run` the new component test (flag off → null; on → renders).
2. Apply the seed to prod via Supabase MCP; confirm
   `select name, is_enabled from feature_flags where name='DRAGON_REWARDS_ENABLED';` → `false`.
3. `codex-review` (`codex review --base origin/main`); fix, re-run until clean.
4. `knowledge-sync`; after merge, post-merge hook syncs the RAG.
5. **verify-prod (best-effort, real UI change):** after the Lovable deploy, confirm a backfilled user's
   public profile no longer shows the tier badge (anonymously) and no console errors; both viewports.

## 7. Risks

- **In the DRE team's component area** — surgical (a guard clause each) + coordinated with their documented
  intent (the "silent backfill" implies hidden-until-launch); flag-off is the safe default. Low conflict risk
  (their PR #196 is merged + stable on main).
- **Flag read latency / flash** — `useFeatureFlag` returns `false` until the query resolves, so the default
  is hidden-then-maybe-show (never show-then-hide). Correct direction (no flash of un-launched UI).
- **Two-switch launch** — mitigated by documenting both steps in the runbook; either order is safe.
- **Fail-safe** — any error reading the flag → hidden. Acceptable (a transient flag-read failure hides a
  not-yet-critical display; it never blocks a core flow).

## 8. Open questions for review

1. Gate inside `DragonTierBadge` (covers all badge uses incl. the card) vs only at the public-profile call
   sites? (Plan: inside the component — DRY, and react-query dedupes the flag read.)
2. Seed the flag row (Plan) vs rely on missing-row=off? (Plan: seed it `false` — explicit + the founder
   flips one boolean instead of inserting a row.)
3. Keep `DragonTierBadge` purely presentational by gating at call sites instead? (Plan: accept the one hook
   dependency inside it — it's the only way to cover anon public profiles without editing each call site, and
   the flag read is cached/fail-safe.)
