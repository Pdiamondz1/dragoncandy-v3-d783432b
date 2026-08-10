// Type-only import — erased at runtime, so this file stays vitest-importable.
import type Stripe from "https://esm.sh/stripe@18.5.0";

export interface TestAccountOptions {
  email: string;
  businessName?: string;
  productDescription: string;
  metadata: Record<string, string>;
  requestIp: string;
  nowUnix: number;
}

/**
 * Pure builder for a fully-prefilled Custom connected account that becomes
 * charges_enabled + payouts_enabled in TEST MODE without hosted onboarding.
 * Uses Stripe's published test verification triggers.
 */
export function buildTestAccountParams(o: TestAccountOptions): Stripe.AccountCreateParams {
  return {
    type: 'custom',
    country: 'US',
    email: o.email,
    business_type: 'individual',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: o.businessName || undefined,
      product_description: o.productDescription,
      mcc: '5734',
      url: 'https://dragoncandy.com',
    },
    individual: {
      first_name: 'Test',
      last_name: 'Account',
      email: o.email,
      phone: '+15555550100',
      dob: { day: 1, month: 1, year: 1901 },
      address: {
        line1: 'address_full_match',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94103',
        country: 'US',
      },
      ssn_last_4: '0000',
      id_number: '000000000',
    },
    external_account: 'btok_us',
    tos_acceptance: { date: o.nowUnix, ip: o.requestIp },
    metadata: o.metadata,
  };
}

/**
 * Creates the enabled test-mode Custom account. Caller passes a Stripe client
 * (already constructed with the sk_test_ key) so this module needs no runtime
 * Stripe import.
 */
export async function createTestModeEnabledAccount(
  stripe: Stripe,
  opts: Omit<TestAccountOptions, 'nowUnix'>,
): Promise<Stripe.Account> {
  return stripe.accounts.create(
    buildTestAccountParams({ ...opts, nowUnix: Math.floor(Date.now() / 1000) }),
  );
}
