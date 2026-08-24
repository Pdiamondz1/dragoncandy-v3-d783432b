/**
 * The stub swapped in for `@pitch/confidential` in public builds must keep the real
 * module's shape.
 *
 * If it drifts, the public build stops compiling — which is the loud failure we want —
 * but only for exports the deck happens to use today. An export the deck adopts next
 * month would fail at build time on a Friday instead of here.
 */
import { describe, expect, it } from 'vitest';

import * as real from './confidential';
import * as stub from './confidential.stub';

describe('confidential stub', () => {
  it('exports exactly the same names as the real module', () => {
    expect(Object.keys(stub).sort()).toEqual(Object.keys(real).sort());
  });

  it('matches the real module value-for-value in kind', () => {
    for (const key of Object.keys(real) as (keyof typeof real)[]) {
      expect(typeof stub[key as keyof typeof stub]).toBe(typeof real[key]);
    }
  });

  it('accepts the same arguments, so a caller type-checks against either', () => {
    // Called with the real module's arguments. If a signature drifted, this would not
    // compile — which is the point; the runtime assertions below are secondary.
    expect(stub.budgetTotal(real.PRE_SEED_BUDGET, real.PRE_SEED_HORIZON_MONTHS)).toBe(0);
    expect(stub.requiredRaise({ operatingNeed: 1, bufferMonths: 1, endingMonthlyBurn: 1 })).toBe(0);
    expect(stub.buildFundsAllocation(1, real.USE_OF_FUNDS_SPLIT)).toEqual([]);
  });

  it('holds no real figures', () => {
    expect(stub.PRE_SEED_BUDGET).toEqual([]);
    expect(stub.PRE_SEED_HORIZON_MONTHS).toBe(0);
    expect(Object.values(stub.USE_OF_FUNDS_SPLIT)).toEqual([0, 0, 0]);
  });

  /**
   * The control: the real module must NOT look like the stub, or every assertion above
   * would pass against two empty modules.
   */
  it('is being compared against a real module that has content', () => {
    expect(real.PRE_SEED_BUDGET.length).toBeGreaterThan(0);
    expect(real.PRE_SEED_HORIZON_MONTHS).toBeGreaterThan(0);
    expect(real.budgetTotal(real.PRE_SEED_BUDGET, real.PRE_SEED_HORIZON_MONTHS)).toBeGreaterThan(0);
  });
});
