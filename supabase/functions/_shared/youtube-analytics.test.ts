import { describe, it, expect } from 'vitest';
import {
  isQuotaFailure,
  shapeDaily,
  shapeTopVideos,
  toApiDate,
  totalsOf,
  videoIdsOf,
  type AnalyticsReport,
  type DailyPoint,
} from './youtube-analytics.ts';

/**
 * These cover the shaping layer, which is where a wrong number would be born
 * looking entirely plausible. The network calls are not tested here — they are
 * thin wrappers over `fetch` — but everything that turns Google's positional
 * rows into figures a person reads is.
 */

const daily = (over: Partial<DailyPoint> = {}): DailyPoint => ({
  date: '2026-08-01',
  views: 0,
  minutes_watched: 0,
  avg_view_duration_seconds: 0,
  subscribers_gained: 0,
  subscribers_lost: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  ...over,
});

// ---------------------------------------------------------------------------
// Column mapping.
//
// Google returns `columnHeaders` alongside `rows` because the order belongs to
// the response, not to us. Reading by position works right up until a metric is
// added to the request, at which point every figure shifts one column and the
// dashboard shows confident, wrong numbers. These tests exist to make that
// impossible rather than unlikely.
// ---------------------------------------------------------------------------

describe('shapeDaily', () => {
  it('reads values by column NAME, so column order cannot shift the figures', () => {
    const natural: AnalyticsReport = {
      columns: ['day', 'views', 'estimatedMinutesWatched'],
      rows: [['2026-08-01', 100, 250]],
    };
    const shuffled: AnalyticsReport = {
      columns: ['estimatedMinutesWatched', 'day', 'views'],
      rows: [[250, '2026-08-01', 100]],
    };

    expect(shapeDaily(natural)[0]).toMatchObject({
      date: '2026-08-01',
      views: 100,
      minutes_watched: 250,
    });
    expect(shapeDaily(shuffled)).toEqual(shapeDaily(natural));
  });

  it('reports a metric Google did not return as 0, never NaN or undefined', () => {
    const report: AnalyticsReport = { columns: ['day', 'views'], rows: [['2026-08-01', 7]] };
    const point = shapeDaily(report)[0];

    expect(point.views).toBe(7);
    expect(point.shares).toBe(0);
    expect(Number.isNaN(point.subscribers_gained)).toBe(false);
  });

  it('coerces a numeric string, which the API uses for some metrics', () => {
    const report: AnalyticsReport = {
      columns: ['day', 'views'],
      rows: [['2026-08-01', '42' as unknown as number]],
    };
    expect(shapeDaily(report)[0].views).toBe(42);
  });

  // The honesty rule: no data is zero rows, not a row of zeros. A fabricated
  // zero day is indistinguishable from a genuine one.
  it('returns no rows for an empty report rather than inventing a zero day', () => {
    expect(shapeDaily({ columns: ['day', 'views'], rows: [] })).toEqual([]);
  });
});

describe('shapeTopVideos', () => {
  const report: AnalyticsReport = {
    columns: ['video', 'views', 'likes'],
    rows: [
      ['vid-a', 900, 30],
      ['vid-b', 120, 4],
    ],
  };

  it('joins titles by video id', () => {
    const shaped = shapeTopVideos(report, { 'vid-a': 'Taco Tuesday' });
    expect(shaped[0]).toMatchObject({ video_id: 'vid-a', title: 'Taco Tuesday', views: 900 });
  });

  // null, not the id: a caller handed an id labelled "title" would print an
  // opaque string as though it were the video's name.
  it('leaves the title null when it is unknown, rather than substituting the id', () => {
    const shaped = shapeTopVideos(report, {});
    expect(shaped[0].title).toBeNull();
    expect(shaped[0].video_id).toBe('vid-a');
  });

  it('extracts the ids a title lookup needs', () => {
    expect(videoIdsOf(report)).toEqual(['vid-a', 'vid-b']);
  });

  it('extracts no ids when the report has no video dimension', () => {
    expect(videoIdsOf({ columns: ['day', 'views'], rows: [['2026-08-01', 1]] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Totals. The derived average is the one figure here that can be wrong while
// looking right, so it gets a case with a deliberately lopsided distribution.
// ---------------------------------------------------------------------------

describe('totalsOf', () => {
  it('sums the counting metrics', () => {
    const totals = totalsOf([
      daily({ views: 10, likes: 2, subscribers_gained: 5, subscribers_lost: 1 }),
      daily({ views: 15, likes: 3, subscribers_gained: 1, subscribers_lost: 4 }),
    ]);

    expect(totals.views).toBe(25);
    expect(totals.likes).toBe(5);
    expect(totals.subscribers_gained).toBe(6);
    expect(totals.subscribers_lost).toBe(5);
    expect(totals.net_subscribers).toBe(1);
  });

  it('weights average view duration by views instead of averaging the daily averages', () => {
    // Day 1: 1 view, 10 minutes watched -> 600s per view.
    // Day 2: 999 views, 999 minutes watched -> 60s per view.
    // The mean of the two daily averages is 330s, which describes no real
    // viewer. The correct answer is dominated by day 2.
    const totals = totalsOf([
      daily({ views: 1, minutes_watched: 10, avg_view_duration_seconds: 600 }),
      daily({ views: 999, minutes_watched: 999, avg_view_duration_seconds: 60 }),
    ]);

    expect(totals.avg_view_duration_seconds).toBe(61); // (1009 * 60) / 1000
    expect(totals.avg_view_duration_seconds).not.toBe(330);
  });

  it('reports 0 rather than NaN when there is nothing to average', () => {
    const totals = totalsOf([]);
    expect(totals.views).toBe(0);
    expect(totals.avg_view_duration_seconds).toBe(0);
    expect(Number.isNaN(totals.avg_view_duration_seconds)).toBe(false);
  });
});

describe('toApiDate', () => {
  it('formats as YYYY-MM-DD in UTC', () => {
    expect(toApiDate(new Date('2026-08-23T15:04:05.000Z'))).toBe('2026-08-23');
  });

  // The date-vs-instant trap this project has already paid for once: an instant
  // late in the UTC day is still that UTC day, and must not be shifted by the
  // machine's local timezone.
  it('does not shift the day for an instant near the UTC boundary', () => {
    expect(toApiDate(new Date('2026-08-23T23:59:59.000Z'))).toBe('2026-08-23');
    expect(toApiDate(new Date('2026-08-24T00:00:01.000Z'))).toBe('2026-08-24');
  });
});

// ---------------------------------------------------------------------------
// Quota vs authorization.
//
// Google returns HTTP 403 for BOTH "you are not allowed" and "you asked too
// often". The caller persists `needs_reconnect` on the authorization branch, so
// misclassifying a project-wide quota exhaustion would tell every user on the
// platform to reauthorize because we ran out of quota for an hour. This is the
// test that keeps those two apart.
// ---------------------------------------------------------------------------

const googleError = (reason: string) =>
  JSON.stringify({ error: { code: 403, errors: [{ reason, message: reason }] } });

describe('isQuotaFailure', () => {
  it.each([
    ['quotaExceeded'],
    ['dailyLimitExceeded'],
    ['rateLimitExceeded'],
    ['userRateLimitExceeded'],
    ['servingLimitExceeded'],
  ])('recognises %s as quota, not a permission problem', (reason) => {
    expect(isQuotaFailure(googleError(reason))).toBe(true);
  });

  // The newer shape. This is what catches a quota reason we have not enumerated,
  // so an unknown rate-limit code does not get read as an auth failure.
  it('recognises the RESOURCE_EXHAUSTED status even with an unfamiliar reason', () => {
    const body = JSON.stringify({
      error: { code: 403, status: 'RESOURCE_EXHAUSTED', errors: [{ reason: 'somethingNew' }] },
    });
    expect(isQuotaFailure(body)).toBe(true);
  });

  it.each([
    ['forbidden'],
    ['insufficientPermissions'],
    ['authError'],
    ['unauthorized'],
  ])('does NOT treat %s as quota — these are real refusals', (reason) => {
    expect(isQuotaFailure(googleError(reason))).toBe(false);
  });

  // An unrecognised 403 falls through to the authorization branch on purpose: a
  // genuinely refused connection is a state the user must act on, and quota is
  // the enumerable exception.
  it.each([
    ['an HTML error page', '<html><body>403 Forbidden</body></html>'],
    ['an empty body', ''],
    ['JSON with no error object', '{"ok":false}'],
    ['JSON with an empty errors array', '{"error":{"code":403,"errors":[]}}'],
  ])('returns false for %s rather than guessing', (_label, body) => {
    expect(isQuotaFailure(body)).toBe(false);
  });
});
