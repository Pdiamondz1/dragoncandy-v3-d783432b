/**
 * CONFIDENTIAL. The pre-seed budget, the raise it implies, and the use-of-funds split.
 *
 * Kept in its own file so Plan B can import it behind `import.meta.env.VITE_PITCH_CONFIDENTIAL`
 * and let Vite drop it from the public bundle entirely. Do not import this from a component
 * outside that flag: `/pitch` is a publicly fetchable chunk until the edge gate ships.
 *
 * Rates are from docs/DragonCandy_Capital_Raise_Cost_Model.md section 5 (NYC-metro 2026,
 * modeled below median, loaded with ~30% employer cost). The ROSTER is smaller than that
 * document's: it costs a full team across three metros for a $3M priced round, this funds one
 * metro on a pre-seed. The reduction is the modeling decision; the rates are not ours.
 *
 * This computes a NEED. SAFE terms - cap, discount, MFN - are a founder decision, not a
 * derivation, and are deliberately absent.
 */
import { OPERATING } from './assumptions';

export interface BudgetLine {
  readonly key: string;
  readonly label: string;
  readonly monthlyCost: number;
  /** 1-based, inclusive. */
  readonly startMonth: number;
  /** 1-based, inclusive. */
  readonly endMonth: number;
}

const HORIZON_MONTHS = 18;

export const PRE_SEED_BUDGET: readonly BudgetLine[] = [
  // Founders, modest during runway (cost model section 5, "Founders x2", loaded).
  { key: 'founder_ceo', label: 'Founder salary — CEO (Joe)', monthlyCost: 10_000, startMonth: 1, endMonth: 18 },
  { key: 'founder_cto', label: 'Founder salary — CTO (Damon)', monthlyCost: 10_000, startMonth: 1, endMonth: 18 },
  // Engineering. Cost model section 5 loaded annuals: back-end ~$195K, AI dev ~$215K.
  { key: 'backend', label: 'Back-end engineer', monthlyCost: 16_250, startMonth: 3, endMonth: 18 },
  { key: 'ai_dev', label: 'AI engineer (Donny)', monthlyCost: 17_900, startMonth: 4, endMonth: 18 },
  // Auto-improvement agents are compute, not headcount (cost model section 5).
  { key: 'agents', label: 'Auto-improvement agent compute', monthlyCost: 2_000, startMonth: 1, endMonth: 18 },
  { key: 'bookkeeper', label: 'Bookkeeper (part-time contract)', monthlyCost: 2_000, startMonth: 1, endMonth: 18 },
  // Infrastructure: today's measured burn, grown for launch load.
  { key: 'infra', label: 'Infrastructure and tooling', monthlyCost: OPERATING.burnMonthly.value * 3, startMonth: 1, endMonth: 18 },
  // One city. Founders stated three launch events on 2026-08-24 — Hoboken (Antique Lofts),
  // Palm Beach (the Colony Hotel) and Montauk (venue not chosen) — and this line does not
  // cover them: $3,000/month over months 2-18 is $51,000 for Hoboken alone, and neither a
  // Colony Hotel evening nor a Montauk room in season is a $3,000 night. Nothing has been
  // added here, because the raise is derived from this array and inventing a number would
  // move the ask by whatever I guessed. Blocked on `launchEventPlan` in deck/pending.ts.
  { key: 'marketing', label: 'Hoboken launch marketing', monthlyCost: 3_000, startMonth: 2, endMonth: 18 },
  { key: 'legal', label: 'Legal, IP and accounting', monthlyCost: 1_800, startMonth: 1, endMonth: 18 },
];

/** Sum of every line over its active months, truncated to the horizon. */
export function budgetTotal(lines: readonly BudgetLine[], months: number): number {
  return lines.reduce((sum, line) => {
    const start = Math.max(1, line.startMonth);
    const end = Math.min(months, line.endMonth);
    const active = end - start + 1;
    return active > 0 ? sum + line.monthlyCost * active : sum;
  }, 0);
}

export interface RaiseInput {
  readonly operatingNeed: number;
  readonly bufferMonths: number;
  readonly endingMonthlyBurn: number;
}

export function requiredRaise({ operatingNeed, bufferMonths, endingMonthlyBurn }: RaiseInput): number {
  if (bufferMonths < 0) throw new Error(`bufferMonths cannot be negative, got ${bufferMonths}`);
  return operatingNeed + bufferMonths * endingMonthlyBurn;
}

export interface UseOfFundsSplit {
  readonly engineering: number;
  readonly gtm: number;
  readonly gna: number;
}

/** Mirrors the 50/30/20 split in the cost model section 8.1. */
export const USE_OF_FUNDS_SPLIT: UseOfFundsSplit = { engineering: 0.5, gtm: 0.3, gna: 0.2 };

export interface FundsBucket {
  readonly key: keyof UseOfFundsSplit;
  readonly label: string;
  readonly share: number;
  readonly amount: number;
}

const BUCKET_LABELS: Record<keyof UseOfFundsSplit, string> = {
  engineering: 'Engineering and Donny AI',
  gtm: 'Go-to-market and Hoboken launch',
  gna: 'Working capital and general costs',
};

// Not named `useOfFunds`: a top-level call to a function whose name starts with `use`
// trips ESLint's react-hooks/rules-of-hooks (it assumes any `use*` call is a React hook
// call site). This is a plain function, called from a Node script (scripts/generate-
// investor-model.ts) and later a deck-slide builder — neither is a React render, so the
// rule's premise doesn't apply, but its lint would still fire. Do not rename this back.
export function buildFundsAllocation(raise: number, split: UseOfFundsSplit): FundsBucket[] {
  const total = split.engineering + split.gtm + split.gna;
  if (Math.abs(total - 1) > 1e-9) throw new Error(`Use-of-funds split must sum to 1, got ${total}`);
  return (Object.keys(BUCKET_LABELS) as (keyof UseOfFundsSplit)[]).map((key) => ({
    key,
    label: BUCKET_LABELS[key],
    share: split[key],
    amount: raise * split[key],
  }));
}

export const PRE_SEED_HORIZON_MONTHS = HORIZON_MONTHS;

/** Months of runway past the horizon that the raise must also cover. */
export const PRE_SEED_BUFFER_MONTHS = 6;

export interface PreSeedRaise {
  readonly operatingNeed: number;
  /** Burn in the LAST month of the horizon — every line that is still running. */
  readonly endingMonthlyBurn: number;
  readonly bufferMonths: number;
  readonly buffer: number;
  readonly raise: number;
}

/**
 * The one computation of the raise, shared by the generated document and the deck.
 *
 * It exists because they disagreed. The document already computed the ending burn
 * correctly and applied a six-month buffer; the deck slide called
 * `budgetTotal(PRE_SEED_BUDGET, 1)` and applied three. Two things were wrong with that,
 * and the first is the one worth remembering:
 *
 * **`budgetTotal(lines, 1)` is the FIRST month's burn, not the last.** In month 1 the
 * engineers have not started — the back-end hire begins in month 3 and the AI hire in
 * month 4 — so it returns roughly 43% of what the company actually costs to run by the
 * time the money runs out. Sizing a runway buffer on it understates the raise, and every
 * use-of-funds bucket downstream of it, by about $110K. The name of the parameter
 * (`endingMonthlyBurn`) said exactly what it wanted; the call site quietly handed it
 * something else, and nothing checked because both are numbers.
 *
 * The second: a buffer is a judgement, and having two of them in one repo means the deck
 * and the diligence document answer "how much are you raising" differently in the same
 * meeting.
 */
export function preSeedRaise(): PreSeedRaise {
  const operatingNeed = budgetTotal(PRE_SEED_BUDGET, HORIZON_MONTHS);
  const endingMonthlyBurn = PRE_SEED_BUDGET.reduce(
    (sum, line) => sum + (line.endMonth >= HORIZON_MONTHS ? line.monthlyCost : 0),
    0,
  );
  const raise = requiredRaise({
    operatingNeed,
    bufferMonths: PRE_SEED_BUFFER_MONTHS,
    endingMonthlyBurn,
  });
  return {
    operatingNeed,
    endingMonthlyBurn,
    bufferMonths: PRE_SEED_BUFFER_MONTHS,
    buffer: raise - operatingNeed,
    raise,
  };
}
