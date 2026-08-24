/**
 * Reading Instagram account insights, honestly.
 *
 * The rules here are [[Honest Analytics]]'s, and they are the same rules the
 * YouTube connector follows, because the failure they prevent is the same one:
 * a dashboard that cannot tell "we have no data" from "the data is zero" will
 * eventually show a business a row of zeros and let them conclude their
 * marketing failed.
 *
 *   - An empty result is ZERO ROWS, never a row of zeros.
 *   - Every figure states its N. `days_with_data` is reported rather than the
 *     window requested, because Meta's data lags by up to 48 hours and a
 *     connector that echoes the requested window is indistinguishable from one
 *     that fabricated the answer.
 *   - Averages are DERIVED FROM TOTALS, never averaged from daily averages.
 *   - Rows are read BY NAME. Instagram returns each metric as a named object, so
 *     this is cheaper to honour than YouTube's positional `columnHeaders` — but
 *     the rule is stated anyway, because the next connector may not be so kind.
 */

// deno-lint-ignore-file no-explicit-any

import { InstagramError, INSTAGRAM_INTERNALS } from './instagram.ts';

const { IG_GRAPH, IG_VERSION } = INSTAGRAM_INTERNALS;

/**
 * The metrics requested, and why this list is short.
 *
 * Meta rejects the WHOLE request if any single metric is invalid for the
 * account, the period or the API version — there is no partial success. So each
 * addition risks taking every other figure down with it, and the list is kept to
 * metrics documented for `period=day` with `metric_type=time_series`.
 *
 * Deliberately excluded:
 *   - `impressions` — deprecated for v22.0+ (Meta, 2025-04-21). `views` replaces
 *     it. Requesting it would fail the entire call on the pinned version.
 *   - `follower_demographics` / `engaged_audience_demographics` — these need
 *     `metric_type=total_value` and a `timeframe`, so they cannot ride in this
 *     request at all, and Meta does not serve them below 100 followers. A
 *     separate call, if ever wanted, not a wider `metric` parameter.
 */
export const DAILY_METRICS = [
  'reach',
  'views',
  'total_interactions',
  'likes',
  'comments',
  'shares',
  'saves',
] as const;

export type DailyMetric = (typeof DAILY_METRICS)[number];

/** Meta serves at most 30 days of daily insights per request. */
export const MAX_WINDOW_DAYS = 30;

export interface DailyPoint {
  /** ISO date (YYYY-MM-DD) the value belongs to. */
  date: string;
  value: number;
}

export interface InsightsSummary {
  /** The window we ASKED for, in days. Never presented as the window we got. */
  requested_days: number;
  /**
   * Distinct days Instagram actually returned data for.
   *
   * This is the number the UI shows. Meta lags by up to 48 hours, so it is
   * normally lower than `requested_days`, and that gap is the signal that the
   * figures came from Instagram rather than from a fallback.
   */
  days_with_data: number;
  /** Sum over the returned days, per metric. Absent metric => absent key. */
  totals: Partial<Record<DailyMetric, number>>;
  /**
   * Interactions per reached account, derived from the TWO TOTALS.
   *
   * Not a mean of daily rates: a day with 2 reach and 1 interaction would
   * otherwise weigh as heavily as a day with 20,000 reach, and the headline
   * figure would be dominated by the quietest days. Null when reach is zero or
   * either total is missing — an undefined ratio is not 0.
   */
  interactions_per_reach: number | null;
  /** Per-metric daily series, for a chart. Empty when nothing was returned. */
  series: Partial<Record<DailyMetric, DailyPoint[]>>;
}

/**
 * A metric value, or null when Meta did not report one.
 *
 * This exists because the obvious guard is WRONG in the exact direction this
 * whole module is about, and it looks right. `Number.isFinite(Number(x))` admits
 * `null` — `Number(null)` is **0**, which is finite — so a day Instagram
 * reported nothing for becomes a day with zero reach. It admits `''`, `[]` and
 * `false` for the same reason. The totals still add up, so nothing looks wrong;
 * only the day COUNT betrays it, and only if something is checking.
 *
 * (Caught by `instagram-insights.test.ts` against this module's first draft,
 * which used precisely that guard.)
 *
 * Numeric strings ARE accepted: Meta's JSON is not consistent about quoting, and
 * rejecting "42" would discard real data.
 */
function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** `end_time` is an ISO instant; the calendar date is what a daily metric means. */
function toDate(endTime: unknown): string | null {
  if (typeof endTime !== 'string') return null;
  const parsed = Date.parse(endTime);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Turn Meta's response into a summary, keeping every honesty rule above.
 *
 * Exported and pure so the rules are testable without a network call — the
 * fabricated-zero mistake is a data-shape mistake, and a test that has to reach
 * Instagram to catch it will not be written.
 */
export function summarize(payload: any, requestedDays: number): InsightsSummary {
  const series: Partial<Record<DailyMetric, DailyPoint[]>> = {};
  const totals: Partial<Record<DailyMetric, number>> = {};
  const days = new Set<string>();

  const entries = Array.isArray(payload?.data) ? payload.data : [];

  for (const entry of entries) {
    // BY NAME. The position of a metric in `data` is Meta's business, not ours.
    const name = entry?.name;
    if (!DAILY_METRICS.includes(name)) continue;
    const metric = name as DailyMetric;

    const points: DailyPoint[] = [];
    let sum = 0;

    for (const v of Array.isArray(entry?.values) ? entry.values : []) {
      const date = toDate(v?.end_time);
      const value = toNumber(v?.value);
      // A non-numeric value is DROPPED, not coerced to 0 — see `toNumber`, which
      // exists because the obvious `Number.isFinite(Number(x))` guard does not
      // do this and looks like it does.
      if (!date || value === null) continue;
      points.push({ date, value });
      sum += value;
      days.add(date);
    }

    // A metric Instagram returned with no usable points contributes NO key,
    // rather than a zero. Absent and zero are different answers.
    if (points.length === 0) continue;

    points.sort((a, b) => a.date.localeCompare(b.date));
    series[metric] = points;
    totals[metric] = sum;
  }

  const reach = totals.reach;
  const interactions = totals.total_interactions;
  const ratio =
    typeof reach === 'number' && typeof interactions === 'number' && reach > 0
      ? interactions / reach
      : null;

  return {
    requested_days: requestedDays,
    days_with_data: days.size,
    totals,
    interactions_per_reach: ratio,
    series,
  };
}

/**
 * Is this failure Meta telling us to slow down rather than to reauthorize?
 *
 * The YouTube connector learned this the expensive way: HTTP 403 means two
 * opposite things, and treating a quota failure as an authorization failure
 * would tell EVERY user on the platform to reconnect during one hour of rate
 * limiting. Meta signals throttling with codes 4 (app-level), 17 (user-level)
 * and 32/613 (page/rate), and with `is_transient`.
 */
export function isRateLimited(payload: any, status: number): boolean {
  const err = payload?.error;
  const code = Number(err?.code);
  if ([4, 17, 32, 613].includes(code)) return true;
  if (err?.is_transient === true) return true;
  return status === 429;
}

/**
 * Does this failure mean the grant is gone?
 *
 * Meta code 190 is the invalid/expired access token. Subcodes distinguish
 * "expired" from "user changed password" from "user revoked", none of which we
 * can fix without the user — so all of them land on `needs_reconnect`.
 */
export function isAuthFailure(payload: any): boolean {
  return Number(payload?.error?.code) === 190;
}

export interface FetchInsightsOptions {
  igUserId: string;
  accessToken: string;
  days?: number;
}

/**
 * Fetch daily insights for an account.
 *
 * `since`/`until` are Unix SECONDS, not milliseconds — a milliseconds value is
 * accepted by the URL builder and silently returns nothing, which reads exactly
 * like an account with no activity.
 */
export async function fetchDailyInsights(
  opts: FetchInsightsOptions,
): Promise<InsightsSummary> {
  const days = Math.min(Math.max(1, opts.days ?? MAX_WINDOW_DAYS), MAX_WINDOW_DAYS);
  const untilMs = Date.now();
  const sinceMs = untilMs - days * 24 * 60 * 60 * 1000;

  const params = new URLSearchParams({
    metric: DAILY_METRICS.join(','),
    period: 'day',
    metric_type: 'time_series',
    since: String(Math.floor(sinceMs / 1000)),
    until: String(Math.floor(untilMs / 1000)),
    access_token: opts.accessToken,
  });

  const resp = await fetch(
    `${IG_GRAPH}/${IG_VERSION}/${encodeURIComponent(opts.igUserId)}/insights?${params}`,
  );

  const text = await resp.text();
  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  if (!resp.ok) {
    if (isRateLimited(payload, resp.status)) {
      throw new InstagramError(
        'rate_limited',
        'Instagram is rate limiting this app — try again shortly',
        429,
      );
    }
    if (isAuthFailure(payload)) {
      throw new InstagramError(
        'needs_reconnect',
        'Instagram rejected the access token — the user must reconnect',
        401,
      );
    }
    console.error('[instagram] insights failed:', resp.status, text.slice(0, 300));
    throw new InstagramError('insights_failed', 'Could not read Instagram insights', 502);
  }

  return summarize(payload, days);
}
