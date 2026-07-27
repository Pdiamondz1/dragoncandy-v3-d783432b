---
title: Live DB Health
type: concept
created: 2026-07-27
updated: 2026-07-27
sources: [2026-07-27-live-db-health.md]
tags: [aios, internal, telemetry, scaling, pg_stat, dashboard]
---
# Live DB Health

The live **"Database health"** section on `/internal/weight` (retitled **"Weight & health"**): real-traffic
infra telemetry — connections vs the pool ceiling, query latency, cache-hit, transaction counters, DB size —
plus a **connection-headroom scale-up alert**. Sub-project **2 of 4** (the last) in the AIOS "true weight/cost
+ how it scales" ask (1 = [[Internal Real-vs-Total Metrics]]; 3 = [[Cost Model + DAU Forecast]];
4 = [[Stakeholder Scorecard]]).

## What it is — DB telemetry now, CPU/RAM next

Postgres exposes connections, latency, throughput and size via `pg_stat_*`; **CPU / RAM / disk-I/O are NOT in
Postgres** — they live in Supabase's privileged metrics endpoint (not wired yet, possibly a new token). So
this ships the DB-level telemetry now (no new secret) and leaves a labeled **CPU/RAM "coming next" seam** in
the section for a follow-up.

## The RPC — `aios_db_health()` (live, internal-gated, no new table/secret)

`SECURITY DEFINER`, `search_path = public`, `STABLE`, in-body `is_internal_user()` guard (admin OR
stakeholder), `REVOKE EXECUTE FROM public, anon` + `GRANT ... TO authenticated, service_role` — the **same
gating as `aios_platform_stats`**, and the **same `pg_stat` pattern proven by `capture_sim_load_snapshot`**
([[Synthetic Weight Engine]]), so the privilege model is known-good. A **live read** (not a stored snapshot):
- **Connections** — `pg_stat_activity` counts by state (`total`/`active`/`idle`/`idle_in_transaction`) +
  `max_connections`/`superuser_reserved_connections` via `current_setting`. `usable = max − reserved`.
- **Latency** — `pg_stat_statements`, guarded via `to_regclass` (→ `null`, never errors, if the extension is
  absent): a **call-weighted mean** (`sum(total_exec_time)/sum(calls)`) + slowest-statement mean. **Not a
  p95** — `pg_stat_statements` has no percentiles; a true p95 needs client-side instrumentation.
- **Throughput/health** — `pg_stat_database`: `cache_hit_ratio` (lifetime), `xact_commit`/`xact_rollback`
  (**cumulative** since stats reset — NOT a rate; the UI labels them so).
- **Size** — `pg_database_size(current_database())`.

**Security (data-exposure-reviewed):** selects **only aggregate counts/sums** — never
`pg_stat_activity.query`/`usename`/`client_addr` or any per-backend/user column, never the
`pg_stat_statements` statement text. The DEFINER elevation (needed to see all backends' `state`) can't
exfiltrate anything user-identifying.

## Frontend

- `useDbHealth()` polls the RPC every **20s** while the page is open (React Query stops with no observers).
- `DbHealthSection` renders the live cards + the connection alert + the "live · updated Ns ago" affordance +
  the CPU/RAM seam, and **owns its own loading/error** (a health-RPC failure degrades only this block).
- The **scale trigger** is `computeConnectionAlert` in `weightThresholds.ts` (warn ≥70% / critical ≥85% of
  usable connections), rendered inside the section (it needs the live data). Every alert carries the honest
  caveat: the **Supavisor pooler** fronts client connections and the 200K load run measured the DB at ~30% of
  connections at 4,000 concurrent — so connections are **not** the near-term constraint; the disk/tier alert
  remains the primary scale signal.

## Known Issues

- **Load-bearing deploy step:** apply migration `20260727170000` at the careful gate after merge; until then
  the health section shows its "unavailable" state (the rest of the Weight page is unaffected).
- **Weight-coupling tradeoff:** `InternalWeight` early-returns for the whole page while `platform_weight` is
  loading/errored/empty, so the health section is reached only when weight is present. This is the reverse of
  the spec's isolation (which only requires a *health* failure not hide the *weight* cards — satisfied);
  `platform_weight` is daily so it's essentially always present on prod. Full independence (extracting the
  daily body) is a documented follow-up.
- **CPU/RAM** via the Supabase metrics endpoint is the remaining follow-up (the seam is in place).

## See Also

- [[Cost Model + DAU Forecast]] — sub-project 3; its measured coefficients would upgrade from the load-run
  snapshot to this live telemetry.
- [[Synthetic Weight Engine]] — `capture_sim_load_snapshot`, whose `pg_stat` pattern this RPC reuses.
- [[AIOS Internal Shell]] — how `/internal/*` is navigated and laid out.
