// Pure, runtime-agnostic analytics windowing. No Deno/Node/Supabase/IO.
//
// Sibling: src/lib/analyticsWindow.ts — keep in sync (edge can't import from src/).
// They MUST agree byte-for-byte on the emitted ISO strings, because those strings
// are the conflict key of `social_analytics_cache`:
//   (user_id, outstand_account_id, metric_type, period_start, period_end)
//
// WHY QUANTIZATION EXISTS
// ----------------------
// The original getDateRange used `now` at full millisecond precision: `end` was
// literally the current instant and `start` carried the same time-of-day. The
// cache is then read with an exact `.eq('period_start', …).eq('period_end', …)`.
// Two page loads a second apart compute different windows, so the lookup could
// never match a stored row — `social_analytics_cache` was WRITE-ONLY by
// construction, and its 1-hour freshness filter never got a chance to apply.
// Nothing errored; every visit just silently re-hit the provider.
//
// Quantizing both bounds to UTC midnight makes the window stable for a whole day,
// which is what lets a scheduled capture job and the browser agree on a row.

export type TimeRange = '7d' | '30d' | '90d';

export const RANGE_DAYS: Record<TimeRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export interface DateRange {
  start: Date;
  end: Date;
}

/** Midnight UTC at the start of the day containing `d`. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * The current and immediately-preceding comparison windows for a range, both
 * snapped to UTC day boundaries so the result is identical for every caller on
 * a given UTC day.
 *
 * `end` is the start of TODAY (exclusive upper bound on completed days), so a
 * partially-elapsed today never lands in the window — otherwise a metric read at
 * 09:00 and one at 17:00 would cover different amounts of time and be silently
 * incomparable.
 */
export function getAnalyticsWindow(
  range: TimeRange,
  now: Date,
): { current: DateRange; prior: DateRange } {
  const days = RANGE_DAYS[range];
  const end = startOfUtcDay(now);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);

  const priorEnd = new Date(start);
  const priorStart = new Date(start);
  priorStart.setUTCDate(priorStart.getUTCDate() - days);

  return { current: { start, end }, prior: { start: priorStart, end: priorEnd } };
}

/** The exact `(period_start, period_end)` pair used as the cache conflict key. */
export function windowKey(range: TimeRange, now: Date): {
  periodStart: string;
  periodEnd: string;
} {
  const { current } = getAnalyticsWindow(range, now);
  return {
    periodStart: current.start.toISOString(),
    periodEnd: current.end.toISOString(),
  };
}
