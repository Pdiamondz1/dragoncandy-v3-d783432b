# Load Findings Report — <date> · tier <TIER> · run <run-label>

> Generated after a synthetic load ramp per `docs/runbooks/synthetic-load-tier-ramp.md` §6. This is the
> actionable **"what to fix before 50K DAUs"** list. Copy this file to `docs/superpowers/load-findings/<date>.md`
> and fill it in. Sources: `sim/.load-findings.json`, `extensions.pg_stat_statements`, Supabase
> `get_logs`, `get_advisors`, and `sim_load_snapshots`.

## Run summary
- **Tier / compute:** <e.g. SMALL, 2-core / 2GB, $X/mo>
- **Connection ceiling (`max_connections`):** <90 at baseline>
- **Knee concurrency:** <where sustained latency/error degradation began>
- **p95 `avg_query_ms` at knee:** <…>  ·  **error rate at knee:** <…>
- **Storage:** `platform_weight.storage_bytes` delta <…> × $/GB = <$…>
- **Segregation check:** real `aios_*` / `platform_weight.*_real` byte-identical before/after? <yes/no>
- **Egress caveat:** single-runner or matrix? did 429s dominate below the DB ceiling? <…>

---

## 1. Bugs (things that broke under load — from `sim/.load-findings.json`)
> Each breakage signature `{endpoint, status, error, count, firstSeenConcurrency}`. These errored under
> concurrency but not under light use → real defects.

| Severity | Endpoint | Status | First seen @ concurrency | Count | Error | Fix hypothesis |
|---|---|---|---|---|---|---|
| <P1/P2/P3> | <e.g. campaigns browse> | <e.g. 500> | <e.g. 500> | <n> | <message> | <one line> |

_(If empty: "No breakages — all errors under load were throttle/saturation (429/503), which is expected.")_

## 2. Bottlenecks (what saturates first)
### 2a. Slowest / hottest queries (`extensions.pg_stat_statements`, reset before the ramp)
| Query (truncated) | calls | total_exec_time | mean_exec_time | Candidate fix (index / rewrite / cache) |
|---|---|---|---|---|
| <…> | <…> | <…> | <…> | <…> |

### 2b. Saturation shape (`sim_load_snapshots`)
- Connections vs ceiling at the knee: <active/max>. Pooler in front? <…>
- Latency curve: <flat until N, then …>.

### 2c. Advisors (`get_advisors` — bite harder at scale)
| Advisor | Object | Why it matters under load | Fix |
|---|---|---|---|
| <missing index / unindexed FK / RLS-perf> | <table> | <…> | <…> |

## 3. Improvements (capacity + optimization)
- **Tier recommendation:** <which tier comfortably holds the target, and its $/mo> — from the per-tier curve.
- **Query optimizations:** <top index/rewrite candidates from §2a/2c, ranked by expected win>.
- **Caching candidates:** <read endpoints hot enough to cache; TTLs>.
- **Capacity knobs:** <connection pooler (PgBouncer/Supavisor) sizing; `max_connections`; statement timeout>.

## 4. Cost / economics snapshot (this run)
- **AI:** synthetic `donny_cost_ledger` spend over the window = <$…> (Phase A: expect ~0 — Donny is Phase B).
- **Infra:** tier $/mo (prorated) <…> + storage <$…>.
- **Modeled revenue (Phase A):** GMV × take-rate = <$…> (labeled modeled; measured revenue is Phase B).

## 5. Top actions (ranked, for the founder)
1. <highest-severity bug or biggest-win optimization>
2. <…>
3. <…>

_(Optionally file the top items to `/internal/findings` (AIOS).)_
