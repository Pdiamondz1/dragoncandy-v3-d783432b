import { describe, it, expect } from 'vitest';
import {
  getAnalyticsWindow,
  startOfUtcDay,
  windowKey,
  type TimeRange,
} from './analytics-window';

describe('startOfUtcDay', () => {
  it('snaps any instant to UTC midnight of its own day', () => {
    expect(startOfUtcDay(new Date('2026-08-04T17:43:21.884Z')).toISOString()).toBe(
      '2026-08-04T00:00:00.000Z',
    );
    expect(startOfUtcDay(new Date('2026-08-04T00:00:00.000Z')).toISOString()).toBe(
      '2026-08-04T00:00:00.000Z',
    );
  });
});

describe('getAnalyticsWindow', () => {
  it('produces day-aligned current and prior windows', () => {
    const { current, prior } = getAnalyticsWindow('7d', new Date('2026-08-04T17:43:21.884Z'));
    expect(current.start.toISOString()).toBe('2026-07-28T00:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    // The prior window abuts the current one exactly — no gap, no overlap.
    expect(prior.end.toISOString()).toBe(current.start.toISOString());
    expect(prior.start.toISOString()).toBe('2026-07-21T00:00:00.000Z');
  });

  it('excludes the partially-elapsed today', () => {
    // A read at 09:00 and one at 17:00 must cover the same completed days, or the
    // two results are silently incomparable.
    const morning = getAnalyticsWindow('30d', new Date('2026-08-04T09:00:00.000Z'));
    const evening = getAnalyticsWindow('30d', new Date('2026-08-04T17:00:00.000Z'));
    expect(morning.current.end.toISOString()).toBe(evening.current.end.toISOString());
    expect(morning.current.end.toISOString()).toBe('2026-08-04T00:00:00.000Z');
  });

  it.each(['7d', '30d', '90d'] as TimeRange[])('spans exactly the named days (%s)', (range) => {
    const { current } = getAnalyticsWindow(range, new Date('2026-08-04T12:00:00.000Z'));
    const days = (current.end.getTime() - current.start.getTime()) / 86_400_000;
    expect(days).toBe(Number(range.replace('d', '')));
  });
});

describe('windowKey — the property the cache actually depends on', () => {
  // This is the regression that made social_analytics_cache write-only: the old
  // implementation carried millisecond precision, so two reads moments apart
  // produced different conflict keys and the exact-match lookup never hit.
  it('is STABLE across every instant within the same UTC day', () => {
    const range: TimeRange = '7d';
    const first = windowKey(range, new Date('2026-08-04T00:00:00.000Z'));
    const mid = windowKey(range, new Date('2026-08-04T13:07:44.213Z'));
    const last = windowKey(range, new Date('2026-08-04T23:59:59.999Z'));
    expect(mid).toEqual(first);
    expect(last).toEqual(first);
  });

  it('CHANGES when the UTC day rolls over, so a new day gets fresh rows', () => {
    const a = windowKey('7d', new Date('2026-08-04T23:59:59.999Z'));
    const b = windowKey('7d', new Date('2026-08-05T00:00:00.000Z'));
    expect(b).not.toEqual(a);
  });

  it('differs per range, so 7d and 30d never collide on one cache row', () => {
    const now = new Date('2026-08-04T12:00:00.000Z');
    expect(windowKey('7d', now)).not.toEqual(windowKey('30d', now));
    expect(windowKey('30d', now)).not.toEqual(windowKey('90d', now));
  });
});
