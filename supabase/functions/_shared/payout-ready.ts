// Type-only import — erased at runtime, so this file stays vitest-importable.
import type Stripe from "https://esm.sh/stripe@18.5.0";

export interface PayoutReadyResult {
  ready: boolean;
  /**
   * true when the cached flag was false/null but Stripe reports the account
   * enabled — i.e. the cache is STALE and the caller should write
   * `stripe_onboarding_complete = true` back to its row.
   */
  corrected: boolean;
}

/**
 * "Trust true, verify false." `stripe_onboarding_complete` is a cache of Stripe's
 * `charges_enabled && payouts_enabled`. It can be STALE-false because the
 * `account.updated` webhook isn't delivering (the `stripe_webhook_events` table is
 * empty) and the flag only self-heals when the user loads their payments page. A
 * stale-false wrongly blocks money movement (parks boosts, holds payouts in the
 * wallet). So: trust a cached `true` (Stripe never spontaneously un-enables an
 * account), but re-verify a cached `false`/`null` against Stripe before letting it
 * block a payout. `corrected` tells the caller to refresh its cached flag.
 */
export async function verifyPayoutReady(
  stripe: Stripe,
  accountId: string | null | undefined,
  cachedComplete: boolean | null | undefined,
): Promise<PayoutReadyResult> {
  if (!accountId) return { ready: false, corrected: false };
  if (cachedComplete === true) return { ready: true, corrected: false };
  try {
    const acct = await stripe.accounts.retrieve(accountId);
    const ready = !!(acct.charges_enabled && acct.payouts_enabled);
    return { ready, corrected: ready };
  } catch {
    // Can't verify (network / invalid account) → treat as not ready (safe default).
    return { ready: false, corrected: false };
  }
}
