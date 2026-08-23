import { describe, it, expect } from 'vitest';
import { isLiquid, monthsToLiquidity, businessStepTable, LIQUIDITY_THRESHOLD } from './derive';
import type { TierMix } from './project';

const MIX: TierMix = { free: 0.3, starter: 0.4, growth: 0.25, pro: 0.05 };

describe('liquidity definition', () => {
  it('states both sides of the threshold explicitly', () => {
    expect(LIQUIDITY_THRESHOLD.minApplicantsPerCampaign).toBe(3);
    expect(LIQUIDITY_THRESHOLD.withinHours).toBe(48);
    expect(LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator).toBe(5);
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
