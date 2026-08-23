import { describe, it, expect } from 'vitest';
import { blendedSubscription, blendedTakeRate, avgCampaignValue, projectMonth, type TierMix } from './project';
import { OPERATING, UNIT_ECONOMICS } from './assumptions';

const ALL_GROWTH: TierMix = { free: 0, starter: 0, growth: 1, pro: 0 };
const HALF_AND_HALF: TierMix = { free: 0, starter: 0.5, growth: 0.5, pro: 0 };

describe('tier blending', () => {
  it('returns the tier price outright when everyone is on one tier', () => {
    expect(blendedSubscription(ALL_GROWTH)).toBe(449);
    expect(blendedTakeRate(ALL_GROWTH)).toBe(0.05);
  });

  it('weights by mix', () => {
    expect(blendedSubscription(HALF_AND_HALF)).toBeCloseTo(299, 10);
    expect(blendedTakeRate(HALF_AND_HALF)).toBeCloseTo(0.06, 10);
  });

  it('rejects a mix that does not sum to 1, because a silent 0.9 understates revenue by 10%', () => {
    expect(() => blendedSubscription({ free: 0.5, starter: 0.2, growth: 0.2, pro: 0 })).toThrow(/sum to 1/);
  });
});

describe('avgCampaignValue', () => {
  it('derives from the app price bands rather than an assumed number', () => {
    // (75 + 150) / 2 = 112.5 per deliverable, 3 deliverables.
    expect(avgCampaignValue()).toBeCloseTo(337.5, 10);
  });
});

describe('projectMonth', () => {
  const base = { month: 12, restaurants: 100, mix: ALL_GROWTH };

  it('computes revenue from subscriptions plus take rate on campaign volume', () => {
    const r = projectMonth(base);
    expect(r.subscriptionRevenue).toBeCloseTo(100 * 449, 10);
    // 100 restaurants x 2.5 campaigns x 337.5 = 84,375 GMV
    expect(r.gmvDollars).toBeCloseTo(84_375, 10);
    expect(r.takeRateRevenue).toBeCloseTo(84_375 * 0.05, 10);
    expect(r.totalRevenue).toBeCloseTo(r.subscriptionRevenue + r.takeRateRevenue, 10);
  });

  it('keeps gross profit and margin consistent with revenue and cost', () => {
    const r = projectMonth(base);
    expect(r.grossProfit).toBeCloseTo(r.totalRevenue - r.costOfRevenue, 10);
    expect(r.grossMarginPct).toBeCloseTo((r.grossProfit / r.totalRevenue) * 100, 10);
  });

  it('subtracts operating expense to reach EBITDA', () => {
    const r = projectMonth({ ...base, operatingExpense: 50_000 });
    expect(r.ebitda).toBeCloseTo(r.grossProfit - 50_000, 10);
  });

  it('returns all zeros and a zero margin at zero restaurants, without dividing by zero', () => {
    const r = projectMonth({ ...base, restaurants: 0 });
    expect(r.totalRevenue).toBe(0);
    expect(r.grossMarginPct).toBe(0);
    expect(Number.isNaN(r.grossMarginPct)).toBe(false);
  });

  it('derives creator count from the restaurant count', () => {
    expect(projectMonth(base).creators).toBe(400);
  });

  it('pins cost of revenue to an independently derived figure, not to its own formula', () => {
    // Stripe 84,375 x 0.029 + 250 campaigns x $0.30 = 2,521.875
    // Serve   100 x ($1.20 AI + $0.20 infra)         =   140
    const r = projectMonth(base);
    expect(r.costOfRevenue).toBeCloseTo(2_661.875, 6);
    expect(r.grossProfit).toBeCloseTo(46_456.875, 6);
  });
});

describe('the AI cost cap', () => {
  const MIX: TierMix = { free: 0.3, starter: 0.4, growth: 0.25, pro: 0.05 };

  it.each([10, 100, 1_000, 10_000])(
    'keeps AI spend under the 15%% revenue cap at %i restaurants',
    (restaurants) => {
      const m = projectMonth({ month: 0, restaurants, mix: MIX });
      const aiSpend = restaurants * UNIT_ECONOMICS.aiCostPerCustomerMonth.value;
      const capDollars = m.totalRevenue * OPERATING.aiCostCapPctOfRevenue.value;
      expect(
        aiSpend,
        `AI spend $${aiSpend.toFixed(2)} exceeds the cap $${capDollars.toFixed(2)} at ${restaurants} restaurants`,
      ).toBeLessThanOrEqual(capDollars);
    },
  );
});
