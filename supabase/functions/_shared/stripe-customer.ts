// supabase/functions/_shared/stripe-customer.ts
import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Returns the single canonical Stripe customer id for an org, creating and
 * persisting it on first use. organizations.stripe_customer_id is authoritative.
 */
export async function getOrCreateOrgCustomer(
  stripe: Stripe,
  supabase: SupabaseClient,
  orgId: string,
  email: string | undefined,
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
  }

  await supabase
    .from("organizations")
    .update({ stripe_customer_id: customerId })
    .eq("id", orgId);

  return customerId;
}
