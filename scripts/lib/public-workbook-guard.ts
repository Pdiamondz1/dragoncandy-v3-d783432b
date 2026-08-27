/**
 * What must never appear in the PUBLIC workbook, as data.
 *
 * Two callers, deliberately at opposite ends of the pipeline:
 *
 *   - `scripts/generate-financial-model-xlsx.ts` refuses to WRITE a public spec that
 *     carries any of this, the same way it already refuses one containing the Financing
 *     sheet. That is a guard on what we believe we built.
 *   - `scripts/verify-public-workbook.ts` reads the generated `.xlsx` back with `exceljs`
 *     and asserts the same list is absent from the public file and PRESENT in the
 *     confidential one. That is a check on what actually shipped.
 *
 * One list, imported by both, because two hand-maintained lists diverge and the one that
 * goes stale is always the one doing the checking.
 *
 * ## Node only
 *
 * This module reaches `src/pitch/model/consolidated.ts`, which binds the real
 * `PRE_SEED_BUDGET` through a RELATIVE import that `vite.config.ts`'s `@pitch/confidential`
 * alias does not intercept. Nothing under `src/` may import this file, and no React
 * component may import it even indirectly — see the header of `consolidated.ts`.
 */
import { consolidated } from '../../src/pitch/model/consolidated';
import { MODEL_YEARS } from '../../src/pitch/model/metros';
import {
  CONFIDENTIAL_SHEETS,
  PUBLIC_FORBIDDEN_ROW_LABELS,
} from '../../src/pitch/model/workbook';

export { CONFIDENTIAL_SHEETS, PUBLIC_FORBIDDEN_ROW_LABELS };

export interface ForbiddenValue {
  /** Human-readable, for the failure message. */
  readonly what: string;
  readonly value: number;
}

/**
 * Every number the public workbook must not carry, derived from the model rather than
 * transcribed.
 *
 * Transcribing them is how a verifier goes quiet: `verify-public-bundle.ts` records a
 * previous version of exactly that mistake — it kept searching for a raise figure the deck
 * no longer computed, and reported clean forever.
 *
 * The sign is not assumed either. `Shared cost` is emitted NEGATIVE on the Totals sheet and
 * POSITIVE on Shared_Costs, so both are listed; a scan for one spelling would miss the row
 * that actually leaked.
 */
export function forbiddenValues(): ForbiddenValue[] {
  const years = consolidated();
  const out: ForbiddenValue[] = [];
  for (const y of years) {
    out.push({ what: `${y.year} shared cost (the pre-seed budget, annualised)`, value: y.sharedCost });
    out.push({ what: `${y.year} shared cost, negated as Totals emits it`, value: -y.sharedCost });
    out.push({ what: `${y.year} consolidated EBITDA`, value: y.ebitda });
    for (const a of y.allocations) {
      out.push({ what: `${y.year} shared-cost allocation to ${a.metroId}`, value: a.amount });
    }
  }
  return out;
}

/**
 * A value only counts as findable if it is big enough that an unrelated cell is unlikely to
 * equal it by coincidence.
 *
 * The allocation block contains genuine zeros — Palm Beach and the Hamptons carry no
 * allocation in 2026, because they have no revenue — and zero appears in hundreds of cells
 * across the metro sheets. Scanning for `0` would report every one of them as a leak, and a
 * report full of false positives is one nobody finishes reading. The same lesson
 * `verify-public-bundle.ts` records after `"2000"` matched roughly anything.
 *
 * This is a real hole, stated rather than papered over: an allocation that happens to be 0
 * is not detectable, and is also not a disclosure — "$0" reveals no budget.
 */
export const MIN_CHECKABLE_MAGNITUDE = 1;

export function checkableForbiddenValues(): ForbiddenValue[] {
  return forbiddenValues().filter((f) => Math.abs(f.value) >= MIN_CHECKABLE_MAGNITUDE);
}

/** Sanity: the model must actually produce years, or every list above is empty. */
export function expectedYearCount(): number {
  return MODEL_YEARS.length;
}
