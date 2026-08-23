import { describe, it, expect } from 'vitest';
import { isAllowedCountry } from './rateLimit';

describe('isAllowedCountry', () => {
  it('accepts a US number when the allowlist is US', () => {
    expect(isAllowedCountry('+12125550123', ['US'])).toBe(true);
  });

  it('rejects a high-fee international range not on the allowlist', () => {
    // The dominant SMS-pumping target class. Must be refused BEFORE any Twilio call.
    expect(isAllowedCountry('+8815550123', ['US'])).toBe(false);
  });

  it('rejects anything that is not E.164', () => {
    expect(isAllowedCountry('2125550123', ['US'])).toBe(false);
    expect(isAllowedCountry('+1 (212) 555-0123', ['US'])).toBe(false);
  });

  it('is data-driven, so opening a market is config not code', () => {
    expect(isAllowedCountry('+447700900123', ['US'])).toBe(false);
    expect(isAllowedCountry('+447700900123', ['US', 'GB'])).toBe(true);
  });

  it('rejects NANP Caribbean/premium overlays that share +1 with the US and Canada', () => {
    // Finding 2 (fix round 1): a bare '+1' prefix match does not distinguish these
    // from a real US/CA number — the North American Numbering Plan shares +1 across
    // ~20 non-US/CA participants, and these are the dominant SMS-pumping target class
    // the migration header comment itself names.
    expect(isAllowedCountry('+12425550123', ['US'])).toBe(false); // Bahamas
    expect(isAllowedCountry('+18095550123', ['US'])).toBe(false); // Dominican Republic
    expect(isAllowedCountry('+18765550123', ['US'])).toBe(false); // Jamaica
  });

  it('still accepts an ordinary US number after the NANP overlay exclusion', () => {
    expect(isAllowedCountry('+19175550123', ['US'])).toBe(true);
  });
});

// The send-limit and cooldown DECISIONS are no longer testable here, and that is
// deliberate: `exceedsSendLimit` / `withinCooldown` were deleted when the throttle moved
// into the `reserve_phone_verification_send` RPC (migration 20260824160000), which does
// the count and the reserving INSERT atomically. Their three tests went with them rather
// than being kept green against code nothing calls. The SQL decision has no unit test —
// it needs a database — and that gap is recorded in
// docs/wiki/concepts/identity-verification.md rather than papered over here.
