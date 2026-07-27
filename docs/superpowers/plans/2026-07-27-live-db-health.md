# Live Database Health + Scale-up Trigger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a live "Database health" section to `/internal/weight` (retitled "Weight & health") — live
connections/latency/cache-hit/tx/size from a new `pg_stat` RPC — plus a connection-headroom scale-up alert.

**Architecture:** One `SECURITY DEFINER` `aios_db_health()` RPC does a live `pg_stat` read (no new table/secret),
gated by `is_internal_user()` like `aios_platform_stats`. A `useDbHealth()` hook polls it (~20s). A pure
`computeConnectionAlert` in `weightThresholds.ts` is the scale trigger. A `DbHealthSection` component renders the
live cards + alert + a deferred CPU/RAM seam, mounted at the top of `InternalWeight` and owning its own states.

**Tech Stack:** React 18 + TS (strict), Vite, Tailwind (dark ops-deck), React Query, Vitest + @testing-library/react, Supabase (Postgres RPC).

**Spec:** `docs/superpowers/specs/2026-07-27-live-db-health-design.md` — read it first.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20260727170000_aios_db_health.sql` | the `aios_db_health()` RPC (internal-gated live `pg_stat` read) | 1 |
| `src/lib/internal/weightThresholds.ts` | add `computeConnectionAlert` + `connectionHeadroomPct` + constants + `ConnectionCounts` (existing file) | 2 |
| `src/lib/internal/weightThresholds.test.ts` | connection-alert / headroom unit tests (existing file) | 2 |
| `src/hooks/internal/useDbHealth.ts` | RPC hook + 20s refetch + typed `DbHealth` | 3 |
| `src/components/internal/DbHealthSection.tsx` | live health section (cards + alert + headroom + CPU/RAM seam) | 4 |
| `src/components/internal/DbHealthSection.test.tsx` | section render + degradation test | 4 |
| `src/pages/internal/InternalWeight.tsx` | mount the section; retitle "Weight & health" | 5 |
| `docs/wiki/concepts/live-db-health.md` + SHIPPED_LOG + §5 | knowledge layer | 6 |

**Conventions:** internal UI primitives `StatCard`/`SectionHeading`/`ErrorCard` from `@/components/internal/stats`,
`Spinner` from `@/components/ui/spinner`. Component tests: `// @vitest-environment jsdom` then
`import "@testing-library/jest-dom";` as the first two lines. The RPC name isn't in the generated Supabase types
until types are regenerated post-migration, so the hook casts `supabase.rpc` (mirrors `useSimLoadMatrixSummary`).

---

## Task 1: The `aios_db_health()` RPC (founder-gated migration, NOT applied)

**Files:** Create `supabase/migrations/20260727170000_aios_db_health.sql`.

- [ ] **Step 1: Write the migration.** Reuses the proven `pg_stat` pattern from `capture_sim_load_snapshot`
  (`20260724170000`) and the gating of `aios_platform_stats` (`20260611150000`).

```sql
-- Live database-health read for /internal (AIOS). SECURITY DEFINER + is_internal_user() gate, same as
-- aios_platform_stats. Reuses the pg_stat pattern proven by capture_sim_load_snapshot (pg_stat_statements
-- OPTIONAL → latency degrades to NULL, never errors). Returns ONLY aggregate ops counts — never
-- pg_stat_activity.query / usename (no per-session/user data). No new table or secret. Idempotent.
create or replace function public.aios_db_health()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_max int := current_setting('max_connections')::int;
  v_reserved int := current_setting('superuser_reserved_connections')::int;
  v_total int; v_active int; v_idle int; v_idle_tx int;
  v_mean numeric; v_slowest numeric;
  v_pgss regclass := coalesce(
    to_regclass('extensions.pg_stat_statements'),
    to_regclass('public.pg_stat_statements'));
  v_cache numeric; v_commit bigint; v_rollback bigint; v_dbbytes bigint;
begin
  if auth.uid() is null or not public.is_internal_user() then
    raise exception 'forbidden: internal users only';
  end if;

  select count(*),
         count(*) filter (where state = 'active'),
         count(*) filter (where state = 'idle'),
         count(*) filter (where state = 'idle in transaction')
    into v_total, v_active, v_idle, v_idle_tx
    from pg_stat_activity;

  -- pg_stat_statements is optional; degrade latency to NULL (never error) if absent/unreadable.
  if v_pgss is not null then
    begin
      execute format(
        'select sum(total_exec_time)/nullif(sum(calls),0), max(mean_exec_time) from %s', v_pgss)
        into v_mean, v_slowest;
    exception when others then
      v_mean := null; v_slowest := null;
    end;
  end if;

  select sum(blks_hit)::numeric / nullif(sum(blks_hit) + sum(blks_read), 0),
         sum(xact_commit), sum(xact_rollback)
    into v_cache, v_commit, v_rollback
    from pg_stat_database
   where datname = current_database();

  v_dbbytes := pg_database_size(current_database());

  return jsonb_build_object(
    'connections', jsonb_build_object(
      'total', v_total, 'active', v_active, 'idle', v_idle,
      'idle_in_transaction', v_idle_tx, 'max', v_max, 'reserved', v_reserved),
    'latency', jsonb_build_object('mean_query_ms', v_mean, 'slowest_statement_ms', v_slowest),
    'cache_hit_ratio', v_cache,
    'xact_commit', v_commit, 'xact_rollback', v_rollback,
    'db_bytes', v_dbbytes,
    'generated_at', now()
  );
end;
$$;

revoke execute on function public.aios_db_health() from public, anon;
grant  execute on function public.aios_db_health() to authenticated, service_role;
```

- [ ] **Step 2: Do NOT apply to prod** (founder gate). Verify (coordinator, rollback-safe): the function
  exists and, under a faked internal caller, returns the shape in Task 3's `DbHealth`. The frontend degrades
  to the section's "unavailable" state until it's applied.
- [ ] **Step 3: Commit.** `git add supabase/migrations/20260727170000_aios_db_health.sql && git commit -m "feat(internal): aios_db_health() live pg_stat RPC (founder-gated migration, not applied)"`

---

## Task 2: The connection alert (`weightThresholds.ts`)

**Files:** Modify `src/lib/internal/weightThresholds.ts`; add tests to `src/lib/internal/weightThresholds.test.ts`.

- [ ] **Step 1: Write the failing tests** (append to `weightThresholds.test.ts`).

```ts
import { computeConnectionAlert, connectionHeadroomPct } from './weightThresholds';

describe('computeConnectionAlert', () => {
  const conns = (total: number) => ({ total, max: 100, reserved: 3 }); // usable = 97
  it('no alert below 70% of usable', () => {
    expect(computeConnectionAlert(conns(67))).toEqual([]); // 67/97 ≈ 69%
  });
  it('warning in [70%, 85%)', () => {
    const a = computeConnectionAlert(conns(75)); // 75/97 ≈ 77%
    expect(a).toHaveLength(1);
    expect(a[0].severity).toBe('warning');
    expect(a[0].detail).toMatch(/pooler/i); // the honest caveat is present
  });
  it('critical at ≥85%', () => {
    const a = computeConnectionAlert(conns(90)); // 90/97 ≈ 93%
    expect(a[0].severity).toBe('critical');
  });
  it('no alert / no throw when connections null or usable ≤ 0', () => {
    expect(computeConnectionAlert(null)).toEqual([]);
    expect(computeConnectionAlert({ total: 5, max: 3, reserved: 3 })).toEqual([]); // usable 0
  });
});

describe('connectionHeadroomPct', () => {
  it('is the inverse of usage, floored at 0', () => {
    expect(connectionHeadroomPct({ total: 0, max: 100, reserved: 3 })).toBe(100);
    expect(connectionHeadroomPct({ total: 97, max: 100, reserved: 3 })).toBe(0);
    expect(connectionHeadroomPct(null)).toBeNull();
    expect(connectionHeadroomPct({ total: 5, max: 3, reserved: 3 })).toBeNull(); // usable 0
  });
});
```

- [ ] **Step 2: Run — expect fail.** `npx vitest run src/lib/internal/weightThresholds.test.ts`
- [ ] **Step 3: Implement** (append to `weightThresholds.ts`, after `computeAnalyticsBudgetAlert`).

```ts
/** Just the connection fields the alert needs (structural subset of DbHealth['connections']). */
export interface ConnectionCounts {
  total: number;
  max: number;
  reserved: number;
}

export const CONN_WARNING_RATIO = 0.7;
export const CONN_CRITICAL_RATIO = 0.85;

const CONN_CAVEAT =
  'The Supavisor pooler fronts client connections, and the 200K load run measured the DB at ~30% of ' +
  'connections at 4,000 concurrent — so connections are not the near-term constraint; the disk/tier alert ' +
  'remains the primary scale signal.';

/** Usable connections = max − superuser-reserved. null when unknown/≤0. */
function usableConns(c: ConnectionCounts | null | undefined): number | null {
  if (!c) return null;
  const usable = c.max - c.reserved;
  return usable > 0 ? usable : null;
}

/** Early-warning alert on live connection usage vs the usable ceiling. Empty when unknown or below warn. */
export function computeConnectionAlert(c: ConnectionCounts | null | undefined): WeightAlert[] {
  const usable = usableConns(c);
  if (usable === null || !c) return [];
  const ratio = c.total / usable;
  const pct = Math.round(ratio * 100);
  if (ratio >= CONN_CRITICAL_RATIO) {
    return [{
      severity: 'critical',
      title: 'Connection capacity high',
      detail: `Database is using ${pct}% of its ${usable} usable connections — consider scaling compute. ${CONN_CAVEAT}`,
    }];
  }
  if (ratio >= CONN_WARNING_RATIO) {
    return [{
      severity: 'warning',
      title: 'Connection usage climbing',
      detail: `Database is using ${pct}% of its ${usable} usable connections. ${CONN_CAVEAT}`,
    }];
  }
  return [];
}

/** Remaining connection headroom as a whole percent (0–100), or null when unknown. */
export function connectionHeadroomPct(c: ConnectionCounts | null | undefined): number | null {
  const usable = usableConns(c);
  if (usable === null || !c) return null;
  return Math.max(0, Math.round((1 - c.total / usable) * 100));
}
```

- [ ] **Step 4: Run — expect pass.** Then commit: `git add src/lib/internal/weightThresholds.ts src/lib/internal/weightThresholds.test.ts && git commit -m "feat(internal): computeConnectionAlert + connectionHeadroomPct (connection scale trigger)"`

---

## Task 3: The `useDbHealth()` hook

**Files:** Create `src/hooks/internal/useDbHealth.ts`. (Supabase hooks aren't unit-tested here; verify via typecheck + the page.)

- [ ] **Step 1: Implement.**

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Live database-health snapshot from aios_db_health(). Latency fields are null when
 *  pg_stat_statements isn't present; xact_* are cumulative counters (since stats reset). */
export interface DbHealth {
  connections: {
    total: number; active: number; idle: number; idle_in_transaction: number;
    max: number; reserved: number;
  };
  latency: { mean_query_ms: number | null; slowest_statement_ms: number | null };
  cache_hit_ratio: number | null;
  xact_commit: number;
  xact_rollback: number;
  db_bytes: number;
  generated_at: string;
}

/** Polls aios_db_health() every 20s while the page is open (React Query stops when there are no
 *  observers). aios_db_health isn't in the generated rpc union until types are regenerated post-migration,
 *  so we call through a minimal typed view of rpc (mirrors useSimLoadMatrixSummary). */
export function useDbHealth() {
  return useQuery({
    queryKey: ['aios', 'db-health'],
    queryFn: async (): Promise<DbHealth> => {
      const rpc = supabase.rpc as unknown as (
        fn: 'aios_db_health',
      ) => Promise<{ data: DbHealth | null; error: { message: string } | null }>;
      const { data, error } = await rpc('aios_db_health');
      if (error) {
        console.error('aios_db_health failed:', error);
        throw error;
      }
      if (!data) throw new Error('aios_db_health returned no data');
      return data;
    },
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}
```

- [ ] **Step 2: Typecheck** → clean. **Step 3: Commit.** `feat(internal): useDbHealth — 20s-polling live DB health hook`

---

## Task 4: `DbHealthSection` component (+ test)

**Files:** Create `src/components/internal/DbHealthSection.tsx`, `src/components/internal/DbHealthSection.test.tsx`.

- [ ] **Step 1: Implement.** Props: `{ health: DbHealth | undefined; isLoading: boolean; isError: boolean }`
  (the page owns the single `useDbHealth()` call and passes the result — mirrors the internal pattern of a
  section receiving `(data,isLoading,isError)`). Import `computeConnectionAlert`, `connectionHeadroomPct` from
  `weightThresholds`, and `StatCard`/`SectionHeading`/`ErrorCard`, `Spinner`.
  - `SectionHeading`: "Database health". A subtitle: "Live from the database (`pg_stat`). Connections are
    pooler-fronted — see the capacity note."
  - **Own states:** `isLoading` (no data yet) → a small `Spinner` inside a bordered card; `isError || !health`
    → an `ErrorCard` ("Live health unavailable — apply the db-health migration, or check internal access.").
    Neither breaks the rest of the Weight page (the page renders this section independently).
  - **Cards** (when `health` present): **Connections** = `${total} / ${usable}` (usable = `max − reserved`,
    guard ≤0 → show `total` only) with sub = `connectionHeadroomPct` → `` `${pct}% headroom` `` (or `—`);
    **Active queries** = `active`; **Mean query time** = `mean_query_ms == null ? '—' : `${mean.toFixed(1)} ms``
    with sub "stat extension not enabled" when null; **Cache hit** = `cache_hit_ratio == null ? '—' :
    `${Math.round(ratio*100)}%`` sub "lifetime"; **Transactions** = `` `${commit.toLocaleString()} / ${rollback.toLocaleString()}` ``
    label "Commits / rollbacks" sub "cumulative since stats reset".
  - **Connection alert:** render `computeConnectionAlert(health.connections).map(...)` as alert banners above
    the cards, reusing the Weight page's `severityStyles` look (`critical`/`warning`/`info` → pink/pink-soft/teal border+bg).
  - **CPU / RAM seam:** two dimmed placeholder cards labeled "CPU" / "Memory" with value `—` and sub
    "coming next — needs the Supabase metrics endpoint".
  - **Live affordance:** a small muted line "live · updated {relative time from `generated_at`}" (a simple
    `Math.round((Date.now() - Date.parse(generated_at))/1000)`s-ago; render "just now" under 5s).
- [ ] **Step 2: Test** (`DbHealthSection.test.tsx`, jsdom).

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DbHealthSection } from './DbHealthSection';
import type { DbHealth } from '@/hooks/internal/useDbHealth';

const health: DbHealth = {
  connections: { total: 20, active: 3, idle: 15, idle_in_transaction: 2, max: 100, reserved: 3 },
  latency: { mean_query_ms: 1.4, slowest_statement_ms: 42 },
  cache_hit_ratio: 0.991, xact_commit: 1234, xact_rollback: 5, db_bytes: 5e8,
  generated_at: '2026-07-27T00:00:00Z',
};

describe('DbHealthSection', () => {
  it('renders live cards + the CPU/RAM "coming next" seam', () => {
    render(<DbHealthSection health={health} isLoading={false} isError={false} />);
    expect(screen.getByText('Database health')).toBeInTheDocument();
    expect(screen.getByText(/coming next/i)).toBeInTheDocument();
    expect(screen.getByText('99%')).toBeInTheDocument(); // cache hit
  });
  it('shows the error state on isError (does not throw)', () => {
    render(<DbHealthSection health={undefined} isLoading={false} isError />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });
  it('degrades latency to — when pg_stat_statements is absent', () => {
    const noStats = { ...health, latency: { mean_query_ms: null, slowest_statement_ms: null } };
    render(<DbHealthSection health={noStats} isLoading={false} isError={false} />);
    expect(screen.getByText(/stat extension not enabled/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/components/internal/DbHealthSection.test.tsx` → pass. **Step 4: Commit.**
  `feat(internal): DbHealthSection — live connections/latency/cache cards + connection alert + CPU/RAM seam`

---

## Task 5: Mount on `/internal/weight`

**Files:** Modify `src/pages/internal/InternalWeight.tsx`.

- [ ] **Step 1:** Import `useDbHealth` and `DbHealthSection`. Add `const health = useDbHealth();` near the
  other hooks (top of the component, above the loading guard). **Do not** add health to the loading/error
  early-returns — the section owns its own states.
- [ ] **Step 2:** Change the `PageHeader` `title="App weight"` → `title="Weight & health"`.
- [ ] **Step 3:** Mount the section immediately after the `PageHeader` (before the `{alerts.length > 0 && ...}`
  block): `<DbHealthSection health={health.data} isLoading={health.isLoading} isError={health.isError} />`.
  (The existing disk `alerts` array and daily cards stay exactly as they are — the connection alert lives
  inside `DbHealthSection`.)
- [ ] **Step 4:** `npm run typecheck && npm run build` → green. **Step 5: Commit.**
  `feat(internal): mount live DbHealthSection atop /internal/weight; retitle "Weight & health"`

---

## Task 6: Knowledge-sync

**Files:** `docs/wiki/raw/sessions/2026-07-27-live-db-health.md` + `docs/wiki/concepts/live-db-health.md`;
update `docs/wiki/index.md`, `docs/wiki/log.md`, `docs/SHIPPED_LOG.md` (prepend), `docs/PROJECT_CONTEXT.md` §5.

- [ ] Raw session source → `/wiki-ops ingest` → concept page (`[[wikilinks]]` to [[Cost Model + DAU Forecast]],
  [[Synthetic Weight Engine]], [[AIOS Internal Shell]]); index.md (near the AIOS concepts) + log.md.
- [ ] SHIPPED_LOG prepend; §5 (Built — awaiting founder go-live, `**Pending:** merge + apply migration
  `20260727170000``; note this completes 4 of 4 sub-projects, CPU/RAM the remaining follow-up).
- [ ] Commit. (RAG sync after merge, via the docs/ hook.)

---

## Definition of done

- [ ] All tasks committed; `npm run typecheck`, `npm run lint`, `npm run build`, and the new/changed vitest files green.
- [ ] Migration `20260727170000` written but NOT applied (founder gate); page degrades to the section's "unavailable" state.
- [ ] **data-exposure-reviewer** on the new `SECURITY DEFINER` `pg_stat` RPC (aggregate-only, `is_internal_user()`-gated, no `query`/`usename`).
- [ ] **Codex second review** (`codex review --base main`) clean; fix + re-run.
- [ ] knowledge-sync done; then `finishing-a-development-branch` → push + open PR.
- [ ] Recorded: CPU/RAM via the Supabase metrics endpoint is the remaining follow-up (the seam is in place).
