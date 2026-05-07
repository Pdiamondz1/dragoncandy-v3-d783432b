import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { getOrgTakeRate } from "../_shared/platform-fee.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CAMPAIGN-ESCROW] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    const { campaignId, amount, deliveryFee, campaignTitle, deliveryType } = await req.json();
    if (!campaignId || !amount) {
      throw new Error("Missing required fields: campaignId and amount");
    }
    
    const totalAmount = amount + (deliveryFee || 0);
    logStep("Request payload", { campaignId, amount, deliveryFee, totalAmount, campaignTitle, deliveryType });

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campaigns')
      .select('id, user_id, escrow_status')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.user_id !== user.id) {
      throw new Error("You are not authorized to pay for this campaign");
    }

    // If already paid, don't create new session
    if (campaign.escrow_status === 'held' || campaign.escrow_status === 'released') {
      logStep("Campaign already paid", { escrowStatus: campaign.escrow_status });
      return new Response(JSON.stringify({ 
        error: "Campaign already paid",
        alreadyPaid: true 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    }

    const takeRate = await getOrgTakeRate(supabaseClient, user.id);
    const platformFee = Math.round(totalAmount * takeRate * 100); // Convert to cents
    const totalAmountCents = Math.round(totalAmount * 100); // Convert to cents
    logStep("Fee calculation", { totalAmount, takeRate, platformFee: platformFee / 100, totalAmountCents: totalAmountCents / 100 });

    const origin = req.headers.get("origin") || "https://dragoncandy-v3.lovable.app";

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
      customer_email: customerId ? undefined : user.email,
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
      success_url: `${origin}/dashboard/business/campaigns?payment=success&campaign_id=${campaignId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/business/campaigns?payment=cancelled&campaign_id=${campaignId}`,
      metadata: {
        campaign_id: campaignId,
        platform_fee: platformFee.toString(),
        delivery_fee: (deliveryFee || 0).toString(),
        delivery_type: deliveryType || 'standard',
        user_id: user.id,
        type: 'campaign_escrow',
      },
      payment_intent_data: {
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

    // Store session.id (not payment_intent which may be null at this stage)
    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update({ 
        escrow_status: 'pending',
        escrow_payment_intent_id: session.id, // Store session ID for now
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
