---
title: Credible 200K-DAU Load Matrix (Sub-project C, Slice 2)
type: spec
created: 2026-07-25
status: draft
branch: feat/synthetic-load-matrix-200k
supersedes-context:
  - docs/superpowers/specs/2026-07-24-synthetic-load-runner-matrix-design.md (Slice 1 — shipped/merged)
---

# Credible 200K-DAU Load Matrix — Sub-project C, Slice 2

## 1. Goal

Prove DragonCandy can serve a **200K-DAU-equivalent** load with a number that is
**credible, not hollow** — by (a) making the load exercise the one path we have never
tested (real storage/CDN **egress**), (b) scaling the multi-IP matrix to the ~200K band,
and (c) making the summed-concurrency figure **impossible to inflate** with staggered
shards. The deliverable is a documented, reproducible 200K-band run with a defensible
peak-concurrency number and a real egress ceiling, plus the honest ceiling we can reach on
the current GitHub plan if it is below 200K.

## 2. Context & Prior Art (do not re-derive)

Slice 1 (the multi-IP runner matrix) is **built, reviewed, merged, and proven** — PRs #337
+ #338 on `main`; three migrations applied to prod; `data-exposure-reviewer` PASS; Codex
clean; 153 sim tests. Two live runs on prod established the facts this slice builds on:

- **2-shard smoke**: 100 concurrency across 2 runner IPs, summed correctly, **0 cross-shard
  throttle**.
- **50K-DAU ramp** (5 shards × C=200 = 1,000 offered): 34,600 requests, ~0 breakage, 0
  throttle. **Headline: prod DB peaked at 15/90 connections, 7 ms avg query — ~83% idle.**
  The database is **not** the constraint (≥6× headroom). The wall is **client/egress per
  shard** (~312 concurrency/runner), which is why we fan out across runner IPs.

**Implication that shapes this slice.** Re-running *reads* bigger teaches us little — the DB
answer is known. The two things that make a bigger run worth doing are **realism** (the
untested egress path is the likely real bottleneck at DAU scale) and **credibility** (a
summed number that reflects concurrency that actually happened). Both are in scope; a raw
"reads at 200K" number is not the goal.

Key current-state facts (verified 2026-07-25 by reading the merged code):

- `sim/load/actions-mix.ts` — `media_fetch` (weight 15) is a **HEAD** of `SAMPLE_MEDIA_URLS`
  (four third-party GCS `gtv-videos-bucket` URLs that now **403** to runner IPs). Returns
  `{bytes, ok}`; external media errors are tallied **apart from breakage** (the #338 fix) so
  a dead CDN never trips the DB-saturation knee. `buildHotActions({ mediaUrls, fetchImpl })`
  already injects the pool and fetch impl — the seam for real egress exists.
- `.github/workflows/synthetic-load-matrix.yml` — `env.MAX_SHARDS: "10"`; a `setup` job
  validates `2..MAX_SHARDS`; a self-contained `seed` job bulk-seeds `25×shards` `botla` bots
  (+content) from the `synthetic-weight` Environment secrets; a `load` matrix job = one shard
  per runner IP, `SIM_RUN_LABEL = <label>-<run_id>.<attempt>` (unique per dispatch).
- `get_sim_load_matrix_summary(text)` (migration `20260724183000`) sums the **latest-
  captured_at row per shard** for a run label — **with no check that the shards' sample
  windows overlapped in time.**
- Teardown = `purge_synthetic_load_cohort()` (botla%/botseed_% only, spares the live `bot0##`
  25; residual-verified to zero). Kill-switch = `SYNTHETIC_BOTS_ENABLED` (every shard
  fail-closes at boot and drains on an in-soak re-check).

## 3. Non-Goals (explicitly deferred)

- **Realtime WebSocket load (Phase 6)** — a distinct load *dimension* with its own connection
  quota; its own spec/plan/slice.
- **RLS advisor hardening** (`multiple_permissive_policies` + `auth_rls_initplan` on hot
  tables) — the 50K run showed the DB idle *without* it. Revisit **only if** the 200K run
  surfaces DB pressure. Not in this slice.
- **`types.ts` full regen** — the existing cast in `useSimLoadMatrixSummary` works.
- **Compute-tier stepping** — moot while the DB is idle.
- **A true 1M run** — 200K is this slice's target; 1M is a later scale point.

## 4. Architecture

Four parts, all on the existing matrix; each independently reviewable.

### 4a. Real storage egress (the linchpin)

Replace the HEAD-of-a-dead-CDN with a **real GET of a reachable, public DragonCandy Storage
object**, so `media_fetch` exercises the actual path that serves real users' media (DNS →
TLS → Supabase Storage → S3 origin). This is the untested bottleneck.

- **Media pool = real, public, reachable DragonCandy Storage object URLs.** Sourced as a
  curated static list of known-public objects verified reachable (HTTP 200) at plan time.
  **11 public buckets confirmed on prod (2026-07-25)** — the pool draws from
  **`dragonshare-content`** (the real user-media serving path — most realistic egress target)
  and **`help-screenshots`** (reliable public images as a fallback). Public-object URL form:
  `…/storage/v1/object/public/<bucket>/<path>` (the plan reads real object paths from
  `storage.objects` and verifies each returns 200). Read-only GETs of existing public objects:
  **no seeding, no writes, no teardown impact, no data pollution.** The pool stays injectable
  via `buildHotActions({ mediaUrls })` so it can be overridden or later sourced from prod
  `content_file_path`s.
- **Bounded egress via a `Range` cap.** Each `media_fetch` issues `GET` with
  `Range: bytes=0-<CAP-1>` (default cap **256 KB**). This exercises the full serving path
  while making total egress **computable and hard-capped**: `total ≤ media_requests × 256KB`,
  regardless of object size in the pool. Tally the actual bytes returned (`Content-Length` /
  body length). A server that ignores `Range` and returns a small object is fine (we tally
  the real size); a large object is capped.
- **Egress saturation must be observable.** Measure **media request latency** (ms) **inside
  `media_fetch`** (the fetch call only — distinct from the driver's per-task `ms`, which also
  includes the `botFor` client lookup `media_fetch` doesn't use, so the task `ms` is not the
  egress signal), alongside the existing bytes/error tallies, carried into `StepMetrics` +
  snapshot `notes` (`media_ms_*`). Under egress pressure the signal is *rising media latency
  and media error rate* — for this slice that is the **headline ceiling indicator**, not noise.
  Keep media errors tallied **apart from DB breakage** (our storage 5xx/timeout under load is
  an egress-ceiling finding, not an app bug). Media latency, media error rate, and media bytes
  are then aggregated by the overlap summary RPC (§4b) and shown on the dashboard as
  **first-class matrix outputs**, not merely per-shard notes.
- **Cost bound.** The egress run uses a **short bounded soak (~2 min), explicitly overriding
  the workflow's 30-min `soak_ms` default** (at 30 min the egress would be ~15× larger). The
  plan MUST set the short soak for the egress run and state the computed worst-case egress
  bytes/$ up front. Worst case at the 200K target (~4,000 concurrency, ~2-min soak, media = 15%
  of the mix, 256 KB cap) is on the order of a few GB ≈ cents.

### 4b. Overlap-honest summation (credibility, non-negotiable)

If GitHub queues shards past the concurrent-runner cap, the queued shards do not overlap in
time, yet `get_sim_load_matrix_summary` would still sum their per-shard peaks into a
concurrency **that never occurred**. Fix the summation to report a **time-overlap-honest peak
concurrency**: the maximum, over time, of the *sum across shards of per-shard concurrency at
that instant*.

- Implement by an **event-sweep** (bin-width-independent, exact): compute each shard's active
  interval `[min(captured_at), max(captured_at)]` for the run label; then at each snapshot's
  `captured_at`, sum the latest-known concurrency of every shard whose interval contains that
  instant; the honest peak is the **max of those per-instant sums**. This deliberately avoids a
  bin-width parameter — snapshots land every `SAMPLE_EVERY_MS` (5 s), so a fixed bin finer than
  the cadence would drop a running shard from bins it spanned (silent undercount) while a bin as
  coarse as the whole run reproduces the naive over-count this section exists to kill. A single
  shard at an instant cannot inflate its own sum.
- Return, alongside the honest peak: **`max_concurrent_shards`** (the most shards active at any
  swept instant) and the **naive sum** (old value) so the discrepancy is explicit. If honest ≈
  naive, all shards overlapped (good); a gap means GitHub staggered them (the number is bounded
  by the runner cap).
- This is a new migration (`CREATE OR REPLACE get_sim_load_matrix_summary` or a companion
  function), same security posture as the original (SECURITY DEFINER, `authenticated` +
  in-body `is_internal_user()` guard, revoke anon/public). Founder-gated apply.
- `useSimLoadMatrixSummary` + `InternalSimulation.tsx` surface the honest peak +
  `max_concurrent_shards` (the naive sum can remain as a secondary/debug figure).

### 4c. Scale to the 200K band

- Raise `env.MAX_SHARDS: "10"` → **`"20"`** (a ceiling; the operator dispatches fewer).
- **Target ≈ 4,000 offered concurrency** ≈ 200K DAU per the project's own
  "80-shards-for-1M / ~250-concurrency-per-shard" model → **~16 shards × C=250**.
- **The split is not fixed a priori** — it is set by the re-probed per-shard knee (§4d),
  because real egress (§4a) lowers each shard's sustainable C below the HEAD-only ~312. Fewer
  shards at higher C is preferable (less likely to exceed the GitHub concurrent-runner cap),
  but only up to the egress knee. The final split is chosen from the probe.

### 4d. Execution sequence & safety

1. **Re-probe the per-shard knee *with real media*** — a **single-runner ramp** (`shards ≤ 1`,
   `--ramp`, stepped C). The matrix path is fixed-C by construction (`planLoad` returns a
   single-step ramp for `shards > 1`), so a *stepped* knee probe must be single-runner — and it
   already fires real `media_fetch`, which is a read in `DAU_READ_ACTIONS`. It finds the
   concurrency at which one shard's *egress* (media latency/error) or transport breakage knees,
   replacing the stale HEAD-only C=200 assumption. Caveat: single-runner omits the ~10% write
   leg the matrix adds, so treat its knee as a slight **over**-estimate of the per-shard
   sustainable C under the full matrix mix (shade C down a step for the run).
2. **Discover the runner cap** — a **separate high-shard dispatch** (e.g., full `MAX_SHARDS`=20).
   Only a dispatch requesting *more* shards than the cap can reveal it: the overlap-honest
   `max_concurrent_shards` (§4b) from that run **is** the GitHub concurrent-runner cap for this
   account (the API does not expose the plan tier). A 2-shard run could only ever show
   `max_concurrent_shards ≤ 2` and prove nothing about a cap ≥ 2.
3. **200K run** — dispatch `~16 × C(from step 1)` (or the largest N×C the cap from step 2
   allows), bounded soak, real egress on.
4. **Verify** — read the overlap-honest summary; assert peak concurrency, DB peak
   connections/query-ms (headroom re-confirmed), media egress bytes + media latency/error
   ceiling; **segregation** (real KPIs byte-identical before/after); **teardown**
   `purge_synthetic_load_cohort()` residual-verified to zero, live `bot0##` 25 intact.
5. **Honest ceiling** — if the cap (step 2) forces N×C below ~4,000, report the credible
   ceiling reached and name the path past it (paid plan / self-hosted runners) as a
   **finding**, not a failure.

Safety is unchanged and reused: `botla`-scoped throughout; `SYNTHETIC_BOTS_ENABLED`
kill-switch; the existing `purge_synthetic_load_cohort()`; manual-dispatch-only workflow;
bounded egress cost; new branch/worktree off `main`.

## 5. Components & Interfaces

| File | Change |
|------|--------|
| `sim/load/actions-mix.ts` | `media_fetch`: `Range`-capped **GET** of a real public object; new default `mediaUrls` = curated public DragonCandy Storage URLs; `MediaResult` gains latency (ms); `buildHotActions` gains an optional `rangeCapBytes` (default 256 KB). Errors still non-throwing, tallied apart from breakage. |
| `sim/load/driver.ts` | Tally per-step **media latency** (+ existing bytes/errors) into `StepMetrics` + snapshot `notes` (`media_ms_*`). No change to the read/write action set contract. |
| `.github/workflows/synthetic-load-matrix.yml` | `MAX_SHARDS: "10"` → `"20"`. (Inputs already parameterize shards/C/soak.) |
| `supabase/migrations/<ts>_sim_load_matrix_overlap_summary.sql` (`<ts>` strictly after Slice-1's `20260724183000`, collision-checked vs concurrent worktrees at write time) | Overlap-honest summary: **event-sweep** peak concurrency (§4b) + `max_concurrent_shards` + naive sum, **plus** `media_errors` (sum) and media latency (max + avg of the new `media_ms_*` notes) so the egress signal is aggregated, not just per-shard. Same DEFINER/guard/grants as `get_sim_load_matrix_summary`. |
| `src/hooks/useSimLoadMatrixSummary.ts` + `src/pages/internal/InternalSimulation.tsx` (paths to confirm) | Surface the honest peak + `max_concurrent_shards` + **media latency + media error rate + media bytes** (the egress-ceiling indicators). |
| `docs/runbooks/synthetic-load-tier-ramp.md` | Matrix section: real-egress note, the re-probe-knee → 200K sequence, overlap-honest read, MAX_SHARDS=20. |

Interfaces stay small and testable: `media_fetch` is a pure `(fetchImpl, mediaUrls,
rangeCapBytes) → MediaResult{bytes, ok, ms}`; the summary is a pure SQL aggregate over
`sim_load_snapshots`; both unit-testable offline (fetch injected; SQL via a VALUES fixture
like Slice 1's read-only aggregation test).

## 6. Error Handling

- **External/own media error** → non-throwing, tallied as a media error + (now) a latency
  sample; never a DB breakage. Under load, a rising media error/latency curve **is** the
  egress-ceiling signal.
- **DB/transport breakage** → unchanged; the CI non-zero exit on breakage stands.
- **Kill-switch flip** mid-soak → shards drain within a snapshot cycle (existing behavior).
- **Queued shards / cap exceeded** → not an error; the overlap-honest summary bounds the
  number and `max_concurrent_shards` exposes it.
- **Seed 429 on a bigger cohort** → the seed job bulk-inserts from one fresh runner IP with
  the existing 429 backoff; `25×16 = 400` `botla` is within the proven bulk-seed path.

## 7. Testing

- **TDD, offline sim tests** (Vitest, injected fetch): `media_fetch` issues a `Range`-capped
  GET, returns real bytes ≤ cap, records latency, and a non-2xx/throw yields
  `{ok:false}` + a latency sample without throwing; the media pool defaults to the curated
  public URLs.
- **Summary SQL test**: a read-only VALUES fixture of staggered vs overlapping shard snapshots
  proves the event-sweep honest peak equals the naive sum only when all shards overlap and is
  strictly below it when they are staggered (mirrors Slice 1's `requests=220` aggregation test).
  Include a case where one shard's interval fully precedes another's (zero overlap) — the naive
  sum would report double the true peak there, so the test fails without the sweep.
- **Reachability check** (plan time, not a unit test): confirm each curated media URL returns
  200 to a `Range` GET before locking the pool.
- **Live**: the re-probe-knee dispatch, then the 200K-band run, then the verify + teardown of
  §4d — each gated by the `careful` skill (prod migration apply, live dispatch).
- Full gate parity with Slice 1: `npm run build`, sim tests, app typecheck, eslint;
  `data-exposure-reviewer` on the new migration; Codex second review until clean.

## 8. Risks & Open Questions

- **GitHub concurrent-runner cap is unknown** (personal account; API hides the plan tier).
  Mitigated by design: the overlap-honest summary + the cap probe make the number truthful
  regardless, and a sub-200K cap becomes a documented finding, not a failure.
- **Real egress shifts the per-shard knee** below the HEAD-only ~312 — handled by re-probing
  (§4d step 1) rather than assuming.
- **Egress cost** — bounded by the `Range` cap + bounded soak; the plan states worst-case
  bytes/$ before the run.
- **Media pool reachability/rot** — a curated public-object list can rot; the plan verifies
  200s at lock time and the pool is injectable for a quick swap.
- **Which buckets are public** — resolved (2026-07-25): 11 public buckets on prod, notably
  `dragonshare-content` (real serving path) + `help-screenshots`. The plan finalizes exact
  reachable object paths before locking the pool.

## 9. Success Criteria

1. `media_fetch` performs a real, bounded GET of DragonCandy storage; media bytes + latency +
   error rate are first-class matrix outputs.
2. The matrix summary reports a **time-overlap-honest** peak concurrency + `max_concurrent_
   shards`; a staggered-shards fixture proves it cannot be inflated.
3. A prod run reaches the **200K-DAU band (~4,000 honest concurrency)** — or documents the
   credible ceiling the runner cap allows, with the path beyond named.
4. The run yields a real **egress ceiling** (or shows egress headroom too) and **re-confirms
   DB headroom**.
5. Segregation holds byte-identically; teardown residual-verified to zero; live `bot0##` 25
   untouched; egress cost within the stated bound.
