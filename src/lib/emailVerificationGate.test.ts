import { describe, it, expect } from 'vitest';
import { deriveEmailGate } from './emailVerificationGate';

const CONFIRMED = { email_confirmed_at: '2026-08-11T19:03:57Z' };

describe('deriveEmailGate', () => {
  it('never judges before auth has settled', () => {
    for (const input of [
      { loading: true,  isAuthenticated: true,  profile: { email_verified: false }, user: CONFIRMED },
      { loading: false, isAuthenticated: false, profile: null, user: null },
    ]) {
      const g = deriveEmailGate(input);
      expect(g.settled).toBe(false);
      expect(g.emailNotVerified).toBe(false);   // must not bounce mid-resolution
      expect(g.isInternalOnly).toBe(false);
    }
  });

  it('lets a verified account through', () => {
    expect(deriveEmailGate({ loading: false, isAuthenticated: true, profile: { email_verified: true }, user: CONFIRMED })
      .emailNotVerified).toBe(false);
  });

  /**
   * The case that matters, and the reason the fallback is a `??` and not an `||`.
   * GoTrue's own confirmation is DISABLED here, so `email_confirmed_at` is set for 45 of 46
   * accounts — including the one account whose stored `email_verified` is `false`. An `||`
   * would read the auth timestamp and wave it through; `??` only falls back when the app
   * flag is ABSENT, so a real stored `false` still blocks.
   */
  it('blocks a stored false even though GoTrue says confirmed', () => {
    expect(deriveEmailGate({ loading: false, isAuthenticated: true, profile: { email_verified: false }, user: CONFIRMED })
      .emailNotVerified).toBe(true);
  });

  /**
   * `AuthContext` fabricates a profile from user metadata when the row is missing, and that
   * object carries no `email_verified`. Reading the fabricated `undefined` as "unverified"
   * would lock the user out of the one page that can provision them — the exact loop
   * `VerifiedRoute` was fixed for once already.
   */
  it('does not punish a fabricated profile that carries no flag', () => {
    expect(deriveEmailGate({ loading: false, isAuthenticated: true, profile: {}, user: CONFIRMED })
      .emailNotVerified).toBe(false);
  });

  it('treats a null profile with no auth confirmation as unverified', () => {
    expect(deriveEmailGate({ loading: false, isAuthenticated: true, profile: null, user: {} })
      .emailNotVerified).toBe(true);
  });

  it('recognises an internal-only account, which has no consumer profile by design', () => {
    const g = deriveEmailGate({
      loading: false, isAuthenticated: true, profile: null,
      user: { ...CONFIRMED, user_metadata: { account_scope: 'internal' } },
    });
    expect(g.isInternalOnly).toBe(true);
  });

  it('does not call a consumer account internal just because its profile is missing', () => {
    expect(deriveEmailGate({ loading: false, isAuthenticated: true, profile: null, user: CONFIRMED })
      .isInternalOnly).toBe(false);
  });
});
