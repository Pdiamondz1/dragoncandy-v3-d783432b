import { describe, it, expect } from 'vitest';
import {
  MAX_METRIC_RETRIES,
  PAGE_DAILY_METRICS,
  fetchPageInsights,
  invalidMetricFrom,
  isAuthFailure,
  isRateLimited,
  summarize,
  toNumber,
} from './facebook-insights.ts';

/**
 * Two themes.
 *
 * ABSENT vs ZERO, as in the Instagram connector: the natural JavaScript for all
 * of this (`Number(x) || 0`, `totals[m] ?? 0`) turns "Facebook told us nothing"
 * into "Facebook told us nothing happened", and a business reading that
 * concludes their marketing collapsed.
 *
 * DEGRADING WITHOUT LYING, which is specific to this API: Meta rejects the whole
 * request over one invalid metric and changes the valid set across all versions,
 * so this module drops rejected metrics and retries. The tests below exist
 * because that behaviour is only safe if it terminates and if what it dropped is
 * reported rather than silently missing.
 */

function metricRow(name: string, points: Array<[string, unknown]>) {
  return { name, values: points.map(([end_time, value]) => ({ end_time, value })) };
}

describe('toNumber — the fabricated-zero guard', () => {
  it('rejects the values Number() would silently turn into 0', () => {
    // Number(null) === 0, Number('') === 0, Number([]) === 0, Number(false) === 0.
    // Every one is finite, so `Number.isFinite(Number(x))` — the obvious guard —
    // admits all of them and invents a zero Facebook never reported.
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber([])).toBeNull();
    expect(toNumber(false)).toBeNull();
    expect(toNumber({})).toBeNull();
  });

  it('keeps real values, including a genuine zero and a numeric string', () => {
    // A real 0 must survive: "nobody viewed the Page on Tuesday" is data.
    expect(toNumber(0)).toBe(0);
    expect(toNumber(42)).toBe(42);
    // Meta is inconsistent about quoting; rejecting "42" would discard real data.
    expect(toNumber('42')).toBe(42);
  });
});

describe('summarize', () => {
  it('omits a metric entirely rather than reporting it as zero', () => {
    const payload = { data: [metricRow('page_views_total', [['2026-08-20T07:00:00+0000', 5]])] };
    const s = summarize(payload, 30);
    expect(s.totals.page_views_total).toBe(5);
    // The metric we did not receive must be ABSENT, so the UI can render an em
    // dash. A 0 here is indistinguishable from a real zero.
    expect('page_post_engagements' in s.totals).toBe(false);
  });

  it('counts distinct days, not data points', () => {
    const payload = {
      data: [
        metricRow('page_views_total', [
          ['2026-08-20T07:00:00+0000', 5],
          ['2026-08-21T07:00:00+0000', 7],
        ]),
        // Same two days, second metric — must not double-count.
        metricRow('page_post_engagements', [
          ['2026-08-20T07:00:00+0000', 1],
          ['2026-08-21T07:00:00+0000', 2],
        ]),
      ],
    };
    const s = summarize(payload, 30);
    expect(s.days_with_data).toBe(2);
  });

  it('never reports the requested window as the window it got', () => {
    const payload = { data: [metricRow('page_views_total', [['2026-08-20T07:00:00+0000', 5]])] };
    const s = summarize(payload, 30);
    expect(s.requested_days).toBe(30);
    // Meta lags, so this gap is the signal the figures are real rather than
    // echoed back from our own request.
    expect(s.days_with_data).toBe(1);
  });

  it('drops a point with a value but no usable date', () => {
    // Keeping it would inflate days_with_data — the one number that reveals
    // whether the data is real.
    const payload = {
      data: [metricRow('page_views_total', [[('not-a-date' as unknown) as string, 9]])],
    };
    const s = summarize(payload, 30);
    expect(s.days_with_data).toBe(0);
    expect('page_views_total' in s.totals).toBe(false);
  });

  it('does not let a null value contribute a day', () => {
    const payload = {
      data: [
        metricRow('page_views_total', [
          ['2026-08-20T07:00:00+0000', 5],
          ['2026-08-21T07:00:00+0000', null],
        ]),
      ],
    };
    const s = summarize(payload, 30);
    expect(s.totals.page_views_total).toBe(5);
    expect(s.days_with_data).toBe(1);
  });

  it('sorts each series by date so a chart cannot draw backwards', () => {
    const payload = {
      data: [
        metricRow('page_views_total', [
          ['2026-08-22T07:00:00+0000', 3],
          ['2026-08-20T07:00:00+0000', 1],
          ['2026-08-21T07:00:00+0000', 2],
        ]),
      ],
    };
    const s = summarize(payload, 30);
    expect(s.series.page_views_total.map((p) => p.value)).toEqual([1, 2, 3]);
  });

  it('reports what was dropped instead of quietly omitting it', () => {
    const s = summarize({ data: [] }, 30, ['page_impressions']);
    expect(s.unavailable_metrics).toEqual(['page_impressions']);
  });

  it('survives a null payload without inventing anything', () => {
    const s = summarize(null, 30);
    expect(s.days_with_data).toBe(0);
    expect(s.totals).toEqual({});
  });
});

describe('invalidMetricFrom', () => {
  const candidates = ['page_views_total', 'page_post_engagements'];

  it("names the metric Meta rejected, using Meta's own message shape", () => {
    // Meta's real text for this error, so the test documents the API rather
    // than a paraphrase of it.
    const payload = {
      error: {
        code: 100,
        message:
          '(#100) metric[1] must be one of the following values: page_views_total, ' +
          'page_post_engagements, page_daily_follows',
      },
    };
    expect(invalidMetricFrom(payload, ['page_post_engagements'])).toBe('page_post_engagements');
  });

  it('acts on the metric name even if Meta rephrases the error text', () => {
    // The name is the strong signal. An earlier draft also required the literal
    // word "metric", which meant a reworded message would silently switch
    // degradation off — the failure this whole module exists to prevent.
    const payload = { code: 100, error: { code: 100, message: 'page_post_engagements is not valid' } };
    expect(invalidMetricFrom(payload, candidates)).toBe('page_post_engagements');
  });

  it('returns true — not a name — when it cannot identify the metric', () => {
    // This distinction is what stops the retry loop spinning: with no name to
    // drop, a retry would send exactly the same request forever.
    const payload = { error: { code: 100, message: '(#100) Invalid metric specified' } };
    expect(invalidMetricFrom(payload, candidates)).toBe(true);
  });

  it('ignores errors that are not about metrics', () => {
    expect(invalidMetricFrom({ error: { code: 190, message: 'token expired' } }, candidates))
      .toBe(false);
    expect(invalidMetricFrom({ data: [] }, candidates)).toBe(false);
  });

  it('prefers the longest matching name, so a prefix cannot shadow it', () => {
    // 'page_views' is a prefix of 'page_views_total'. Matching shortest-first
    // would drop the wrong metric and leave the bad one in place, so the retry
    // would fail identically and burn the whole budget.
    const list = ['page_views', 'page_views_total'];
    const payload = { error: { code: 100, message: '(#100) page_views_total is invalid' } };
    expect(invalidMetricFrom(payload, list)).toBe('page_views_total');
  });
});

describe('error classification', () => {
  it('recognises the auth failures that mean re-consent, not retry', () => {
    expect(isAuthFailure({ error: { code: 190 } })).toBe(true);
    expect(isAuthFailure({ error: { code: 102 } })).toBe(true);
    expect(isAuthFailure({ error: { code: 200 } })).toBe(true);
    expect(isAuthFailure({ error: { code: 299 } })).toBe(true);
    expect(isAuthFailure({ error: { code: 100 } })).toBe(false);
  });

  it('separates rate limiting from auth, because 403 means both on this API', () => {
    // The YouTube connector learned this the hard way: HTTP 403 means "your
    // grant is gone" AND "you are over quota", and treating quota as revocation
    // tells every user on the platform to reauthorize.
    expect(isRateLimited({}, 429)).toBe(true);
    expect(isRateLimited({ error: { code: 4 } }, 403)).toBe(true);
    expect(isRateLimited({ error: { code: 32 } }, 403)).toBe(true);
    expect(isRateLimited({ error: { code: 190 } }, 403)).toBe(false);
  });
});

/** A fetch stub returning queued responses, so the retry loop can be driven. */
function stubFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: string[] = [];
  const impl = ((url: string) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error('stubFetch: more requests than queued responses');
    return Promise.resolve({
      status: next.status,
      text: () => Promise.resolve(JSON.stringify(next.body)),
    } as unknown as Response);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('fetchPageInsights — degrading without lying', () => {
  const base = { pageId: '123', pageToken: 't', days: 30 };

  it('drops the metric Meta named, retries, and reports the drop', async () => {
    const { impl, calls } = stubFetch([
      { status: 400, body: { error: { code: 100, message: '(#100) page_daily_follows bad' } } },
      { status: 200, body: { data: [metricRow('page_views_total', [['2026-08-20T07:00:00+0000', 4]])] } },
    ]);
    const s = await fetchPageInsights({
      ...base,
      metrics: ['page_views_total', 'page_daily_follows'],
      fetchImpl: impl,
    });

    expect(s.totals.page_views_total).toBe(4);
    // The drop is REPORTED. Without this the card would show one metric and the
    // reader would have no way to tell the other was deprecated rather than zero.
    expect(s.unavailable_metrics).toEqual(['page_daily_follows']);

    // Control: the retry actually narrowed the request rather than repeating it.
    expect(calls[0]).toContain('page_daily_follows');
    expect(calls[1]).not.toContain('page_daily_follows');
  });

  it('stops instead of looping when the bad metric cannot be identified', async () => {
    // Forced control for the termination guarantee: if an unnameable metric
    // error were retried, this stub would run out of responses and throw a
    // different error than the one asserted, failing the test.
    const { impl, calls } = stubFetch([
      { status: 400, body: { error: { code: 100, message: '(#100) Invalid metric specified' } } },
    ]);
    await expect(
      fetchPageInsights({ ...base, metrics: ['page_views_total'], fetchImpl: impl }),
    ).rejects.toMatchObject({ code: 'facebook_error' });
    expect(calls).toHaveLength(1);
  });

  it('returns an empty summary naming every metric when all are rejected', async () => {
    const { impl } = stubFetch([
      { status: 400, body: { error: { code: 100, message: '(#100) a is invalid' } } },
      { status: 400, body: { error: { code: 100, message: '(#100) b is invalid' } } },
    ]);
    const s = await fetchPageInsights({ ...base, metrics: ['a', 'b'], fetchImpl: impl });

    // Not an error: "every metric you asked for is gone" is a real, reportable
    // answer. Throwing here would render as a broken card and send someone
    // hunting for a bug in our code.
    expect(s.totals).toEqual({});
    expect(s.days_with_data).toBe(0);
    expect(s.unavailable_metrics).toEqual(['a', 'b']);
  });

  it('returns the empty summary when the LAST metric is dropped on the final attempt', async () => {
    // The boundary Codex found, and it sits at exactly the size of the default
    // list: with MAX_METRIC_RETRIES + 1 metrics, the last permitted request
    // drops the final metric, and the emptiness check at the TOP of the loop is
    // never reached because the loop has ended. The result was a thrown
    // `metrics_unavailable` when we already had the real answer in hand.
    //
    // Forced control: PAGE_DAILY_METRICS.length must equal the retry budget + 1,
    // or this test silently stops covering the case it was written for.
    expect(PAGE_DAILY_METRICS.length).toBe(MAX_METRIC_RETRIES + 1);

    const metrics = [...PAGE_DAILY_METRICS];
    const { impl } = stubFetch(
      metrics.map((m) => ({
        status: 400,
        body: { error: { code: 100, message: `(#100) ${m} is invalid` } },
      })),
    );
    const s = await fetchPageInsights({ ...base, metrics, fetchImpl: impl });

    expect(s.days_with_data).toBe(0);
    expect(s.totals).toEqual({});
    expect(s.unavailable_metrics).toEqual([...metrics].sort());
  });

  it('is bounded — it cannot retry more than MAX_METRIC_RETRIES + 1 times', async () => {
    // Every response names a metric, so without the bound this would keep going
    // until the candidate list emptied. With more candidates than the budget,
    // the budget must be what stops it.
    const many = Array.from({ length: MAX_METRIC_RETRIES + 5 }, (_, i) => `m${i}`);
    const { impl, calls } = stubFetch(
      many.map((m) => ({ status: 400, body: { error: { code: 100, message: `(#100) ${m} bad` } } })),
    );
    await expect(
      fetchPageInsights({ ...base, metrics: many, fetchImpl: impl }),
    ).rejects.toMatchObject({ code: 'metrics_unavailable' });
    expect(calls.length).toBe(MAX_METRIC_RETRIES + 1);
  });

  it('treats an expired credential as auth failure, never as a missing metric', async () => {
    const { impl } = stubFetch([{ status: 400, body: { error: { code: 190, message: 'expired' } } }]);
    await expect(
      fetchPageInsights({ ...base, fetchImpl: impl }),
    ).rejects.toMatchObject({ code: 'auth_failed', status: 401 });
  });

  it('treats throttling as throttling, so nobody is told to reconnect over quota', async () => {
    const { impl } = stubFetch([{ status: 403, body: { error: { code: 32, message: 'page limit' } } }]);
    await expect(
      fetchPageInsights({ ...base, fetchImpl: impl }),
    ).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
  });
});

describe('the requested metric list', () => {
  it('asks for nothing from the families Meta deprecated on 2026-06-15', () => {
    // 85 metrics were removed across ALL API versions, so a pinned version does
    // not protect us. One invalid name fails the entire request, taking every
    // other figure with it.
    for (const m of PAGE_DAILY_METRICS) {
      expect(m).not.toMatch(/_unique$/); // the reach family
      expect(m).not.toBe('page_impressions'); // replaced by views
      expect(m).not.toBe('page_fans'); // deprecated outright
    }
  });

  it('asks for unfollows alongside follows', () => {
    // A follow count without unfollows flatters, which is exactly the shape of
    // dishonesty [[Honest Analytics]] exists to prevent.
    expect(PAGE_DAILY_METRICS).toContain('page_daily_follows');
    expect(PAGE_DAILY_METRICS).toContain('page_daily_unfollows');
  });
});
