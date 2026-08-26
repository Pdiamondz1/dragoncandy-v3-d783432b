/**
 * The investor model's assumption register.
 *
 * Read the provenance tag before you quote any of this. MEASURED means someone read it off
 * production, an invoice, or the codebase on the stated date. BENCHMARKED means an external
 * comparable. MODELED means it is our assumption and the deck shows its driver.
 *
 * Correcting a value means updating `asOf` in the same edit. `assumptions.test.ts` fails when
 * a MEASURED row passes 90 days.
 */
import { measured, benchmarked, modeled, type Assumption } from './types';

export type TierName = 'free' | 'starter' | 'growth' | 'pro';

const STRIPE_PRICES = 'docs/STRIPE_PRICES.md';
const TAKE_RATE_LADDER = 'supabase/functions/stripe-webhook/index.ts (TIER_TAKE_RATES)';
const TAKE_RATE_LADDER_FREE = 'supabase/functions/stripe-webhook/index.ts (TIER_TAKE_RATES) + supabase/functions/_shared/platform-fee.ts (PLATFORM_FEE_RATE)';
const PRICE_BANDS = 'src/lib/campaignPricing.ts (TIER_PRICE_BANDS)';

/** Monthly subscription price by tier, in dollars. Live in the app. */
export const PRICING: Record<TierName, Assumption<number>> = {
  free: measured({ value: 0, unit: 'USD/month', label: 'Free tier price', source: STRIPE_PRICES, asOf: '2026-08-23' }),
  starter: measured({ value: 149, unit: 'USD/month', label: 'Starter tier price', source: STRIPE_PRICES, asOf: '2026-08-23' }),
  growth: measured({ value: 449, unit: 'USD/month', label: 'Growth tier price', source: STRIPE_PRICES, asOf: '2026-08-23' }),
  pro: measured({ value: 899, unit: 'USD/month', label: 'Pro tier price', source: STRIPE_PRICES, asOf: '2026-08-23' }),
};

/** Platform take rate by tier, as a fraction of campaign value. Live in the app. */
export const TIER_TAKE_RATES: Record<TierName, Assumption<number>> = {
  free: measured({ value: 0.10, unit: 'fraction', label: 'Free tier take rate', source: TAKE_RATE_LADDER_FREE, asOf: '2026-08-23' }),
  starter: measured({ value: 0.07, unit: 'fraction', label: 'Starter tier take rate', source: TAKE_RATE_LADDER, asOf: '2026-08-23' }),
  growth: measured({ value: 0.05, unit: 'fraction', label: 'Growth tier take rate', source: TAKE_RATE_LADDER, asOf: '2026-08-23' }),
  pro: measured({ value: 0.03, unit: 'fraction', label: 'Pro tier take rate', source: TAKE_RATE_LADDER, asOf: '2026-08-23' }),
};

export const OPERATING = {
  burnMonthly: measured({
    value: 569,
    unit: 'USD/month',
    label: 'Monthly operating cost',
    source: 'vendor invoices | Lovable 50 + Anthropic 200 + Outstand 249 + Supabase 45 + OpenAI 25',
    asOf: '2026-08-23',
    note: 'Was $390 in the capital-raise cost model for two months after Outstand rose $67 to $249. ' +
      'PROJECT_CONTEXT.md then briefly stated $572, which did not reconcile with its own five ' +
      'enumerated components (the same five above, which sum to $569) — we use the component sum ' +
      'here because it is the checkable figure; the $3 gap is unresolved and needs an invoice check.',
  }),
  payingCustomers: measured({
    value: 0,
    unit: 'accounts',
    label: 'Paying customers',
    source: "prod: select count(*) from organizations where take_rate is not null and stripe_subscription_id is not null",
    asOf: '2026-08-24',
    note: 'Confirmed 0 against production 2026-08-24. Previously carried this same value with a ' +
      'note admitting it had never been checked, sourced to PROJECT_CONTEXT.md — MEASURED means ' +
      'read off production, an invoice or the codebase, and reading it off another document is ' +
      'none of those. Stripe is in test mode, so a non-zero result here would mean live charges ' +
      'exist and must be escalated rather than quoted.',
  }),
  registeredUsers: measured({
    value: 45,
    unit: 'accounts',
    label: 'Registered users',
    source: 'prod: select count(*) from profiles',
    asOf: '2026-08-24',
    note: 'Read off production 2026-08-24: 45. This row said 30, tagged MEASURED, sourced to ' +
      'PROJECT_CONTEXT.md §4 ("~30 organic users") and carrying a note that it had never been ' +
      'checked — so an investor-facing figure was wrong by a third for as long as the doc was ' +
      'stale, with a provenance tag vouching for it. Surfaced by the Codex second review, which ' +
      'read the note rather than the tag. 26 organizations exist against these 45 users.',
  }),
  pageComponents: measured({
    value: 96,
    unit: 'files',
    label: 'Page components',
    source: "find src/pages -name '*.tsx' | wc -l",
    asOf: '2026-08-24',
    note: 'PROJECT_CONTEXT.md\'s own "re-counted 2026-08-24" line says 92 pages and 269 hooks. That ' +
      'line disagrees with scripts/update-scale-numbers.mjs, which generates it: run on origin/main ' +
      'the script counts 96 and 277, and git ls-tree on origin/main agrees. The hand re-count is the ' +
      'wrong one. We quote the command, because a figure that reproduces beats a figure someone typed.',
  }),
  hooks: measured({
    value: 277,
    unit: 'files',
    label: 'React hooks',
    source: "find src/hooks -name 'use*.ts' -o -name 'use*.tsx' | wc -l",
    asOf: '2026-08-24',
    note: 'The use* convention is authoritative because it is what scripts/update-scale-numbers.mjs ' +
      'counts. See the pageComponents note for why this disagrees with PROJECT_CONTEXT.md.',
  }),
  edgeFunctions: measured({ value: 111, unit: 'functions', label: 'Edge functions', source: "ls -d supabase/functions/*/ | grep -v _shared | wc -l", asOf: '2026-08-24' }),
  sourceFiles: measured({
    value: 1230,
    unit: 'files',
    label: 'TypeScript source files',
    source: "find src -type f \\( -name '*.ts' -o -name '*.tsx' \\) | wc -l",
    asOf: '2026-08-24',
    note: 'Re-read 2026-08-24 at the end of the deck build — was 1193 before it. The ' +
      'count includes this model\'s own files (src/pitch/model/*.ts and its tests), so it moves as ' +
      'the model itself grows. A shell command that reproduces in under a second and disagrees with ' +
      'itself on the same commit is not stale in the MAX_MEASURED_AGE_DAYS sense — it needs to be ' +
      're-run at the end of a work session, not just within 90 days.',
  }),
  migrations: measured({ value: 406, unit: 'files', label: 'Database migrations', source: 'ls supabase/migrations/*.sql | wc -l', asOf: '2026-08-24' }),
  tests: measured({
    value: 3228,
    unit: 'tests',
    label: 'Passing tests',
    source: 'npx vitest run',
    asOf: '2026-08-24',
    note: 'Re-read 2026-08-24 at the end of the deck build — was 2923 before it. All green ' +
      '(291 files). Includes this model\'s own test suite, which grows as the deck does, so re-run ' +
      'at the end of a work session rather than trusting the 90-day window.',
  }),
  testFiles: measured({
    value: 291,
    unit: 'files',
    label: 'Test files',
    source: 'npx vitest run',
    asOf: '2026-08-24',
    note: 'Re-read 2026-08-24 at the end of the deck build — was 268. Same caveat as `tests` above.',
  }),
  aiCostCapPctOfRevenue: measured({
    value: 0.15,
    unit: 'fraction',
    label: 'AI spend cap as share of revenue',
    source: 'docs/PROJECT_CONTEXT.md (section 8)',
    asOf: '2026-08-23',
  }),
} satisfies Record<string, Assumption<number>>;

/**
 * When Year 1 IS.
 *
 * The model equates 2026 = Y1, 2027 = Y2, 2028 = Y3 and always has -- `MODEL_YEARS`, every
 * penetration anchor, and `threeYearTrajectory`'s mapping onto PROJECT_CONTEXT section 3's
 * Y1/Y2/Y3 bands all depend on it. But section 4 says production launch is TBD, so the
 * mapping was an UNSTATED DEFAULT sitting under every figure in the deck: if Year 1 is
 * really 2027, every year label on the trajectory slide is off by one and the cross-check
 * compares the wrong rows.
 *
 * It is registered here because that is the difference between an assumption and a habit.
 * An unstated default cannot be challenged, cannot be found by anyone auditing the model,
 * and cannot appear on the Assumptions sheet -- which is where an investor looks to find out
 * what we assumed.
 *
 * Deliberately NOT a `FOUNDER_FACTS` entry in `src/pitch/deck/pending.ts`: those are facts
 * the DECK prints with attribution on a slide, and `model/` importing `deck/` would invert
 * the layering. This is a modelling convention, so it lives with the modelling assumptions.
 */
export const CALENDAR = {
  year1CalendarYear: modeled({
    value: 2026,
    unit: 'calendar year',
    label: 'The calendar year that is Year 1',
    source: 'founder confirmation, Damon Williams (CTO), in session 2026-08-26',
    note:
      'Raised as an open question because PROJECT_CONTEXT.md section 4 states production ' +
      'launch is TBD, and confirmed by the founder: 2026 IS Year 1. MODELED rather than ' +
      'MEASURED because a decision is not a reading -- there is no command that re-runs it, ' +
      'and MEASURED means read off production, an invoice or the codebase. If launch slips ' +
      'into 2027 this value moves and every year label in the deck moves with it; that is ' +
      'the point of stating it here rather than leaving it implicit.',
  }),
} satisfies Record<string, Assumption<number>>;

export const MARKET = {
  campaignPriceStandardLow: measured({ value: 75, unit: 'USD/deliverable', label: 'Standard delivery, low band', source: PRICE_BANDS, asOf: '2026-08-23' }),
  campaignPriceStandardHigh: measured({ value: 150, unit: 'USD/deliverable', label: 'Standard delivery, high band', source: PRICE_BANDS, asOf: '2026-08-23' }),
  deliverablesPerCampaign: modeled({
    value: 3,
    unit: 'deliverables',
    label: 'Deliverables per campaign',
    source: 'src/pitch/model/assumptions.ts',
    note: 'Standard tier permits up to 10 (STRIPE_PRICES.md). Three is a conservative typical order.',
  }),
  campaignsPerRestaurantPerMonth: modeled({
    value: 2.5,
    unit: 'campaigns/month',
    label: 'Campaigns per restaurant per month',
    source: 'src/pitch/model/assumptions.ts',
  }),
  creatorsPerRestaurant: modeled({
    value: 4,
    unit: 'creators',
    label: 'Creators needed per restaurant',
    source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)',
    note: 'Retagged from BENCHMARKED 2026-08-23 — the source is our own Pricing Briefing, not an ' +
      'external comparable; "benchmarked" was doing service for "we wrote it down somewhere else." ' +
      'Stated there as a 3-5 range; 4 is the midpoint.',
  }),
  applicationsPerCreatorPerMonth: modeled({
    value: 2,
    unit: 'applications/month',
    label: 'Campaign applications per active creator per month',
    source: 'src/pitch/model/assumptions.ts',
  }),
  campaignOpenDays: modeled({
    value: 14,
    unit: 'days',
    label: 'Days a campaign stays open for applications',
    source: 'src/pitch/model/assumptions.ts',
    note: 'Drives how many campaigns are open CONCURRENTLY, which is what a creator actually sees.',
  }),
  /**
   * Paid-tier conversion mix. Added to the register 2026-08-23 — it previously lived only as an
   * untagged `const MIX` literal in scripts/generate-investor-model.ts, with no provenance and no
   * appearance in the generated document, despite driving 78% of headline revenue at 100
   * businesses ($21,680 of $27,755). It asserts 70% paid conversion from a base of zero paying
   * customers; MODELED, not BENCHMARKED, because nothing external backs this split. The four
   * values must sum to 1 — see `tierMix.test.ts`.
   */
  tierMixFree: modeled({ value: 0.30, unit: 'fraction', label: 'Tier mix — Free', source: 'src/pitch/model/assumptions.ts' }),
  tierMixStarter: modeled({ value: 0.40, unit: 'fraction', label: 'Tier mix — Starter', source: 'src/pitch/model/assumptions.ts' }),
  tierMixGrowth: modeled({ value: 0.25, unit: 'fraction', label: 'Tier mix — Growth', source: 'src/pitch/model/assumptions.ts' }),
  tierMixPro: modeled({ value: 0.05, unit: 'fraction', label: 'Tier mix — Pro', source: 'src/pitch/model/assumptions.ts' }),
} satisfies Record<string, Assumption<number>>;

export const UNIT_ECONOMICS = {
  restaurantCacLow: modeled({
    value: 500,
    unit: 'USD',
    label: 'Restaurant acquisition cost, low',
    source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)',
    note: 'Retagged from BENCHMARKED 2026-08-23 — the source line reads "Blended target CAC for ' +
      'restaurants," i.e. a goal we set for ourselves, not an observed cost. DragonCandy has never ' +
      'acquired a paying customer, so no restaurant CAC has ever actually been paid.',
  }),
  restaurantCacHigh: modeled({
    value: 1500,
    unit: 'USD',
    label: 'Restaurant acquisition cost, high',
    source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)',
    note: 'Retagged from BENCHMARKED 2026-08-23 — same "Blended target CAC" line as the low end: a ' +
      'target, not an observed cost, from a company with zero paying customers.',
  }),
  monthlyChurn: benchmarked({
    value: 0.04,
    unit: 'fraction/month',
    label: 'Monthly customer churn',
    source: 'docs/PROJECT_CONTEXT.md (section 3, 2025 SMB SaaS benchmark 3-5%/month)',
    note: 'The kill-switch trips above 6%/month.',
  }),
  stripePctFee: benchmarked({ value: 0.029, unit: 'fraction', label: 'Stripe percentage fee', source: 'https://stripe.com/pricing' }),
  stripeFixedFee: benchmarked({ value: 0.30, unit: 'USD/transaction', label: 'Stripe fixed fee', source: 'https://stripe.com/pricing' }),
  aiCostPerCustomerMonth: modeled({
    value: 1.20,
    unit: 'USD/month',
    label: 'AI cost per customer per month',
    source: 'docs/DragonCandy_Infrastructure_Capacity_Report.md (section 4)',
    note: 'Retagged from BENCHMARKED 2026-08-23 — the source is our own capacity report, not an ' +
      'external comparable, and that report is itself known to carry stale Outstand/Supabase/OpenAI ' +
      'cost baselines (docs/DragonCandy_Pricing_Profitability_Briefing_v2.md around line 410 says so ' +
      'explicitly: "that report\'s own 250/1,000-user tables still carry the same stale ' +
      'Outstand-omission and Supabase/OpenAI baseline this correction fixes here; it has not yet been ' +
      'updated to match"). Stated there as a $0.80-$1.60 range (average ~$1.20); 1.20 is that ' +
      'average/midpoint.',
  }),
  infraCostPerCustomerMonth: modeled({
    value: 0.20,
    unit: 'USD/month',
    label: 'Infrastructure cost per customer per month',
    source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5, "What One Customer Costs Us to Serve")',
    note: 'Retagged from BENCHMARKED 2026-08-23 — the source is our own Pricing Briefing, not an ' +
      'external comparable. 0.20 is the midpoint of a stated $0.10-$0.30 range. That source computes ' +
      'it as a FIXED cost amortized across users ("$74/month spread across users," falling to ~$0.07 ' +
      'at 1,000 users) — this model instead multiplies it by business count as a marginal per-business ' +
      'rate, which overstates it at large scale and understates it at small scale. See the Scale ' +
      'section note in the generated document.',
  }),
} satisfies Record<string, Assumption<number>>;

const PROJECT_CONTEXT_TARGETS = 'docs/PROJECT_CONTEXT.md (section 3)';
const COST_BREAKDOWN = 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)';

/**
 * Three-year revenue and cost bands, our own forward projections — not a benchmark, not a
 * measurement of anything that exists yet. Feeds `threeYearTrajectory()` in `derive.ts`.
 */
export const TRAJECTORY = {
  year1RevenueLow: modeled({
    value: 300000,
    unit: 'USD/year',
    label: 'Year 1 revenue, low',
    source: PROJECT_CONTEXT_TARGETS,
    note: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md section 7 states the same three-year ranges independently, so they are corroborated across two documents.',
  }),
  year1RevenueHigh: modeled({
    value: 600000,
    unit: 'USD/year',
    label: 'Year 1 revenue, high',
    source: PROJECT_CONTEXT_TARGETS,
  }),
  year2RevenueLow: modeled({
    value: 2000000,
    unit: 'USD/year',
    label: 'Year 2 revenue, low',
    source: PROJECT_CONTEXT_TARGETS,
  }),
  year2RevenueHigh: modeled({
    value: 4500000,
    unit: 'USD/year',
    label: 'Year 2 revenue, high',
    source: PROJECT_CONTEXT_TARGETS,
  }),
  year3RevenueLow: modeled({
    value: 7000000,
    unit: 'USD/year',
    label: 'Year 3 revenue, low',
    source: PROJECT_CONTEXT_TARGETS,
  }),
  year3RevenueHigh: modeled({
    value: 12000000,
    unit: 'USD/year',
    label: 'Year 3 revenue, high',
    source: PROJECT_CONTEXT_TARGETS,
  }),
  year1CostLow: modeled({
    value: 590000,
    unit: 'USD/year',
    label: 'Year 1 cost, low',
    source: COST_BREAKDOWN,
    note:
      'This document contradicts itself on cost. Its per-year summary tables (lines 476, 490, 504) state ' +
      '$480-600K / $1.5-2M / $2.5-3.5M, while its own line-item breakdown (line 520) states ' +
      '$590-830K / $1.1-1.8M / $2.2-3.8M -- they disagree in both directions, the breakdown is higher in ' +
      'Year 1 and lower in Years 2 and 3. We use the line-item breakdown because it is built from enumerable ' +
      'components (payroll, infrastructure, AI, Stripe, marketing, legal) rather than asserted as a single number.',
  }),
  year1CostHigh: modeled({
    value: 830000,
    unit: 'USD/year',
    label: 'Year 1 cost, high',
    source: COST_BREAKDOWN,
  }),
  year2CostLow: modeled({
    value: 1100000,
    unit: 'USD/year',
    label: 'Year 2 cost, low',
    source: COST_BREAKDOWN,
  }),
  year2CostHigh: modeled({
    value: 1800000,
    unit: 'USD/year',
    label: 'Year 2 cost, high',
    source: COST_BREAKDOWN,
  }),
  year3CostLow: modeled({
    value: 2200000,
    unit: 'USD/year',
    label: 'Year 3 cost, low',
    source: COST_BREAKDOWN,
  }),
  year3CostHigh: modeled({
    value: 3800000,
    unit: 'USD/year',
    label: 'Year 3 cost, high',
    source: COST_BREAKDOWN,
  }),
} satisfies Record<string, Assumption<number>>;

/** Flat view of everything, for staleness checking and document generation. */
export const REGISTER: Readonly<Record<string, Assumption<number>>> = {
  ...Object.fromEntries(Object.entries(PRICING).map(([k, v]) => [`price_${k}`, v])),
  ...Object.fromEntries(Object.entries(TIER_TAKE_RATES).map(([k, v]) => [`takeRate_${k}`, v])),
  ...OPERATING,
  ...CALENDAR,
  ...MARKET,
  ...UNIT_ECONOMICS,
  ...TRAJECTORY,
};
