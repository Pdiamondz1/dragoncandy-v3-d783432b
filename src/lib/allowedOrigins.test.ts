import { describe, it, expect } from 'vitest';
import { ALLOWED_REDIRECT_ORIGINS, APP_ORIGINS, CANONICAL_APP_ORIGIN } from './allowedOrigins';

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

describe('CANONICAL_APP_ORIGIN', () => {
  it('is the .com apex', () => {
    expect(CANONICAL_APP_ORIGIN).toBe('https://dragoncandy.com');
  });

  it('is an origin we accept back — a link we mint must be one we allow', () => {
    // These two survive every phase of the .io -> .com migration, where a bare
    // literal assertion would only catch an APP_ORIGINS reorder.
    expect((APP_ORIGINS as readonly string[]).includes(CANONICAL_APP_ORIGIN)).toBe(true);
    expect(ALLOWED_REDIRECT_ORIGINS.has(CANONICAL_APP_ORIGIN)).toBe(true);
  });
});
