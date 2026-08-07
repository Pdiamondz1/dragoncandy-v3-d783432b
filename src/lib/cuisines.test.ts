import { describe, it, expect } from 'vitest';
import { CUISINE_ITEMS, CUISINE_VALUES, cuisineLabel } from './cuisines';

describe('cuisines', () => {
  it('exposes a non-empty list with unique slugs', () => {
    expect(CUISINE_ITEMS.length).toBeGreaterThan(0);
    const values = CUISINE_ITEMS.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('CUISINE_VALUES contains every item value', () => {
    for (const item of CUISINE_ITEMS) {
      expect(CUISINE_VALUES.has(item.value)).toBe(true);
    }
  });

  it('cuisineLabel returns the label for a known slug', () => {
    expect(cuisineLabel('italian')).toBe('Italian');
  });

  it('cuisineLabel falls back to the raw value for an unknown slug', () => {
    expect(cuisineLabel('klingon')).toBe('klingon');
  });
});
