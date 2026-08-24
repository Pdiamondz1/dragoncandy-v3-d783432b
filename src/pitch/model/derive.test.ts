import { describe, it, expect } from 'vitest';
import {
  isLiquid,
  monthsToLiquidity,
  businessStepTable,
  threeYearTrajectory,
  unitEconomics,
  LIQUIDITY_THRESHOLD,
  POST_LAUNCH_RESPONSIVENESS_TARGET_HOURS,
} from './derive';
import type { TierMix } from './project';

const MIX: TierMix = { free: 0.3, starter: 0.4, growth: 0.25, pro: 0.05 };

describe('liquidity definition', () => {
  it('states both sides of the enforced threshold explicitly, and nothing else', () => {
    // Only these two keys exist on LIQUIDITY_THRESHOLD — no `withinHours`. A 48-hour
    // responsiveness figure was removed from this object (Codex P1, 2026-08-23): the label
    // claimed it, but isLiquid() never computed a within-hours slice, only applicants over
    // the campaign's full open window. See the comment on LIQUIDITY_THRESHOLD in derive.ts.
    expect(Object.keys(LIQUIDITY_THRESHOLD).sort()).toEqual(
      ['minApplicantsPerCampaign', 'minCampaignsVisibleToCreator'].sort(),
    );
    expect(LIQUIDITY_THRESHOLD.minApplicantsPerCampaign).toBe(3);
    expect(LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator).toBe(5);
  });

  it('keeps the 48-hour figure as a separate, clearly-unmodeled post-launch target', () => {
    // Exported independently of LIQUIDITY_THRESHOLD so it can never be read as part of the
    // pass/fail test — it's an instrumentation target to start measuring after launch, not a
    // condition this model enforces.
    expect(POST_LAUNCH_RESPONSIVENESS_TARGET_HOURS).toBe(48);
  });

  it("liquid depends on exactly the two computed conditions, nothing labeled but unmodeled", () => {
    // Flip each computed condition independently and confirm it alone controls `liquid`.
    // This is the assertion the finding asked for: the pass/fail test depends only on
    // `openCampaigns` and `applicantsPerCampaign` — never on an hours-since-posted figure
    // that isn't tracked anywhere in this module.
    const barelyLiquid = isLiquid(10, 40); // 11.667 open, 3.2 applicants/campaign — both pass.
    expect(barelyLiquid.liquid).toBe(true);

    const tooFewOpen = isLiquid(1, 4); // 1.167 open (fails), applicants would pass alone.
    expect(tooFewOpen.liquid).toBe(false);

    const tooFewApplicants = isLiquid(10, 20); // 11.667 open (passes), 1.6 applicants (fails).
    expect(tooFewApplicants.liquid).toBe(false);
  });
});

describe('isLiquid', () => {
  it('is not liquid when too few campaigns are open to fill a creator screen', () => {
    // 1 restaurant x 2.5 campaigns/mo x (14/30) = 1.17 open, below the 5 required.
    const state = isLiquid(1, 4);
    expect(state.openCampaigns).toBeCloseTo(1.1667, 3);
    expect(state.liquid).toBe(false);
  });

  it('is liquid once both sides clear', () => {
    // 10 restaurants -> 25 campaigns/mo -> 11.67 open (>= 5).
    // 40 creators x 2 applications / 25 campaigns = 3.2 applicants each (>= 3).
    const state = isLiquid(10, 40);
    expect(state.openCampaigns).toBeCloseTo(11.667, 3);
    expect(state.applicantsPerCampaign).toBeCloseTo(3.2, 10);
    expect(state.liquid).toBe(true);
  });

  it('is NOT liquid when creators lag, even with plenty of restaurants', () => {
    // The case that proves creators are independent: same 10 restaurants, half the creators.
    // 20 creators x 2 / 25 campaigns = 1.6 applicants, below the 3 required.
    const state = isLiquid(10, 20);
    expect(state.openCampaigns).toBeGreaterThanOrEqual(5);
    expect(state.applicantsPerCampaign).toBeCloseTo(1.6, 10);
    expect(state.liquid).toBe(false);
  });

  it('reports an empty market as not liquid without dividing by zero', () => {
    const state = isLiquid(0, 0);
    expect(state.liquid).toBe(false);
    expect(Number.isFinite(state.applicantsPerCampaign)).toBe(true);
  });
});

describe('monthsToLiquidity', () => {
  it('returns the first month both conditions hold', () => {
    // 2 restaurants + 8 creators per month. Applicant side holds from month 1 (ratio 4).
    // Open campaigns = 2m x 2.5 x (14/30) = 2.333m; needs >= 5, so m = 3.
    expect(monthsToLiquidity({ restaurantsPerMonth: 2, creatorsPerMonth: 8, horizonMonths: 24 })).toBe(3);
  });

  it('returns null when creator supply never catches up, however long we wait', () => {
    // Ratio of 2 creators per restaurant: applicants stay at 1.6, below 3, at every scale.
    // This is the answer the model must be able to give — "more restaurants will not fix it".
    expect(monthsToLiquidity({ restaurantsPerMonth: 2, creatorsPerMonth: 4, horizonMonths: 36 })).toBeNull();
  });

  it('returns null when nothing is being acquired at all', () => {
    expect(monthsToLiquidity({ restaurantsPerMonth: 0, creatorsPerMonth: 0, horizonMonths: 24 })).toBeNull();
  });

  it('rejects a negative acquisition rate rather than looping forever', () => {
    expect(() => monthsToLiquidity({ restaurantsPerMonth: -1, creatorsPerMonth: 4, horizonMonths: 24 })).toThrow(/negative/);
    expect(() => monthsToLiquidity({ restaurantsPerMonth: 2, creatorsPerMonth: -4, horizonMonths: 24 })).toThrow(/negative/);
  });
});

describe('businessStepTable', () => {
  it('returns one row per requested step, in order, carrying revenue and EBITDA', () => {
    const rows = businessStepTable([100, 1000, 10000], MIX);
    expect(rows.map((r) => r.businesses)).toEqual([100, 1000, 10000]);
    expect(rows[0].annualRevenue).toBeCloseTo(rows[0].monthlyRevenue * 12, 10);
    expect(rows[1].monthlyRevenue).toBeGreaterThan(rows[0].monthlyRevenue);
  });
});

describe('unitEconomics', () => {
  // Hand-derived, not asserted against the implementation's own formula (same discipline as the
  // Year 1 EBITDA pin above). At MIX = {free:.3, starter:.4, growth:.25, pro:.05}:
  //   blendedSubscription = .4*149 + .25*449 + .05*899 = 216.8
  //   blendedTakeRate     = .3*.10 + .4*.07 + .25*.05 + .05*.03 = 0.072
  //   avgCampaignValue    = (75+150)/2 * 3 = 337.5; gmv/business = 2.5*337.5 = 843.75
  //   totalRevenue/business  = 216.8 + 843.75*0.072 = 216.8 + 60.75 = 277.55
  //   stripeCost/business    = 843.75*0.029 + 2.5*0.30 = 24.46875 + 0.75 = 25.21875
  //   serveCost/business     = 1.20 + 0.20 = 1.40
  //   grossProfit/business   = 277.55 - (25.21875 + 1.40) = 250.93125
  //   lifetime = 1/0.04 = 25 months; ltv = 250.93125 * 25 = 6273.28125
  //   ltv:cac @ $500  = 12.5465625 (~12.5:1); @ $1500 = 4.1821875 (~4.2:1)
  //   payback @ $500  = 1.9925776... months; @ $1500  = 5.9777329... months (~6.0)
  it('pins gross profit, LTV, LTV:CAC and CAC payback to independently hand-derived figures', () => {
    const u = unitEconomics(MIX);
    expect(u.grossProfitPerBusinessPerMonth).toBeCloseTo(250.93125, 6);
    expect(u.customerLifetimeMonths).toBe(25);
    expect(u.ltv).toBeCloseTo(6273.28125, 6);
    expect(u.ltvToCacAtCacLow).toBeCloseTo(12.5465625, 6);
    expect(u.ltvToCacAtCacHigh).toBeCloseTo(4.1821875, 6);
    expect(u.cacPaybackMonthsAtCacLow).toBeCloseTo(1.9925776, 5);
    expect(u.cacPaybackMonthsAtCacHigh).toBeCloseTo(5.9777329, 5);
  });

  it('clears both kill-switch guardrails from PROJECT_CONTEXT.md section 3 at both ends of the CAC band', () => {
    const u = unitEconomics(MIX);
    // LTV:CAC >= 2:1
    expect(u.ltvToCacAtCacLow).toBeGreaterThanOrEqual(2);
    expect(u.ltvToCacAtCacHigh).toBeGreaterThanOrEqual(2);
    // CAC payback <= 12 months
    expect(u.cacPaybackMonthsAtCacLow).toBeLessThanOrEqual(12);
    expect(u.cacPaybackMonthsAtCacHigh).toBeLessThanOrEqual(12);
  });
});

describe('threeYearTrajectory', () => {
  it('returns one row per year, 1 through 3, in order', () => {
    const rows = threeYearTrajectory();
    expect(rows.map((r) => r.year)).toEqual([1, 2, 3]);
  });

  // Pinned to hardcoded literals rather than recomputed from the register, on purpose --
  // Task 3 found and fixed a test that re-derived the implementation's own subtraction instead
  // of asserting an independently-known answer. revenueLow=300000, totalCostHigh=830000 =>
  // ebitdaLow=-530000; revenueHigh=600000, totalCostLow=590000 => ebitdaHigh=10000.
  it('pins the Year 1 EBITDA band to -530,000 .. +10,000', () => {
    const [year1] = threeYearTrajectory();
    expect(year1.revenueLow).toBe(300000);
    expect(year1.revenueHigh).toBe(600000);
    expect(year1.totalCostLow).toBe(590000);
    expect(year1.totalCostHigh).toBe(830000);
    expect(year1.ebitdaLow).toBe(-530000);
    expect(year1.ebitdaHigh).toBe(10000);
  });

  // The source document's own summary calls Year 1 "Breakeven to slight loss" -- on its own
  // line-item costs that isn't true, a $530K loss on $300K of revenue is not slight. Pinned so
  // the fact stays visible rather than becoming a pleasant assumption nobody checks.
  it('shows Year 1 downside is a real loss, not a slight one', () => {
    const [year1] = threeYearTrajectory();
    expect(year1.ebitdaLow).toBeLessThan(0);
  });

  it('pairs low revenue with high cost for the downside, and high revenue with low cost for the upside', () => {
    // Year 1 is already pinned to literals above; this checks years 2 and 3 stay internally
    // consistent without re-deriving the Year 1 answer a second time.
    const [, year2, year3] = threeYearTrajectory();
    expect(year2.ebitdaLow).toBe(year2.revenueLow - year2.totalCostHigh);
    expect(year2.ebitdaHigh).toBe(year2.revenueHigh - year2.totalCostLow);
    expect(year3.ebitdaLow).toBe(year3.revenueLow - year3.totalCostHigh);
    expect(year3.ebitdaHigh).toBe(year3.revenueHigh - year3.totalCostLow);
  });
});
