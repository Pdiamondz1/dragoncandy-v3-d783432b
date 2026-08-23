/**
 * Turns a Google Geocoding response into a verified location, or nothing.
 *
 * `address_verified_at` is stamped ONLY on a clean, unambiguous match. A failed or
 * partial geocode leaves it NULL, which derives `unmet` — honestly, because we do not
 * know where they are.
 *
 * Precision is deliberately asymmetric. A business is a place customers visit and
 * publishes its address. A creator's home address is not something to display, and
 * storing a precise one invites exposure — so creators resolve to a city/postal
 * centroid, enough for distance matching and not enough to find someone's home.
 *
 * Pure and dependency-free — no network, no Date mocking required beyond `verifiedAt`
 * being a fresh timestamp — so it is unit-testable with a plain geocoder-shaped fixture
 * and runs identically wherever it is called from (browser or a Deno edge function; see
 * supabase/functions/verify-address/resolveVerifiedAddress.ts, which mirrors this file
 * because edge functions in this repo do not import across the src/ boundary — see
 * identitySignals.ts for the established precedent).
 */

export const BUSINESS_PRECISION = ['street_address', 'premise', 'subpremise', 'establishment'] as const;
export const CREATOR_PRECISION = ['locality', 'postal_code', 'administrative_area_level_2'] as const;

interface GeocodeResult {
  partial_match?: boolean;
  types?: string[];
  geometry?: { location?: { lat: number; lng: number } };
}

export interface VerifiedAddress {
  lat: number;
  lng: number;
  verifiedAt: string;
}

export function resolveVerifiedAddress(
  response: { results?: GeocodeResult[] },
  acceptedTypes: readonly string[],
): VerifiedAddress | null {
  const first = response.results?.[0];
  if (!first) return null;
  if (first.partial_match) return null;

  const types = first.types ?? [];
  if (!types.some((t) => acceptedTypes.includes(t))) return null;

  const loc = first.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;

  return { lat: loc.lat, lng: loc.lng, verifiedAt: new Date().toISOString() };
}
