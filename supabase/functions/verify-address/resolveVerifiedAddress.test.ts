import { describe, it, expect } from 'vitest';
import { resolveVerifiedAddress, isGeocodeAnswer, CREATOR_PRECISION, BUSINESS_PRECISION } from './resolveVerifiedAddress';

// Identical cases to src/lib/geocodeVerification.test.ts — this file exists because
// this module is a deliberate duplicate (see the comment in resolveVerifiedAddress.ts),
// so it needs its own proof of behaviour under the Deno-side toolchain rather than
// trusting that the src/ copy passing means this one does too. See also
// src/lib/geocodeVerification.parity.test.ts, which asserts the two modules agree
// directly rather than merely having parallel test suites.

describe('resolveVerifiedAddress (edge function copy)', () => {
  it('returns null when the geocoder found nothing', () => {
    expect(resolveVerifiedAddress({ results: [] }, BUSINESS_PRECISION)).toBeNull();
  });

  it('returns null on a partial match', () => {
    const r = { results: [{ partial_match: true, geometry: { location: { lat: 40.7, lng: -74.0 } }, types: ['street_address'] }] };
    expect(resolveVerifiedAddress(r, BUSINESS_PRECISION)).toBeNull();
  });

  it('returns exact, unrounded coordinates and a stamp on a clean street-level match for a business', () => {
    const r = { results: [{ geometry: { location: { lat: 40.7362, lng: -74.0286 } }, types: ['street_address'] }] };
    const out = resolveVerifiedAddress(r, BUSINESS_PRECISION);
    expect(out?.lat).toBe(40.7362);
    expect(out?.lng).toBe(-74.0286);
    expect(out?.verifiedAt).not.toBeNull();
  });

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

  it('returns null when a matched result has no geometry.location', () => {
    const r = { results: [{ types: ['street_address'] }] };
    expect(resolveVerifiedAddress(r, BUSINESS_PRECISION)).toBeNull();
  });
});

/**
 * Codex second review, round 2 (P1): Google returns HTTP 200 with a JSON `status` for most
 * failures, so an `resp.ok` check alone let OVER_QUERY_LIMIT and REQUEST_DENIED through as
 * "no result" — and the write path clears address_verified_at/lat/lng on no result. A quota
 * blip therefore revoked still-true verifications; a bad key would have revoked them
 * platform-wide.
 */
describe('isGeocodeAnswer', () => {
  it('treats OK as an answer', () => {
    expect(isGeocodeAnswer('OK')).toBe(true);
  });

  it('treats ZERO_RESULTS as an answer — "does not resolve" is a real fact about the address', () => {
    expect(isGeocodeAnswer('ZERO_RESULTS')).toBe(true);
  });

  it.each(['OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT', 'REQUEST_DENIED', 'INVALID_REQUEST', 'UNKNOWN_ERROR'])(
    'refuses %s — a fact about our quota/key/request, not about the address',
    (status) => {
      expect(isGeocodeAnswer(status)).toBe(false);
    },
  );

  it('refuses a missing status rather than assuming OK', () => {
    expect(isGeocodeAnswer(undefined)).toBe(false);
  });

  it('refuses an unrecognised status', () => {
    expect(isGeocodeAnswer('SOMETHING_NEW')).toBe(false);
  });
});
