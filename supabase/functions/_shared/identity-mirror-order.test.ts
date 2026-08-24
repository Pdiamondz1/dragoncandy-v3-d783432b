import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * The identity mirror matches rows BY `stripe_account_id`, so it must run AFTER anything
 * that assigns that column — otherwise the write cannot match the row it is meant to heal.
 *
 * The case that matters is the restaurant fallback: when `org_unit_id` is supplied and that
 * row carries no Stripe account yet, `check-restaurant-payout-status` copies the account id
 * from `business_profiles` onto the org unit. Mirroring before that copy meant the very
 * request that linked a location healed its account id and NOT its identity columns, and
 * readiness stayed stale until some later request happened to run. Raised by the Codex
 * second review, confirmed against the file, and fixed by moving the call.
 *
 * Asserted on SOURCE ORDER because the failure is an ordering property of one request
 * against a live database — there is no unit-level seam that can express it, and a mock
 * would only re-encode whichever order the test author assumed.
 */
describe('identity mirror ordering', () => {
  const restaurant = readFileSync(
    'supabase/functions/check-restaurant-payout-status/index.ts',
    'utf8',
  );

  it('mirrors only after the org_units fallback sync assigns stripe_account_id', () => {
    const syncIdx = restaurant.indexOf('stripe_account_id: stripeAccountId');
    const mirrorIdx = restaurant.indexOf('await mirrorIdentitySignals(');

    // Both anchors must exist, or this test passes by finding nothing — the failure mode
    // that makes a guard worse than no guard.
    expect(syncIdx, 'fallback sync assignment not found').toBeGreaterThan(-1);
    expect(mirrorIdx, 'mirror call not found').toBeGreaterThan(-1);

    expect(mirrorIdx).toBeGreaterThan(syncIdx);
  });

  it('mirrors before the pending-balance flush, which reads the flag it writes', () => {
    const mirrorIdx = restaurant.indexOf('await mirrorIdentitySignals(');
    const flushIdx = restaurant.indexOf('await flushPendingBalance(');
    expect(flushIdx, 'flush call not found').toBeGreaterThan(-1);
    expect(mirrorIdx).toBeLessThan(flushIdx);
  });

  /**
   * The creator function has no fallback path — no second table to link — so its mirror sits
   * early. Pinned so the two files are not "made consistent" by moving the wrong one.
   */
  it('the creator function mirrors before its own write-back, having no fallback to wait for', () => {
    const creator = readFileSync(
      'supabase/functions/check-creator-payout-status/index.ts',
      'utf8',
    );
    const mirrorIdx = creator.indexOf('await mirrorIdentitySignals(');
    const writeBackIdx = creator.indexOf('Update database if onboarding status changed');
    expect(mirrorIdx).toBeGreaterThan(-1);
    expect(writeBackIdx).toBeGreaterThan(-1);
    expect(mirrorIdx).toBeLessThan(writeBackIdx);
  });
});
