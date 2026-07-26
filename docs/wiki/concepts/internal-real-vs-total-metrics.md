---
title: Internal Real-vs-Total Metrics
type: concept
created: 2026-07-26
updated: 2026-07-26
sources: [2026-07-26-synthetic-metric-parity.md]
tags: [aios, internal, metrics, synthetic, dashboard]
---
# Internal Real-vs-Total Metrics

How the AIOS (`/internal`) metric surfaces separate **real** users from the **synthetic**
(bot) cohort, so founder KPIs stay honest while the synthetic weight stays inspectable.
Built on the [[Synthetic Weight Engine]]'s `is_synthetic(...)` predicate.

## The three surfaces

- **Overview (`/internal`)** — **real only.** `aios_platform_stats` counts every entity
  `WHERE NOT is_synthetic(...)`. With ~2,025 synthetic bots vs ~40 real users it *correctly*
  sits flat — which once read as "metrics not updating" but is the segregation working as
  designed (durable lesson: **verify the pipeline before assuming a break**). A **"synthetic
  test data is active" banner** and an **"of N incl. synthetic" per-card sub** surface the
  excluded volume, computed from the `all − real` gap, and render only when that gap is non-zero
  (a clean prod with no bots is visually unchanged).
- **Simulation / Synthetic Weight Engine (`/internal/simulation`)** — **synthetic mirror.** As of
  2026-07-26 its top mirrors the Overview card set 1:1, valued with the synthetic cohort, then a
  divider, then simulation-only widgets (registry `Bots total`, personas, matrix run, load curve,
  modeled revenue).
- **Weight (`/internal/weight`)** — **synthetic-inclusive** physical totals (real disk/rows drive
  scaling), with a `row_counts_real` subcount.

## Key mechanism — synthetic = all − real, for free

`aios_platform_stats` returns every metric twice: `total` (real, `WHERE NOT is_synthetic`) and
`total_all` (no filter, added by migration `20260725150000`). So **synthetic = `total_all − total`
using the identical counting method** — the Overview (real) and Simulation (synthetic) reconcile by
construction, no separate synthetic-counting query. Sub-line parity needed three more additive
breakdown maps: `by_status_all` (campaigns), `posts_by_status_all` (dragonshare),
`by_platform_all` (social).

## Shared model (one card set, two populations)

- **`deriveCardModel(stats, mode: 'real' | 'synthetic')`** (`src/lib/internal/platformMetricModel.ts`)
  — a pure, framework-free function producing the section→card model. Real mode reproduces the old
  Overview cards **byte-for-byte** (values + `ofTotal`/`withSub`/platform-join sub-strings); synthetic
  mode = `all − real` per metric, with `diffBuckets(all, real)` for per-bucket sub-lines. Real-mode
  output is locked by unit tests so the Overview refactor is provably behaviour-preserving.
- **`PlatformMetricSections`** (`src/components/internal/PlatformMetricSections.tsx`) renders the model
  for both pages and owns its own loading/error/empty. **Keyed `<Fragment>` per section, never a
  wrapping `<div>`** — a div makes every `SectionHeading` a `:first-child`, collapsing `first:mt-0` on
  all three sections.

## Graceful degradation to the pre-migration RPC

Migration `20260725150000` is **founder-gated**, so the frontend can be live before the `*_all` fields
exist. All `*_all` fields are therefore **optional** in `PlatformStats` (they ship together from one
migration), consumers tolerate their absence, and the Overview banner guards every direct `*_all` read
with `?? 0`. Synthetic mode shows a distinct **"metrics pending migration"** state (not a false
"no cohort") when `total_all` is absent; real mode never crashes on a missing `by_role_all`. Two Codex
P2s hardened exactly these paths.

## Known Issues

- **Load-bearing deploy step:** applying migration `20260725150000` at the careful gate is required for
  BOTH the parity and the Overview real-vs-total banner. Until then both show degraded/pending states.
- Registry `Bots total` (`synthetic_users` rows) and the mirror's synthetic "Total users"
  (`all − real` profiles) can differ slightly; both are shown so any gap is visible.

## See Also

- [[Synthetic Weight Engine]] — the `is_synthetic` safety spine + the Simulation page this compounds.
- [[AIOS Internal Shell]] — how `/internal/*` is navigated and laid out.
- [[Living Synthetic Marketplace]] — the persistent browsable `botmk_` cohort these metrics exclude.
