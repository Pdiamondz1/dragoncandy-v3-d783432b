import { describe, it, expect } from 'vitest';
import { resolveConnectReturnUrls, ALLOWED_RETURN_PATHS } from './connect-return.ts';

const ORIGIN = 'https://dragoncandy.com';
const DEFAULT = '/dashboard/creator/settings';

describe('resolveConnectReturnUrls', () => {
  it('returns the caller to the onboarding wizard when it asks — the reported bug', () => {
    const r = resolveConnectReturnUrls(ORIGIN, '/profile/setup', DEFAULT);
    expect(r.returnUrl).toBe('https://dragoncandy.com/profile/setup?stripe_onboarding=complete');
    expect(r.usedFallback).toBe(false);
  });

  it('keeps the old destination when nothing is requested', () => {
    const r = resolveConnectReturnUrls(ORIGIN, undefined, DEFAULT);
    expect(r.returnUrl).toBe('https://dragoncandy.com/dashboard/creator/settings?stripe_onboarding=complete');
    expect(r.usedFallback).toBe(true);
    expect(r.rejected).toBeUndefined(); // absent is not a rejection
  });

  /**
   * The query flags ride along on BOTH branches. Fixing the destination while dropping
   * `stripe_onboarding=complete` would fix where the user lands and break what happens
   * when they get there.
   */
  it('preserves the stripe flags on the new path too', () => {
    const r = resolveConnectReturnUrls(ORIGIN, '/profile/setup', DEFAULT);
    expect(r.returnUrl).toContain('stripe_onboarding=complete');
    expect(r.refreshUrl).toBe('https://dragoncandy.com/profile/setup?stripe_refresh=true');
  });

  /**
   * The security property. Every one of these must land back on our own origin, on the
   * fallback path — and be REPORTED as rejected, so a caller passing junk is visible
   * rather than silently downgraded.
   */
  it.each([
    'https://evil.com/steal',
    '//evil.com',
    '/profile/setup/../../evil',
    '/dashboard/creator/settings/../../../evil',
    'javascript:alert(1)',
    '/profile/setupX',
    '',
  ])('refuses %s and falls back, reporting it', (bad) => {
    const r = resolveConnectReturnUrls(ORIGIN, bad, DEFAULT);
    expect(r.returnUrl.startsWith('https://dragoncandy.com/dashboard/creator/settings')).toBe(true);
    expect(r.usedFallback).toBe(true);
    if (bad !== '') expect(r.rejected).toBe(bad);
  });

  it('ignores a non-string entirely rather than coercing it', () => {
    for (const junk of [42, null, {}, ['/profile/setup']]) {
      expect(resolveConnectReturnUrls(ORIGIN, junk, DEFAULT).usedFallback).toBe(true);
    }
  });

  it('does not double a slash when the origin carries a trailing one', () => {
    const r = resolveConnectReturnUrls('https://dragoncandy.com/', '/profile/setup', DEFAULT);
    expect(r.returnUrl).toBe('https://dragoncandy.com/profile/setup?stripe_onboarding=complete');
  });

  /**
   * The allow-list is the SET bound. Pinned so that widening it is a deliberate edit with a
   * test change attached, not something that drifts in with a feature.
   */
  it('allows exactly three paths', () => {
    expect([...ALLOWED_RETURN_PATHS].sort()).toEqual([
      '/dashboard/business/settings',
      '/dashboard/creator/settings',
      '/profile/setup',
    ]);
  });
});
