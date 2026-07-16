import { describe, test, expect } from 'vitest';
import {
  haversineDistance,
  lookupCityCoords,
  resolveCoords,
  distanceToScore,
  scoreGeographicDistance,
} from './geo';

const HOBOKEN = { lat: 40.7439, lng: -74.0324 };

describe('haversineDistance', () => {
  test('0 for same point', () => {
    expect(haversineDistance(HOBOKEN.lat, HOBOKEN.lng, HOBOKEN.lat, HOBOKEN.lng)).toBe(0);
  });
  test('Hoboken -> Jersey City is ~2 miles', () => {
    const d = haversineDistance(40.7439, -74.0324, 40.7178, -74.0431);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(3);
  });
});

describe('lookupCityCoords', () => {
  test('Hoboken/US resolves', () => {
    const r = lookupCityCoords('Hoboken', 'United States');
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(40.744, 1);
  });
  test('Jersey City resolves (case/space tolerant)', () => {
    expect(lookupCityCoords('  jersey city ', 'United States ')).not.toBeNull();
  });
  test('non-US returns null', () => {
    expect(lookupCityCoords('London', 'UK')).toBeNull();
  });
});

describe('resolveCoords', () => {
  test('city + country', () => {
    expect(resolveCoords('Hoboken', 'United States', null)).not.toBeNull();
  });
  test('falls back to parsing freeform "City, Country"', () => {
    expect(resolveCoords(null, null, 'Hoboken, United States')).not.toBeNull();
  });
  test('null when nothing resolvable', () => {
    expect(resolveCoords(null, null, '')).toBeNull();
    expect(resolveCoords('Tinyville', 'US', null)).toBeNull();
  });
});

describe('distanceToScore tiers', () => {
  test('boundaries', () => {
    expect(distanceToScore(0)).toBe(100);
    expect(distanceToScore(10)).toBe(100);
    expect(distanceToScore(10.1)).toBe(85);
    expect(distanceToScore(25)).toBe(85);
    expect(distanceToScore(25.1)).toBe(70);
    expect(distanceToScore(50)).toBe(70);
    expect(distanceToScore(50.1)).toBe(55);
    expect(distanceToScore(100)).toBe(55);
    expect(distanceToScore(100.1)).toBe(45);
  });
});

describe('scoreGeographicDistance', () => {
  test('same city -> 100, distance 0', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: 'Hoboken', country: 'United States', location: 'Hoboken, United States' });
    expect(r.score).toBe(100);
    expect(r.distanceMiles).toBe(0);
  });
  test('adjacent town (Jersey City) still ranks top tier with a real distance', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: 'Jersey City', country: 'United States', location: null });
    expect(r.score).toBe(100);
    expect(r.distanceMiles).toBeGreaterThan(0);
    expect(r.distanceMiles).toBeLessThan(5);
  });
  test('far city scores lower with a large distance', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: 'Los Angeles', country: 'United States', location: null });
    expect(r.score).toBe(45);
    expect(r.distanceMiles!).toBeGreaterThan(100);
  });
  test('no business center -> neutral 50, no distance', () => {
    const r = scoreGeographicDistance(null, 'United States',
      { city: 'Hoboken', country: 'United States', location: null });
    expect(r).toEqual({ score: 50, distanceMiles: null });
  });
  test('unresolvable creator, same country -> soft 55', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: null, country: 'United States', location: null });
    expect(r).toEqual({ score: 55, distanceMiles: null });
  });
  test('unresolvable creator, different/unknown country -> 40', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: null, country: 'Canada', location: null });
    expect(r).toEqual({ score: 40, distanceMiles: null });
  });
});
