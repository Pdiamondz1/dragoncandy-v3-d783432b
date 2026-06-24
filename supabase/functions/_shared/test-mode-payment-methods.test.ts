import { describe, it, expect } from 'vitest';
import { testModePaymentMethodTypes } from './test-mode-payment-methods';

describe('testModePaymentMethodTypes', () => {
  it('returns ["card"] in test mode (suppresses Link/Klarna/etc.)', () => {
    expect(testModePaymentMethodTypes('sk_test_x')).toEqual(['card']);
  });
  it('returns undefined in live mode (Stripe automatic methods unchanged)', () => {
    expect(testModePaymentMethodTypes('sk_live_x')).toBeUndefined();
  });
});
