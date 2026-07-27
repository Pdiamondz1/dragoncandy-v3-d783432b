# Live Database Health + Scale-up Trigger — Design Spec

> Sub-project **2 of 4** of the founder ask to make the `/internal` (AIOS) dashboard show the app's true
> weight/cost and how it scales (1 = synthetic metric parity, PR #346; 4 = stakeholder scorecard, PR #350;
> 3 = cost model + DAU forecast, PR #352). This is the **last** of the four.

**Date:** 2026-07-27 · **Branch:** `feat/internal-db-health-telemetry` · **Status:** design, pre-plan

## 1. Goal

Add a **live database-health section** to `/internal/weight` showing real-traffic infra telemetry —
current connections vs the pool ceiling, query latency, cache-hit ratio, transaction rate, DB size — and
turn the page's scale-up alerting from disk-only into a **live capacity signal** (a connection-headroom
alert alongside the existing disk one). So the founder can see, at a glance, how loaded the database is
right now and get an early warning before it's time to scale Supabase compute.

## 2. Scope decision — DB telemetry now, CPU/RAM next (founder-chosen)

CPU / RAM / disk-I/O are **not in Postgres** — they live in Supabase's privileged metrics endpoint, which
nothing in the codebase uses yet and may need a founder-provisioned token. So **this pass ships only what
Postgres exposes** (connections, latency, throughput, size — all via `pg_stat_*`, no new secret) and leaves
a **clearly-labeled seam** for CPU/RAM to light up in a follow-up once that endpoint is wired and its auth
verified.

## 3. Scope

**In scope**
- A `SECURITY DEFINER` `aios_db_health()` RPC — a **live read** of `pg_stat_*` (no stored snapshot table).
- A `useDbHealth()` hook (React Query with a ~20s refetch so the section is genuinely live).
- A live **"Database health"** section at the top of `/internal/weight`.
- A **connection-headroom alert** added to `computeWeightAlerts` (the existing disk alert stays).
- A small pure, tested threshold/headroom helper.

**Out of scope** (deferred, seam left)
- **CPU / RAM / disk-I/O** — needs the Supabase metrics endpoint (next follow-up).
- **True p95 query latency** — `pg_stat_statements` gives a call-weighted *mean*, not percentiles; a real
  p95 needs client-side request instrumentation (the load driver measures it, live traffic doesn't). We show
  the honest mean + slowest-statement mean, labeled as such — not a fake p95.
- Historical health trending / a new snapshot table (the RPC is a live read; the Weight page already trends
  DB size daily via `platform_weight`).

## 4. The RPC — `aios_db_health()` (live, internal-gated, no new secret)

`SECURITY DEFINER`, `search_path = public`, in-body `is_internal_user()` guard, `REVOKE ... FROM anon`,
`GRANT EXECUTE ... TO authenticated, service_role` — the **same gating as `aios_platform_stats`** (internal
users, not admin-only; this is ops data, not cost data). Reuses the **exact `pg_stat` pattern proven by
`capture_sim_load_snapshot`** (migration `20260724170000`), so the privilege model is known-good (that RPC
already reads `pg_stat_activity` + `pg_stat_statements` under a `SECURITY DEFINER` owner).

Returns one JSON object (`generated_at = now()`):
- **Connections** — from `pg_stat_activity`: `total`, `active`, `idle`, `idle_in_transaction`; plus
  `max_connections` = `current_setting('max_connections')::int` and `reserved` =
  `current_setting('superuser_reserved_connections')::int`. → the headroom number
  (`usable = max − reserved`; `pct = total / usable`).
- **Latency** — from `pg_stat_statements`, **guarded via `to_regclass('extensions.pg_stat_statements')`
  / `('public.pg_stat_statements')`** (degrades every latency field to `null`, never errors, if the
  extension is absent — exactly as `capture_sim_load_snapshot` does): `mean_query_ms` (call-weighted
  `sum(mean_exec_time*calls)/sum(calls)`) and `slowest_statement_ms` (`max(mean_exec_time)`).
- **Throughput / health** — from `pg_stat_database` (current DB): `cache_hit_ratio`
  (`blks_hit / nullif(blks_hit + blks_read, 0)`), `xact_commit`, `xact_rollback`.
- **Size** — `db_bytes = pg_database_size(current_database())` (a live echo of the daily-snapshot figure).

## 5. The hook — `useDbHealth()`

`supabase.rpc('aios_db_health')`, `queryKey: ['aios','db-health']`, **`refetchInterval: 20_000`** +
`refetchOnWindowFocus` so it's live while the page is open (polling stops when the query has no observers —
i.e. when the page is closed). A typed `DbHealth` interface; latency fields are `number | null`.

## 6. The page — a live "Database health" section on `/internal/weight`

Extend `InternalWeight.tsx` (it already owns "how big + when to scale"). A **new section at the top**, above
the existing daily size/growth/tier cards:
- StatCards: **Connections** (`total / usable`, with the headroom % as the sub), **Active queries**,
  **Mean query time** (`—` when `pg_stat_statements` is absent, with a "stat extension not enabled" sub),
  **Cache hit** (%), plus a small **Transactions** (commit/rollback) readout.
- A **"live · updated Ns ago"** affordance (from `generated_at`) so it's clear this refreshes.
- **CPU / RAM placeholder cards** rendered as labeled, dimmed "coming next — needs the Supabase metrics
  endpoint" slots (the deferred seam, visible so the founder knows it's planned).
- Its own loading/error state scoped to the section (a health-RPC failure degrades only this block; the
  daily-snapshot cards below still render) — mirroring how `PlatformMetricSections` isolates its failure.
- Section subtitle sets expectations: "Live from the database (`pg_stat`). Connections are pooler-fronted —
  see the note on the capacity alert."

The page's `PageHeader` title becomes **"Weight & health"** (from "App weight").

## 7. The scale-up trigger — connection-headroom alert

Extend `weightThresholds.ts`'s `computeWeightAlerts` (today disk-only) with a **`computeConnectionAlert(health)`**
(a new pure function, so the disk alert is untouched): warn at **≥70%**, critical at **≥85%** of usable
connections (`total / (max − reserved)`). Every alert carries the **honest caveat**: the Supavisor **pooler**
fronts client connections and the 200K load run measured the DB at **~30% of connections at 4,000 concurrent**,
so connections are **not** the near-term constraint — this is the early-warning, and the disk/tier alert is
still the primary scale signal. The page also shows a plain **"connection headroom: N%"** line.

## 8. Backend — one founder-gated migration, no new table/secret

- `supabase/migrations/<ts>_aios_db_health.sql` — creates `aios_db_health()` with the gating in §4.
- **No new table, secret, or edge function.** Founder-gated apply (careful gate), like the other AIOS RPC
  migrations. The page degrades gracefully pre-migration: `useDbHealth` errors → the health section shows
  its "unavailable — apply the db-health migration" state; the rest of the Weight page is unaffected.

## 9. Error / degradation states

- RPC error (incl. pre-migration) → the **health section only** shows an error/unavailable card; the daily
  Weight cards + disk alert still render (the section owns its failure, like `PlatformMetricSections`).
- `pg_stat_statements` absent → latency fields `null` → "Mean query time —" + a "stat extension not enabled"
  sub. Never a fabricated latency.
- `max_connections`/`usable` zero or unreadable → headroom shows `—`, no connection alert (no divide-by-zero).
- All following the forecast/scorecard honesty precedent — never a fabricated or misleading number.

## 10. Testing

- `src/lib/internal/dbHealthThresholds.test.ts` (or extend `weightThresholds.test.ts`) — the pure
  `computeConnectionAlert`: no alert below 70%, warning in [70,85), critical ≥85%; headroom math
  (`max − reserved`); no alert / `—` when connections are 0/unreadable (no divide-by-zero); the honest-caveat
  text present.
- A component test for the health section — renders the live cards from a fixture; shows `—` + the
  extension-absent sub when latency is null; renders the CPU/RAM "coming next" placeholder; the section-scoped
  error state when the hook errors. (`// @vitest-environment jsdom` + `import "@testing-library/jest-dom"`.)

## 11. Review gates

- **data-exposure-reviewer** — a **new `SECURITY DEFINER` RPC reading `pg_stat_*`**: confirm the in-body
  `is_internal_user()` gate + `REVOKE anon`, that it returns only **aggregate ops counts** (no per-backend
  query text, no per-row/user data — `pg_stat_activity` `query`/`usename` columns must NOT be selected), and
  that the DEFINER-elevated `pg_stat` read is bounded to those aggregates.
- **Codex second review** (`codex review --base main`) — mandatory.
- **knowledge-sync** — wiki concept `docs/wiki/concepts/live-db-health.md`, SHIPPED_LOG, PROJECT_CONTEXT §5;
  RAG sync after merge.

## 12. File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_aios_db_health.sql` | the `aios_db_health()` RPC (internal-gated, live `pg_stat` read) |
| `src/hooks/internal/useDbHealth.ts` | RPC hook + 20s refetch + typed `DbHealth` |
| `src/lib/internal/weightThresholds.ts` | add `computeConnectionAlert` + connection-headroom constants (existing file) |
| `src/lib/internal/weightThresholds.test.ts` | connection-alert unit tests (existing file) |
| `src/components/internal/DbHealthSection.tsx` | the live health section (cards + headroom + CPU/RAM seam) |
| `src/components/internal/DbHealthSection.test.tsx` | section render + degradation test |
| `src/pages/internal/InternalWeight.tsx` | mount the section at the top; wire `computeConnectionAlert`; retitle "Weight & health" |
| `docs/wiki/concepts/live-db-health.md` + SHIPPED_LOG + §5 | knowledge layer |

## 13. Open questions for the founder (defaults chosen; none block the build)

- **Alert thresholds** — 70% warn / 85% critical of usable connections (matches the disk-alert style).
  Tunable in the plan if you want them tighter/looser.
- **Refresh cadence** — 20s. Fast enough to feel live, cheap enough for an internal page with few viewers.
