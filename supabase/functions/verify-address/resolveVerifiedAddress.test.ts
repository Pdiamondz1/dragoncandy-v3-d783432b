import { describe, it, expect } from 'vitest';
import { resolveVerifiedAddress, CREATOR_PRECISION, BUSINESS_PRECISION } from './resolveVerifiedAddress';

// Identical cases to src/lib/geocodeVerification.test.ts — this file exists because
// this module is a deliberate duplicate (see the comment in resolveVerifiedAddress.ts),
// so it needs its own proof of behaviour under the Deno-side toolchain rather than
// trusting that the src/ copy passing means this one does too.

describe('resolveVerifiedAddress (edge function copy)', () => {
  it('returns null when the geocoder found nothing', () => {
    expect(resolveVerifiedAddress({ results: [] }, BUSINESS_PRECISION)).toBeNull();
  });

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

  it('refuses street-level precision for a creator', () => {
    const r = { results: [{ geometry: { location: { lat: 40.7362, lng: -74.0286 } }, types: ['street_address'] }] };
    expect(resolveVerifiedAddress(r, CREATOR_PRECISION)).toBeNull();
  });

  it('accepts a locality centroid for a creator', () => {
    const r = { results: [{ geometry: { location: { lat: 40.745, lng: -74.03 } }, types: ['locality', 'political'] }] };
    expect(resolveVerifiedAddress(r, CREATOR_PRECISION)?.lat).toBeCloseTo(40.745);
  });

  it('returns null when a matched result has no geometry.location', () => {
    const r = { results: [{ types: ['street_address'] }] };
    expect(resolveVerifiedAddress(r, BUSINESS_PRECISION)).toBeNull();
  });
});
