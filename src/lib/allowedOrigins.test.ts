import { describe, it, expect } from 'vitest';
import { ALLOWED_REDIRECT_ORIGINS } from './allowedOrigins';

describe('ALLOWED_REDIRECT_ORIGINS', () => {
  it('accepts both production TLDs, apex and www', () => {
    expect(ALLOWED_REDIRECT_ORIGINS.has('https://dragoncandy.com')).toBe(true);
    expect(ALLOWED_REDIRECT_ORIGINS.has('https://www.dragoncandy.com')).toBe(true);
    expect(ALLOWED_REDIRECT_ORIGINS.has('https://dragoncandy.io')).toBe(true);
    expect(ALLOWED_REDIRECT_ORIGINS.has('https://www.dragoncandy.io')).toBe(true);
  });

  it('excludes the internal AIOS host — it is not a returnTo target', () => {
    expect(ALLOWED_REDIRECT_ORIGINS.has('https://internal.dragoncandy.com')).toBe(false);
    expect(ALLOWED_REDIRECT_ORIGINS.has('https://internal.dragoncandy.io')).toBe(false);
  });

  it('rejects lookalikes and non-https schemes', () => {
    // This set gates where a session access_token is sent, so an exact match
    // is the whole point — a suffix or scheme slip would leak a credential.
    expect(ALLOWED_REDIRECT_ORIGINS.has('https://dragoncandy.com.evil.test')).toBe(false);
    expect(ALLOWED_REDIRECT_ORIGINS.has('https://notdragoncandy.com')).toBe(false);
    expect(ALLOWED_REDIRECT_ORIGINS.has('http://dragoncandy.com')).toBe(false);
    expect(ALLOWED_REDIRECT_ORIGINS.has('https://dragoncandy.com/')).toBe(false);
  });
});
