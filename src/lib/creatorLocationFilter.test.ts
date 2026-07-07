import { describe, test, expect } from 'vitest';
import {
  detectQueryKind,
  resolveCreatorCoords,
  filterByRadius,
  sortNearest,
} from './creatorLocationFilter';
import { lookupCityCoords } from './geoUtils';

const NYC = { lat: 40.7128, lng: -74.006 };
const LA = { lat: 34.0522, lng: -118.2437 };

describe('detectQueryKind', () => {
  test('5-digit string is a zip', () => {
    expect(detectQueryKind('10001')).toBe('zip');
  });
  test('zip+4 is a zip', () => {
    expect(detectQueryKind('10001-1234')).toBe('zip');
  });
  test('trims whitespace before testing', () => {
    expect(detectQueryKind('  07030 ')).toBe('zip');
  });
  test('a place name is a city', () => {
    expect(detectQueryKind('Hoboken')).toBe('city');
    expect(detectQueryKind('New York')).toBe('city');
  });
  test('non-5-digit numbers are treated as city', () => {
    expect(detectQueryKind('123')).toBe('city');
  });
});

describe('resolveCreatorCoords', () => {
  test('prefers static city coords over the geocoded map', () => {
    const nyStatic = lookupCityCoords('New York', 'US');
    expect(nyStatic).not.toBeNull(); // guard: table must contain New York
    const geocoded = new Map([['c1', LA]]);
    const coords = resolveCreatorCoords(
      { id: 'c1', city: 'New York', country: 'US' },
      geocoded,
    );
    expect(coords).toEqual(nyStatic);
  });
  test('falls back to the geocoded map when no static match', () => {
    const geocoded = new Map([['c1', LA]]);
    const coords = resolveCreatorCoords({ id: 'c1', city: 'Nowheresville', country: 'US' }, geocoded);
    expect(coords).toEqual(LA);
  });
  test('returns null when neither static nor geocoded coords exist', () => {
    expect(resolveCreatorCoords({ id: 'c1' }, new Map())).toBeNull();
  });
});

describe('filterByRadius', () => {
  const creators = [
    { id: 'near', city: 'Nowhere', country: 'US' }, // placed via geocoded map = NYC
    { id: 'far', city: 'Nowhere', country: 'US' },   // placed via geocoded map = LA
    { id: 'lost' },                                   // unplaceable
  ];
  const geocoded = new Map([
    ['near', NYC],
    ['far', LA],
  ]);

  test('keeps only creators within the radius and annotates distanceMiles', () => {
    const { list, unplaceableCount } = filterByRadius(creators, NYC, 25, geocoded);
    expect(list.map(c => c.id)).toEqual(['near']);
    expect(list[0].distanceMiles).toBe(0);
    expect(unplaceableCount).toBe(1); // 'lost' couldn't be placed
  });

  test('a larger radius includes the far creator', () => {
    const { list } = filterByRadius(creators, NYC, 3000, geocoded);
    expect(list.map(c => c.id).sort()).toEqual(['far', 'near']);
  });

  test('null radius (Any) keeps everyone and still annotates distance when placeable', () => {
    const { list, unplaceableCount } = filterByRadius(creators, NYC, null, geocoded);
    expect(list.map(c => c.id)).toEqual(['near', 'far', 'lost']);
    expect(list.find(c => c.id === 'near')?.distanceMiles).toBe(0);
    expect(list.find(c => c.id === 'lost')?.distanceMiles).toBeUndefined();
    expect(unplaceableCount).toBe(0); // nothing dropped under "Any"
  });

  test('null center keeps everyone with no distances', () => {
    const { list, unplaceableCount } = filterByRadius(creators, null, 25, geocoded);
    expect(list).toHaveLength(3);
    expect(list.every(c => c.distanceMiles === undefined)).toBe(true);
    expect(unplaceableCount).toBe(0);
  });
});

describe('sortNearest', () => {
  test('orders by ascending distance, undefined last', () => {
    const input = [
      { id: 'a', distanceMiles: 10 },
      { id: 'b', distanceMiles: undefined },
      { id: 'c', distanceMiles: 2 },
    ];
    expect(sortNearest(input).map(c => c.id)).toEqual(['c', 'a', 'b']);
  });
  test('does not mutate the input array', () => {
    const input = [{ id: 'a', distanceMiles: 5 }, { id: 'b', distanceMiles: 1 }];
    sortNearest(input);
    expect(input.map(c => c.id)).toEqual(['a', 'b']);
  });
});
