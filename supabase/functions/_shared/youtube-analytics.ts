/**
 * YouTube reporting reads.
 *
 * Split from `youtube.ts` on a real seam: that module is OAuth and identity
 * (consent, tokens, which channel is this), this one is reporting. They change
 * for different reasons — a scope decision touches the first, a new metric
 * touches the second.
 *
 * `youtube.readonly` alone does NOT deliver any of this. It returns video lists
 * and lifetime counters; day-by-day series and watch time come from the
 * Analytics API under `yt-analytics.readonly`. That is why both scopes are
 * requested, and why a caller should check the connection's stored `scopes`
 * before getting here rather than discovering it as a 403.
 */

// deno-lint-ignore-file no-explicit-any

import { YouTubeError } from './youtube.ts';

const YOUTUBE_ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

/** Channel-level metrics for the daily series. */
const DAILY_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'subscribersGained',
  'subscribersLost',
  'likes',
  'comments',
  'shares',
] as const;

/** Per-video metrics for the top-videos table. */
const VIDEO_METRICS = ['views', 'estimatedMinutesWatched', 'likes', 'comments'] as const;

export interface AnalyticsReport {
  /** Column names in row order, straight from Google. */
  columns: string[];
  rows: (string | number)[][];
}

/**
 * The `reason` values Google uses for "you asked too often", all of which
 * arrive as HTTP 403 — the same status as a real authorization refusal.
 */
const QUOTA_REASONS = new Set([
  'quotaExceeded',
  'dailyLimitExceeded',
  'dailyLimitExceededUnreg',
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'servingLimitExceeded',
  'backendQuotaExceeded',
]);

/**
 * Is this 403 about quota rather than permission?
 *
 * Checks both shapes Google emits: the classic `error.errors[].reason` and the
 * newer `error.status: "RESOURCE_EXHAUSTED"`. The status check is what keeps a
 * quota reason we have not enumerated from being misread as an auth failure.
 *
 * The default is deliberately the other way: an unrecognised 403 is treated as
 * an authorization problem, because a genuinely refused connection is a state
 * the user must act on, and quota is the enumerable exception.
 */
export function isQuotaFailure(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error?.status === 'RESOURCE_EXHAUSTED') return true;
    const reasons: string[] = (parsed?.error?.errors ?? []).map((e: any) => e?.reason);
    return reasons.some((r) => QUOTA_REASONS.has(r));
  } catch {
    // Not JSON — an HTML error page or a proxy response. Nothing here says
    // quota, so it falls through to the authorization branch.
    return false;
  }
}

/**
 * `ids=channel==MINE` rather than `channel==UC…`.
 *
 * MINE resolves to the channel the ACCESS TOKEN was issued for, so it cannot be
 * pointed at another account's channel by any value we store or any value a
 * client sends — the same reasoning as `mine=true` in `fetchOwnChannel`, and the
 * same class of defect avoided as the client-writable post id PR #366 closed.
 */
async function runReport(
  accessToken: string,
  params: Record<string, string>,
): Promise<AnalyticsReport> {
  const query = new URLSearchParams({ ids: 'channel==MINE', ...params });
  const resp = await fetch(`${YOUTUBE_ANALYTICS_URL}?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error('[youtube-analytics] report failed:', resp.status, body.slice(0, 300));

    // A 403 is NOT automatically an authorization problem — Google overloads it
    // for quota and rate limiting too. That distinction is load-bearing: the
    // caller persists `needs_reconnect` on this error, so classifying a
    // project-wide `quotaExceeded` as an auth failure would tell every user on
    // the platform to reauthorize because we ran out of quota for an hour.
    if (resp.status === 403 && isQuotaFailure(body)) {
      throw new YouTubeError(
        'quota_exceeded',
        'YouTube is rate-limiting us right now — try again shortly',
        503,
      );
    }

    if (resp.status === 401 || resp.status === 403) {
      // The genuine refusals: the token no longer carries the scope, or the
      // account cannot read this channel's analytics. Both are fixed by
      // reconnecting, so they surface as one actionable code rather than two
      // opaque ones.
      throw new YouTubeError(
        'needs_reconnect',
        'Google refused the analytics request — reconnect the channel',
        401,
      );
    }
    throw new YouTubeError('analytics_failed', 'Could not read YouTube analytics', 502);
  }

  const data = await resp.json();
  return {
    columns: (data?.columnHeaders ?? []).map((h: any) => h?.name ?? ''),
    // An empty report is a REAL and common answer — a channel with no views in
    // the range, or days Google has not finished processing. It stays zero rows
    // and is never synthesised into a row of zeros, which would be
    // indistinguishable from a genuine zero day. See [[Honest Analytics]].
    rows: data?.rows ?? [],
  };
}

/** Day-by-day channel performance across the range. */
export function fetchDailyReport(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<AnalyticsReport> {
  return runReport(accessToken, {
    startDate,
    endDate,
    metrics: DAILY_METRICS.join(','),
    dimensions: 'day',
    sort: 'day',
  });
}

/** Highest-viewed videos in the range — genuinely ranked by views, not recency. */
export function fetchTopVideosReport(
  accessToken: string,
  startDate: string,
  endDate: string,
  limit = 10,
): Promise<AnalyticsReport> {
  return runReport(accessToken, {
    startDate,
    endDate,
    metrics: VIDEO_METRICS.join(','),
    dimensions: 'video',
    sort: '-views',
    maxResults: String(limit),
  });
}

/**
 * Resolve video ids to titles via the Data API.
 *
 * Best-effort by design: a missing title degrades a row to its video id, which
 * is still true. Failing the whole analytics read because a title lookup 500'd
 * would trade real data for cosmetics.
 */
export async function fetchVideoTitles(
  accessToken: string,
  videoIds: string[],
): Promise<Record<string, string>> {
  if (videoIds.length === 0) return {};
  try {
    const ids = videoIds.map(encodeURIComponent).join(',');
    const resp = await fetch(`${YOUTUBE_VIDEOS_URL}?part=snippet&id=${ids}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      console.warn('[youtube-analytics] videos.list failed:', resp.status);
      return {};
    }
    const data = await resp.json();
    const titles: Record<string, string> = {};
    for (const item of data?.items ?? []) {
      if (item?.id) titles[item.id] = item?.snippet?.title ?? '';
    }
    return titles;
  } catch (err) {
    console.warn('[youtube-analytics] videos.list threw:', err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Row shaping
// ---------------------------------------------------------------------------

export interface DailyPoint {
  date: string;
  views: number;
  minutes_watched: number;
  avg_view_duration_seconds: number;
  subscribers_gained: number;
  subscribers_lost: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface TopVideo {
  video_id: string;
  title: string | null;
  views: number;
  minutes_watched: number;
  likes: number;
  comments: number;
}

/**
 * Read rows by COLUMN NAME, never by position.
 *
 * Google returns `columnHeaders` alongside `rows` precisely because the order is
 * a property of the response, not a constant. Indexing by position works right
 * up until a metric is added to the request list, at which point every figure
 * silently shifts one column and the dashboard shows confident, wrong numbers.
 */
function indexer(columns: string[]) {
  const positions = new Map(columns.map((name, i) => [name, i]));
  return (row: (string | number)[], name: string): number => {
    const i = positions.get(name);
    const value = i === undefined ? 0 : row[i];
    return typeof value === 'number' ? value : Number(value) || 0;
  };
}

export function shapeDaily(report: AnalyticsReport): DailyPoint[] {
  const at = indexer(report.columns);
  const dayIndex = report.columns.indexOf('day');
  return report.rows.map((row) => ({
    date: dayIndex >= 0 ? String(row[dayIndex]) : '',
    views: at(row, 'views'),
    minutes_watched: at(row, 'estimatedMinutesWatched'),
    avg_view_duration_seconds: at(row, 'averageViewDuration'),
    subscribers_gained: at(row, 'subscribersGained'),
    subscribers_lost: at(row, 'subscribersLost'),
    likes: at(row, 'likes'),
    comments: at(row, 'comments'),
    shares: at(row, 'shares'),
  }));
}

export function shapeTopVideos(
  report: AnalyticsReport,
  titles: Record<string, string>,
): TopVideo[] {
  const at = indexer(report.columns);
  const videoIndex = report.columns.indexOf('video');
  return report.rows.map((row) => {
    const videoId = videoIndex >= 0 ? String(row[videoIndex]) : '';
    return {
      video_id: videoId,
      // null, not the id: the caller can then decide to show the id rather than
      // being handed one and told it is a title.
      title: titles[videoId] || null,
      views: at(row, 'views'),
      minutes_watched: at(row, 'estimatedMinutesWatched'),
      likes: at(row, 'likes'),
      comments: at(row, 'comments'),
    };
  });
}

export function videoIdsOf(report: AnalyticsReport): string[] {
  const videoIndex = report.columns.indexOf('video');
  if (videoIndex < 0) return [];
  return report.rows.map((row) => String(row[videoIndex])).filter(Boolean);
}

export interface AnalyticsTotals {
  views: number;
  minutes_watched: number;
  avg_view_duration_seconds: number;
  subscribers_gained: number;
  subscribers_lost: number;
  net_subscribers: number;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * Totals across the range.
 *
 * Sums are sums; the average is DERIVED. Averaging `avg_view_duration_seconds`
 * across days would give a day with 3 views the same weight as a day with
 * 3,000 — a plausible-looking number that is simply wrong.
 */
export function totalsOf(daily: DailyPoint[]): AnalyticsTotals {
  const sum = (pick: (d: DailyPoint) => number) => daily.reduce((acc, d) => acc + pick(d), 0);
  const views = sum((d) => d.views);
  const minutesWatched = sum((d) => d.minutes_watched);
  const gained = sum((d) => d.subscribers_gained);
  const lost = sum((d) => d.subscribers_lost);

  return {
    views,
    minutes_watched: minutesWatched,
    // Guarded: an empty range means no answer, and 0 is the honest placeholder —
    // NaN would render as "NaN seconds" on a brand-new channel.
    avg_view_duration_seconds: views > 0 ? Math.round((minutesWatched * 60) / views) : 0,
    subscribers_gained: gained,
    subscribers_lost: lost,
    net_subscribers: gained - lost,
    likes: sum((d) => d.likes),
    comments: sum((d) => d.comments),
    shares: sum((d) => d.shares),
  };
}

/**
 * Format a Date as the `YYYY-MM-DD` the Analytics API requires.
 *
 * Deliberately UTC via toISOString. Building it from local `getMonth()`/
 * `getDate()` would shift the window by a day depending on where the process
 * runs — this project has already paid once for a date-vs-instant confusion
 * (`campaigns.deadline`, docs/DATABASE_SCHEMA.md).
 */
export function toApiDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
