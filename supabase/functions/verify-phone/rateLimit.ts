/**
 * Pure allowlist logic and throttle CONSTANTS for phone verification.
 *
 * Kept dependency-free and separate from index.ts so it runs under Vitest in CI — the
 * edge function itself cannot, because of its Deno-only imports.
 *
 * The throttle DECISION does not live here. It used to (`exceedsSendLimit` /
 * `withinCooldown`, both deleted), and that was the bug: an application-code decision
 * over a prior read is a check-then-act race, so it moved into the
 * `reserve_phone_verification_send` RPC (migration 20260824160000) where the count and
 * the reserving INSERT happen atomically under one advisory lock. index.ts imports only
 * the three constants below — which it passes to the RPC as parameters — plus
 * `isAllowedCountry`. Do not re-add a TypeScript throttle helper here: a second decision
 * site is a second answer.
 */

export const SEND_LIMIT_PER_WINDOW = 3;
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const COOLDOWN_MS = 60 * 1000;

/** Country calling codes. */
const COUNTRY_PREFIXES: Record<string, string[]> = {
  US: ['+1'],
  GB: ['+44'],
  CA: ['+1'],
};

/**
 * NANP (+1) area codes that are NOT the US or Canada — Caribbean nations and
 * territories that share the +1 country code but are billed as international or
 * premium by most carriers. This is the dominant SMS-pumping target class the
 * `phone_verification_attempts` migration's own header comment names, and a bare
 * '+1' prefix match (what this file used to do) does not distinguish them from a
 * real US/CA number — the area code (the 3 digits immediately after +1) does.
 * List per Twilio's own published NANP high-risk range guidance.
 */
const NANP_NON_US_CA_AREA_CODES = new Set([
  '242', // Bahamas
  '246', // Barbados
  '264', // Anguilla
  '268', // Antigua and Barbuda
  '284', // British Virgin Islands
  '345', // Cayman Islands
  '441', // Bermuda
  '473', // Grenada
  '649', // Turks and Caicos
  '658', // Jamaica (overlay)
  '664', // Montserrat
  '721', // Sint Maarten
  '758', // Saint Lucia
  '767', // Dominica
  '784', // Saint Vincent and the Grenadines
  '809', '829', '849', // Dominican Republic
  '868', // Trinidad and Tobago
  '869', // Saint Kitts and Nevis
  '876', // Jamaica
]);

export function isAllowedCountry(phone: string, allowed: readonly string[]): boolean {
  // Strict E.164: a leading +, a non-zero first digit, 7-15 digits total.
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return false;
  return allowed.some((code) =>
    (COUNTRY_PREFIXES[code] ?? []).some((prefix) => {
      if (!phone.startsWith(prefix)) return false;
      // +1 alone is not sufficient for a US/CA match — reject the NANP overlays.
      if (prefix === '+1' && NANP_NON_US_CA_AREA_CODES.has(phone.slice(2, 5))) return false;
      return true;
    }),
  );
}
