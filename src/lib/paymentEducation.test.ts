import { describe, it, expect } from 'vitest';
import { getPaymentMessage } from './paymentEducation';

describe('getPaymentMessage — payout_pending_wallet is ready-aware', () => {
  it('onboarded payout (reason=flushing_to_stripe) shows paid-to-Stripe copy, not a setup CTA', () => {
    const creator = getPaymentMessage('creator', 'payout_pending_wallet', { reason: 'flushing_to_stripe' });
    expect(creator?.title).toBe('You Got Paid!');
    expect(creator?.description).toMatch(/Stripe account/i);
    expect(creator?.action).toBeUndefined(); // no "Set Up Payouts" CTA for an onboarded creator

    const business = getPaymentMessage('business', 'payout_pending_wallet', { reason: 'flushing_to_stripe' });
    expect(business?.title).toBe('Payment Released');
  });

  it('not-onboarded payout falls through to the setup copy', () => {
    const creator = getPaymentMessage('creator', 'payout_pending_wallet', { reason: 'creator_onboarding_incomplete' });
    expect(creator?.description).toMatch(/complete your stripe setup/i);
    expect(creator?.action).toBe('Set Up Payouts');
  });

  it('historical payout_pending_wallet with no reason keeps the setup copy', () => {
    const creator = getPaymentMessage('creator', 'payout_pending_wallet');
    expect(creator?.action).toBe('Set Up Payouts');
  });

  it('unrelated events are unaffected by the metadata arg', () => {
    expect(getPaymentMessage('creator', 'escrow_held', { reason: 'flushing_to_stripe' })?.title).toBe('Payment Secured');
  });
});
