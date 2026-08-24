#!/usr/bin/env npx tsx
/**
 * Generate docs/DragonCandy_Investor_Model.md from src/pitch/model/.
 *
 * The document is OUTPUT, never input. Editing it by hand is pointless: the next run
 * overwrites it. This exists because the prior investor numbers lived in prose, and prose
 * cannot fail — docs/DragonCandy_Capital_Raise_Cost_Model.md claimed a $390/mo burn for two
 * months after it became $572.
 *
 * The confidential sections (budget, raise, use of funds) are included ONLY with
 * --confidential, so the default output is safe to share.
 *
 * Usage: npm run model:doc [-- --confidential]
 * Exit codes: 0 written; 1 a measured input is stale (fix the register, do not bypass).
 */
import { writeFileSync } from 'node:fs';
import { REGISTER, MARKET, UNIT_ECONOMICS, OPERATING } from '../src/pitch/model/assumptions';
import { findStale, MAX_MEASURED_AGE_DAYS } from '../src/pitch/model/types';
import { avgCampaignValue, projectMonth, type TierMix } from '../src/pitch/model/project';
import {
  businessStepTable,
  isLiquid,
  monthsToLiquidity,
  unitEconomics,
  LIQUIDITY_THRESHOLD,
  POST_LAUNCH_RESPONSIVENESS_TARGET_HOURS,
  threeYearTrajectory,
} from '../src/pitch/model/derive';
import {
  PRE_SEED_BUDGET,
  PRE_SEED_HORIZON_MONTHS,
  budgetTotal,
  requiredRaise,
  buildFundsAllocation,
  USE_OF_FUNDS_SPLIT,
} from '../src/pitch/model/confidential';

const confidential = process.argv.includes('--confidential');
const OUT = 'docs/DragonCandy_Investor_Model.md';
// Built from the register, not hardcoded — this constant used to be an untagged literal with no
// provenance and no appearance in the document, despite driving 78% of headline revenue at 100
// businesses ($21,680 of $27,755). See MARKET.tierMixFree/Starter/Growth/Pro in assumptions.ts.
const MIX: TierMix = {
  free: MARKET.tierMixFree.value,
  starter: MARKET.tierMixStarter.value,
  growth: MARKET.tierMixGrowth.value,
  pro: MARKET.tierMixPro.value,
};

const stale = findStale(REGISTER, new Date(), MAX_MEASURED_AGE_DAYS);
if (stale.length > 0) {
  console.error(`Refusing to generate: ${stale.length} measured input(s) are stale.`);
  for (const s of stale) console.error(`  ${s.key} — ${s.ageDays} days old — re-read: ${s.source}`);
  process.exit(1);
}

const usd = (n: number) => {
  const rounded = Math.round(n);
  return rounded < 0 ? `-$${Math.abs(rounded).toLocaleString('en-US')}` : `$${rounded.toLocaleString('en-US')}`;
};
const pct = (n: number) => `${n.toFixed(1)}%`;
/**
 * Escape a raw `|` as `\|` before it goes into a markdown table cell. A `|` inside
 * backticks inside a table cell is NOT protected by GFM — it still splits the row into
 * extra columns, which is exactly what six of the assumption rows' `source` strings did
 * (they contain literal pipes, e.g. shell pipelines and the burn-cost breakdown).
 * Applied to every string field emitted into a table cell — label, unit, source,
 * provenance — not just source, so a future label containing a pipe can't reintroduce
 * this bug.
 */
const cell = (s: string) => s.replace(/\|/g, '\\|');

const lines: string[] = [];
lines.push('# DragonCandy — Investor Model');
lines.push('');
lines.push('> **Generated file — do not edit.** Produced by `npm run model:doc` from');
lines.push('> `src/pitch/model/`. Change a number there, not here.');
lines.push('');
lines.push(confidential ? '> **CONFIDENTIAL — includes the budget and the raise.**' : '> Public-safe: budget and raise omitted. Regenerate with `--confidential` to include them.');
lines.push('');
lines.push('> **The live deck at `/pitch` is superseded by this model on the ask.** `src/pitch/slides/slides.tsx`');
lines.push('> still shows the earlier priced-seed framing — "~$3M seed", "Raising $2.5–3.5M · ~$12–15M');
lines.push('> post-money" — computed before this register existed. This model derives a materially smaller');
lines.push(confidential
  ? '> required raise — see "The round" below. Rebuilding the deck is out of scope here (a later plan'
  : '> required raise (regenerate with `--confidential` for the figure). Rebuilding the deck is out of scope here (a later plan');
lines.push('> owns it); until then, treat this document as the current number and the deck as pending an');
lines.push('> update.');
lines.push('');

lines.push('## Assumptions');
lines.push('');
lines.push('| Input | Value | Unit | Provenance | Source | Read |');
lines.push('|---|---:|---|---|---|---|');
for (const [key, a] of Object.entries(REGISTER)) {
  const asOf = a.provenance === 'MEASURED' ? a.asOf : '—';
  lines.push(`| ${cell(a.label)} (\`${key}\`) | ${a.value} | ${cell(a.unit)} | ${cell(a.provenance)} | \`${cell(a.source)}\` | ${asOf} |`);
}
lines.push('');

lines.push('## Marketplace liquidity — Hoboken');
lines.push('');
lines.push(`Liquidity means a posted campaign draws at least ${LIQUIDITY_THRESHOLD.minApplicantsPerCampaign} applicants over its open window (${MARKET.campaignOpenDays.value} days), and a creator opening the app sees at least ${LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator} campaigns in range. Both are computable from our own schema the day we launch. A ${POST_LAUNCH_RESPONSIVENESS_TARGET_HOURS}-hour responsiveness target is a separate, real goal — but it is not part of this liquidity test, because we have no arrival-curve data yet to compute it honestly; we'll start measuring it once real applicant timestamps exist post-launch.`);
lines.push('');
lines.push('Creator supply is tracked separately from restaurant supply, because a shortage on');
lines.push('either side alone stops the market working.');
lines.push('');
lines.push('| Restaurants | Creators | Campaigns open now | Applicants per campaign | Liquid |');
lines.push('|---:|---:|---:|---:|---|');
const RATIO = MARKET.creatorsPerRestaurant.value;
for (const n of [1, 5, 10, 25, 50]) {
  const s = isLiquid(n, n * RATIO);
  lines.push(`| ${n} | ${s.creators} | ${s.openCampaigns.toFixed(1)} | ${s.applicantsPerCampaign.toFixed(1)} | ${s.liquid ? 'yes' : 'no'} |`);
}
lines.push('');
lines.push(`"Applicants per campaign" is constant in this table (${isLiquid(1, RATIO).applicantsPerCampaign.toFixed(1)} at every row) because every row here holds creators at the fixed ${RATIO}:1 target ratio to restaurants — it depends on that ratio, not on scale. That is not a spreadsheet bug. The section below is where the ratio varies and the number actually moves.`);
lines.push('');
lines.push(`At the target ratio of ${RATIO} creators per restaurant:`);
lines.push('');
for (const rate of [1, 2, 4]) {
  const m = monthsToLiquidity({ restaurantsPerMonth: rate, creatorsPerMonth: rate * RATIO, horizonMonths: 36 });
  lines.push(`- ${rate} new restaurant(s) and ${rate * RATIO} new creators per month: liquid in **${m === null ? 'not within 36 months' : `month ${m}`}**.`);
}
lines.push('');
lines.push('If creator recruitment lags the target ratio, the market does not become liquid at any');
lines.push('restaurant count — more restaurants make the shortage worse, not better:');
lines.push('');
for (const ratio of [2, 3, RATIO]) {
  const m = monthsToLiquidity({ restaurantsPerMonth: 2, creatorsPerMonth: 2 * ratio, horizonMonths: 36 });
  lines.push(`- 2 restaurants/month at ${ratio} creators each: **${m === null ? 'never liquid within 36 months' : `liquid in month ${m}`}**.`);
}
lines.push('');
lines.push('### How much headroom the headline number has');
lines.push('');
const appsTip =
  (LIQUIDITY_THRESHOLD.minApplicantsPerCampaign * MARKET.campaignsPerRestaurantPerMonth.value) / RATIO;
const campaignsTip =
  (RATIO * MARKET.applicationsPerCreatorPerMonth.value) / LIQUIDITY_THRESHOLD.minApplicantsPerCampaign;
const headlineApplicants = isLiquid(1, RATIO).applicantsPerCampaign;
// Headroom as % of the achieved value, not the threshold: how far the achieved figure could
// drop, as a share of itself, before hitting the 3.0 floor — 0.2 of 3.2, not 0.2 of 3.0.
const headroomPct = ((headlineApplicants - LIQUIDITY_THRESHOLD.minApplicantsPerCampaign) / headlineApplicants) * 100;
lines.push(`At the target ${RATIO}:1 creator-to-restaurant ratio, "applicants per campaign" (${headlineApplicants.toFixed(1)}) clears the ${LIQUIDITY_THRESHOLD.minApplicantsPerCampaign}.0 threshold by only ${headroomPct.toFixed(2)}% headroom — set entirely by two MODELED constants sourced to this same file (\`applicationsPerCreatorPerMonth\` and \`campaignsPerRestaurantPerMonth\`). The tipping points, moving one at a time and holding the other fixed:`);
lines.push('');
lines.push(`- Applications per creator per month below **~${appsTip.toFixed(2)}** (currently ${MARKET.applicationsPerCreatorPerMonth.value.toFixed(1)}): Hoboken never becomes liquid, at any restaurant count.`);
lines.push(`- Campaigns per restaurant per month above **~${campaignsTip.toFixed(2)}** (currently ${MARKET.campaignsPerRestaurantPerMonth.value.toFixed(1)}): same failure — more campaigns per restaurant dilutes applicants per campaign faster than restaurant count can compensate.`);
lines.push('');
lines.push('Both hold everything else fixed at the target ratio. This is a statement about how thin the');
lines.push('headline margin is, not a prediction that either constant will move.');
lines.push('');

lines.push('## Scale — what 100 / 1,000 / 10,000 businesses mean');
lines.push('');
lines.push(`Paid-conversion mix (MODELED, registered as \`tierMixFree/Starter/Growth/Pro\`): ${pct(MIX.free * 100)} free, ${pct(MIX.starter * 100)} starter, ${pct(MIX.growth * 100)} growth, ${pct(MIX.pro * 100)} pro. This asserts 70% paid conversion from a base of zero paying customers today — every revenue figure below is downstream of it.`);
lines.push('');
lines.push(`Average campaign value is ${usd(avgCampaignValue())}, derived from the app's own per-deliverable price bands.`);
lines.push('');
lines.push('This table answers a different question from the Three-year trajectory below: it is');
lines.push('steady-state economics AT a given business count, computed for one month and annualized —');
lines.push('not a calendar-time projection of when we reach that count. The Year 3 trajectory band');
lines.push('($7–12M) and the 10,000-business annual figure here (~$33M) are not in tension; they answer');
lines.push('"what does the business look like at this size" versus "what do we expect by this date."');
lines.push('');
lines.push('| Businesses | Creators | Monthly GMV | Monthly revenue | Annual revenue | Gross margin |');
lines.push('|---:|---:|---:|---:|---:|---:|');
for (const row of businessStepTable([100, 1000, 10000], MIX)) {
  lines.push(`| ${row.businesses.toLocaleString('en-US')} | ${row.creators.toLocaleString('en-US')} | ${usd(row.monthlyGmv)} | ${usd(row.monthlyRevenue)} | ${usd(row.annualRevenue)} | ${pct(row.grossMarginPct)} |`);
}
lines.push('');
lines.push(`**Monthly churn (${pct(UNIT_ECONOMICS.monthlyChurn.value * 100)}, kill-switch at 6%/mo) is not modeled anywhere in this table.** \`monthlyChurn\` sits in the`);
lines.push('assumptions register, but no formula in `project.ts` consumes it — this table and the liquidity');
lines.push('ramp above both assume zero attrition. That understates the real difficulty of reaching a given');
lines.push('business count, though it turns out not to move the headline liquidity date: applying 4%/month');
lines.push('churn to the 2-restaurants/month ramp (a continuous-decay model, stock(t) = (rate/churn) × (1 −');
lines.push('e^(−churn×t))) puts month-3 restaurant stock at about **5.65**, still comfortably above the');
lines.push('**4.29** restaurants the open-campaigns condition requires — "liquid in month 3" survives.');
lines.push('');
const row100 = projectMonth({ month: 0, restaurants: 100, mix: MIX });
const vendorFloor = OPERATING.burnMonthly.value;
const budgetedInfra = OPERATING.burnMonthly.value * 3;
const marginWithVendorFloor = ((row100.grossProfit - vendorFloor) / row100.totalRevenue) * 100;
const marginWithBudgetedInfra = ((row100.grossProfit - budgetedInfra) / row100.totalRevenue) * 100;
lines.push(`**The ${pct(row100.grossMarginPct)} gross margin at 100 businesses excludes any fixed platform cost** —`);
lines.push('`costOfRevenue` in `project.ts` is purely variable (Stripe fees on GMV plus a per-business');
lines.push(`serve cost). Layering in a fixed floor changes the picture at this scale: today's real vendor`);
lines.push(`floor (\`OPERATING.burnMonthly\`, ${usd(vendorFloor)}/mo) brings the 100-business margin to`);
lines.push(`**${pct(marginWithVendorFloor)}**; the model's own budgeted platform line in \`confidential.ts\``);
lines.push(`(\`burnMonthly × 3\` = ${usd(budgetedInfra)}/mo, sized for launch load) brings it to`);
lines.push(`**${pct(marginWithBudgetedInfra)}**. \`costOfRevenue\` itself is intentionally left unchanged —`);
lines.push('folding a fixed cost into it would ripple through every other reviewed figure in this document.');
lines.push('This gap narrows fast with scale, since a fixed cost divided by more revenue shrinks toward zero.');
lines.push('');

lines.push('## Unit economics — LTV:CAC and CAC payback');
lines.push('');
lines.push('`src/pitch/slides/slides.tsx` asserts "LTV:CAC ≥ 2:1 · CAC payback ≤ 12 mo" as guardrails, and');
lines.push('`docs/PROJECT_CONTEXT.md` section 3 makes both kill-switches. Neither was computed anywhere in');
lines.push('this model until now.');
lines.push('');
lines.push('**Restaurant CAC is a MODELED target, not an observed cost** — DragonCandy has never acquired a');
lines.push('paying customer, and the source line in the Pricing Briefing literally reads "Blended target CAC');
lines.push('for restaurants." So this section is a projection measured against a projection, not two');
lines.push('independent measurements.');
lines.push('');
const ue = unitEconomics(MIX);
lines.push(`Gross profit per business per month (at the mix above): **${usd(ue.grossProfitPerBusinessPerMonth)}**.`);
lines.push(`Expected customer lifetime at ${pct(UNIT_ECONOMICS.monthlyChurn.value * 100)}/mo churn (1 ÷ churn): **${ue.customerLifetimeMonths.toFixed(1)} months**.`);
lines.push(`Lifetime value: **${usd(ue.ltv)}**.`);
lines.push('');
lines.push('| Restaurant CAC | LTV:CAC | CAC payback |');
lines.push('|---:|---:|---:|');
lines.push(`| ${usd(UNIT_ECONOMICS.restaurantCacLow.value)} (low) | ${ue.ltvToCacAtCacLow.toFixed(1)}:1 | ${ue.cacPaybackMonthsAtCacLow.toFixed(1)} months |`);
lines.push(`| ${usd(UNIT_ECONOMICS.restaurantCacHigh.value)} (high) | ${ue.ltvToCacAtCacHigh.toFixed(1)}:1 | ${ue.cacPaybackMonthsAtCacHigh.toFixed(1)} months |`);
lines.push('');
lines.push('Both ends of the CAC band clear both guardrails.');
lines.push('');

lines.push('## Three-year trajectory');
lines.push('');
lines.push('Revenue and cost bands are our own forward projections — MODELED, not a measurement of');
lines.push('anything that exists yet. The cost figures are **all-in cost**, not operating expense');
lines.push('alone: they include Stripe fees, AI and infrastructure spend alongside payroll, marketing');
lines.push('and legal, so read the column as total cost, not "opex".');
lines.push('');
lines.push('Low EBITDA pairs low revenue with high cost (the worst case); high EBITDA pairs high');
lines.push('revenue with low cost (the best case) — pairing low revenue with low cost would understate');
lines.push('the downside.');
lines.push('');
lines.push('| Year | Revenue | Total cost | EBITDA |');
lines.push('|---:|---:|---:|---:|');
for (const y of threeYearTrajectory()) {
  lines.push(`| ${y.year} | ${usd(y.revenueLow)}–${usd(y.revenueHigh)} | ${usd(y.totalCostLow)}–${usd(y.totalCostHigh)} | ${usd(y.ebitdaLow)}–${usd(y.ebitdaHigh)} |`);
}
lines.push('');
lines.push('**Year 1 EBITDA runs from -$530,000 to +$10,000.** `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md`');
lines.push('section 7 describes Year 1 as "Breakeven to slight loss" — that is not true of a $530,000');
lines.push('loss on $300,000 of revenue at the low end of the band. State the real range, not the');
lines.push('prose summary.');
lines.push('');

if (confidential) {
  const need = budgetTotal(PRE_SEED_BUDGET, PRE_SEED_HORIZON_MONTHS);
  const endingBurn = PRE_SEED_BUDGET.reduce((s, l) => s + (l.endMonth >= PRE_SEED_HORIZON_MONTHS ? l.monthlyCost : 0), 0);
  const raise = requiredRaise({ operatingNeed: need, bufferMonths: 6, endingMonthlyBurn: endingBurn });

  lines.push('## The round');
  lines.push('');
  lines.push(`Pre-seed on a post-money SAFE. Terms (cap, discount, MFN) are a founder decision and are not modeled here.`);
  lines.push('');
  lines.push(`- ${PRE_SEED_HORIZON_MONTHS}-month operating need: **${usd(need)}**`);
  lines.push(`- Monthly burn at month ${PRE_SEED_HORIZON_MONTHS}: **${usd(endingBurn)}**`);
  lines.push(`- Six-month buffer: **${usd(raise - need)}**`);
  lines.push(`- **Required raise: ${usd(raise)}**`);
  lines.push('- Committed to date: **$0**');
  lines.push('');
  lines.push('### Budget');
  lines.push('');
  lines.push('| Line | Monthly | Months | Total |');
  lines.push('|---|---:|---|---:|');
  for (const l of PRE_SEED_BUDGET) {
    const active = Math.min(PRE_SEED_HORIZON_MONTHS, l.endMonth) - Math.max(1, l.startMonth) + 1;
    lines.push(`| ${cell(l.label)} | ${usd(l.monthlyCost)} | ${l.startMonth}–${Math.min(PRE_SEED_HORIZON_MONTHS, l.endMonth)} | ${usd(l.monthlyCost * Math.max(0, active))} |`);
  }
  lines.push(`| **Total** | | | **${usd(need)}** |`);
  lines.push('');
  lines.push('### Use of funds');
  lines.push('');
  lines.push('| Bucket | Share | Amount |');
  lines.push('|---|---:|---:|');
  for (const b of buildFundsAllocation(raise, USE_OF_FUNDS_SPLIT)) {
    lines.push(`| ${cell(b.label)} | ${pct(b.share * 100)} | ${usd(b.amount)} |`);
  }
  lines.push('');
}

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${OUT}${confidential ? ' (confidential)' : ' (public-safe)'}`);
