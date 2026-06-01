// supabase/functions/_shared/stripe-customer.ts
import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { isTestKey } from "./test-mode-text.ts";

/**
 * Attaches Stripe's shared test PaymentMethod (pm_card_visa) to a newly created
 * test-mode customer and makes it the default, so off-session flows (e.g. boost)
 * succeed without forcing testers through hosted checkout. Non-fatal: any failure
 * is logged and swallowed. Test-only — pm_card_visa is rejected by live mode.
 */
async function seedTestCard(stripe: Stripe, customerId: string): Promise<void> {
  try {
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });
  } catch (err) {
    console.warn(`[stripe-customer] seedTestCard failed for ${customerId}: ${String(err)}`);
  }
}

/**
 * Returns the single canonical Stripe customer id for an org, creating and
 * persisting it on first use. organizations.stripe_customer_id is authoritative.
 *
 * Pass stripeKey to auto-seed a test card on newly created test-mode customers.
 */
export async function getOrCreateOrgCustomer(
  stripe: Stripe,
  supabase: SupabaseClient,
  orgId: string,
  email: string | undefined,
  stripeKey?: string,
): Promise<string> {
  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .single();

  if (org?.stripe_customer_id) return org.stripe_customer_id;

  let customerId: string | undefined;
  if (email) {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) customerId = existing.data[0].id;
  }
  if (!customerId) {
    const created = await stripe.customers.create({ email, metadata: { org_id: orgId } });
    customerId = created.id;
    if (stripeKey && isTestKey(stripeKey)) {
      await seedTestCard(stripe, customerId);
    }
  }

  await supabase
    .from("organizations")
    .update({ stripe_customer_id: customerId })
    .eq("id", orgId);

  return customerId;
}
