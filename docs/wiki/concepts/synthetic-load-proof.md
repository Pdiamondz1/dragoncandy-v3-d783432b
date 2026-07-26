---
title: Synthetic Load Proof (Phase A → 200K)
type: concept
created: 2026-07-26
updated: 2026-07-26
sources: [2026-07-24-synthetic-weight-load-economics-phase-a.md, 2026-07-24-synthetic-load-runner-matrix.md, 2026-07-25-credible-200k-load-matrix-slice2.md, 2026-07-26-200k-load-run-and-header-overflow.md]
tags: [synthetic, load-testing, scaling, github-actions, egress, postgres, capacity]
---
# Synthetic Load Proof (Phase A → 200K)

**How far the platform actually scales, proven by driving real RLS-enforced traffic at prod.**
Split out of [[Synthetic Weight Engine]] on 2026-07-26 — that page owns the *safety spine*
(registry, actor-OR-parent metric exclusion, kill switch, teardown) that makes any of this safe
to run against production; this page owns the *load program* built on top of it. The split was
forced by a real constraint: the combined page reached 33 KB, past OpenAI's 8,192-token embedding
ceiling, which silently blocked 41 wiki pages from syncing into Donny's RAG (see
[[Supabase .in() Header Overflow]]'s sibling lesson — batch operations fail wholesale).

**The one-line result:** across three escalating runs the **database has never been the
constraint** — 91% idle at ~312 concurrency (Phase A), 83% idle at 1,000 (the 50K band), 70% idle
at 4,000 (the 200K band). Every ceiling hit so far has been client-side: egress per runner IP,
then per-shard latency once media became real.

## Phase A — load proof & economics (2026-07-24, `feat/synthetic-weight-load-economics`)

Phase A turns the engine from *liveness/QA* (Phase 1) into a **load-proof + economics** engine
without weakening any Phase 0 invariant. Harness + one migration + a `/internal/simulation` dashboard
slice; prod stays byte-unchanged behind the kill switch, and the actual ramps are **founder-gated
operator runs** (a runbook), not part of the merge. Raw source:
`docs/wiki/raw/sessions/2026-07-24-synthetic-weight-load-economics-phase-a.md`.

**Framing:** the ask was "50,000-bot DAUs quickly"; the reframe that drove the design is **load =
concurrency, not headcount** (50K DAU ≈ ~800–1,000 peak concurrent → reproduce request VOLUME via a
reusable session pool + burst driver, not 50K standing sessions). With the user declaring real users
are testers too, Phase A runs **single-track on prod** and targets the saturation **knee** (measurable
degradation), never a true outage — so the observability RPCs stay responsive enough to record the
samples the curve needs (reversing Phase 0's "clone-only saturation" mitigation, owned explicitly).

- **Cross-tick session pool** (`sim/session-pool.ts`) — the keystone Phase 1 marked "deferred."
  Persists each bot's session to a gitignored `sim/.session-pool.json` and **refreshes** (1 call) or
  **reuses** (0 calls) instead of re-minting (2 calls) each tick — lifting the per-IP auth 429 wall.
  GoTrue rotates the refresh token on use → a **per-bot single-flight** guard collapses concurrent
  `getToken`s into one mint/refresh; `save()` is synchronous (temp-write→rename) so saves can't
  interleave. Sessions are **bound to `userId`**: after a purge + re-mint the same email maps to a new
  auth user, so an email-only cache would reuse the deleted user's JWT (empty/failed RLS) — a
  userId-mismatch is a cache MISS → fresh mint.
- **Two-lane bulk-seed** (`sim/seed.ts` + `seed_synthetic_cohort` RPC) — a **DEPTH pool**
  (`botseed_<cohort>_<i>`, bulk-inserted by the service-role RPC, **never authenticates** — just DB
  weight so listings look populated; idempotent via `extensions.uuid_generate_v5` +
  `on conflict do nothing`) and an **ACTIVE cohort** (`botla<seed>_<i>`, minted, session-capable).
  The distinct `botla` namespace is load-bearing: `generateCohort` emits index-based `bot001…`
  regardless of cohort label and the **live daily cohort already occupies `bot001…bot025`**, so
  reusing it would duplicate-email. The three namespaces (`botseed_`/`botla`/`bot0##`) are disjoint.
- **Ramped load driver** (`sim/load/driver.ts`) — reuses pooled sessions (pre-warmed serially),
  ramps concurrency in geometric steps via a bounded worker pool, and **stops at the knee** (error-rate
  OR relative-p95 degradation). **Collects ALL breakage signatures** (never abort-on-first) →
  `sim/.load-findings.json`, exitCode set after writing. `classifyError` scores 429/503/53300 as
  **throttle** (expected saturation), everything else as **breakage** (a real defect under load).
  `parseRamp` **fails loud** on any malformed spec (no silent one-step ramp). `load` drives **only
  session-capable bots** — `readSessionCapableBots` (`sim/mint.ts`) reads them by email pattern
  (`@synthetic…` AND NOT `botseed_%`), skipping the heavy crew/campaign graph.
- **Two service-role RPCs** — migration `20260724170000_sim_load_seed_rpcs.sql` (applied to prod):
  `seed_synthetic_cohort` (depth insert; email domain hardcoded so `handle_new_user` always tags;
  role only `content_creator`/`business_client` — cannot mint a privileged user) and
  `capture_sim_load_snapshot` (reads `pg_stat_activity`/`pg_stat_statements` via cross-schema
  `to_regclass`; degrades `avg_query_ms` to NULL if the extension is absent; `regclass` not user
  input → no injection). Both DEFINER, `service_role`-only. Snapshot capture runs **concurrently with
  the in-flight wave** (`Promise.all`) — a snapshot taken after the wave drained would see only the
  snapshot RPC, not the concurrency, so `active_connections/max_connections` (the curve's primary
  signal) would read artificially low.
- **`/internal/simulation` slice** — a `useSimLoadSnapshots` React-Query hook feeds a dark-ops-deck
  **load-curve table** (active/max conns · avg query · error rate); a **MODELED revenue** block
  (`computeModeledRevenue`: `synthetic_campaigns × $250 × 10% free-tier take`) styled deliberately
  distinct (dashed + `MODELED` badge + inline assumptions) so it can never read as real revenue.
  **Measured** revenue + capped Donny AI are **Phase B** (separate gated plan).
- **Runbook + findings template** — `docs/runbooks/synthetic-load-tier-ramp.md` (founder-gated ramp;
  §7 teardown warns **not** to use `purge_synthetic_data()` — it wipes the live 25-bot cohort — and
  deletes by the by-construction-safe prefixes `botseed_%`/`botla%_%`, disjoint from the live
  `bot0##`) + `docs/superpowers/load-findings/TEMPLATE.md` (the "what to fix before 50K DAUs" report).

### Phase A — the Codex gauntlet (8 real issues over 7 rounds, all fixed + regression-tested)

The mandatory second reviewer caught, in order: `load` driving the depth pool (per-IP 429); a
silent one-step ramp on a typo; the heavy `readCohort` running before the depth filter (oversized
`.in()` at 50K); comma-ramp silently dropping invalid tokens; the `creator_directory` action
selecting non-existent columns (`full_name`/`role` vs the view's `creator_name`) → a FALSE breakage
every run; the daily `tick` dragging in the depth pool after a bulk-seed; the DB snapshot captured
**after** the wave drained (artificially-low connection curve); and a stale pooled JWT reused after a
purge+re-mint. Each was a LEAD **verified against the code** (R3 against the real prod view schema via
`information_schema.columns`) before fixing — see [[Verify a reviewer's claim before accepting OR
dismissing]] and [[MCP execute_sql returns only the LAST statement's result]]. R7 was clean.

## Runner matrix (Slice 1) — multi-IP fan-out (2026-07-24, PR #337)

Phase A found a single runner caps at a **client-side egress wall (~312 concurrency)** while prod's
Postgres stays **~91% idle**. The runner matrix breaks that: it fans the SAME load driver across N GH
jobs (one runner IP each), so the *summed* offered concurrency pushes the DB toward its real ceiling.
**The ramp knob is the shard count** (each shard holds a fixed egress-safe C on its own IP; N shards ≈
N×C). Vehicle-agnostic — nothing GitHub-specific lives in `sim/`.

**What shipped:** `bulk-seed --with-content` (content seed onto the load cohort); a realistic **DAU
behavior mix** (`sim/load/actions-mix.ts`, ~90:10 read:write — feed/grid/media-HEAD-egress-proxy/
browse/search/geo/profile + 3 RLS-real writes: a public-free **draft** campaign, a bot→bot
`create-notification` to a synthetic peer, a direct Donny footprint); the `get_sim_load_matrix_summary`
aggregation RPC; the dynamic `synthetic-load-matrix.yml` workflow; a `/internal/simulation` "Matrix run
(summed)" card; and the runbook §8 matrix section. **Phase 6 (realtime WebSocket leg) was deferred** at
its hard split-point (its own connection quota → own spec+plan). Migrations applied to prod under the
careful gate; the 2-shard live smoke stays founder-gated.

**Load-bearing design rules (each verified against prod / caught by Codex):**
- **Writes are matrix-ONLY.** The driver default + the single-runner `load` path use the reads-only
  `DAU_READ_ACTIONS`; the write leg (`DAU_ACTIONS`) runs ONLY in matrix mode. Single-runner drives the
  LIVE `bot0##` cohort, which `purge_synthetic_load_cohort()` spares — so a write there would leak
  residue only `purge_synthetic_data()` (killing the live 25) could clean. (Codex P1.)
- **campaign_write uses `status='draft'`** — role-agnostic RLS (`with_check user_id=auth.uid()`, proven
  by a rollback-wrapped creator-insert probe), `enforce_active_campaign_limit` fires only on `published`
  so a draft is limit-exempt + invisible to real browse, still `is_synthetic` + teardown-cleaned.
- **Media is a HEAD + Content-Length proxy**, never a body GET (a full GET of the CDN video assets at
  high concurrency would self-inflict the egress wall it measures — spec §3a/§5).
- **Per-step FINAL snapshot.** In-flight sampling (needed so `active_connections` reads the real load)
  leaves a single-wave step's latest row at `count=0`, so a short soak reported 0 — a final per-step
  snapshot with true totals fixes it (DB peaks are MAX-across-rows, so the low post-wave reading can't
  lower them). (Codex P2.)
- **A matrix needs ≥2 shards** (`shards<=1` is the single-runner path the summary can't aggregate) and
  the workflow **suffixes the run-label with `github.run_id`** so each dispatch is a distinct label (the
  summary groups solely by `run_label`, latest-row-per-shard). (Codex R1.)
- **Teardown scoping is safety-critical:** the matrix uses `purge_synthetic_load_cohort()`
  (`botla%`/`botseed_%` ONLY, spares the live 25) — NEVER `purge_synthetic_data()`. It leaf-deletes the
  NO-ACTION `push_notifications.actor_id` + crew tables + telemetry before cascading the users, then
  deletes the non-cascading synthetic org.

Codex ran three rounds: R1 (2×P2) + R2 (P1+P2) fixed; **R3 ("creators can't INSERT campaigns") verified
FALSE** by the rollback-wrapped RLS probe and dismissed — see [[Verify a reviewer's claim before accepting
OR dismissing]]. data-exposure-reviewer PASS. Full session: `raw/sessions/2026-07-24-synthetic-load-runner-matrix.md`.

## Slice 2 — credible 200K (real egress + overlap-honest peak), 2026-07-25

Slice 1 proved the shard-count ramp knob but left two gaps between its number and a credible
"200K DAU": `media_fetch` was a HEAD proxy (no real bytes moved), and the summary's
`offered_concurrency` is a blind per-shard sum that staggered/queued shards (the GitHub
concurrent-runner cap) can inflate without ever being simultaneous. Slice 2 closes both, on
`feat/synthetic-load-matrix-200k`. Full session:
`raw/sessions/2026-07-25-credible-200k-load-matrix-slice2.md`.

- **`media_fetch` is now real egress.** A Range-capped (`bytes=0-262143`, 256 KiB) `GET` against a real
  public `dragonshare-content` object (the true serving path, 6 URLs verified `HTTP 206`) replaces the
  HEAD proxy. **Bounded egress is absolute:** the action REQUIRES a `206 Partial Content` response
  before reading any body — a `200` means the host ignored `Range` (would stream the full object,
  possibly chunked/no `Content-Length`) and is treated as a capped MISS (`{bytes:0, ok:false}`), never
  downloaded. A non-206/network failure is a **media error** (tallied apart from breakage, never trips
  the DB-saturation knee — unchanged convention from Slice 1). Worst-case egress for a run is
  computable up front: `≤ media_requests × 256 KiB`.
- **Media latency tallied.** The driver (`sim/load/driver.ts`) collects `MediaResult.ms` (fetch-only)
  per step and writes `media_ms_p50`/`media_ms_p95` to the snapshot notes.
- **Overlap-honest summary.** Migration `20260725140000_sim_load_matrix_overlap_summary.sql`
  `create or replace`s `get_sim_load_matrix_summary` to add a **bin-width-independent event-sweep**
  `honest_peak_concurrency` (max over time of summed concurrency among shards actually overlapping,
  evaluated at every snapshot instant — no bin-width parameter) + `max_concurrent_shards` (how many
  shards were overlapping at that peak — this number **is** the GitHub concurrent-runner cap) +
  `media_errors` + `media_ms_p95_peak` (a TRUE peak across ALL snapshots for the run, not
  latest-row-per-shard — a Codex P2 catch, since media p95 isn't monotonic across a soak the way DB
  connection counts are). The naive `offered_concurrency` is kept alongside so the staggering gap stays
  visible. Security posture unchanged from `20260724183000` (SECURITY DEFINER + in-body
  `is_internal_user()` + anon/public revoke). **Applied to prod 2026-07-26** (recorded
  `20260726024318`), verified through the *deployed* function by replaying both embedded fixtures —
  overlap → `honest=naive=400`, stagger → `honest=200` vs `naive=400`, the exact inflation it fixes.
- **`/internal` surfacing.** `useSimLoadMatrixSummary.ts` + `InternalSimulation.tsx`'s
  `MatrixSummaryCard` add "Honest peak concurrency" (pink, `N shards overlapped`), relabel "Offered
  concurrency" → `naive Σ`, relabel the media-bytes card to real Range-capped-GET bytes, and add "Media
  errors" + "Media p95 latency" StatCards.
- **Scale + runbook.** `MAX_SHARDS` 10→20 in `synthetic-load-matrix.yml`; the runbook's §8 gains the
  **credible-200K sequence**: (1) probe the per-shard knee single-runner **with real media firing**,
  using a **non-`matrix-*` run label** (`knee-probe-<date>`) so `/internal`'s "Matrix run (summed)" card
  — which reads the newest `matrix%` label — can't ingest a shard-less snapshot and render a bogus
  zero-shard summary; (2) discover the runner cap via a full-`MAX_SHARDS` dispatch with a short soak
  (queued shards start late and never overlap, so `max_concurrent_shards` reveals how many GitHub
  actually runs at once); (3) the 200K run at `shards = min(16, cap)` × the probed knee concurrency `C`,
  `soak_ms=120000`.

**Codex gauntlet (4 real findings, 5th pass clean):** egress cap not enforced when a host ignores
`Range`; a `200` (Range-ignored) still silently downloaded up to the cap (tightened to require exactly
`206`); the single-runner knee-probe reusing a `matrix-*` label would pollute the `/internal` matrix
card; `media_ms_p95_peak` computed from latest-row-per-shard instead of a true cross-snapshot max. SDD
per-task reviews (5 tasks) + whole-branch Opus review (**READY TO MERGE**) both passed.

## The 200K-band run — cap discovered, DB still idle (2026-07-26)

Slice 2 went live the next day: migration applied, a green 2-shard validation
(`matrix-slice2-val-20260726` — 400 concurrency, 25,400 requests, 0 breakage, 302 MB of real
Storage egress, 0 media errors), then the full **20-shard cap-discovery run**
(`matrix-cap-20260726e-30202071632.1`, 20 × C=200 × 120 s). Full session:
`raw/sessions/2026-07-26-200k-load-run-and-header-overflow.md`.

| | 50K band (07-24) | 200K band (07-26) |
|-|-|-|
| Shards × C | 5 × 200 | **20 × 200** |
| Offered / honest peak | 1,000 / n-a | **4,000 / 4,000** |
| `max_concurrent_shards` | n-a | **20** |
| Requests / breakage / throttled | 34,600 / 1 transient / 0 | **31,000 / 0 / 0** |
| Real media egress | none (HEAD proxy) | **369 MB, 0 errors** |
| **DB conns · avg query** | **15/90 · 7.05 ms** | **27/90 · 11.40 ms** |
| Overall p95 | ~3.4 s | **18.4 s** |

**Cap discovery answered.** `honest_peak_concurrency` came back **equal** to the naive
`offered_concurrency` with `max_concurrent_shards = 20` — GitHub ran all twenty shards genuinely
simultaneously, no queuing, no stagger inflation, so the concurrent-runner cap is **≥ 20**. (20 is
our `MAX_SHARDS`, not GitHub's ceiling; the cap is bounded from below, not discovered from above.)
The event sweep was independently re-implemented in SQL against the raw snapshots and reproduces
both figures.

**The headline: at ~4,000 offered concurrency — the 200K-DAU band — prod Postgres sat at 27 of 90
connections (~70% idle) at 11.40 ms average query time. The database is not the constraint at
200K.** Combined with Phase A (91% idle at ~312) and the 50K run (83% idle at 1,000), the DB has
never once been the limiting resource in this program.

**The knee moved to the client, hard.** Overall p95 went 1,935 ms at 400 concurrency → **18,427 ms**
at 4,000 — exactly Slice 2's predicted effect, since real 206-GET egress lowers the per-shard knee
well below Slice 1's HEAD-only ~312. Worth recording honestly: **the runbook's step-1 knee probe was
skipped** (validation → straight to 20 shards at the old C=200), so the 18 s p95 is the price of that
shortcut, not a prod capacity signal. A cleaner 200K profile is *more shards at lower per-shard C*,
which `MAX_SHARDS = 20` currently caps.

**Getting there required an unrelated fix.** Four consecutive 20-shard dispatches died in the seed
job on an opaque `TypeError: fetch failed` that looked exactly like a GitHub→Supabase network
outage. It was ours: an unbounded `.in()` of 500 bot emails overflowing undici's 16 KB header limit
— latent until `MAX_SHARDS` 10→20 doubled the cohort past the cliff, and latent *also* in
`mint.ts`'s `readCohort`, where it would eventually have broken the **daily `tick` cron**. Fixed in
PR #345; full mechanism, thresholds, and the diagnostic that kills the connectivity theory in
[[Supabase .in() Header Overflow]]. After the fix the seed minted all 500 bots **from one runner
IP** — 4× the previous 125-bot maximum, so the per-IP 429 backoff holds at that scale.

**Teardown to zero, again:** `purge_synthetic_load_cohort()` → 500 purged, all `residual_*` = 0,
live `bot0##` = 25 and the 2,000-profile [[Living Synthetic Marketplace]] cohort untouched, registry
back to 2,025. **One sharp gotcha:** running the purge inside a `DO` block ending in `RAISE`
**rolls it back** — that pattern is for read-only fixtures only; a real mutation runs as a plain
`select purge_synthetic_load_cohort();`.

**Still open / deferred:** `MAX_SHARDS = 20` caps a lower-C, better-latency 200K profile; the Phase-A
pre-scale advisor list (~231 `multiple_permissive_policies`, ~158 `auth_rls_initplan` on hot tables)
is untouched and still latent; Phase 6 (the realtime WebSocket leg) remains its own spec; a few stale
`driver.ts` comments describe the old proxy behavior; `media_ms_p50` is plumbed but not surfaced by
the summary RPC; `sim/tsconfig.json`'s strict typecheck is not wired into CI.


## See Also
- [[Synthetic Weight Engine]] — the safety spine this program runs on (registry, exclusion,
  kill switch, scoped teardown). Read that first.
- [[Supabase .in() Header Overflow]] — the unbounded-`.in()` 16 KB bomb that blocked the 20-shard
  seed four times while impersonating a network outage.
- [[Living Synthetic Marketplace]] — the persistent browsable `botmk_` cohort on the same spine.
- [[AIOS runtime spend source of truth]] — the `donny_cost_ledger` / 15% AI cap the synthetic
  exclusion protects.
