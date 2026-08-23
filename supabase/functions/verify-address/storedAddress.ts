/**
 * Pure planning logic for `verify-address`: given the address row as it is ACTUALLY
 * STORED, decide (a) what text to geocode and (b) the exact column/value predicate the
 * final write must be conditioned on.
 *
 * This exists as a separate, dependency-free module for two reasons. First, it runs
 * under Vitest in CI — index.ts cannot, because of its Deno-only imports (the same split
 * rateLimit.ts uses in verify-phone). Second, and more important: it is the piece that
 * makes the compare-and-set a comparison of the ROW AGAINST ITSELF.
 *
 * Why that matters. The predicate values returned here are the stored values VERBATIM —
 * never trimmed, never coerced, never normalized. The geocode query text is built from
 * the same stored values (there, whitespace IS trimmed, because that is a search string
 * and not an equality). Two live silent-failure bugs came from mixing those up: the
 * write used to be conditioned on the CALLER's normalized copy of the address, and the
 * caller's copy and the stored row are produced by different code paths that normalize
 * differently —
 *
 *   1. OnboardingWizard.tsx upserts {city, country, timezone} with no `postal_code`, so
 *      an existing stored postal code ('07030') survives the write, and then the client
 *      asked to verify with postalCode: null. The old predicate took its
 *      `.is('postal_code', null)` branch, which does not match '07030' → zero rows → a
 *      silent, permanent failure to ever stamp that account.
 *   2. useCreatorProfileSubmit.ts / useOrgData.ts store city/country/address UNTRIMMED
 *      while the client helper sent them trimmed, so a stored 'Hoboken ' never matched a
 *      submitted 'Hoboken' → zero rows → the same silent permanent failure.
 *
 * Reading the row server-side removes the caller's normalization from the equality
 * entirely, so neither shape is expressible any more. It also strengthens the original
 * forgery fix rather than weakening it: the caller can no longer influence WHAT gets
 * geocoded at all, so a submitted-but-not-stored address cannot be geocoded in the first
 * place — closed structurally, upstream of any predicate.
 */

/** The creator address columns, as selected from `creator_profiles`. */
export interface StoredCreatorAddress {
  city: string | null;
  country: string | null;
  postal_code: string | null;
}

/** The business address column, as selected from `org_units`. */
export interface StoredBusinessAddress {
  address: string | null;
}

/**
 * One equality term of the compare-and-set predicate. `value: null` means the column is
 * stored NULL and must be matched with `.is(col, null)` — PostgREST's `.eq()` never
 * matches NULL (`NULL = x` is NULL, not true, in SQL), so the two cannot be collapsed.
 * Derived from what was actually read, so the null-vs-empty-string question is answered
 * by the row rather than guessed from an omitted request field.
 */
export interface ColumnMatch {
  column: string;
  value: string | null;
}

export type AddressPlan =
  | { ok: true; queryText: string; match: ColumnMatch[] }
  | { ok: false; reason: 'missing_row' | 'no_address' };

const isBlank = (value: string | null | undefined): boolean =>
  typeof value !== 'string' || value.trim() === '';

/**
 * Creator: geocoded to a city/postal centroid, so city + country are both required (a
 * lone postal code does not name a place unambiguously across countries). The postal
 * code participates in the query when present and ALWAYS participates in the predicate —
 * including when it is stored NULL, where it becomes `.is(col, null)`. Omitting it from
 * the predicate would widen the match back toward the unconditioned write this whole
 * mechanism removes.
 */
export function planCreatorVerification(
  row: StoredCreatorAddress | null | undefined,
): AddressPlan {
  if (!row) return { ok: false, reason: 'missing_row' };

  const city = row.city ?? null;
  const country = row.country ?? null;
  const postalCode = row.postal_code ?? null;

  if (isBlank(city) || isBlank(country)) return { ok: false, reason: 'no_address' };

  return {
    ok: true,
    queryText: [city, postalCode, country]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(', '),
    match: [
      { column: 'city', value: city },
      { column: 'country', value: country },
      { column: 'postal_code', value: postalCode },
    ],
  };
}

/** Business: one free-text address column, geocoded at street precision. */
export function planBusinessVerification(
  row: StoredBusinessAddress | null | undefined,
): AddressPlan {
  if (!row) return { ok: false, reason: 'missing_row' };

  const address = row.address ?? null;
  if (isBlank(address)) return { ok: false, reason: 'no_address' };

  return {
    ok: true,
    queryText: (address as string).trim(),
    match: [{ column: 'address', value: address }],
  };
}
