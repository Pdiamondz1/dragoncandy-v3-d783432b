// Pure, dependency-free capture logic. Imported by both the Deno edge function
// (index.ts) and the Vitest unit test, so it must NOT reference Deno, Node,
// Supabase, or any I/O.

export type Milestone = '24h' | '72h' | '7d';

const MILESTONE_HOURS: Record<Milestone, number> = { '24h': 24, '72h': 72, '7d': 168 };
const ORDER: Milestone[] = ['24h', '72h', '7d'];

/**
 * Milestones a post is due for: age past the threshold AND not yet captured.
 * "First observation after the threshold" semantics — with a once-daily cron a
 * post can cross two thresholds between runs, so all uncaptured-but-crossed
 * milestones are returned (in order) and inserted the first time observed.
 */
export function milestonesDue(
  createdAt: Date,
  now: Date,
  alreadyCaptured: Set<Milestone>,
): Milestone[] {
  const ageHours = (now.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
  return ORDER.filter((m) => ageHours >= MILESTONE_HOURS[m] && !alreadyCaptured.has(m));
}

export interface NormalizedMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  engagement_rate: number | null;
}

function pick(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Map Outstand's (unconfirmed, variant-prone) analytics payload to our columns.
 * Tolerant of field-name variants; the full payload is stored separately in `raw`
 * by the caller, so any unmapped metric is never lost.
 */
export function normalizeAnalytics(raw: Record<string, unknown>): NormalizedMetrics {
  const o = raw ?? {};
  return {
    views: pick(o, ['views', 'viewCount', 'video_views', 'plays']),
    likes: pick(o, ['likes', 'likeCount', 'like_count']),
    comments: pick(o, ['comments', 'commentCount', 'comment_count']),
    shares: pick(o, ['shares', 'shareCount', 'share_count']),
    saves: pick(o, ['saves', 'saveCount', 'saved']),
    reach: pick(o, ['reach', 'impressions', 'reachCount']),
    engagement_rate: pick(o, ['engagementRate', 'engagement_rate']),
  };
}
