import { describe, test, expect } from 'vitest';
import { getDateRange, computeDelta } from './useAccountMetrics';

// These three tests previously asserted a `12:00:00.000Z` boundary — i.e. they
// ENCODED the bug rather than catching it. The window carried `now` at full
// millisecond precision, so `period_start`/`period_end` differed on every call;
// since `social_analytics_cache` is read with an exact `.eq()` on both bounds,
// the lookup could never match and the table was write-only. Windows are now
// snapped to UTC midnight so the browser and the scheduled capture job agree.
// Full rationale + the stability properties: _shared/analytics-window.test.ts.
describe('getDateRange (day-quantized)', () => {
  test('7d returns a 7-day window ending at the start of today', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const { current, prior } = getDateRange('7d', now);
    expect(current.start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-05-08T00:00:00.000Z');
    expect(prior.start.toISOString()).toBe('2026-04-24T00:00:00.000Z');
    expect(prior.end.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  test('30d returns a 30-day window ending at the start of today', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const { current, prior } = getDateRange('30d', now);
    expect(current.start.toISOString()).toBe('2026-04-08T00:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-05-08T00:00:00.000Z');
    expect(prior.start.toISOString()).toBe('2026-03-09T00:00:00.000Z');
    expect(prior.end.toISOString()).toBe('2026-04-08T00:00:00.000Z');
  });

  test('90d returns a 90-day window ending at the start of today', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const { current, prior } = getDateRange('90d', now);
    expect(current.start.toISOString()).toBe('2026-02-07T00:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-05-08T00:00:00.000Z');
    expect(prior.start.toISOString()).toBe('2025-11-09T00:00:00.000Z');
    expect(prior.end.toISOString()).toBe('2026-02-07T00:00:00.000Z');
  });

  test('is identical for any two instants on the same UTC day', () => {
    const a = getDateRange('7d', new Date('2026-05-08T00:00:01Z'));
    const b = getDateRange('7d', new Date('2026-05-08T23:59:58Z'));
    expect(a.current.start.toISOString()).toBe(b.current.start.toISOString());
    expect(a.current.end.toISOString()).toBe(b.current.end.toISOString());
  });
});

describe('computeDelta', () => {
  test('positive growth returns positive percentage', () => {
    expect(computeDelta(120, 100)).toBe(20);
  });

  test('negative growth returns negative percentage', () => {
    expect(computeDelta(80, 100)).toBe(-20);
  });

  test('zero prior returns null', () => {
    expect(computeDelta(100, 0)).toBeNull();
  });

  test('null prior returns null', () => {
    expect(computeDelta(100, null)).toBeNull();
  });

  test('result is rounded to 1 decimal', () => {
    expect(computeDelta(133, 100)).toBe(33);
    expect(computeDelta(100, 300)).toBeCloseTo(-66.7, 1);
  });
});
