import { describe, it, expect } from 'vitest';
import {
  MIN_POSTS_FOR_SIGNAL,
  interactionsOf,
  latestPerPost,
  rankByEngagement,
  signalVerdict,
  signalForVisible,
  type PerformanceRow,
} from './postPerformance';

const row = (over: Partial<PerformanceRow> & { outstand_post_id: string }): PerformanceRow => ({
  platform: 'youtube',
  milestone: '24h',
  captured_at: '2026-06-13T09:00:00Z',
  ...over,
});

describe('interactionsOf', () => {
  it('sums likes, comments, shares and saves', () => {
    expect(interactionsOf(row({ outstand_post_id: 'a', likes: 5, comments: 2, shares: 1, saves: 3 }))).toBe(11);
  });

  it('EXCLUDES views — delivery is not response', () => {
    expect(interactionsOf(row({ outstand_post_id: 'a', views: 1388, likes: 5 }))).toBe(5);
  });

  it('treats null/undefined/NaN metrics as zero rather than propagating NaN', () => {
    expect(interactionsOf(row({ outstand_post_id: 'a', likes: null, comments: undefined }))).toBe(0);
    expect(interactionsOf(row({ outstand_post_id: 'a', likes: Number.NaN }))).toBe(0);
  });
});

describe('latestPerPost', () => {
  it('collapses the 24h/72h/7d rows of one post into a single entry', () => {
    // The real shape: content_performance stores one row per milestone.
    const rows = [
      row({ outstand_post_id: 'XDbxe', milestone: '24h', captured_at: '2026-06-13T09:00:00Z', views: 1369, likes: 5 }),
      row({ outstand_post_id: 'XDbxe', milestone: '72h', captured_at: '2026-06-19T00:52:10Z', views: 1388, likes: 5 }),
      row({ outstand_post_id: 'XDbxe', milestone: '7d', captured_at: '2026-06-19T00:52:10Z', views: 1388, likes: 5 }),
    ];
    const out = latestPerPost(rows);
    expect(out).toHaveLength(1);
    expect(out[0].views).toBe(1388);
  });

  it('prefers a settled measurement over a later unsettled one', () => {
    const rows = [
      row({ outstand_post_id: 'a', captured_at: '2026-06-01T00:00:00Z', is_settled: true, likes: 10 }),
      row({ outstand_post_id: 'a', captured_at: '2026-06-09T00:00:00Z', is_settled: false, likes: 99 }),
    ];
    expect(latestPerPost(rows)[0].likes).toBe(10);
  });

  it('takes the later capture when settledness matches', () => {
    const rows = [
      row({ outstand_post_id: 'a', captured_at: '2026-06-01T00:00:00Z', likes: 1 }),
      row({ outstand_post_id: 'a', captured_at: '2026-06-09T00:00:00Z', likes: 7 }),
    ];
    expect(latestPerPost(rows)[0].likes).toBe(7);
  });

  it('SUMS across platforms — a cross-posted hit must not lose its other platforms', () => {
    // The unique key is (post, platform, milestone), so a fanned-out post has a
    // row per platform. Keying only on post id kept one and discarded the rest.
    const rows = [
      row({ outstand_post_id: 'fanned', platform: 'instagram', likes: 10, views: 100 }),
      row({ outstand_post_id: 'fanned', platform: 'youtube', likes: 20, views: 900 }),
      row({ outstand_post_id: 'fanned', platform: 'tiktok', likes: 5, views: 40 }),
    ];
    const out = latestPerPost(rows);
    expect(out).toHaveLength(1);
    expect(out[0].interactions).toBe(35);
    expect(out[0].views).toBe(1040);
    expect(out[0].platforms).toEqual(['instagram', 'tiktok', 'youtube']);
  });

  it('collapses milestones WITHIN a platform before summing across them', () => {
    const rows = [
      row({ outstand_post_id: 'p', platform: 'instagram', milestone: '24h', captured_at: '2026-06-01T00:00:00Z', likes: 1 }),
      row({ outstand_post_id: 'p', platform: 'instagram', milestone: '7d', captured_at: '2026-06-08T00:00:00Z', likes: 4 }),
      row({ outstand_post_id: 'p', platform: 'youtube', milestone: '24h', captured_at: '2026-06-01T00:00:00Z', likes: 2 }),
    ];
    // 4 (latest instagram) + 2 (youtube) — NOT 1+4+2.
    expect(latestPerPost(rows)[0].interactions).toBe(6);
  });

  it('a cross-posted post outranks a single-platform post with fewer total interactions', () => {
    const posts = latestPerPost([
      row({ outstand_post_id: 'single', platform: 'youtube', likes: 25 }),
      row({ outstand_post_id: 'fanned', platform: 'instagram', likes: 15 }),
      row({ outstand_post_id: 'fanned', platform: 'tiktok', likes: 15 }),
    ]);
    expect(rankByEngagement(posts)[0].outstandPostId).toBe('fanned');
  });

  it('keeps distinct posts separate', () => {
    const out = latestPerPost([
      row({ outstand_post_id: 'a', likes: 1 }),
      row({ outstand_post_id: 'b', likes: 2 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('ignores rows with no post id instead of grouping them together', () => {
    expect(latestPerPost([row({ outstand_post_id: '' })])).toHaveLength(0);
  });

  it('returns [] for an empty input', () => {
    expect(latestPerPost([])).toEqual([]);
  });
});

describe('rankByEngagement', () => {
  it('ranks by interactions, NOT by views', () => {
    // The whole point: a 10k-view post nobody responded to must not outrank a
    // small post people actually engaged with.
    const posts = latestPerPost([
      row({ outstand_post_id: 'viral-but-silent', views: 10000, likes: 0 }),
      row({ outstand_post_id: 'small-but-loved', views: 50, likes: 40, comments: 12 }),
    ]);
    expect(rankByEngagement(posts).map((p) => p.outstandPostId)).toEqual([
      'small-but-loved',
      'viral-but-silent',
    ]);
  });

  it('breaks interaction ties on views', () => {
    const posts = latestPerPost([
      row({ outstand_post_id: 'a', views: 10, likes: 5 }),
      row({ outstand_post_id: 'b', views: 99, likes: 5 }),
    ]);
    expect(rankByEngagement(posts)[0].outstandPostId).toBe('b');
  });

  it('is stable and deterministic when interactions and views both tie', () => {
    const posts = latestPerPost([
      row({ outstand_post_id: 'zzz', likes: 1 }),
      row({ outstand_post_id: 'aaa', likes: 1 }),
    ]);
    expect(rankByEngagement(posts).map((p) => p.outstandPostId)).toEqual(['aaa', 'zzz']);
  });

  it('does not mutate its input', () => {
    const posts = latestPerPost([
      row({ outstand_post_id: 'a', likes: 1 }),
      row({ outstand_post_id: 'b', likes: 9 }),
    ]);
    const before = posts.map((p) => p.outstandPostId);
    rankByEngagement(posts);
    expect(posts.map((p) => p.outstandPostId)).toEqual(before);
  });
});

describe('signalVerdict', () => {
  it('refuses to call it a pattern below the threshold, and says how many more are needed', () => {
    expect(signalVerdict(0)).toEqual({ hasSignal: false, n: 0, needed: 3 });
    expect(signalVerdict(1)).toEqual({ hasSignal: false, n: 1, needed: 2 });
    expect(signalVerdict(2)).toEqual({ hasSignal: false, n: 2, needed: 1 });
  });

  it('allows the claim at and above the threshold, and reports N', () => {
    expect(signalVerdict(3)).toEqual({ hasSignal: true, n: 3 });
    expect(signalVerdict(50)).toEqual({ hasSignal: true, n: 50 });
  });

  it('matches the brief precedent of 3', () => {
    expect(MIN_POSTS_FOR_SIGNAL).toBe(3);
  });

  it('today\'s real prod state — 1 verified post, no metrics — yields no signal', () => {
    expect(signalVerdict(latestPerPost([]).length)).toEqual({ hasSignal: false, n: 0, needed: 3 });
  });
});

describe('signalForVisible', () => {
  const measured = new Set(['a', 'b', 'c', 'd']);

  it('counts only the posts on screen, not the whole account', () => {
    // The bug: 4 measured posts account-wide, but the platform filter shows two
    // unmeasured ones. An account-wide verdict would flip the UI into "ranked"
    // mode and then render nothing.
    expect(signalForVisible(['x', 'y'], measured)).toEqual({ hasSignal: false, n: 0, needed: 3 });
  });

  it('grants signal when enough of the VISIBLE posts are measured', () => {
    expect(signalForVisible(['a', 'b', 'c'], measured)).toEqual({ hasSignal: true, n: 3 });
  });

  it('counts a mixed view correctly', () => {
    expect(signalForVisible(['a', 'x', 'b'], measured)).toEqual({ hasSignal: false, n: 2, needed: 1 });
  });

  it('does not double-count a repeated id', () => {
    expect(signalForVisible(['a', 'a', 'a'], measured)).toEqual({ hasSignal: false, n: 1, needed: 2 });
  });

  it('handles an empty view and empty measurements', () => {
    expect(signalForVisible([], measured)).toEqual({ hasSignal: false, n: 0, needed: 3 });
    expect(signalForVisible(['a'], new Set())).toEqual({ hasSignal: false, n: 0, needed: 3 });
  });
});
