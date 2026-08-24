/**
 * Facebook Page Insights: request, degrade, and summarize honestly.
 *
 * The honesty rules are [[Honest Analytics]]'s and match `instagram-insights.ts`
 * deliberately — an absent metric is an em dash, never a zero; the window we
 * REPORT is the window Meta returned, never the one we asked for; and a ratio is
 * derived from two totals rather than averaged from daily ratios.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS MODULE IS SHAPED AROUND
 *
 * Two facts about this API combine badly:
 *
 *   (a) Meta rejects the WHOLE request if any single metric is invalid. There is
 *       no partial success — one bad name and every other figure is lost too.
 *   (b) The valid metric set changes underneath us, across ALL API versions, so
 *       pinning a version does not protect us. Meta deprecated 85 Page Insights
 *       metrics on 2026-06-15, most of them reach/unique-impressions, and
 *       replaced the impressions family with views.
 *
 * Together those mean a hardcoded metric list is a card that works until Meta
 * publishes a deprecation, and then shows nothing at all — with an error naming
 * a metric, not a cause.
 *
 * Worse, the valid set could not be established from the documentation when this
 * was written: Meta's own Page Insights page lists `page_impressions_unique` as
 * an example while the Graph API reference marks it deprecated above v25. So the
 * live API is the only authority, and this module is built to ask it rather than
 * to assume.
 *
 * WHAT IT DOES INSTEAD. Request the candidate list; if Meta rejects it for an
 * invalid metric, drop the metric Meta NAMED and retry, bounded. Whatever
 * survives is returned, and whatever was dropped is REPORTED in
 * `unavailable_metrics` rather than quietly omitted — because a metric that
 * vanished and a metric that read zero must not look the same, which is the
 * whole point of the surrounding honesty rules.
 *
 * This is deliberately NOT a per-metric fan-out. Seven separate requests would
 * always work and would cost seven times the rate limit on every load, to buy
 * resilience against something that happens a few times a year. Degrading on
 * failure pays that cost only when Meta actually changes something.
 * ---------------------------------------------------------------------------
 */

// deno-lint-ignore-file no-explicit-any

import { FacebookError, FACEBOOK_INTERNALS } from './facebook-pages.ts';

const { FB_GRAPH, FB_VERSION } = FACEBOOK_INTERNALS;

/**
 * The metrics we ASK for. Every one is a candidate, not a guarantee — see the
 * header for why no list can be guaranteed on this API.
 *
 * Chosen to survive the 2026-06-15 deprecation, which removed the reach and
 * unique-impressions families and replaced impressions with views:
 *
 *   - `page_views_total`        — Page views. Views-based, the replacement family.
 *   - `page_post_engagements`   — engagement actions on Page content.
 *   - `page_daily_follows`      — follows gained. `page_fans` (lifetime total) was
 *                                 deprecated; the daily delta is the survivor and
 *                                 is the more useful number anyway.
 *   - `page_daily_unfollows`    — the other side of it. A follow count without
 *                                 unfollows flatters, which is the failure mode
 *                                 [[Honest Analytics]] exists to prevent.
 *   - `page_actions_post_reactions_like_total` — reactions.
 *
 * Deliberately excluded:
 *   - `page_impressions*`       — deprecated, replaced by views.
 *   - `page_impressions_unique` and every other *_unique — the reach family, the
 *                                 bulk of the 85 removed in June 2026.
 *   - `page_fans`               — deprecated (Meta, Page Insights API Updates).
 *   - demographics (`page_fans_city` and friends) — these need a different
 *                                 `period`/`metric_type` and cannot ride in this
 *                                 request at all. A separate call, if ever
 *                                 wanted, not a wider `metric` parameter.
 */
export const PAGE_DAILY_METRICS = [
  'page_views_total',
  'page_post_engagements',
  'page_daily_follows',
  'page_daily_unfollows',
  'page_actions_post_reactions_like_total',
] as const;

export type PageMetric = string;

/** Meta serves at most 93 days of daily Page insights; we ask for far less. */
export const MAX_WINDOW_DAYS = 30;

/** Bounds the degrade-and-retry loop, so a pathological response cannot spin. */
export const MAX_METRIC_RETRIES = 4;

export interface DailyPoint {
  date: string;
  value: number;
}

export interface PageInsightsSummary {
  /** The window we ASKED for. Never presented as the window we got. */
  requested_days: number;
  /**
   * Distinct days Meta actually returned data for. This is the number the UI
   * shows. Meta lags, so it is normally lower than `requested_days`.
   */
  days_with_data: number;
  /** Sum over returned days, per metric. Absent metric => absent key, never 0. */
  totals: Record<string, number>;
  /** Per-metric daily series, for a chart. */
  series: Record<string, DailyPoint[]>;
  /**
   * Metrics we asked for and could not get, with Meta's reason.
   *
   * Reported rather than silently dropped. A caller that cannot distinguish
   * "this metric is gone" from "this metric was zero" will eventually render a
   * deprecation as a business collapse.
   */
  unavailable_metrics: string[];
}

/**
 * A metric value, or null when Meta did not report one.
 *
 * The obvious guard is wrong in the exact direction this module is about, and it
 * looks right: `Number.isFinite(Number(x))` admits `null`, because `Number(null)`
 * is 0 and 0 is finite. A day Meta reported nothing for would become a day with
 * zero views. Totals still add up, so nothing looks broken — only the day count
 * betrays it. (The same bug was caught in the Instagram connector's first draft.)
 *
 * Numeric strings ARE accepted: Meta's JSON is inconsistent about quoting, and
 * rejecting "42" would discard real data.
 */
export function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toDate(endTime: unknown): string | null {
  if (typeof endTime !== 'string') return null;
  const parsed = Date.parse(endTime);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Turn Meta's response into a summary.
 *
 * Pure and exported so every honesty rule is testable without a network call —
 * the fabricated-zero mistake is a data-shape mistake, and a test that has to
 * reach Facebook to catch it does not get written.
 */
export function summarize(
  payload: any,
  requestedDays: number,
  unavailable: string[] = [],
): PageInsightsSummary {
  const totals: Record<string, number> = {};
  const series: Record<string, DailyPoint[]> = {};
  const days = new Set<string>();

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  for (const row of rows) {
    const name = typeof row?.name === 'string' ? row.name : null;
    if (!name) continue;
    const values = Array.isArray(row?.values) ? row.values : [];
    for (const v of values) {
      const value = toNumber(v?.value);
      const date = toDate(v?.end_time);
      // A point needs BOTH a usable value and a date it belongs to. Keeping a
      // valueless point would inflate days_with_data — the one number that
      // reveals whether the figures are real.
      if (value === null || date === null) continue;
      totals[name] = (totals[name] ?? 0) + value;
      (series[name] ??= []).push({ date, value });
      days.add(date);
    }
  }

  for (const points of Object.values(series)) {
    points.sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    requested_days: requestedDays,
    days_with_data: days.size,
    totals,
    series,
    unavailable_metrics: [...unavailable].sort(),
  };
}

/**
 * Did Meta reject this request because a metric name is invalid, and if so which?
 *
 * Meta reports this as error code 100 with the offending name inside the message
 * (e.g. `(#100) metric[0] must be one of the following values: ...`). The name is
 * extracted so the retry can drop exactly one metric rather than guessing, and so
 * a human reading the log learns which metric died.
 *
 * Returns the metric name when it can be identified, `true` when the error is an
 * invalid-metric error whose name could not be parsed, and `false` otherwise.
 * Those three cases are genuinely different: an unparseable name means we must
 * stop rather than retry, because a retry that drops nothing repeats forever.
 */
export function invalidMetricFrom(payload: any, candidates: readonly string[]): string | boolean {
  const err = payload?.error;
  if (!err) return false;
  const code = typeof err.code === 'number' ? err.code : Number(err.code);
  // 100 is Meta's generic invalid-parameter code; it is necessary but nowhere
  // near sufficient, so everything below is about deciding what it means here.
  if (code !== 100) return false;
  const message = typeof err.message === 'string' ? err.message : '';

  // A candidate named verbatim in the message is the STRONG signal, and it is
  // checked first. An earlier draft additionally required the word "metric" in
  // the message; that was fragile in the exact direction this module exists to
  // guard — Meta rephrasing its error text would silently switch degradation
  // off, and the card would die on the next deprecation with nothing to explain
  // why. The name is specific enough on its own.
  //
  // Longest first, so `page_views_total` is not shadowed by a shorter candidate
  // that prefixes it: dropping the prefix would leave the real offender in the
  // list, and the retry would fail identically until the budget ran out.
  const named = [...candidates]
    .sort((a, b) => b.length - a.length)
    .find((m) => message.includes(m));
  if (named) return named;

  // No name to act on. Only claim this is a metric problem if Meta said so —
  // returning true here stops the loop rather than continuing it, so a wrong
  // guess costs a clear error rather than a spin.
  return /metric/i.test(message);
}

export function isAuthFailure(payload: any): boolean {
  const err = payload?.error;
  if (!err) return false;
  const code = typeof err.code === 'number' ? err.code : Number(err.code);
  // 190 = invalid/expired token. 102 = session invalid. 10 and 200-299 are
  // permission errors: the grant no longer covers what we are asking for.
  return code === 190 || code === 102 || code === 10 || (code >= 200 && code <= 299);
}

export function isRateLimited(payload: any, status: number): boolean {
  if (status === 429) return true;
  const code = typeof payload?.error?.code === 'number' ? payload.error.code : null;
  // 4 = app rate limit, 17 = user rate limit, 32 = page rate limit,
  // 613 = custom-level throttling.
  return code === 4 || code === 17 || code === 32 || code === 613;
}

export interface FetchPageInsightsOptions {
  pageId: string;
  pageToken: string;
  days: number;
  metrics?: readonly string[];
  fetchImpl?: typeof fetch;
}

interface RawResult {
  status: number;
  payload: any;
}

async function requestInsights(
  opts: FetchPageInsightsOptions,
  metrics: readonly string[],
): Promise<RawResult> {
  const since = Math.floor((Date.now() - opts.days * 24 * 60 * 60 * 1000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    access_token: opts.pageToken,
    metric: metrics.join(','),
    period: 'day',
    since: String(since),
    until: String(until),
  });
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${FB_GRAPH}/${FB_VERSION}/${encodeURIComponent(opts.pageId)}/insights?${params}`;

  let res: Response;
  try {
    res = await doFetch(url);
  } catch (e) {
    throw new FacebookError('network', `Facebook request failed: ${String(e)}`);
  }
  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new FacebookError('bad_response', 'Facebook returned a non-JSON response');
  }
  return { status: res.status, payload };
}

/**
 * Fetch daily Page insights, dropping metrics Meta rejects.
 *
 * The loop terminates on every path: it stops on success, on a non-metric error,
 * on an unnameable metric error, when the candidate list empties, and at
 * `MAX_METRIC_RETRIES` regardless. Each iteration that continues has strictly
 * fewer metrics than the last, which is what makes the bound meaningful rather
 * than decorative.
 */
export async function fetchPageInsights(
  opts: FetchPageInsightsOptions,
): Promise<PageInsightsSummary> {
  const requested = opts.metrics ?? PAGE_DAILY_METRICS;
  let live = [...requested];
  const unavailable: string[] = [];

  for (let attempt = 0; attempt <= MAX_METRIC_RETRIES; attempt++) {
    if (live.length === 0) {
      // Every metric was rejected. That is a real answer — an empty summary that
      // names what is gone — not an error, and certainly not a page of zeros.
      return summarize(null, opts.days, unavailable);
    }

    const { status, payload } = await requestInsights(opts, live);

    if (status >= 200 && status < 300 && !payload?.error) {
      return summarize(payload, opts.days, unavailable);
    }
    if (isRateLimited(payload, status)) {
      throw new FacebookError('rate_limited', 'Facebook is rate limiting this request', 429);
    }
    if (isAuthFailure(payload)) {
      throw new FacebookError('auth_failed', 'Facebook rejected the stored credential', 401);
    }

    const bad = invalidMetricFrom(payload, live);
    if (typeof bad === 'string') {
      live = live.filter((m) => m !== bad);
      unavailable.push(bad);
      continue;
    }

    const message = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : `Facebook returned ${status}`;
    throw new FacebookError('facebook_error', message, status === 400 ? 400 : 502);
  }

  // Retries exhausted while still hitting invalid-metric errors. Reporting what
  // we know beats a bare failure: the caller learns which metrics are gone.
  throw new FacebookError(
    'metrics_unavailable',
    `Facebook rejected these metrics: ${unavailable.join(', ')}`,
    502,
  );
}
