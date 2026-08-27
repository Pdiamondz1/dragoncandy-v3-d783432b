import { describe, it, expect } from 'vitest';
import {
  rollup,
  cohortMetroYear,
  COHORT_METRO_ID,
  COHORT_METRO_COUNTS,
  COHORT_TEMPLATE_METRO_ID,
  COHORT_FIELD_CLASSIFICATION,
} from './rollup';
import { projectMetroYear } from './metroModel';
// Shared cost, its allocation and consolidated EBITDA moved out of `rollup.ts` so a public
// deck slide can import the rollup without pulling the pre-seed budget into the bundle.
// They are still exercised here, against the REAL budget — `consolidated.ts` imports
// `./confidential` by its relative path, so vitest gets the true figures and not the stub's
// zeros. See `consolidated.ts`'s header.
import { consolidated, allocateSharedCost } from './consolidated';
import { MODEL_YEARS } from './metros';
import { REGISTERED_MIX } from './project';

describe('shared cost allocation', () => {
  const fake = (metroId: string, revenue: number) =>
    ({ metroId, revenue } as Parameters<typeof allocateSharedCost>[0][number]);

  it('allocates in proportion to revenue', () => {
    const out = allocateSharedCost([fake('a', 300), fake('b', 100)], 400);
    expect(out.find((o) => o.metroId === 'a')?.amount).toBeCloseTo(300, 6);
    expect(out.find((o) => o.metroId === 'b')?.amount).toBeCloseTo(100, 6);
  });

  // A forced control: if the allocator silently normalised or dropped a metro, this fails.
  it('allocates exactly 100% of the shared cost', () => {
    const out = allocateSharedCost([fake('a', 7), fake('b', 11), fake('c', 3)], 1000);
    expect(out.reduce((s, o) => s + o.amount, 0)).toBeCloseTo(1000, 6);
    expect(out.reduce((s, o) => s + o.share, 0)).toBeCloseTo(1, 9);
  });

  it('splits evenly when no metro has revenue yet, rather than dividing by zero', () => {
    const out = allocateSharedCost([fake('a', 0), fake('b', 0)], 500);
    expect(out.map((o) => o.amount)).toEqual([250, 250]);
  });
});

describe('the later-metro cohort', () => {
  it('has a metro count per year that never goes backwards', () => {
    const counts = MODEL_YEARS.map((y) => COHORT_METRO_COUNTS[y].value);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('contributes nothing in 2026, when no fourth metro is open', () => {
    expect(cohortMetroYear(2026, REGISTERED_MIX).revenue).toBe(0);
  });

  /**
   * Every numeric field of `MetroYear` must be explicitly classified as scaling with the
   * cohort count or not. This is the control that would have caught `exitArr`: it was added
   * to `MetroYear`, the cohort's inline scale list was not updated, and the cohort row went
   * on carrying ONE metro's ARR beside SEVENTEEN metros' revenue -- with every other test
   * still green, because nothing tied the two lists together.
   *
   * Derived from a real projection's keys, not from a hand-written list, so a new field
   * fails here the moment it exists.
   */
  it('classifies every numeric MetroYear field as scaled or deliberately unscaled', () => {
    const sample = projectMetroYear('palm-beach', 2028, REGISTERED_MIX);
    const numericKeys = Object.entries(sample)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => k)
      .sort();
    const classified = [
      ...COHORT_FIELD_CLASSIFICATION.scaled,
      ...COHORT_FIELD_CLASSIFICATION.unscaled,
    ].sort();

    expect(numericKeys.length, 'no numeric fields found -- this test is checking nothing')
      .toBeGreaterThan(10);
    expect(
      classified,
      'A numeric MetroYear field is not classified in rollup.ts. Add it to ' +
        'COHORT_SCALED_FIELDS (an amount -- N metros have N times as much) or to ' +
        'COHORT_UNSCALED_FIELDS (a rate, a label, or a per-metro denominator), and say which ' +
        'in the comment. Leaving it out means the cohort row silently reports one metro\'s ' +
        'worth of it beside seventeen metros\' worth of everything else.',
    ).toEqual(numericKeys);
  });

  it('scales a single template metro by the cohort count', () => {
    const one = cohortMetroYear(2028, REGISTERED_MIX);
    expect(one.metroId).toBe(COHORT_METRO_ID);
    expect(one.revenue).toBeGreaterThan(0);
  });

  /**
   * The template is Palm Beach County, and this pins BOTH halves of why.
   *
   * It was Hoboken, selected positionally as `named[0]`, and that was wrong twice: a
   * one-square-mile town of 123 venues is not the shape of a "metro", and its 2028
   * penetration is 35% — the founders' home-town rate, where they know the owners — applied
   * to 17 cities nobody has entered. The result read conservative in total precisely because
   * the base it multiplied was so small, which is how the most aggressive assumption in the
   * model stayed invisible.
   *
   * Asserted as an exact multiple of the template's own projection rather than as a
   * threshold: a `toBeGreaterThan` here would still pass if the template silently reverted.
   */
  it('scales from Palm Beach County, not from the founders\' home town', () => {
    expect(COHORT_TEMPLATE_METRO_ID).toBe('palm-beach');

    const count = COHORT_METRO_COUNTS[2028].value;
    const template = projectMetroYear('palm-beach', 2028, REGISTERED_MIX);
    const cohort = cohortMetroYear(2028, REGISTERED_MIX);
    expect(cohort.revenue).toBeCloseTo(template.revenue * count, 6);
    expect(cohort.customersAtYearEnd).toBe(template.customersAtYearEnd * count);

    // ...and it is NOT Hoboken. Without this the test above would pass on any template
    // whose arithmetic is internally consistent, including the one this change removes.
    const hoboken = projectMetroYear('hoboken', 2028, REGISTERED_MIX);
    expect(cohort.customersAtYearEnd).not.toBe(hoboken.customersAtYearEnd * count);
  });

  /**
   * The count and the template are separately registered questions. "How many metros" has
   * its own source; "what is a metro" is a different question, and answering the second is
   * not licence to restate the first. Pinned so a future rebase cannot quietly take both.
   */
  it('leaves the cohort metro COUNT untouched by the template change', () => {
    expect([2026, 2027, 2028].map((y) => COHORT_METRO_COUNTS[y as 2026].value)).toEqual([0, 6, 17]);
  });
});

describe('rollup', () => {
  const years = rollup(REGISTERED_MIX);
  const full = consolidated(REGISTERED_MIX);

  it('covers 2026, 2027 and 2028', () => {
    expect(years.map((y) => y.year)).toEqual([...MODEL_YEARS]);
  });

  it('sums revenue across the metros it reports', () => {
    for (const y of years) {
      expect(y.revenue).toBeCloseTo(
        y.metros.reduce((s, m) => s + m.revenue, 0),
        6,
      );
    }
  });

  // Adrian's YES/NO toggle, tested at the model layer rather than in the sheet.
  it('excludes a disabled metro entirely', () => {
    for (const y of years) {
      expect(y.metros.some((m) => m.metroId === 'hoboken')).toBe(true);
    }
    const withoutHoboken = rollup(REGISTERED_MIX, ['manhattan', 'palm-beach']);
    for (const y of withoutHoboken) {
      expect(y.metros.some((m) => m.metroId === 'hoboken')).toBe(false);
      expect(y.revenue).toBeLessThan(years.find((x) => x.year === y.year)!.revenue);
    }
  });

  it('reports EBITDA as metro EBITDA less shared cost', () => {
    for (const y of full) {
      const metroEbitda = y.metros.reduce((s, m) => s + m.metroEbitda, 0);
      expect(y.ebitda).toBeCloseTo(metroEbitda - y.sharedCost, 6);
    }
  });

  /**
   * The control on the split above. If `consolidated()` ever resolved the budget through
   * `@pitch/confidential`, vitest would hand it the stub, `budgetTotal()` would return 0,
   * shared cost would vanish and `ebitda` would silently equal `metroEbitda` — a flattering
   * number indistinguishable from a real one. This fails in exactly that case.
   */
  it('is reading the real budget, not the public stub', () => {
    for (const y of full) {
      expect(y.sharedCost).toBeGreaterThan(0);
      expect(y.ebitda).not.toBeCloseTo(y.metroEbitda, 6);
    }
  });

  /**
   * Metro EBITDA and consolidated EBITDA are different quantities, and in 2027 they do not
   * even share a sign (+$309,478 against -$466,406). Pinned so nobody can relabel one as
   * the other on a slide and have every test still pass.
   */
  it('differs from metro EBITDA in sign in at least one year', () => {
    expect(full.some((y) => Math.sign(y.metroEbitda) !== Math.sign(y.ebitda))).toBe(true);
  });

  // metrosLive counts actual metros, not rollup rows: the cohort row stands in for
  // COHORT_METRO_COUNTS[year].value metros, not 1. Asserted against fixed expected numbers
  // (not re-derived from the implementation) so a regression to row-counting -- which would
  // read "4" for both 2027 and 2028 -- actually fails this test.
  it('counts metros live as actual metros, weighting the cohort by its metro count', () => {
    // 2026: Hoboken + Manhattan. 2027: those two plus Palm Beach (month 12) and the
    // Hamptons (month 17), plus 6 cohort metros = 10. 2028: 4 named + 17 cohort = 21,
    // which is PROJECT_CONTEXT section 3's "20+ metros" reached by counting, not by claim.
    const expected: Record<number, number> = { 2026: 2, 2027: 10, 2028: 21 };
    for (const y of years) {
      expect(y.metrosLive).toBe(expected[y.year]);
    }
  });

  // Spec section 10. This REPORTS the gap; it must never fail on it, because either the
  // prior plan or the bottom-up build could be the wrong one, and a test that forced them
  // together would just be assumption-fitting with extra steps.
  it('carries the prior plan\'s ARR band without asserting agreement', () => {
    for (const y of years) {
      expect(y.priorPlanArrLow).toBeGreaterThan(0);
      expect(y.priorPlanArrHigh).toBeGreaterThan(y.priorPlanArrLow);
      expect(typeof y.bottomUpVsPriorPlan).toBe('number');
    }
  });

  /**
   * Booked revenue and exit ARR are DIFFERENT QUANTITIES, and the cross-check must use the
   * one that matches the band's unit.
   *
   * The band is ARR -- annual RECURRING revenue, a year-end run rate. `revenue` is revenue
   * BOOKED during the year, summed monthly while customers ramp. The ratio divided booked by
   * ARR until 2026-08-26, which made the model look further below the plan than it is. Same
   * class of error as labelling metro contribution "EBITDA".
   *
   * Asserted as an exact identity against `exitArr` rather than as an inequality, so nothing
   * can quietly point the numerator back at booked revenue.
   */
  it('divides EXIT ARR by the band, never booked revenue', () => {
    for (const y of years) {
      const midpoint = (y.priorPlanArrLow + y.priorPlanArrHigh) / 2;
      expect(y.bottomUpVsPriorPlan).toBeCloseTo(y.exitArr / midpoint, 9);
      // The control: the two numerators must actually differ, or this identity would hold
      // for the wrong implementation too.
      expect(y.exitArr).not.toBeCloseTo(y.revenue, 0);
    }
  });

  /**
   * Exit ARR exceeds booked revenue in every year here, and the mechanism is the ramp: a
   * metro that ends the year with 65 customers spent most of it with far fewer. Pinned as a
   * DIRECTION rather than a magnitude -- the magnitude moves with every penetration change,
   * but a year where booked exceeded a year-end run rate would mean the ramp had inverted
   * and something is wrong.
   */
  it('reports exit ARR above booked revenue in every year with customers', () => {
    for (const y of years) {
      if (y.revenue === 0) continue;
      expect(y.exitArr, `${y.year}`).toBeGreaterThan(y.revenue);
    }
  });

  it('prints the gap against the prior plan so a reviewer sees it', () => {
    const report = years
      .map(
        (y) =>
          `  ${y.year}: booked $${Math.round(y.revenue).toLocaleString()} | exit ARR ` +
          `$${Math.round(y.exitArr).toLocaleString()} vs prior plan ` +
          `$${y.priorPlanArrLow.toLocaleString()}-$${y.priorPlanArrHigh.toLocaleString()} ARR ` +
          `(${(y.bottomUpVsPriorPlan * 100).toFixed(0)}% of the band midpoint)`,
      )
      .join('\n');
    console.warn(`Bottom-up exit ARR vs the superseded plan:\n${report}`);
    expect(report.length).toBeGreaterThan(0);
  });
});
