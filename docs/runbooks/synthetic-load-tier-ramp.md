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
- **Keep a single ramp well under ~1 hour.** A pooled bot JWT has a ~1h TTL, and `makeBotFor` caches
  the bot client for the run; a ramp that runs past the TTL will emit `401 JWT expired`, which the
  driver classifies as **breakage** (not throttle) → spurious findings. For a longer campaign, run
  several shorter ramps rather than one multi-hour ramp.
- **Malformed `--ramp` fails loud.** `parseRamp` throws on a mistyped spec (e.g. a 2-part `50/1500`,
  garbage, or `0`) instead of silently running a trivial 1-step ramp — so a typo aborts the run
  rather than producing a fake "ramp." Use `start/max/factor` (e.g. `50/1500/2.5`) or an explicit
  comma list (`50,200,500,1000`).
- **Stale session pool → re-mint.** The pool persists bot JWTs to `sim/.session-pool.json` (gitignored).
  If a prior partial run left stale/rotated refresh tokens, a bot's refresh can fail terminally; delete
  `sim/.session-pool.json` to force a clean re-mint on the next run. (The GH cron runs on ephemeral
  runners with no pool file, so it always re-mints — this only affects repeated local runs.)

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
> daily `tick`. Delete only the load-test namespaces — matched on **prefix, not a specific cohort
> label**. The `botseed_` (depth) and `botla` (active) prefixes are produced *only* by `bulk-seed`,
> for **any** `--cohort` value, and are structurally disjoint from the live cohort's `bot0##` scheme
> — so a prefix match is always safe and does **not** depend on which `--cohort`/`--run-label` the run
> used. (This matters: `bulk-seed` defaults `--cohort` to `phase1` and the GH-workflow `bulk-seed`
> option passes only `--n`, so depth rows are often `botseed_phase1_%`, not `botseed_load_%`; and the
> `load` run-label defaults to `load`, not `tier-…`.)

**Prefer the scoped RPC.** `select public.purge_synthetic_load_cohort();` does all of the below
correctly in one call — it deletes ONLY the `botla%`/`botseed_%` load cohort (spares the live 25),
leaf-deletes the NO-ACTION-FK rows (`push_notifications.actor_id`, `crew_activity`,
`creator_group_members`) + trigger/telemetry residue (`dragonshare_events`) BEFORE the `auth.users`
delete, removes the non-cascading synthetic org, and returns a `residual_*` report (assert every
`residual_*` is 0). Use the raw SQL below only as a fallback / to also purge snapshot rows:

```sql
-- FALLBACK (the RPC above is preferred). Leaf-delete the NO-ACTION push_notifications rows FIRST — the
-- Phase-4 notify leg creates them with a synthetic actor_id (actor_id → profiles is NO-ACTION and
-- would block the auth.users→profiles cascade, exactly like the crew tables). Scoped to the load
-- cohort so the live 25's notification rows are untouched:
delete from push_notifications where actor_id in (
  select id from auth.users
  where email like 'botla%@synthetic.dragoncandy.test' or email like 'botseed_%@synthetic.dragoncandy.test');
-- removes the load depth + active cohorts (cascades to profiles/registry/etc.); leaves bot001..025:
delete from auth.users where email like 'botseed_%@synthetic.dragoncandy.test';   -- all depth cohorts
delete from auth.users where email like 'botla%_%@synthetic.dragoncandy.test';    -- all active load cohorts
-- snapshots: the default run-label is 'load'; runbook ramps use 'tier-<TIER>-<date>'; the matrix uses
-- 'matrix-*'. A CUSTOM --run-label needs its own delete. sim_load_snapshots only ever holds load rows.
delete from sim_load_snapshots where run_label = 'load' or run_label like 'tier-%' or run_label like 'matrix-%';
```
Then re-capture and assert no load residue while the live cohort survives:
```sql
select
  (select count(*) from auth.users where email like 'botseed_%@synthetic.dragoncandy.test') as depth_left,
  (select count(*) from auth.users where email like 'botla%_%@synthetic.dragoncandy.test')   as active_left,
  (select count(*) from synthetic_users) as live_cohort;   -- expect depth_left=0, active_left=0, live_cohort=25
```
Only if you intend to wipe **everything synthetic** (including the live cohort) use
`select public.purge_synthetic_data();` then assert zero residue + `row_counts_real == row_counts` via
`capture_platform_weight()`.

## 8. Runner matrix (multi-IP fan-out — Slice 1; Slice 2 adds real egress + the honest peak)

A single GH runner caps at the ~312-concurrency client-side **egress** wall while prod's DB stays
~91% idle (`docs/superpowers/load-findings/2026-07-24.md`). The **runner matrix** breaks that: it fans
the SAME load driver across N shards — each a separate GH job on its own runner IP — so the *summed*
offered concurrency pushes prod's DB toward its real ceiling. **The ramp knob is the shard count.**

**`media_fetch` is real egress, not a proxy (Slice 2).** Every `media_fetch` action performs an actual
Range-capped `GET` against a real public DragonCandy Storage object (`dragonshare-content`/
`help-screenshots`) — hard-capped per request via `Range: bytes=0-262143` (256 KiB) — so the matrix's
egress is genuine bandwidth against prod Storage, not a simulated stand-in. Worst-case egress for a run
is computable up front: **≤ `media_requests` × 256 KiB**. Keep the soak short at scale (the
credible-200K sequence below uses `soak_ms=120000`, ~2 min) so the per-request cap stays a bounded
aggregate too. A non-2xx/network failure on that GET is a **media error** (`ok:false`) — tallied apart
from breakage, never tripping the DB-saturation knee (same "media error ≠ breakage" convention as §3).

**1) Seed at `25 × max_shards` active** (so every shard has a non-empty disjoint `botla…` slice —
raising the shard count later requires re-seeding; a bigger dispatch over a smaller seed drives empty
shard slices). Include content so the media-egress + write legs have real targets:
```
npx tsx sim/cli.ts bulk-seed --n <TOTAL> --active <25×max_shards> --with-content --cohort load
#   --with-content also seeds public-free campaigns + DragonShare video posts + file_uploads + avatars/geo
#   (via seed_synthetic_content) onto the botla…/botseed_… cohort — never the live bot0## 25.
```

**2) Dispatch the matrix** (manual only — the `synthetic-weight` environment reviewer-gates each shard;
all inputs go through env vars, never interpolated):
```
gh workflow run synthetic-load-matrix.yml \
  -f shards=5 -f concurrency=200 -f soak_ms=1800000 -f run_label="matrix-<date>"
# each shard holds a fixed egress-safe C=200 on its own IP for the soak; 5 shards ≈ 1000 offered.
```
- **A matrix needs ≥2 shards** — the workflow rejects `shards<2` (a 1-shard run is the SINGLE-runner
  path, which the summary RPC can't aggregate; use the `load` command / `synthetic-weight.yml` for that).
- **Ramp = step the shard count** (2 → 5 → 10 → 20, capped at the workflow's `MAX_SHARDS` — raised to
  **20**). Keep C per shard at/below the single-IP egress-safe ceiling (~200); the *naive* concurrency
  you're offering is `shards × C` — see the credible-200K sequence below for the *honest* read.
- **The effective `run_label` is unique per dispatch** — the workflow suffixes your label with the GH
  run id (`<run_label>-<run_id>.<attempt>`) so a re-used label never mixes two runs in the summary.
- **Kill switch drains mid-soak:** flip `SYNTHETIC_BOTS_ENABLED` off in prod `feature_flags` and every
  in-flight shard stops within a snapshot cycle (the `isEnabled` re-check) — no `gh run cancel` needed.
- Each shard uploads its `sim/.load-findings.json` as `findings-shard-<n>`.

**2a) The credible-200K sequence (Slice 2).** Staggered/queued shards (the GitHub concurrent-runner
cap) make the naive per-shard sum an overestimate — probe the knee, discover the cap, then run, in
this order:
1. **Probe the per-shard knee with real media firing**, single-runner (cheaper than a matrix dispatch,
   and `media_fetch`'s real GET egress makes the knee a real one, not a proxy). Use a **non-`matrix-*`
   run label**: a single-runner `load` snapshot carries no `notes.shard`, so if it were labelled
   `matrix-*` the `/internal` "Matrix run (summed)" card — which reads the newest `matrix%` label — would
   pick it up and render a bogus zero-shard/zero-concurrency summary. `knee-probe-*` keeps it out:
   ```
   npx tsx sim/cli.ts load --ramp 50/400/1.6 --hold-ms 15000 --run-label "knee-probe-<date>"
   ```
   Read the curve (§3) for the concurrency where media p95 latency / media error rate / transport
   breakage knees. Record `C_knee`; shade it down one step for the per-shard `C` you dispatch the
   matrix with — a single runner omits the matrix's ~10% write leg.
2. **Discover the runner cap** — dispatch a full-`MAX_SHARDS` run with a short soak; queued shards
   start late and never overlap the others, so this reveals how many GitHub actually runs at once:
   ```
   gh workflow run synthetic-load-matrix.yml \
     -f shards=20 -f concurrency=200 -f soak_ms=120000 -f run_label="matrix-cap-<date>" -f seed=true
   ```
   Read `max_concurrent_shards` from `get_sim_load_matrix_summary` (below) — that *is* the GitHub
   concurrent-runner cap, and it may be well under 20.
3. **The 200K run** — dispatch `shards = min(16, cap)` (`cap` = `max_concurrent_shards` from step 2),
   `concurrency = C` (from step 1), `soak_ms=120000`, a fresh `run_label`:
   ```
   gh workflow run synthetic-load-matrix.yml \
     -f shards=<min(16,cap)> -f concurrency=<C> -f soak_ms=120000 -f run_label="matrix-200k-<date>"
   ```
   `~16 × C` targets the ~4,000-concurrency / ~200K-DAU band at a `C` near the single-shard
   egress-safe ceiling; record the worst-case egress up front (`≤ media_requests × 256 KiB`, per above).
   If the runner cap forces `shards < 16`, that cap-limited ceiling is the credible number — document
   it plus the path past it (paid plan / self-hosted runners), not a number the cap can't support.

**3) Read the summed result.** `/internal/simulation` renders the summed row ("Matrix run (summed)")
for the LATEST `matrix-*` run automatically — the simplest read, and now also shows the honest-peak +
media-error/media-latency StatCards described below. For SQL, discover this run's effective label
first (it carries the run-id suffix), then summarize it:
```sql
select distinct run_label from sim_load_snapshots where run_label like 'matrix-%' order by run_label desc;
select public.get_sim_load_matrix_summary('<effective-run-label>');
--  → {shards, offered_concurrency, honest_peak_concurrency, max_concurrent_shards, requests, ok,
--     breakage, throttled, p95_ms, media_requests, media_bytes, media_errors, media_ms_p95_peak,
--     storage_bytes, db_active_conn_peak, db_avg_query_ms_peak, max_connections}
```
**Read `honest_peak_concurrency` + `max_concurrent_shards` — not the naive `offered_concurrency`.**
`offered_concurrency` is a blind per-shard sum, so staggered/queued shards (exactly what the runner-cap
probe above finds) inflate it even when those shards never actually ran at the same time.
`honest_peak_concurrency` is the event-sweep max of concurrency summed only across shards overlapping
at the same instant, and `max_concurrent_shards` is how many were overlapping at that peak — together
they're the honest answer to "how much concurrency did this run really prove," bounded by the runner
cap from step 2 above. The DB ceiling still shows as `db_active_conn_peak` approaching
`max_connections` with rising `db_avg_query_ms_peak`. `media_ms_p95_peak` + `media_errors` are the
egress-saturation signals — rising media p95 / error rate at the target concurrency means the Storage
egress path, not the DB, is the binding ceiling.

**4) Teardown** = §7 (prefer `select public.purge_synthetic_load_cohort();` — it spares the live 25 and
leaf-deletes the synthetic `push_notifications`/crew/telemetry residue the write legs create). **Never
`purge_synthetic_data()`** for a load test.

## Notes
- **Modeled revenue** is a Phase-A dashboard figure (GMV × take-rate, clearly labeled "modeled");
  **measured** revenue + real test-mode money + Donny AI spend are Phase B (a separate, gated plan).
- Downgrade the compute tier back to your steady operating size when the ramp session ends (cost).
