/**
 * What `@pitch/confidential` resolves to in a public build.
 *
 * The real module holds the pre-seed budget, the derived raise and the use-of-funds
 * split. `vite.config.ts` swaps this file in unless `VITE_PITCH_CONFIDENTIAL=1`, so the
 * confidential figures never enter the module graph of the default bundle — not in the
 * JavaScript, and not in the sourcemap, which is the one that actually caught us.
 *
 * Every value here is empty or zero. Nothing renders from it: the only consumer is the
 * branch behind `__PITCH_CONFIDENTIAL__`, which is folded to `false` in exactly the
 * builds that get this file. The two mechanisms are deliberately independent — if either
 * one is broken by a future change, the other still holds, and
 * `npm run pitch:verify-public` reports which.
 *
 * It must keep the same exported shape as `confidential.ts` or the swap stops
 * type-checking, which is the intended way to find out that it drifted.
 */
import type {
  BudgetLine,
  FundsBucket,
  PreSeedRaise,
  RaiseInput,
  UseOfFundsSplit,
} from './confidential';
import type { Assumption } from './types';

export type { BudgetLine, FundsBucket, PreSeedRaise, RaiseInput, UseOfFundsSplit };

export const PRE_SEED_BUDGET: readonly BudgetLine[] = [];

export const PRE_SEED_HORIZON_MONTHS = 0;

export const PRE_SEED_BUFFER_MONTHS = 0;

export const USE_OF_FUNDS_SPLIT: UseOfFundsSplit = { engineering: 0, gtm: 0, gna: 0 };

// Empty registers, matching kind (object) rather than content — the real module's founder
// salaries and use-of-funds shares must never enter this module's graph at all.
export const PRE_SEED_LINE_ASSUMPTIONS: Readonly<Record<string, Assumption<number>>> = {};
export const USE_OF_FUNDS_SHARE_ASSUMPTIONS: Readonly<Record<string, Assumption<number>>> = {};
export const CONFIDENTIAL_ASSUMPTIONS: Readonly<Record<string, Assumption<number>>> = {};

// Signatures mirror the real module exactly — arguments accepted and ignored — so a
// caller type-checks identically against either. `confidential.stub.test.ts` asserts
// that shape rather than trusting this comment.
export function budgetTotal(_lines: readonly BudgetLine[], _months: number): number {
  return 0;
}

export function requiredRaise(_input: RaiseInput): number {
  return 0;
}

export function buildFundsAllocation(_raise: number, _split: UseOfFundsSplit): FundsBucket[] {
  return [];
}

export function preSeedRaise(): PreSeedRaise {
  return { operatingNeed: 0, endingMonthlyBurn: 0, bufferMonths: 0, buffer: 0, raise: 0 };
}
