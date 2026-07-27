# Session — Live DB health + scale-up trigger (/internal/weight) — 2026-07-27

Sub-project 2 of 4 (the LAST) of the AIOS "true weight/cost + how it scales" founder ask. Added live
real-traffic DB telemetry + a connection-headroom scale trigger to the Weight page.

## What shipped (branch `feat/internal-db-health-telemetry`, off origin/main)

- `supabase/migrations/20260727170000_aios_db_health.sql` — `aios_db_health()`: SECURITY DEFINER,
  `search_path=public`, `is_internal_user()`-gated (admin OR stakeholder), REVOKE public/anon + GRANT
  authenticated/service_role. A **live** `pg_stat` read (no stored snapshot table, no new secret):
  connections by state + max/reserved (`pg_stat_activity` + `current_setting`), call-weighted mean +
  slowest-statement query time (`pg_stat_statements`, guarded via `to_regclass` → NULL if absent),
  cache-hit ratio + xact commit/rollback (`pg_stat_database`), db size. **Founder-gated, NOT applied.**
- `src/lib/internal/weightThresholds.ts` — added `computeConnectionAlert` (warn ≥70% / critical ≥85% of
  usable = max−reserved) + `connectionHeadroomPct` + `ConnectionCounts`. Each alert carries the honest
  caveat (pooler fronts conns; 200K run showed DB at ~30% at 4,000 concurrent → early-warning, not the
  primary signal).
- `src/hooks/internal/useDbHealth.ts` — polls the RPC every 20s (refetch stops when the page closes);
  rpc-cast pattern (name not in generated types pre-migration), typed `DbHealth`.
- `src/components/internal/DbHealthSection.tsx` (+ test) — the live section: connection/latency/cache/tx
  cards, the connection alert, a "live · updated Ns ago" affordance, and a labeled CPU/RAM "coming next"
  seam. Own loading/error state.
- `src/pages/internal/InternalWeight.tsx` — mount the section atop the page; retitle "Weight & health".

## Key decisions / gotchas

- **DB telemetry now, CPU/RAM next** (founder-chosen). CPU/RAM aren't in Postgres — they need Supabase's
  privileged metrics endpoint (not wired, possibly a new token). Left a visible seam.
- **Latency = call-weighted MEAN, not p95** — `pg_stat_statements` exposes no percentiles; a true p95 needs
  client-side instrumentation. Shown honestly.
- **xact_commit/rollback + cache_hit are CUMULATIVE/lifetime counters** (since stats reset), NOT a rate —
  labeled as such (rendering a counter as a "rate" would be an honesty-rail violation).
- **Aggregate-only, gated** — the SECURITY DEFINER `pg_stat` read selects only counts/sums, never
  `pg_stat_activity.query`/`usename` (data-exposure-reviewed). Reuses the exact proven pattern from
  `capture_sim_load_snapshot`.
- **Accepted tradeoff:** `InternalWeight` early-returns for the whole page while `platform_weight` is
  loading/errored/empty, so the health section is only reached when weight is present — the *reverse* of the
  spec's isolation (which only requires health-failure not hide weight; satisfied). `platform_weight` is
  daily so it's essentially always present on prod. Full independence (extracting the daily body) is a
  documented follow-up.
- Connection alert lives IN the section (needs live `health` data + the section's failure isolation), a
  deliberate improvement over the spec's "wire into computeWeightAlerts" wording.

## Review

Spec-review approved (1 round + 4 advisories: cumulative-counter honesty, REVOKE PUBLIC, canonical DbHealth
interface, in-tree degrade example). Plan-review approved (1 round: getByText→one-caption test fix, primitive
nits, weight-coupling documented). Subagent-driven (thresholds + component); migration/hook/wiring done
directly. 28 tests, typecheck + lint + build green. data-exposure-reviewer + Codex second review.
