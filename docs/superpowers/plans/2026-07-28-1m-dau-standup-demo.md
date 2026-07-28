# DragonCandy at 1M DAU — Standup Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Ship a prod-safe `DEMO_SCALE` mode that, when enabled on an isolated non-prod deployment,
marks the whole app as a demo and promotes the existing forecast model's 1,000,000-DAU scenario to the
headline across the internal metrics deck — the app-side foundation of the walkable "DragonCandy at 1M
DAU" standup demo.

**Architecture:** A single pure guard (`isDemoScale()` = build flag **AND** non-prod project ref)
gates a global `<DemoScaleBanner/>` (rendered once in `AppShell`) and a shared
`<DemoScaleForecastHero/>` that reuses `forecastModel.buildForecast()` output — selecting its `1M`
scenario — on `/internal/{overview,weight,scorecard}`. No metric math is forked; the real
synthetic-segregated query paths are never mutated; with the flag off the app is byte-identical to today.

**Tech Stack:** React 18 + TypeScript + Vite (`import.meta.env.VITE_*`), TanStack Query, Tailwind
(dc-* brand tokens), Vitest (co-located `*.test.ts` / jsdom `*.test.tsx`), Supabase (branches via MCP).

**Spec:** `docs/superpowers/specs/2026-07-28-1m-dau-standup-demo-design.md`

---

## Scope of THIS plan

**In full detail:** **Phase 1 — `DEMO_SCALE` mode (Component A).** Independently shippable, prod-safe,
and mergeable on its own. It renders the badged 1M projection hero from the *live* forecast model even
with no seeded world (with default load coefficients until Phase 2 seeds the measured ceiling).

**Outlined only (own plans later):** **Phase 2 — branch world-seeder** and **Phase 3 — standup/teardown
runbook + live-burst.** They carry real unknowns (Vercel-preview→Supabase-branch env wiring, branch
`auth` behavior, exact existing seeder RPC names) that should be resolved with hands on a live branch
before their tasks are pinned down. See "Phases 2 & 3 — outline" at the end.

## File structure (Phase 1)

**Create**
- `src/lib/internal/demoScale.ts` — the `isDemoScale()` guard (pure). One responsibility: is DEMO mode on?
- `src/lib/internal/demoScale.test.ts` — guard unit tests (incl. the hard prod-ref off-switch).
- `src/lib/internal/demoScaleScenario.ts` — `selectDemoScaleScenario(model)` pure selector (the `1M` row).
  (Spec §4A/§9 sketched this as `demoScaleForecast.ts`; renamed for clarity — same responsibility.)
- `src/lib/internal/demoScaleScenario.test.ts` — selector unit tests.
- `src/hooks/internal/useForecast.ts` — shared hook composing the forecast inputs + `buildForecast`
  (extracted from `InternalForecast.tsx` so the deck pages can compute the model too).
- `src/components/internal/DemoScaleBanner.tsx` — global "DEMO — projected 1M DAU" banner (self-gating).
- `src/components/internal/DemoScaleBanner.test.tsx` — renders only when `isDemoScale()`.
- `src/components/internal/DemoScaleForecastHero.tsx` — badged 1M hero (self-gating; uses `useForecast`).
- `src/components/internal/DemoScaleForecastHero.test.tsx` — renders hero when on, nothing when off.

**Modify**
- `src/pages/internal/InternalForecast.tsx` — consume `useForecast()` (behaviour-preserving refactor).
- `src/App.tsx:404` — render `<DemoScaleBanner/>` beside `<UpdateBanner/>` in `AppShell` (global).
- `src/pages/internal/InternalOverview.tsx` — render `<DemoScaleForecastHero/>` at the top.
- `src/pages/internal/InternalWeight.tsx` — render `<DemoScaleForecastHero/>` at the top.
- `src/pages/internal/InternalScorecard.tsx` — render `<DemoScaleForecastHero/>` at the top.

**Conventions to follow** (verified in-repo):
- Build flags read `import.meta.env.VITE_*`; simple compile-time booleans live in `src/lib/featureConfig.ts`.
- Prod project ref is `zocahiffooqdybdhguqv` (`src/integrations/supabase/client.ts:11`).
- Vitest is `node` env globally; component tests need, as the **first two lines**:
  `// @vitest-environment jsdom` then `import '@testing-library/jest-dom';` (see any
  `src/components/internal/*.test.tsx`).
- Trust `npm run test` "N passed, 0 failed" over its exit code (pre-existing nested-worktree e2e files fail).
- Brand rule: **no gray** — use dc-pink/dc-yellow/dc-teal/amber tints for the banner + PROJECTED badge.

---

## Task 1: `isDemoScale()` guard (pure, hard prod off-switch)

**Files:**
- Create: `src/lib/internal/demoScale.ts`
- Test: `src/lib/internal/demoScale.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/internal/demoScale.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemoScale } from './demoScale';

afterEach(() => vi.unstubAllEnvs());

describe('isDemoScale', () => {
  it('is false when the flag is unset (default — prod-safe)', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://branch-abc.supabase.co');
    expect(isDemoScale()).toBe(false);
  });

  it('is true with the flag on AND a non-prod project', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://branch-abc.supabase.co');
    expect(isDemoScale()).toBe(true);
  });

  it('is FALSE on the prod project even with the flag on (hard guard)', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://zocahiffooqdybdhguqv.supabase.co');
    expect(isDemoScale()).toBe(false);
  });

  it('is FALSE when the URL is unset (unset falls back to prod at runtime)', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(isDemoScale()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/internal/demoScale.test.ts`
Expected: FAIL — `isDemoScale` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/internal/demoScale.ts
/**
 * DEMO_SCALE mode gate — the app-side switch for the "DragonCandy at 1M DAU" standup demo.
 *
 * Returns true ONLY when BOTH hold:
 *   1. the build flag VITE_DEMO_SCALE === '1', AND
 *   2. the configured Supabase project is NOT prod.
 *
 * The prod-ref check is a hard, independent off-switch: if the flag ever leaks onto a prod build,
 * or the Supabase URL is unset (which falls back to prod at runtime in client.ts), DEMO mode stays
 * inert. This is what makes the demo impossible to render against production — do not weaken it.
 */
const PROD_PROJECT_REF = 'zocahiffooqdybdhguqv';

export function isDemoScale(): boolean {
  if (import.meta.env.VITE_DEMO_SCALE !== '1') return false;
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  if (url === '' || url.includes(PROD_PROJECT_REF)) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/internal/demoScale.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/internal/demoScale.ts src/lib/internal/demoScale.test.ts
git commit -m "feat(demo): isDemoScale() guard — build flag + hard prod-ref off-switch"
```

---

## Task 2: `selectDemoScaleScenario()` selector (pure)

**Files:**
- Create: `src/lib/internal/demoScaleScenario.ts`
- Test: `src/lib/internal/demoScaleScenario.test.ts`

Reuses the already-tested `buildForecast` (`src/lib/internal/forecastModel.ts`). No new math — this only
*selects* the `dau === 1_000_000` scenario for headline display.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/internal/demoScaleScenario.test.ts
import { describe, expect, it } from 'vitest';
import { buildForecast } from './forecastModel';
import { DEFAULT_ASSUMPTIONS } from './forecastModel';
import { selectDemoScaleScenario } from './demoScaleScenario';

const measured = {
  dbBytes: 0, storageBytes: 0, registeredUsersReal: 40, currentTierIndex: 0,
  loadMatrix: null, currentAiSpendUsd: 0, currentOpexUsd: 0, currentRevenueUsd: 0,
};

describe('selectDemoScaleScenario', () => {
  it('returns the 1,000,000-DAU scenario from a built model', () => {
    const model = buildForecast({ measured, assumptions: DEFAULT_ASSUMPTIONS });
    const s = selectDemoScaleScenario(model);
    expect(s).not.toBeNull();
    expect(s!.dau).toBe(1_000_000);
    expect(s!.label).toBe('1M');
    expect(s!.registeredUsers).toBe(1_000_000 * DEFAULT_ASSUMPTIONS.registered_per_dau);
  });

  it('returns null when no 1M scenario is present', () => {
    expect(selectDemoScaleScenario({ scenarios: [], coefficients: {} as never, notes: [] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/internal/demoScaleScenario.test.ts`
Expected: FAIL — `selectDemoScaleScenario` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/internal/demoScaleScenario.ts
import type { ForecastModel, ForecastScenario } from './forecastModel';

/** The demo headline scenario — the 1,000,000-DAU row of a built forecast (null if absent). */
export function selectDemoScaleScenario(model: ForecastModel): ForecastScenario | null {
  return model.scenarios.find((s) => s.dau === 1_000_000) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/internal/demoScaleScenario.test.ts`
Expected: PASS — 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/internal/demoScaleScenario.ts src/lib/internal/demoScaleScenario.test.ts
git commit -m "feat(demo): selectDemoScaleScenario() — pick the 1M scenario from a built forecast"
```

---

## Task 3: Extract `useForecast()` shared hook (behaviour-preserving refactor)

Today only `InternalForecast.tsx` composes the forecast inputs + `buildForecast`. The deck overlays need
the same model on other pages, so extract the composition verbatim into a hook, then make the forecast
page consume it. **No behaviour change** — this is a pure refactor guarded by build + existing tests.

**Files:**
- Create: `src/hooks/internal/useForecast.ts`
- Modify: `src/pages/internal/InternalForecast.tsx`

- [ ] **Step 1: Create the hook (move the composition out of InternalForecast verbatim)**

```ts
// src/hooks/internal/useForecast.ts
import { usePlatformStats } from '@/hooks/internal/usePlatformStats';
import { usePlatformWeight } from '@/hooks/internal/usePlatformWeight';
import { useSimLoadMatrixSummary } from '@/hooks/internal/useSimLoadMatrixSummary';
import { useCurrentTierIndex } from '@/hooks/internal/useDashboardSettings';
import { useCostStats } from '@/hooks/internal/useCostStats';
import { useOperatingExpenses } from '@/hooks/internal/useOperatingExpenses';
import { useRevenueStats } from '@/hooks/internal/useRevenueStats';
import { useForecastAssumptions } from '@/hooks/internal/useForecastAssumptions';
import {
  buildForecast, type ForecastMeasured, type ForecastModel, type LoadCeiling,
} from '@/lib/internal/forecastModel';
import { DEFAULT_TIER_INDEX } from '@/lib/internal/weightThresholds';

export interface UseForecastResult {
  model: ForecastModel | null;
  isLoading: boolean;
  isError: boolean;
  businessSharePct: number; // current: % of users that are businesses (a hint for the assumptions panel)
}

/** Composes the measured inputs + founder assumptions into the pure forecast model. Extracted from
 *  InternalForecast so /internal/{overview,weight,scorecard} can compute the same model for the demo hero. */
export function useForecast(): UseForecastResult {
  const platformStats = usePlatformStats();
  const weight = usePlatformWeight();
  const assumptionsQuery = useForecastAssumptions();
  const matrix = useSimLoadMatrixSummary();
  const { data: currentTierIndex = DEFAULT_TIER_INDEX } = useCurrentTierIndex();
  const cost = useCostStats();
  const expenses = useOperatingExpenses();
  const revenue = useRevenueStats();

  const isLoading = platformStats.isLoading || weight.isLoading || assumptionsQuery.isLoading;
  // Mirror InternalForecast's fatal set: a silently-$0 cost/revenue/opex or 0-byte weight would
  // understate cost / inflate margin (honesty-rail violation), so those errors are fatal.
  const isError =
    platformStats.isError || !platformStats.data ||
    assumptionsQuery.isError || !assumptionsQuery.data ||
    weight.isError || cost.isError || revenue.isError || expenses.isError;

  if (isLoading || isError || !platformStats.data || !assumptionsQuery.data) {
    return { model: null, isLoading, isError, businessSharePct: 0 };
  }

  const stats = platformStats.data;
  const assumptions = assumptionsQuery.data;
  const weightRows = weight.data ?? [];
  const latestWeight = weightRows.length > 0 ? weightRows[weightRows.length - 1] : null;

  const loadMatrix: LoadCeiling | null = matrix.data
    ? {
        honest_peak_concurrency: matrix.data.honest_peak_concurrency,
        db_active_conn_peak: matrix.data.db_active_conn_peak,
        max_connections: matrix.data.max_connections,
        media_bytes: matrix.data.media_bytes,
        media_requests: matrix.data.media_requests,
      }
    : null;

  const currentOpexUsd =
    (expenses.data ?? []).filter((e) => e.active).reduce((sum, e) => sum + e.monthly_amount_cents, 0) / 100;

  const measured: ForecastMeasured = {
    dbBytes: latestWeight?.db_bytes ?? 0,
    storageBytes: latestWeight?.storage_bytes ?? 0,
    registeredUsersReal: stats.users.total,
    currentTierIndex,
    loadMatrix,
    currentAiSpendUsd: cost.data?.mtd_spend_usd ?? 0,
    currentOpexUsd,
    currentRevenueUsd: (revenue.data?.dragonshare_mtd.platform_fee_cents ?? 0) / 100,
  };

  const totalUsers = stats.users.total;
  const businesses = stats.businesses.restaurants + stats.businesses.brands;
  const businessSharePct = Math.round((businesses / Math.max(1, totalUsers)) * 100);

  return { model: buildForecast({ measured, assumptions }), isLoading: false, isError: false, businessSharePct };
}
```

- [ ] **Step 2: Refactor `InternalForecast.tsx` to consume the hook**

Replace its hook block + `measured`/`model`/`businessSharePct` derivation (currently lines ~27–99) with:

```tsx
import { useForecast } from '@/hooks/internal/useForecast';
// ...
const { model, isLoading, isError, businessSharePct } = useForecast();
const assumptionsQuery = useForecastAssumptions(); // still needed for the assumptions panel

if (isLoading) { /* keep existing Spinner block */ }
if (isError || !model || assumptionsQuery.isError || !assumptionsQuery.data) {
  return <ErrorCard message="Forecast failed to load — check your internal access and try again." />;
}
const assumptions = assumptionsQuery.data;
// <ForecastTable model={model} /> ... <ForecastAssumptionsPanel assumptions={assumptions} hints={{ business_share_pct: `current: ${businessSharePct}% of users are businesses` }} />
```
Keep the page's JSX (`ForecastTable`, `ForecastAssumptionsPanel`, footnote) unchanged.

- [ ] **Step 3: Verify build + typecheck + existing forecast tests still pass**

Run: `npm run build`
Expected: build succeeds (no TS errors).
Run: `npm run test -- src/lib/internal/forecastModel.test.ts src/components/internal/ForecastTable.test.tsx`
Expected: PASS (unchanged — the model + table are untouched).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/internal/useForecast.ts src/pages/internal/InternalForecast.tsx
git commit -m "refactor(internal): extract useForecast() hook (no behaviour change)"
```

---

## Task 4: Global `<DemoScaleBanner/>` (self-gating) + wire into AppShell

**Files:**
- Create: `src/components/internal/DemoScaleBanner.tsx`
- Create: `src/components/internal/DemoScaleBanner.test.tsx`
- Modify: `src/App.tsx` (render beside `<UpdateBanner/>` in `AppShell`, ~line 404)

- [ ] **Step 1: Write the failing component test**

```tsx
// src/components/internal/DemoScaleBanner.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoScaleBanner } from './DemoScaleBanner';

afterEach(() => vi.unstubAllEnvs());

describe('DemoScaleBanner', () => {
  it('renders nothing when DEMO mode is off', () => {
    const { container } = render(<DemoScaleBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the DEMO banner when DEMO mode is on (non-prod project)', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://branch-abc.supabase.co');
    render(<DemoScaleBanner />);
    expect(screen.getByText(/projected 1,000,000 dau/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/internal/DemoScaleBanner.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the banner**

```tsx
// src/components/internal/DemoScaleBanner.tsx
import { isDemoScale } from '@/lib/internal/demoScale';

/** Global, unmissable marker that this instance is the 1M-DAU standup demo (synthetic data + projected
 *  metrics, not production). Self-gating: renders nothing unless isDemoScale(). Placed once in AppShell
 *  so it marks every surface. Brand-adjacent (no gray) per house rule. */
export function DemoScaleBanner() {
  if (!isDemoScale()) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-dc-pink-accent px-4 py-1.5 text-center text-xs font-bold text-white"
    >
      <span className="inline-block h-2 w-2 rounded-full bg-white/90" />
      DEMO — projected 1,000,000 DAU · synthetic data · not production
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/internal/DemoScaleBanner.test.tsx`
Expected: PASS — 2 passed.

- [ ] **Step 5: Wire into AppShell**

In `src/App.tsx`, `AppShell()`, add the import and render the banner immediately after `<UpdateBanner />`:

```tsx
import { DemoScaleBanner } from '@/components/internal/DemoScaleBanner';
// ... inside <main id="main-content">:
          <UpdateBanner />
          <DemoScaleBanner />
```

Note: `/pitch*` renders outside `AppShell` (`App.tsx:422`), so the global banner has that one exception.
Irrelevant to the §5 walkthrough (which never visits `/pitch`); mentioned for completeness.

- [ ] **Step 6: Verify build + inert-when-off**

Run: `npm run build`
Expected: succeeds.
Run: `npm run test -- src/components/internal/DemoScaleBanner.test.tsx`
Expected: PASS (the "off" case proves prod builds render nothing).

- [ ] **Step 7: Commit**

```bash
git add src/components/internal/DemoScaleBanner.tsx src/components/internal/DemoScaleBanner.test.tsx src/App.tsx
git commit -m "feat(demo): global DemoScaleBanner, wired into AppShell (inert unless DEMO on)"
```

---

## Task 5: Shared `<DemoScaleForecastHero/>` (badged 1M headline)

The one reusable overlay: computes the live forecast via `useForecast()`, selects the 1M scenario, and
renders it as a **PROJECTED**-badged hero. Self-gating (`isDemoScale()` → else `null`). Dropped onto the
three deck pages in Task 6 with a single line each (DRY).

**Files:**
- Create: `src/components/internal/DemoScaleForecastHero.tsx`
- Create: `src/components/internal/DemoScaleForecastHero.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
// src/components/internal/DemoScaleForecastHero.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoScaleForecastHero } from './DemoScaleForecastHero';

// Stub the forecast composition so the test is about the hero, not the network.
vi.mock('@/hooks/internal/useForecast', () => ({
  useForecast: () => ({
    model: {
      scenarios: [
        { label: '1M', dau: 1_000_000, registeredUsers: 4_000_000, totalCostUsd: 123456,
          revenueUsd: 17_880_000, marginPct: 0.98, costPerDauUsd: 0.12, computeTier: 'Custom',
          peakConcurrent: 80_000, dbBytes: 0, storageBytes: 0, measured: false } as never,
      ],
      coefficients: {} as never, notes: [],
    },
    isLoading: false, isError: false, businessSharePct: 20,
  }),
}));

afterEach(() => vi.unstubAllEnvs());

describe('DemoScaleForecastHero', () => {
  it('renders nothing when DEMO mode is off', () => {
    const { container } = render(<DemoScaleForecastHero />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the badged 1M projection hero when DEMO mode is on', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://branch-abc.supabase.co');
    render(<DemoScaleForecastHero />);
    expect(screen.getByText(/projected/i)).toBeInTheDocument();
    expect(screen.getByText(/1,000,000/)).toBeInTheDocument(); // DAU headline
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/internal/DemoScaleForecastHero.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hero**

```tsx
// src/components/internal/DemoScaleForecastHero.tsx
import { isDemoScale } from '@/lib/internal/demoScale';
import { useForecast } from '@/hooks/internal/useForecast';
import { selectDemoScaleScenario } from '@/lib/internal/demoScaleScenario';
import { StatCard, SectionHeading } from '@/components/internal/stats';
import { formatUsd } from '@/lib/utils';

/** Badged "at 1M DAU" projection hero for the internal deck. Reuses the pure forecast model (no forked
 *  math); self-gates on isDemoScale(); returns null off or before the model resolves so real query paths
 *  are never blocked. Every figure is explicitly PROJECTED — it must never read as measured/real. */
export function DemoScaleForecastHero() {
  const { model } = useForecast();
  if (!isDemoScale() || !model) return null;
  const s = selectDemoScaleScenario(model);
  if (!s) return null;

  return (
    <section className="rounded-2xl border border-dashed border-dc-yellow/40 bg-dc-yellow/[0.06] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-dc-yellow/60 bg-dc-yellow/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-dc-yellow">
          Projected · 1M DAU
        </span>
        <span className="text-xs text-white/50">
          Modeled from the forecast assumptions — not measured on this instance.
        </span>
      </div>
      <SectionHeading>At 1,000,000 daily active users</SectionHeading>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Daily active users" value={(1_000_000).toLocaleString()} accent="pink" />
        <StatCard label="Registered users" value={s.registeredUsers.toLocaleString()} />
        <StatCard label="Monthly cost" value={formatUsd(s.totalCostUsd)} sub={s.computeTier} />
        <StatCard
          label="Gross margin"
          value={s.marginPct != null ? `${Math.round(s.marginPct * 100)}%` : '—'}
          sub={`${formatUsd(s.revenueUsd)}/mo revenue`}
          accent="pink"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/internal/DemoScaleForecastHero.test.tsx`
Expected: PASS — 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/internal/DemoScaleForecastHero.tsx src/components/internal/DemoScaleForecastHero.test.tsx
git commit -m "feat(demo): DemoScaleForecastHero — badged 1M projection, reuses forecast model"
```

---

## Task 6: Drop the hero onto the deck pages (overview, weight, scorecard)

One-line insertions — the hero self-gates, so these are inert off DEMO. Placed at the **top** of each
page so the 1M headline leads, with the page's real (branch) content following unchanged beneath.

**Files:**
- Modify: `src/pages/internal/InternalOverview.tsx`
- Modify: `src/pages/internal/InternalWeight.tsx`
- Modify: `src/pages/internal/InternalScorecard.tsx`

- [ ] **Step 1: Add the hero to each page**

Import and render it as the first element under the page's `<PageHeader/>`:

```tsx
import { DemoScaleForecastHero } from '@/components/internal/DemoScaleForecastHero';
// ... first element under <PageHeader/>:
      <DemoScaleForecastHero />
```

- `InternalOverview.tsx` and `InternalScorecard.tsx` — straightforward: they render with ~0 real data,
  so add the hero directly under the page header.
- **`InternalWeight.tsx` needs care — it early-returns an `ErrorCard` BEFORE `<PageContainer>` when
  there are no weight snapshots (`InternalWeight.tsx:44-46`).** On a fresh/unseeded branch (0
  `platform_weight` rows) that path renders, so a hero placed only inside the main `<PageContainer>`
  would NOT appear — contradicting "the hero renders even with no seeded world." Fix: render the hero
  above that guard. Restructure the empty case to keep the layout + hero, e.g.:

  ```tsx
  const noSnapshots = weight.isError || !weight.data || weight.data.length === 0;
  // ... after the isLoading spinner guard:
  if (noSnapshots) {
    return (
      <PageContainer size="xl">
        <PageHeader title="Weight & health" />
        <DemoScaleForecastHero />
        <ErrorCard message="No weight snapshots yet — the daily capture runs at 08:30 UTC." />
      </PageContainer>
    );
  }
  // ...main return also renders <DemoScaleForecastHero /> as its first element under <PageHeader/>.
  ```

**Implementer note (branch-auth dependency):** the hero calls `useForecast()`, which treats a
cost/revenue/opex/weight *error* as fatal (`model = null` → hero renders nothing). On a branch where the
demo login isn't an internal/admin user, those internal reads can error and the heroes will silently
vanish. That's the same fail-closed behaviour `InternalForecast` already has — don't chase it as a bug;
it's the branch-auth unknown the spec flags for Phase 2/3.

- [ ] **Step 2: Verify build + full internal test suite**

Run: `npm run build`
Expected: succeeds.
Run: `npm run test -- src/pages/internal src/components/internal src/lib/internal`
Expected: the demo + existing internal suites report "0 failed" (ignore the global exit code per repo note).

- [ ] **Step 3: Commit**

```bash
git add src/pages/internal/InternalOverview.tsx src/pages/internal/InternalWeight.tsx src/pages/internal/InternalScorecard.tsx
git commit -m "feat(demo): surface the 1M projection hero on overview/weight/scorecard (inert off DEMO)"
```

---

## Task 7: Emphasise the 1M column on `/internal/forecast` (minimal)

The forecast table already renders the `1M` column; under DEMO mode, highlight/pin it so it reads as the
focus. Keep it tiny — a conditional class, not a rewrite.

**Files:**
- Modify: `src/components/internal/ForecastTable.tsx` (accept an optional `emphasizeLabel?: string`)
- Modify: `src/components/internal/ForecastTable.test.tsx` (add the emphasis test)
- Modify: `src/pages/internal/InternalForecast.tsx` (pass `emphasizeLabel={isDemoScale() ? '1M' : undefined}`)

- [ ] **Step 1: Write the failing test for the emphasis prop**

Add to `ForecastTable.test.tsx` (follow the file's existing render helper / model fixture):

```tsx
it('highlights the emphasized column when emphasizeLabel is set', () => {
  const model = /* the file's existing built/fixture model */;
  const { container } = render(<ForecastTable model={model} emphasizeLabel="1M" />);
  // the 1M column header carries the highlight ring; without the prop it does not
  expect(container.querySelector('.ring-dc-pink\\/50')).not.toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/components/internal/ForecastTable.test.tsx`
Expected: FAIL — no element has the ring class (prop not implemented / not applied).

- [ ] **Step 3: Add the optional emphasis prop to ForecastTable**

Add `emphasizeLabel?: string` to its props; when a scenario's `label === emphasizeLabel`, add a
highlight class (`ring-1 ring-dc-pink/50`) to that column's header/cells. Default undefined → no change.

- [ ] **Step 4: Pass it from the forecast page**

```tsx
import { isDemoScale } from '@/lib/internal/demoScale';
// ...
<ForecastTable model={model} emphasizeLabel={isDemoScale() ? '1M' : undefined} />
```

- [ ] **Step 5: Run the test to verify it passes + build**

Run: `npm run test -- src/components/internal/ForecastTable.test.tsx && npm run build`
Expected: emphasis test PASS; existing default-path tests still PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/internal/ForecastTable.tsx src/pages/internal/InternalForecast.tsx
git commit -m "feat(demo): emphasise the 1M column on /internal/forecast under DEMO mode"
```

---

## Task 8: Phase-1 verification gate

- [ ] **Step 1: Full typecheck + build**

Run: `npm run build`
Expected: no TS errors; bundle builds.

- [ ] **Step 2: Run the demo + internal test suites**

Run: `npm run test -- src/lib/internal src/components/internal src/pages/internal`
Expected: all demo tests pass; existing internal tests unchanged; "0 failed" in the summary.

- [ ] **Step 3: Prove prod-inertness (the honesty rail)**

Confirm by inspection + the Task 1 test that with `VITE_DEMO_SCALE` unset **or** the prod ref configured,
`isDemoScale()` is `false` → banner and hero render nothing and no page behaviour changes. This is the
merge-safety guarantee: Phase 1 is byte-identical on prod.

- [ ] **Step 4: Local visual smoke (optional, best-effort)**

The banner renders with no data; the hero needs live forecast data, so a *full* visual smoke belongs to
the Phase-3 branch dry-run. For a local check, run against a reachable non-prod DB:
`VITE_DEMO_SCALE=1 VITE_SUPABASE_URL=<non-prod-url> VITE_SUPABASE_ANON_KEY=<key> npm run dev` and confirm
the banner shows on `/` and the hero leads `/internal`. Note in the PR if deferred to Phase 3.

- [ ] **Step 5: Codex second review + finish the branch**

Per repo rule, run the codex-review skill (`codex review --base main`) as the independent second reviewer;
fix findings and re-run. Then use superpowers:finishing-a-development-branch to open the PR.

---

## Phases 2 & 3 — outline (expand into their own plans after Phase 1 merges)

These are **not** task-decomposed here on purpose — they hinge on unknowns best resolved on a live branch.

**Phase 2 — branch world-seeder** (`scripts/demo/seed-1m-dau-demo.ts`, idempotent, prod-ref-guarded):
- Resolve exact existing seeder entrypoints/RPC names first (DragonFeed feed seed; the
  `seed_synthetic_marketplace_depth`-family; campaign/application/payout/earnings seeders). Verify against `main`.
- Create the two demo logins (restaurant + creator) with populated dashboards; seed feed + marketplace depth.
- **Measured-ceiling seeding (the reviewed trap):** insert ~20 shard-stamped `sim_load_snapshots` rows —
  `matrix%` `run_label`, `notes.shard`, **overlapping `captured_at`** — reproducing honest-peak ≈ 4,000, so
  `get_sim_load_matrix_summary` yields a real ceiling (a single/summary row → honest_peak = 0 → DEFAULT
  coefficients). Plus a `platform_weight` point reading. Confirm the hook reads the *latest* `matrix%` label.
- Tag everything `is_synthetic`; assert idempotency (second run → stable counts) on a branch.

**Phase 3 — standup/teardown runbook + live-burst** (`docs/runbooks/1m-dau-standup-demo.md`):
- `create_branch` (confirm_cost) → verify migrations applied on branch → run Phase-2 seeder → deploy a
  preview with `VITE_DEMO_SCALE=1` + `VITE_SUPABASE_*` → branch → smoke the six walkthrough beats → demo →
  live-burst → `delete_branch`.
- **Validate early:** Vercel-preview→Supabase-branch env wiring (the biggest unknown) and branch `auth`
  (service-role user creation) — both may reshape Phase 2/3 details.
- Live-burst: a small pointable ~few-hundred-concurrency generator writing `sim_load` snapshots so
  `/internal/{weight,simulation}` move live; document that the full 4,000-run is the seeded captured ceiling.
- Demo-login credentials documented **here** (runbook), not in the seeder or repo secrets.
