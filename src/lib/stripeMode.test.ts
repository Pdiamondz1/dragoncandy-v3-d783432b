import { describe, it, expect, vi, afterEach } from 'vitest';

// The module reads import.meta.env at import time, so each case stubs the env
// and re-imports in isolation — making the fallback assertion deterministic
// regardless of any ambient VITE_STRIPE_PUBLISHABLE_KEY in the test process.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('stripeMode', () => {
  it('falls back to a pk_test_ key when VITE_STRIPE_PUBLISHABLE_KEY is unset', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', '');
    vi.resetModules();
    const m = await import('./stripeMode');
    expect(m.STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')).toBe(true);
    expect(m.isStripeTestMode).toBe(true);
  });

  it('uses an injected pk_live_ key → test mode is false', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_live_abc123');
    vi.resetModules();
    const m = await import('./stripeMode');
    expect(m.STRIPE_PUBLISHABLE_KEY).toBe('pk_live_abc123');
    expect(m.isStripeTestMode).toBe(false);
  });

  it('respects an injected pk_test_ key → test mode is true', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_injected');
    vi.resetModules();
    const m = await import('./stripeMode');
    expect(m.STRIPE_PUBLISHABLE_KEY).toBe('pk_test_injected');
    expect(m.isStripeTestMode).toBe(true);
  });
});
