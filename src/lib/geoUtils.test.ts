import { describe, test, expect } from 'vitest';
import { haversineDistance, lookupCityCoords } from './geoUtils';

describe('haversineDistance', () => {
  test('returns 0 for same coordinates', () => {
    expect(haversineDistance(40.7128, -74.0060, 40.7128, -74.0060)).toBe(0);
  });

  test('calculates NYC to Philadelphia (~80 miles straight-line)', () => {
    const distance = haversineDistance(40.7128, -74.0060, 39.9526, -75.1652);
    expect(distance).toBeGreaterThan(75);
    expect(distance).toBeLessThan(85);
  });

  test('calculates NYC to LA (~2450 miles)', () => {
    const distance = haversineDistance(40.7128, -74.0060, 34.0522, -118.2437);
    expect(distance).toBeGreaterThan(2400);
    expect(distance).toBeLessThan(2500);
  });

  test('calculates short distance (~10 miles)', () => {
    const distance = haversineDistance(40.7580, -73.9855, 40.7357, -74.1724);
    expect(distance).toBeGreaterThan(8);
    expect(distance).toBeLessThan(12);
  });
});

describe('lookupCityCoords', () => {
  test('returns coords for known US city', () => {
    const result = lookupCityCoords('Philadelphia', 'US');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(39.9526, 1);
    expect(result!.lng).toBeCloseTo(-75.1652, 1);
  });

  test('is case-insensitive for city name', () => {
    const result = lookupCityCoords('PHILADELPHIA', 'United States');
    expect(result).not.toBeNull();
  });

  test('handles country variants: us, usa, u.s., u.s.a., united states', () => {
    const variants = ['us', 'USA', 'U.S.', 'U.S.A.', 'united states', 'United States'];
    for (const country of variants) {
      const result = lookupCityCoords('New York', country);
      expect(result).not.toBeNull();
    }
  });

  test('handles the ISO short-name country variant "United States of America (the)"', () => {
    // Google/ISO can return this exact string; a creator in prod carries it.
    expect(lookupCityCoords('New York', 'United States of America (the)')).not.toBeNull();
  });

  test('includes Hoboken, NJ (DragonCandy HQ city) in the static fallback', () => {
    const result = lookupCityCoords('Hoboken', 'United States');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(40.744, 1);
    expect(result!.lng).toBeCloseTo(-74.032, 1);
  });

  test('returns null for non-US country', () => {
    expect(lookupCityCoords('London', 'UK')).toBeNull();
    expect(lookupCityCoords('Toronto', 'Canada')).toBeNull();
  });

  test('returns null for unknown US city', () => {
    expect(lookupCityCoords('Tinyville', 'US')).toBeNull();
  });

  test('returns null for empty city or country', () => {
    expect(lookupCityCoords('', 'US')).toBeNull();
    expect(lookupCityCoords('Philadelphia', '')).toBeNull();
  });

  test('trims whitespace from city name', () => {
    const result = lookupCityCoords('  Philadelphia  ', 'US');
    expect(result).not.toBeNull();
  });
});
