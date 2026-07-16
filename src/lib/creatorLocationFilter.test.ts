import { describe, test, expect } from 'vitest';
import {
  detectQueryKind,
  resolveCreatorCoords,
  filterByRadius,
  sortNearest,
  matchesLocationText,
  isPlaceQueryMatch,
  filterByRadiusWithSearch,
  filterMediaByRadius,
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
  test('prefers the geocoded (precise) result over the static city fallback', () => {
    const geocoded = new Map([['c1', LA]]);
    const coords = resolveCreatorCoords({ id: 'c1', city: 'New York', country: 'US' }, geocoded);
    expect(coords).toEqual(LA); // geocoded wins even though New York is in the static table
  });
  test('falls back to static city coords when there is no geocoded entry', () => {
    const nyStatic = lookupCityCoords('New York', 'US');
    expect(nyStatic).not.toBeNull(); // guard: table must contain New York
    const coords = resolveCreatorCoords({ id: 'c1', city: 'New York', country: 'US' }, new Map());
    expect(coords).toEqual(nyStatic);
  });
  test('returns null when neither geocoded nor static coords exist', () => {
    expect(resolveCreatorCoords({ id: 'c1', city: 'Nowheresville', country: 'US' }, new Map())).toBeNull();
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

describe('matchesLocationText', () => {
  test('matches on city, postal_code, country, or freeform location (case-insensitive)', () => {
    expect(matchesLocationText({ city: 'Miami' }, 'miami')).toBe(true);
    expect(matchesLocationText({ postal_code: '07030' }, '07030')).toBe(true);
    expect(matchesLocationText({ country: 'United States' }, 'united')).toBe(true);
    expect(matchesLocationText({ location: 'Hoboken, United States' }, 'HOBOKEN')).toBe(true);
  });
  test('a non-location term and an empty term are not location matches', () => {
    expect(matchesLocationText({ city: 'Boston', location: 'Boston, US' }, 'photographer')).toBe(false);
    expect(matchesLocationText({ city: 'Boston' }, '   ')).toBe(false);
    expect(matchesLocationText({}, 'miami')).toBe(false);
  });
});

describe('isPlaceQueryMatch (strict radius-escape predicate)', () => {
  test('whole-word city match escapes; a substring inside a city name does not', () => {
    expect(isPlaceQueryMatch({ city: 'Miami' }, 'miami')).toBe(true);
    expect(isPlaceQueryMatch({ city: 'Jersey City' }, 'jersey city')).toBe(true);
    expect(isPlaceQueryMatch({ city: 'Hartford' }, 'art')).toBe(false); // "art" ⊂ Hartford, not a word
  });
  test('a ZIP query matches the creator postal_code prefix', () => {
    expect(isPlaceQueryMatch({ postal_code: '07030-4406' }, '07030')).toBe(true);
    expect(isPlaceQueryMatch({ postal_code: '10001' }, '07030')).toBe(false);
  });
  test('short or broad terms never escape (guards the near-me default)', () => {
    expect(isPlaceQueryMatch({ city: 'Anywhere', postal_code: '90210' }, 'us')).toBe(false); // too short
    expect(isPlaceQueryMatch({ city: 'Anywhere' }, '')).toBe(false);
    expect(isPlaceQueryMatch({ city: 'Anywhere' }, 'photographer')).toBe(false);
  });
});

describe('filterByRadiusWithSearch (search-aware distance)', () => {
  // Both "far" creators are placed at LA (~2450mi from NYC); "near" is at NYC.
  const near = { id: 'near', city: 'Nowhere', country: 'US', location: 'Nowhere' };
  const farBoston = { id: 'farBoston', city: 'Boston', country: 'US', location: 'Boston, US' };
  const farMiami = { id: 'farMiami', city: 'Miami', country: 'US', location: 'Miami, US' };
  const creators = [near, farBoston, farMiami];
  const geocoded = new Map([['near', NYC], ['farBoston', LA], ['farMiami', LA]]);

  test('a location search keeps the matched place even when far, but not other far creators', () => {
    const { list } = filterByRadiusWithSearch(creators, NYC, 25, 'miami', geocoded);
    expect(list.map(c => c.id).sort()).toEqual(['farMiami', 'near']); // farBoston stays gated out
  });
  test('a name/skill search (no location match) keeps only creators within the radius', () => {
    const { list, unplaceableCount } = filterByRadiusWithSearch(creators, NYC, 25, 'photographer', geocoded);
    expect(list.map(c => c.id)).toEqual(['near']);
    expect(unplaceableCount).toBe(0);
  });
  test('no search term behaves like the plain radius filter', () => {
    const { list } = filterByRadiusWithSearch(creators, NYC, 25, '', geocoded);
    expect(list.map(c => c.id)).toEqual(['near']);
  });
  test('null radius ("Any") keeps everyone regardless of search', () => {
    const { list } = filterByRadiusWithSearch(creators, NYC, null, 'photographer', geocoded);
    expect(list.map(c => c.id).sort()).toEqual(['farBoston', 'farMiami', 'near']);
  });
  test('a broad country substring ("us") does NOT escape the radius', () => {
    // every creator's country is 'US' — a 2-char query must not disable near-me
    const { list } = filterByRadiusWithSearch(creators, NYC, 25, 'us', geocoded);
    expect(list.map(c => c.id)).toEqual(['near']);
  });
  test('a substring inside a city name ("art" ⊂ Hartford) does NOT escape', () => {
    const hartford = { id: 'hartford', city: 'Hartford', country: 'US', location: 'Hartford, US' };
    const geo = new Map([...geocoded, ['hartford', LA] as [string, typeof LA]]);
    const { list } = filterByRadiusWithSearch([near, hartford], NYC, 25, 'art', geo);
    expect(list.map(c => c.id)).toEqual(['near']); // hartford is far and "art" is not a place match
  });
  test('counts unplaceable non-location matches (so the "couldn’t place" note is accurate)', () => {
    const withLost = [...creators, { id: 'lost' }]; // no coords, no location text
    const { list, unplaceableCount } = filterByRadiusWithSearch(withLost, NYC, 25, '', geocoded);
    expect(list.map(c => c.id)).toEqual(['near']);
    expect(unplaceableCount).toBe(1);
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

describe('filterMediaByRadius', () => {
  // creators: A ≈ 1 mi from NYC (in range), B in LA (far). No structured city/country,
  // so placement relies entirely on the precomputed geocodedById map.
  const geo = new Map([
    ['A', { lat: 40.72, lng: -74.0 }],
    ['B', { lat: 34.0522, lng: -118.2437 }],
  ]);
  const mk = (id: string, creatorId: string) => ({ id, creatorId } as { id: string; creatorId: string });
  const media = [mk('a1', 'A'), mk('a2', 'A'), mk('b1', 'B')];

  test('no center → passthrough (never silent-empty)', () => {
    expect(filterMediaByRadius(media, null, 25, geo)).toHaveLength(3);
  });

  test('finite radius keeps in-range creators, drops far ones', () => {
    const out = filterMediaByRadius(media, NYC, 25, geo);
    expect(out.map(m => m.id)).toEqual(['a1', 'a2']);
  });

  test('Any radius (null) with a center keeps all placeable media', () => {
    expect(filterMediaByRadius(media, NYC, null, geo)).toHaveLength(3);
  });

  test('media from an unplaceable creator is dropped under a finite radius', () => {
    const withGhost = [...media, mk('c1', 'C')]; // C not in geo, no city/country
    const out = filterMediaByRadius(withGhost, NYC, 25, geo);
    expect(out.map(m => m.id)).toEqual(['a1', 'a2']);
  });

  test('all media from one creator are kept or dropped together', () => {
    const out = filterMediaByRadius(media, NYC, 25, geo);
    expect(out.filter(m => m.creatorId === 'A')).toHaveLength(2);
    expect(out.filter(m => m.creatorId === 'B')).toHaveLength(0);
  });
});
