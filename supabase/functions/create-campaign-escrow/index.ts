import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { getOrgTakeRate } from "../_shared/platform-fee.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolvePayoutAmount } from "../_shared/pricing-utils.ts";
import { getOrCreateOrgCustomer } from "../_shared/stripe-customer.ts";
import { testModeCustomText } from "../_shared/test-mode-text.ts";
import { testModePaymentMethodTypes } from "../_shared/test-mode-payment-methods.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CAMPAIGN-ESCROW] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  // Use service role key for reliable DB updates
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Also create anon client for auth
  const supabaseAnon = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { campaignId } = await req.json();
    if (!campaignId) {
      throw new Error("Missing required field: campaignId");
    }

    // Verify campaign ownership and load authoritative pricing from DB
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campaigns')
      .select('id, user_id, org_id, escrow_status, budget_max, fixed_price, pricing_type, delivery_fee, delivery_type, title')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.user_id !== user.id) {
      throw new Error("You are not authorized to pay for this campaign");
    }

    // Resolve pricing from the shared utility (same logic payout will use)
    const pricing = await resolvePayoutAmount(supabaseClient, campaignId);
    let amount = pricing?.amount ?? null;

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Campaign has no valid budget set' }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    logStep("Pricing resolved", { amount, source: pricing!.source });
    const deliveryFee = Number(campaign.delivery_fee) || 0;
    const campaignTitle = campaign.title || 'Content Campaign';
    const deliveryType = campaign.delivery_type || 'standard';
    const totalAmount = amount + deliveryFee;
    logStep("Pricing from DB", { campaignId, amount, deliveryFee, totalAmount, campaignTitle, deliveryType });

    // If already paid, don't create new session
    if (campaign.escrow_status === 'held' || campaign.escrow_status === 'released') {
      logStep("Campaign already paid", { escrowStatus: campaign.escrow_status });
      return new Response(JSON.stringify({ 
        error: "Campaign already paid",
        alreadyPaid: true 
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (!campaign.org_id) throw new Error("Campaign has no org_id");
    const customerId = await getOrCreateOrgCustomer(stripe, supabaseClient, campaign.org_id, user.email);
    logStep("Resolved org customer", { customerId, orgId: campaign.org_id });

    const takeRate = await getOrgTakeRate(supabaseClient, user.id);
    const platformFee = Math.round(totalAmount * takeRate * 100); // Convert to cents
    const totalAmountCents = Math.round(totalAmount * 100); // Convert to cents
    logStep("Fee calculation", { totalAmount, takeRate, platformFee: platformFee / 100, totalAmountCents: totalAmountCents / 100 });

    const origin = req.headers.get("origin")
      || Deno.env.get("PUBLIC_SITE_URL")
      || "https://dragoncandy.io";

    // Build description based on delivery type
    const deliveryLabels: Record<string, string> = {
      standard: 'Standard Delivery (72 hours)',
      expedited: 'Expedited Delivery (8-12 hours)',
      dragonrush: 'DragonRush Priority (1-3 hours)',
    };
    const deliveryLabel = deliveryLabels[deliveryType] || 'Standard Delivery';

    // Create checkout session with correct return URLs
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      custom_text: testModeCustomText(stripeKey),
      payment_method_types: testModePaymentMethodTypes(stripeKey),
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Campaign: ${campaignTitle || 'Content Campaign'}`,
              description: `Creator payment escrow - ${deliveryLabel}`,
            },
            unit_amount: totalAmountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      // Fixed: Use correct dashboard routes with session_id for verification
      success_url: `${origin}/dashboard/business/campaigns/${campaignId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/business/campaigns/${campaignId}?payment=cancelled`,
      metadata: {
        campaign_id: campaignId,
        platform_fee: platformFee.toString(),
        delivery_fee: (deliveryFee || 0).toString(),
        delivery_type: deliveryType || 'standard',
        user_id: user.id,
        type: 'campaign_escrow',
      },
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          campaign_id: campaignId,
          platform_fee: platformFee.toString(),
          user_id: user.id,
          type: 'campaign_escrow',
        },
      },
    });

    logStep("Checkout session created", { 
      sessionId: session.id, 
      paymentIntent: session.payment_intent,
      url: session.url 
    });

    // Store payment intent ID if available, fall back to session ID; always store session ID separately
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as any)?.id;

    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update({
        escrow_status: 'pending',
        escrow_payment_intent_id: paymentIntentId || session.id,
        escrow_checkout_session_id: session.id,
      })
      .eq('id', campaignId);

    if (updateError) {
      logStep("Warning: Failed to update campaign escrow status", { error: updateError.message });
    } else {
      logStep("Campaign updated with session ID", { sessionId: session.id });
      await writePaymentEvent(supabaseClient, {
        event_type: 'escrow_authorized',
        entity_type: 'collaboration',
        entity_id: campaignId,
        campaign_id: campaignId,
        actor_id: user.id,
        actor_role: 'business',
        amount_cents: totalAmountCents,
        stripe_id: session.id,
      }, '[CREATE-CAMPAIGN-ESCROW]');
    }

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 500,
    });
  }
});
