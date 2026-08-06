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

  let existingId: string | undefined;
  if (email) {
    const existing = await stripe.customers.list({ email, limit: 1 });
    existingId = existing.data[0]?.id;
  }

  const customerId =
    existingId ?? (await stripe.customers.create({ email, metadata: { org_id: orgId } })).id;

  // Not defensive noise — this is what the type error was pointing at. The
  // previous shape left `customerId` as `string | undefined` at the write, so a
  // missing id would have been PERSISTED as null into the authoritative
  // `organizations.stripe_customer_id` and returned to payment callers as a
  // customer id. Failing here is strictly better than writing a hole into the
  // column this function exists to be authoritative about.
  if (!customerId) {
    throw new Error(`Stripe returned no customer id for org ${orgId}`);
  }

  await supabase
    .from("organizations")
    .update({ stripe_customer_id: customerId })
    .eq("id", orgId);

  return customerId;
}
