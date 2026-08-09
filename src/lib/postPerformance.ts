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
// Deliberate duplicate of supabase/functions/_shared/social-signal.ts.
// src/ cannot import from supabase/functions/, so this value is mirrored, not
// shared. If you change it, change it there too — the edge side is canonical.
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
  /** Every platform this post was measured on, sorted for stable display. */
  platforms: string[];
  capturedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  /** likes + comments + shares + saves, SUMMED across platforms.
   *  Deliberately NOT views. */
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
 * Collapse raw measurement rows into ONE entry per post.
 *
 * TWO stages, and both matter:
 *
 * 1. Per (post, PLATFORM): keep the best single milestone — settled preferred,
 *    otherwise the latest capture. content_performance stores a row per
 *    milestone (24h, 72h, 7d), so without this a post is counted once per
 *    milestone and the oldest posts — the only ones to have accumulated all
 *    three — dominate. That is the recency bug again, one layer down.
 *
 * 2. Across platforms: SUM. The unique key is
 *    `(outstand_post_id, platform, milestone)`, so a post fanned out to
 *    Instagram + YouTube + TikTok has a separate row per platform. Collapsing
 *    straight to post id would keep whichever platform happened to win the
 *    comparison and silently DISCARD the rest, so a cross-posted hit could rank
 *    below a single-platform post with fewer total interactions. The question
 *    the ranking answers is "how did this post do", and that is the sum of
 *    everywhere it ran.
 */
export function latestPerPost(rows: readonly PerformanceRow[]): PostPerformance[] {
  // Stage 1 — best milestone per (post, platform).
  const bestPerPlatform = new Map<string, PerformanceRow>();
  for (const row of rows) {
    if (!row?.outstand_post_id) continue;
    // Composite key. The separator is an escaped NUL rather than a literal
    // one: a literal NUL makes git classify this file as BINARY, so diffs
    // and reviews of it stop working. \u0000 cannot occur in a provider post
    // id or a platform name, so the key still cannot collide.
    const key = `${row.outstand_post_id}\u0000${row.platform ?? ''}`;
    const current = bestPerPlatform.get(key);
    if (!current) {
      bestPerPlatform.set(key, row);
      continue;
    }
    const rowSettled = row.is_settled === true;
    const curSettled = current.is_settled === true;
    if (rowSettled !== curSettled) {
      if (rowSettled) bestPerPlatform.set(key, row);
      continue;
    }
    if (new Date(row.captured_at).getTime() > new Date(current.captured_at).getTime()) {
      bestPerPlatform.set(key, row);
    }
  }

  // Stage 2 — sum the surviving platform rows into one entry per post.
  const byPost = new Map<string, PostPerformance>();
  for (const row of bestPerPlatform.values()) {
    const id = row.outstand_post_id;
    const acc = byPost.get(id) ?? {
      outstandPostId: id,
      platforms: [],
      capturedAt: row.captured_at,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      interactions: 0,
    };

    if (row.platform && !acc.platforms.includes(row.platform)) acc.platforms.push(row.platform);
    acc.views += num(row.views);
    acc.likes += num(row.likes);
    acc.comments += num(row.comments);
    acc.shares += num(row.shares);
    acc.saves += num(row.saves);
    acc.interactions += interactionsOf(row);
    // The post's capture time is the most recent across its platforms.
    if (new Date(row.captured_at).getTime() > new Date(acc.capturedAt).getTime()) {
      acc.capturedAt = row.captured_at;
    }

    byPost.set(id, acc);
  }

  for (const entry of byPost.values()) entry.platforms.sort();
  return [...byPost.values()];
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

/**
 * The verdict for the posts ACTUALLY BEING RENDERED, not for the account.
 *
 * The analytics tab has a platform filter and passes the filtered list down. A
 * verdict computed over every measured post in the account would let a view
 * showing only unmeasured posts flip into "ranked" mode: the ranking would then
 * discard every post on screen, and the heatmap would confidently title an
 * all-zero grid "Best Posting Times". The claim has to be gated by the evidence
 * present in the thing the user is looking at.
 */
export function signalForVisible(
  visiblePostIds: readonly string[],
  measuredIds: ReadonlySet<string>,
  min: number = MIN_POSTS_FOR_SIGNAL,
): SignalVerdict {
  let measured = 0;
  const counted = new Set<string>();
  for (const id of visiblePostIds) {
    if (!id || counted.has(id)) continue;
    counted.add(id);
    if (measuredIds.has(id)) measured++;
  }
  return signalVerdict(measured, min);
}
