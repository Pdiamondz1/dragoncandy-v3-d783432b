import { describe, it, expect } from 'vitest';
import {
  DAILY_METRICS,
  isAuthFailure,
  isRateLimited,
  summarize,
} from './instagram-insights.ts';

/**
 * These cover the shaping layer, which is where a wrong number would be born
 * looking entirely plausible. The network calls are not tested — they are thin
 * wrappers over `fetch` — but everything that turns Meta's response into figures
 * a person reads is.
 *
 * The recurring theme is ABSENT vs ZERO. Almost every test below exists because
 * the natural JavaScript expression of the same logic (`Number(x) || 0`,
 * `totals[m] ?? 0`, `values.map(v => v.value)`) turns "Instagram told us
 * nothing" into "Instagram told us nothing happened", and a business reading
 * that concludes their marketing failed.
 */

const entry = (name: string, values: Array<{ value: unknown; end_time: string }>) => ({
  name,
  period: 'day',
  values,
});

const day = (d: string, value: unknown) => ({ value, end_time: `${d}T07:00:00+0000` });

describe('summarize', () => {
  it('reports days_with_data, not the window requested', () => {
    // Meta lags up to 48 hours, so this gap is the NORMAL case. A summary that
    // echoed 30 here would be indistinguishable from a fabricated response —
    // the same reasoning as the YouTube card reading "25 days" against 28.
    const payload = {
      data: [entry('reach', [day('2026-08-01', 10), day('2026-08-02', 20)])],
    };
    const s = summarize(payload, 30);
    expect(s.requested_days).toBe(30);
    expect(s.days_with_data).toBe(2);
  });

  it('counts DISTINCT days across metrics, not rows', () => {
    // Two metrics covering the same two days is two days of data, not four.
    const payload = {
      data: [
        entry('reach', [day('2026-08-01', 10), day('2026-08-02', 20)]),
        entry('likes', [day('2026-08-01', 1), day('2026-08-02', 2)]),
      ],
    };
    expect(summarize(payload, 30).days_with_data).toBe(2);
  });

  it('returns NO key for a metric Instagram did not send', () => {
    const s = summarize({ data: [entry('reach', [day('2026-08-01', 10)])] }, 7);
    expect(s.totals.reach).toBe(10);
    // The assertion that matters: absent, not 0.
    expect('likes' in s.totals).toBe(false);
    expect(s.totals.likes).toBeUndefined();
  });

  it('returns NO key for a metric sent with no usable points', () => {
    // Meta can return the metric envelope with an empty values array. That is
    // "no data", and recording a 0 total would invent an observation.
    const s = summarize({ data: [entry('reach', [])] }, 7);
    expect('reach' in s.totals).toBe(false);
    expect(s.series.reach).toBeUndefined();
  });

  it('DROPS a non-numeric value rather than coercing it to zero', () => {
    // `Number(null)` is 0 and `Number(undefined) || 0` is 0. Either would make
    // this a three-day sum of 30 with a fabricated middle day.
    const payload = {
      data: [
        entry('reach', [day('2026-08-01', 10), day('2026-08-02', null), day('2026-08-03', 20)]),
      ],
    };
    const s = summarize(payload, 7);
    expect(s.totals.reach).toBe(30);
    expect(s.series.reach).toHaveLength(2);
    expect(s.days_with_data).toBe(2);
  });

  it('drops every falsy-but-finite impostor', () => {
    // `Number(x)` is 0 — and therefore finite — for ALL of these. This is the
    // exact set that slipped past the first implementation's
    // `Number.isFinite(Number(x))` guard, and each one would have become a real
    // reported zero on a day Instagram said nothing about.
    for (const impostor of [null, undefined, '', '   ', false, [], {}]) {
      const s = summarize(
        { data: [entry('reach', [day('2026-08-01', 10), day('2026-08-02', impostor)])] },
        7,
      );
      expect(s.days_with_data, `value ${JSON.stringify(impostor)}`).toBe(1);
      expect(s.series.reach).toHaveLength(1);
      expect(s.totals.reach).toBe(10);
    }
  });

  it('accepts a numeric string, because Meta is inconsistent about quoting', () => {
    const s = summarize({ data: [entry('reach', [day('2026-08-01', '42')])] }, 7);
    expect(s.totals.reach).toBe(42);
  });

  it('keeps a genuine zero', () => {
    // The mirror of the test above, and the reason the check is
    // `Number.isFinite` rather than truthiness: a real reported 0 is data.
    const s = summarize({ data: [entry('reach', [day('2026-08-01', 0)])] }, 7);
    expect(s.totals.reach).toBe(0);
    expect(s.days_with_data).toBe(1);
  });

  it('is empty, not zeroed, for an empty response', () => {
    const s = summarize({ data: [] }, 30);
    expect(s.days_with_data).toBe(0);
    expect(s.totals).toEqual({});
    expect(s.series).toEqual({});
    expect(s.interactions_per_reach).toBeNull();
  });

  it('survives a malformed payload without inventing data', () => {
    for (const bad of [null, undefined, {}, { data: null }, { data: 'nope' }]) {
      const s = summarize(bad, 30);
      expect(s.days_with_data).toBe(0);
      expect(s.totals).toEqual({});
    }
  });

  it('ignores metrics outside the requested set', () => {
    // Meta returning something we did not ask for must not silently widen the
    // shape the UI renders.
    const s = summarize({ data: [entry('impressions', [day('2026-08-01', 99)])] }, 7);
    expect(s.totals).toEqual({});
    expect(DAILY_METRICS).not.toContain('impressions');
  });

  it('reads by NAME, so response order cannot shift a figure', () => {
    const forwards = summarize(
      {
        data: [
          entry('reach', [day('2026-08-01', 100)]),
          entry('likes', [day('2026-08-01', 5)]),
        ],
      },
      7,
    );
    const backwards = summarize(
      {
        data: [
          entry('likes', [day('2026-08-01', 5)]),
          entry('reach', [day('2026-08-01', 100)]),
        ],
      },
      7,
    );
    expect(forwards.totals).toEqual(backwards.totals);
    expect(forwards.totals.reach).toBe(100);
  });

  it('sorts each series by date regardless of the order Meta sent', () => {
    const s = summarize(
      { data: [entry('reach', [day('2026-08-03', 3), day('2026-08-01', 1)])] },
      7,
    );
    expect(s.series.reach?.map((p) => p.date)).toEqual(['2026-08-01', '2026-08-03']);
  });

  it('derives interactions_per_reach from TOTALS, not from daily rates', () => {
    // The lopsided pair is the whole point. Daily rates are 0.5 and 0.001, whose
    // mean is ~0.2505 — dominated by the quiet day. The honest figure is
    // 21 / 10002 ≈ 0.0021.
    const payload = {
      data: [
        entry('reach', [day('2026-08-01', 2), day('2026-08-02', 10000)]),
        entry('total_interactions', [day('2026-08-01', 1), day('2026-08-02', 20)]),
      ],
    };
    const s = summarize(payload, 7);
    expect(s.interactions_per_reach).toBeCloseTo(21 / 10002, 10);
    expect(s.interactions_per_reach).not.toBeCloseTo(0.2505, 3);
  });

  it('leaves interactions_per_reach null when the ratio is undefined', () => {
    // Zero reach, and missing either total. An undefined ratio is not 0 — a
    // dashboard showing 0% engagement is a claim, and we have not got one.
    const zeroReach = summarize(
      {
        data: [
          entry('reach', [day('2026-08-01', 0)]),
          entry('total_interactions', [day('2026-08-01', 0)]),
        ],
      },
      7,
    );
    expect(zeroReach.interactions_per_reach).toBeNull();

    const noInteractions = summarize({ data: [entry('reach', [day('2026-08-01', 50)])] }, 7);
    expect(noInteractions.interactions_per_reach).toBeNull();
  });
});

describe('isRateLimited', () => {
  it('recognises Meta throttling codes', () => {
    // The YouTube connector learned this as "HTTP 403 means two opposite
    // things". Meta overloads the same way: treating throttling as an auth
    // failure would tell every user on the platform to reconnect.
    for (const code of [4, 17, 32, 613]) {
      expect(isRateLimited({ error: { code } }, 400)).toBe(true);
    }
  });

  it('recognises is_transient and HTTP 429', () => {
    expect(isRateLimited({ error: { is_transient: true } }, 500)).toBe(true);
    expect(isRateLimited(null, 429)).toBe(true);
  });

  it('does not classify an auth failure as throttling', () => {
    expect(isRateLimited({ error: { code: 190 } }, 400)).toBe(false);
  });
});

describe('isAuthFailure', () => {
  it('is code 190 and nothing else', () => {
    expect(isAuthFailure({ error: { code: 190 } })).toBe(true);
    expect(isAuthFailure({ error: { code: 4 } })).toBe(false);
    expect(isAuthFailure(null)).toBe(false);
    expect(isAuthFailure({})).toBe(false);
  });
});
