import { describe, it, expect } from 'vitest';
import { resolveVerifiedAddress, CREATOR_PRECISION, BUSINESS_PRECISION } from './geocodeVerification';

describe('resolveVerifiedAddress', () => {
  it('returns null when the geocoder found nothing', () => {
    expect(resolveVerifiedAddress({ results: [] }, BUSINESS_PRECISION)).toBeNull();
  });

  /** A partial match is not a verified address — we do not know where they are. */
  it('returns null on a partial match', () => {
    const r = { results: [{ partial_match: true, geometry: { location: { lat: 40.7, lng: -74.0 } }, types: ['street_address'] }] };
    expect(resolveVerifiedAddress(r, BUSINESS_PRECISION)).toBeNull();
  });

  it('returns exact, unrounded coordinates and a stamp on a clean street-level match for a business', () => {
    const r = { results: [{ geometry: { location: { lat: 40.7362, lng: -74.0286 } }, types: ['street_address'] }] };
    const out = resolveVerifiedAddress(r, BUSINESS_PRECISION);
    // A business publishes its exact address on purpose — full precision, not toBeCloseTo.
    expect(out?.lat).toBe(40.7362);
    expect(out?.lng).toBe(-74.0286);
    expect(out?.verifiedAt).not.toBeNull();
  });

  /**
   * The privacy asymmetry: a creator is geocoded to a city/postal centroid, never a
   * street address. Precise home coordinates are data we do not need and should not hold.
   */
  it('refuses street-level precision for a creator', () => {
    const r = { results: [{ geometry: { location: { lat: 40.7362, lng: -74.0286 } }, types: ['street_address'] }] };
    expect(resolveVerifiedAddress(r, CREATOR_PRECISION)).toBeNull();
  });

  it('accepts a locality centroid for a creator, rounded to 2 decimal places', () => {
    const r = { results: [{ geometry: { location: { lat: 40.73916, lng: -73.99178 } }, types: ['locality', 'political'] }] };
    const out = resolveVerifiedAddress(r, CREATOR_PRECISION);
    expect(out?.lat).toBe(40.74);
    expect(out?.lng).toBe(-73.99);
  });

  /**
   * Ruling 17 (progress.md, task-7 fix round 1): CREATOR_PRECISION still accepts
   * `postal_code`, and a full postal code centroid (UK/NL/CA-shaped codes especially)
   * can itself be street-level — so accepting the TYPE alone is not a sufficient
   * privacy guarantee. Rounding to ~1.1km must hold even for the type that is closest
   * to street precision, not just for a locality.
   */
  it('rounds a postal-code-precision match for a creator to city-scale, even when the raw value is street-level', () => {
    const r = { results: [{ geometry: { location: { lat: 51.50735, lng: -0.12776 } }, types: ['postal_code'] }] };
    const out = resolveVerifiedAddress(r, CREATOR_PRECISION);
    expect(out?.lat).toBe(51.51);
    expect(out?.lng).toBe(-0.13);
  });

  it('never rounds business coordinates, even when the input happens to be round-number-adjacent', () => {
    const r = { results: [{ geometry: { location: { lat: 40.7449999, lng: -73.9917799 } }, types: ['premise'] }] };
    const out = resolveVerifiedAddress(r, BUSINESS_PRECISION);
    expect(out?.lat).toBe(40.7449999);
    expect(out?.lng).toBe(-73.9917799);
  });

  /**
   * Ruling 6 (progress.md): a genuinely distinct defensive-branch case, not a duplicate
   * of the "no results" case above — here a result exists and its types match, but the
   * geometry itself is missing. Must not throw, must not guess.
   */
  it('returns null when a matched result has no geometry.location', () => {
    const r = { results: [{ types: ['street_address'] }] };
    expect(resolveVerifiedAddress(r, BUSINESS_PRECISION)).toBeNull();
  });
});
