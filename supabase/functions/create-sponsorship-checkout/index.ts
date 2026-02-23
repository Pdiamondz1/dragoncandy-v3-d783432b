import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-SPONSORSHIP-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  // Service-role client for DB updates (bypasses RLS)
  const adminClient = createClient(
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
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { sponsorshipId, amount, campaignTitle } = await req.json();
    if (!sponsorshipId || !amount) {
      throw new Error("Missing required fields: sponsorshipId and amount");
    }
    logStep("Request payload", { sponsorshipId, amount, campaignTitle });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    }

    // Calculate platform fee (5%)
    const platformFee = Math.round(amount * 0.05 * 100); // Convert to cents
    const totalAmount = Math.round(amount * 100); // Convert to cents
    logStep("Fee calculation", { amount, platformFee: platformFee / 100, totalAmount: totalAmount / 100 });

    const origin = req.headers.get("origin") || "https://dragoncandy-v3.lovable.app";

    // Create checkout session with dynamic price
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Sponsorship: ${campaignTitle || 'Campaign Sponsorship'}`,
              description: `Sponsorship payment for campaign`,
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/dashboard/brand/sponsorships?payment=success&sponsorship_id=${sponsorshipId}`,
      cancel_url: `${origin}/dashboard/brand/sponsorships?payment=cancelled`,
      metadata: {
        sponsorship_id: sponsorshipId,
        platform_fee: platformFee.toString(),
        user_id: user.id,
      },
      payment_intent_data: {
        metadata: {
          sponsorship_id: sponsorshipId,
          platform_fee: platformFee.toString(),
        },
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    // Update sponsorship with pending payment status (use admin client to bypass RLS)
    const { error: updateError } = await adminClient
      .from('campaign_sponsorships')
      .update({ 
        payment_status: 'pending',
        payment_intent_id: session.id, // Store Checkout Session ID (always available)
      })
      .eq('id', sponsorshipId);

    if (updateError) {
      logStep("Warning: Failed to update sponsorship status", { error: updateError.message });
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
