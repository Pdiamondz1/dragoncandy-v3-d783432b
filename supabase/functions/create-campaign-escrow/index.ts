import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

  const supabaseClient = createClient(
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
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    }

    // Calculate platform fee (5%)
    const platformFee = Math.round(totalAmount * 0.05 * 100); // Convert to cents
    const totalAmountCents = Math.round(totalAmount * 100); // Convert to cents
    logStep("Fee calculation", { totalAmount, platformFee: platformFee / 100, totalAmountCents: totalAmountCents / 100 });

    const origin = req.headers.get("origin") || "https://dragoncandy-v3.lovable.app";

    // Build description based on delivery type
    const deliveryLabels: Record<string, string> = {
      standard: 'Standard Delivery (72 hours)',
      expedited: 'Expedited Delivery (8-12 hours)',
      dragonrush: 'DragonRush Priority (1-3 hours)',
    };
    const deliveryLabel = deliveryLabels[deliveryType] || 'Standard Delivery';

    // Create checkout session
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
      success_url: `${origin}/business/projects?payment=success&campaign_id=${campaignId}`,
      cancel_url: `${origin}/business/projects?payment=cancelled`,
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
          type: 'campaign_escrow',
        },
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    // Update campaign with pending escrow status
    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update({ 
        escrow_status: 'pending',
        escrow_payment_intent_id: session.payment_intent as string,
      })
      .eq('id', campaignId);

    if (updateError) {
      logStep("Warning: Failed to update campaign escrow status", { error: updateError.message });
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
