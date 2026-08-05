// Sibling: supabase/functions/_shared/analytics-window.ts — keep in sync
// (edge functions can't import from src/). They MUST agree byte-for-byte on the
// emitted ISO strings, because those strings form the conflict key of
// `social_analytics_cache`:
//   (user_id, outstand_account_id, metric_type, period_start, period_end)
//
// If the browser and the scheduled capture job disagree by even a millisecond,
// the cache lookup — an exact `.eq()` on both bounds — never matches, and the
// table silently becomes write-only. That is precisely the bug this replaced:
// the previous window carried `now` at full millisecond precision, so two page
// loads a second apart produced different keys. Nothing errored; every visit
// just re-hit the provider. See the sibling file for the full history.

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
 * snapped to UTC day boundaries so every caller on a given UTC day agrees.
 *
 * `end` is the start of TODAY, so a partially-elapsed today never lands in the
 * window — otherwise a read at 09:00 and one at 17:00 would cover different
 * amounts of time and be silently incomparable.
 */
export function getAnalyticsWindow(
  range: TimeRange,
  now: Date = new Date(),
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
export function windowKey(
  range: TimeRange,
  now: Date = new Date(),
): { periodStart: string; periodEnd: string } {
  const { current } = getAnalyticsWindow(range, now);
  return {
    periodStart: current.start.toISOString(),
    periodEnd: current.end.toISOString(),
  };
}
