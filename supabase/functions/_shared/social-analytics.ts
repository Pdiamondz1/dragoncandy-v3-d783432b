// Donny's read of the owner's own measured post performance.
//
// Reads content_performance — the table content-performance-capture fills and
// the Analytics page already renders — rather than the provider. There is no
// proxy route matching this tool's shape (the only analytics route is per-post,
// /posts/{id}/analytics, and this tool has no post id), and fanning out N
// provider calls on an org-wide key inside one 10s timeout would be worse on
// every axis.
//
// Sample-size gated on DISTINCT posts. A post yields one row per milestone, so
// counting rows would clear a bar of 3 with a single post.
import { assessSignal } from './social-signal.ts';

export interface PerfRow {
  outstand_post_id: string | null;
  platform: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null;
}

function sum(rows: PerfRow[], key: 'views' | 'likes' | 'comments' | 'shares'): number {
  // null means NOT MEASURED, not zero — averaging it in as 0 is the exact
  // dishonesty the analytics pass was built to remove.
  return rows.reduce((acc, r) => acc + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0);
}

export function summarizePerformance(rows: PerfRow[]): string {
  const withId = rows.filter((r) => typeof r.outstand_post_id === 'string' && r.outstand_post_id);
  const postCount = new Set(withId.map((r) => r.outstand_post_id)).size;
  const verdict = assessSignal(postCount);

  const out: Record<string, unknown> = {
    post_count: postCount,
    has_signal: verdict.hasSignal,
    caveat: verdict.caveat,
    totals: {
      views: sum(withId, 'views'),
      likes: sum(withId, 'likes'),
      comments: sum(withId, 'comments'),
      shares: sum(withId, 'shares'),
    },
    instruction: verdict.hasSignal
      ? `State that this is based on ${postCount} measured posts, then answer normally.`
      : `${verdict.caveat} Do not name a best platform, a trend, or a rate.`,
  };

  if (verdict.hasSignal) {
    const byPlatform = new Map<string, { total: number; n: number }>();
    for (const r of withId) {
      if (!r.platform || typeof r.engagement_rate !== 'number') continue;
      const cur = byPlatform.get(r.platform) ?? { total: 0, n: 0 };
      cur.total += r.engagement_rate;
      cur.n += 1;
      byPlatform.set(r.platform, cur);
    }
    let best: string | undefined;
    let bestAvg = -1;
    for (const [platform, agg] of byPlatform) {
      const avg = agg.total / agg.n;
      if (avg > bestAvg) {
        bestAvg = avg;
        best = platform;
      }
    }
    if (best) out.best_platform = best;
  }

  return JSON.stringify(out);
}
