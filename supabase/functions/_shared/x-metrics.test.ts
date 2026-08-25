import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPosts,
  MAX_POSTS,
  parsePosts,
  summarize,
  sumOrNull,
  WINDOW_DAYS,
  type XAccountSummary,
  type XPostMetrics,
} from './x-metrics.ts';
import { XError } from './x-api.ts';

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


/**
 * X BILLS PER READ, SO A FAILURE THAT RETRIES IS A FAILURE THAT COSTS TWICE.
 *
 * Observed on prod 2026-08-25, minutes after the first real account connected:
 * X answered `402 {"detail":"credits depleted",...}` because X discontinued its
 * free tier in February 2026. The card renders `error.message` directly, so the
 * raw JSON body went on a settings page.
 *
 * Two separate properties are pinned here, and the second needs a control.
 */
describe('a 402 from X is unfunded billing, not a fault', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (status: number, body: string) =>
    new Response(body, { status, headers: { 'Content-Type': 'application/json' } });

  it('says something a human can act on, and leaks no raw JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respond(402, '{"detail":"credits depleted","status":402,"title":"Payment Required"}'),
      ),
    );

    const err = await fetchPosts('token', '123').catch((e) => e);

    expect(err).toBeInstanceOf(XError);
    expect((err as XError).code).toBe('credits_depleted');
    expect((err as XError).status).toBe(402);
    // The defect that put this on screen: the catch-all appends X's body.
    expect((err as XError).message).not.toContain('{');
    expect((err as XError).message).not.toContain('detail');
    expect((err as XError).message).toMatch(/credits/i);
  });

  // NOTE ON WHAT THIS ONE ACTUALLY PROTECTS. Deleting the 402 branch above
  // fails the message test and leaves this one GREEN — because a 402 falling
  // through to the catch-all still matches neither retry condition (403, or 400
  // naming organic metrics). So this pins round 11's narrowing of the retry, not
  // the 402 branch. Both are worth pinning; conflating them would make this
  // block look stronger than it is.
  it('does NOT buy a second billed read', async () => {
    const spy = vi.fn(async () => respond(402, '{"detail":"credits depleted"}'));
    vi.stubGlobal('fetch', spy);

    await fetchPosts('token', '123').catch(() => undefined);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a 403 does retry, so the assertion above can actually fail', async () => {
    // Without this, "called once" would pass even if the retry were broken
    // outright — and the test would be pinning nothing. A 403 is the genuine
    // organic-metrics permission refusal, which SHOULD spend a second read to
    // return a smaller honest card.
    const spy = vi.fn(async (url: string) =>
      String(url).includes('organic_metrics')
        ? respond(403, '{"detail":"not permitted"}')
        : respond(200, '{"data":[]}'),
    );
    vi.stubGlobal('fetch', spy);

    const result = await fetchPosts('token', '123');

    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.organicAvailable).toBe(false);
  });
});
