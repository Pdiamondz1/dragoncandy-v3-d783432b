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
    const rows = [row({ outstand_post_id: 'p1' }), row({ outstand_post_id: 'p1' }), row({ outstand_post_id: 'p1' })];
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
});
