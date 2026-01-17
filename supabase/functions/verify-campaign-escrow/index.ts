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

    const { campaignId, sessionId } = await req.json();
    if (!campaignId) {
      throw new Error("Missing required field: campaignId");
    }
    logStep("Request payload", { campaignId, sessionId });

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
      storedId: campaign.escrow_payment_intent_id 
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

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    let paymentSucceeded = false;
    let actualPaymentIntentId: string | null = null;
    
    // Priority 1: Use sessionId from URL if provided
    if (sessionId) {
      logStep("Trying verification with provided sessionId", { sessionId });
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        logStep("Session retrieved", { 
          paymentStatus: session.payment_status,
          paymentIntent: session.payment_intent,
          metadata: session.metadata
        });
        
        if (session.payment_status === 'paid') {
          paymentSucceeded = true;
          actualPaymentIntentId = session.payment_intent as string;
        }
      } catch (e) {
        logStep("Could not retrieve session from URL param", { error: String(e) });
      }
    }

    // Priority 2: Use stored escrow_payment_intent_id
    if (!paymentSucceeded && campaign.escrow_payment_intent_id) {
      const storedId = campaign.escrow_payment_intent_id;
      logStep("Trying verification with stored ID", { storedId });
      
      // Check if it's a session ID (starts with cs_)
      if (storedId.startsWith('cs_')) {
        try {
          const session = await stripe.checkout.sessions.retrieve(storedId);
          logStep("Stored session retrieved", { 
            paymentStatus: session.payment_status,
            paymentIntent: session.payment_intent
          });
          
          if (session.payment_status === 'paid') {
            paymentSucceeded = true;
            actualPaymentIntentId = session.payment_intent as string;
          }
        } catch (e) {
          logStep("Could not retrieve as session", { error: String(e) });
        }
      } 
      // Check if it's a payment intent ID (starts with pi_)
      else if (storedId.startsWith('pi_')) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(storedId);
          logStep("Payment intent retrieved", { 
            status: paymentIntent.status 
          });
          
          if (paymentIntent.status === 'succeeded') {
            paymentSucceeded = true;
            actualPaymentIntentId = storedId;
          }
        } catch (e) {
          logStep("Could not retrieve as payment intent", { error: String(e) });
        }
      }
    }

    // Priority 3: Search Stripe for payments with this campaign_id in metadata
    if (!paymentSucceeded) {
      logStep("Searching Stripe for payments by campaign metadata");
      try {
        const paymentIntents = await stripe.paymentIntents.search({
          query: `metadata['campaign_id']:'${campaignId}' AND status:'succeeded'`,
          limit: 1,
        });
        
        if (paymentIntents.data.length > 0) {
          const pi = paymentIntents.data[0];
          logStep("Found payment via metadata search", { 
            paymentIntentId: pi.id,
            amount: pi.amount 
          });
          paymentSucceeded = true;
          actualPaymentIntentId = pi.id;
        } else {
          logStep("No matching payment found in Stripe");
        }
      } catch (e) {
        logStep("Stripe search failed", { error: String(e) });
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
        status: 'published',
        escrow_payment_intent_id: actualPaymentIntentId, // Store the real PI ID
      })
      .eq('id', campaignId);

    if (updateError) {
      logStep("Error updating campaign", { error: updateError.message });
      throw new Error("Failed to update campaign status");
    }

    logStep("Campaign published successfully", { 
      campaignId,
      paymentIntentId: actualPaymentIntentId 
    });

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
