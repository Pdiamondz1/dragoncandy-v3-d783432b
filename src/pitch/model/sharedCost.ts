/**
 * The ARITHMETIC of the pre-seed budget and its allocation across metros. No figures.
 *
 * The split between this file and `confidential.ts` is the point of the file existing.
 * `confidential.ts` holds the numbers — founder salaries, the hiring months, the
 * use-of-funds split — and `vite.config.ts` swaps it for a stub in any build that is not
 * `VITE_PITCH_CONFIDENTIAL=1`, because those numbers must not reach a bundle a stranger
 * can fetch. What lives here is the shape of a budget line and the two functions that
 * sum and divide it, which are not confidential in any build and which a public slide
 * legitimately needs in order to draw a bar.
 *
 * So: a public component may import this module freely. It may not import
 * `confidential.ts`, and it may import `@pitch/confidential` only from a file whose
 * confidential half is behind `__PITCH_CONFIDENTIAL__` — see `ask.confidential.tsx`.
 *
 * `budgetTotal` and `BudgetLine` were moved here out of `confidential.ts`, which
 * re-exports both so its own public shape (and the stub that mirrors it) is unchanged.
 */
import { MODEL_YEARS, type ModelYear } from './metros';

export interface BudgetLine {
  readonly key: string;
  readonly label: string;
  readonly monthlyCost: number;
  /** 1-based, inclusive. */
  readonly startMonth: number;
  /** 1-based, inclusive. */
  readonly endMonth: number;
}

/** Sum of every line over its active months, truncated to the horizon. */
export function budgetTotal(lines: readonly BudgetLine[], months: number): number {
  return lines.reduce((sum, line) => {
    const start = Math.max(1, line.startMonth);
    const end = Math.min(months, line.endMonth);
    const active = end - start + 1;
    return active > 0 ? sum + line.monthlyCost * active : sum;
  }, 0);
}

export interface SharedCostAllocation {
  readonly metroId: string;
  readonly share: number;
  readonly amount: number;
}

export function allocateSharedCost(
  metros: readonly { readonly metroId: string; readonly revenue: number }[],
  total: number,
): SharedCostAllocation[] {
  const revenue = metros.reduce((s, m) => s + m.revenue, 0);
  if (metros.length === 0) return [];
  if (revenue <= 0) {
    const share = 1 / metros.length;
    return metros.map((m) => ({ metroId: m.metroId, share, amount: total * share }));
  }
  return metros.map((m) => {
    const share = m.revenue / revenue;
    return { metroId: m.metroId, share, amount: total * share };
  });
}

/**
 * Shared cost for a year, taken from a budget's non-metro lines. Year 1 is the budget's
 * first twelve months; later years hold the run rate of month 12 flat, because the budget
 * horizon is 18 months and extrapolating a hiring plan we have not written would be
 * inventing headcount.
 *
 * Consequence, not just cause: with cost frozen, every dollar of 2027-2028 revenue growth
 * drops straight to EBITDA. Revenue grows 6.5x from 2027 to 2028 ($517,631 to $3,341,424)
 * while shared cost stays flat at $796,080, so the swing from consolidated EBITDA of
 * -$627,333 in 2027 to +$863,001 in 2028 is partly an artifact of the frozen-cost
 * assumption, not pure revenue growth. A model that grew shared cost with the business
 * (more metros, more support load) would show a smaller swing. See the Palm Beach penetration note in `metros.ts` for the
 * same house style of naming a modeling choice's consequence, not just its cause.
 *
 * Takes the lines as an argument rather than reading `PRE_SEED_BUDGET` itself, which is
 * what keeps this file free of the confidential module. `consolidated.ts` binds the real
 * budget to it for Node; the deck's confidential slide half binds `@pitch/confidential`'s.
 */
export function sharedCostFromBudget(lines: readonly BudgetLine[], year: ModelYear): number {
  const yearIndex = MODEL_YEARS.indexOf(year);
  const firstTwelve = budgetTotal(lines, 12);
  if (yearIndex === 0) return firstTwelve;
  const monthTwelveRunRate = lines
    .filter((l) => l.startMonth <= 12 && l.endMonth >= 12)
    .reduce((s, l) => s + l.monthlyCost, 0);
  return monthTwelveRunRate * 12;
}
