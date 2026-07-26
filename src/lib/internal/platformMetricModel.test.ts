import { describe, it, expect } from 'vitest';
import { deriveCardModel, diffBuckets, syntheticTotalUsers } from './platformMetricModel';
import type { PlatformStats } from '@/hooks/internal/usePlatformStats';

const STATS: PlatformStats = {
  users: {
    total: 40, total_all: 2065,
    by_role: { content_creator: 17, business_client: 20 },
    by_role_all: { content_creator: 1007, business_client: 1050 },
  },
  businesses: {
    restaurants: 11, restaurants_all: 19,
    brands: 6, brands_all: 9,
    locations: 1796, locations_all: 1800,
  },
  campaigns: {
    total: 25, total_all: 52,
    by_status: { active: 2, draft: 23 },
    by_status_all: { active: 5, draft: 47 },
  },
  dragonshare: {
    posts_total: 10, posts_total_all: 20,
    posts_by_status: { verified: 10 },
    posts_by_status_all: { verified: 18 },
    boosts_total: 7, boosts_total_all: 7,
  },
  promotions: { total: 2, total_all: 2, by_status: {} },
  content: {
    social_posts_logged: 14, social_posts_logged_all: 28,
    performance_tracked_posts: 6, performance_tracked_posts_all: 6,
  },
  social_connections: {
    total: 8, total_all: 10,
    by_platform: { youtube: 4, facebook: 1, instagram: 3 },
    by_platform_all: { youtube: 5, facebook: 1, instagram: 4 },
  },
  generated_at: '2026-07-26T00:00:00Z',
};

/** Flatten to { [label]: { value, sub } } for readable assertions. */
function cards(mode: 'real' | 'synthetic') {
  const out: Record<string, { value: number; sub?: string }> = {};
  for (const section of deriveCardModel(STATS, mode)) {
    for (const c of section.cards) out[c.label] = { value: c.value, sub: c.sub };
  }
  return out;
}

describe('diffBuckets', () => {
  it('returns positive per-key differences over the union of keys', () => {
    expect(diffBuckets({ a: 5, b: 1 }, { a: 2 })).toEqual({ a: 3, b: 1 });
  });
  it('drops zero and negative differences', () => {
    expect(diffBuckets({ a: 2, b: 1 }, { a: 2, b: 4 })).toEqual({});
  });
  it('tolerates undefined inputs', () => {
    expect(diffBuckets(undefined, undefined)).toEqual({});
    expect(diffBuckets({ a: 3 }, undefined)).toEqual({ a: 3 });
  });
});

describe('deriveCardModel — real mode reproduces Overview', () => {
  const c = cards('real');
  it('headline values match real counts', () => {
    expect(c['Total users'].value).toBe(40);
    expect(c['Creators'].value).toBe(17);
    expect(c['Restaurants'].value).toBe(11);
    expect(c['Campaigns'].value).toBe(25);
    expect(c['Social connections'].value).toBe(8);
  });
  it('subs match Overview strings', () => {
    expect(c['Total users'].sub).toBe('of 2,065 incl. synthetic');
    expect(c['Restaurants'].sub).toBe('1796 locations · of 19 incl. synthetic');
    expect(c['Campaigns'].sub).toBe('2 active · of 52 incl. synthetic');
    expect(c['DragonShare posts'].sub).toBe('10 verified · 7 boosts · of 20 incl. synthetic');
    expect(c['Social connections'].sub).toBe('youtube 4 · facebook 1 · instagram 3 · of 10 incl. synthetic');
    expect(c['Promotions'].sub).toBeUndefined();
  });
});

describe('deriveCardModel — synthetic mode = all − real', () => {
  const c = cards('synthetic');
  it('headline values are the synthetic gap', () => {
    expect(c['Total users'].value).toBe(2025);
    expect(c['Creators'].value).toBe(990);
    expect(c['Restaurants'].value).toBe(8);
    expect(c['Brands'].value).toBe(3);
    expect(c['Campaigns'].value).toBe(27);
    expect(c['DragonShare posts'].value).toBe(10);
    expect(c['Promotions'].value).toBe(0);
    expect(c['Social connections'].value).toBe(2);
    expect(c['Social posts logged'].value).toBe(14);
    expect(c['Performance-tracked posts'].value).toBe(0);
  });
  it('subs are the bucket diffs, without the ofTotal affordance', () => {
    expect(c['Restaurants'].sub).toBe('4 locations');
    expect(c['Campaigns'].sub).toBe('3 active');
    expect(c['DragonShare posts'].sub).toBe('8 verified · 0 boosts');
    expect(c['Social connections'].sub).toBe('youtube 1 · instagram 1');
    expect(c['Total users'].sub).toBeUndefined();
  });
});

describe('degradation — *_all breakdown maps absent', () => {
  const behind: PlatformStats = {
    ...STATS,
    campaigns: { total: 25, total_all: 52, by_status: { active: 2 } },
    social_connections: { total: 8, total_all: 10, by_platform: { youtube: 4 } },
  };
  it('keeps synthetic headline counts, drops the missing subs', () => {
    const c: Record<string, { value: number; sub?: string }> = {};
    for (const s of deriveCardModel(behind, 'synthetic')) for (const k of s.cards) c[k.label] = k;
    expect(c['Campaigns'].value).toBe(27);
    expect(c['Campaigns'].sub).toBe('0 active');
    expect(c['Social connections'].sub).toBeUndefined();
  });
});

describe('syntheticTotalUsers', () => {
  it('is the users gap', () => {
    expect(syntheticTotalUsers(STATS)).toBe(2025);
  });
});
