/**
 * The company's own EBITDA line on the trajectory slide, split at BUILD time.
 *
 * The bars on that slide show **metro contribution** — revenue less what the metros
 * themselves cost. Company-level shared cost (payroll, AI, shared infrastructure) is
 * derived from the pre-seed budget, which is confidential, so consolidated EBITDA cannot
 * exist in a public bundle at all. It is not hidden here; it is absent.
 *
 * Same two independent mechanisms as `ask.confidential.tsx`, and for the same reason —
 * read that file's header first. `__PITCH_CONFIDENTIAL__` is a `define`, so the ternary
 * below folds to `null` and Rollup drops the branch; `@pitch/confidential` is aliased to
 * `confidential.stub.ts` in the same builds, so the budget never enters the module graph
 * and cannot ride out inside a sourcemap's `sourcesContent`. `npm run pitch:verify-public`
 * is what proves it, not this comment.
 *
 * **Why the budget arrives through `@pitch/confidential` and the shared-cost arithmetic
 * through `../model/sharedCost`.** `src/pitch/model/consolidated.ts` computes exactly this
 * number for the workbook, but it imports `./confidential` by its RELATIVE path — which
 * the alias does not intercept — because under vitest the alias would hand it the stub,
 * `budgetTotal()` would return 0, shared cost would vanish and consolidated EBITDA would
 * silently equal metro EBITDA. A component cannot import that module. So the component
 * takes the aliased budget and applies the same `sharedCostFromBudget` the model does:
 * one implementation of the arithmetic, two ways of being handed the figures.
 */
import { PRE_SEED_BUDGET } from '@pitch/confidential';

import { moneyShort } from '../deck/format';
import { rollup } from '../model/rollup';
import { sharedCostFromBudget } from '../model/sharedCost';

declare const __PITCH_CONFIDENTIAL__: boolean;

const CONFIDENTIAL = __PITCH_CONFIDENTIAL__;

function ConsolidatedEbitdaLine() {
  const years = rollup().map((y) => {
    const sharedCost = sharedCostFromBudget(PRE_SEED_BUDGET, y.year);
    return { year: y.year, ebitda: y.metroEbitda - sharedCost };
  });

  return (
    <div
      data-testid="trajectory-consolidated"
      className="mt-3 flex items-center gap-6 rounded-xl border border-white/15 bg-white/5 px-5 py-2"
    >
      <p className="shrink-0 text-base font-bold text-white">
        After company-level cost, the whole company:
      </p>
      <div className="flex flex-1 justify-between text-lg tabular-nums">
        {years.map((y) => (
          <p key={y.year}>
            <span className="text-white/45">{y.year} </span>
            <span className={y.ebitda >= 0 ? 'font-bold text-dc-teal' : 'font-bold text-dc-pink'}>
              {moneyShort(y.ebitda)}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function TrajectoryConsolidatedEbitda() {
  return CONFIDENTIAL ? <ConsolidatedEbitdaLine /> : null;
}
