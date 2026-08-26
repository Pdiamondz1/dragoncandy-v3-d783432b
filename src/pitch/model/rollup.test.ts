import { describe, it, expect } from 'vitest';
import {
  rollup,
  allocateSharedCost,
  cohortMetroYear,
  COHORT_METRO_ID,
  COHORT_METRO_COUNTS,
} from './rollup';
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

  it('scales a single average metro by the cohort count', () => {
    const one = cohortMetroYear(2028, REGISTERED_MIX);
    expect(one.metroId).toBe(COHORT_METRO_ID);
    expect(one.revenue).toBeGreaterThan(0);
  });
});

describe('rollup', () => {
  const years = rollup(REGISTERED_MIX);

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
    for (const y of years) {
      const metroEbitda = y.metros.reduce((s, m) => s + m.metroEbitda, 0);
      expect(y.ebitda).toBeCloseTo(metroEbitda - y.sharedCost, 6);
    }
  });

  it('counts metros live as those with a customer at year end', () => {
    for (const y of years) {
      expect(y.metrosLive).toBe(y.metros.filter((m) => m.customersAtYearEnd > 0).length);
    }
  });

  // Spec section 10. This REPORTS the gap; it must never fail on it, because either the
  // top-down band or the bottom-up build could be the wrong one, and a test that forced
  // them together would just be assumption-fitting with extra steps.
  it('carries the top-down cross-check band without asserting agreement', () => {
    for (const y of years) {
      expect(y.topDownRevenueLow).toBeGreaterThan(0);
      expect(y.topDownRevenueHigh).toBeGreaterThan(y.topDownRevenueLow);
      expect(typeof y.bottomUpVsTopDown).toBe('number');
    }
  });

  it('prints the top-down gap so a reviewer sees it', () => {
    const report = years
      .map(
        (y) =>
          `  ${y.year}: bottom-up $${Math.round(y.revenue).toLocaleString()} vs top-down ` +
          `$${y.topDownRevenueLow.toLocaleString()}-$${y.topDownRevenueHigh.toLocaleString()} ` +
          `(${(y.bottomUpVsTopDown * 100).toFixed(0)}% of the band midpoint)`,
      )
      .join('\n');
    console.warn(`Top-down / bottom-up divergence:\n${report}`);
    expect(report.length).toBeGreaterThan(0);
  });
});
