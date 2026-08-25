import { describe, expect, it } from 'vitest';
import {
  MAX_POSTS,
  parsePosts,
  summarize,
  sumOrNull,
  WINDOW_DAYS,
  type XAccountSummary,
  type XPostMetrics,
} from './x-metrics.ts';

/**
 * Real execution tests. Every rule below is an [[Honest Analytics]] rule, and
 * each one exists because the opposite behaviour looks fine on a dashboard —
 * that is what makes them worth pinning rather than eyeballing.
 */

const ACCOUNT: XAccountSummary = {
  x_user_id: '1',
  username: 'dragoncandyco',
  display_name: 'DragonCandy',
  followers_count: 12,
  following_count: 3,
  tweet_count: 40,
};

const post = (over: Partial<XPostMetrics> = {}): XPostMetrics => ({
  id: 'p1',
  created_at: '2026-08-01T00:00:00.000Z',
  text: 'hello',
  likes: null,
  replies: null,
  reposts: null,
  quotes: null,
  impressions: null,
  profile_clicks: null,
  link_clicks: null,
  ...over,
});

describe('sumOrNull', () => {
  it('adds the values that are present', () => {
    expect(sumOrNull([1, 2, 3])).toBe(6);
  });

  it('ignores absent values rather than counting them as zero', () => {
    expect(sumOrNull([5, null, 5])).toBe(10);
  });

  it('returns null — NOT 0 — when nothing was measured', () => {
    // The whole point. `[].reduce((a, b) => a + b, 0)` is 0, which prints a
    // confident zero for a window in which we measured nothing at all. A real
    // zero and an absent measurement are different claims, and only one of them
    // is ours to make.
    expect(sumOrNull([])).toBeNull();
    expect(sumOrNull([null, null])).toBeNull();
  });

  it('keeps a genuine zero', () => {
    // The mirror of the rule above: a measured 0 must survive, or the card would
    // hide real "nobody engaged" results behind an em dash.
    expect(sumOrNull([0, 0])).toBe(0);
    expect(sumOrNull([0, null])).toBe(0);
  });
});

describe('parsePosts', () => {
  it('returns an empty list when X sent no data key', () => {
    // Zero posts in the window is an empty list, never a synthesised row of
    // zeros. An empty state and a measured zero look identical on a card and
    // mean opposite things.
    expect(parsePosts({})).toEqual([]);
    expect(parsePosts({ data: null })).toEqual([]);
  });

  it('keeps a metric X omitted as null', () => {
    const [p] = parsePosts({ data: [{ id: 'a', public_metrics: { like_count: 4 } }] });
    expect(p.likes).toBe(4);
    // Not 0. Nothing in the response said these were zero.
    expect(p.impressions).toBeNull();
    expect(p.profile_clicks).toBeNull();
    expect(p.link_clicks).toBeNull();
  });

  it('does not turn null into zero via Number()', () => {
    // `Number(null)` is 0 and 0 is finite, so a `Number.isFinite(Number(x))`
    // guard admits null and turns "X reported nothing" into a real zero. That
    // exact bug shipped in the Instagram connector's first draft: the totals
    // still added up, and only the day count betrayed it.
    const [p] = parsePosts({
      data: [{ id: 'a', public_metrics: { like_count: null, impression_count: null } }],
    });
    expect(p.likes).toBeNull();
    expect(p.impressions).toBeNull();
  });

  it('prefers organic over public when both are present', () => {
    // Organic excludes promoted views, so it is the truthful number for "how did
    // this post do on its own".
    const [p] = parsePosts({
      data: [
        {
          id: 'a',
          public_metrics: { like_count: 10, impression_count: 500 },
          organic_metrics: { like_count: 9, impression_count: 400, user_profile_clicks: 3 },
        },
      ],
    });
    expect(p.likes).toBe(9);
    expect(p.impressions).toBe(400);
    expect(p.profile_clicks).toBe(3);
  });
});

describe('summarize', () => {
  it('reports how many posts the figures came from', () => {
    const s = summarize(ACCOUNT, [post(), post({ id: 'p2' })]);
    expect(s.posts_counted).toBe(2);
  });

  it('reports organic coverage separately from the post count', () => {
    // If this is lower than posts_counted, impressions and clicks describe a
    // SUBSET. Reporting it is what lets the card say so instead of implying it
    // measured everything — the same reason the YouTube card reports
    // days_with_data rather than the days it asked for.
    const s = summarize(ACCOUNT, [
      post({ id: 'a', profile_clicks: 2 }),
      post({ id: 'b' }),
      post({ id: 'c' }),
    ]);
    expect(s.posts_counted).toBe(3);
    expect(s.posts_with_organic).toBe(1);
  });

  it('gives an all-null total for a window with no measurements', () => {
    const s = summarize(ACCOUNT, [post(), post({ id: 'p2' })]);
    expect(s.totals.likes).toBeNull();
    expect(s.totals.impressions).toBeNull();
  });

  it('gives an empty summary for an account with no posts, not a row of zeros', () => {
    const s = summarize(ACCOUNT, []);
    expect(s.posts_counted).toBe(0);
    expect(s.top_posts).toEqual([]);
    expect(s.totals.likes).toBeNull();
  });

  it('sorts an unmeasured post BELOW a measured zero', () => {
    // An unmeasured post is not a badly performing one. If null sorted as 0 it
    // would tie with a genuine zero and could outrank it, putting a post we know
    // nothing about into a list captioned "top posts".
    const s = summarize(ACCOUNT, [
      post({ id: 'unknown' }),
      post({ id: 'measured-zero', impressions: 0 }),
      post({ id: 'good', impressions: 100 }),
    ]);
    expect(s.top_posts.map((p) => p.id)).toEqual(['good', 'measured-zero', 'unknown']);
  });

  it('caps top posts at five', () => {
    const s = summarize(
      ACCOUNT,
      Array.from({ length: 12 }, (_, i) => post({ id: `p${i}`, impressions: i })),
    );
    expect(s.top_posts).toHaveLength(5);
    expect(s.top_posts[0].id).toBe('p11');
  });

  it('carries the window it actually used', () => {
    expect(summarize(ACCOUNT, [], 7).window_days).toBe(7);
  });
});

describe('the constants are decisions, not defaults', () => {
  it('windows at 28 days, inside the 30-day organic limit', () => {
    // Not "28 because the siblings use 28". organic_metrics is unavailable past
    // 30 days, so widening this silently degrades half the numbers on the card.
    expect(WINDOW_DAYS).toBe(28);
    expect(WINDOW_DAYS).toBeLessThan(30);
  });

  it('reads at most one page', () => {
    // Each extra page is another billed read. X caps this endpoint at 100.
    expect(MAX_POSTS).toBe(100);
  });
});
