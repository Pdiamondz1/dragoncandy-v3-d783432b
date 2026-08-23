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
const PLATFORM_FEE = 'supabase/functions/_shared/platform-fee.ts';
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
  free: measured({ value: 0.10, unit: 'fraction', label: 'Free tier take rate', source: PLATFORM_FEE, asOf: '2026-08-23' }),
  starter: measured({ value: 0.07, unit: 'fraction', label: 'Starter tier take rate', source: PLATFORM_FEE, asOf: '2026-08-23' }),
  growth: measured({ value: 0.05, unit: 'fraction', label: 'Growth tier take rate', source: PLATFORM_FEE, asOf: '2026-08-23' }),
  pro: measured({ value: 0.03, unit: 'fraction', label: 'Pro tier take rate', source: PLATFORM_FEE, asOf: '2026-08-23' }),
};

export const OPERATING = {
  burnMonthly: measured({
    value: 572,
    unit: 'USD/month',
    label: 'Monthly operating cost',
    source: 'vendor invoices | Lovable 50 + Anthropic 200 + Outstand 249 + Supabase 45 + OpenAI 25',
    asOf: '2026-08-23',
    note: 'Was $390 in the capital-raise cost model for two months after Outstand rose $67 to $249.',
  }),
  payingCustomers: measured({
    value: 0,
    unit: 'accounts',
    label: 'Paying customers',
    source: 'docs/PROJECT_CONTEXT.md (section 4)',
    asOf: '2026-08-23',
    note: 'NOT yet confirmed against prod. To verify: select count(*) from organizations where take_rate is not null and stripe_subscription_id is not null. Stripe is in test mode, so a non-zero result would mean live charges exist and must be escalated.',
  }),
  registeredUsers: measured({
    value: 30,
    unit: 'accounts',
    label: 'Registered users',
    source: 'docs/PROJECT_CONTEXT.md (section 4)',
    asOf: '2026-08-23',
    note: 'NOT yet confirmed against prod. To verify: select count(*) from profiles. Organic, unpaid. Approximate in PROJECT_CONTEXT; re-count before quoting precisely.',
  }),
  pageComponents: measured({ value: 95, unit: 'files', label: 'Page components', source: "find src/pages -name '*.tsx' | wc -l", asOf: '2026-08-23' }),
  hooks: measured({ value: 274, unit: 'files', label: 'React hooks', source: "find src/hooks -name '*.ts' -o -name '*.tsx' | wc -l", asOf: '2026-08-23' }),
  edgeFunctions: measured({ value: 104, unit: 'functions', label: 'Edge functions', source: "ls -d supabase/functions/*/ | grep -v _shared | wc -l", asOf: '2026-08-23' }),
  sourceFiles: measured({ value: 1182, unit: 'files', label: 'TypeScript source files', source: "find src -type f \\( -name '*.ts' -o -name '*.tsx' \\) | wc -l", asOf: '2026-08-23' }),
  migrations: measured({ value: 402, unit: 'files', label: 'Database migrations', source: 'ls supabase/migrations/*.sql | wc -l', asOf: '2026-08-23' }),
  tests: measured({ value: 2857, unit: 'tests', label: 'Passing tests', source: 'npx vitest run', asOf: '2026-08-23' }),
  testFiles: measured({ value: 262, unit: 'files', label: 'Test files', source: 'npx vitest run', asOf: '2026-08-23' }),
  aiCostCapPctOfRevenue: measured({
    value: 0.15,
    unit: 'fraction',
    label: 'AI spend cap as share of revenue',
    source: 'docs/PROJECT_CONTEXT.md (section 8)',
    asOf: '2026-08-23',
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
  creatorsPerRestaurant: benchmarked({
    value: 4,
    unit: 'creators',
    label: 'Creators needed per restaurant',
    source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)',
    note: 'Stated there as a 3-5 range; 4 is the midpoint.',
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
} satisfies Record<string, Assumption<number>>;

export const UNIT_ECONOMICS = {
  restaurantCacLow: benchmarked({ value: 500, unit: 'USD', label: 'Restaurant acquisition cost, low', source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)' }),
  restaurantCacHigh: benchmarked({ value: 1500, unit: 'USD', label: 'Restaurant acquisition cost, high', source: 'docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)' }),
  monthlyChurn: benchmarked({
    value: 0.04,
    unit: 'fraction/month',
    label: 'Monthly customer churn',
    source: 'docs/PROJECT_CONTEXT.md (section 3, 2025 SMB SaaS benchmark 3-5%/month)',
    note: 'The kill-switch trips above 6%/month.',
  }),
  stripePctFee: benchmarked({ value: 0.029, unit: 'fraction', label: 'Stripe percentage fee', source: 'https://stripe.com/pricing' }),
  stripeFixedFee: benchmarked({ value: 0.30, unit: 'USD/transaction', label: 'Stripe fixed fee', source: 'https://stripe.com/pricing' }),
  aiCostPerCustomerMonth: benchmarked({
    value: 1.20,
    unit: 'USD/month',
    label: 'AI cost per customer per month',
    source: 'docs/DragonCandy_Infrastructure_Capacity_Report.md (section 4)',
  }),
  infraCostPerCustomerMonth: benchmarked({
    value: 0.20,
    unit: 'USD/month',
    label: 'Infrastructure cost per customer per month',
    source: 'docs/DragonCandy_Infrastructure_Capacity_Report.md (section 5)',
  }),
} satisfies Record<string, Assumption<number>>;

/** Flat view of everything, for staleness checking and document generation. */
export const REGISTER: Readonly<Record<string, Assumption<number>>> = {
  ...Object.fromEntries(Object.entries(PRICING).map(([k, v]) => [`price_${k}`, v])),
  ...Object.fromEntries(Object.entries(TIER_TAKE_RATES).map(([k, v]) => [`takeRate_${k}`, v])),
  ...OPERATING,
  ...MARKET,
  ...UNIT_ECONOMICS,
};
