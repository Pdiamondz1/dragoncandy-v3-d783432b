import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRICING, TIER_TAKE_RATES, MARKET, UNIT_ECONOMICS } from './assumptions';
import { LIQUIDITY_THRESHOLD, threeYearTrajectory } from './derive';

/**
 * `.claude/scratch/investor-model.html` is a hand-built interactive artifact that re-declares
 * every register constant as a JS literal and re-implements `project.ts`'s arithmetic by hand,
 * rather than importing this module. `.claude/` is excluded from both lint and typecheck
 * (eslint.config.js, tsconfig.app.json), and nothing else compares the two — so nothing catches
 * drift. Change `campaignOpenDays` in the register and the generated document updates while the
 * artifact silently keeps stale numbers.
 *
 * This is a GREP-LEVEL guard, not a real binding: it can only confirm the literal numbers the
 * artifact was built from still appear in the file, not that its formulas are still correct. That
 * is still far better than the current nothing.
 *
 * If this fails: the register moved and the artifact was not updated to match. Edit
 * `.claude/scratch/investor-model.html` by hand (it is not generated — there is no `npm run`
 * target for it) so the failing literal below appears again, then republish it via the Artifact
 * tool at the SAME file path so the existing published URL updates in place.
 */
const ARTIFACT_PATH = join(process.cwd(), '.claude/scratch/investor-model.html');

function readArtifact(): string {
  return readFileSync(ARTIFACT_PATH, 'utf8');
}

// The artifact writes the two Stripe-adjacent fees and the two per-customer serve costs with a
// fixed 2 decimal places (0.30, not 0.3; 1.20, not 1.2) even though the register stores them as
// plain numbers. Match that formatting rather than the register's raw `.toString()`.
const money2 = (n: number) => n.toFixed(2);
const pctFrac = (n: number) => Math.round(n * 100);

describe('the interactive artifact is bound to the register (grep-level — see file header)', () => {
  const html = readArtifact();

  const checks: ReadonlyArray<readonly [key: string, expected: string]> = [
    [
      'price_free / price_starter / price_growth / price_pro',
      `var TIER_PRICES = { free: ${PRICING.free.value}, starter: ${PRICING.starter.value}, growth: ${PRICING.growth.value}, pro: ${PRICING.pro.value} };`,
    ],
    [
      'takeRate_free / takeRate_starter / takeRate_growth / takeRate_pro',
      `var TIER_RATES = { free: ${money2(TIER_TAKE_RATES.free.value)}, starter: ${money2(TIER_TAKE_RATES.starter.value)}, growth: ${money2(TIER_TAKE_RATES.growth.value)}, pro: ${money2(TIER_TAKE_RATES.pro.value)} };`,
    ],
    [
      'campaignPriceStandardLow / campaignPriceStandardHigh',
      `((${MARKET.campaignPriceStandardLow.value} + ${MARKET.campaignPriceStandardHigh.value}) / 2)`,
    ],
    ['deliverablesPerCampaign', `deliverables: ${MARKET.deliverablesPerCampaign.value},`],
    ['campaignsPerRestaurantPerMonth', `campaigns: ${MARKET.campaignsPerRestaurantPerMonth.value},`],
    ['creatorsPerRestaurant', `creators: ${MARKET.creatorsPerRestaurant.value},`],
    ['stripePctFee', `gmv * ${UNIT_ECONOMICS.stripePctFee.value}`],
    ['stripeFixedFee', `campaigns * ${money2(UNIT_ECONOMICS.stripeFixedFee.value)}`],
    [
      'aiCostPerCustomerMonth / infraCostPerCustomerMonth',
      `restaurants * (${money2(UNIT_ECONOMICS.aiCostPerCustomerMonth.value)} + ${money2(UNIT_ECONOMICS.infraCostPerCustomerMonth.value)})`,
    ],
    ['campaignOpenDays', `campaigns * (${MARKET.campaignOpenDays.value} / 30)`],
    ['LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator', `openCampaigns >= ${LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator}`],
    ['LIQUIDITY_THRESHOLD.minApplicantsPerCampaign', `applicantsPerCampaign >= ${LIQUIDITY_THRESHOLD.minApplicantsPerCampaign}`],
    ['applicationsPerCreatorPerMonth', `(creators * ${MARKET.applicationsPerCreatorPerMonth.value}) / campaigns`],
    [
      'tierMixFree / tierMixStarter / tierMixGrowth / tierMixPro',
      `mix: { free: ${pctFrac(MARKET.tierMixFree.value)}, starter: ${pctFrac(MARKET.tierMixStarter.value)}, growth: ${pctFrac(MARKET.tierMixGrowth.value)}, pro: ${pctFrac(MARKET.tierMixPro.value)} },`,
    ],
  ];

  it.each(checks)('%s appears in the artifact with its current register value', (key, expected) => {
    expect(
      html.includes(expected),
      `"${key}" drifted: the artifact no longer contains "${expected}". Update ` +
        `.claude/scratch/investor-model.html by hand to match src/pitch/model/assumptions.ts, then ` +
        `republish it via the Artifact tool at the same file path.`,
    ).toBe(true);
  });

  it('carries the same three-year trajectory bands as threeYearTrajectory()', () => {
    for (const y of threeYearTrajectory()) {
      const expected = `{ year: ${y.year}, revenueLow: ${y.revenueLow}, revenueHigh: ${y.revenueHigh}, costLow: ${y.totalCostLow}, costHigh: ${y.totalCostHigh} }`;
      expect(
        html.includes(expected),
        `Year ${y.year} trajectory drifted: the artifact no longer contains "${expected}". Update ` +
          `.claude/scratch/investor-model.html's TRAJECTORY array and republish.`,
      ).toBe(true);
    }
  });
});
