import { describe, it, expect } from 'vitest';
import { isInternalHost, isAllowedOnInternalHost } from './internalHost';

describe('isInternalHost', () => {
  it('matches the production internal subdomain on both TLDs', () => {
    expect(isInternalHost('internal.dragoncandy.com')).toBe(true);
    expect(isInternalHost('internal.dragoncandy.io')).toBe(true);
  });

  it('matches internal.* dev hosts', () => {
    expect(isInternalHost('internal.localhost')).toBe(true);
  });

  it('rejects the main domain and www on both TLDs', () => {
    expect(isInternalHost('dragoncandy.com')).toBe(false);
    expect(isInternalHost('www.dragoncandy.com')).toBe(false);
    expect(isInternalHost('dragoncandy.io')).toBe(false);
    expect(isInternalHost('www.dragoncandy.io')).toBe(false);
  });

  it('rejects localhost and the Lovable preview', () => {
    expect(isInternalHost('localhost')).toBe(false);
    expect(isInternalHost('127.0.0.1')).toBe(false);
    expect(isInternalHost('dragoncandy-preview.lovable.app')).toBe(false);
  });

  it('rejects hosts that merely contain "internal"', () => {
    expect(isInternalHost('notinternal.dragoncandy.com')).toBe(false);
    expect(isInternalHost('notinternal.dragoncandy.io')).toBe(false);
  });
});

describe('isAllowedOnInternalHost', () => {
  it('allows /internal and its subpaths', () => {
    expect(isAllowedOnInternalHost('/internal')).toBe(true);
    expect(isAllowedOnInternalHost('/internal/weight')).toBe(true);
  });

  it('allows the auth flow (login, forgot, update-password)', () => {
    expect(isAllowedOnInternalHost('/auth')).toBe(true);
    expect(isAllowedOnInternalHost('/auth/forgot')).toBe(true);
    expect(isAllowedOnInternalHost('/auth/update-password')).toBe(true);
  });

  it('allows /verify-email so email links work on the internal host', () => {
    expect(isAllowedOnInternalHost('/verify-email')).toBe(true);
  });

  it('blocks consumer routes', () => {
    expect(isAllowedOnInternalHost('/')).toBe(false);
    expect(isAllowedOnInternalHost('/dashboard/creator')).toBe(false);
    expect(isAllowedOnInternalHost('/pricing')).toBe(false);
  });

  it('does not treat lookalike prefixes as allowed', () => {
    expect(isAllowedOnInternalHost('/authors')).toBe(false);
    expect(isAllowedOnInternalHost('/internalize')).toBe(false);
  });
});
