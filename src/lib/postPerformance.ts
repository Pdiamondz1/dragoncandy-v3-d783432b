/** Post-level performance: which posts actually did well, and whether we are
 *  entitled to say so yet.
 *
 *  Pure — no React, no I/O. The hook fetches; this decides.
 *
 *  WHY THE THRESHOLD IS THE POINT. The analytics tab has been showing
 *  "Top Posts" ranked by RECENCY with no metric attached, and a heatmap titled
 *  "Best Posting Times" whose legend reads Low→High engagement while it counts
 *  post VOLUME — so it recommends whenever you already post, which is circular.
 *  Both looked like insight and carried none. Replacing them with a real metric
 *  computed over one or two posts would repeat the mistake in a new costume:
 *  the number would be true and the conclusion still worthless.
 *
 *  So every claim here is gated on sample size and reports its own N. Below the
 *  threshold the honest answer is "not enough posts yet", not a ranking.
 */

/** Minimum measured posts before a pattern may be presented as a pattern.
 *  Matches the precedent already set by the weekly brief's MIN_POSTS_FOR_SIGNAL. */
export const MIN_POSTS_FOR_SIGNAL = 3;

/** One measurement of one post at one milestone, as stored in content_performance. */
export interface PerformanceRow {
  outstand_post_id: string;
  platform: string;
  milestone: string;
  captured_at: string;
  is_settled?: boolean | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  engagement_rate?: number | null;
}

export interface PostPerformance {
  outstandPostId: string;
  platform: string;
  milestone: string;
  capturedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  /** likes + comments + shares + saves. Deliberately NOT views. */
  interactions: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Total human interactions with a post.
 *
 * Views are excluded on purpose. A view is delivery, not response — mixing it in
 * lets one auto-played video outrank a post people actually replied to, which is
 * the opposite of the question a business is asking ("what should I post next?").
 * Views are still carried through for display.
 */
export function interactionsOf(row: PerformanceRow): number {
  return num(row.likes) + num(row.comments) + num(row.shares) + num(row.saves);
}

/**
 * Collapse many milestone rows into ONE row per post — the most recent
 * measurement, preferring a settled one.
 *
 * content_performance stores a row per (post, milestone): 24h, 72h, 7d. Ranking
 * without collapsing counts a post once per milestone, so the oldest posts —
 * the ones that have had time to accumulate all three — dominate any ranking on
 * count alone. That is the recency bug again, one layer down.
 */
export function latestPerPost(rows: readonly PerformanceRow[]): PostPerformance[] {
  const best = new Map<string, PerformanceRow>();
  for (const row of rows) {
    if (!row?.outstand_post_id) continue;
    const current = best.get(row.outstand_post_id);
    if (!current) {
      best.set(row.outstand_post_id, row);
      continue;
    }
    // Settled beats unsettled; otherwise the later capture wins.
    const rowSettled = row.is_settled === true;
    const curSettled = current.is_settled === true;
    if (rowSettled !== curSettled) {
      if (rowSettled) best.set(row.outstand_post_id, row);
      continue;
    }
    if (new Date(row.captured_at).getTime() > new Date(current.captured_at).getTime()) {
      best.set(row.outstand_post_id, row);
    }
  }

  return [...best.values()].map((row) => ({
    outstandPostId: row.outstand_post_id,
    platform: row.platform,
    milestone: row.milestone,
    capturedAt: row.captured_at,
    views: num(row.views),
    likes: num(row.likes),
    comments: num(row.comments),
    shares: num(row.shares),
    saves: num(row.saves),
    interactions: interactionsOf(row),
  }));
}

/** Highest interactions first. Ties broken by views, then by post id so the
 *  order is stable across renders rather than dependent on Map iteration. */
export function rankByEngagement(posts: readonly PostPerformance[]): PostPerformance[] {
  return [...posts].sort(
    (a, b) =>
      b.interactions - a.interactions ||
      b.views - a.views ||
      a.outstandPostId.localeCompare(b.outstandPostId),
  );
}

export type SignalVerdict =
  | { hasSignal: true; n: number }
  | { hasSignal: false; n: number; needed: number };

/**
 * May we present this as a pattern?
 *
 * Returns the counts either way so the UI can say "3 more posts needed" instead
 * of going blank for a reason the user cannot see. A silent empty state and a
 * genuine absence of data look identical, and only one of them is honest.
 */
export function signalVerdict(n: number, min: number = MIN_POSTS_FOR_SIGNAL): SignalVerdict {
  return n >= min ? { hasSignal: true, n } : { hasSignal: false, n, needed: min - n };
}
