import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-CAMPAIGN-ESCROW] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { campaignId } = await req.json();
    if (!campaignId) {
      throw new Error("Missing required field: campaignId");
    }
    logStep("Request payload", { campaignId });

    // Fetch the campaign and verify ownership
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campaigns')
      .select('id, user_id, escrow_payment_intent_id, escrow_status, status, title')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.user_id !== user.id) {
      throw new Error("You are not authorized to verify this campaign");
    }

    logStep("Campaign found", { 
      campaignId: campaign.id, 
      escrowStatus: campaign.escrow_status,
      paymentIntentId: campaign.escrow_payment_intent_id 
    });

    // If already held/released, return success
    if (campaign.escrow_status === 'held' || campaign.escrow_status === 'released') {
      logStep("Escrow already verified", { escrowStatus: campaign.escrow_status });
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Escrow already verified",
        status: campaign.escrow_status 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // If no payment intent, can't verify
    if (!campaign.escrow_payment_intent_id) {
      throw new Error("No payment intent found for this campaign. Please initiate payment first.");
    }

    // Initialize Stripe and check payment status
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    // The escrow_payment_intent_id might be null initially (set by checkout session)
    // We need to check if it's a checkout session or payment intent
    let paymentSucceeded = false;
    
    try {
      // First try as payment intent
      const paymentIntent = await stripe.paymentIntents.retrieve(campaign.escrow_payment_intent_id);
      logStep("Payment intent retrieved", { 
        intentId: paymentIntent.id, 
        status: paymentIntent.status 
      });
      paymentSucceeded = paymentIntent.status === 'succeeded';
    } catch (e) {
      // Might be a checkout session ID, try to retrieve it
      logStep("Not a payment intent, trying as checkout session");
      try {
        const session = await stripe.checkout.sessions.retrieve(campaign.escrow_payment_intent_id);
        logStep("Checkout session retrieved", { 
          sessionId: session.id, 
          paymentStatus: session.payment_status,
          paymentIntent: session.payment_intent
        });
        paymentSucceeded = session.payment_status === 'paid';
        
        // Update the campaign with the actual payment intent ID
        if (session.payment_intent) {
          await supabaseClient
            .from('campaigns')
            .update({ escrow_payment_intent_id: session.payment_intent as string })
            .eq('id', campaignId);
        }
      } catch (e2) {
        logStep("Could not retrieve as session either", { error: String(e2) });
        throw new Error("Could not verify payment status. Please contact support.");
      }
    }

    if (!paymentSucceeded) {
      logStep("Payment not yet succeeded");
      return new Response(JSON.stringify({ 
        success: false, 
        message: "Payment not yet completed. Please complete the payment.",
        status: 'pending'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Payment succeeded! Update campaign to published and escrow held
    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update({ 
        escrow_status: 'held',
        status: 'published'
      })
      .eq('id', campaignId);

    if (updateError) {
      logStep("Error updating campaign", { error: updateError.message });
      throw new Error("Failed to update campaign status");
    }

    logStep("Campaign published successfully", { campaignId });

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Payment verified! Campaign is now published.",
      status: 'held'
    }), {
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
