/**
 * The rollup PLUS the company-level shared cost — i.e. the half of the consolidation that
 * cannot be computed without the confidential pre-seed budget.
 *
 * ## Why this is a separate file from `rollup.ts`
 *
 * `rollup.ts` used to import `PRE_SEED_BUDGET` from `./confidential` directly, which was
 * dormant only because nothing in `src/` imported `rollup.ts`. The moment a deck slide
 * does — which is exactly what task 8 asks for — the real confidential module joins the
 * browser module graph, and `vite.config.ts`'s alias does not intercept it, because the
 * alias is on the specifier `@pitch/confidential` and this was the relative path. Dead-code
 * elimination would not have saved it either: the leak that `npm run pitch:verify-public`
 * actually caught last time was `sourcesContent` inside a deployed `.js.map`, which carries
 * a module's source whether or not its code survives tree-shaking.
 *
 * Repointing `rollup.ts` at `@pitch/confidential` would have been worse, not better.
 * Vitest shares this vite config, so a plain `npx vitest run` resolves that specifier to
 * `confidential.stub.ts`, whose `budgetTotal()` returns 0 — shared cost silently becomes
 * zero, EBITDA collapses into metro EBITDA, and the deck renders a flattering number that
 * nothing distinguishes from a real one. A leak is bad; a wrong figure in front of an
 * investor is worse.
 *
 * So the model is split by what a number DEPENDS ON, not by what renders it:
 *
 *   - `rollup.ts`      — revenue, gross profit, marketing, metro EBITDA, metros live and
 *                        the prior-plan cross-check band. Confidential-free. A public slide
 *                        may import it.
 *   - `sharedCost.ts`  — the arithmetic (sum a budget, split it by revenue share). Holds
 *                        no figures, so it is public too.
 *   - this file        — binds the REAL budget to that arithmetic. Node only: the workbook
 *                        generator and the model tests, which must have the true numbers.
 *                        No React component may import it.
 *
 * A deck slide that wants consolidated EBITDA gets it the way `ask.confidential.tsx` gets
 * the raise: from `@pitch/confidential` behind `__PITCH_CONFIDENTIAL__`.
 */
import { PRE_SEED_BUDGET } from './confidential';
import type { ModelYear } from './metros';
import { REGISTERED_MIX, type TierMix } from './project';
import { rollup, type RollupYear } from './rollup';
import {
  allocateSharedCost,
  sharedCostFromBudget,
  type SharedCostAllocation,
} from './sharedCost';

export type { SharedCostAllocation };
export { allocateSharedCost };

export interface ConsolidatedYear extends RollupYear {
  /** Company-level cost that no single metro carries: payroll, AI, shared infrastructure. */
  readonly sharedCost: number;
  readonly allocations: readonly SharedCostAllocation[];
  /**
   * Metro EBITDA less shared cost — the company's EBITDA, not a metro's. The two differ by
   * the whole shared-cost line and can differ in SIGN: 2027 is metro EBITDA +$168,747
   * against consolidated EBITDA -$627,333. Anything that renders one must say which.
   */
  readonly ebitda: number;
}

/** Shared cost for a year, from the real pre-seed budget. See `sharedCostFromBudget`. */
export function sharedCostForYear(year: ModelYear): number {
  return sharedCostFromBudget(PRE_SEED_BUDGET, year);
}

export function consolidated(
  mix: TierMix = REGISTERED_MIX,
  metroIds?: readonly string[],
): ConsolidatedYear[] {
  return rollup(mix, metroIds).map((y) => {
    const sharedCost = sharedCostForYear(y.year);
    return {
      ...y,
      sharedCost,
      allocations: allocateSharedCost(y.metros, sharedCost),
      ebitda: y.metroEbitda - sharedCost,
    };
  });
}
