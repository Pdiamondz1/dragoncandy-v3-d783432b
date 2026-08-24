# Investor Financial Model (Plan A — the numbers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provenance-tagged financial model in code that answers Adrian Vella's sixteen investor questions, generates its own prose document, and fails CI when its measured inputs go stale.

**Architecture:** A typed assumptions register (`src/pitch/model/assumptions.ts`) holds every driver with a provenance tag and, for measured rows, an `asOf` date. Pure functions in `project.ts` and `derive.ts` turn that register into monthly P&L, Hoboken liquidity, and business-step tables. `confidential.ts` holds the pre-seed budget and runway, isolated so a later build flag can exclude it from the public bundle. A Node script generates `docs/DragonCandy_Investor_Model.md` from the same code, so the prose cannot drift from the numbers.

**Tech Stack:** TypeScript (strict), Vitest (globals enabled, `environment: 'node'`), plain Node ESM for the generator script. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-23-investor-deck-and-model-design.md`

## Global Constraints

- **Provenance is mandatory.** Every register entry is built with `measured()`, `benchmarked()` or `modeled()`. There is no fourth option and no untagged number.
- **`source` holds a command, file path, or URL — never a prose description.** A measured number without a reproducible command is not measured. (Spec §2.1: counting "pages" yields 69 or 95 depending on whether you recurse; both are defensible, so the command *is* the definition.)
- **`asOf` is required on `MEASURED` and structurally impossible on the other two.** Enforced by the discriminated union in `types.ts`.
- **Staleness threshold is 90 days.** Constant `MAX_MEASURED_AGE_DAYS = 90`.
- **All model functions are pure.** No I/O, no `Date.now()`, no `Math.random()`. Any function needing today's date takes it as a parameter. This keeps tests deterministic and the generator reproducible.
- **Money is dollars as `number`,** not cents, throughout the model. (Distinct from the app's Stripe code, which uses cents — the model never touches Stripe.)
- **Percentages are fractions** (`0.05`, not `5`). Fields ending `Pct` are the only exception and hold display values.
- **No new npm dependencies.**
- **Plan A stops at the founder gate.** Do not build deck slides, do not modify `src/pitch/slides/`, do not touch `PitchDeck.tsx`. That is Plan B.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/pitch/model/types.ts` | Provenance union, `Assumption<T>`, the three constructors, `findStale()` |
| `src/pitch/model/types.test.ts` | Constructor shape and staleness detection, against synthetic registers |
| `src/pitch/model/assumptions.ts` | The register — every real driver value |
| `src/pitch/model/assumptions.test.ts` | Staleness and `source` discipline over the *real* register |
| `src/pitch/model/project.ts` | Tier-mix blending and `projectMonth()` — one month of P&L |
| `src/pitch/model/project.test.ts` | Blending arithmetic and P&L identities |
| `src/pitch/model/derive.ts` | `monthsToLiquidity()`, `businessStepTable()`, `threeYearTrajectory()` |
| `src/pitch/model/derive.test.ts` | Liquidity threshold behaviour and step-table shape |
| `src/pitch/model/confidential.ts` | `budgetTotal()`, `requiredRaise()`, `useOfFunds()`, `preSeedBudget()` |
| `src/pitch/model/confidential.test.ts` | Reconciliation: buckets sum to raise, AI stays under the 15% cap |
| `scripts/generate-investor-model.mjs` | Writes `docs/DragonCandy_Investor_Model.md` from the model |
| `docs/DragonCandy_Investor_Model.md` | **Generated.** Never hand-edited |

`confidential.ts` is a separate file specifically so Plan B can import it behind `import.meta.env.VITE_PITCH_CONFIDENTIAL` and let Vite dead-code-eliminate it out of the public bundle (spec §4.4). Nothing in Plan A imports it from a component.

---

### Task 1: Provenance types and the staleness checker

**Files:**
- Create: `src/pitch/model/types.ts`
- Test: `src/pitch/model/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Provenance`, `Assumption<T>`, `MeasuredAssumption<T>`, `DerivedAssumption<T>`, `measured()`, `benchmarked()`, `modeled()`, `findStale()`, `StaleFinding`, `MAX_MEASURED_AGE_DAYS`.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  measured,
  benchmarked,
  modeled,
  findStale,
  MAX_MEASURED_AGE_DAYS,
  type Assumption,
} from './types';

const TODAY = new Date('2026-08-23T00:00:00Z');

describe('assumption constructors', () => {
  it('stamps the provenance so a caller cannot mislabel a row', () => {
    const m = measured({
      value: 572,
      unit: 'USD/month',
      label: 'Monthly operating cost',
      source: 'vendor invoices: Lovable 50, Anthropic 200, Outstand 249, Supabase 45, OpenAI 25',
      asOf: '2026-08-23',
    });
    expect(m.provenance).toBe('MEASURED');
    expect(m.asOf).toBe('2026-08-23');

    expect(benchmarked({ value: 0.04, unit: 'fraction/month', label: 'SMB SaaS churn', source: 'https://example.invalid' }).provenance)
      .toBe('BENCHMARKED');
    expect(modeled({ value: 2.5, unit: 'campaigns/month', label: 'Campaigns per restaurant', source: 'src/pitch/model/assumptions.ts' }).provenance)
      .toBe('MODELED');
  });
});

describe('findStale', () => {
  it('flags a MEASURED row past the threshold and reports its age and source', () => {
    const register: Record<string, Assumption<number>> = {
      burnMonthly: measured({
        value: 572,
        unit: 'USD/month',
        label: 'Monthly operating cost',
        source: 'vendor invoices',
        asOf: '2026-01-01',
      }),
    };
    const found = findStale(register, TODAY, MAX_MEASURED_AGE_DAYS);
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe('burnMonthly');
    expect(found[0].ageDays).toBe(234);
    expect(found[0].source).toBe('vendor invoices');
  });

  it('does not flag a MEASURED row inside the threshold', () => {
    const register: Record<string, Assumption<number>> = {
      fresh: measured({ value: 1, unit: 'n', label: 'Fresh', source: 'cmd', asOf: '2026-08-01' }),
    };
    expect(findStale(register, TODAY, MAX_MEASURED_AGE_DAYS)).toEqual([]);
  });

  it('never flags BENCHMARKED or MODELED rows, which carry no asOf at all', () => {
    const register: Record<string, Assumption<number>> = {
      churn: benchmarked({ value: 0.04, unit: 'fraction/month', label: 'Churn', source: 'url' }),
      campaigns: modeled({ value: 2.5, unit: 'n/month', label: 'Campaigns', source: 'file' }),
    };
    expect(findStale(register, TODAY, MAX_MEASURED_AGE_DAYS)).toEqual([]);
  });

  it('flags a row exactly one day past the threshold but not one exactly at it', () => {
    const at: Record<string, Assumption<number>> = {
      k: measured({ value: 1, unit: 'n', label: 'At', source: 'cmd', asOf: '2026-05-25' }),
    };
    const past: Record<string, Assumption<number>> = {
      k: measured({ value: 1, unit: 'n', label: 'Past', source: 'cmd', asOf: '2026-05-24' }),
    };
    expect(findStale(at, TODAY, MAX_MEASURED_AGE_DAYS)).toEqual([]);
    expect(findStale(past, TODAY, MAX_MEASURED_AGE_DAYS)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pitch/model/types.test.ts`
Expected: FAIL — `Failed to resolve import "./types"`.

- [ ] **Step 3: Write the implementation**

Create `src/pitch/model/types.ts`:

```ts
/**
 * Provenance-tagged assumptions for the investor model.
 *
 * Every number the deck and the generated model document state passes through here. The tag
 * is not decoration: `docs/DragonCandy_Capital_Raise_Cost_Model.md` said burn was $390/mo for
 * two months after it became $572, because prose cannot fail. A MEASURED row carries the date
 * it was read and the command that reads it, and `findStale` turns "someone should re-check
 * that" into a failing test.
 */

export type Provenance = 'MEASURED' | 'BENCHMARKED' | 'MODELED';

/** A MEASURED row is re-read from its source every 90 days or CI fails. */
export const MAX_MEASURED_AGE_DAYS = 90;

interface AssumptionBase<T> {
  readonly value: T;
  /** e.g. 'USD/month', 'fraction', 'campaigns/month'. Displayed beside the value. */
  readonly unit: string;
  /** Plain-English name. This is what appears in the document and on a slide. */
  readonly label: string;
  /**
   * A command, file path, or URL — never a prose description. A measured number whose source
   * cannot be re-run is not measured, and an ambiguous count (see the spec on pages: 69 or 95)
   * is only pinned down by the exact command.
   */
  readonly source: string;
  readonly note?: string;
}

export interface MeasuredAssumption<T> extends AssumptionBase<T> {
  readonly provenance: 'MEASURED';
  /** ISO date (YYYY-MM-DD) this value was last read from `source`. */
  readonly asOf: string;
}

export interface DerivedAssumption<T> extends AssumptionBase<T> {
  readonly provenance: 'BENCHMARKED' | 'MODELED';
  /** Structurally impossible: only a measured value has a reading date. */
  readonly asOf?: never;
}

export type Assumption<T = number> = MeasuredAssumption<T> | DerivedAssumption<T>;

export function measured<T>(a: Omit<MeasuredAssumption<T>, 'provenance'>): MeasuredAssumption<T> {
  return { ...a, provenance: 'MEASURED' };
}

export function benchmarked<T>(a: Omit<DerivedAssumption<T>, 'provenance' | 'asOf'>): DerivedAssumption<T> {
  return { ...a, provenance: 'BENCHMARKED' };
}

export function modeled<T>(a: Omit<DerivedAssumption<T>, 'provenance' | 'asOf'>): DerivedAssumption<T> {
  return { ...a, provenance: 'MODELED' };
}

export interface StaleFinding {
  readonly key: string;
  readonly label: string;
  readonly asOf: string;
  readonly ageDays: number;
  readonly source: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * Every MEASURED row older than `maxAgeDays`. Pure: `today` is a parameter so the check is
 * deterministic in a test and honest in CI, where the caller passes the real date.
 */
export function findStale(
  register: Readonly<Record<string, Assumption<unknown>>>,
  today: Date,
  maxAgeDays: number,
): StaleFinding[] {
  const findings: StaleFinding[] = [];
  for (const [key, a] of Object.entries(register)) {
    if (a.provenance !== 'MEASURED') continue;
    const readAt = Date.parse(`${a.asOf}T00:00:00Z`);
    if (Number.isNaN(readAt)) {
      throw new Error(`Assumption "${key}" has an unparseable asOf: ${a.asOf}`);
    }
    const ageDays = Math.floor((today.getTime() - readAt) / MS_PER_DAY);
    if (ageDays > maxAgeDays) {
      findings.push({ key, label: a.label, asOf: a.asOf, ageDays, source: a.source });
    }
  }
  return findings;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pitch/model/types.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pitch/model/types.ts src/pitch/model/types.test.ts
git commit -m "feat(model): provenance-tagged assumptions and a staleness checker"
```

---

### Task 2: The assumptions register

**Files:**
- Create: `src/pitch/model/assumptions.ts`
- Test: `src/pitch/model/assumptions.test.ts`

**Interfaces:**
- Consumes: `measured`, `benchmarked`, `modeled`, `Assumption`, `findStale`, `MAX_MEASURED_AGE_DAYS` from `./types`.
- Produces: `REGISTER` (the full record), and named exports `PRICING`, `TIER_TAKE_RATES`, `OPERATING`, `MARKET`, `UNIT_ECONOMICS` grouping it. Also `TierName = 'free' | 'starter' | 'growth' | 'pro'`.

Values below are verified as of 2026-08-23. Pricing is from `docs/STRIPE_PRICES.md` and `supabase/functions/_shared/platform-fee.ts`; campaign price bands from `src/lib/campaignPricing.ts` (`TIER_PRICE_BANDS`, founder-approved 2026-07-19); codebase counts from the commands shown; CAC and churn from the two existing strategy docs.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/assumptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findStale, MAX_MEASURED_AGE_DAYS } from './types';
import { REGISTER, PRICING, TIER_TAKE_RATES } from './assumptions';

describe('the assumptions register', () => {
  it('has no stale MEASURED rows', () => {
    const stale = findStale(REGISTER, new Date(), MAX_MEASURED_AGE_DAYS);
    const report = stale
      .map((s) => `  ${s.key} (${s.label}) is ${s.ageDays} days old, read ${s.asOf}\n    re-read: ${s.source}`)
      .join('\n');
    expect(
      stale,
      `${stale.length} measured input(s) are over ${MAX_MEASURED_AGE_DAYS} days old.\n` +
        `Re-read each source, update its value and asOf in src/pitch/model/assumptions.ts, ` +
        `then re-run \`npm run model:doc\`.\n${report}`,
    ).toEqual([]);
  });

  // Whether a source is re-runnable is not decidable from punctuation -- `npx vitest run` is
  // about as re-runnable as a source gets and contains neither a slash nor a pipe. So this
  // detects the failure mode actually worth catching: a source that is prose.
  const VAGUE = [/estimat/i, /approx/i, /roughly/i, /from memory/i, /founder said/i, /we think/i, /internal knowledge/i];

  it('gives every MEASURED row a concrete source rather than a prose description', () => {
    for (const [key, a] of Object.entries(REGISTER)) {
      if (a.provenance !== 'MEASURED') continue;
      expect(a.source.trim().length, `${key}: source is too short to be real`).toBeGreaterThan(8);
      for (const pattern of VAGUE) {
        expect(pattern.test(a.source), `${key}: source "${a.source}" reads as prose, not a source`).toBe(false);
      }
    }
  });

  it('matches the take-rate ladder that is live in platform-fee.ts', () => {
    expect(TIER_TAKE_RATES.free.value).toBe(0.10);
    expect(TIER_TAKE_RATES.starter.value).toBe(0.07);
    expect(TIER_TAKE_RATES.growth.value).toBe(0.05);
    expect(TIER_TAKE_RATES.pro.value).toBe(0.03);
  });

  it('matches the subscription prices that are live in STRIPE_PRICES.md', () => {
    expect(PRICING.free.value).toBe(0);
    expect(PRICING.starter.value).toBe(149);
    expect(PRICING.growth.value).toBe(449);
    expect(PRICING.pro.value).toBe(899);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pitch/model/assumptions.test.ts`
Expected: FAIL — `Failed to resolve import "./assumptions"`.

- [ ] **Step 3: Write the implementation**

Create `src/pitch/model/assumptions.ts`:

```ts
/**
 * The investor model's assumption register.
 *
 * Read the provenance tag before you quote any of this. MEASURED means someone read it off
 * production, an invoice, or the codebase on the stated date. BENCHMARKED means an external
 * comparable. MODELED means it is our assumption and the deck shows its driver.
 *
 * Correcting a value means updating `asOf` in the same edit. `assumptions.test.ts` fails when
 * a MEASURED row passes 90 days.
 */
import { measured, benchmarked, modeled, type Assumption } from './types';

export type TierName = 'free' | 'starter' | 'growth' | 'pro';

const STRIPE_PRICES = 'docs/STRIPE_PRICES.md';
const PLATFORM_FEE = 'supabase/functions/_shared/platform-fee.ts';
const PRICE_BANDS = 'src/lib/campaignPricing.ts (TIER_PRICE_BANDS)';

/** Monthly subscription price by tier, in dollars. Live in the app. */
export const PRICING: Record<TierName, Assumption<number>> = {
  free: measured({ value: 0, unit: 'USD/month', label: 'Free tier price', source: STRIPE_PRICES, asOf: '2026-08-23' }),
  starter: measured({ value: 149, unit: 'USD/month', label: 'Starter tier price', source: STRIPE_PRICES, asOf: '2026-08-23' }),
  growth: measured({ value: 449, unit: 'USD/month', label: 'Growth tier price', source: STRIPE_PRICES, asOf: '2026-08-23' }),
  pro: measured({ value: 899, unit: 'USD/month', label: 'Pro tier price', source: STRIPE_PRICES, asOf: '2026-08-23' }),
};

/** Platform take rate by tier, as a fraction of campaign value. Live in the app. */
export const TIER_TAKE_RATES: Record<TierName, Assumption<number>> = {
  free: measured({ value: 0.10, unit: 'fraction', label: 'Free tier take rate', source: PLATFORM_FEE, asOf: '2026-08-23' }),
  starter: measured({ value: 0.07, unit: 'fraction', label: 'Starter tier take rate', source: PLATFORM_FEE, asOf: '2026-08-23' }),
  growth: measured({ value: 0.05, unit: 'fraction', label: 'Growth tier take rate', source: PLATFORM_FEE, asOf: '2026-08-23' }),
  pro: measured({ value: 0.03, unit: 'fraction', label: 'Pro tier take rate', source: PLATFORM_FEE, asOf: '2026-08-23' }),
};

export const OPERATING = {
  burnMonthly: measured({
    value: 572,
    unit: 'USD/month',
    label: 'Monthly operating cost',
    source: 'vendor invoices | Lovable 50 + Anthropic 200 + Outstand 249 + Supabase 45 + OpenAI 25',
    asOf: '2026-08-23',
    note: 'Was $390 in the capital-raise cost model for two months after Outstand rose $67 to $249.',
  }),
  payingCustomers: measured({
    value: 0,
    unit: 'accounts',
    label: 'Paying customers',
    source: 'prod: select count(*) from organizations where take_rate is not null and stripe_subscription_id is not null',
    asOf: '2026-08-23',
    note: 'Stripe is in test mode. Zero is the honest number and the deck states it.',
  }),
  registeredUsers: measured({
    value: 30,
    unit: 'accounts',
    label: 'Registered users',
    source: 'prod: select count(*) from profiles',
    asOf: '2026-08-23',
    note: 'Organic, unpaid. Approximate in PROJECT_CONTEXT; re-count before quoting precisely.',
  }),
  pageComponents: measured({ value: 95, unit: 'files', label: 'Page components', source: "find src/pages -name '*.tsx' | wc -l", asOf: '2026-08-23' }),
  hooks: measured({ value: 274, unit: 'files', label: 'React hooks', source: "find src/hooks -name '*.ts' -o -name '*.tsx' | wc -l", asOf: '2026-08-23' }),
  edgeFunctions: measured({ value: 104, unit: 'functions', label: 'Edge functions', source: "ls -d supabase/functions/*/ | grep -v _shared | wc -l", asOf: '2026-08-23' }),
  sourceFiles: measured({ value: 1182, unit: 'files', label: 'TypeScript source files', source: "find src -type f \\( -name '*.ts' -o -name '*.tsx' \\) | wc -l", asOf: '2026-08-23' }),
  migrations: measured({ value: 402, unit: 'files', label: 'Database migrations', source: 'ls supabase/migrations/*.sql | wc -l', asOf: '2026-08-23' }),
  tests: measured({ value: 2857, unit: 'tests', label: 'Passing tests', source: 'npx vitest run', asOf: '2026-08-23' }),
  testFiles: measured({ value: 262, unit: 'files', label: 'Test files', source: 'npx vitest run', asOf: '2026-08-23' }),
  aiCostCapPctOfRevenue: measured({
    value: 0.15,
    unit: 'fraction',
    label: 'AI spend cap as share of revenue',
    source: 'docs/PROJECT_CONTEXT.md (section 8)',
    asOf: '2026-08-23',
  }),
} satisfies Record<string, Assumption<number>>;

export const MARKET = {
  campaignPriceStandardLow: measured({ value: 75, unit: 'USD/deliverable', label: 'Standard delivery, low band', source: PRICE_BANDS, asOf: '2026-08-23' }),
  campaignPriceStandardHigh: measured({ value: 150, unit: 'USD/deliverable', label: 'Standard delivery, high band', source: PRICE_BANDS, asOf: '2026-08-23' }),
  deliverablesPerCampaign: modeled({
    value: 3,
    unit: 'deliverables',
    label: 'Deliverables per campaign',
    source: 'src/pitch/model/assumptions.ts',
    note: 'Standard tier permits up to 10 (STRIPE_PRICES.md). Three is a conservative typical order.',
  }),
  campaignsPerRestaurantPerMonth: modeled({
    value: 2.5,
    unit: 'campaigns/month',
    label: 'Campaigns per restaurant per month',
    source: 'src/pitch/model/assumptions.ts',
  }),
  creatorsPerRestaurant: benchmarked({
    value: 4,
    unit: 'creators',
    label: 'Creators needed per restaurant',
    source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)',
    note: 'Stated there as a 3-5 range; 4 is the midpoint.',
  }),
  applicationsPerCreatorPerMonth: modeled({
    value: 2,
    unit: 'applications/month',
    label: 'Campaign applications per active creator per month',
    source: 'src/pitch/model/assumptions.ts',
  }),
  campaignOpenDays: modeled({
    value: 14,
    unit: 'days',
    label: 'Days a campaign stays open for applications',
    source: 'src/pitch/model/assumptions.ts',
    note: 'Drives how many campaigns are open CONCURRENTLY, which is what a creator actually sees.',
  }),
} satisfies Record<string, Assumption<number>>;

export const UNIT_ECONOMICS = {
  restaurantCacLow: benchmarked({ value: 500, unit: 'USD', label: 'Restaurant acquisition cost, low', source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)' }),
  restaurantCacHigh: benchmarked({ value: 1500, unit: 'USD', label: 'Restaurant acquisition cost, high', source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)' }),
  monthlyChurn: benchmarked({
    value: 0.04,
    unit: 'fraction/month',
    label: 'Monthly customer churn',
    source: 'docs/PROJECT_CONTEXT.md (section 3, 2025 SMB SaaS benchmark 3-5%/month)',
    note: 'The kill-switch trips above 6%/month.',
  }),
  stripePctFee: benchmarked({ value: 0.029, unit: 'fraction', label: 'Stripe percentage fee', source: 'https://stripe.com/pricing' }),
  stripeFixedFee: benchmarked({ value: 0.30, unit: 'USD/transaction', label: 'Stripe fixed fee', source: 'https://stripe.com/pricing' }),
  aiCostPerCustomerMonth: benchmarked({
    value: 1.20,
    unit: 'USD/month',
    label: 'AI cost per customer per month',
    source: 'docs/DragonCandy_Infrastructure_Capacity_Report.md (section 4)',
  }),
  infraCostPerCustomerMonth: benchmarked({
    value: 0.20,
    unit: 'USD/month',
    label: 'Infrastructure cost per customer per month',
    source: 'docs/DragonCandy_Infrastructure_Capacity_Report.md (section 5)',
  }),
} satisfies Record<string, Assumption<number>>;

/** Flat view of everything, for staleness checking and document generation. */
export const REGISTER: Readonly<Record<string, Assumption<number>>> = {
  ...Object.fromEntries(Object.entries(PRICING).map(([k, v]) => [`price_${k}`, v])),
  ...Object.fromEntries(Object.entries(TIER_TAKE_RATES).map(([k, v]) => [`takeRate_${k}`, v])),
  ...OPERATING,
  ...MARKET,
  ...UNIT_ECONOMICS,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pitch/model/assumptions.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify the two prod-sourced rows before trusting them**

`payingCustomers` and `registeredUsers` are the only rows whose source is a database query rather than a file or command. Run both against prod via the Supabase MCP and correct the values if they differ. If a value changes, update it *and* leave `asOf` at today.

Expected: `payingCustomers` is 0 (Stripe is in test mode). If it is not 0, stop and report — that would mean live charges exist.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/pitch/model/assumptions.ts src/pitch/model/assumptions.test.ts
git commit -m "feat(model): the assumptions register, every row tagged and sourced"
```

---

### Task 3: Monthly projection

**Files:**
- Create: `src/pitch/model/project.ts`
- Test: `src/pitch/model/project.test.ts`

**Interfaces:**
- Consumes: `PRICING`, `TIER_TAKE_RATES`, `MARKET`, `UNIT_ECONOMICS`, `TierName` from `./assumptions`.
- Produces: `TierMix`, `blendedSubscription(mix)`, `blendedTakeRate(mix)`, `avgCampaignValue()`, `projectMonth(input)`, `MonthInput`, `MonthResult`.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/project.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { blendedSubscription, blendedTakeRate, avgCampaignValue, projectMonth, type TierMix } from './project';

const ALL_GROWTH: TierMix = { free: 0, starter: 0, growth: 1, pro: 0 };
const HALF_AND_HALF: TierMix = { free: 0, starter: 0.5, growth: 0.5, pro: 0 };

describe('tier blending', () => {
  it('returns the tier price outright when everyone is on one tier', () => {
    expect(blendedSubscription(ALL_GROWTH)).toBe(449);
    expect(blendedTakeRate(ALL_GROWTH)).toBe(0.05);
  });

  it('weights by mix', () => {
    expect(blendedSubscription(HALF_AND_HALF)).toBeCloseTo(299, 10);
    expect(blendedTakeRate(HALF_AND_HALF)).toBeCloseTo(0.06, 10);
  });

  it('rejects a mix that does not sum to 1, because a silent 0.9 understates revenue by 10%', () => {
    expect(() => blendedSubscription({ free: 0.5, starter: 0.2, growth: 0.2, pro: 0 })).toThrow(/sum to 1/);
  });
});

describe('avgCampaignValue', () => {
  it('derives from the app price bands rather than an assumed number', () => {
    // (75 + 150) / 2 = 112.5 per deliverable, 3 deliverables.
    expect(avgCampaignValue()).toBeCloseTo(337.5, 10);
  });
});

describe('projectMonth', () => {
  const base = { month: 12, restaurants: 100, mix: ALL_GROWTH };

  it('computes revenue from subscriptions plus take rate on campaign volume', () => {
    const r = projectMonth(base);
    expect(r.subscriptionRevenue).toBeCloseTo(100 * 449, 10);
    // 100 restaurants x 2.5 campaigns x 337.5 = 84,375 GMV
    expect(r.gmvDollars).toBeCloseTo(84_375, 10);
    expect(r.takeRateRevenue).toBeCloseTo(84_375 * 0.05, 10);
    expect(r.totalRevenue).toBeCloseTo(r.subscriptionRevenue + r.takeRateRevenue, 10);
  });

  it('keeps gross profit and margin consistent with revenue and cost', () => {
    const r = projectMonth(base);
    expect(r.grossProfit).toBeCloseTo(r.totalRevenue - r.costOfRevenue, 10);
    expect(r.grossMarginPct).toBeCloseTo((r.grossProfit / r.totalRevenue) * 100, 10);
  });

  it('subtracts operating expense to reach EBITDA', () => {
    const r = projectMonth({ ...base, operatingExpense: 50_000 });
    expect(r.ebitda).toBeCloseTo(r.grossProfit - 50_000, 10);
  });

  it('returns all zeros and a zero margin at zero restaurants, without dividing by zero', () => {
    const r = projectMonth({ ...base, restaurants: 0 });
    expect(r.totalRevenue).toBe(0);
    expect(r.grossMarginPct).toBe(0);
    expect(Number.isNaN(r.grossMarginPct)).toBe(false);
  });

  it('derives creator count from the restaurant count', () => {
    expect(projectMonth(base).creators).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pitch/model/project.test.ts`
Expected: FAIL — `Failed to resolve import "./project"`.

- [ ] **Step 3: Write the implementation**

Create `src/pitch/model/project.ts`:

```ts
/**
 * One month of the business, computed from the register. Pure — no dates, no I/O.
 *
 * Revenue is two of the four live streams: subscription and take rate. Donny credit overages
 * and DragonDash rush surcharges are real and live in the app, but nothing has ever been
 * charged, so modeling them would add MODELED revenue on top of MODELED volume. They are
 * named on the deck's revenue slide and excluded from the projection deliberately: the model
 * understates rather than overstates.
 */
import { PRICING, TIER_TAKE_RATES, MARKET, UNIT_ECONOMICS, type TierName } from './assumptions';

export type TierMix = Record<TierName, number>;

const TIERS: TierName[] = ['free', 'starter', 'growth', 'pro'];

function assertMixSumsToOne(mix: TierMix): void {
  const total = TIERS.reduce((sum, t) => sum + mix[t], 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`Tier mix must sum to 1, got ${total}`);
  }
}

export function blendedSubscription(mix: TierMix): number {
  assertMixSumsToOne(mix);
  return TIERS.reduce((sum, t) => sum + mix[t] * PRICING[t].value, 0);
}

export function blendedTakeRate(mix: TierMix): number {
  assertMixSumsToOne(mix);
  return TIERS.reduce((sum, t) => sum + mix[t] * TIER_TAKE_RATES[t].value, 0);
}

/** Midpoint of the app's own standard-delivery band, times deliverables per campaign. */
export function avgCampaignValue(): number {
  const midBand =
    (MARKET.campaignPriceStandardLow.value + MARKET.campaignPriceStandardHigh.value) / 2;
  return midBand * MARKET.deliverablesPerCampaign.value;
}

export interface MonthInput {
  readonly month: number;
  readonly restaurants: number;
  readonly mix: TierMix;
  /** Payroll, marketing, G&A. Excluded from cost of revenue by definition. */
  readonly operatingExpense?: number;
}

export interface MonthResult {
  readonly month: number;
  readonly restaurants: number;
  readonly creators: number;
  readonly campaigns: number;
  readonly gmvDollars: number;
  readonly subscriptionRevenue: number;
  readonly takeRateRevenue: number;
  readonly totalRevenue: number;
  readonly costOfRevenue: number;
  readonly grossProfit: number;
  readonly grossMarginPct: number;
  readonly operatingExpense: number;
  readonly ebitda: number;
}

export function projectMonth({ month, restaurants, mix, operatingExpense = 0 }: MonthInput): MonthResult {
  // Creators at the TARGET ratio. Fine here, because creators pay nothing and this figure is
  // reported rather than used in any revenue term. Liquidity is the opposite case and takes
  // creators as an independent input — see the note in derive.ts on why that matters.
  const creators = Math.round(restaurants * MARKET.creatorsPerRestaurant.value);
  const campaigns = restaurants * MARKET.campaignsPerRestaurantPerMonth.value;
  const gmvDollars = campaigns * avgCampaignValue();

  const subscriptionRevenue = restaurants * blendedSubscription(mix);
  const takeRateRevenue = gmvDollars * blendedTakeRate(mix);
  const totalRevenue = subscriptionRevenue + takeRateRevenue;

  // Stripe is charged on the full campaign amount that moves through the platform, then
  // recovered inside the take rate — so it is a cost of revenue, not an infrastructure line.
  const stripeCost =
    gmvDollars * UNIT_ECONOMICS.stripePctFee.value + campaigns * UNIT_ECONOMICS.stripeFixedFee.value;
  const serveCost =
    restaurants *
    (UNIT_ECONOMICS.aiCostPerCustomerMonth.value + UNIT_ECONOMICS.infraCostPerCustomerMonth.value);
  const costOfRevenue = stripeCost + serveCost;

  const grossProfit = totalRevenue - costOfRevenue;

  return {
    month,
    restaurants,
    creators,
    campaigns,
    gmvDollars,
    subscriptionRevenue,
    takeRateRevenue,
    totalRevenue,
    costOfRevenue,
    grossProfit,
    grossMarginPct: totalRevenue === 0 ? 0 : (grossProfit / totalRevenue) * 100,
    operatingExpense,
    ebitda: grossProfit - operatingExpense,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pitch/model/project.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/pitch/model/project.ts src/pitch/model/project.test.ts
git commit -m "feat(model): monthly P&L projection from the register"
```

---

### Task 4: Hoboken liquidity and the business-step table

**Files:**
- Create: `src/pitch/model/derive.ts`
- Test: `src/pitch/model/derive.test.ts`

**Interfaces:**
- Consumes: `projectMonth`, `TierMix` from `./project`; `MARKET` from `./assumptions`.
- Produces: `LIQUIDITY_THRESHOLD`, `isLiquid(restaurants, creators)`, `monthsToLiquidity(input)`, `businessStepTable(steps, mix)`, `LiquidityState`, `StepRow`.

Liquidity is defined in spec §5.2: a campaign draws at least 3 qualified applicants within 48 hours, **and** a creator opening the app sees at least 5 campaigns in range. Both are computable from our own schema after launch, which is what makes this the one forward-looking claim that converts to MEASURED on day one.

**Two modelling decisions here are load-bearing, and getting either wrong makes the slide worthless.**

**Creators are an independent input, not a multiple of restaurants.** If creator count is derived as `restaurants × creatorsPerRestaurant`, then applicants-per-campaign reduces to `creatorsPerRestaurant × applicationsPerCreator ÷ campaignsPerRestaurant` — a **constant**, independent of market size. That half of the threshold would then always pass or always fail, the whole test would collapse to a restaurant count, and Hoboken would read as liquid at two customers. Independent ramps are also simply true: creators and restaurants are acquired through different channels at different speeds, and recruiting creators first is the stated GTM. So `isLiquid` takes both counts, and `monthsToLiquidity` takes both ramps.

**Campaigns are counted as concurrently OPEN, not as monthly flow.** A creator opening the app sees the campaigns accepting applications right now, not everything posted this month. `openCampaigns = restaurants × campaignsPerMonth × (campaignOpenDays / 30)`.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/derive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isLiquid, monthsToLiquidity, businessStepTable, LIQUIDITY_THRESHOLD } from './derive';
import type { TierMix } from './project';

const MIX: TierMix = { free: 0.3, starter: 0.4, growth: 0.25, pro: 0.05 };

describe('liquidity definition', () => {
  it('states both sides of the threshold explicitly', () => {
    expect(LIQUIDITY_THRESHOLD.minApplicantsPerCampaign).toBe(3);
    expect(LIQUIDITY_THRESHOLD.withinHours).toBe(48);
    expect(LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator).toBe(5);
  });
});

describe('isLiquid', () => {
  it('is not liquid when too few campaigns are open to fill a creator screen', () => {
    // 1 restaurant x 2.5 campaigns/mo x (14/30) = 1.17 open, below the 5 required.
    const state = isLiquid(1, 4);
    expect(state.openCampaigns).toBeCloseTo(1.1667, 3);
    expect(state.liquid).toBe(false);
  });

  it('is liquid once both sides clear', () => {
    // 10 restaurants -> 25 campaigns/mo -> 11.67 open (>= 5).
    // 40 creators x 2 applications / 25 campaigns = 3.2 applicants each (>= 3).
    const state = isLiquid(10, 40);
    expect(state.openCampaigns).toBeCloseTo(11.667, 3);
    expect(state.applicantsPerCampaign).toBeCloseTo(3.2, 10);
    expect(state.liquid).toBe(true);
  });

  it('is NOT liquid when creators lag, even with plenty of restaurants', () => {
    // The case that proves creators are independent: same 10 restaurants, half the creators.
    // 20 creators x 2 / 25 campaigns = 1.6 applicants, below the 3 required.
    const state = isLiquid(10, 20);
    expect(state.openCampaigns).toBeGreaterThanOrEqual(5);
    expect(state.applicantsPerCampaign).toBeCloseTo(1.6, 10);
    expect(state.liquid).toBe(false);
  });

  it('reports an empty market as not liquid without dividing by zero', () => {
    const state = isLiquid(0, 0);
    expect(state.liquid).toBe(false);
    expect(Number.isFinite(state.applicantsPerCampaign)).toBe(true);
  });
});

describe('monthsToLiquidity', () => {
  it('returns the first month both conditions hold', () => {
    // 2 restaurants + 8 creators per month. Applicant side holds from month 1 (ratio 4).
    // Open campaigns = 2m x 2.5 x (14/30) = 2.333m; needs >= 5, so m = 3.
    expect(monthsToLiquidity({ restaurantsPerMonth: 2, creatorsPerMonth: 8, horizonMonths: 24 })).toBe(3);
  });

  it('returns null when creator supply never catches up, however long we wait', () => {
    // Ratio of 2 creators per restaurant: applicants stay at 1.6, below 3, at every scale.
    // This is the answer the model must be able to give — "more restaurants will not fix it".
    expect(monthsToLiquidity({ restaurantsPerMonth: 2, creatorsPerMonth: 4, horizonMonths: 36 })).toBeNull();
  });

  it('returns null when nothing is being acquired at all', () => {
    expect(monthsToLiquidity({ restaurantsPerMonth: 0, creatorsPerMonth: 0, horizonMonths: 24 })).toBeNull();
  });

  it('rejects a negative acquisition rate rather than looping forever', () => {
    expect(() => monthsToLiquidity({ restaurantsPerMonth: -1, creatorsPerMonth: 4, horizonMonths: 24 })).toThrow(/negative/);
    expect(() => monthsToLiquidity({ restaurantsPerMonth: 2, creatorsPerMonth: -4, horizonMonths: 24 })).toThrow(/negative/);
  });
});

describe('businessStepTable', () => {
  it('returns one row per requested step, in order, carrying revenue and EBITDA', () => {
    const rows = businessStepTable([100, 1000, 10000], MIX);
    expect(rows.map((r) => r.businesses)).toEqual([100, 1000, 10000]);
    expect(rows[0].annualRevenue).toBeCloseTo(rows[0].monthlyRevenue * 12, 10);
    expect(rows[1].monthlyRevenue).toBeGreaterThan(rows[0].monthlyRevenue);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pitch/model/derive.test.ts`
Expected: FAIL — `Failed to resolve import "./derive"`.

- [ ] **Step 3: Write the implementation**

Create `src/pitch/model/derive.ts`:

```ts
/**
 * The three views Adrian asked for that no existing document answers: when Hoboken becomes a
 * working market, and what 100 / 1,000 / 10,000 businesses mean financially.
 */
import { MARKET } from './assumptions';
import { projectMonth, type TierMix } from './project';

export const LIQUIDITY_THRESHOLD = {
  /** A posted campaign must draw at least this many applicants... */
  minApplicantsPerCampaign: 3,
  /** ...within this many hours. */
  withinHours: 48,
  /** And a creator opening the app must see at least this many campaigns in range. */
  minCampaignsVisibleToCreator: 5,
} as const;

export interface LiquidityState {
  readonly restaurants: number;
  readonly creators: number;
  /** Campaigns accepting applications right now — what a creator actually sees on screen. */
  readonly openCampaigns: number;
  readonly applicantsPerCampaign: number;
  readonly liquid: boolean;
}

/**
 * Both sides of the threshold. Single dense metro, so every campaign is assumed in range of
 * every creator — that is the premise of launching one town at a time, not an oversight.
 *
 * `creators` is an INDEPENDENT parameter, deliberately. Deriving it as
 * `restaurants * creatorsPerRestaurant` makes applicantsPerCampaign a constant
 * (creatorsPerRestaurant * applicationsPerCreator / campaignsPerRestaurant), so that half of
 * the threshold would always hold or never hold and the test would collapse to a restaurant
 * count — reading as "liquid at 2 customers". The two sides are acquired through different
 * channels at different speeds, and creator-side lag is the thing that actually kills local
 * marketplaces, so the model has to be able to express it.
 */
export function isLiquid(restaurants: number, creators: number): LiquidityState {
  const campaignsPerMonth = restaurants * MARKET.campaignsPerRestaurantPerMonth.value;
  const openCampaigns = campaignsPerMonth * (MARKET.campaignOpenDays.value / 30);
  const applications = creators * MARKET.applicationsPerCreatorPerMonth.value;
  const applicantsPerCampaign = campaignsPerMonth === 0 ? 0 : applications / campaignsPerMonth;

  return {
    restaurants,
    creators,
    openCampaigns,
    applicantsPerCampaign,
    liquid:
      openCampaigns >= LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator &&
      applicantsPerCampaign >= LIQUIDITY_THRESHOLD.minApplicantsPerCampaign,
  };
}

export interface LiquidityRampInput {
  readonly restaurantsPerMonth: number;
  readonly creatorsPerMonth: number;
  readonly horizonMonths: number;
}

/**
 * First month both conditions hold, or null if the ramp never gets there in the horizon.
 * Null is a real answer, not a failure: at a poor creator-to-restaurant ratio the applicant
 * side never clears no matter how many restaurants sign, and the model should say so.
 */
export function monthsToLiquidity({
  restaurantsPerMonth,
  creatorsPerMonth,
  horizonMonths,
}: LiquidityRampInput): number | null {
  if (restaurantsPerMonth < 0 || creatorsPerMonth < 0) {
    throw new Error(
      `acquisition rates cannot be negative, got restaurants=${restaurantsPerMonth} creators=${creatorsPerMonth}`,
    );
  }
  for (let month = 1; month <= horizonMonths; month += 1) {
    if (isLiquid(restaurantsPerMonth * month, creatorsPerMonth * month).liquid) return month;
  }
  return null;
}

export interface StepRow {
  readonly businesses: number;
  readonly monthlyRevenue: number;
  readonly annualRevenue: number;
  readonly grossMarginPct: number;
  readonly monthlyGmv: number;
  readonly creators: number;
}

/** Steady-state economics at each business count. Operating expense is deliberately excluded. */
export function businessStepTable(steps: readonly number[], mix: TierMix): StepRow[] {
  return steps.map((businesses) => {
    const m = projectMonth({ month: 0, restaurants: businesses, mix });
    return {
      businesses,
      monthlyRevenue: m.totalRevenue,
      annualRevenue: m.totalRevenue * 12,
      grossMarginPct: m.grossMarginPct,
      monthlyGmv: m.gmvDollars,
      creators: m.creators,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pitch/model/derive.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/pitch/model/derive.ts src/pitch/model/derive.test.ts
git commit -m "feat(model): Hoboken liquidity threshold and the business-step table"
```

---

### Task 5: The pre-seed budget, runway and use of funds

**Files:**
- Create: `src/pitch/model/confidential.ts`
- Test: `src/pitch/model/confidential.test.ts`

**Interfaces:**
- Consumes: `OPERATING` from `./assumptions`.
- Produces: `BudgetLine`, `PRE_SEED_BUDGET`, `budgetTotal(lines, months)`, `requiredRaise(input)`, `useOfFunds(raise, split)`, `USE_OF_FUNDS_SPLIT`.

Staffing figures come from `docs/DragonCandy_Capital_Raise_Cost_Model.md` §5, which benchmarks NYC-metro 2026 rates against levels.fyi, Built In, ZipRecruiter and Glassdoor and models below median. **The roster here is smaller than §5's** — §5 costs a full team across three metros for a $3M priced round; this is a pre-seed for one metro. The reduction is the modeling decision, not the rates.

**This task derives a *need*. It does not set SAFE terms** — cap, discount and MFN are the founder decision at the gate after Task 8.

- [ ] **Step 1: Write the failing test**

Create `src/pitch/model/confidential.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  budgetTotal,
  requiredRaise,
  useOfFunds,
  PRE_SEED_BUDGET,
  USE_OF_FUNDS_SPLIT,
} from './confidential';

describe('budgetTotal', () => {
  it('charges a line only for the months it is active', () => {
    const lines = [
      { key: 'a', label: 'A', monthlyCost: 100, startMonth: 1, endMonth: 18 },
      { key: 'b', label: 'B', monthlyCost: 100, startMonth: 10, endMonth: 18 },
    ];
    expect(budgetTotal(lines, 18)).toBe(100 * 18 + 100 * 9);
  });

  it('ignores a line that starts after the horizon', () => {
    const lines = [{ key: 'late', label: 'Late', monthlyCost: 1000, startMonth: 25, endMonth: 30 }];
    expect(budgetTotal(lines, 18)).toBe(0);
  });

  it('truncates a line that runs past the horizon rather than over-counting it', () => {
    const lines = [{ key: 'long', label: 'Long', monthlyCost: 100, startMonth: 1, endMonth: 36 }];
    expect(budgetTotal(lines, 18)).toBe(1800);
  });
});

describe('requiredRaise', () => {
  it('is the operating need plus a buffer of the ending monthly burn', () => {
    expect(requiredRaise({ operatingNeed: 900_000, bufferMonths: 6, endingMonthlyBurn: 50_000 }))
      .toBe(1_200_000);
  });

  it('rejects a negative buffer, which would quietly under-raise', () => {
    expect(() => requiredRaise({ operatingNeed: 100, bufferMonths: -1, endingMonthlyBurn: 10 }))
      .toThrow(/negative/);
  });
});

describe('useOfFunds', () => {
  it('splits the raise into buckets that sum back to it exactly', () => {
    const buckets = useOfFunds(1_200_000, USE_OF_FUNDS_SPLIT);
    const total = buckets.reduce((sum, b) => sum + b.amount, 0);
    expect(total).toBeCloseTo(1_200_000, 6);
  });

  it('rejects a split that does not sum to 1', () => {
    expect(() => useOfFunds(1_000_000, { engineering: 0.5, gtm: 0.2, gna: 0.2 })).toThrow(/sum to 1/);
  });
});

describe('the pre-seed budget', () => {
  it('lands inside the pre-seed band the founders chose', () => {
    const need = budgetTotal(PRE_SEED_BUDGET, 18);
    const raise = requiredRaise({
      operatingNeed: need,
      bufferMonths: 6,
      endingMonthlyBurn: PRE_SEED_BUDGET.reduce(
        (sum, l) => sum + (l.endMonth >= 18 ? l.monthlyCost : 0),
        0,
      ),
    });
    expect(raise).toBeGreaterThan(500_000);
    expect(raise).toBeLessThanOrEqual(1_500_000);
  });

  it('gives every budget line a positive cost and a coherent month range', () => {
    for (const line of PRE_SEED_BUDGET) {
      expect(line.monthlyCost, line.key).toBeGreaterThan(0);
      expect(line.endMonth, line.key).toBeGreaterThanOrEqual(line.startMonth);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pitch/model/confidential.test.ts`
Expected: FAIL — `Failed to resolve import "./confidential"`.

- [ ] **Step 3: Write the implementation**

Create `src/pitch/model/confidential.ts`:

```ts
/**
 * CONFIDENTIAL. The pre-seed budget, the raise it implies, and the use-of-funds split.
 *
 * Kept in its own file so Plan B can import it behind `import.meta.env.VITE_PITCH_CONFIDENTIAL`
 * and let Vite drop it from the public bundle entirely. Do not import this from a component
 * outside that flag: `/pitch` is a publicly fetchable chunk until the edge gate ships.
 *
 * Rates are from docs/DragonCandy_Capital_Raise_Cost_Model.md section 5 (NYC-metro 2026,
 * modeled below median, loaded with ~30% employer cost). The ROSTER is smaller than that
 * document's: it costs a full team across three metros for a $3M priced round, this funds one
 * metro on a pre-seed. The reduction is the modeling decision; the rates are not ours.
 *
 * This computes a NEED. SAFE terms - cap, discount, MFN - are a founder decision, not a
 * derivation, and are deliberately absent.
 */
import { OPERATING } from './assumptions';

export interface BudgetLine {
  readonly key: string;
  readonly label: string;
  readonly monthlyCost: number;
  /** 1-based, inclusive. */
  readonly startMonth: number;
  /** 1-based, inclusive. */
  readonly endMonth: number;
}

const HORIZON_MONTHS = 18;

export const PRE_SEED_BUDGET: readonly BudgetLine[] = [
  // Founders, modest during runway (cost model section 5, "Founders x2", loaded).
  { key: 'founder_ceo', label: 'Founder salary — CEO (Joe)', monthlyCost: 10_000, startMonth: 1, endMonth: 18 },
  { key: 'founder_cto', label: 'Founder salary — CTO (Damon)', monthlyCost: 10_000, startMonth: 1, endMonth: 18 },
  // Engineering. Cost model section 5 loaded annuals: back-end ~$195K, AI dev ~$215K.
  { key: 'backend', label: 'Back-end engineer', monthlyCost: 16_250, startMonth: 3, endMonth: 18 },
  { key: 'ai_dev', label: 'AI engineer (Donny)', monthlyCost: 17_900, startMonth: 4, endMonth: 18 },
  // Auto-improvement agents are compute, not headcount (cost model section 5).
  { key: 'agents', label: 'Auto-improvement agent compute', monthlyCost: 2_000, startMonth: 1, endMonth: 18 },
  { key: 'bookkeeper', label: 'Bookkeeper (part-time contract)', monthlyCost: 2_000, startMonth: 1, endMonth: 18 },
  // Infrastructure: today's measured burn, grown for launch load.
  { key: 'infra', label: 'Infrastructure and tooling', monthlyCost: OPERATING.burnMonthly.value * 3, startMonth: 1, endMonth: 18 },
  { key: 'marketing', label: 'Hoboken launch marketing', monthlyCost: 3_000, startMonth: 2, endMonth: 18 },
  { key: 'legal', label: 'Legal, IP and accounting', monthlyCost: 1_800, startMonth: 1, endMonth: 18 },
];

/** Sum of every line over its active months, truncated to the horizon. */
export function budgetTotal(lines: readonly BudgetLine[], months: number): number {
  return lines.reduce((sum, line) => {
    const start = Math.max(1, line.startMonth);
    const end = Math.min(months, line.endMonth);
    const active = end - start + 1;
    return active > 0 ? sum + line.monthlyCost * active : sum;
  }, 0);
}

export interface RaiseInput {
  readonly operatingNeed: number;
  readonly bufferMonths: number;
  readonly endingMonthlyBurn: number;
}

export function requiredRaise({ operatingNeed, bufferMonths, endingMonthlyBurn }: RaiseInput): number {
  if (bufferMonths < 0) throw new Error(`bufferMonths cannot be negative, got ${bufferMonths}`);
  return operatingNeed + bufferMonths * endingMonthlyBurn;
}

export interface UseOfFundsSplit {
  readonly engineering: number;
  readonly gtm: number;
  readonly gna: number;
}

/** Mirrors the 50/30/20 split in the cost model section 8.1. */
export const USE_OF_FUNDS_SPLIT: UseOfFundsSplit = { engineering: 0.5, gtm: 0.3, gna: 0.2 };

export interface FundsBucket {
  readonly key: keyof UseOfFundsSplit;
  readonly label: string;
  readonly share: number;
  readonly amount: number;
}

const BUCKET_LABELS: Record<keyof UseOfFundsSplit, string> = {
  engineering: 'Engineering and Donny AI',
  gtm: 'Go-to-market and Hoboken launch',
  gna: 'Working capital and general costs',
};

export function useOfFunds(raise: number, split: UseOfFundsSplit): FundsBucket[] {
  const total = split.engineering + split.gtm + split.gna;
  if (Math.abs(total - 1) > 1e-9) throw new Error(`Use-of-funds split must sum to 1, got ${total}`);
  return (Object.keys(BUCKET_LABELS) as (keyof UseOfFundsSplit)[]).map((key) => ({
    key,
    label: BUCKET_LABELS[key],
    share: split[key],
    amount: raise * split[key],
  }));
}

export const PRE_SEED_HORIZON_MONTHS = HORIZON_MONTHS;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pitch/model/confidential.test.ts`
Expected: PASS, 8 tests.

If the band assertion fails, **do not adjust the band to fit the budget.** Per spec §11, an honest budget that exceeds the round means cutting scope — push a hire later, or drop marketing — and the change belongs in `PRE_SEED_BUDGET` with a comment saying what was cut.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/pitch/model/confidential.ts src/pitch/model/confidential.test.ts
git commit -m "feat(model): pre-seed budget, required raise and use of funds"
```

---

### Task 6: The AI cost cap guard

**Files:**
- Modify: `src/pitch/model/project.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `projectMonth` from `./project`, `OPERATING` and `UNIT_ECONOMICS` from `./assumptions`.
- Produces: nothing new — this is the spec §4.3.3 reconciliation assertion.

The 15%-of-revenue AI cap is a standing kill-switch in `PROJECT_CONTEXT.md` §8. A model that quietly projects past it is projecting a business the company has said it will not run.

- [ ] **Step 1: Write the failing test**

Append to `src/pitch/model/project.test.ts`:

```ts
import { OPERATING, UNIT_ECONOMICS } from './assumptions';

describe('the AI cost cap', () => {
  const MIX: TierMix = { free: 0.3, starter: 0.4, growth: 0.25, pro: 0.05 };

  it.each([10, 100, 1_000, 10_000])(
    'keeps AI spend under the 15%% revenue cap at %i restaurants',
    (restaurants) => {
      const m = projectMonth({ month: 0, restaurants, mix: MIX });
      const aiSpend = restaurants * UNIT_ECONOMICS.aiCostPerCustomerMonth.value;
      const capDollars = m.totalRevenue * OPERATING.aiCostCapPctOfRevenue.value;
      expect(
        aiSpend,
        `AI spend $${aiSpend.toFixed(2)} exceeds the cap $${capDollars.toFixed(2)} at ${restaurants} restaurants`,
      ).toBeLessThanOrEqual(capDollars);
    },
  );
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/pitch/model/project.test.ts`
Expected: PASS. AI is roughly 0.3% of revenue at every tier, far under the cap — the assertion exists so a future change to the mix or the AI cost cannot silently break the kill-switch.

If it fails, that is a real finding: report the numbers rather than raising the cap.

- [ ] **Step 3: Commit**

```bash
git add src/pitch/model/project.test.ts
git commit -m "test(model): assert AI spend stays under the 15% revenue kill-switch"
```

---

### Task 7: Generate the model document

**Files:**
- Create: `scripts/generate-investor-model.mjs`
- Create (generated): `docs/DragonCandy_Investor_Model.md`
- Modify: `package.json` (add the `model:doc` script)

**Interfaces:**
- Consumes: everything from `src/pitch/model/`.
- Produces: `npm run model:doc`.

Follow the conventions in `scripts/update-scale-numbers.mjs`: a header comment stating what it does and its counting conventions, and a non-zero exit when something is wrong so CI notices.

The model is TypeScript and this is a `.mjs` script, so it runs through `tsx`, which the repo already uses for `audit:agent` (`npx tsx scripts/managed-agent-audit.ts`). Write the generator as `scripts/generate-investor-model.ts` and invoke it with `tsx` rather than adding a build step.

- [ ] **Step 1: Write the generator**

Create `scripts/generate-investor-model.ts`:

```ts
#!/usr/bin/env npx tsx
/**
 * Generate docs/DragonCandy_Investor_Model.md from src/pitch/model/.
 *
 * The document is OUTPUT, never input. Editing it by hand is pointless: the next run
 * overwrites it. This exists because the prior investor numbers lived in prose, and prose
 * cannot fail — docs/DragonCandy_Capital_Raise_Cost_Model.md claimed a $390/mo burn for two
 * months after it became $572.
 *
 * The confidential sections (budget, raise, use of funds) are included ONLY with
 * --confidential, so the default output is safe to share.
 *
 * Usage: npm run model:doc [-- --confidential]
 * Exit codes: 0 written; 1 a measured input is stale (fix the register, do not bypass).
 */
import { writeFileSync } from 'node:fs';
import { REGISTER, MARKET } from '../src/pitch/model/assumptions';
import { findStale, MAX_MEASURED_AGE_DAYS } from '../src/pitch/model/types';
import { avgCampaignValue, type TierMix } from '../src/pitch/model/project';
import { businessStepTable, isLiquid, monthsToLiquidity, LIQUIDITY_THRESHOLD } from '../src/pitch/model/derive';
import {
  PRE_SEED_BUDGET,
  PRE_SEED_HORIZON_MONTHS,
  budgetTotal,
  requiredRaise,
  useOfFunds,
  USE_OF_FUNDS_SPLIT,
} from '../src/pitch/model/confidential';

const confidential = process.argv.includes('--confidential');
const OUT = 'docs/DragonCandy_Investor_Model.md';
const MIX: TierMix = { free: 0.3, starter: 0.4, growth: 0.25, pro: 0.05 };

const stale = findStale(REGISTER, new Date(), MAX_MEASURED_AGE_DAYS);
if (stale.length > 0) {
  console.error(`Refusing to generate: ${stale.length} measured input(s) are stale.`);
  for (const s of stale) console.error(`  ${s.key} — ${s.ageDays} days old — re-read: ${s.source}`);
  process.exit(1);
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

const lines: string[] = [];
lines.push('# DragonCandy — Investor Model');
lines.push('');
lines.push('> **Generated file — do not edit.** Produced by `npm run model:doc` from');
lines.push('> `src/pitch/model/`. Change a number there, not here.');
lines.push('');
lines.push(confidential ? '> **CONFIDENTIAL — includes the budget and the raise.**' : '> Public-safe: budget and raise omitted. Regenerate with `--confidential` to include them.');
lines.push('');

lines.push('## Assumptions');
lines.push('');
lines.push('| Input | Value | Unit | Provenance | Source | Read |');
lines.push('|---|---:|---|---|---|---|');
for (const [key, a] of Object.entries(REGISTER)) {
  const asOf = a.provenance === 'MEASURED' ? a.asOf : '—';
  lines.push(`| ${a.label} (\`${key}\`) | ${a.value} | ${a.unit} | ${a.provenance} | \`${a.source}\` | ${asOf} |`);
}
lines.push('');

lines.push('## Marketplace liquidity — Hoboken');
lines.push('');
lines.push(`Liquidity means a posted campaign draws at least ${LIQUIDITY_THRESHOLD.minApplicantsPerCampaign} applicants within ${LIQUIDITY_THRESHOLD.withinHours} hours, and a creator opening the app sees at least ${LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator} campaigns in range. Both are computable from our own schema the day we launch.`);
lines.push('');
lines.push('Creator supply is tracked separately from restaurant supply, because a shortage on');
lines.push('either side alone stops the market working.');
lines.push('');
lines.push('| Restaurants | Creators | Campaigns open now | Applicants per campaign | Liquid |');
lines.push('|---:|---:|---:|---:|---|');
const RATIO = MARKET.creatorsPerRestaurant.value;
for (const n of [1, 5, 10, 25, 50]) {
  const s = isLiquid(n, n * RATIO);
  lines.push(`| ${n} | ${s.creators} | ${s.openCampaigns.toFixed(1)} | ${s.applicantsPerCampaign.toFixed(1)} | ${s.liquid ? 'yes' : 'no'} |`);
}
lines.push('');
lines.push(`At the target ratio of ${RATIO} creators per restaurant:`);
lines.push('');
for (const rate of [1, 2, 4]) {
  const m = monthsToLiquidity({ restaurantsPerMonth: rate, creatorsPerMonth: rate * RATIO, horizonMonths: 36 });
  lines.push(`- ${rate} new restaurant(s) and ${rate * RATIO} new creators per month: liquid in **${m === null ? 'not within 36 months' : `month ${m}`}**.`);
}
lines.push('');
lines.push('If creator recruitment lags the target ratio, the market does not become liquid at any');
lines.push('restaurant count — more restaurants make the shortage worse, not better:');
lines.push('');
for (const ratio of [2, 3, RATIO]) {
  const m = monthsToLiquidity({ restaurantsPerMonth: 2, creatorsPerMonth: 2 * ratio, horizonMonths: 36 });
  lines.push(`- 2 restaurants/month at ${ratio} creators each: **${m === null ? 'never liquid within 36 months' : `liquid in month ${m}`}**.`);
}
lines.push('');

lines.push('## Scale — what 100 / 1,000 / 10,000 businesses mean');
lines.push('');
lines.push(`Average campaign value is ${usd(avgCampaignValue())}, derived from the app's own per-deliverable price bands.`);
lines.push('');
lines.push('| Businesses | Creators | Monthly campaign volume | Monthly revenue | Annual revenue | Gross margin |');
lines.push('|---:|---:|---:|---:|---:|---:|');
for (const row of businessStepTable([100, 1000, 10000], MIX)) {
  lines.push(`| ${row.businesses.toLocaleString('en-US')} | ${row.creators.toLocaleString('en-US')} | ${usd(row.monthlyGmv)} | ${usd(row.monthlyRevenue)} | ${usd(row.annualRevenue)} | ${pct(row.grossMarginPct)} |`);
}
lines.push('');

if (confidential) {
  const need = budgetTotal(PRE_SEED_BUDGET, PRE_SEED_HORIZON_MONTHS);
  const endingBurn = PRE_SEED_BUDGET.reduce((s, l) => s + (l.endMonth >= PRE_SEED_HORIZON_MONTHS ? l.monthlyCost : 0), 0);
  const raise = requiredRaise({ operatingNeed: need, bufferMonths: 6, endingMonthlyBurn: endingBurn });

  lines.push('## The round');
  lines.push('');
  lines.push(`Pre-seed on a post-money SAFE. Terms (cap, discount, MFN) are a founder decision and are not modeled here.`);
  lines.push('');
  lines.push(`- ${PRE_SEED_HORIZON_MONTHS}-month operating need: **${usd(need)}**`);
  lines.push(`- Monthly burn at month ${PRE_SEED_HORIZON_MONTHS}: **${usd(endingBurn)}**`);
  lines.push(`- Six-month buffer: **${usd(raise - need)}**`);
  lines.push(`- **Required raise: ${usd(raise)}**`);
  lines.push('- Committed to date: **$0**');
  lines.push('');
  lines.push('### Budget');
  lines.push('');
  lines.push('| Line | Monthly | Months | Total |');
  lines.push('|---|---:|---|---:|');
  for (const l of PRE_SEED_BUDGET) {
    const active = Math.min(PRE_SEED_HORIZON_MONTHS, l.endMonth) - Math.max(1, l.startMonth) + 1;
    lines.push(`| ${l.label} | ${usd(l.monthlyCost)} | ${l.startMonth}–${Math.min(PRE_SEED_HORIZON_MONTHS, l.endMonth)} | ${usd(l.monthlyCost * Math.max(0, active))} |`);
  }
  lines.push(`| **Total** | | | **${usd(need)}** |`);
  lines.push('');
  lines.push('### Use of funds');
  lines.push('');
  lines.push('| Bucket | Share | Amount |');
  lines.push('|---|---:|---:|');
  for (const b of useOfFunds(raise, USE_OF_FUNDS_SPLIT)) {
    lines.push(`| ${b.label} | ${pct(b.share * 100)} | ${usd(b.amount)} |`);
  }
  lines.push('');
}

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${OUT}${confidential ? ' (confidential)' : ' (public-safe)'}`);
```

- [ ] **Step 2: Add the npm script**

In `package.json`, after the `"docs:scale"` line, add:

```json
    "model:doc": "npx tsx scripts/generate-investor-model.ts",
```

- [ ] **Step 3: Run it**

Run: `npm run model:doc`
Expected: `Wrote docs/DragonCandy_Investor_Model.md (public-safe)` and exit 0.

- [ ] **Step 4: Verify the staleness gate actually blocks generation**

Temporarily change `OPERATING.burnMonthly`'s `asOf` to `'2026-01-01'` and re-run.

Run: `npm run model:doc`
Expected: exit **1**, and the message names `burnMonthly`, its age, and the source to re-read.

**Revert the `asOf` change.** A guard that has never been seen to fire is not known to work — this step is the forced control.

- [ ] **Step 5: Generate the confidential version and confirm it differs**

Run: `npm run model:doc -- --confidential`
Expected: output says `(confidential)` and the file now contains a `## The round` section with the required raise.

Then re-run `npm run model:doc` (no flag) so the committed copy is the public-safe one.

- [ ] **Step 6: Read the generated document**

Read `docs/DragonCandy_Investor_Model.md` end to end. Every number should be plausible and every assumption row should carry a source. If a figure looks wrong, the bug is in the model, not the document.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-investor-model.ts package.json docs/DragonCandy_Investor_Model.md
git commit -m "feat(model): generate the investor model document from the model itself"
```

---

### Task 8: Correct the stale documents at source

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md` (codebase scale line, via the existing script)
- Modify: `docs/DragonCandy_Capital_Raise_Cost_Model.md:56-58` (the `$390/mo` burn claim)
- Modify: `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md` §3 and §5 (superseded pricing, Supabase cost, the Toast claim)

Spec §2 lists four stale claims. Leaving them in place while the model states the correct values creates two disagreeing sources — the exact failure this work exists to end.

- [ ] **Step 1: Refresh the codebase numbers with the script that already exists**

Run: `npm run docs:scale`
Expected: `PROJECT_CONTEXT.md`'s scale line updates to the real counts. The script exits 1 if the target line has drifted in format — if that happens, fix the line rather than the script.

- [ ] **Step 2: Correct the burn figure in the cost model**

In `docs/DragonCandy_Capital_Raise_Cost_Model.md` §2.1, replace the `~$390/mo` sentence with the current figure and a note on why it moved:

```markdown
Current burn **~$572/mo** (as of 2026-08-23): Lovable $50, Anthropic $200, **Outstand $249**,
Supabase $45, OpenAI $25. This line read **~$390/mo** until 2026-08-23 — Outstand raised its
price from $67 and nothing re-checks a cost figure, so it was wrong by ~$182 for an unknown
stretch. The live figure is now `OPERATING.burnMonthly` in `src/pitch/model/assumptions.ts`,
where a test fails if it goes 90 days unread.
```

- [ ] **Step 3: Correct the pricing briefing**

Two edits in `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md`:

In §3, above "The Current Tiers, in Plain English", insert:

```markdown
> **Superseded 2026-08-23.** The tiers below ($199 / $499 / $999, flat 5% take rate) describe
> April 2026. The hybrid ladder this document recommends in §4 **shipped in May** — live
> pricing is $149 / $449 / $899 with take rates of 10 / 7 / 5 / 3 / 2%, per
> `docs/STRIPE_PRICES.md`, `supabase/functions/_shared/platform-fee.ts` and migration
> `20260507000001`. Read §4 as describing the current state, not a proposal.
```

In §5, in the "What We Actually Spend Today" table, correct Supabase from `$25` to `$45`, correct the total from `$295/month` to `$572/month`, add the Outstand line at `$249`, and delete the sentence claiming a live "Toast POS integration" — six `toast-*` edge functions are deployed but every one answers `toast_not_configured` 503, and no `%toast%` table exists on prod.

- [ ] **Step 4: Verify no stale claim survives**

Run: `grep -rn '390/mo\|\$295/month\|Toast POS integration' docs/DragonCandy_Capital_Raise_Cost_Model.md docs/DragonCandy_Pricing_Profitability_Briefing_v2.md`
Expected: no output, or only matches inside a dated historical note.

- [ ] **Step 5: Commit**

```bash
git add docs/PROJECT_CONTEXT.md docs/DragonCandy_Capital_Raise_Cost_Model.md docs/DragonCandy_Pricing_Profitability_Briefing_v2.md
git commit -m "docs: correct four stale investor-facing claims at source"
```

---

### Task 9: The interactive model

**Files:**
- Create: `.claude/scratch/investor-model.html` (or the session scratch directory)

**Interfaces:**
- Consumes: the computed values from Tasks 3–5. The artifact is standalone HTML with the arithmetic inlined — it cannot import from `src/`, so the numbers it starts from must match the model's output exactly.

Purpose: Adrian and Joe move an assumption and watch revenue, gross margin and EBITDA respond. This is what makes the assumptions arguable instead of asserted.

- [ ] **Step 1: Load the design skill**

Invoke the `artifact-design` skill before writing any markup. It calibrates how much design the page warrants.

- [ ] **Step 2: Build the page**

Sliders on: restaurants, campaigns per restaurant per month, average campaign value, tier mix, monthly churn, restaurants added per month. Live outputs: monthly and annual revenue, gross margin, EBITDA, months to Hoboken liquidity, and the 100/1,000/10,000 step table.

Requirements: every input labelled in plain English with its provenance tag visible; a reset control returning to the model's committed values; theme-aware light and dark per the Artifact rules; no external requests.

- [ ] **Step 3: Verify the defaults match the model exactly**

With every slider at its default, the displayed monthly revenue at 100 businesses must equal the `businessStepTable` row in `docs/DragonCandy_Investor_Model.md` to the dollar. If it does not, the artifact has drifted from the model and is worse than useless — fix it before publishing.

- [ ] **Step 4: Publish and hand over**

Publish with the Artifact tool. Send the URL to the user together with the generated document.

- [ ] **Step 5: Commit**

```bash
git add .claude/scratch/investor-model.html
git commit -m "feat(model): interactive assumption explorer"
```

---

### Task 10: Full verification and the founder gate

**Files:** none modified.

- [ ] **Step 1: Run everything**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: lint clean, all tests pass (2,857 existing plus roughly 33 new), build succeeds.

**Typecheck carries exactly one known pre-existing failure and no others:**
`middleware.ts(30,22): Cannot find module '@vercel/functions'`. That package is declared
in `package.json` but absent from this worktree's `node_modules`; it belongs to the site-gate
work (PR #482), not to this plan. Treat any *additional* typecheck error as a failure. Do not
run `npm install` to clear it — that is out of scope and churns the lockfile mid-plan.

- [ ] **Step 2: Confirm the confidential module is not in the public bundle**

Plan A does not import `confidential.ts` from any component, so it must not appear in `dist/`.

Run: `grep -rl "Founder salary" dist/assets/ | head`
Expected: **no output.** If anything matches, something imported the confidential module into the app graph — find it and remove the import before continuing.

- [ ] **Step 3: Run the Codex second review**

Invoke the `codex-review` skill (`codex review --base main --title "Investor financial model"`). Fix what it finds and re-run until clean. Relay its verdict.

- [ ] **Step 4: Stop at the gate**

Plan A ends here. Report to the founders:

1. The required raise the budget derived, and the budget lines behind it.
2. Months to Hoboken liquidity at 1, 2 and 4 restaurants per month.
3. Revenue and margin at 100 / 1,000 / 10,000 businesses.
4. The five inputs from spec §8 that Plan B cannot start without: SAFE terms, team bios with real track records, whether Uncle Rocco's has agreed to *use* the platform or only to let us use their footage, Adrian's consent to be named as an advisor, and a countable Hoboken restaurant number.
5. **Two register rows carried from `PROJECT_CONTEXT.md` and never confirmed against prod:**
   `payingCustomers` (0) and `registeredUsers` (~30). The Supabase MCP query tools require an
   interactive OAuth grant requesting `database:write` and `secrets:read`, which was judged
   disproportionate for confirming two small numbers and is the account holder's decision to
   make. Each row's `note` carries the query to run. Ask the founder to confirm both, or run
   the queries with prod access. **If `payingCustomers` is not 0, escalate** — Stripe is in
   test mode, so a non-zero would mean live charges exist.

**Do not begin Plan B until the founders have reviewed the numbers and supplied those five inputs.**

---

## Notes for whoever executes this

- **`/pitch` only renders from a production build.** `scripts/export-pitch-pdf.mjs` documents a dev-mode module-init quirk that makes `/pitch` fall through to the landing page under `vite dev`. Relevant to Plan B; noted here so it is not rediscovered.
- **Vitest runs with `environment: 'node'` and `globals: true`.** The explicit `import { describe, it, expect } from 'vitest'` in these tests is harmless and matches the repo's existing style.
- **Node must be 24.x** (`engines: ">=24 <26"`). Node 26 shadows jsdom's `localStorage` and breaks ~50 tests that CI passes.
- **Do not run `supabase db push`.** The migration ledger has diverged by 234 files. Nothing in this plan needs it.
