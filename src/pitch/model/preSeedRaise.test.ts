/**
 * The raise calculation, pinned.
 *
 * It shipped wrong and nothing caught it: the deck slide passed
 * `budgetTotal(PRE_SEED_BUDGET, 1)` — the FIRST month's burn — into a parameter named
 * `endingMonthlyBurn`, and applied a three-month buffer where the generated diligence
 * document applied six. Typecheck was happy (both are `number`), every test passed, and
 * the deck understated the ask by about $110K while disagreeing with the document a
 * founder would send in the same email. Found by the Codex second review.
 *
 * These tests are about the property that broke, not about the current dollar figure:
 * the ending burn must exceed the opening burn, because the engineers start later.
 */
import { describe, expect, it } from 'vitest';

import {
  PRE_SEED_BUDGET,
  PRE_SEED_BUFFER_MONTHS,
  PRE_SEED_HORIZON_MONTHS,
  budgetTotal,
  preSeedRaise,
} from './confidential';

describe('preSeedRaise', () => {
  it('sizes the buffer on the ENDING burn, not the opening one', () => {
    const { endingMonthlyBurn } = preSeedRaise();
    const openingBurn = budgetTotal(PRE_SEED_BUDGET, 1);

    // The property, stated as the thing that was got wrong: not every line has started in
    // month 1. If a future budget starts every line at month 1 these become equal, and
    // this test should be re-read rather than deleted.
    expect(endingMonthlyBurn).toBeGreaterThan(openingBurn);
  });

  it('counts every line still running in the final month', () => {
    const { endingMonthlyBurn } = preSeedRaise();
    const expected = PRE_SEED_BUDGET.filter((l) => l.endMonth >= PRE_SEED_HORIZON_MONTHS).reduce(
      (sum, l) => sum + l.monthlyCost,
      0,
    );

    expect(endingMonthlyBurn).toBe(expected);
  });

  it('is the operating need plus the buffer, and reports both', () => {
    const r = preSeedRaise();

    expect(r.operatingNeed).toBe(budgetTotal(PRE_SEED_BUDGET, PRE_SEED_HORIZON_MONTHS));
    expect(r.bufferMonths).toBe(PRE_SEED_BUFFER_MONTHS);
    expect(r.buffer).toBe(PRE_SEED_BUFFER_MONTHS * r.endingMonthlyBurn);
    expect(r.raise).toBe(r.operatingNeed + r.buffer);
  });

  /**
   * The regression proper. Sizing on the opening burn is not merely different, it is
   * materially smaller — which is the direction that loses money quietly, because a raise
   * that looks affordable is nobody's first suspicion.
   */
  it('would be materially understated by the old calculation', () => {
    const r = preSeedRaise();
    const old = r.operatingNeed + 3 * budgetTotal(PRE_SEED_BUDGET, 1);

    expect(r.raise).toBeGreaterThan(old);
    expect(r.raise - old).toBeGreaterThan(100_000);
  });

  it('is a positive number a human could actually raise', () => {
    const { raise } = preSeedRaise();

    expect(raise).toBeGreaterThan(0);
    // The spec frames this as a pre-seed within $500K–$1.5M. If the honest budget leaves
    // that band, the spec's own instruction is to cut scope rather than shave the budget —
    // so this failing is a decision to make, not a number to adjust.
    expect(raise).toBeLessThan(1_500_000);
  });
});
