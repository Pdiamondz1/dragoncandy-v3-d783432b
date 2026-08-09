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
  milestone: string | null;
}

// Milestone maturity rank — mirrors get_creator_brief_performance's CASE
// (supabase/migrations/20260805211734_content_performance_platform_grain.sql:85),
// the one other place this table is summed, so the two never disagree about
// which snapshot of a post is "the" one. An unrecognized/missing milestone
// ranks last (the ELSE 0 branch there too), so it never silently outranks a
// real known-milestone snapshot.
function milestoneRank(milestone: string | null): number {
  switch (milestone) {
    case '7d':
      return 3;
    case '72h':
      return 2;
    case '24h':
      return 1;
    default:
      return 0;
  }
}

// content_performance stores a CUMULATIVE snapshot per (post, platform,
// milestone) — the 72h row already restates everything the 24h row counted,
// it is not an additional chunk of engagement. Summing every row for a post
// multiplies its real totals by however many milestones have fired.
// Verified against prod post XDbxe (youtube): 24h=1369 views/5 likes,
// 72h=1388/5, 7d=1388/5 — naive summing reports 4145/15; the true total is
// 1388/5. Keep only the most mature snapshot per (post, platform) before any
// arithmetic. Grouped by platform too, not just post: a post fanned out to
// two platforms has two independent cumulative series, not one.
function mostMatureByPostPlatform(rows: PerfRow[]): PerfRow[] {
  const best = new Map<string, PerfRow>();
  for (const r of rows) {
    const key = `${r.outstand_post_id} ${r.platform ?? ''}`;
    const cur = best.get(key);
    if (!cur || milestoneRank(r.milestone) > milestoneRank(cur.milestone)) {
      best.set(key, r);
    }
  }
  return [...best.values()];
}

function sum(rows: PerfRow[], key: 'views' | 'likes' | 'comments' | 'shares'): number {
  // null means NOT MEASURED, not zero — averaging it in as 0 is the exact
  // dishonesty the analytics pass was built to remove.
  return rows.reduce((acc, r) => acc + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0);
}

export function summarizePerformance(rows: PerfRow[]): string {
  const withId = rows.filter((r) => typeof r.outstand_post_id === 'string' && r.outstand_post_id);

  // post_count and totals are DELIBERATELY on different grains — do not
  // collapse them into one grouping.
  //
  // post_count is keyed on outstand_post_id ALONE. It answers "how many
  // posts is this claim built on" for the sample-size gate, and a post
  // cross-published to Instagram AND YouTube is still one post for that
  // question.
  //
  // totals (below) are summed per (post, platform) after milestone dedup.
  // That same cross-published post genuinely reached two separate audiences,
  // so its view/like totals are the sum across platforms — collapsing to one
  // row per post here would silently undercount real reach.
  const postCount = new Set(withId.map((r) => r.outstand_post_id)).size;
  const verdict = assessSignal(postCount);

  const deduped = mostMatureByPostPlatform(withId);

  const out: Record<string, unknown> = {
    post_count: postCount,
    has_signal: verdict.hasSignal,
    caveat: verdict.caveat,
    totals: {
      views: sum(deduped, 'views'),
      likes: sum(deduped, 'likes'),
      comments: sum(deduped, 'comments'),
      shares: sum(deduped, 'shares'),
    },
    // FORMAT is part of the instruction because the answer is read in a chat
    // bubble roughly 370px wide on desktop and narrower on a phone — a markdown
    // table does not fit there even when it renders. On 2026-08-09 the model
    // answered this tool with a 5-column table and the founder saw raw pipes:
    // `| Metric | Total | |------|-----|| Views |1|`. The renderer was half the
    // cause (no GFM plugin, since fixed) but a rendered table would still have
    // been the wrong shape for the surface. The figures here are four numbers;
    // four short lines read better than any grid.
    instruction: verdict.hasSignal
      ? `State that this is based on ${postCount} measured posts, then answer normally. ` +
        `Write the figures as short plain lines, never a markdown table or ASCII grid — ` +
        `this is read in a narrow chat bubble.`
      : `${verdict.caveat} Do not name a best platform, a trend, or a rate. ` +
        `Write the figures as short plain lines, never a markdown table or ASCII grid — ` +
        `this is read in a narrow chat bubble.`,
  };

  if (verdict.hasSignal) {
    const byPlatform = new Map<string, { total: number; n: number }>();
    for (const r of deduped) {
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
