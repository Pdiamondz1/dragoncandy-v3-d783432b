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

    // Get the sponsorship record with related data
    const { data: sponsorship, error: fetchError } = await supabaseClient
      .from('campaign_sponsorships')
      .select(`
        payment_intent_id, payment_status, sponsorship_amount,
        brand_id, restaurant_id, campaign_id,
        campaigns (title),
        brand_profile:business_profiles!brand_id (business_name, user_id),
        restaurant_profile:business_profiles!restaurant_id (business_name, user_id)
      `)
      .eq('id', sponsorshipId)
      .single();

    if (fetchError) throw new Error(`Failed to fetch sponsorship: ${fetchError.message}`);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Resolve the PaymentIntent ID
    let resolvedPaymentIntentId: string | null = sponsorship.payment_intent_id;

    if (resolvedPaymentIntentId?.startsWith('cs_')) {
      // It's a Checkout Session ID - retrieve the session to get the real PaymentIntent
      logStep("Resolving Checkout Session to PaymentIntent", { sessionId: resolvedPaymentIntentId });
      const checkoutSession = await stripe.checkout.sessions.retrieve(resolvedPaymentIntentId);
      resolvedPaymentIntentId = checkoutSession.payment_intent as string | null;
      logStep("Resolved PaymentIntent from session", { paymentIntentId: resolvedPaymentIntentId });
    }

    if (!resolvedPaymentIntentId) {
      return new Response(JSON.stringify({ verified: false, status: 'no_payment_intent' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check payment intent status
    const paymentIntent = await stripe.paymentIntents.retrieve(resolvedPaymentIntentId);
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

      // Send email notifications to both parties
      try {
        const campaignTitle = (sponsorship as any).campaigns?.title || 'Campaign';
        const brandName = (sponsorship as any).brand_profile?.business_name || 'Brand';
        const brandUserId = (sponsorship as any).brand_profile?.user_id;
        const restaurantName = (sponsorship as any).restaurant_profile?.business_name || 'Restaurant';
        const restaurantUserId = (sponsorship as any).restaurant_profile?.user_id;
        const amount = sponsorship.sponsorship_amount;

        logStep("Sending payment confirmation emails", { brandUserId, restaurantUserId });

        // Send to brand
        if (brandUserId) {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              type: 'sponsorship_payment_confirmed',
              data: {
                recipientUserId: brandUserId,
                campaignTitle,
                sponsorshipAmount: amount,
                brandName,
                businessName: restaurantName,
                isRecipient: false,
              },
            }),
          });
        }

        // Send to restaurant
        if (restaurantUserId) {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              type: 'sponsorship_payment_confirmed',
              data: {
                recipientUserId: restaurantUserId,
                campaignTitle,
                sponsorshipAmount: amount,
                brandName,
                businessName: restaurantName,
                isRecipient: true,
              },
            }),
          });
        }

        logStep("Payment confirmation emails sent");
      } catch (emailError) {
        logStep("Warning: Failed to send payment emails", { error: String(emailError) });
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
