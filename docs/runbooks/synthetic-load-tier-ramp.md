# Runbook — Synthetic Weight Engine: load tier-ramp + findings synthesis

**Purpose.** Drive the synthetic bot harness at increasing concurrency against **prod** to (1) find the
saturation **knee** per compute tier, (2) produce the performance-and-cost-per-tier curve, and (3)
synthesize a **Load Findings Report** (bugs / bottlenecks / improvements) — the "what to fix before
50K DAUs" deliverable. Spec: `docs/superpowers/specs/2026-07-24-synthetic-weight-load-economics-design.md`.

**Founder-gated.** Every step here touches prod and degrades the app during a saturation window. Run
deliberately, one tier at a time, in a **low-traffic slot OFF the 14:00 UTC daily `tick` cron**. Do not
automate this.

**Baseline (verified 2026-07-24):** current prod direct-connection ceiling `max_connections = 90`;
`pg_stat_statements` and `uuid-ossp` are installed in the `extensions` schema. The exact compute
add-on tier + $/mo is read from the **Supabase dashboard → Settings → Compute** at ramp time (not
exposed via API), keyed to that 90-connection number.

---

## 0. Pre-flight (once per session)

1. **Kill switch on + secrets present.** `SYNTHETIC_BOTS_ENABLED = true` (else every command
   fail-closes at boot), test-mode Stripe keys, `SIM_*` env. Local runs read them the same way the CI
   workflow does; see `sim/env.ts`.
2. **`pg_stat_statements` enabled** (it is — `extensions` schema). If ever absent, the snapshot RPC
   degrades `avg_query_ms` to NULL rather than failing.
3. **Reset the statement stats** so the numbers reflect THIS ramp:
   `select pg_stat_statements_reset();` (service role).
4. **Confirm you are off the cron window** (not near 14:00 UTC).

## 1. Session-reuse verification (first live run only — proves the keystone)

The cross-tick session pool's win (refresh over re-mint) can't be exercised by `dry-run` (no network).
Prove it live, once:
1. Ensure an active cohort exists (`bulk-seed` below, or the live 25-bot cohort).
2. Run `tick` twice in quick succession from the same machine.
3. **Expect:** the second tick performs **0 fresh mints** (only refreshes / cached tokens) and does
   NOT hit a 429. If it re-mints every bot, the pool wiring regressed.

## 2. Seed the population

```
# depth pool (never authenticate) + a session-capable active cohort, one namespace each:
npx tsx sim/cli.ts bulk-seed --n <TOTAL> --active <ACTIVE> --cohort load --creator-split 0.65
#   depth  → botseed_load_<i>@synthetic.dragoncandy.test   (bulk RPC)
#   active → botla<seed>_<i>@synthetic.dragoncandy.test     (minted, session-capable)
```
Start small (e.g. `--n 200 --active 25`), confirm segregation (§4), then scale up per tier. `bulk-seed`
is **one-shot** — it fails loud if the active namespace already exists (purge/clean first to re-seed).

## 3. Run the ramp (find the knee — NOT a true outage)

```
npx tsx sim/cli.ts load --ramp 50/1500/2.5 --hold-ms 15000 --run-label "tier-<TIER>-<date>"
```
- The driver reuses the pooled sessions (pre-warmed serially first), ramps concurrency in steps, holds
  each step, and **stops at the saturation knee** (sustained error-rate or p95 degradation) — we do NOT
  push to a full DoS, so `/internal` and the `capture_sim_load_snapshot` RPC stay responsive enough to
  record the very samples we need.
- **Single-egress-IP caveat (spec §4b):** one machine = one IP, subject to per-IP auth/PostgREST/
  Cloudflare limits — a single-runner "ceiling" may reflect a **client-side** limit, not the DB's. If
  the knee looks client-bound (429s dominate well below 90 connections), fan out across a **runner
  matrix / several IPs** and sum. Headline the result as "sustained throughput proven," caveated.
- Non-throttle errors are collected as **findings** (not aborted on the first) → `sim/.load-findings.json`.
  The process exits non-zero if any breakage occurred.

## 4. Read the results

```sql
-- the per-step curve for this run (service role):
select captured_at, run_label, active_connections, max_connections, reserved_headroom,
       avg_query_ms, error_rate, notes
from sim_load_snapshots
where run_label = 'tier-<TIER>-<date>'
order by captured_at;
```
- **Saturation** shows as `active_connections` approaching `max_connections` (90 at baseline) with
  rising `avg_query_ms` / `error_rate`.
- **Segregation check (must hold every run):** snapshot every `aios_*` RPC + `platform_weight.*_real`
  before and after — the **real** KPI numbers must be byte-identical while `get_simulation_stats`
  shows the synthetic activity. `/internal/simulation` renders the curve + synthetic cost.

## 5. Step the tier + record the cost curve

Repeat §3–4 at each compute tier:
1. **Supabase dashboard → Settings → Compute → upgrade one step** (MICRO→SMALL→MEDIUM→LARGE…). Each
   resize is a **brief DB restart** — expected; do it off the cron.
2. Re-run the ramp at the new tier; record: knee concurrency, p95 `avg_query_ms`, the connection
   ceiling, **the tier's $/mo (from the dashboard)**, and the **storage-cost leg**
   (`platform_weight.storage_bytes` delta × Supabase $/GB).
3. Stop when a tier comfortably holds your target load. The table of {tier → knee, p95, $/mo} is the
   **performance-and-cost-per-tier curve** — the core deliverable.

## 6. Synthesize the Load Findings Report (the deliverable)

Fill `docs/superpowers/load-findings/TEMPLATE.md` into `docs/superpowers/load-findings/<date>.md` from
five sources:
1. **Bugs** — breakage signatures in `sim/.load-findings.json` (things that errored under load).
2. **Bottlenecks** — slowest + most-frequent queries: `select query, calls, total_exec_time,
   mean_exec_time from extensions.pg_stat_statements order by total_exec_time desc limit 25;` (and by
   `calls`); the knee concurrency + connection ceiling from `sim_load_snapshots`; and `get_advisors`
   findings (missing indexes, unindexed FKs, RLS-perf).
3. **Improvements** — the tier recommendation (from §5), caching/query-rewrite candidates, capacity
   knobs (connection pooler / `max_connections`).
Optionally file the top items to `/internal/findings` (AIOS). Each finding: severity + a one-line fix
hypothesis.

## 7. Teardown (clean up the load-test bloat)

> **CRITICAL — do NOT run `purge_synthetic_data()` to clean up a load test.** That purges **ALL**
> synthetic users, including the **live persistent 25-bot cohort** (`bot001…bot025`) that drives the
> daily `tick`. Delete only the load-test namespaces:

```sql
-- removes the load depth + active cohorts (cascades to profiles/registry/etc.); leaves bot001..025:
delete from auth.users where email like 'botseed_load_%@synthetic.dragoncandy.test';
delete from auth.users where email like 'botla%_%@synthetic.dragoncandy.test';
delete from sim_load_snapshots where run_label like 'tier-%';
```
Then re-capture and assert no load residue while the live cohort survives:
```sql
select
  (select count(*) from auth.users where email like 'botseed_load_%@synthetic.dragoncandy.test') as depth_left,
  (select count(*) from auth.users where email like 'botla%_%@synthetic.dragoncandy.test')        as active_left,
  (select count(*) from synthetic_users) as live_cohort;   -- expect depth_left=0, active_left=0, live_cohort=25
```
Only if you intend to wipe **everything synthetic** (including the live cohort) use
`select public.purge_synthetic_data();` then assert zero residue + `row_counts_real == row_counts` via
`capture_platform_weight()`.

## Notes
- **Modeled revenue** is a Phase-A dashboard figure (GMV × take-rate, clearly labeled "modeled");
  **measured** revenue + real test-mode money + Donny AI spend are Phase B (a separate, gated plan).
- Downgrade the compute tier back to your steady operating size when the ramp session ends (cost).
