/**
 * Pure throttling and allowlist logic for phone verification.
 *
 * Kept dependency-free and separate from index.ts so it runs under Vitest in CI — the
 * edge function itself cannot, because of its Deno-only imports.
 */

export const SEND_LIMIT_PER_WINDOW = 3;
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const COOLDOWN_MS = 60 * 1000;

/** Country calling codes, longest-prefix-first so +1 does not shadow +1242. */
const COUNTRY_PREFIXES: Record<string, string[]> = {
  US: ['+1'],
  GB: ['+44'],
  CA: ['+1'],
};

export function isAllowedCountry(phone: string, allowed: readonly string[]): boolean {
  // Strict E.164: a leading +, a non-zero first digit, 7-15 digits total.
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return false;
  return allowed.some((code) =>
    (COUNTRY_PREFIXES[code] ?? []).some((prefix) => phone.startsWith(prefix)),
  );
}

export function exceedsSendLimit(recentIsoTimestamps: readonly string[]): boolean {
  const cutoff = Date.now() - WINDOW_MS;
  const inWindow = recentIsoTimestamps.filter((t) => new Date(t).getTime() >= cutoff);
  return inWindow.length >= SEND_LIMIT_PER_WINDOW;
}

export function withinCooldown(lastIsoTimestamp: string | undefined): boolean {
  if (!lastIsoTimestamp) return false;
  return Date.now() - new Date(lastIsoTimestamp).getTime() < COOLDOWN_MS;
}
