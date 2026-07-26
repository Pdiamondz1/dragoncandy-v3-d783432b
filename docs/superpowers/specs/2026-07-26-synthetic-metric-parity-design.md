# Synthetic Metric Parity — /internal/simulation mirrors the Overview card set

**Date:** 2026-07-26
**Branch:** `feat/internal-metrics-real-vs-total`
**Status:** Design — approved, pending spec review
**Author:** Claude (brainstormed with Dame)

## Context

This is **sub-project 1 of 3** in a founder request to make the `/internal` (AIOS)
dashboard tell the true weight and cost of the app. The other two —
**(2) live infra telemetry + scaling headroom** and **(3) cost model + DAU forecast
(500K/750K/1M)** — are deferred to their own design cycles and are out of scope here.

The founder wants the **simulated-user (bot) metrics to display the same metrics as
the real-user ones.** Today the two surfaces disagree in *shape*:

- **Overview** (`src/pages/internal/InternalOverview.tsx`) shows real-user counts in
  three count sections — *Users & businesses*, *Activity*, *Content* — plus *Revenue*
  and an admin *AI spend* section. On this branch it already gained a real-vs-total
  treatment: each card shows an "of N incl. synthetic" sub and a "synthetic active"
  banner when bots exist.
- **Simulation / Synthetic Weight Engine** (`src/pages/internal/InternalSimulation.tsx`)
  shows the bot cohort in an *ad-hoc* shape: a *Cohort* block (bots total, synthetic
  campaigns, synthetic messages, synthetic MTD AI spend), *Bots by persona*, a *Matrix
  run* summary, a *Load curve*, and a *Modeled revenue* card.

The two can't be compared side-by-side because the card sets differ.

## Goal

Restructure the Simulation page so its **top mirrors the Overview 1:1** — the identical
three count sections, valued with the **synthetic** cohort — then keep the genuinely
simulation-only widgets below a divider. Flipping between the two tabs should show
matching layouts, one real and one synthetic.

## Non-goals (YAGNI)

- **No new page, no real/synthetic toggle on Overview.** The Simulation page stays the
  one surface that intentionally shows synthetic data; Overview stays real-only.
- **No new RPC and no second migration.** We reuse `aios_platform_stats` and extend the
  migration already on this branch.
- **No synthetic "Revenue (real money)" card.** Bots move no real money (Stripe is in
  test mode); the existing **Modeled revenue** card is the correct synthetic analog.
- **Sub-projects 2 and 3 are not touched.** No live RAM/CPU/latency/connections, no
  scaling forecast here.

## Key insight — synthetic = all − real, for free

`aios_platform_stats` (migration
`supabase/migrations/20260725150000_aios_platform_stats_totals.sql`, **on this branch,
not yet applied to prod**) already computes every metric twice:

- `total` — real, `WHERE NOT is_synthetic(...)`
- `total_all` — everything, no filter

So **synthetic = `total_all − total`, using the identical counting method** — the
synthetic numbers reconcile with Overview by construction, with zero new counting logic.

## Design

### 1. Data — three additive keys on the existing (unapplied) migration

The RPC already returns real + `*_all` for every headline count, plus `locations_all`,
`by_role_all`, and `boosts_total_all`. To reach **full sub-detail parity** (synthetic
cards carrying the same sub-lines Overview shows), we need three more `*_all` breakdown
maps. Fold them into the **same** not-yet-applied migration
`20260725150000_aios_platform_stats_totals.sql` (edit in place — it hasn't shipped, so
no second migration is created):

| New key | Section | Purpose (synthetic sub = `all[k] − real[k]`) |
|---|---|---|
| `campaigns.by_status_all` | Activity | synthetic "N active" |
| `dragonshare.posts_by_status_all` | Activity | synthetic "N verified" |
| `social_connections.by_platform_all` | Content/Activity | synthetic "by platform" |

Each is purely additive — same `create or replace`, same `jsonb_object_agg` pattern as
the existing real breakdowns but without the `WHERE NOT is_synthetic` filter. The
migration's security posture (STABLE SECURITY DEFINER, `search_path=public`,
`auth.uid()` + `is_internal_user()` guard) is unchanged; the values are aggregate
COUNTS only. Extend the in-file VERIFICATION comment to assert the three new `*_all`
keys are present and `>=` their real counterparts.

`boosts_total_all` and `locations_all` already exist, so Restaurants→locations and
DragonShare→boosts need nothing new. Promotions has no Overview sub-line, so it needs no
breakdown map.

Update the `PlatformStats` TypeScript interface in
`src/hooks/internal/usePlatformStats.ts` to add the three optional `*_all` maps
(`by_status_all?`, `posts_by_status_all?`, `by_platform_all?`). Optional-typed so the
frontend degrades gracefully if the RPC is a version behind.

### 2. Shared rendering — one card set, two populations

Extract the three count sections into a reusable presentational component so the two
pages **cannot drift**:

- **`deriveCardModel(stats: PlatformStats, mode: 'real' | 'synthetic'): Section[]`** — a
  pure function (new file, e.g. `src/lib/internal/platformMetricModel.ts`) returning the
  section→cards model. In `'real'` mode each card's value is `total` and its sub matches
  Overview's current output (existing breakdown sub **plus** the "of N incl. synthetic"
  sub). In `'synthetic'` mode each value is `total_all − total` and each sub is the
  breakdown diff (`all[k] − real[k]`); the "of N incl. synthetic" affordance is
  real-mode-only and is omitted. A small `diffBuckets(all, real)` helper computes
  per-key differences with clamping (never negative) and handles keys present in `all`
  but not `real`.
- **`<PlatformMetricSections stats mode />`** — new component (e.g.
  `src/components/internal/PlatformMetricSections.tsx`) that renders the model with the
  existing `SectionHeading` + `StatCard` primitives from
  `src/components/internal/stats.tsx`.

**Overview** is refactored to render `<PlatformMetricSections stats={p} mode="real" />`
in place of its inline three sections — a behavior-preserving refactor; its *Revenue*
and admin *AI spend* sections stay inline on Overview (they are not part of the shared
component). Verify the refactor produces byte-identical output to today's Overview.

### 3. Simulation page structure

Restructure `InternalSimulation.tsx` to mirror all five Overview sections, then a
divider, then the simulation-only internals:

```
Kill switch chip                       (unchanged, top)
<PlatformMetricSections mode="synthetic">   → Users & businesses / Activity / Content
Revenue (modeled)      ← existing Modeled-revenue card, keeps its MODELED badge
AI spend (synthetic)   ← existing "Synthetic MTD AI spend" card
──────── Simulation internals ────────  (divider / SectionHeading)
Cohort registry: Bots total (registry) · Synthetic messages
Bots by persona
Matrix run (summed)
Load curve
```

The page keeps calling **both** `useSimulationStats()` (kill switch, personas, messages,
MTD AI spend, `bots_total` registry) **and** `usePlatformStats()` (the parity counts).
`synthetic_campaigns` stops being its own card — it now appears in the Activity mirror.

**Registry reconciliation:** the mirror's "Total users (synthetic)" = `all − real`
*profiles*; the retained `Bots total (registry)` = `synthetic_users` row count. They
should match; keeping the registry count in the internals zone makes any gap (accounts
minted without a profile row) visible rather than hidden.

### 4. Edge cases

- **Kill switch off / no synthetic data** → every synthetic count is 0; the mirror shows
  zeros (correct — "no cohort"), with a soft "No synthetic cohort active" note above the
  sections.
- **RPC one version behind** (the three `*_all` maps absent) → `deriveCardModel` omits
  the affected synthetic sub-lines but still renders the headline counts; no crash.
- **Bucket diff underflow** → `diffBuckets` clamps at 0.

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/20260725150000_aios_platform_stats_totals.sql` | **Edit in place** — add `by_status_all`, `posts_by_status_all`, `by_platform_all`; extend verification comment |
| `src/hooks/internal/usePlatformStats.ts` | Add three optional `*_all` maps to `PlatformStats` |
| `src/lib/internal/platformMetricModel.ts` | **New** — `deriveCardModel` + `diffBuckets` |
| `src/components/internal/PlatformMetricSections.tsx` | **New** — shared three-section renderer |
| `src/pages/internal/InternalOverview.tsx` | Use `PlatformMetricSections` (mode="real"); Revenue/AI spend unchanged |
| `src/pages/internal/InternalSimulation.tsx` | Restructure to the mirror layout above |
| `src/lib/internal/platformMetricModel.test.ts` | **New** — unit tests |

## Testing

- **Unit** (`platformMetricModel.test.ts`, Vitest, co-located): `deriveCardModel` in both
  modes; `diffBuckets` clamping, missing/extra keys, empty objects; real-mode output
  matches the current Overview values for a fixed `PlatformStats` fixture.
- **Build/lint:** `npm run build` + `npm run lint`.
- **Visual:** confirm the refactored Overview renders identically to today; confirm the
  Simulation mirror matches Overview's layout with synthetic values.
- **Codex second review** (mandatory) before finishing the branch.

## Rollout / deploy

Frontend-only + one **additive** migration edit. Ship order:

1. Merge the branch (frontend + migration file).
2. **Apply migration `20260725150000` at the careful gate** (`/careful`) — it is
   founder-gated and currently unapplied; the synthetic parity (and the Overview
   real-vs-total banner already on this branch) both depend on the `*_all` fields
   existing in prod. Verify with the in-file rollback-wrapped VERIFICATION block.
3. `verify-prod`: check `/internal` and `/internal/simulation` on `internal.dragoncandy.io`.
4. `knowledge-sync` per the branch-finish rule.

## Risks

- **Migration not applied** → `total_all` is `undefined`, synthetic = `NaN`. Mitigated by
  making the apply an explicit, gated ship step and typing the new fields optional so a
  version-skew renders headline counts without crashing.
- **Overview refactor regression** → guarded by the real-mode unit test asserting
  parity with current values + a visual check.

## Resolved decisions

- Layout: **restructure Simulation to mirror Overview** (not an add-on section, not an
  Overview toggle).
- Depth: **full sub-detail parity** (the three additive keys).
- `Bots total` (registry) kept as an internals diagnostic; Modeled-revenue /
  Synthetic-AI-spend reused as the synthetic Revenue / AI-spend sections.
