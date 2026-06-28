# Session — Dragon Rewards UI Launch Gate

- **Date:** 2026-06-28
- **Branch:** `feat/dre-ui-launch-gate` (worktree `DC-Dezzy-AI-2`)
- **Spec:** `docs/superpowers/specs/2026-06-28-dre-ui-launch-gate-design.md`
- **Follows:** the DRE go-live readiness check (`concepts/dragon-rewards-engine.md` §Go-Live Runbook),
  which found the rewards UI was un-gated and already visible to ~24 real users.

## What shipped

A launch gate for the consumer Dragon Rewards display so it stays hidden until the founder launches —
fixing the accidental pre-launch exposure (the DRE `go_live_at` sentinel gates only the notification bell,
not the UI).

- New `useDragonRewardsEnabled()` (single source of the flag name) wrapping the existing fail-safe-off
  `useFeatureFlag('DRAGON_REWARDS_ENABLED')`.
- `return null` guard added inside **`DragonPointsCard`** (creator + business dashboards) and
  **`DragonTierBadge`** (public profiles + the instance inside the card). Covers every render surface
  (verified: only those two components render DRE data, across 4 pages).
- Seed migration adds `DRAGON_REWARDS_ENABLED` **OFF** (idempotent `WHERE NOT EXISTS`), applied to prod.
- jsdom component test: each component renders null when off, content when on.

Engine / ledger / awarding unchanged — only the *display* is gated.

## Key decision — feature flag, not `go_live_at`

The obvious "single switch" (gate the UI on the same `dre_config.go_live_at` the bell uses) **fails the
anon case**: the public profile routes `/creator/:slug` + `/business/:slug` are anon-accessible and render
`DragonTierBadge`, but `dre_config` is **authenticated-read only** — so a `go_live_at` UI gate would hide
badges from logged-out visitors **even post-launch**. `feature_flags` has a **public (anon) SELECT policy**
and the app's `useFeatureFlag` already fail-safes to off, so the flag is anon-safe + the established idiom.
Trade-off: launch is now **two switches** (flag → UI; `go_live_at` → bell), documented together in the
go-live runbook.

## Gotchas

- vitest defaults to the `node` environment here; component tests need a top-of-file
  `// @vitest-environment jsdom` pragma **and** an explicit `import '@testing-library/jest-dom'` (no global
  setup file registers the matchers).
- **Codex P2 caught a stale runbook:** seeding the flag OFF made the existing go-live runbook incomplete
  (it still said "flip only `go_live_at`" → a partial launch). Fixed by updating the runbook to the
  two-switch procedure before the final Codex pass (the "knowledge-sync before final Codex" lesson again).

## Affected files / artifacts

- `src/hooks/useDragonPoints.ts` (`useDragonRewardsEnabled`), `src/components/dragonshare/DragonPointsCard.tsx`,
  `src/components/badges/DragonTierBadge.tsx`, `src/components/dragonshare/dragon-rewards-gate.test.tsx`.
- `supabase/migrations/20260628130000_seed_dragon_rewards_enabled_flag.sql` (applied to prod, OFF).
- `docs/wiki/concepts/dragon-rewards-engine.md` — runbook updated to the two-switch launch + reversible-UI rollback.
- **No** DRE engine / `dre_config` / RLS / edge-fn change; fully reversible (flip the flag).
