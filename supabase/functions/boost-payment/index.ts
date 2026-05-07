// supabase/functions/boost-payment/index.ts

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { calculateDragonShareFee } from "../_shared/dragonshare-fee.ts";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: unknown) => {
  console.log(`[BOOST-PAYMENT] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    // Auth: verify the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error(`Auth failed: ${userError?.message}`);
    const userId = userData.user.id;

    const { post_id, amount_cents, tier_label } = await req.json();
    if (!post_id || !amount_cents || !tier_label) throw new Error("Missing required fields");
    if (typeof amount_cents !== 'number' || amount_cents < 500 || amount_cents > 50000) {
      throw new Error("Boost amount must be between $5 and $500");
    }

    logStep("Boost requested", { post_id, amount_cents, tier_label, userId });

    // Fetch the post to get creator_id
    const { data: post, error: postError } = await supabase
      .from("dragonshare_posts")
      .select("id, creator_id, target_org_id, status, boost_status")
      .eq("id", post_id)
      .single();
    if (postError || !post) throw new Error(`Post not found: ${postError?.message}`);

    // Determine the boosting org from user's membership on the target org
    const { data: membership, error: memError } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .eq("org_id", post.target_org_id)
      .eq("invitation_status", "active")
      .single();
    if (memError || !membership) throw new Error("Not a member of the target organization");
    if (!['owner', 'admin'].includes(membership.role)) throw new Error("Only owners and admins can boost");

    // Call create_boost security definer
    const { data: boostId, error: boostError } = await supabase.rpc("create_boost", {
      p_post_id: post_id,
      p_boosting_org_id: membership.org_id,
      p_amount_cents: amount_cents,
      p_tier: tier_label,
    });
    if (boostError) throw new Error(`create_boost failed: ${boostError.message}`);

    logStep("Boost row created", { boostId });

    // Check if creator has Stripe Connect
    const { data: creatorProfile, error: creatorError } = await supabase
      .from("creator_profiles")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("user_id", post.creator_id)
      .single();

    if (creatorError || !creatorProfile?.stripe_account_id || !creatorProfile?.stripe_onboarding_complete) {
      logStep("Creator payout not ready — parking boost", { creatorId: post.creator_id });
      return new Response(JSON.stringify({
        error: "CREATOR_PAYOUT_NOT_READY",
        boost_id: boostId,
        message: "Creator hasn't finished payout setup. Boost is queued.",
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 202,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const { platformFeeCents, creatorPayoutCents } = calculateDragonShareFee(amount_cents);

    // Fetch org's Stripe customer for charging
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", membership.org_id)
      .single();

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: "usd",
      customer: org?.stripe_customer_id ?? undefined,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        type: "dragonshare_boost",
        boost_id: boostId,
        post_id: post_id,
        boosting_org_id: membership.org_id,
        creator_id: post.creator_id,
      },
    }, { idempotencyKey: `boost_pi_${boostId}` });

    logStep("PaymentIntent created", { piId: paymentIntent.id, status: paymentIntent.status });

    if (paymentIntent.status !== "succeeded") {
      await supabase
        .from("dragonshare_boosts")
        .update({ status: "failed", stripe_payment_intent_id: paymentIntent.id })
        .eq("id", boostId);
      throw new Error(`Payment not succeeded: ${paymentIntent.status}`);
    }

    // Transfer to creator
    const transfer = await stripe.transfers.create({
      amount: creatorPayoutCents,
      currency: "usd",
      destination: creatorProfile.stripe_account_id,
      metadata: {
        type: "dragonshare_boost",
        boost_id: boostId,
        post_id: post_id,
      },
    }, { idempotencyKey: `boost_tr_${boostId}` });

    logStep("Transfer created", { transferId: transfer.id, amount: creatorPayoutCents });

    // Update boost row
    await supabase
      .from("dragonshare_boosts")
      .update({
        status: "transferred",
        stripe_payment_intent_id: paymentIntent.id,
        stripe_transfer_id: transfer.id,
        captured_at: new Date().toISOString(),
        transferred_at: new Date().toISOString(),
      })
      .eq("id", boostId);

    // Insert payout record
    await supabase
      .from("dragonshare_payouts")
      .insert({
        boost_id: boostId,
        creator_id: post.creator_id,
        amount_cents: creatorPayoutCents,
        stripe_transfer_id: transfer.id,
        status: "succeeded",
        processed_at: new Date().toISOString(),
      });

    // Update post status
    await supabase
      .from("dragonshare_posts")
      .update({ boost_status: "boosted" })
      .eq("id", post_id);

    logStep("Boost complete", { boostId, piId: paymentIntent.id, transferId: transfer.id });

    return new Response(JSON.stringify({
      success: true,
      boost_id: boostId,
      transfer_id: transfer.id,
      creator_payout_cents: creatorPayoutCents,
    }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 500,
    });
  }
});
