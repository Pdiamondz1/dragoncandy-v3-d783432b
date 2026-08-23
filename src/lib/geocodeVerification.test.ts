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

  it('returns coordinates and a stamp on a clean street-level match for a business', () => {
    const r = { results: [{ geometry: { location: { lat: 40.7362, lng: -74.0286 } }, types: ['street_address'] }] };
    const out = resolveVerifiedAddress(r, BUSINESS_PRECISION);
    expect(out?.lat).toBeCloseTo(40.7362);
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

  it('accepts a locality centroid for a creator', () => {
    const r = { results: [{ geometry: { location: { lat: 40.745, lng: -74.03 } }, types: ['locality', 'political'] }] };
    expect(resolveVerifiedAddress(r, CREATOR_PRECISION)?.lat).toBeCloseTo(40.745);
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
