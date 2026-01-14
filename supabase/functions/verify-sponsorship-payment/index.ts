import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-SPONSORSHIP-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const { sponsorshipId } = await req.json();
    if (!sponsorshipId) throw new Error("Missing sponsorshipId");
    logStep("Verifying payment for sponsorship", { sponsorshipId });

    // Get the sponsorship record
    const { data: sponsorship, error: fetchError } = await supabaseClient
      .from('campaign_sponsorships')
      .select('payment_intent_id, payment_status')
      .eq('id', sponsorshipId)
      .single();

    if (fetchError) throw new Error(`Failed to fetch sponsorship: ${fetchError.message}`);
    if (!sponsorship?.payment_intent_id) {
      return new Response(JSON.stringify({ verified: false, status: 'no_payment_intent' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check payment intent status
    const paymentIntent = await stripe.paymentIntents.retrieve(sponsorship.payment_intent_id);
    logStep("Payment intent status", { status: paymentIntent.status });

    if (paymentIntent.status === 'succeeded') {
      // Update sponsorship to paid
      const { error: updateError } = await supabaseClient
        .from('campaign_sponsorships')
        .update({ 
          payment_status: 'paid',
          payment_date: new Date().toISOString(),
          payment_method: paymentIntent.payment_method_types?.[0] || 'card',
        })
        .eq('id', sponsorshipId);

      if (updateError) {
        logStep("Warning: Failed to update payment status", { error: updateError.message });
      }

      return new Response(JSON.stringify({ verified: true, status: 'paid' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ verified: false, status: paymentIntent.status }), {
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
