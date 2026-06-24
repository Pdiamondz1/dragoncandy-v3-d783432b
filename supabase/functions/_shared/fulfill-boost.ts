// supabase/functions/_shared/fulfill-boost.ts
import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { calculateDragonShareFee } from "./dragonshare-fee.ts";
import { verifyPayoutReady } from "./payout-ready.ts";

interface FulfillBoostParams {
  boostId: string;
  postId: string;
  creatorId: string;
  amountCents: number;
  paymentIntentId: string;
}

/**
 * Transfers the creator's share, records the payout, marks the boost
 * transferred and the post boosted, and fires the social hook.
 * Idempotent: no-ops if the boost is already transferred.
 */
export async function fulfillBoost(
  stripe: Stripe,
  supabase: SupabaseClient,
  { boostId, postId, creatorId, amountCents, paymentIntentId }: FulfillBoostParams,
): Promise<{ alreadyDone: boolean; transferId?: string }> {
  const { data: boostRow } = await supabase
    .from("dragonshare_boosts")
    .select("status")
    .eq("id", boostId)
    .single();
  if (boostRow?.status === "transferred") return { alreadyDone: true };
  // Never pay out a boost that's already in a terminal non-paid state (refunded/declined/failed).
  if (boostRow?.status === "refunded" || boostRow?.status === "failed") {
    throw new Error(`Cannot fulfill boost ${boostId} in terminal status: ${boostRow.status}`);
  }

  const { data: creatorProfile, error: creatorError } = await supabase
    .from("creator_profiles")
    .select("stripe_account_id, stripe_onboarding_complete")
    .eq("user_id", creatorId)
    .single();
  if (creatorError || !creatorProfile?.stripe_account_id) {
    throw new Error("Creator payout account not ready at fulfillment");
  }
  // "Trust true, verify false": the cached flag can be stale-false (account.updated
  // webhook not delivering), which would wrongly block a real payout — re-check Stripe.
  const { ready: creatorReady, corrected: creatorFlagWasStale } = await verifyPayoutReady(
    stripe, creatorProfile.stripe_account_id, creatorProfile.stripe_onboarding_complete,
  );
  if (!creatorReady) {
    throw new Error("Creator payout account not ready at fulfillment");
  }
  if (creatorFlagWasStale) {
    await supabase.from("creator_profiles")
      .update({ stripe_onboarding_complete: true })
      .eq("user_id", creatorId);
  }

  const { creatorPayoutCents } = calculateDragonShareFee(amountCents);

  const transfer = await stripe.transfers.create({
    amount: creatorPayoutCents,
    currency: "usd",
    destination: creatorProfile.stripe_account_id,
    metadata: { type: "dragonshare_boost", boost_id: boostId, post_id: postId },
  }, { idempotencyKey: `boost_tr_${boostId}` });

  await supabase
    .from("dragonshare_boosts")
    .update({
      status: "transferred",
      stripe_payment_intent_id: paymentIntentId,
      stripe_transfer_id: transfer.id,
      captured_at: new Date().toISOString(),
      transferred_at: new Date().toISOString(),
    })
    .eq("id", boostId);

  const { error: payoutError } = await supabase
    .from("dragonshare_payouts")
    .insert({
      boost_id: boostId,
      creator_id: creatorId,
      amount_cents: creatorPayoutCents,
      stripe_transfer_id: transfer.id,
      status: "succeeded",
      processed_at: new Date().toISOString(),
    });
  // With the UNIQUE(boost_id) constraint, a concurrent fulfillment that raced past the
  // status check above lands here with a unique violation — benign (payout already recorded;
  // the Stripe transfer is idempotent via boost_tr_${boostId}). Surface any other error.
  if (payoutError && payoutError.code !== "23505") {
    throw payoutError;
  }

  await supabase
    .from("dragonshare_posts")
    .update({ boost_status: "boosted" })
    .eq("id", postId);

  // Social hook (fire-and-forget)
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fire-dragonshare-social-hook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ boost_id: boostId, post_id: postId }),
    });
  } catch (e) {
    console.warn("[fulfill-boost] social hook failed (non-blocking):", e);
  }

  // DragonShare notifications (fire-and-forget)
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dragonshare-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ event: "boost_paid", boost_id: boostId, post_id: postId, creator_id: creatorId, creator_payout_cents: creatorPayoutCents }),
    });
  } catch (e) {
    console.warn("[fulfill-boost] dragonshare-notify failed (non-blocking):", e);
  }

  return { alreadyDone: false, transferId: transfer.id };
}
