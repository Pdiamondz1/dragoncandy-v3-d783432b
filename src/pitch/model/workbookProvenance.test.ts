import { describe, it, expect } from 'vitest';
import { buildWorkbookSpec } from './workbook';
import { REGISTER } from './assumptions';
import { METRO_ASSUMPTIONS, MODEL_YEARS, enabledMetros, totalFoodServiceVenues } from './metros';
import { COHORT_METRO_COUNTS, rollup } from './rollup';
import { metroKpis } from './metroModel';
import { unitEconomics } from './derive';
import { REGISTERED_MIX } from './project';
import {
  PRE_SEED_BUDGET,
  PRE_SEED_HORIZON_MONTHS,
  budgetTotal,
  preSeedRaise,
  buildFundsAllocation,
  USE_OF_FUNDS_SPLIT,
} from './confidential';

/**
 * Every number the workbook shows must be traceable: it is either a registered assumption,
 * a value this model computed from registered assumptions, a formula, or a year label.
 *
 * Without this, "no made-up numbers" is a promise. With it, adding an untraceable figure
 * fails the build.
 */
describe('workbook provenance', () => {
  const spec = buildWorkbookSpec({ confidential: true });

  const registeredValues = new Set<number>([
    ...Object.values(REGISTER).map((a) => a.value),
    ...Object.values(METRO_ASSUMPTIONS).map((a) => a.value),
    ...MODEL_YEARS.map((y) => COHORT_METRO_COUNTS[y].value),
  ]);

  // Values this model derives. Collected by walking the rollup rather than by listing them,
  // so a new derived row cannot be forgotten here and pass as an orphan.
  const derivedValues = new Set<number>();

  function addDerived(v: number): void {
    derivedValues.add(v);
    derivedValues.add(-v);
  }

  function addDerivedFromObject(o: object): void {
    for (const v of Object.values(o)) {
      if (typeof v === 'number') addDerived(v);
    }
  }

  for (const year of rollup()) {
    for (const k of ['revenue', 'grossProfit', 'marketingCost', 'metroEbitda', 'sharedCost', 'ebitda',
                     'metrosLive', 'topDownRevenueLow', 'topDownRevenueHigh', 'bottomUpVsTopDown'] as const) {
      addDerived(year[k] as number);
    }
    for (const m of year.metros) {
      addDerivedFromObject(m);
      // The metro-sheet KPI ratios (gross margin, marketing %, cost-of-revenue %) are computed
      // from MetroYear fields by the shared `metroKpis` helper -- the same one workbook.ts calls
      // to build those rows -- rather than by re-deriving the ratio formula here.
      addDerivedFromObject(metroKpis(m));
    }
    for (const a of year.allocations) {
      addDerived(a.amount);
    }
  }

  // Total food service venues (the denominator beside "Addressable venues" on each metro
  // sheet) is a Census-derived count that never lands on `MetroYear` -- it's shown once per
  // metro, not per rollup year, so it isn't picked up by the walk above.
  for (const m of enabledMetros()) {
    addDerived(totalFoodServiceVenues(m.id));
  }

  // Unit_Economics sheet: every field of `unitEconomics()`'s output.
  addDerivedFromObject(unitEconomics(REGISTERED_MIX));

  // Financing sheet (confidential): the pre-seed budget's line costs, the budget total, the
  // one shared raise computation, and the use-of-funds allocation -- all derived from the
  // register (OPERATING.burnMonthly for the infra line) or documented directly in
  // confidential.ts's own header comment (the NYC-metro cost-model rates the other lines cite).
  for (const line of PRE_SEED_BUDGET) {
    addDerived(line.monthlyCost);
  }
  addDerived(budgetTotal(PRE_SEED_BUDGET, PRE_SEED_HORIZON_MONTHS));
  const raise = preSeedRaise();
  addDerivedFromObject(raise);
  for (const bucket of buildFundsAllocation(raise.raise, USE_OF_FUNDS_SPLIT)) {
    addDerived(bucket.share);
    addDerived(bucket.amount);
  }

  const YEAR_LABELS = new Set<number>(MODEL_YEARS);

  function traceable(value: number): boolean {
    if (Number.isInteger(value) && YEAR_LABELS.has(value)) return true;
    if (registeredValues.has(value) || registeredValues.has(-value)) return true;
    for (const d of derivedValues) {
      if (Math.abs(d - value) < 1e-6) return true;
    }
    return false;
  }

  it('has no numeric cell that is neither a formula, a registered assumption, nor derived', () => {
    const orphans: string[] = [];
    for (const sheet of spec) {
      sheet.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell.f !== undefined) return;
          if (typeof cell.v !== 'number') return;
          if (!traceable(cell.v)) {
            orphans.push(`${sheet.name}!R${r + 1}C${c + 1} = ${cell.v}`);
          }
        });
      });
    }
    expect(
      orphans,
      `${orphans.length} numeric cell(s) have no provenance. Every number in the workbook must ` +
        `come from src/pitch/model/assumptions.ts, src/pitch/model/metros.ts, or a computation ` +
        `over them — or be an Excel formula. Do not add the value to this test to make it pass; ` +
        `register the assumption.\n${orphans.slice(0, 40).join('\n')}`,
    ).toEqual([]);
  });

  // A forced control. If the walker above silently visited nothing, the test would pass
  // while checking zero cells, which is the failure mode that makes a green suite a lie.
  it('actually visits a meaningful number of numeric cells', () => {
    let numeric = 0;
    for (const sheet of spec) {
      for (const row of sheet.rows) {
        for (const cell of row) if (typeof cell.v === 'number') numeric += 1;
      }
    }
    expect(numeric).toBeGreaterThan(100);
  });
});
