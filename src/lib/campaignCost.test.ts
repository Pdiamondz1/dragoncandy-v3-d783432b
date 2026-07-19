import { describe, it, expect } from 'vitest';
import { computeCampaignCost } from './campaignUtils';
import { TIER_LIMITS } from '@/types/campaignMedia';

describe('computeCampaignCost', () => {
  // create-campaign-escrow charges `fixed_price + delivery_fee`. Whatever the UI shows
  // as the total has to equal that, or the business is quoted one number and billed
  // another. This is the invariant the edit page used to violate.
  it('totals to what create-campaign-escrow actually charges', () => {
    for (const [tier, config] of Object.entries(TIER_LIMITS)) {
      const { budgetTotal } = computeCampaignCost(
        500,
        tier as keyof typeof TIER_LIMITS,
        4
      );
      const escrowCharge = 500 + config.fee; // fixed_price + delivery_fee
      expect(budgetTotal).toBe(escrowCharge);
    }
  });

  it('treats fixed_price as the base, never as an inclusive total', () => {
    const { baseCostPerDeliverable, premiumAmount, budgetTotal } = computeCampaignCost(
      500,
      'dragondash',
      4
    );

    expect(baseCostPerDeliverable).toBe(125); // 500 / 4 — premium NOT carved out
    expect(premiumAmount).toBe(75);
    expect(budgetTotal).toBe(575);
  });

  it('adds no premium for standard', () => {
    expect(computeCampaignCost(500, 'standard', 4)).toEqual({
      baseCostPerDeliverable: 125,
      premiumAmount: 0,
      budgetTotal: 500,
    });
  });

  it('survives a zero deliverable count without dividing by zero', () => {
    const cost = computeCampaignCost(500, 'express', 0);
    expect(cost.baseCostPerDeliverable).toBe(0);
    expect(cost.budgetTotal).toBe(525);
  });

  it('falls back to no premium for an unknown tier', () => {
    expect(computeCampaignCost(500, null, 4).budgetTotal).toBe(500);
  });
});
