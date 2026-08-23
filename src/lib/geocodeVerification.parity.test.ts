import { describe, it, expect } from 'vitest';
import {
  resolveVerifiedAddress as srcResolve,
  CREATOR_PRECISION as SRC_CREATOR_PRECISION,
  BUSINESS_PRECISION as SRC_BUSINESS_PRECISION,
} from './geocodeVerification';
import {
  resolveVerifiedAddress as edgeResolve,
  CREATOR_PRECISION as EDGE_CREATOR_PRECISION,
  BUSINESS_PRECISION as EDGE_BUSINESS_PRECISION,
} from '../../supabase/functions/verify-address/resolveVerifiedAddress';

/**
 * Finding 5 (progress.md, task-7 fix round 1): src/lib/geocodeVerification.ts and
 * supabase/functions/verify-address/resolveVerifiedAddress.ts are a DELIBERATE
 * duplication (Deno cannot import from src/ — see the comment in both files), which is
 * not itself a defect. But nothing previously detected DRIFT between the two beyond a
 * comment asking a future editor to keep them in sync. This test runs the same fixture
 * matrix through both modules and asserts identical output, so a future edit to one
 * copy that isn't mirrored in the other fails a test instead of silently shipping two
 * behaviourally different "the same function".
 */

// Structurally identical to the (unexported) GeocodeResult interface in both source
// modules — TypeScript structural typing accepts this at the call sites below without
// needing to name either module's private type.
interface FixtureGeocodeResult {
  partial_match?: boolean;
  types?: string[];
  geometry?: { location?: { lat: number; lng: number } };
}

const FIXTURES: Array<{ name: string; response: { results?: FixtureGeocodeResult[] } }> = [
  { name: 'no results', response: { results: [] } },
  {
    name: 'partial match',
    response: { results: [{ partial_match: true, geometry: { location: { lat: 40.7, lng: -74.0 } }, types: ['street_address'] }] },
  },
  {
    name: 'clean business street-level match',
    response: { results: [{ geometry: { location: { lat: 40.7362, lng: -74.0286 } }, types: ['street_address'] }] },
  },
  {
    name: 'street-level match rejected for creator precision',
    response: { results: [{ geometry: { location: { lat: 40.7362, lng: -74.0286 } }, types: ['street_address'] }] },
  },
  {
    name: 'creator locality centroid, rounded',
    response: { results: [{ geometry: { location: { lat: 40.73916, lng: -73.99178 } }, types: ['locality', 'political'] }] },
  },
  {
    name: 'creator postal-code centroid, rounded even though street-level',
    response: { results: [{ geometry: { location: { lat: 51.50735, lng: -0.12776 } }, types: ['postal_code'] }] },
  },
  {
    name: 'no geometry.location on an otherwise-matched result',
    response: { results: [{ types: ['street_address'] }] },
  },
];

describe('geocodeVerification.ts and verify-address/resolveVerifiedAddress.ts stay in parity', () => {
  it('exports the same precision arrays (by value)', () => {
    expect(SRC_CREATOR_PRECISION).toEqual(EDGE_CREATOR_PRECISION);
    expect(SRC_BUSINESS_PRECISION).toEqual(EDGE_BUSINESS_PRECISION);
  });

  for (const { name, response } of FIXTURES) {
    it(`agrees on: ${name} (business precision)`, () => {
      const srcOut = srcResolve(response, SRC_BUSINESS_PRECISION);
      const edgeOut = edgeResolve(response, EDGE_BUSINESS_PRECISION);
      if (srcOut === null || edgeOut === null) {
        expect(edgeOut).toBeNull();
        expect(srcOut).toBeNull();
        return;
      }
      expect(edgeOut.lat).toBe(srcOut.lat);
      expect(edgeOut.lng).toBe(srcOut.lng);
    });

    it(`agrees on: ${name} (creator precision)`, () => {
      const srcOut = srcResolve(response, SRC_CREATOR_PRECISION);
      const edgeOut = edgeResolve(response, EDGE_CREATOR_PRECISION);
      if (srcOut === null || edgeOut === null) {
        expect(edgeOut).toBeNull();
        expect(srcOut).toBeNull();
        return;
      }
      expect(edgeOut.lat).toBe(srcOut.lat);
      expect(edgeOut.lng).toBe(srcOut.lng);
    });
  }
});
