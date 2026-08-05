import { describe, it, expect } from 'vitest';
import { mapOutstandAccountMetrics } from './outstand-metrics-map';

// Verbatim from a live GET /v1/social-accounts/LEnjV/metrics response, 2026-08-04.
const LIVE_90D = {
  account_id: 'LEnjV',
  network: 'instagram',
  followers_count: 4,
  following_count: 2,
  posts_count: 12,
  engagement: {
    views: 867, likes: 7, comments: 0, shares: 6, saves: 0,
    reach: 630, accounts_engaged: 3, total_interactions: 19,
  },
  platform_specific: { username: 'areyouaman' },
};

describe('mapOutstandAccountMetrics', () => {
  it('reads the REAL field names from a captured response', () => {
    const m = mapOutstandAccountMetrics(LIVE_90D)!;
    expect(m.followers).toBe(4);
    expect(m.postsCount).toBe(12);
    // reach is nested inside `engagement`, not top-level
    expect(m.reach).toBe(630);
  });

  it('derives an engagement rate, which Outstand does not report', () => {
    const m = mapOutstandAccountMetrics(LIVE_90D)!;
    expect(m.engagementRate).toBeCloseTo(19 / 630);
  });

  it('returns 0 rate rather than dividing by zero reach', () => {
    const m = mapOutstandAccountMetrics({
      followers_count: 4,
      posts_count: 12,
      engagement: { reach: 0, total_interactions: 0 },
    })!;
    expect(m.engagementRate).toBe(0);
  });

  // The regression that mattered: the OLD mapping read followers/engagementRate/
  // reach/postsCount, none of which exist, so a real account rendered as zeros.
  it('does NOT return all-zeros for a real payload', () => {
    const m = mapOutstandAccountMetrics(LIVE_90D)!;
    expect([m.followers, m.reach, m.postsCount].some((v) => v > 0)).toBe(true);
  });

  it('returns NULL for an unrecognised payload so callers can fail loudly', () => {
    expect(mapOutstandAccountMetrics({})).toBeNull();
    expect(mapOutstandAccountMetrics({ unrelated: 1 })).toBeNull();
    expect(mapOutstandAccountMetrics(null)).toBeNull();
  });

  it('still maps the legacy camelCase names if Outstand ever returns them', () => {
    const m = mapOutstandAccountMetrics({ followers: 9, postsCount: 3, reach: 100 })!;
    expect(m.followers).toBe(9);
    expect(m.postsCount).toBe(3);
  });
});
