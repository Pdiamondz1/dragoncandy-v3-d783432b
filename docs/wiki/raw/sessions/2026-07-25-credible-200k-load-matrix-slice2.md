# Session — Synthetic Weight Engine: credible 200K-DAU load matrix (Slice 2)

Date: 2026-07-25
Branch: `feat/synthetic-load-matrix-200k`
Continues: [[Synthetic Weight Engine]] — Runner matrix (Slice 1), PR #337.

## Why

Slice 1's runner matrix proved the shard-count-as-ramp-knob idea, but two gaps kept the number from
being a credible "200K DAU" claim: (1) `media_fetch` was a HEAD + Content-Length **proxy**, not real
egress, so the matrix never actually moved storage bytes; (2) the summary RPC's `offered_concurrency`
is a blind per-shard sum — if GitHub queues/staggers shards (a real concurrent-runner cap), the naive
sum inflates a number that was never actually concurrent. Slice 2 closes both gaps and scales the
shard ceiling, spec: `docs/superpowers/specs/2026-07-25-credible-200k-load-matrix-design.md`, plan:
`docs/superpowers/plans/2026-07-25-credible-200k-load-matrix.md`.

## What shipped (5 TDD tasks)

1. **Real storage egress (`sim/load/actions-mix.ts`).** `media_fetch` now performs an actual
   Range-capped `GET` (`Range: bytes=0-262143`, 256 KiB) against a real public DragonCandy Storage
   object in `dragonshare-content` — the true serving path — instead of a HEAD against a dead
   third-party GCS URL. Six sample URLs, all verified reachable (HTTP 206) against prod
   `zocahiffooqdybdhguqv` on 2026-07-25. **Bounded egress is absolute, not best-effort:** the action
   REQUIRES a `206 Partial Content` response before downloading anything — a `200` means the host
   ignored the `Range` header (so it would stream the full object, possibly chunked with no
   `Content-Length`) and is treated as a capped MISS (`{bytes:0, ok:false}`), never downloaded. This
   closes the "un-Range-capped host defeats the cap" hole Codex flagged (round 3). A non-206/network
   failure is a **media error**, tallied apart from breakage — a storage 5xx never trips the
   DB-saturation knee (same convention as Slice 1).
2. **Media latency (`sim/load/driver.ts`).** `MediaResult.ms` (fetch-only latency, set inside
   `media_fetch`) is now collected per-step and written to the snapshot as `media_ms_p50`/`media_ms_p95`
   (`StepMetrics.mediaMsP50/P95`); a read action with no `ms` leaves both at 0.
3. **Overlap-honest summary (migration `20260725140000_sim_load_matrix_overlap_summary.sql`).**
   `create or replace`s `get_sim_load_matrix_summary` to add an **event-sweep, bin-width-independent**
   `honest_peak_concurrency` — the max over time of summed per-shard concurrency among shards actually
   overlapping (evaluated at every snapshot instant, so the true max-overlap instant is always covered
   — no bin-width parameter) — plus `max_concurrent_shards` (how many shards were overlapping at that
   peak; this number IS the GitHub concurrent-runner cap), `media_errors`, and `media_ms_p95_peak` (a
   TRUE peak — max across ALL snapshots, not just the latest row per shard, fixed in the Codex P2 pass
   below). The naive `offered_concurrency` is kept alongside so the staggering gap stays visible.
   Security posture unchanged from `20260724183000`: SECURITY DEFINER, `set search_path = public`,
   in-body `is_internal_user()` guard, `revoke … from anon, public` / `grant … to authenticated`.
   **Migration is written but NOT applied to prod** — founder-gated (careful skill).
4. **`/internal` surfacing.** `useSimLoadMatrixSummary.ts` gains the 4 new typed fields (no `types.ts`
   regen — the hook keeps its hand-typed `rpc` cast); `InternalSimulation.tsx`'s `MatrixSummaryCard` adds
   a "Honest peak concurrency" StatCard (pink accent, `N shards overlapped` subtitle), relabels "Offered
   concurrency" to `naive Σ across N shards`, relabels "Media egress (proxy)" to "Media egress" /
   "Σ real bytes (Range-capped GET)", and adds "Media errors" + "Media p95 latency" StatCards.
5. **Scale + runbook.** `.github/workflows/synthetic-load-matrix.yml` `MAX_SHARDS` raised `10→20`.
   `docs/runbooks/synthetic-load-tier-ramp.md` §8 gains a "credible-200K sequence" (2a): (1) probe the
   per-shard knee **single-runner with real media firing**, using a **non-`matrix-*` run label**
   (`knee-probe-<date>`) so `/internal`'s "Matrix run (summed)" card — which reads the newest `matrix%`
   label — can't pick up a shard-less single-runner snapshot and render a bogus zero-shard summary;
   (2) discover the runner cap via a full-`MAX_SHARDS` dispatch with a short soak (queued shards start
   late and never overlap, so `max_concurrent_shards` reveals how many GitHub actually runs at once);
   (3) the 200K run: `shards = min(16, cap)` at the probed knee concurrency `C`, `soak_ms=120000` (~2
   min, keeping the per-request 256 KiB cap a bounded aggregate at scale).

## Codex fixes (4, across the review gauntlet — 5 passes to clean)

- **P2 — egress cap not enforced when a host ignores `Range`.** `media_fetch` originally trusted
  `Content-Length`/response size on any 2xx; a host that echoes `200` on a Range request would stream
  the full (possibly large) object. Fixed by capping the read regardless of status.
- **P2 — a `200` (Range ignored) still silently downloaded up to the cap.** Tightened further to
  REQUIRE exactly `206` before touching the body at all — any other status (200/403/404/416/5xx) is a
  capped miss, zero bytes read.
- **P2 — the single-runner knee-probe would pollute the matrix card.** The runbook originally reused a
  `matrix-*`-prefixed label for the probe; fixed to use `knee-probe-<date>` so `/internal`'s "latest
  `matrix%` label" query can't ingest a run with no `notes.shard`.
- **P2 — `media_ms_p95_peak` used latest-row-per-shard, not a true peak.** The initial migration draft
  reused the `per_shard` CTE's `distinct on (shard) … order by captured_at desc` (latest sample) for
  `media_ms_p95_peak`, which under-reports if an earlier snapshot in the same run had worse latency
  (media p95 is not monotonic across a soak the way DB connection counts are). Fixed to `max(...)
  across ALL snapshots for the run, not just the latest row per shard.

All four fixed; the 5th Codex pass ran clean. SDD per-task reviews passed for all 5 tasks; the
whole-branch Opus review returned READY-TO-MERGE.

## Verified facts that shaped the writes (do NOT re-fabricate)

- Six `dragonshare-content` object URLs were curl-verified to return `HTTP 206` on a
  `Range: bytes=0-262143` GET against prod `zocahiffooqdybdhguqv`, 2026-07-25.
- The migration timestamp `20260725140000` was collision-checked via `git grep` across worktrees
  against both `20260724183000` (the Slice 1 summary migration it replaces) and the marketplace
  migrations `20260725120000`/`20260725130000` (same-day sibling branch).
- `docs/superpowers/load-findings/2026-07-24.md` is the source of the "single runner caps ~312
  concurrency on **egress**, not DB (DB 91% idle)" finding that motivates real egress in the first
  place — Slice 1's HEAD proxy could never have surfaced that ceiling honestly.

## Still founder-gated / deferred

- **Migration `20260725140000` is NOT applied to prod.** Applying it (careful gate) is a prerequisite
  for reading `honest_peak_concurrency`/`max_concurrent_shards`/`media_errors`/`media_ms_p95_peak` from
  `/internal` or SQL.
- **The live probe→cap→200K→verify→teardown sequence** (runbook §8/2a) has not been run. Key
  expectation: real egress will very likely **lower** the per-shard knee below Slice 1's HEAD-only
  ~312 figure, so the shard/concurrency split must be re-probed with real media before trusting a
  ~200K number.
- **Deferred minors:** a few stale `driver.ts` comments describing the old proxy behavior;
  `media_ms_p50` is plumbed through the driver/snapshot but not yet surfaced by the summary RPC or
  `/internal` (only `media_ms_p95_peak` is); `sim/tsconfig.json`'s strict typecheck is not wired into
  CI.

## Reviews

- SDD (spec-driven-development) per-task reviews: all 5 tasks passed.
- Whole-branch Opus review: **READY TO MERGE**.
- Codex second review: 4 real findings fixed across the rounds above; 5th pass clean.
