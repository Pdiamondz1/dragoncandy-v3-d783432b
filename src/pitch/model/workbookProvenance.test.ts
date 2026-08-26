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
  CONFIDENTIAL_ASSUMPTIONS,
  PRE_SEED_LINE_ASSUMPTIONS,
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
    // Founder salaries, the rest of the pre-seed budget's line costs, and the use-of-funds
    // split are CONFIDENTIAL assumptions -- registered separately from REGISTER because the
    // Assumptions sheet ships in both workbook builds and REGISTER's contents show up there
    // unconditionally. See confidential.ts and the public-build leak test below.
    ...Object.values(CONFIDENTIAL_ASSUMPTIONS).map((a) => a.value),
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

  // Financing sheet (confidential): PRE_SEED_BUDGET's line costs and USE_OF_FUNDS_SPLIT's
  // shares are NOT walked as raw arrays here -- 8 of the 9 lines are registered assumptions
  // now (CONFIDENTIAL_ASSUMPTIONS, above), so walking the array too would just be reading the
  // same literal out of confidential.ts a second time and blessing it against itself.
  //
  // `infra` is the one line that is genuinely a computation rather than a registered literal
  // (OPERATING.burnMonthly.value * 3, both in confidential.ts and here) -- it is walked by
  // name rather than by iterating the whole array, so a future line added as a bare literal
  // cannot ride along and pass as "derived."
  addDerived(PRE_SEED_BUDGET.find((l) => l.key === 'infra')!.monthlyCost);

  // What IS a genuine computation over the registered inputs above -- and so belongs here --
  // is the budget total, the one shared raise calculation, and the use-of-funds allocation
  // amounts.
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
        `over them — or be an Excel formula, whose INPUT cells are checked by this same walk ` +
        `and whose own literal numerals are pinned by the "no unregistered numeral inside a ` +
        `formula" test below. Do not add the value to this test to make it pass; register the ` +
        `assumption.\n${orphans.slice(0, 40).join('\n')}`,
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

  /**
   * The walker above skips every formula cell entirely — correctly, since a formula's value
   * is DERIVED from other cells, and those cells are checked wherever they land. What that
   * exemption does not cover is a numeric literal written INSIDE the formula string itself:
   * `=Hoboken_Model!B16*0.37` would put an unregistered 0.37 into the workbook, the walker
   * would skip the cell because `cell.f !== undefined`, and formulaAgreement.test.ts would
   * only confirm the formula matches whatever cache we typed next to it — neither test would
   * ever see the 0.37. This closes that gap: no emitted formula may contain a standalone
   * numeral outside a small, justified allowlist.
   */
  describe('no unregistered numeral hides inside a formula', () => {
    // Every entry must carry a reason. An allowlist without one is where a real magnitude
    // goes to hide next time someone is in a hurry.
    const ALLOWED_LITERALS: Readonly<Record<string, string>> = {
      // ROUND(...,0)'s precision argument (round to the nearest whole customer), and the
      // zero branch of every `IF(revenue=0,0,...)` KPI guard. Not a business assumption —
      // a function argument and a guard's literal zero.
      '0': 'ROUND(...,0) precision arg, and the 0 branch of the revenue=0 KPI guards',
      // The "/2" in the top-down cross-check's `(low+high)/2` — an arithmetic mean, the same
      // one `rollup()`'s `midpoint = (band.revenueLow + band.revenueHigh) / 2` computes in
      // TypeScript. Structural (how you average two numbers), not a modeled input.
      '2': 'the midpoint divisor in (top-down low + top-down high) / 2',
    };

    // Matches only a STANDALONE numeral. A bare `\d+` also matches the row digits inside
    // every cell reference (`B16`, `C9`) and the "4" inside the sheet name `Metros_4toN`,
    // which would make this test either always-red (every formula references a row) or,
    // if loosened to compensate, always-green (matching nothing real either). The
    // negative lookbehind excludes any digit preceded by a letter, digit, `!`, `_` or `.`,
    // which is exactly what a cell address or qualified sheet name looks like immediately
    // before its digits.
    const STANDALONE_NUMERAL = /(?<![A-Za-z0-9_!.])\d+(?:\.\d+)?/g;

    it('the matcher actually fires on a formula carrying a real magnitude', () => {
      // Forced control, the other half of it: a scan that always finds nothing is
      // indistinguishable from a regex that matches nothing. Prove it can reject first.
      const bad = 'Hoboken_Model!B16*0.37';
      const literals = bad.match(STANDALONE_NUMERAL) ?? [];
      expect(literals).toEqual(['0.37']);
      expect(Object.keys(ALLOWED_LITERALS)).not.toContain('0.37');
    });

    it('visits a meaningful number of formula cells', () => {
      const formulaCells = spec.flatMap((s) => s.rows.flat()).filter((c) => c.f !== undefined);
      expect(formulaCells.length, 'Task 7 is not done if there are no formulas').toBeGreaterThan(20);
    });

    it('has no formula whose literal numerals fall outside the allowlist', () => {
      const violations: string[] = [];
      for (const sheet of spec) {
        sheet.rows.forEach((row, r) => {
          row.forEach((cell, c) => {
            if (cell.f === undefined) return;
            const literals = cell.f.match(STANDALONE_NUMERAL) ?? [];
            for (const lit of literals) {
              if (!(lit in ALLOWED_LITERALS)) {
                violations.push(`${sheet.name}!R${r + 1}C${c + 1}: "${lit}" in "${cell.f}"`);
              }
            }
          });
        });
      }
      expect(
        violations,
        `${violations.length} formula(s) carry a numeral outside {${Object.keys(ALLOWED_LITERALS).join(', ')}}. ` +
          `A number inside a formula string is invisible to the provenance walker above and to ` +
          `formulaAgreement.test.ts, so it must either be a registered assumption pulled in by ` +
          `reference (never typed as a literal) or added to ALLOWED_LITERALS here with a reason ` +
          `for why it is structural, not a magnitude.\n${violations.slice(0, 40).join('\n')}`,
      ).toEqual([]);
    });
  });

  /**
   * The Assumptions sheet ships in BOTH builds -- only the Financing sheet is gated out of the
   * public one. So registering PRE_SEED_LINE_ASSUMPTIONS / USE_OF_FUNDS_SHARE_ASSUMPTIONS
   * (confidential.ts) creates exactly the leak vector this test exists to close: if a future
   * edit ever merged CONFIDENTIAL_ASSUMPTIONS into REGISTER, or dropped the `confidential`
   * gate on `assumptionRows()` in workbook.ts, a founder's salary would render on the public
   * workbook's Assumptions sheet with nothing to catch it. Checked against every cell of the
   * public spec, not just the Assumptions sheet, since a leak could show up anywhere a future
   * public sheet reads PRE_SEED_LINE_ASSUMPTIONS directly.
   */
  it('never lets a confidential salary appear anywhere in the public build', () => {
    const publicSpec = buildWorkbookSpec({ confidential: false });
    // The AI engineer's monthly cost -- $17,900 -- appears nowhere else in this model, so its
    // presence in the public spec could only mean the confidential register leaked.
    const distinctiveSalary = PRE_SEED_LINE_ASSUMPTIONS.ai_dev.value;

    let found = false;
    for (const sheet of publicSpec) {
      for (const row of sheet.rows) {
        for (const cell of row) {
          if (cell.v === distinctiveSalary) found = true;
        }
      }
    }
    expect(found).toBe(false);
  });
});
