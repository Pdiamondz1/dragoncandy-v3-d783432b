# Session — Synthetic metric parity on /internal/simulation (2026-07-26)

Branch: `feat/internal-metrics-real-vs-total` (compounds the 2026-07-25 "real vs total" Overview work on the same branch).

## What shipped

Made the `/internal/simulation` page (the **Synthetic Weight Engine**) mirror the `/internal`
Overview metric card set for the synthetic (bot) cohort, so a founder can compare real vs
synthetic apples-to-apples. This is **sub-project 1 of 4** in a founder ask to make the AIOS
dashboard show the true weight/cost of the app and how it scales. Sub-projects 2 (live infra
telemetry + scaling headroom), 3 (cost model + DAU forecast for 500K/750K/1M), and 4 (a
plain-language stakeholder status layer for non-technical board/investor readers) are scoped and
deferred to their own design cycles.

## Key insight

`aios_platform_stats` already computes every metric twice — real (`WHERE NOT is_synthetic(...)`)
and `*_all` (no filter, added by migration `20260725150000` on this branch). So **synthetic =
`total_all − total`, using the identical counting method** — the two pages reconcile by
construction, with zero new counting logic.

## Changes

- **Migration `20260725150000` (edited in place — still founder-gated, not applied):** added three
  additive `*_all` breakdown maps so synthetic *sub-lines* can be derived — `campaigns.by_status_all`,
  `dragonshare.posts_by_status_all`, `social_connections.by_platform_all`. Purely additive; security
  posture unchanged.
- **`src/lib/internal/platformMetricModel.ts` (new):** pure `deriveCardModel(stats, mode)` +
  `diffBuckets` + `syntheticTotalUsers`. Real mode reproduces the old Overview cards byte-for-byte
  (values + sub-strings via `ofTotal`/`withSub`/platform-join); synthetic mode = all − real per
  metric/bucket. Unit-tested (the real-mode assertions are the parity contract).
- **`src/components/internal/PlatformMetricSections.tsx` (new):** shared renderer used by BOTH pages;
  owns its own loading/error/empty. **Keyed `<Fragment>` per section, not a wrapping `<div>`** — a div
  would make every `SectionHeading` a `:first-child` and collapse `first:mt-0` on all three sections.
- **`InternalOverview.tsx`:** refactored to render the shared component in `mode="real"`
  (behaviour-preserving); keeps its banner, Revenue, and admin AI-spend sections inline.
- **`InternalSimulation.tsx`:** restructured to mirror Overview — kill-switch chip → synthetic count
  sections (shared component) → Revenue (modeled) → AI spend (synthetic) → divider → Simulation
  internals (registry `Bots total`, synthetic messages) → personas → matrix run → load curve. The old
  ad-hoc "Cohort" cards and the bottom duplicate "Modeled revenue" were removed.

## Gotchas / decisions

- **Graceful degradation to the pre-migration RPC.** Two Codex P2s (both fixed) hardened the transient
  deploy window where the frontend is live but the founder-gated migration isn't applied: (1) real mode
  crashed on `u.by_role_all['content_creator']` when `by_role_all` was absent → optional-chained; (2)
  Simulation showed a false "No synthetic cohort active" when `total_all` was absent → now a distinct
  "metrics pending migration" state. Made **all `*_all` fields optional** in `PlatformStats` (they ship
  together from one migration) and guarded every direct `*_all` read in the Overview banner with `?? 0`.
  The model's `ofTotal`/`synthValue` helpers already accept `undefined`.
- **Registry vs mirror.** The mirror's "Total users (synthetic)" = `all − real` *profiles*; the retained
  `Bots total (registry)` = `synthetic_users` rows. Kept both (registry moved to "Simulation internals")
  so any gap (accounts without a profile) is visible rather than hidden.
- **Revenue/AI-spend analogs, not new cards.** The existing Modeled-revenue card (keeps its MODELED
  badge) and the Synthetic-MTD-AI-spend card serve as the synthetic Revenue / AI-spend sections.
- **Repo test convention:** vitest `environment` is `node` globally; component tests opt into jsdom
  per-file via `// @vitest-environment jsdom` + `import "@testing-library/jest-dom"` (not global, despite
  what CLAUDE.md implies).

## Deploy (load-bearing)

Applying migration `20260725150000` at the careful gate is the ship step for BOTH this parity work AND
the 2026-07-25 Overview real-vs-total banner (both need the `*_all` fields in prod). Until applied, both
surfaces show their degraded / "pending migration" states rather than crashing.

## Verification

typecheck ✓ · lint ✓ (0 on touched files) · 16 unit tests ✓ · production build ✓ · Codex clean (2 real
P2s fixed across 4 rounds) · independent Claude spec-review of the plan + final whole-diff review
(approved; 3 Minor consistency findings fixed).
