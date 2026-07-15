import { describe, it, expect } from 'vitest';
import {
  groupByDay, relativeDayLabel, contentTypeEmoji, monthMatrix, dateKey, startOfDay,
  type AgendaItem,
} from './agendaModel';

// Local ISO round-trips through the runner's own tz, so getDate() is stable.
const iso = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).toISOString();
const post = (id: string, date: string, extra: Partial<AgendaItem> = {}): AgendaItem =>
  ({ id, date, kind: 'post', title: id, ...extra });

describe('startOfDay / dateKey', () => {
  it('zeroes the time and builds a local key', () => {
    const d = new Date(2026, 6, 10, 15, 30);
    expect(startOfDay(d).getHours()).toBe(0);
    expect(dateKey(d)).toBe('2026-6-10');
  });
});

describe('groupByDay', () => {
  it('groups by day, drops days before `from`, sorts days and items ascending', () => {
    const items = [
      post('a', iso(2026, 6, 10, 15)),
      post('b', iso(2026, 6, 11, 12)),
      post('c', iso(2026, 6, 10, 9)),
      post('past', iso(2026, 6, 1, 9)),
    ];
    const days = groupByDay(items, { from: new Date(2026, 6, 10) });
    expect(days.map((d) => d.dateKey)).toEqual(['2026-6-10', '2026-6-11']);
    expect(days[0].items.map((i) => i.id)).toEqual(['c', 'a']); // 9am before 3pm
    expect(days[1].items.map((i) => i.id)).toEqual(['b']);
  });

  it('skips items with an invalid timestamp', () => {
    const days = groupByDay([post('bad', 'not-a-date'), post('ok', iso(2026, 6, 10))]);
    expect(days.flatMap((d) => d.items.map((i) => i.id))).toEqual(['ok']);
  });
});

describe('relativeDayLabel', () => {
  const today = new Date(2026, 6, 10);
  it('labels today and tomorrow', () => {
    expect(relativeDayLabel(new Date(2026, 6, 10), today)).toBe('Today');
    expect(relativeDayLabel(new Date(2026, 6, 11), today)).toBe('Tomorrow');
  });
  it('labels other days with the date number', () => {
    expect(relativeDayLabel(new Date(2026, 6, 13), today)).toMatch(/13/);
  });
});

describe('contentTypeEmoji', () => {
  it('maps known types and falls back', () => {
    expect(contentTypeEmoji('video_reel')).toBe('🎬');
    expect(contentTypeEmoji('carousel')).toBe('📱');
    expect(contentTypeEmoji(undefined)).toBe('📸');
  });
});

describe('monthMatrix', () => {
  it('lays out July 2026 Monday-first with leading nulls', () => {
    const weeks = monthMatrix(2026, 6); // July (Jul 1 2026 is a Wednesday)
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toBeNull();
    expect(weeks[0][2]?.getDate()).toBe(1);
    expect(weeks[0][6]?.getDate()).toBe(5);
  });
});
