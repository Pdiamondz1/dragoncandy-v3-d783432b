// Pure, dependency-free provider resolution. No Deno/Node/Supabase/I/O — it
// only maps raw `provider` values (from the DB column or a request) onto a
// known ProviderId. Imported by both the Deno edge function (the social-proxy
// gateway) and the co-located Vitest unit test, so it must reference no runtime.
//
// Back-compat rule: legacy/unset/unknown values fall back to 'outstand'. Every
// existing connection predates the column, so a null/blank/unrecognized value
// means "the original Outstand integration".

import type { ProviderId } from '../_shared/social-contract.ts';

export const KNOWN_PROVIDERS: readonly ProviderId[] = ['outstand', 'zernio'];

const DEFAULT_PROVIDER: ProviderId = 'outstand';

/**
 * Resolve a raw provider value to a known ProviderId. Returns the value when it
 * is a recognized provider, otherwise the 'outstand' fallback (null, undefined,
 * blank, and unknown strings all resolve to 'outstand').
 */
export function resolveProviderId(value: string | null | undefined): ProviderId {
  return KNOWN_PROVIDERS.includes(value as ProviderId)
    ? (value as ProviderId)
    : DEFAULT_PROVIDER;
}

/**
 * Resolve the single provider shared by a set of owned-account rows. Returns
 * that provider only when every row resolves to the same one; empty input or a
 * mix of distinct providers falls back to 'outstand'.
 */
export function resolveProviderFromRows(
  rows: Array<{ provider?: string | null }>,
): ProviderId {
  const distinct = new Set(rows.map((r) => resolveProviderId(r.provider)));
  return distinct.size === 1 ? [...distinct][0] : DEFAULT_PROVIDER;
}
