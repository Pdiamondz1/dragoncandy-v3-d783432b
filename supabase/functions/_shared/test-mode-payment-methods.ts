import { isTestKey } from "./stripe-mode.ts";

/**
 * In test mode, restrict Checkout to card only — removes Link/Klarna/bank
 * options that don't work in the sandbox and confuse users. In live mode,
 * returns undefined so Stripe's dashboard-configured automatic payment
 * methods are used exactly as before.
 */
export function testModePaymentMethodTypes(stripeKey: string): ['card'] | undefined {
  return isTestKey(stripeKey) ? ['card'] : undefined;
}
