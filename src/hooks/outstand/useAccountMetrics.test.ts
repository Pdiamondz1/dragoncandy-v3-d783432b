import { describe, test, expect } from 'vitest';
import { getDateRange, computeDelta } from './useAccountMetrics';

describe('getDateRange', () => {
  test('7d returns 7-day window ending now', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const { current, prior } = getDateRange('7d', now);
    expect(current.start.toISOString()).toBe('2026-05-01T12:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-05-08T12:00:00.000Z');
    expect(prior.start.toISOString()).toBe('2026-04-24T12:00:00.000Z');
    expect(prior.end.toISOString()).toBe('2026-05-01T12:00:00.000Z');
  });

  test('30d returns 30-day window ending now', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const { current, prior } = getDateRange('30d', now);
    expect(current.start.toISOString()).toBe('2026-04-08T12:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-05-08T12:00:00.000Z');
    expect(prior.start.toISOString()).toBe('2026-03-09T12:00:00.000Z');
    expect(prior.end.toISOString()).toBe('2026-04-08T12:00:00.000Z');
  });

  test('90d returns 90-day window ending now', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const { current, prior } = getDateRange('90d', now);
    expect(current.start.toISOString()).toBe('2026-02-07T12:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-05-08T12:00:00.000Z');
    expect(prior.start.toISOString()).toBe('2025-11-09T12:00:00.000Z');
    expect(prior.end.toISOString()).toBe('2026-02-07T12:00:00.000Z');
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
