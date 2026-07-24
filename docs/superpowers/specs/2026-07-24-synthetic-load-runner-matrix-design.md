# Synthetic Load — Multi-IP Runner Matrix (Slice 1 of the "Road to 1M DAU" decomposition)

**Goal.** Fan the synthetic load driver out across **N GitHub Actions runners (distinct egress IPs)** and
**sum** their concurrency, so we can push *past the single-runner egress wall* and actually pressure prod's
database toward the **~1,000-peak-concurrent band that brackets 50K DAU** — then sustain it as a bounded,
re-triggerable **soak** — to answer: *does the current compute tier hold 50K, and what do we optimize to hold
more per dollar?* **50K is the lower barometer, not the ceiling:** the driver is written **vehicle-agnostic**
and the matrix **ramps by shard count**, so the same code scales toward the **~16–20K concurrent of 1M DAU**
(≈ 80 shards) later without a rewrite.

**Scope boundary.** This spec is **Slice 1 only** — the load-*generation* capability. Two sibling slices are
explicitly **out of scope here** and tracked separately:
- **Slice 2 — "Road to 1M DAU" readiness + cost model** (a separate design doc, written next): what it takes
  (Supavisor pooler, read replicas, cache/CDN, compute tiers) and the **$/mo at the 50K / 250K / 1M rungs** +
  the revenue those DAUs imply. Analysis, no build.
- **Slice 3+ — actually building higher-scale infra**, staged, only as real demand approaches, guided by Slice 2.

**Founder-gated & prod-degrading** — same safety envelope as `docs/runbooks/synthetic-load-tier-ramp.md`
(kill switch, off the 14:00 UTC daily tick, knee-not-outage, segregation, teardown). Do not automate.

---

## 1. What is already built + what today proved

- **Single-runner harness is live and works end-to-end** (PR #335, merged to main): `sim/load/driver.ts`
  (ramp + knee detection + findings collection), `sim/run.ts` `cmdLoad` (drives load through
  `readSessionCapableBots`, which excludes the depth pool and targets the live `bot0##` cohort + any
  `botla…` active cohort), `sim/session-pool.ts` (cross-tick refresh-not-remint), the
  `capture_sim_load_snapshot(p_run_label, p_error_rate, p_notes)` RPC, and the `synthetic-weight.yml`
  workflow (daily tick + a single-runner `load` convenience dispatch).
- **First live ramp (2026-07-24, `docs/superpowers/load-findings/2026-07-24.md`)** proved the
  path but hit a **single-runner egress wall at ~312 concurrency**: p95 rose 268→716ms while the
  **prod DB stayed 91% idle** (peak **8 of 90** connections, ~0.5ms avg query, **0 429s** — the session
  pool worked). The knee was **client-side** (one IP / one Node process / socket + Cloudflare/PostgREST
  per-IP concurrency), exactly spec §4b of the load-economics design. **One runner physically cannot load
  the DB.** This spec is the fan-out that can.
- **Baseline:** prod `max_connections = 90`; `pg_stat_statements` + `uuid-ossp` in the `extensions` schema;
  the safety spine (`synthetic_users`, `is_synthetic*`, `SYNTHETIC_BOTS_ENABLED` kill switch,
  `purge_synthetic_data`, `platform_weight.*_real` split) unchanged.

## 2. Decisions locked in brainstorming

1. **Vehicle = GitHub Actions matrix now; driver vehicle-agnostic.** Cheapest, zero standing infra, proves 50K
   fastest, scales by shard count. The standing **VM fleet is deferred** (YAGNI at this rung) and belongs to
   Slice 2's roadmap for rungs needing > ~20 IPs. Nothing GitHub-specific lives in `sim/`.
2. **Ramp dimension = shard count.** Each shard holds a **fixed, egress-safe concurrency C (~200)** — *below*
   the single-runner ~312 wall — and we scale **S**. Summed offered load = **S × C**. The "knee" becomes a
   **whole-system** property (does the DB strain as S grows?), not per-process.
3. **Distinct bots per shard.** The per-IP 429 wall means each shard safely mints its **own ~25-bot slice from
   its own runner IP** (25 mints/IP regardless of S). Shard N owns bots `[N·25 … N·25+24]` — faithful
   "distinct real users," no same-bot-across-IPs sessions.
4. **Bounded, re-triggerable soak.** Each dispatch holds fixed S for a duration D (≤ ~5.5h/window, under the
   GH 6h job cap) with **mid-window token refresh**; "keep it there" = re-dispatch / schedule windows.
5. **No tier money in Slice 1.** Prove the **current** tier's headroom + harvest per-dollar optimizations;
   tier-stepping (and the willingness to buy tiers) is a Slice 2 concern.
6. **Cost guardrail.** A hard `max_shards` cap in the workflow prevents a runaway fleet / Actions-minute burn.

## 3. Architecture & scale model

One dynamic matrix workflow (`.github/workflows/synthetic-load-matrix.yml`, new — the existing
`synthetic-weight.yml` daily tick is **untouched**):
- A tiny **`setup` job** turns a `shards` dispatch input (e.g. `5`) into a JSON array (`[0,1,2,3,4]`) via
  `fromJSON`, output to the matrix. A **`max_shards` cap** (e.g. 10) is enforced in `setup` — a larger input
  fails the job loudly rather than spawning a runaway fleet.
- The **`load` job** fans that array into **N parallel matrix jobs — one shard per runner, one runner per
  egress IP**. Each shard runs the driver with plain params: `--shard <N>`, `--shards <S>`,
  `--concurrency <C>`, `--soak-ms <D>`, `--run-label matrix-<ts>`. Inputs pass through **env vars, never
  interpolated into the run script** (mirrors the existing workflow's injection-safe pattern).
- **Vehicle-agnostic:** `sim/` receives shard identity + concurrency + duration as arguments and knows
  nothing about GitHub. The workflow YAML is the *only* throwaway piece; the identical driver later runs on a
  VM fleet for the 1M rungs.

## 4. Per-shard sessions & cohort

- **Seed once up front** via the existing `bulk-seed`: a large **depth pool** (`seed_synthetic_cohort`, never
  authenticates — populates browse/feed/search/dashboards so hot queries hit realistic row counts) **plus an
  active cohort sized `25 × max_shards`** (minted through `mint.ts` / `auth.admin.createUser`, session-capable).
- **Shard-slice selection (new):** `cmdLoad` selects the active bots owned by this shard — shard N →
  `[N·25 … N·25+24]` — from `readSessionCapableBots`, so each shard drives distinct users. Each shard's
  session pool is ephemeral (fresh mint at job start, 25 mints from its own IP → 429-safe).
- **Soak refresh (new):** the driver's hold loop **refreshes** pooled tokens (one refresh call) before the
  ~1h TTL, so a long hold never throws `401 JWT expired` (which the driver would misclassify as breakage).

## 5. Aggregation & reporting

- Every shard writes `sim_load_snapshots` under a **shared `run_label` (`matrix-<ts>`)** with `shard`,
  offered `concurrency`, and client metrics (ok/throttle/breakage/p50/p95) in the `notes` jsonb.
- The **DB-side** columns (`active_connections`, `avg_query_ms`) are **global** (every shard samples the same
  database) → the summary takes the **peak** across shards. The **client-side** metrics are per-shard → the
  summary **sums** throughput/concurrency and **maxes** p95.
- New read RPC **`get_sim_load_matrix_summary(p_run_label)`** (service-role, SECURITY DEFINER, `search_path=
  public`, revoked from anon/authenticated) returns the one decision row: *at S×C offered concurrency, the DB
  peaked at X/90 connections, Y ms avg query, Z% aggregate error, over the window.*
- `src/pages/internal/InternalSimulation.tsx` renders the summed curve. Each shard uploads its
  `sim/.load-findings.json` as artifact `findings-shard-<N>` (fixing today's single-runner artifact-loss),
  merged into the Load Findings Report (`docs/superpowers/load-findings/<date>.md`).

## 6. Knee/stop & soak semantics

- **Whole-system knee:** as S is stepped up across dispatches, stop stepping when the shared DB reading crosses
  a threshold — `active_connections` approaching 90, `avg_query_ms` climbing, or aggregate error ≥ 10%.
  Individual shards still **fail loud on breakage** (non-throttle errors).
- **Success = the 50K band (S×C ≈ 1,000) held with the DB healthy** (well under 90 conns, low latency, ~0
  breakage) for the soak duration.
- **Graceful stop:** each shard's hold loop **re-checks `SYNTHETIC_BOTS_ENABLED` every snapshot cycle** — so
  flipping the switch off **drains all shards within a cycle** (no `gh run cancel` needed; cancel remains the
  blunt stop). This is new: the existing boot gate only checks at start.

## 7. Safety envelope (existing contracts + matrix additions)

- **Kill switch:** per-shard boot gate (existing) **+** the periodic in-soak re-check (new, §6).
- **Off-cron, founder-gated dispatch, knee-not-outage** (stop stepping S at the whole-system knee — never a
  DoS; observability must stay responsive).
- **Segregation unchanged:** all synthetic, `is_synthetic`-filtered; real KPIs byte-identical before/after each
  run (verified every run per the runbook).
- **Teardown:** prefix-match delete (`botseed_%` depth + `botla%` active), **NEVER `purge_synthetic_data()`**
  (kills the live 25 daily-tick cohort). The active cohort is just larger now (25×shards); same prefix, same
  clean cascade (depth/active users have no crew rows — see
  `[[project_synthetic_weight_task8_teardown_fix]]`).
- **Cost guardrail (new):** `max_shards` cap in the workflow; Actions-minute cost scales with S×duration
  (cheap at the 50K rung — the reason the VM fleet is deferred to Slice 2).
- **Test-Stripe-only** boot assertion unchanged.

## 8. Files

**New:** `.github/workflows/synthetic-load-matrix.yml` (setup → dynamic matrix load job);
migration `<ts>_sim_load_matrix_rpcs.sql` (`get_sim_load_matrix_summary`, service-role only).
**Modified:** `sim/run.ts` (`cmdLoad`: `--shard`/`--shards`/`--concurrency`/`--soak-ms`, shard-slice cohort
selection); `sim/load/driver.ts` (fixed-concurrency soak-hold with mid-window token refresh + periodic
kill-switch re-check); `src/pages/internal/InternalSimulation.tsx` (summed matrix curve);
`docs/runbooks/synthetic-load-tier-ramp.md` (matrix section: dispatch, shard-count ramp, aggregation read,
larger-cohort teardown).
**Reuse (no change):** safety spine, `seed_synthetic_cohort`, `capture_sim_load_snapshot`, `mint.ts`,
`session-pool.ts`, `env.ts`, `synthetic-weight.yml`.

## 9. Verification

- **Unit** (fake-auth-server + pure-function, mirroring the existing `sim/` suite): shard-slice selection
  (shard N → bots `[N·25…]`, disjoint across shards); soak-refresh (a held session refreshes before the TTL,
  **0 re-mints**); matrix-summary aggregation (sums client metrics, peaks the DB reading); `max_shards` cap
  rejects an over-limit input.
- **Live, founder-gated:** a **2-shard smoke** proving distinct egress IPs, summed concurrency, **no
  cross-shard 429**, byte-identical segregation, and clean teardown (residue 0, live 25 survive) — *before*
  any full ramp.
- **Load:** stepping S drives `sim_load_snapshots` toward the whole-system knee; `get_sim_load_matrix_summary`
  reconciles summed client throughput with the DB-side peak; observability stays responsive (knee, not outage).
- **Gates:** `npm run build` / `typecheck` / `test`; **edge-function-reviewer + data-exposure-reviewer** on the
  new RPC + workflow (service-role, prod); **Codex** second review before the PR; the **`careful`** gate before
  the first prod matrix dispatch.

## 10. Open questions / risks

- **Single-DB observability under real load.** Once shards actually load the DB, `capture_sim_load_snapshot`
  itself competes for a connection; at the true knee the snapshot may degrade. Mitigated by knee-not-outage
  (we stop before saturation) — but note it as a measurement caveat.
- **PostgREST/pooler in front of the 90 connections.** The app's data API already reuses connections; the
  *effective* ceiling at scale is the pooler config, not raw `max_connections`. Quantifying that is a Slice 2
  question; Slice 1 just measures where degradation first appears at the current config.
- **Actions-minute cost at higher rungs.** Fine at S≤10 (50K); at S≈80 (1M) GH minutes become significant —
  the concrete trigger to migrate to the VM fleet (Slice 2).
- **GH runner concurrency limits.** The account's max concurrent runners caps S per dispatch; verify the plan's
  limit before assuming a given S is reachable in one window.
- **Same-second mint thundering herd.** All shards mint at job start; each is a distinct IP (25/IP) so no per-IP
  429, but confirm no *global* GoTrue rate limit bites at S×25 near-simultaneous mints; stagger if needed.
