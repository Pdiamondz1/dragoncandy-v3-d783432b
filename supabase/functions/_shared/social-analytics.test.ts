import { describe, it, expect } from 'vitest';
import { summarizePerformance, type PerfRow } from './social-analytics';

function row(over: Partial<PerfRow> = {}): PerfRow {
  return {
    outstand_post_id: 'p1',
    platform: 'instagram',
    views: 100,
    likes: 10,
    comments: 2,
    shares: 1,
    engagement_rate: 0.13,
    milestone: '24h',
    ...over,
  };
}

describe('summarizePerformance', () => {
  it('reports zero measured posts honestly', () => {
    const out = JSON.parse(summarizePerformance([]));
    expect(out.post_count).toBe(0);
    expect(out.has_signal).toBe(false);
    expect(out.caveat).toContain('0 measured posts');
  });

  it('counts DISTINCT posts, not milestone rows', () => {
    // One post measured at 24h and 7d is ONE post. Counting rows would clear a
    // bar of 3 with a single post and make every claim it gates a lie.
    const rows = [
      row({ outstand_post_id: 'p1', milestone: '24h' }),
      row({ outstand_post_id: 'p1', milestone: '72h' }),
      row({ outstand_post_id: 'p1', milestone: '7d' }),
    ];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.post_count).toBe(1);
    expect(out.has_signal).toBe(false);
  });

  it('withholds the comparative claim below the threshold', () => {
    const rows = [row({ outstand_post_id: 'p1' }), row({ outstand_post_id: 'p2' })];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.post_count).toBe(2);
    expect(out.has_signal).toBe(false);
    expect(out.best_platform).toBeUndefined();
  });

  it('makes the claim at the threshold and still states N', () => {
    const rows = [
      row({ outstand_post_id: 'p1', platform: 'instagram', engagement_rate: 0.2 }),
      row({ outstand_post_id: 'p2', platform: 'instagram', engagement_rate: 0.3 }),
      row({ outstand_post_id: 'p3', platform: 'youtube', engagement_rate: 0.01 }),
    ];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.post_count).toBe(3);
    expect(out.has_signal).toBe(true);
    expect(out.caveat).toBeNull();
    expect(out.best_platform).toBe('instagram');
  });

  it('always reports raw totals, signal or not', () => {
    const out = JSON.parse(summarizePerformance([row({ views: 50, likes: 5 })]));
    expect(out.totals.views).toBe(50);
    expect(out.totals.likes).toBe(5);
  });

  it('treats null metrics as absent rather than as zero', () => {
    // An unmeasured post stored as a real zero is how "Honest Analytics"
    // got its name. Absent must not average in as 0.
    const rows = [row({ views: null }), row({ outstand_post_id: 'p2', views: 100 })];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.totals.views).toBe(100);
  });

  it('ignores rows with no post id rather than counting them as a post', () => {
    const rows = [row({ outstand_post_id: null }), row({ outstand_post_id: 'p2' })];
    expect(JSON.parse(summarizePerformance(rows)).post_count).toBe(1);
  });

  it('instructs the model not to name a trend when there is no signal', () => {
    const out = JSON.parse(summarizePerformance([row()]));
    expect(out.instruction.toLowerCase()).toContain('do not');
  });

  // --- Cumulative-snapshot dedup (Critical fix, post-review) ---
  //
  // content_performance stores a CUMULATIVE total per (post, platform,
  // milestone), not an increment: the 72h row already includes everything
  // counted in the 24h row. Summing every row for a post multiplies its real
  // totals by however many milestones have fired. Verified against prod post
  // XDbxe (youtube): 24h=1369 views/5 likes, 72h=1388/5, 7d=1388/5 — the true
  // total is 1388 views / 5 likes, not 4145/15. These tests use distinct
  // per-row values (unlike the milestone test above, which only needed to
  // pin post_count) specifically so duplication would show up as a wrong sum.

  it('dedupes cumulative milestone snapshots to the most mature one (prod XDbxe fixture)', () => {
    const rows = [
      row({ outstand_post_id: 'XDbxe', platform: 'youtube', milestone: '24h', views: 1369, likes: 5 }),
      row({ outstand_post_id: 'XDbxe', platform: 'youtube', milestone: '72h', views: 1388, likes: 5 }),
      row({ outstand_post_id: 'XDbxe', platform: 'youtube', milestone: '7d', views: 1388, likes: 5 }),
    ];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.totals.views).toBe(1388);
    expect(out.totals.likes).toBe(5);
  });

  it('keeps post_count and totals on separate grains for a cross-platform post', () => {
    // post_count is keyed on outstand_post_id ALONE (one post, one claim about
    // sample size). totals sums per (post, platform) after dedup — a post
    // cross-published to two platforms genuinely reached two audiences, so its
    // view total is the sum of both, even though it is still exactly one post
    // for the gate.
    const rows = [
      row({ outstand_post_id: 'p1', platform: 'instagram', milestone: '7d', views: 300, likes: 20 }),
      row({ outstand_post_id: 'p1', platform: 'youtube', milestone: '7d', views: 500, likes: 40 }),
    ];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.post_count).toBe(1);
    expect(out.totals.views).toBe(800);
    expect(out.totals.likes).toBe(60);
  });

  it('ranks an unrecognized milestone last rather than letting it silently win', () => {
    const rows = [
      row({ outstand_post_id: 'p1', platform: 'instagram', milestone: '24h', views: 100 }),
      row({ outstand_post_id: 'p1', platform: 'instagram', milestone: '30d', views: 99999 }),
    ];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.totals.views).toBe(100);
  });
});
