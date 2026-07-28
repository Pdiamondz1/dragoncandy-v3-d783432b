# "DragonCandy at 1M DAU" — Standup Demo — Design Spec

> Builds directly on the shipped scale/cost stack: **`/internal/forecast`** (cost model + DAU
> forecast, `forecastModel.ts`, #352), **`/internal/weight`** (live infra telemetry, #354),
> **`/internal/simulation`** (Synthetic Weight Engine + runner-matrix load, #353), and the
> real-vs-total honesty rail on the internal surfaces (#344/#350). This branch is cut from
> `origin/main` (52cbdf05) and references only code present there.

**Date:** 2026-07-28 · **Branch:** `feat/1m-dau-standup-demo` · **Status:** design, pre-plan

---

## 1. Goal

A **reproducible, fully-isolated, non-prod standup demo** that lets a stakeholder *walk through the
real DragonCandy app as if it were operating at 1,000,000 DAU* — every product surface populated so it
looks alive and full, the internal metrics deck showing the 1M-DAU scale/weight/economics as its
headline (honestly badged as projected), capped by a live synthetic-load burst that moves the weight
dashboards under *real* load. Stood up on a throwaway Supabase branch per demo and deleted after.
**Nothing touches prod at any step.**

This is the standard "how does it perform and what does it cost at scale" demonstration — the walkable
version of the numbers already modeled at `/internal/forecast`.

## 2. Framing — the honest shape of a "1M DAU" demo

You **cannot literally stand up 1M live daily-active users.** At the model's default assumptions that is
~4,000,000 registered users, ~80,000 peak concurrent sessions, hundreds of GB of DB and multiple TB of
storage — a real five-figure/month system. That impossibility is the entire reason the forecast exists
as a *model*. So the demo is an honest **representative instance**, split cleanly in two:

- **Browsable/product surfaces** (feed, marketplace, business & creator dashboards) show **genuine
  seeded synthetic data** — a few thousand rows, enough that a *guided linear walkthrough* looks full
  and alive. This is real data in a real DB, just synthetic and modest in volume.
- **Aggregate metric surfaces** (the internal deck) show the **modeled 1M-DAU scenario** — the exact
  numbers `forecastModel.buildForecast()` already computes — surfaced as a **badged projection hero**.
  The real (non-synthetic) counts on a fresh branch are ~0, so nothing here is *displaced* by the
  projection; it is additive and unmistakably labelled.

The credibility chain shown to the stakeholder is: **real measured load → model → 1M-DAU economics** —
defensible at every step. Every projected figure is badged; no synthetic number is ever presented as
real; the live internal honesty rail (real-only counts, `WHERE NOT is_synthetic`) is untouched.

**Non-goals of the framing:** this does not claim *when* 1M DAU is reached, does not instrument real
DAU/MAU (none exists), and does not attempt literal-scale data volumes.

## 3. Scope

**In scope (all three components specced here)**
- **Component A — `DEMO_SCALE` mode (app-side, Phase 1):** a build/env flag + hard prod guard + global
  DEMO banner + a thin presentation overlay that promotes the forecast's 1M-DAU scenario to the
  headline across the internal deck. Ships **inert on prod** (flag off → zero behavior change).
- **Component B — branch world-seeder (Phase 2):** one idempotent, prod-guarded seed entrypoint that
  populates the demo world (two demo logins with active dashboards + feed + marketplace depth) and
  seeds the measured load-run + a weight snapshot so the forecast reports a *measured* ceiling.
- **Component C — standup/teardown runbook + live-burst (Phase 3):** the ordered create→seed→deploy→
  demo→delete runbook, plus a small pointable load-burst script for the live "watch it take load" beat.

**Out of scope (explicit)**
- Literal 1M-scale data volumes or genuine 1M concurrency (see §2).
- Real DAU/MAU instrumentation (none exists; would change the forecast's framing).
- Any new metric *computation* — DEMO mode **reuses** `forecastModel` output; it never forks the math.
- Mutating the live/real internal query paths or the real-vs-total honesty rail.
- A persistent always-on demo environment (chosen mechanism is per-demo branch + preview; a persistent
  env was explicitly declined).

## 4. Architecture

Three components with clean boundaries; each is independently testable, and **Phase 1 ships and is
valuable on its own** (it renders the 1M projection hero even before any world is seeded).

### 4A. Component A — `DEMO_SCALE` mode (app-side) — **Phase 1**

**Flag + guard — `src/lib/internal/demoScale.ts` (new, pure, unit-tested)**
```ts
// True ONLY when the build flag is set AND the configured Supabase project is NOT prod.
// Double-guard: even if VITE_DEMO_SCALE=1 leaks onto a prod build, overlays stay inert.
export function isDemoScale(): boolean
```
- Reads `import.meta.env.VITE_DEMO_SCALE === '1'`.
- Reads the configured Supabase URL/ref and returns `false` if it matches the **prod ref**
  (`zocahiffooqdybdhguqv`). Prod ref lives as a documented constant with a comment.
- Pure and synchronous so components can branch on it without a hook.

**Projection selector — `src/lib/internal/demoScaleForecast.ts` (new, pure, unit-tested)**
- Given the existing `buildForecast(...)` output, returns the **1M-DAU `ForecastScenario`** (the
  `label === '1M'` / `dau === 1_000_000` row) for headline display. No new math — pure selection.

**Global banner — `<DemoScaleBanner/>`**
- Persistent, unmissable "DEMO — projected 1,000,000 DAU · synthetic data · not production" bar,
  rendered app-wide only when `isDemoScale()`. Brand-adjacent styling (no gray, per house rule).

**Deck overlays (presentation-only, additive):** when `isDemoScale()`, each internal surface gains a
badged projection hero sourced from the 1M scenario — the **real query paths are left intact**:
- `/internal/overview` — hero: **1,000,000 DAU · 4,000,000 users** (badged PROJECTED). Real branch
  counts remain available/secondary and honest (~0 real on a fresh branch).
- `/internal/weight` — hero: the 1M scenario footprint (DB bytes, storage, pooled conns, required
  compute tier), badged; the live branch reading stays visible as "this instance".
- `/internal/forecast` — already renders the 1M column; DEMO mode **emphasises/pins** it. Minimal change.
- `/internal/scorecard` — reflects the 1M margin line (badged).
- `/internal/simulation` — unchanged surface; it already shows synthetic openly + the matrix run (§4C).

**Invariant:** DEMO overlays are a thin display layer over `forecastModel` output. They never fabricate
table rows, never mutate the real/synthetic-segregated queries, and are impossible to render on prod.

### 4B. Component B — branch world-seeder — **Phase 2**

One idempotent orchestrating entrypoint (e.g. `scripts/demo/seed-1m-dau-demo.ts`) run against the
**branch** DB (service-role), that:
1. **Hard-guards** on target project ref ≠ prod ref (refuses to run against prod).
2. Creates two demo logins — a demo **restaurant/business** and a demo **creator** — with known creds.
3. Seeds their dashboards: active campaigns, stacks of applications, content-in-flight, payouts,
   DragonShare earnings — so both the paying-customer and supply-side views look active.
4. Seeds the **consumer feed** (existing DragonFeed synthetic seed) so it scrolls full.
5. Seeds **marketplace depth** (existing `seed_synthetic_marketplace_depth`-style path) so both sides
   of discovery browse full across cities.
6. Inserts a `platform_weight` snapshot **and** a `sim_load_matrix_summary` row carrying the **real
   captured runner-matrix run** (31k requests / 4,000 offered concurrency / 0 breakage / DB ~70% idle)
   so `/internal/forecast` derives a **measured** ceiling, not default coefficients.
7. Seeds/confirms the `aios_dashboard_settings` forecast assumption rows (so the 1M numbers are stable).
- All seeded rows tagged `is_synthetic`. Reruns are idempotent (stable keys / fixed seeds → stable
  counts). Exact existing seeder entrypoints/RPC names to be **verified during planning** before use.

### 4C. Component C — standup/teardown runbook + live-burst — **Phase 3**

**Runbook — `docs/runbooks/1m-dau-standup-demo.md`**, ordered:
1. `create_branch` (via Supabase MCP; passes the `confirm_cost` gate — ephemeral, small).
2. Confirm the branch DB is ready and migrations are applied on it.
3. Run the Phase-2 seeder against the branch.
4. Deploy a preview build pointed at the branch DB with `VITE_DEMO_SCALE=1`
   (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` → branch) → shareable demo URL.
5. Smoke-verify the six walkthrough beats (§5) on the URL.
6. Run the demo; fire the live-burst at the climax.
7. `delete_branch` + remove the preview deployment → full teardown, no trace.

**Live-burst script** — a small, pointable concurrency generator (~a few hundred concurrent requests
for ~30–60s, one runner) aimed at the demo URL, writing snapshots into the branch's `sim_load` tables
so `/internal/weight` + `/internal/simulation` **move live**. Paired with the seeded captured 4,000-run
as the measured *ceiling* artifact (the full multi-IP 4,000-concurrency run is not fired live in-room —
it needs the GitHub Actions runner matrix; this is stated to the audience).

## 5. The walkthrough (story beats, in order)
1. **Consumer feed (DragonFeed)** — open cold; feed scrolls endlessly. *"1M DAU as a user."*
2. **Marketplace / discovery** — browse both sides, thousands of profiles across cities.
3. **Business dashboard** — log in as the demo restaurant: active campaigns, applicants, payouts.
4. **Creator dashboard** — log in as the demo creator: matches, applications, earnings.
5. **Internal deck** — `/internal/overview` (1M DAU / 4M users, badged) → `/weight` (required infra
   tier) → `/forecast` (total cost, revenue, margin, cost-per-DAU) → `/simulation`.
6. **Live-load moment** — fire the burst; weight/simulation move in real time; point at the captured
   4,000-run as the measured ceiling; forecast extrapolates to 1M. *"Measured — and the DB isn't even
   the bottleneck."*

## 6. Safety rails (non-negotiable)
- **Can't touch prod:** branch is a separate DB; both the seeder and the DEMO overlays hard-refuse the
  prod project ref.
- **Can't leak:** Phase 1 ships with the flag off → prod behavior byte-identical; the real-vs-total
  honesty rail is untouched. A unit test asserts `isDemoScale()` is `false` on the prod ref even with
  the flag on.
- **Can't mislead:** every projected number carries a PROJECTED badge + the global DEMO banner; no
  synthetic row is presented as real; the credibility chain is measured→modeled.

## 7. Provenance of every displayed number (MEASURED / MODELED / SEEDED)
- **MEASURED:** the captured runner-matrix ceiling (seeded into the branch) → drives the forecast's
  connection/egress coefficients.
- **MODELED:** all 1M-DAU headline figures (users, peak concurrency, DB/storage footprint, compute
  tier, cost, revenue, margin, cost-per-DAU) — from `forecastModel` + founder-tunable assumptions.
- **SEEDED (synthetic):** everything browsable on the product surfaces — feed, marketplace, dashboard
  contents — genuine rows in the branch DB, tagged `is_synthetic`.

## 8. Phased build plan
- **Phase 1 — `DEMO_SCALE` mode (Component A).** Flag + prod guard + banner + deck projection overlays.
  Independently shippable and prod-safe; demonstrable immediately (renders the 1M hero from the live
  forecast model even with no seeded world). **Built first.**
- **Phase 2 — branch world-seeder (Component B).** The idempotent, prod-guarded seed entrypoint.
- **Phase 3 — standup/teardown runbook + live-burst (Component C).** Runbook + burst script; validated
  by one full create→seed→deploy→delete dry-run on a real branch, then deleted.

## 9. Testing
- Unit: `isDemoScale()` — flag on + non-prod ref → `true`; **prod ref → `false` even with flag on**.
- Unit: `demoScaleForecast` selects the `1M` scenario from `buildForecast` output.
- Unit/render: deck overlays render the projection hero + badge only when `isDemoScale()`; real query
  paths unchanged when off.
- Seeder: idempotency — a second run leaves row counts stable (verified on a branch).
- Integration: one full Phase-3 dry-run (branch create → seed → preview deploy → six beats smoke →
  delete) before the feature is called done.

## 10. Teardown
`delete_branch` + remove the preview deployment. Idempotent; leaves no trace. Documented as the final
runbook step.

## 11. Risks & open questions (resolve during planning)
- **Vercel preview → Supabase branch env wiring** is the biggest unknown — a dedicated preview deploy
  with explicit `VITE_SUPABASE_*` overrides may be required (the repo already splits Prod/Preview
  Supabase vars). Validate early in Phase 3.
- **Auth on a branch:** confirm the branch exposes `auth` and that service-role admin user-creation
  works against it (needed for the two demo logins).
- **Branch bootstrap:** confirm branches apply repo migrations on creation (schema present before seed).
- **Exact seeder entrypoints/RPC names** (DragonFeed seed, marketplace depth, campaign/payout seeders)
  must be verified against `main` before Phase 2 wires them.
- **Assumptions review:** the 1M numbers ride on the founder-tunable assumptions panel; a pre-demo pass
  to sanity-check ARPU / paying-conversion / registered-per-DAU is advisable (panel left as-is here).
