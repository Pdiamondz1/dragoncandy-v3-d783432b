import { describe, it, expect } from 'vitest';
import { computeTierGap, type TierThresholds } from './dragonTierGap';

// The thresholds seeded on prod.
const THRESHOLDS: TierThresholds = {
  creator: [
    { key: 'egg', min_dp: 0 },
    { key: 'scout', min_dp: 500, min_campaigns: 3 },
    { key: 'knight', min_dp: 2500, min_campaigns: 10, min_avg_rating: 4.5 },
    { key: 'master', min_dp: 10000, min_campaigns: 50, min_avg_rating: 4.8 },
    { key: 'legend', min_dp: 50000 },
  ],
  business: [
    { key: 'egg', min_dp: 0 },
    { key: 'scout', min_dp: 500, min_campaigns: 3 },
    { key: 'knight', min_dp: 2500, min_campaigns: 10 },
    { key: 'master', min_dp: 10000, min_campaigns: 50 },
    { key: 'legend', min_dp: 50000 },
  ],
};

describe('computeTierGap', () => {
  it('reports both shortfalls toward the next tier', () => {
    const gap = computeTierGap(
      'business_client',
      { balance: 350, campaignsCompleted: 1, avgRating: null, tier: 'egg' },
      THRESHOLDS,
    );
    expect(gap.nextTierKey).toBe('scout');
    expect(gap.pointsShort).toBe(150);
    expect(gap.campaignsShort).toBe(2);
    expect(gap.met).toBe(false);
  });

  it('zeroes a condition that is already satisfied', () => {
    const gap = computeTierGap(
      'business_client',
      { balance: 900, campaignsCompleted: 1, avgRating: null, tier: 'egg' },
      THRESHOLDS,
    );
    expect(gap.pointsShort).toBe(0);
    expect(gap.campaignsShort).toBe(2);
  });

  it('treats a null average rating as UNMET when a rating is required', () => {
    // Mirrors resolveTier: avgRating == null fails a min_avg_rating condition.
    const gap = computeTierGap(
      'content_creator',
      { balance: 5000, campaignsCompleted: 12, avgRating: null, tier: 'scout' },
      THRESHOLDS,
    );
    expect(gap.nextTierKey).toBe('knight');
    expect(gap.ratingRequired).toBe(4.5);
    expect(gap.hasNoRatings).toBe(true);
    expect(gap.met).toBe(false);
  });

  it('clears the rating condition once the average is high enough', () => {
    const gap = computeTierGap(
      'content_creator',
      { balance: 5000, campaignsCompleted: 12, avgRating: 4.9, tier: 'scout' },
      THRESHOLDS,
    );
    expect(gap.ratingRequired).toBeNull();
    expect(gap.hasNoRatings).toBe(false);
    expect(gap.met).toBe(true);
  });

  it('returns no next tier at the cap', () => {
    const gap = computeTierGap(
      'content_creator',
      { balance: 60000, campaignsCompleted: 80, avgRating: 5, tier: 'legend' },
      THRESHOLDS,
    );
    expect(gap.nextTierKey).toBeNull();
    expect(gap.met).toBe(true);
  });

  it('falls back to the first tier when the stored tier key is unrecognised', () => {
    const gap = computeTierGap(
      'business_client',
      { balance: 0, campaignsCompleted: 0, avgRating: null, tier: 'bogus' },
      THRESHOLDS,
    );
    expect(gap.nextTierKey).toBe('scout');
  });
});
