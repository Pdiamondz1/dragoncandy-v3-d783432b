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
