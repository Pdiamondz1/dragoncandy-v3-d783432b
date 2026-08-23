/**
 * Turns a Google Geocoding response into a verified location, or nothing.
 *
 * This is a deliberate mirror of src/lib/geocodeVerification.ts, not an import of it —
 * edge functions in this repo do not import across the src/ boundary (see
 * supabase/functions/stripe-webhook/identitySignals.ts for the established precedent:
 * pure, dependency-free logic is duplicated per-function rather than shared, so each
 * function's deploy bundle has no dependency on files outside its own directory).
 * Keep the two files behaviourally identical; src/lib/geocodeVerification.parity.test.ts
 * asserts exactly that across a fixture matrix, so a drift here fails a test rather
 * than being caught only by inspection.
 *
 * `address_verified_at` is stamped ONLY on a clean, unambiguous match. A failed or
 * partial geocode leaves it NULL, which derives `unmet` — honestly, because we do not
 * know where they are.
 *
 * Precision is deliberately asymmetric. A business is a place customers visit and
 * publishes its address, so business coordinates are kept at full precision. A
 * creator's home address is not something to display, and storing a precise one
 * invites exposure — so creator coordinates are ROUNDED TO 2 DECIMAL PLACES
 * (~1.1 km, genuinely city-scale) at write time, on top of CREATOR_PRECISION already
 * restricting which Google result TYPES are accepted. The rounding is what makes the
 * privacy guarantee structural rather than incidental: CREATOR_PRECISION still accepts
 * `postal_code` (dropping it would mean a creator who enters only a ZIP never
 * verifies), and a full postal-code centroid — UK/NL/CA-shaped codes in particular —
 * can itself be street-level. Rounding is true whatever match type Google actually
 * returns, rather than true only while Google's type taxonomy behaves as expected.
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

  // Reference equality against the exported constant, not a value/shape check — the
  // two precision arrays' CONTENTS could coincidentally overlap in the future, but
  // callers always pass one of these two exported constants directly (see index.ts),
  // so identity is the correct and simplest test.
  const isCreator = acceptedTypes === CREATOR_PRECISION;

  return {
    lat: isCreator ? round2(loc.lat) : loc.lat,
    lng: isCreator ? round2(loc.lng) : loc.lng,
    verifiedAt: new Date().toISOString(),
  };
}
