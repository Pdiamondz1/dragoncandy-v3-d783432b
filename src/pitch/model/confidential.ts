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
 * The four hires are the four in docs/DragonCandy_Tech_Department_Scope.md — product manager,
 * UX designer, senior developer, mid-level developer — on that document's recommended US/Europe
 * mix, because those are the roles actually being recruited (plan written 2026-08-20, outreach
 * sent 2026-08-21). This budget previously funded a back-end engineer and an AI engineer, and
 * neither role appears in that plan or that outreach; funding a team nobody is hiring is not a
 * conservative assumption, it is a wrong one.
 *
 * **Consequence, stated rather than buried: the pre-seed no longer funds a dedicated AI
 * engineer.** Donny work sits with the CTO and the senior developer for the whole 18-month
 * horizon. A reader comparing this file with the cost model's section 5 roster will notice the
 * omission, and finding it explained is very different from finding it missing. The cost
 * model's other roles (AI developer, DevOps, part-time security engineer, salesperson) are not
 * cancelled — they are later, and later than this horizon.
 *
 * This computes a NEED. SAFE terms - cap, discount, MFN - are a founder decision, not a
 * derivation, and are deliberately absent.
 */
import { OPERATING } from './assumptions';
import { modeled, type Assumption } from './types';
import { budgetTotal, type BudgetLine } from './sharedCost';

/**
 * The budget's SHAPE and the arithmetic over it are not confidential and now live in
 * `sharedCost.ts`, so a public slide can sum a budget it was never handed. They are
 * re-exported here so this module's public surface — and `confidential.stub.ts`, which
 * must mirror it name for name — is unchanged by that move.
 */
export type { BudgetLine };
export { budgetTotal };

const HORIZON_MONTHS = 18;

const STAFFING_ROSTER = 'docs/DragonCandy_Capital_Raise_Cost_Model.md (section 5, staffing roster rates)';
const TECH_TEAM_ROSTER = 'docs/DragonCandy_Tech_Department_Scope.md (section 7, compensation — "What I recommend: a mix"; its US figures are themselves taken from DragonCandy_Capital_Raise_Cost_Model.md section 5, so the two cannot drift)';
const USE_OF_FUNDS_SOURCE = 'docs/DragonCandy_Capital_Raise_Cost_Model.md (section 8.1, Use of Funds)';
const MARKETING_LAUNCH_BUDGET = 'docs/DragonCandy_Capital_Raise_Cost_Model.md (section 7, Marketing — Sequenced 3-Metro Launch; section 8 consolidated-budget table, "Marketing + brand acquisition" line, sourced there to §7, §6.1)';
const LEGAL_AND_GA_BUDGET = 'docs/DragonCandy_Capital_Raise_Cost_Model.md (section 8 consolidated-budget table — "Legal / IP / fundraising" line, sourced there to the Moat Playbook 90-day legal plan, and the separate "G&A / ops / insurance / accounting" line, which this assumption\'s label also covers)';

/**
 * Every `PRE_SEED_BUDGET` line's monthly cost, except `infra` (which already derives from
 * `OPERATING.burnMonthly`, a registered assumption), registered here as `Assumption<number>`
 * so each dollar figure carries a provenance tag, a source and a note on the Assumptions
 * sheet — the same discipline every other number in the workbook is held to.
 *
 * Deliberately NOT merged into `REGISTER` (`assumptions.ts`): the `Assumptions` sheet ships in
 * BOTH the public and confidential workbook builds, but these are founder salaries and the
 * pre-seed budget — confidential. `workbook.ts` includes this register on the Assumptions sheet
 * only when `confidential: true`, mirroring how the Financing sheet itself is gated.
 *
 * Registering does not let a downstream test catch a WRONG number here — a fabricated salary
 * that is itself an `Assumption` still passes as "traceable." What it buys is narrower: the
 * figure stops being invisible to the assumption register, shows up with a source a reader can
 * check, and can no longer be changed without touching a labeled row instead of a bare literal
 * buried in an array.
 */
export const PRE_SEED_LINE_ASSUMPTIONS = {
  founder_ceo: modeled({
    value: 10_000,
    unit: 'USD/month',
    label: 'Founder salary — CEO (Joe)',
    source: STAFFING_ROSTER,
    note: 'Cost model section 5, "Founders x2" — modest during runway, loaded.',
  }),
  founder_cto: modeled({
    value: 10_000,
    unit: 'USD/month',
    label: 'Founder salary — CTO (Damon)',
    source: STAFFING_ROSTER,
    note: 'Cost model section 5, "Founders x2" — modest during runway, loaded.',
  }),
  /**
   * The four hires, on the Tech Department Scope's recommended mix: senior developer at the
   * going US rate, product manager in the US, designer and mid-level developer in Europe or
   * on contract. US FTE figures are LOADED (~30% employer cost); Europe/contract figures are
   * not, which is correct rather than an oversight — a European contractor carries no
   * employer load for us.
   *
   * The four annuals reproduce that document's own stated band exactly. It says the mix is
   * "about $415–445K in salary": low = 195 + 90 + 60 + 70 = 415, high = 195 + 120 + 60 + 70
   * = 445, the spread being the product manager's $90–120K range, of which the midpoint
   * $105K is taken here. Software and AI costs are deliberately NOT folded in — the document
   * calls the loaded figure "$450–500K a year with software and AI", and that difference is
   * already carried by the separate `infra` and `agents` lines below. Adding it here would
   * double-count it.
   */
  senior_dev: modeled({
    value: 16_250,
    unit: 'USD/month',
    label: 'Senior developer',
    source: TECH_TEAM_ROSTER,
    note: 'Tech scope section 7, US loaded annual $195,000 — the hire it says is worth paying full price for.',
  }),
  product_manager: modeled({
    value: 8_750,
    unit: 'USD/month',
    label: 'Product manager',
    source: TECH_TEAM_ROSTER,
    note: 'Tech scope section 7, US unloaded annual $105,000 — the midpoint of its stated $90–120K.',
  }),
  ux_designer: modeled({
    value: 5_000,
    unit: 'USD/month',
    label: 'UX / product designer',
    source: TECH_TEAM_ROSTER,
    note: 'Tech scope section 7, Europe/contract annual $60,000 — unloaded, as a contractor is.',
  }),
  mid_dev: modeled({
    value: 5_833,
    unit: 'USD/month',
    label: 'Mid-level developer',
    source: TECH_TEAM_ROSTER,
    note: 'Tech scope section 7, Europe/contract annual $70,000 — unloaded; $5,833/month is that figure divided by twelve and rounded down, so the modeled annual is $69,996.',
  }),
  agents: modeled({
    value: 2_000,
    unit: 'USD/month',
    label: 'Auto-improvement agent compute',
    source: STAFFING_ROSTER,
    note: 'Compute, not headcount — cost model section 5.',
  }),
  bookkeeper: modeled({
    value: 2_000,
    unit: 'USD/month',
    label: 'Bookkeeper (part-time contract)',
    source: STAFFING_ROSTER,
  }),
  marketing: modeled({
    value: 3_000,
    unit: 'USD/month',
    label: 'Hoboken launch marketing',
    source: MARKETING_LAUNCH_BUDGET,
    note:
      'One city. Founders stated three launch events on 2026-08-24 — Hoboken (Antique Lofts), ' +
      'Palm Beach (the Colony Hotel) and Montauk (venue not chosen) — and this line does not ' +
      'cover them: $3,000/month over months 2-18 is $51,000 for Hoboken alone, and neither a ' +
      'Colony Hotel evening nor a Montauk room in season is a $3,000 night. Nothing has been ' +
      'added here, because the raise is derived from this figure and inventing a number would ' +
      'move the ask by whatever I guessed. Blocked on `launchEventPlan` in deck/pending.ts.',
  }),
  legal: modeled({
    value: 1_800,
    unit: 'USD/month',
    label: 'Legal, IP and accounting',
    source: LEGAL_AND_GA_BUDGET,
    note:
      'This label bundles legal/IP with accounting; the cost model carries them as two ' +
      'separate section 8 lines ("Legal / IP / fundraising" and "G&A / ops / insurance / ' +
      'accounting") rather than one, so both are cited rather than picking the one that ' +
      'happens to match the label\'s first word.',
  }),
} satisfies Record<string, Assumption<number>>;

/**
 * The 50/30/20 use-of-funds split (cost model section 8.1), registered for the same reason as
 * `PRE_SEED_LINE_ASSUMPTIONS` above and gated out of the public build the same way.
 */
export const USE_OF_FUNDS_SHARE_ASSUMPTIONS = {
  engineering: modeled({
    value: 0.5,
    unit: 'fraction',
    label: 'Use of funds — Engineering and Donny AI',
    source: USE_OF_FUNDS_SOURCE,
  }),
  gtm: modeled({
    value: 0.3,
    unit: 'fraction',
    label: 'Use of funds — GTM and metro expansion',
    source: USE_OF_FUNDS_SOURCE,
  }),
  gna: modeled({
    value: 0.2,
    unit: 'fraction',
    label: 'Use of funds — Working capital and G&A',
    source: USE_OF_FUNDS_SOURCE,
  }),
} satisfies Record<string, Assumption<number>>;

/** Flat view of both registers above, for the Assumptions sheet and staleness checking. */
export const CONFIDENTIAL_ASSUMPTIONS: Readonly<Record<string, Assumption<number>>> = {
  ...Object.fromEntries(
    Object.entries(PRE_SEED_LINE_ASSUMPTIONS).map(([k, v]) => [`budgetLine_${k}`, v]),
  ),
  ...Object.fromEntries(
    Object.entries(USE_OF_FUNDS_SHARE_ASSUMPTIONS).map(([k, v]) => [`useOfFunds_${k}`, v]),
  ),
};

export const PRE_SEED_BUDGET: readonly BudgetLine[] = [
  // Founders, modest during runway (cost model section 5, "Founders x2", loaded).
  { key: 'founder_ceo', label: 'Founder salary — CEO (Joe)', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.founder_ceo.value, startMonth: 1, endMonth: 18 },
  { key: 'founder_cto', label: 'Founder salary — CTO (Damon)', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.founder_cto.value, startMonth: 1, endMonth: 18 },
  // The four hires (tech scope section 7 mix). START MONTHS ARE INHERITED OR SOURCED, NEVER
  // CHOSEN HERE: month 3 is carried over unchanged from the `backend` line these replace — a
  // number this edit did not invent — and applies to the senior developer, the mid-level
  // developer and the designer. The product manager is month 6 because the cost model's
  // section 5 states the PM as a month-6 hire, "Dame covers product early"; honouring a
  // documented statement is sourcing, not judgement. (The tech scope argues the PM should
  // instead start first, since the audit is their job — that is a real disagreement between
  // two live documents, and it is recorded in the tech scope's own "Two places this differs
  // from our existing cost model" note rather than silently resolved by this file.)
  { key: 'senior_dev', label: 'Senior developer', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.senior_dev.value, startMonth: 3, endMonth: 18 },
  { key: 'mid_dev', label: 'Mid-level developer', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.mid_dev.value, startMonth: 3, endMonth: 18 },
  { key: 'ux_designer', label: 'UX / product designer', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.ux_designer.value, startMonth: 3, endMonth: 18 },
  { key: 'product_manager', label: 'Product manager', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.product_manager.value, startMonth: 6, endMonth: 18 },
  // Auto-improvement agents are compute, not headcount (cost model section 5).
  { key: 'agents', label: 'Auto-improvement agent compute', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.agents.value, startMonth: 1, endMonth: 18 },
  { key: 'bookkeeper', label: 'Bookkeeper (part-time contract)', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.bookkeeper.value, startMonth: 1, endMonth: 18 },
  // Infrastructure: today's measured burn, grown for launch load. Derives directly from the
  // registered OPERATING.burnMonthly — the one line in this array that already had provenance.
  { key: 'infra', label: 'Infrastructure and tooling', monthlyCost: OPERATING.burnMonthly.value * 3, startMonth: 1, endMonth: 18 },
  // One city. See PRE_SEED_LINE_ASSUMPTIONS.marketing's note for why this line does not cover
  // the three launch events the founders have since stated.
  { key: 'marketing', label: 'Hoboken launch marketing', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.marketing.value, startMonth: 2, endMonth: 18 },
  { key: 'legal', label: 'Legal, IP and accounting', monthlyCost: PRE_SEED_LINE_ASSUMPTIONS.legal.value, startMonth: 1, endMonth: 18 },
];

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

/** Mirrors the 50/30/20 split in the cost model section 8.1 — now sourced from the registered
 * `USE_OF_FUNDS_SHARE_ASSUMPTIONS` above rather than repeating the literals here. */
export const USE_OF_FUNDS_SPLIT: UseOfFundsSplit = {
  engineering: USE_OF_FUNDS_SHARE_ASSUMPTIONS.engineering.value,
  gtm: USE_OF_FUNDS_SHARE_ASSUMPTIONS.gtm.value,
  gna: USE_OF_FUNDS_SHARE_ASSUMPTIONS.gna.value,
};

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
 * **`budgetTotal(lines, 1)` is the FIRST month's burn, not the last.** In month 1 none of
 * the four hires has started — three begin in month 3 and the product manager in month 6 —
 * so it returns roughly two-fifths of what the company actually costs to run by the time
 * the money runs out. Sizing a runway buffer on it understates the raise, and every
 * use-of-funds bucket downstream of it, by about $116K at the three months that call site
 * applied (it was ~$110K under the roster this budget funded before). The name of the parameter
 * (`endingMonthlyBurn`) said exactly what it wanted; the call site quietly handed it
 * something else, and nothing checked because both are numbers. `preSeedRaise.test.ts`
 * pins the gap rather than this comment restating a percentage that moves with the roster.
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

/**
 * The one-sentence CONCLUSION the confidential trajectory slide draws from the numbers
 * above, as a string, because a sentence can disclose a fact as completely as a figure can.
 *
 * The trajectory slide gates `TrajectoryConsolidatedEbitda` — the actual EBITDA line — out
 * of public builds, and then printed "The company's own line stays negative through 2027,
 * which is what the raise is for." to every public reader anyway. That sentence IS the
 * conclusion: it says the company is loss-making through 2027 and that the raise covers the
 * gap. Withholding the number while stating what the number means protects nothing.
 *
 * ## Why it lives HERE and not in `trajectory.confidential.tsx`
 *
 * A `*.confidential.tsx` file is in the PUBLIC module graph — `slides.tsx` imports it
 * unconditionally, and `__PITCH_CONFIDENTIAL__` folding to `false` only drops the rendered
 * branch. `build.sourcemap` is true, so Rollup embeds that file's entire source in
 * `sourcesContent`, comments and JSX text included. Verified against a public `dist/`: the
 * whole of `trajectory.confidential.tsx` is sitting in `PitchDeck-*.js.map`. So moving the
 * sentence into that file would move it out of the `.js` and into the `.map`, still inside
 * the directory `npm run pitch:verify-public` scans, and the leak would be one grep away
 * from being rediscovered.
 *
 * `@pitch/confidential` is the ONLY specifier `vite.config.ts` swaps for a stub, so this
 * module is the only place in the repo whose text cannot reach a public build at all. A
 * confidential sentence therefore belongs in the confidential module, next to the figures it
 * is a conclusion about — the stub exports an empty string, and `confidential.stub.test.ts`
 * fails if that pairing ever drifts.
 *
 * It is a constant rather than derived from `consolidated()` because that module cannot be
 * imported from a component (see its header). The claim it makes is pinned against the real
 * model by `slideTrajectory.test.tsx`, which asserts 2026 and 2027 EBITDA are negative and
 * 2028 positive — so if the model ever turns 2027 profitable this sentence fails a test
 * rather than quietly understating the business to an investor.
 */
export const CONSOLIDATED_LINE_CONCLUSION =
  'The company’s own line stays negative through 2027, which is what the raise is for.';
