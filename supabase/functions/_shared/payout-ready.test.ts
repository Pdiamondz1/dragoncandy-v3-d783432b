import { describe, it, expect } from 'vitest';
import { verifyPayoutReady } from './payout-ready';

// Minimal Stripe stub — only accounts.retrieve is used.
const stripeWith = (charges: boolean, payouts: boolean) =>
  ({ accounts: { retrieve: async () => ({ charges_enabled: charges, payouts_enabled: payouts }) } }) as any;
const stripeThatThrows = () =>
  ({ accounts: { retrieve: async () => { throw new Error('boom'); } } }) as any;

describe('verifyPayoutReady', () => {
  it('no account → not ready, not corrected', async () => {
    expect(await verifyPayoutReady(stripeWith(true, true), null, false)).toEqual({ ready: false, corrected: false });
    expect(await verifyPayoutReady(stripeWith(true, true), undefined, true)).toEqual({ ready: false, corrected: false });
  });

  it('cached true → trusts without hitting Stripe', async () => {
    const stripe = { accounts: { retrieve: async () => { throw new Error('should not be called'); } } } as any;
    expect(await verifyPayoutReady(stripe, 'acct_1', true)).toEqual({ ready: true, corrected: false });
  });

  it('cached false but Stripe enabled → ready AND corrected (stale flag)', async () => {
    expect(await verifyPayoutReady(stripeWith(true, true), 'acct_1', false)).toEqual({ ready: true, corrected: true });
    expect(await verifyPayoutReady(stripeWith(true, true), 'acct_1', null)).toEqual({ ready: true, corrected: true });
  });

  it('cached false and Stripe not fully enabled → not ready', async () => {
    expect(await verifyPayoutReady(stripeWith(false, true), 'acct_1', false)).toEqual({ ready: false, corrected: false });
    expect(await verifyPayoutReady(stripeWith(true, false), 'acct_1', false)).toEqual({ ready: false, corrected: false });
  });

  it('Stripe retrieve throws → not ready (safe default)', async () => {
    expect(await verifyPayoutReady(stripeThatThrows(), 'acct_1', false)).toEqual({ ready: false, corrected: false });
  });
});
