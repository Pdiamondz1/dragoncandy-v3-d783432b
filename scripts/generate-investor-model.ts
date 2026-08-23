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
import { REGISTER, MARKET } from '../src/pitch/model/assumptions';
import { findStale, MAX_MEASURED_AGE_DAYS } from '../src/pitch/model/types';
import { avgCampaignValue, type TierMix } from '../src/pitch/model/project';
import {
  businessStepTable,
  isLiquid,
  monthsToLiquidity,
  LIQUIDITY_THRESHOLD,
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
const MIX: TierMix = { free: 0.3, starter: 0.4, growth: 0.25, pro: 0.05 };

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
lines.push(`Liquidity means a posted campaign draws at least ${LIQUIDITY_THRESHOLD.minApplicantsPerCampaign} applicants within ${LIQUIDITY_THRESHOLD.withinHours} hours, and a creator opening the app sees at least ${LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator} campaigns in range. Both are computable from our own schema the day we launch.`);
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

lines.push('## Scale — what 100 / 1,000 / 10,000 businesses mean');
lines.push('');
lines.push(`Average campaign value is ${usd(avgCampaignValue())}, derived from the app's own per-deliverable price bands.`);
lines.push('');
lines.push('This table answers a different question from the Three-year trajectory below: it is');
lines.push('steady-state economics AT a given business count, computed for one month and annualized —');
lines.push('not a calendar-time projection of when we reach that count. The Year 3 trajectory band');
lines.push('($7–12M) and the 10,000-business annual figure here (~$33M) are not in tension; they answer');
lines.push('"what does the business look like at this size" versus "what do we expect by this date."');
lines.push('');
lines.push('| Businesses | Creators | Monthly campaign volume | Monthly revenue | Annual revenue | Gross margin |');
lines.push('|---:|---:|---:|---:|---:|---:|');
for (const row of businessStepTable([100, 1000, 10000], MIX)) {
  lines.push(`| ${row.businesses.toLocaleString('en-US')} | ${row.creators.toLocaleString('en-US')} | ${usd(row.monthlyGmv)} | ${usd(row.monthlyRevenue)} | ${usd(row.annualRevenue)} | ${pct(row.grossMarginPct)} |`);
}
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
