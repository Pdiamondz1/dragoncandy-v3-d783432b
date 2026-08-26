import { describe, it, expect } from 'vitest';
import {
  METROS,
  MODEL_YEARS,
  ADDRESSABLE_NAICS,
  ADDRESSABLE_BUCKETS,
  addressableVenues,
  totalFoodServiceVenues,
  enabledMetros,
  METRO_ASSUMPTIONS,
} from './metros';
import { findStale, MAX_MEASURED_AGE_DAYS } from './types';

describe('the addressable band', () => {
  // Spec section 4.2. Limited-service is franchised fast food, where social is set at
  // corporate; special food services have no fixed venue to market.
  it('excludes limited-service and special food services', () => {
    expect(ADDRESSABLE_NAICS).not.toContain('722513');
    expect(ADDRESSABLE_NAICS).not.toContain('7223');
    expect([...ADDRESSABLE_NAICS].sort()).toEqual(['722410', '722511', '722515']);
  });

  it('excludes venues under 5 employees and over 49', () => {
    expect([...ADDRESSABLE_BUCKETS].sort()).toEqual(['b10_19', 'b20_49', 'b5_9']);
  });

  // 78 full-service (15+22+41) + 16 bars (3+8+5) + 29 coffee (15+10+4) = 123, read off the
  // committed 2023 ZBP snapshot. The brief was written against the 2022 vintage (120 / 251);
  // the committed snapshot is 2023, whose Hoboken figures are 123 / 258 instead. A vintage
  // moving under you and changing the count is the fetch script working correctly -- see
  // scripts/fetch-census-tam.ts's header and censusTam.test.ts's matching note.
  it('yields 123 addressable venues in Hoboken against 258 town-wide', () => {
    expect(addressableVenues('hoboken')).toBe(123);
    expect(totalFoodServiceVenues('hoboken')).toBe(258);
  });

  it('never lets the addressable count exceed the town-wide count', () => {
    for (const m of METROS) {
      expect(addressableVenues(m.id), m.id).toBeLessThanOrEqual(totalFoodServiceVenues(m.id));
    }
  });
});

describe('the metro registry', () => {
  it('models exactly 2026, 2027 and 2028', () => {
    expect(MODEL_YEARS).toEqual([2026, 2027, 2028]);
  });

  it('names the three launch metros in rollout order', () => {
    expect(METROS.map((m) => m.id)).toEqual(['hoboken', 'manhattan', 'palm-beach']);
  });

  it('orders launch months by the rollout plan', () => {
    const months = METROS.map((m) => m.launchMonth.value);
    expect(months).toEqual([...months].sort((a, b) => a - b));
    expect(months[0]).toBeGreaterThanOrEqual(1);
    expect(months[months.length - 1]).toBeLessThanOrEqual(36);
  });

  it('ramps penetration monotonically and never past 100%', () => {
    for (const m of METROS) {
      const p = MODEL_YEARS.map((y) => m.penetration[y].value);
      for (const v of p) {
        expect(v, `${m.id}`).toBeGreaterThanOrEqual(0);
        expect(v, `${m.id}`).toBeLessThanOrEqual(1);
      }
      expect(p, `${m.id} penetration must not go backwards`).toEqual([...p].sort((a, b) => a - b));
    }
  });

  // A penetration that implies more customers than venues is the single arithmetic error
  // that would make the whole forecast nonsense, so it gets its own check.
  it('never implies more customers than addressable venues', () => {
    for (const m of METROS) {
      const venues = addressableVenues(m.id);
      for (const y of MODEL_YEARS) {
        expect(Math.round(venues * m.penetration[y].value), `${m.id} ${y}`).toBeLessThanOrEqual(venues);
      }
    }
  });

  // Palm Beach's geography moved from the town ZIP (33480) to the county (12099) because the
  // town has no 722410 row and two suppressed buckets each in 722511 and 722515 -- addressableVenues
  // would throw rather than silently undercount. The label must read "Palm Beach County, FL",
  // never "Palm Beach, FL", so a reader can't mistake the county-wide denominator for the town.
  it('labels Palm Beach by its county geography, not the barrier-island town', () => {
    const palmBeach = METROS.find((m) => m.id === 'palm-beach');
    expect(palmBeach?.geography.kind).toBe('county');
    expect(palmBeach?.geography.code).toBe('12099');
    expect(palmBeach?.label).toBe('Palm Beach County, FL');
    expect(palmBeach?.label).not.toBe('Palm Beach, FL');
    expect(addressableVenues('palm-beach')).toBeGreaterThan(0);
  });

  it('enables only metros marked enabled', () => {
    expect(enabledMetros().every((m) => m.enabled)).toBe(true);
  });

  it('registers every metro assumption for staleness checking', () => {
    expect(Object.keys(METRO_ASSUMPTIONS).length).toBeGreaterThanOrEqual(METROS.length * 4);
    expect(findStale(METRO_ASSUMPTIONS, new Date(), MAX_MEASURED_AGE_DAYS)).toEqual([]);
  });
});
