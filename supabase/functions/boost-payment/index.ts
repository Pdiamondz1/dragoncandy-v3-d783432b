// supabase/functions/boost-payment/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { getOrCreateOrgCustomer } from "../_shared/stripe-customer.ts";
import { fulfillBoost } from "../_shared/fulfill-boost.ts";
import { testModeCustomText } from "../_shared/test-mode-text.ts";
import { testModePaymentMethodTypes } from "../_shared/test-mode-payment-methods.ts";
import { calculateDragonShareFee } from "../_shared/dragonshare-fee.ts";
import { verifyPayoutReady } from "../_shared/payout-ready.ts";

const logStep = (step: string, details?: unknown) => {
  console.log(`[BOOST-PAYMENT] ${step}${details ? " - " + JSON.stringify(details) : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status,
    });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error(`Auth failed: ${userError?.message}`);
    const userId = userData.user.id;
    const userEmail = userData.user.email;

    const { post_id, amount_cents, tier_label } = await req.json();
    if (!post_id || !amount_cents || !tier_label) throw new Error("Missing required fields");
    if (typeof amount_cents !== "number" || amount_cents < 500 || amount_cents > 50000) {
      throw new Error("Boost amount must be between $5 and $500");
    }

    logStep("Boost requested", { post_id, amount_cents, tier_label, userId });

    const { data: post, error: postError } = await supabase
      .from("dragonshare_posts")
      .select("id, creator_id, target_org_id, status, boost_status")
      .eq("id", post_id)
      .single();
    if (postError || !post) throw new Error(`Post not found: ${postError?.message}`);

    const { data: membership, error: memError } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .eq("org_id", post.target_org_id)
      .eq("invitation_status", "active")
      .single();
    if (memError || !membership) throw new Error("Not a member of the target organization");
    if (!["owner", "admin"].includes(membership.role)) throw new Error("Only owners and admins can boost");

    // User-scoped client: the SECURITY DEFINER create_boost RPC reads auth.uid()
    // for its membership check and boosting_user_id. The service-role client has
    // a null auth.uid(), which makes create_boost raise — so the RPC MUST be
    // called through a client carrying the caller's JWT.
    const authedClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customerId = await getOrCreateOrgCustomer(stripe, supabase, membership.org_id, userEmail);

    // Creator payout readiness — "trust true, verify false" so a STALE cached flag
    // (the account.updated webhook isn't delivering) doesn't wrongly park the boost.
    const { data: creatorProfile } = await supabase
      .from("creator_profiles")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("user_id", post.creator_id)
      .single();
    const { ready: creatorReady, corrected: creatorFlagWasStale } = await verifyPayoutReady(
      stripe, creatorProfile?.stripe_account_id, creatorProfile?.stripe_onboarding_complete,
    );
    if (creatorFlagWasStale) {
      await supabase.from("creator_profiles")
        .update({ stripe_onboarding_complete: true })
        .eq("user_id", post.creator_id);
    }

    // Concurrent-pending guard — BEFORE create_boost.
    const { data: existingPending } = await supabase
      .from("dragonshare_boosts")
      .select("id, amount_cents")
      .eq("post_id", post_id)
      .eq("boosting_org_id", membership.org_id)
      .eq("status", "pending")
      .maybeSingle();

    let boostId: string;
    let boostAmountCents: number;
    if (existingPending) {
      boostId = existingPending.id;
      boostAmountCents = existingPending.amount_cents ?? amount_cents;
      logStep("Reusing pending boost (charging its stored amount)", { boostId, boostAmountCents });
    } else {
      const { data: createdId, error: boostError } = await authedClient.rpc("create_boost", {
        p_post_id: post_id,
        p_boosting_org_id: membership.org_id,
        p_amount_cents: amount_cents,
        p_tier: tier_label,
      });
      if (boostError) throw new Error(`create_boost failed: ${boostError.message}`);
      boostId = createdId as string;
      boostAmountCents = amount_cents;
      logStep("Boost row created", { boostId });
    }

    if (!creatorReady) {
      logStep("Creator payout not ready — parking boost", { creatorId: post.creator_id, boostId });

      // Best-effort nudge: tell the creator to finish payout setup.
      // Must NEVER block or fail the 202 response.
      try {
        const boostDollars = (boostAmountCents / 100).toFixed(0);
        await supabase.from("donny_nudges").insert({
          user_id: post.creator_id,
          type: "payment",
          source_table: "dragonshare_boosts",
          source_id: boostId,
          summary: `A business wants to boost your post with $${boostDollars} — finish your payout setup to get paid.`,
          priority: "high",
          actions: [{ label: "Set up payouts", variant: "primary", action: "navigate", payload: { route: "/dashboard/creator/settings?section=payments" } }],
          raw_data: { boost_id: boostId, amount_cents: boostAmountCents },
        });
        logStep("Creator payout nudge inserted", { creatorId: post.creator_id, boostId });
      } catch (nudgeErr) {
        console.warn("[BOOST-PAYMENT] Creator nudge failed (non-blocking):", nudgeErr);
      }

      return json({
        error: "CREATOR_PAYOUT_NOT_READY",
        boost_id: boostId,
        message: "Creator hasn't finished payout setup. Boost is queued.",
      }, 202);
    }

    const origin = req.headers.get("origin")
      || Deno.env.get("PUBLIC_SITE_URL")
      || "https://dragoncandy.io";

    const openBoostCheckout = async () => {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "DragonShare boost" },
            unit_amount: boostAmountCents,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          setup_future_usage: "off_session",
          metadata: {
            type: "dragonshare_boost",
            boost_id: boostId,
            post_id: post_id,
            creator_id: post.creator_id,
            boosting_org_id: membership.org_id,
          },
        },
        metadata: {
          type: "dragonshare_boost",
          boost_id: boostId,
          post_id: post_id,
          creator_id: post.creator_id,
          boosting_org_id: membership.org_id,
        },
        custom_text: testModeCustomText(stripeKey),
        payment_method_types: testModePaymentMethodTypes(stripeKey),
        success_url: `${origin}/dashboard/business/dragonshare?boost=success`,
        cancel_url: `${origin}/dashboard/business/dragonshare?boost=cancelled`,
      });
      logStep("Boost checkout session created", { sessionId: session.id, boostId });
      return json({ checkout_url: session.url, boost_id: boostId });
    };

    // Resolve a reusable default card.
    const customer = await stripe.customers.retrieve(customerId);
    let defaultPm: string | undefined;
    if (!("deleted" in customer && customer.deleted)) {
      const dpm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
      defaultPm = typeof dpm === "string" ? dpm : dpm?.id;
    }
    if (!defaultPm) {
      const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
      defaultPm = pms.data[0]?.id;
    }

    if (defaultPm) {
      try {
        const pi = await stripe.paymentIntents.create({
          amount: boostAmountCents,
          currency: "usd",
          customer: customerId,
          payment_method: defaultPm,
          off_session: true,
          confirm: true,
          metadata: {
            type: "dragonshare_boost",
            boost_id: boostId,
            post_id: post_id,
            boosting_org_id: membership.org_id,
            creator_id: post.creator_id,
          },
        }, { idempotencyKey: `boost_pi_${boostId}` });

        if (pi.status !== "succeeded") {
          logStep("Off-session PI not succeeded — falling back to checkout", { status: pi.status });
          return await openBoostCheckout();
        }

        await fulfillBoost(stripe, supabase, {
          boostId,
          postId: post_id,
          creatorId: post.creator_id,
          amountCents: boostAmountCents,
          paymentIntentId: pi.id,
        });
        logStep("Boost complete (off-session)", { boostId, piId: pi.id });

        const { creatorPayoutCents } = calculateDragonShareFee(boostAmountCents);
        return json({ success: true, boost_id: boostId, creator_payout_cents: creatorPayoutCents });
      } catch (err) {
        // authentication_required / card needs SCA → collect via hosted checkout
        logStep("Off-session charge failed — falling back to checkout", { message: String(err) });
        return await openBoostCheckout();
      }
    }

    // No card on file → hosted checkout collects + saves it.
    return await openBoostCheckout();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return json({ error: msg }, 500);
  }
});
