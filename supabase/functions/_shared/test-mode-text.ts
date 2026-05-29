// supabase/functions/_shared/test-mode-text.ts
import Stripe from "https://esm.sh/stripe@18.5.0";

export function isTestKey(stripeKey: string): boolean {
  return stripeKey.startsWith("sk_test_");
}

const TEST_MODE_MESSAGE =
  "Test mode — pay with card 4242 4242 4242 4242 (any future expiry, any CVC). " +
  "Your linked test bank accounts are payout accounts and won't appear here.";

/**
 * custom_text block for a Checkout Session, only in test mode; otherwise undefined.
 */
export function testModeCustomText(
  stripeKey: string,
): Stripe.Checkout.SessionCreateParams.CustomText | undefined {
  return isTestKey(stripeKey)
    ? { submit: { message: TEST_MODE_MESSAGE } }
    : undefined;
}
