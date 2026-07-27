# Cost Model + DAU Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Ship an admin-only `/internal/forecast` page that projects infra footprint, Supabase tier,
total monthly cost, revenue, and gross margin at Today / 500K / 750K / 1M DAU, from a pure tested model
+ founder-editable assumptions.

**Architecture:** A pure `forecastModel.ts` (constants + `buildForecast`) is the single source of truth,
locked by unit tests. A thin `useForecastAssumptions` hook reads/writes 9 tunable values in the existing
`aios_dashboard_settings` KV table (seeded by one founder-gated migration; no new RPC/RLS). The page
wires existing internal hooks → the model → a `ForecastTable` + an admin `ForecastAssumptionsPanel`. The
route is admin-gated exactly like `/internal/expenses` because it reads admin-only cost sources.

**Tech Stack:** React 18 + TS (strict), Vite, Tailwind (`dc-*` tokens, dark ops-deck), React Query,
recharts, Vitest + @testing-library/react, Supabase (Postgres KV table).

**Spec:** `docs/superpowers/specs/2026-07-27-cost-dau-forecast-design.md` — read it before starting.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/internal/forecastModel.ts` | pure model: constants, `FORECAST_KEYS`/defaults, `buildForecast` | 1 |
| `src/lib/internal/forecastModel.test.ts` | model unit tests (the contract) | 1 |
| `src/hooks/internal/useForecastAssumptions.ts` | read 9 KV assumptions + admin update mutation | 2 |
| `supabase/migrations/20260727120000_forecast_assumptions_settings.sql` | seed all 9 KV rows (idempotent) | 3 |
| `src/components/internal/ForecastTable.tsx` | pure render of the model → scenario table + chart | 4 |
| `src/components/internal/ForecastTable.test.tsx` | table render + degradation-note test | 4 |
| `src/components/internal/ForecastAssumptionsPanel.tsx` | admin-editable assumptions (page is admin-only) | 5 |
| `src/pages/internal/InternalForecast.tsx` | page: wires hooks → model → table + panel | 6 |
| `src/App.tsx` · `src/components/internal/InternalLayout.tsx` | admin-gated route + Operate-group nav | 7 |
| `docs/wiki/concepts/cost-dau-forecast.md` + SHIPPED_LOG + §5 | knowledge layer | 8 |

**Convention notes for the implementer (avoid guessing):**
- Percentage assumptions are stored as the **whole-number percent** (e.g. `8` = 8%); the model divides
  by 100. Sizes stored in the natural unit shown in the label (KB, ¢, $, ×).
- Every `ForecastAssumptions` field name is exactly its DB key minus the `forecast_` prefix
  (`forecast_db_kb_per_user` → `db_kb_per_user`), so the hook maps by `key.replace(/^forecast_/, '')`.
- `aios_dashboard_settings.value` is jsonb; a stored number reads back as a number (`Number(value)`).
  Writes: `.update({ value: <number> }).eq('key', <key>)` (existing admin-UPDATE RLS).
- Internal UI primitives: `StatCard`, `SectionHeading`, `ErrorCard` from `@/components/internal/stats`;
  `PageContainer`, `PageHeader` from `@/components/internal/layout`; `Spinner` from `@/components/ui/spinner`.
- Component tests need, as the first two lines: `// @vitest-environment jsdom` then
  `import "@testing-library/jest-dom";` (env is `node` globally in this repo).

---

## Task 1: The forecast model (`forecastModel.ts`)

**Files:**
- Create: `src/lib/internal/forecastModel.ts`
- Test: `src/lib/internal/forecastModel.test.ts`

- [ ] **Step 1: Write the model implementation**

```ts
// src/lib/internal/forecastModel.ts
/**
 * Cost model + DAU forecast — pure, deterministic (NO LLM). Projects infra footprint + full
 * unit-economics at Today / 500K / 750K / 1M DAU from measured coefficients + editable assumptions.
 * See docs/superpowers/specs/2026-07-27-cost-dau-forecast-design.md. Mirrors the scorecardModel /
 * weightThresholds pattern (constants + pure functions, locked by unit tests).
 */
import { COMPUTE_TIERS, GB } from './weightThresholds';

// ---- Editable assumptions (seeded into aios_dashboard_settings; founder-tunable) ----
export const FORECAST_KEYS = [
  'forecast_registered_per_dau',
  'forecast_db_kb_per_user',
  'forecast_storage_kb_per_user',
  'forecast_peak_concurrency_pct',
  'forecast_requests_per_dau',
  'forecast_ai_cost_per_dau_cents',
  'forecast_business_share_pct',
  'forecast_paying_conversion_pct',
  'forecast_arpu_usd',
] as const;
export type ForecastKey = (typeof FORECAST_KEYS)[number];

export interface ForecastAssumptions {
  registered_per_dau: number;      // registered users per 1 daily-active
  db_kb_per_user: number;          // DB KB per registered user
  storage_kb_per_user: number;     // file storage KB per registered user
  peak_concurrency_pct: number;    // peak concurrent as % of DAU (whole percent, e.g. 8)
  requests_per_dau: number;        // media/content requests per DAU per day
  ai_cost_per_dau_cents: number;   // AI serving ¢ per DAU per month (pre-cap)
  business_share_pct: number;      // % of registered users that are businesses (whole percent)
  paying_conversion_pct: number;   // % of businesses on a paid plan (whole percent)
  arpu_usd: number;                // blended monthly revenue per paying business
}

export const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  registered_per_dau: 4,
  db_kb_per_user: 150,
  storage_kb_per_user: 2048,
  peak_concurrency_pct: 8,
  requests_per_dau: 40,
  ai_cost_per_dau_cents: 0.5,
  business_share_pct: 20,
  paying_conversion_pct: 15,
  arpu_usd: 149,
};

// ---- Supabase pricing + model constants (documented; verify against the plan — pricing drifts) ----
export const SUPABASE_PRICING = {
  proBaseUsd: 25,
  includedDiskGb: 8,
  diskOverageUsdPerGb: 0.125,
  includedEgressGb: 250,
  egressOverageUsdPerGb: 0.09,
};
export const PEAK_CONCURRENT_PER_GB = 2000;   // tier-selection heuristic (ASSUMED, not measured)
export const AI_FLOOR_USD = 250;              // PROJECT_CONTEXT §8 pre-revenue AI floor
export const DEFAULT_DB_CONNS_PER_CONCURRENT = 0.0068;
export const DEFAULT_EGRESS_BYTES_PER_REQUEST = 120_000;

const DAU_LEVELS = [500_000, 750_000, 1_000_000] as const;

export interface LoadCeiling {
  honest_peak_concurrency: number;
  db_active_conn_peak: number;
  max_connections: number;
  media_bytes: number;
  media_requests: number;
}

export interface ForecastMeasured {
  dbBytes: number;                 // latest platform_weight.db_bytes (physical, synthetic-inclusive)
  storageBytes: number;            // latest platform_weight.storage_bytes
  registeredUsersReal: number;     // real (synthetic-excluded) registered users
  currentTierIndex: number;        // useCurrentTierIndex → COMPUTE_TIERS index
  loadMatrix: LoadCeiling | null;  // useSimLoadMatrixSummary (null if no matrix run captured)
  currentAiSpendUsd: number;       // cost ledger MTD
  currentOpexUsd: number;          // Σ active operating_expenses / 100
  currentRevenueUsd: number;       // dragonshare MTD platform fee / 100
}

export interface ForecastInput {
  measured: ForecastMeasured;
  assumptions: ForecastAssumptions;
}

export interface DerivedCoefficients {
  dbConnsPerConcurrent: number;
  egressBytesPerRequest: number;
  measuredCeiling: boolean; // false when a documented default was substituted
}

export interface ForecastScenario {
  label: string;               // 'Today' | '500K' | '750K' | '1M'
  dau: number | null;          // null for Today
  measured: boolean;
  registeredUsers: number;
  peakConcurrent: number | null;
  dbBytes: number;
  storageBytes: number;
  pooledDbConns: number | null;
  connCeiling: number | null;
  computeTier: string;
  computeUsd: number;
  diskGb: number;
  supabaseUsd: number;
  aiUncappedUsd: number | null; // null for Today (measured)
  aiUsd: number;
  aiCapBreached: boolean;
  otherOpexUsd: number;
  totalCostUsd: number;
  revenueUsd: number;
  grossMarginUsd: number;
  marginPct: number | null;    // null when revenue = 0
  costPerDauUsd: number | null; // null for Today
}

export interface ForecastModel {
  scenarios: ForecastScenario[];
  coefficients: DerivedCoefficients;
  notes: string[];
}

function deriveCoefficients(m: ForecastMeasured, notes: string[]): DerivedCoefficients {
  const lm = m.loadMatrix;
  const ok = !!lm && lm.honest_peak_concurrency > 0 && lm.media_requests > 0;
  if (!ok) {
    notes.push('Measured load-run ceiling unavailable — using default connection/egress coefficients.');
    return {
      dbConnsPerConcurrent: DEFAULT_DB_CONNS_PER_CONCURRENT,
      egressBytesPerRequest: DEFAULT_EGRESS_BYTES_PER_REQUEST,
      measuredCeiling: false,
    };
  }
  return {
    dbConnsPerConcurrent: lm!.db_active_conn_peak / lm!.honest_peak_concurrency,
    egressBytesPerRequest: lm!.media_bytes / lm!.media_requests,
    measuredCeiling: true,
  };
}

function tierFor(peakConcurrent: number): { name: string; usd: number } {
  const tier = COMPUTE_TIERS.find((t) => peakConcurrent <= t.ramGb * PEAK_CONCURRENT_PER_GB);
  if (tier) return { name: tier.name, usd: tier.monthlyUsd };
  const top = COMPUTE_TIERS[COMPUTE_TIERS.length - 1];
  return { name: 'Custom (contact Supabase)', usd: top.monthlyUsd }; // floor cost; flagged in the UI
}

function diskOverageUsd(dbBytes: number): number {
  const gb = dbBytes / GB;
  return Math.max(0, gb - SUPABASE_PRICING.includedDiskGb) * SUPABASE_PRICING.diskOverageUsdPerGb;
}

function marginPct(revenueUsd: number, marginUsd: number): number | null {
  return revenueUsd > 0 ? marginUsd / revenueUsd : null;
}

function buildToday(m: ForecastMeasured): ForecastScenario {
  const tier = COMPUTE_TIERS[m.currentTierIndex] ?? COMPUTE_TIERS[0];
  const supabaseUsd = SUPABASE_PRICING.proBaseUsd + tier.monthlyUsd + diskOverageUsd(m.dbBytes);
  const aiUsd = m.currentAiSpendUsd;
  const otherOpexUsd = m.currentOpexUsd;
  const totalCostUsd = supabaseUsd + aiUsd + otherOpexUsd;
  const revenueUsd = m.currentRevenueUsd;
  const grossMarginUsd = revenueUsd - totalCostUsd;
  return {
    label: 'Today',
    dau: null,
    measured: true,
    registeredUsers: m.registeredUsersReal,
    peakConcurrent: m.loadMatrix?.honest_peak_concurrency ?? null,
    dbBytes: m.dbBytes,
    storageBytes: m.storageBytes,
    pooledDbConns: m.loadMatrix?.db_active_conn_peak ?? null,
    connCeiling: m.loadMatrix?.max_connections ?? null,
    computeTier: tier.name,
    computeUsd: tier.monthlyUsd,
    diskGb: m.dbBytes / GB,
    supabaseUsd,
    aiUncappedUsd: null,
    aiUsd,
    aiCapBreached: false,
    otherOpexUsd,
    totalCostUsd,
    revenueUsd,
    grossMarginUsd,
    marginPct: marginPct(revenueUsd, grossMarginUsd),
    costPerDauUsd: null,
  };
}

function buildScenario(
  dau: number,
  m: ForecastMeasured,
  a: ForecastAssumptions,
  coeff: DerivedCoefficients,
  fixedDbOverhead: number,
): ForecastScenario {
  const registered = dau * a.registered_per_dau;
  const peakConcurrent = dau * (a.peak_concurrency_pct / 100);
  const dbBytes = Math.max(m.dbBytes, fixedDbOverhead + registered * a.db_kb_per_user * 1024);
  const storageBytes = Math.max(m.storageBytes, registered * a.storage_kb_per_user * 1024);
  const pooledDbConns = peakConcurrent * coeff.dbConnsPerConcurrent;
  const tier = tierFor(peakConcurrent);

  const monthlyEgressGb = (dau * a.requests_per_dau * 30 * coeff.egressBytesPerRequest) / GB;
  const egressOverageUsd =
    Math.max(0, monthlyEgressGb - SUPABASE_PRICING.includedEgressGb) * SUPABASE_PRICING.egressOverageUsdPerGb;
  const supabaseUsd = SUPABASE_PRICING.proBaseUsd + tier.usd + diskOverageUsd(dbBytes) + egressOverageUsd;

  const revenueUsd =
    registered * (a.business_share_pct / 100) * (a.paying_conversion_pct / 100) * a.arpu_usd;

  const aiUncappedUsd = (dau * a.ai_cost_per_dau_cents) / 100;
  const aiCap = Math.max(AI_FLOOR_USD, 0.15 * revenueUsd);
  const aiUsd = Math.min(aiUncappedUsd, aiCap);

  const otherOpexUsd = m.currentOpexUsd; // held flat (founder tooling, not activity-scaled)
  const totalCostUsd = supabaseUsd + aiUsd + otherOpexUsd;
  const grossMarginUsd = revenueUsd - totalCostUsd;

  return {
    label: dau >= 1_000_000 ? `${dau / 1_000_000}M` : `${dau / 1000}K`,
    dau,
    measured: false,
    registeredUsers: registered,
    peakConcurrent,
    dbBytes,
    storageBytes,
    pooledDbConns,
    connCeiling: m.loadMatrix?.max_connections ?? null,
    computeTier: tier.name,
    computeUsd: tier.usd,
    diskGb: dbBytes / GB,
    supabaseUsd,
    aiUncappedUsd,
    aiUsd,
    aiCapBreached: aiUncappedUsd > aiCap,
    otherOpexUsd,
    totalCostUsd,
    revenueUsd,
    grossMarginUsd,
    marginPct: marginPct(revenueUsd, grossMarginUsd),
    costPerDauUsd: totalCostUsd / dau,
  };
}

export function buildForecast(input: ForecastInput): ForecastModel {
  const { measured: m, assumptions: a } = input;
  const notes: string[] = [];
  const coeff = deriveCoefficients(m, notes);
  // fixed DB overhead = today's physical bytes minus today's users' modeled contribution (floored ≥0);
  // every scenario's dbBytes is additionally floored at today's measured value (never forecast below reality).
  const currentUserDbBytes = m.registeredUsersReal * a.db_kb_per_user * 1024;
  const fixedDbOverhead = Math.max(0, m.dbBytes - currentUserDbBytes);
  const scenarios = [buildToday(m), ...DAU_LEVELS.map((d) => buildScenario(d, m, a, coeff, fixedDbOverhead))];
  return { scenarios, coefficients: coeff, notes };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/internal/forecastModel.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildForecast, DEFAULT_ASSUMPTIONS, FORECAST_KEYS, AI_FLOOR_USD,
  DEFAULT_DB_CONNS_PER_CONCURRENT, type ForecastMeasured,
} from './forecastModel';
import { GB } from './weightThresholds';

const measured: ForecastMeasured = {
  dbBytes: 0.5 * GB, storageBytes: 0.2 * GB, registeredUsersReal: 40, currentTierIndex: 0,
  loadMatrix: { honest_peak_concurrency: 4000, db_active_conn_peak: 27, max_connections: 90,
    media_bytes: 369_000_000, media_requests: 31_000 },
  currentAiSpendUsd: 225, currentOpexUsd: 390, currentRevenueUsd: 0,
};
const input = { measured, assumptions: DEFAULT_ASSUMPTIONS };

describe('buildForecast', () => {
  it('has FORECAST_KEYS matching every ForecastAssumptions field (prefix-stripped)', () => {
    const fields = Object.keys(DEFAULT_ASSUMPTIONS).sort();
    expect(FORECAST_KEYS.map((k) => k.replace(/^forecast_/, '')).sort()).toEqual(fields);
  });

  it('produces Today + three projected scenarios', () => {
    const m = buildForecast(input);
    expect(m.scenarios.map((s) => s.label)).toEqual(['Today', '500K', '750K', '1M']);
  });

  it('Today is measured — uses measured AI spend, no DAU-derived fields', () => {
    const today = buildForecast(input).scenarios[0];
    expect(today.measured).toBe(true);
    expect(today.aiUsd).toBe(225);
    expect(today.aiUncappedUsd).toBeNull();
    expect(today.costPerDauUsd).toBeNull();
    expect(today.registeredUsers).toBe(40);
    expect(today.marginPct).toBeNull(); // revenue 0
  });

  it('derives the measured connection coefficient from the load run', () => {
    const m = buildForecast(input);
    expect(m.coefficients.measuredCeiling).toBe(true);
    expect(m.coefficients.dbConnsPerConcurrent).toBeCloseTo(27 / 4000, 6);
  });

  it('falls back to defaults (and notes it) when the load matrix is null', () => {
    const m = buildForecast({ ...input, measured: { ...measured, loadMatrix: null } });
    expect(m.coefficients.measuredCeiling).toBe(false);
    expect(m.coefficients.dbConnsPerConcurrent).toBe(DEFAULT_DB_CONNS_PER_CONCURRENT);
    expect(m.notes.some((n) => /ceiling unavailable/i.test(n))).toBe(true);
  });

  it('falls back when a non-null matrix has a zero denominator (no NaN/Infinity)', () => {
    const zero = { ...measured, loadMatrix: { ...measured.loadMatrix!, honest_peak_concurrency: 0 } };
    const m = buildForecast({ ...input, measured: zero });
    expect(m.coefficients.measuredCeiling).toBe(false);
    expect(Number.isFinite(m.scenarios[1].pooledDbConns!)).toBe(true);
  });

  it('never forecasts DB or storage below today', () => {
    const big = { ...measured, dbBytes: 100 * GB, storageBytes: 100 * GB };
    const m = buildForecast({ ...input, measured: big });
    for (const s of m.scenarios) {
      expect(s.dbBytes).toBeGreaterThanOrEqual(100 * GB);
      expect(s.storageBytes).toBeGreaterThanOrEqual(100 * GB);
    }
  });

  it('applies the AI cap = max($250 floor, 15% revenue); flags a breach', () => {
    // Force a breach: huge per-DAU AI cost, tiny revenue.
    const a = { ...DEFAULT_ASSUMPTIONS, ai_cost_per_dau_cents: 10_000, paying_conversion_pct: 0 };
    const s = buildForecast({ measured, assumptions: a }).scenarios[1]; // 500K
    expect(s.revenueUsd).toBe(0);
    expect(s.aiUsd).toBe(AI_FLOOR_USD); // cap collapses to the floor, not 0
    expect(s.aiCapBreached).toBe(true);
  });

  it('computes the revenue funnel and a finite margin %', () => {
    const s = buildForecast(input).scenarios[3]; // 1M
    // registered 4M × 20% × 15% × $149 = 120,000 × 149 = 17,880,000
    expect(s.revenueUsd).toBeCloseTo(17_880_000, 0);
    expect(s.marginPct).not.toBeNull();
    expect(s.costPerDauUsd).toBeGreaterThan(0);
  });

  it('adds egress overage only past the included allowance', () => {
    const m = buildForecast(input);
    expect(m.scenarios[3].supabaseUsd).toBeGreaterThan(m.scenarios[1].supabaseUsd);
  });
});
```

- [ ] **Step 3: Run — expect fail, then pass.** `npx vitest run src/lib/internal/forecastModel.test.ts`
  (implementation from Step 1 makes it pass; iterate until green).

- [ ] **Step 4: Commit.**
  `git add src/lib/internal/forecastModel.ts src/lib/internal/forecastModel.test.ts && git commit -m "feat(internal): forecast model — infra + unit-economics at 500K/750K/1M DAU"`

---

## Task 2: The assumptions hook (`useForecastAssumptions.ts`)

**Files:** Create `src/hooks/internal/useForecastAssumptions.ts`. (Supabase-backed hooks aren't unit-tested
in this codebase — mirror `useCurrentTierIndex`/`useScorecardSettings` style; verify via typecheck + the
page.)

- [ ] **Step 1: Implement the read + update hooks.**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  FORECAST_KEYS, DEFAULT_ASSUMPTIONS, type ForecastAssumptions, type ForecastKey,
} from '@/lib/internal/forecastModel';

const QUERY_KEY = ['aios', 'forecast-assumptions'];

/** Reads the 9 forecast_* rows from aios_dashboard_settings; missing/invalid keys fall back to the
 *  coded default so the page works before the seed migration is applied. */
export function useForecastAssumptions() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<ForecastAssumptions> => {
      const { data, error } = await supabase
        .from('aios_dashboard_settings')
        .select('key, value')
        .in('key', FORECAST_KEYS as unknown as string[]);
      if (error) {
        console.error('forecast assumptions query failed:', error);
        throw error;
      }
      const out: ForecastAssumptions = { ...DEFAULT_ASSUMPTIONS };
      for (const row of data ?? []) {
        const field = row.key.replace(/^forecast_/, '') as keyof ForecastAssumptions;
        const n = Number((row as { value: unknown }).value);
        if (field in out && Number.isFinite(n)) out[field] = n;
      }
      return out;
    },
  });
}

/** Admin update of one assumption (whole number). Writes to the existing admin-UPDATE RLS on
 *  aios_dashboard_settings — same path useCurrentTierIndex reads. */
export function useUpdateForecastAssumption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: ForecastKey; value: number }) => {
      const { error } = await supabase
        .from('aios_dashboard_settings')
        .update({ value })
        .eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
```

- [ ] **Step 2: Typecheck.** `npm run typecheck` → clean.
- [ ] **Step 3: Commit.** `git add src/hooks/internal/useForecastAssumptions.ts && git commit -m "feat(internal): useForecastAssumptions — read/update the 9 KV forecast assumptions"`

---

## Task 3: Seed migration (`aios_dashboard_settings`)

**Files:** Create `supabase/migrations/20260727120000_forecast_assumptions_settings.sql`.
(Founder-gated — do NOT apply it here; the page degrades to coded defaults until it lands.)

- [ ] **Step 1: Write the migration — seed ALL 9 keys** (an unseeded key's panel edit silently no-ops).

```sql
-- Seed the 9 founder-editable forecast assumptions into the existing aios_dashboard_settings KV table.
-- No new table/RPC/policy: the table already has internal-SELECT + admin-UPDATE RLS. Idempotent.
-- Percentage keys store the whole-number percent (8 = 8%); the model divides by 100.
insert into public.aios_dashboard_settings (key, value) values
  ('forecast_registered_per_dau',    '4'::jsonb),
  ('forecast_db_kb_per_user',        '150'::jsonb),
  ('forecast_storage_kb_per_user',   '2048'::jsonb),
  ('forecast_peak_concurrency_pct',  '8'::jsonb),
  ('forecast_requests_per_dau',      '40'::jsonb),
  ('forecast_ai_cost_per_dau_cents', '0.5'::jsonb),
  ('forecast_business_share_pct',    '20'::jsonb),
  ('forecast_paying_conversion_pct', '15'::jsonb),
  ('forecast_arpu_usd',              '149'::jsonb)
on conflict (key) do nothing;
```

- [ ] **Step 2: Verify the column/PK assumption.** Confirm `aios_dashboard_settings` has `key` (pk/unique)
  + `value jsonb` (migration `20260617120000_aios_corrections.sql`). If the on-conflict target differs,
  match it. Do NOT apply to prod (founder gate).
- [ ] **Step 3: Commit.** `git add supabase/migrations/20260727120000_forecast_assumptions_settings.sql && git commit -m "feat(internal): seed 9 forecast assumption KV rows (founder-gated migration)"`

---

## Task 4: `ForecastTable` (pure render + chart)

**Files:** Create `src/components/internal/ForecastTable.tsx`, `src/components/internal/ForecastTable.test.tsx`.

- [ ] **Step 1: Implement the table.** Props: `{ model: ForecastModel }`. Render:
  - A horizontally-scrollable table (`overflow-x-auto` wrapper — never widen the page) with a column per
    scenario (`model.scenarios`) and row groups **Footprint** (registered users, peak concurrent, DB, storage,
    pooled DB conns `/ connCeiling`), **Tier** (compute tier + `computeUsd`, disk GB), **Cost/mo** (Supabase,
    AI — show `aiUsd`, and when `aiCapBreached` a "cap" flag; other opex; **Total**), **Economics** (revenue,
    gross margin $ + %, cost/DAU). Format `—` for null cells (Today's DAU-derived rows, margin% when revenue 0).
  - A `measured`-tagged style on the Today column header + an ASSUMED tag on the compute-tier row.
  - `model.notes.map(...)` rendered as small muted lines below the table (the degradation note).
  - A recharts `LineChart` of total cost vs revenue across the projected scenarios (reuse the Weight page's
    recharts import + dark tooltip style). Guard: only render the chart when ≥2 projected scenarios exist.
  - Number formatting: bytes → GB/TB helper; USD → `formatUsd`/`formatCents` from `@/lib/utils` (dollars
    are plain numbers here — use `` `$${Math.round(n).toLocaleString()}` ``); pct → `` `${Math.round(p*100)}%` ``.
- [ ] **Step 2: Write the test.**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForecastTable } from './ForecastTable';
import { buildForecast, DEFAULT_ASSUMPTIONS, type ForecastMeasured } from '@/lib/internal/forecastModel';
import { GB } from '@/lib/internal/weightThresholds';

const measured: ForecastMeasured = {
  dbBytes: 0.5 * GB, storageBytes: 0.2 * GB, registeredUsersReal: 40, currentTierIndex: 0,
  loadMatrix: null, currentAiSpendUsd: 225, currentOpexUsd: 390, currentRevenueUsd: 0,
};

describe('ForecastTable', () => {
  it('renders a column per scenario and the degradation note when the load matrix is null', () => {
    const model = buildForecast({ measured, assumptions: DEFAULT_ASSUMPTIONS });
    render(<ForecastTable model={model} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('1M')).toBeInTheDocument();
    expect(screen.getByText(/ceiling unavailable/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/components/internal/ForecastTable.test.tsx` → pass.
- [ ] **Step 4: Commit.** `feat(internal): ForecastTable — four-scenario cost/economics table + chart`

---

## Task 5: `ForecastAssumptionsPanel` (admin-editable)

**Files:** Create `src/components/internal/ForecastAssumptionsPanel.tsx`.

- [ ] **Step 1: Implement.** Props: `{ assumptions: ForecastAssumptions; hints?: Partial<Record<keyof ForecastAssumptions,string>> }`.
  Render one labelled numeric `Input` per assumption (order = `FORECAST_KEYS`), showing the current value and
  an optional derived hint (e.g. "current data suggests ~X"). On change/blur, call
  `useUpdateForecastAssumption().mutate({ key: 'forecast_'+field, value })` (parse with `parseFloat`, ignore
  NaN), toast on error (`sonner`). Use the internal dark styling already used by `InternalExpenses` inputs.
  The page is admin-only, so there is no read-only branch.
- [ ] **Step 2: Typecheck** → clean.
- [ ] **Step 3: Commit.** `feat(internal): ForecastAssumptionsPanel — live-tunable forecast assumptions`

---

## Task 6: `InternalForecast` page

**Files:** Create `src/pages/internal/InternalForecast.tsx` (default export — pages use default exports).

- [ ] **Step 1: Implement.** Wire the hooks → measured input → model → table + panel:
  - Hooks: `usePlatformWeight` (latest snapshot → `dbBytes`/`storageBytes`/`users_total_real`),
    `useSimLoadMatrixSummary` (→ `loadMatrix` or null), `useCurrentTierIndex` (`currentTierIndex`),
    `useCostStats` (`mtd_spend_usd`), `useOperatingExpenses` (Σ active/100), `useRevenueStats`
    (`dragonshare_mtd.platform_fee_cents/100`), `useForecastAssumptions`.
  - Loading: spinner while the core queries load. Error: `ErrorCard` if platform-weight/assumptions error.
    Build `ForecastMeasured` (guard each source with sensible fallbacks: no weight snapshot → use 0s +
    a note; the model already tolerates a null loadMatrix).
  - `const model = buildForecast({ measured, assumptions })`.
  - Layout: `PageContainer size="xl"` + `PageHeader` ("Scale & cost forecast", subtitle: "A what-if
    capacity + unit-economics model — measured where possible, assumptions elsewhere. Not a growth
    projection."). Then `<ForecastTable model={model} />`, a `SectionHeading`, `<ForecastAssumptionsPanel
    assumptions={assumptions} hints={…}/>`, and a small measured-vs-assumed legend.
- [ ] **Step 2: Typecheck + build.** `npm run typecheck && npm run build` → green.
- [ ] **Step 3: Commit.** `feat(internal): /internal/forecast page — wires hooks → model → table + panel`

---

## Task 7: Route + nav (admin-gated)

**Files:** Modify `src/App.tsx`, `src/components/internal/InternalLayout.tsx`.

- [ ] **Step 1: Lazy import + route in `App.tsx`.** Near the other `InternalX` lazies (≈L104-107):
  `const InternalForecast = lazy(() => import("./pages/internal/InternalForecast"));`
  Inside the `/internal` route block (after the `simulation` route, ≈L358):
  `<Route path="forecast" element={<InternalRoute tier="admin"><InternalForecast /></InternalRoute>} />`
- [ ] **Step 2: Nav item in `InternalLayout.tsx`.** Import `TrendingUp` from `lucide-react` (add to the
  L4-20 import block). In the **Operate** group `items` array (after Expenses, L60):
  `{ to: '/internal/forecast', label: 'Forecast', icon: TrendingUp },`
- [ ] **Step 3: Typecheck + build** → green.
- [ ] **Step 4: Commit.** `feat(internal): route + Operate-group nav for /internal/forecast (admin-gated)`

---

## Task 8: Knowledge-sync

**Files:** Create `docs/wiki/raw/sessions/2026-07-27-cost-dau-forecast.md` + `docs/wiki/concepts/cost-dau-forecast.md`;
update `docs/wiki/index.md`, `docs/wiki/log.md`, `docs/SHIPPED_LOG.md` (prepend), `docs/PROJECT_CONTEXT.md` §5.

- [ ] **Step 1:** Write the raw session source (what shipped, decisions, gotchas, files/migration).
- [ ] **Step 2:** `/wiki-ops ingest` it → create `concepts/cost-dau-forecast.md` (`[[wikilinks]]` to
  [[Internal Real-vs-Total Metrics]], [[Synthetic Weight Engine]], [[AIOS Internal Shell]]); update
  `index.md` (alphabetical) + append `log.md`.
- [ ] **Step 3:** Prepend the SHIPPED_LOG entry (newest-first); update §5 (move sub-project 3 from scoped →
  built, note the founder-gated migration + the deferred scorecard tie-in).
- [ ] **Step 4:** Commit. (RAG sync happens after merge to main — the post-merge hook / manual `sync:wiki`.)

---

## Definition of done

- [ ] All tasks committed; `npm run typecheck`, `npm run lint`, `npm run build`, and the new vitest files green.
- [ ] Migration `20260727120000` written but NOT applied (founder gate); page verified to degrade to defaults.
- [ ] **Codex second review** (`codex review --base main`) clean; findings fixed + re-run.
- [ ] knowledge-sync done; then `finishing-a-development-branch` → push + open PR.
- [ ] Deferred + recorded: the scorecard margin-line tie-in (needs #350 on main); live infra telemetry
  (sub-project 2).
