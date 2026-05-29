// src/components/dragonshare/boostOutcome.test.ts
import { describe, it, expect } from 'vitest';
import { resolveBoostOutcome } from './boostOutcome';

describe('resolveBoostOutcome', () => {
  it('returns checkout when a checkout_url is present', () => {
    expect(resolveBoostOutcome({ checkout_url: 'https://stripe/cs_test_1' }))
      .toEqual({ kind: 'checkout', url: 'https://stripe/cs_test_1' });
  });

  it('returns queued when creator payout is not ready', () => {
    expect(resolveBoostOutcome({ error: 'CREATOR_PAYOUT_NOT_READY', boost_id: 'b1' }))
      .toEqual({ kind: 'queued' });
  });

  it('returns queued when the queued flag is set', () => {
    expect(resolveBoostOutcome({ queued: true, boost_id: 'b1' }))
      .toEqual({ kind: 'queued' });
  });

  it('returns success when the off-session charge settled', () => {
    expect(resolveBoostOutcome({ success: true, boost_id: 'b1', creator_payout_cents: 800 }))
      .toEqual({ kind: 'success', creatorPayoutCents: 800 });
  });

  it('falls back to success with undefined payout for empty/unknown data', () => {
    expect(resolveBoostOutcome({})).toEqual({ kind: 'success', creatorPayoutCents: undefined });
  });
});
