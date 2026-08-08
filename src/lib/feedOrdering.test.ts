import { describe, it, expect } from 'vitest';
import { sortByUploadedAt, isNewSince, countNewSince } from './feedOrdering';

const item = (id: string, uploadedAt?: string) => ({ id, uploadedAt });

describe('sortByUploadedAt', () => {
  it('orders newest first', () => {
    const sorted = sortByUploadedAt([
      item('old', '2026-04-08T00:00:00Z'),
      item('new', '2026-08-01T00:00:00Z'),
      item('mid', '2026-06-01T00:00:00Z'),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['new', 'mid', 'old']);
  });

  it('is stable across repeated calls — the shuffle is gone', () => {
    const input = [
      item('a', '2026-04-08T00:00:00Z'),
      item('b', '2026-04-08T00:00:00Z'),
      item('c', '2026-04-08T00:00:00Z'),
    ];
    const first = sortByUploadedAt(input).map((i) => i.id);
    for (let n = 0; n < 5; n++) {
      expect(sortByUploadedAt(input).map((i) => i.id)).toEqual(first);
    }
    // Equal timestamps keep input order rather than being reordered arbitrarily.
    expect(first).toEqual(['a', 'b', 'c']);
  });

  it('sorts unknown timestamps to the end, preserving their relative order', () => {
    const sorted = sortByUploadedAt([
      item('unknown1'),
      item('dated', '2026-04-08T00:00:00Z'),
      item('unknown2'),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['dated', 'unknown1', 'unknown2']);
  });

  it('treats an unparseable timestamp as unknown, not as epoch 0', () => {
    const sorted = sortByUploadedAt([item('bad', 'not-a-date'), item('good', '2026-04-08T00:00:00Z')]);
    expect(sorted.map((i) => i.id)).toEqual(['good', 'bad']);
  });

  it('does not mutate its input', () => {
    const input = [item('a', '2026-04-08T00:00:00Z'), item('b', '2026-08-01T00:00:00Z')];
    const before = input.map((i) => i.id);
    sortByUploadedAt(input);
    expect(input.map((i) => i.id)).toEqual(before);
  });

  it('handles an empty list', () => {
    expect(sortByUploadedAt([])).toEqual([]);
  });
});

describe('isNewSince', () => {
  const lastVisit = '2026-06-01T00:00:00Z';

  it('is true only for items uploaded after the last visit', () => {
    expect(isNewSince(item('x', '2026-06-02T00:00:00Z'), lastVisit)).toBe(true);
    expect(isNewSince(item('x', '2026-05-31T00:00:00Z'), lastVisit)).toBe(false);
  });

  it('is false exactly at the boundary', () => {
    expect(isNewSince(item('x', lastVisit), lastVisit)).toBe(false);
  });

  it('badges nothing on a first-ever visit', () => {
    // Everything would be "new" — that is noise, not signal.
    expect(isNewSince(item('x', '2026-08-01T00:00:00Z'), null)).toBe(false);
  });

  it('never badges an item whose timestamp is unknown', () => {
    expect(isNewSince(item('x'), lastVisit)).toBe(false);
  });

  it('is false when the stored marker is corrupt', () => {
    expect(isNewSince(item('x', '2026-08-01T00:00:00Z'), 'garbage')).toBe(false);
  });
});

describe('countNewSince', () => {
  it('counts only genuinely newer items', () => {
    const items = [
      item('a', '2026-08-01T00:00:00Z'),
      item('b', '2026-07-01T00:00:00Z'),
      item('c', '2026-05-01T00:00:00Z'),
      item('d'),
    ];
    expect(countNewSince(items, '2026-06-01T00:00:00Z')).toBe(2);
  });

  it('is 0 on a first-ever visit', () => {
    expect(countNewSince([item('a', '2026-08-01T00:00:00Z')], null)).toBe(0);
  });
});
