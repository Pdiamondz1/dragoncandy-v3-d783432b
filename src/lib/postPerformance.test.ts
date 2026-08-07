import { describe, it, expect } from 'vitest';
import {
  MIN_POSTS_FOR_SIGNAL,
  interactionsOf,
  latestPerPost,
  rankByEngagement,
  signalVerdict,
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
