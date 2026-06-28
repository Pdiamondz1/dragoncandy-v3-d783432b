import { describe, it, expect } from 'vitest';
import { computeAward, resolveTier, type TierThresholds } from './dre-rules';

const PV = { 'creator.first_campaign': 1000, 'creator.post_submitted': 75 };

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

describe('computeAward', () => {
  it('looks up the configured value', () => {
    expect(computeAward('creator.first_campaign', PV)).toBe(1000);
  });
  it('returns 0 for an unknown event', () => {
    expect(computeAward('creator.nope', PV)).toBe(0);
  });
});

describe('resolveTier', () => {
  const M = (balance: number, campaignsCompleted: number, avgRating: number | null = null) =>
    ({ balance, campaignsCompleted, avgRating });

  it('defaults to egg', () => {
    expect(resolveTier('content_creator', M(0, 0), THRESHOLDS)).toBe('egg');
  });
  it('requires the milestone, not just DP (DP-met, campaigns short → stays egg)', () => {
    expect(resolveTier('content_creator', M(600, 2), THRESHOLDS)).toBe('egg');
  });
  it('reaches scout with DP and 3 campaigns', () => {
    expect(resolveTier('content_creator', M(600, 3), THRESHOLDS)).toBe('scout');
  });
  it('knight needs rating too; without it falls back to scout', () => {
    expect(resolveTier('content_creator', M(3000, 10, 4.4), THRESHOLDS)).toBe('scout');
    expect(resolveTier('content_creator', M(3000, 10, null), THRESHOLDS)).toBe('scout');
    expect(resolveTier('content_creator', M(3000, 10, 4.6), THRESHOLDS)).toBe('knight');
  });
  it('business knight has no rating requirement', () => {
    expect(resolveTier('business_client', M(3000, 10), THRESHOLDS)).toBe('knight');
  });
  it('legend is DP-only (cap) — high DP, low campaigns still resolves to legend', () => {
    expect(resolveTier('content_creator', M(50000, 3), THRESHOLDS)).toBe('legend');
  });
});
