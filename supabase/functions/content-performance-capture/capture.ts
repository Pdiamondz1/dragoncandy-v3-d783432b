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

// Returns the first finite, non-negative number among the candidate keys.
// Rejects NaN/Infinity, non-numbers, and negatives (all seven metrics are
// non-negative by nature — a negative is corrupt upstream data, so treat it as
// unknown/null rather than store garbage that would poison aggregations).
function pick(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

/**
 * Map Outstand's analytics payload to our columns. The real `/posts/{id}/analytics`
 * response (verified against prod 2026-06-10) nests the numbers under an
 * `aggregated_metrics` object with `total_*` / `average_*` field names:
 *   { post, success, aggregated_metrics: { total_views, total_likes, total_reach,
 *     total_shares, total_comments, total_impressions, average_engagement_rate },
 *     metrics_by_account: [...] }
 * We read from `aggregated_metrics` when present, else fall back to a flat top-level
 * shape. Field-name variants are tolerated and the full payload is stored separately
 * in `raw` by the caller, so any unmapped metric (incl. per-account detail) is never lost.
 */
export function normalizeAnalytics(raw: Record<string, unknown> | null | undefined): NormalizedMetrics {
  const o = raw ?? {};
  const agg = (o.aggregated_metrics && typeof o.aggregated_metrics === 'object')
    ? (o.aggregated_metrics as Record<string, unknown>)
    : o;
  return {
    views: pick(agg, ['total_views', 'views', 'viewCount', 'video_views', 'plays']),
    likes: pick(agg, ['total_likes', 'likes', 'likeCount', 'like_count']),
    comments: pick(agg, ['total_comments', 'comments', 'commentCount', 'comment_count']),
    shares: pick(agg, ['total_shares', 'shares', 'shareCount', 'share_count']),
    saves: pick(agg, ['total_saves', 'saves', 'saveCount', 'saved']),
    reach: pick(agg, ['total_reach', 'reach', 'total_impressions', 'impressions', 'reachCount']),
    engagement_rate: pick(agg, ['average_engagement_rate', 'engagementRate', 'engagement_rate']),
  };
}

export type MeasurementState =
  | 'measured'
  | 'empty_account_list'
  | 'null_metrics'
  | 'sparse_metrics'
  | 'no_payload';

export interface MeasurementVerdict {
  measured: boolean;
  state: MeasurementState;
  reason: string | null;
}

// Keys that carry an actual reading. `resolved_platform_post_id` is an
// identifier Outstand mixes into the same object and must NOT count as a metric.
// Mirrors every field-name variant `pick()` in normalizeAnalytics accepts, so
// classification never disagrees with mapping about what counts as a reading.
const METRIC_KEYS = [
  'views', 'likes', 'comments', 'shares', 'saves', 'reach', 'impressions',
  'total_views', 'total_likes', 'total_comments', 'total_shares', 'total_saves',
  'total_reach', 'total_impressions', 'engagement_rate', 'average_engagement_rate',
  'viewCount', 'video_views', 'plays', 'likeCount', 'like_count',
  'commentCount', 'comment_count', 'shareCount', 'share_count',
  'saveCount', 'saved', 'reachCount', 'engagementRate',
];

function hasReading(metrics: unknown): boolean {
  if (!metrics || typeof metrics !== 'object') return false;
  const m = metrics as Record<string, unknown>;
  return METRIC_KEYS.some((k) => {
    const v = m[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
  });
}

function reasonFor(e: Record<string, unknown>): string | null {
  const err = e.metrics_error;
  if (typeof err === 'string' && err.length > 0) return err;
  const metrics = (e.metrics ?? {}) as Record<string, unknown>;
  const ps = metrics.platform_specific;
  if (ps && typeof ps === 'object') {
    const note = (ps as Record<string, unknown>).note;
    if (typeof note === 'string' && note.length > 0) return note;
  }
  return null;
}

/**
 * Is this analytics payload an actual measurement?
 *
 * Outstand support confirmed (2026-08-05) that THREE different states all
 * surface as all-zero `aggregated_metrics`, and only one of them populates
 * `metrics_error`. So "measured" must be decided by the presence of a real
 * reading on at least one account — never by `success: true`, never by the
 * absence of an error, never by the aggregate alone. A genuine zero arrives as
 * an OBJECT of zeros and is correctly classified as measured.
 */
export function classifyMeasurement(raw: unknown): MeasurementVerdict {
  if (!raw || typeof raw !== 'object') {
    return { measured: false, state: 'no_payload', reason: null };
  }
  const list = (raw as Record<string, unknown>).metrics_by_account;
  if (!Array.isArray(list) || list.length === 0) {
    return { measured: false, state: 'empty_account_list', reason: null };
  }
  const entries = list.filter(
    (e): e is Record<string, unknown> => !!e && typeof e === 'object',
  );
  // A non-empty array whose elements are all falsy/non-object (e.g. [null, null])
  // leaves no usable per-account data — that IS empty_account_list, not
  // null_metrics. Without this check, `entries.every(...)` below is vacuously
  // true on an empty `entries` array and mislabels the state.
  if (entries.length === 0) {
    return { measured: false, state: 'empty_account_list', reason: null };
  }
  if (entries.some((e) => hasReading(e.metrics))) {
    return { measured: true, state: 'measured', reason: null };
  }
  const reason = entries.map(reasonFor).find((r) => r !== null) ?? null;
  const state: MeasurementState = entries.every((e) => e.metrics === null)
    ? 'null_metrics'
    : 'sparse_metrics';
  return { measured: false, state, reason };
}
