import { describe, it, expect } from 'vitest';
import { STRIPE_PUBLISHABLE_KEY, isStripeTestMode } from './stripeMode';

describe('stripeMode', () => {
  it('resolves a publishable key (env or fallback)', () => {
    expect(typeof STRIPE_PUBLISHABLE_KEY).toBe('string');
    expect(STRIPE_PUBLISHABLE_KEY.length).toBeGreaterThan(0);
  });

  it('detects test mode when no VITE_STRIPE_PUBLISHABLE_KEY is injected (falls back to pk_test_)', () => {
    // In the test env the var is unset, so the fallback (a pk_test_ key) applies.
    expect(STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')).toBe(true);
    expect(isStripeTestMode).toBe(true);
  });
});
