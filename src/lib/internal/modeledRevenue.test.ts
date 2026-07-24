import { describe, it, expect } from 'vitest';
import {
  computeModeledRevenue,
  ASSUMED_AVG_CAMPAIGN_VALUE_USD,
  FREE_TIER_TAKE_RATE,
} from './modeledRevenue';

describe('computeModeledRevenue', () => {
  it('applies the default assumptions: GMV = campaigns × $250, revenue = GMV × 10%', () => {
    const m = computeModeledRevenue(100);
    expect(m.projectedGmvUsd).toBe(100 * ASSUMED_AVG_CAMPAIGN_VALUE_USD); // 25_000
    expect(m.modeledRevenueUsd).toBe(100 * ASSUMED_AVG_CAMPAIGN_VALUE_USD * FREE_TIER_TAKE_RATE); // 2_500
    expect(m.avgCampaignValueUsd).toBe(ASSUMED_AVG_CAMPAIGN_VALUE_USD);
    expect(m.takeRate).toBe(FREE_TIER_TAKE_RATE);
  });

  it('echoes back the assumptions it used, so the UI can render from one source', () => {
    const m = computeModeledRevenue(10, 400, 0.07);
    expect(m.avgCampaignValueUsd).toBe(400);
    expect(m.takeRate).toBe(0.07);
    expect(m.projectedGmvUsd).toBe(4_000);
    expect(m.modeledRevenueUsd).toBeCloseTo(280, 10);
  });

  it('is zero at zero campaigns', () => {
    expect(computeModeledRevenue(0)).toMatchObject({ projectedGmvUsd: 0, modeledRevenueUsd: 0 });
  });

  it('clamps a negative campaign count to zero (never a negative projection)', () => {
    expect(computeModeledRevenue(-5)).toMatchObject({ projectedGmvUsd: 0, modeledRevenueUsd: 0 });
  });

  it('treats NaN as zero rather than propagating it', () => {
    const m = computeModeledRevenue(Number.NaN);
    expect(m.projectedGmvUsd).toBe(0);
    expect(m.modeledRevenueUsd).toBe(0);
  });
});
