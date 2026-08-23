import { describe, it, expect } from 'vitest';
import { isAllowedCountry, exceedsSendLimit, SEND_LIMIT_PER_WINDOW } from './rateLimit';

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
});

describe('exceedsSendLimit', () => {
  it('allows a first send', () => {
    expect(exceedsSendLimit([])).toBe(false);
  });

  it('refuses the send after the limit is reached', () => {
    const now = Date.now();
    const recent = Array.from({ length: SEND_LIMIT_PER_WINDOW }, () => new Date(now - 60_000).toISOString());
    expect(exceedsSendLimit(recent)).toBe(true);
  });

  it('ignores attempts outside the window', () => {
    const old = Array.from({ length: SEND_LIMIT_PER_WINDOW }, () => new Date(Date.now() - 48 * 3600_000).toISOString());
    expect(exceedsSendLimit(old)).toBe(false);
  });
});
