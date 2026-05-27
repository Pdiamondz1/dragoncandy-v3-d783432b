// src/lib/scheduleSpreader.test.ts
import { describe, it, expect } from 'vitest';
import { spreadScheduledTimes, findNextAvailableDay } from './scheduleSpreader';

const TIME_RULES: Record<string, Array<[number, number, number]>> = {
  "instagram:photo": [[1, 12, 14], [3, 12, 14]],
  "instagram:video_reel": [[2, 11, 13], [4, 11, 13], [6, 9, 11]],
  "tiktok:video_reel": [[0, 19, 21], [1, 19, 21], [2, 19, 21], [3, 19, 21], [4, 19, 21], [5, 19, 21], [6, 19, 21]],
};
const FALLBACK_TIMES: Array<[number, number, number]> = [[1, 12, 14], [3, 12, 14], [5, 12, 14]];

describe('spreadScheduledTimes', () => {
  it('spreads 3 instagram:photo posts starting Thursday onto 3 unique days', () => {
    const baseDate = new Date(2026, 4, 29, 10, 0, 0);
    const slots = [
      { platform: 'instagram', content_type: 'photo', day_offset: 0 },
      { platform: 'instagram', content_type: 'photo', day_offset: 1 },
      { platform: 'instagram', content_type: 'photo', day_offset: 2 },
    ];
    const times = spreadScheduledTimes(slots, baseDate, 'America/New_York', TIME_RULES, FALLBACK_TIMES);
    expect(times).toHaveLength(3);
    for (const t of times) {
      expect(new Date(t).getTime()).not.toBeNaN();
    }
    const days = times.map(t => new Date(t).toDateString());
    expect(new Set(days).size).toBe(3);
  });

  it('returns a single date unchanged when only one slot', () => {
    const baseDate = new Date(2026, 4, 29, 10, 0, 0);
    const slots = [
      { platform: 'instagram', content_type: 'photo', day_offset: 0 },
    ];
    const times = spreadScheduledTimes(slots, baseDate, 'America/New_York', TIME_RULES, FALLBACK_TIMES);
    expect(times).toHaveLength(1);
    expect(new Date(times[0]).getTime()).not.toBeNaN();
  });

  it('handles mixed platforms without collisions', () => {
    const baseDate = new Date(2026, 4, 29, 10, 0, 0);
    const slots = [
      { platform: 'instagram', content_type: 'photo', day_offset: 0 },
      { platform: 'tiktok', content_type: 'video_reel', day_offset: 0 },
      { platform: 'instagram', content_type: 'video_reel', day_offset: 1 },
    ];
    const times = spreadScheduledTimes(slots, baseDate, 'America/New_York', TIME_RULES, FALLBACK_TIMES);
    expect(times).toHaveLength(3);
    const days = times.map(t => new Date(t).toDateString());
    expect(new Set(days).size).toBe(3);
  });
});

describe('findNextAvailableDay', () => {
  it('skips occupied days and finds next platform-optimal day', () => {
    const collidingDate = new Date(2026, 5, 1, 12, 0, 0);
    const occupied = new Set(['Mon Jun 01 2026']);
    const slot = { platform: 'instagram', content_type: 'photo', day_offset: 0 };
    const result = findNextAvailableDay(slot, collidingDate, occupied, 'America/New_York', TIME_RULES, FALLBACK_TIMES);
    const resultDate = new Date(result);
    expect(resultDate.getTime()).not.toBeNaN();
    expect(resultDate.toDateString()).not.toBe('Mon Jun 01 2026');
    expect(resultDate.getDay()).toBe(3);
  });

  it('uses fallback times when no platform rule matches within 14 days', () => {
    const collidingDate = new Date(2026, 5, 1, 12, 0, 0);
    const occupied = new Set([
      'Mon Jun 01 2026', 'Wed Jun 03 2026',
      'Mon Jun 08 2026', 'Wed Jun 10 2026',
      'Mon Jun 15 2026', 'Wed Jun 17 2026',
    ]);
    const slot = { platform: 'instagram', content_type: 'photo', day_offset: 0 };
    const result = findNextAvailableDay(slot, collidingDate, occupied, 'America/New_York', TIME_RULES, FALLBACK_TIMES);
    const resultDate = new Date(result);
    expect(resultDate.getTime()).not.toBeNaN();
    expect(occupied.has(resultDate.toDateString())).toBe(false);
  });
});
