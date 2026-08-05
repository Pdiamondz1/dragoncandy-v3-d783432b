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

/**
 * Map Outstand's analytics payload to columns for exactly ONE platform,
 * reading that platform's own `metrics_by_account[]` entry instead of the
 * cross-account `aggregated_metrics` (which Outstand sums across every
 * connected account on the post). Using the aggregate per-platform would
 * make every platform's row claim the whole post's engagement.
 *
 * The network-identifying field was verified against the 9 real
 * `content_performance` rows on prod (`raw`, inspected 2026-08-05 via
 * read-only `execute_sql`) — every `metrics_by_account[]` entry nests it
 * under `social_account.network`, e.g.
 *   { metrics: {...}|null, published_at, platform_post_id,
 *     social_account: { id, network, nickname, username } }
 * never a top-level `network`/`platform` key. Matching is exact
 * (case-sensitive): every observed prod value is a lowercase network name,
 * and `social_post_log.platform` (the `platform` argument here) is sourced
 * from that same Outstand `network` field at the webhook choke point
 * (outstand-webhook/index.ts), so the two always share casing — there is no
 * observed data to justify folding case.
 *
 * Returns `null` — never zeros — when there is no reading for this
 * platform: no matching entry, a null `metrics` (spec §0b state 1,
 * retrieval failed), or an entry whose `metrics` carries no recognized
 * numeric field at all (state 3, "the real ambiguity gap" — e.g. `{}` or
 * all-null). A genuine zero reading (at least one real 0 among the
 * recognized keys) is returned, not null — same discipline as
 * classifyMeasurement's hasReading().
 */
export function metricsForPlatform(
  raw: Record<string, unknown> | null | undefined,
  platform: string,
): NormalizedMetrics | null {
  if (!raw || typeof raw !== 'object') return null;
  const list = raw.metrics_by_account;
  if (!Array.isArray(list)) return null;

  const entry = list.find((e) => {
    if (!e || typeof e !== 'object') return false;
    const acct = (e as Record<string, unknown>).social_account;
    if (!acct || typeof acct !== 'object') return false;
    return (acct as Record<string, unknown>).network === platform;
  }) as Record<string, unknown> | undefined;
  if (!entry) return null;

  const metrics = entry.metrics;
  if (!metrics || typeof metrics !== 'object') return null; // state 1: retrieval failed

  const m = metrics as Record<string, unknown>;
  const result: NormalizedMetrics = {
    views: pick(m, ['total_views', 'views', 'viewCount', 'video_views', 'plays']),
    likes: pick(m, ['total_likes', 'likes', 'likeCount', 'like_count']),
    comments: pick(m, ['total_comments', 'comments', 'commentCount', 'comment_count']),
    shares: pick(m, ['total_shares', 'shares', 'shareCount', 'share_count']),
    saves: pick(m, ['total_saves', 'saves', 'saveCount', 'saved']),
    reach: pick(m, ['total_reach', 'reach', 'total_impressions', 'impressions', 'reachCount']),
    engagement_rate: pick(m, ['average_engagement_rate', 'engagementRate', 'engagement_rate']),
  };
  // State 3: metrics present but contributes nothing recognizable — the same
  // "no reading" as no entry at all. Never fabricate a zero-filled row.
  const allNull = Object.values(result).every((v) => v === null);
  return allNull ? null : result;
}

export interface RunOutcomeCounters {
  /** Posts fetched for this run (before any per-post skip). */
  postsSeen: number;
  /** Rows actually inserted into content_performance. */
  inserted: number;
  /** Posts whose insert failed and were counted rather than silently dropped. */
  insertErrors: number;
}

/**
 * Should this run be reported as a failure to the caller (cron)?
 *
 * A run that saw zero due posts is not a failure — "nothing to do" is the
 * normal, expected steady state and must stay 200. A run that inserted
 * something is making progress even if some posts also errored. The one
 * shape that must NOT read as healthy is: posts were there, at least one
 * insert errored, and NOTHING made it in — the exact signature of deploying
 * this function ahead of a migration it depends on (every insert rejected
 * by the DB). Before this predicate that shape returned 200 like any other
 * quiet run, because the cron's fire-and-forget net.http_post never reads
 * the response body.
 */
export function isCaptureRunFailed(counters: RunOutcomeCounters): boolean {
  return counters.postsSeen > 0 && counters.inserted === 0 && counters.insertErrors > 0;
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
