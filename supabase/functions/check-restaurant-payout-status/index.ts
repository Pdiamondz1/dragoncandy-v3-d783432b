import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-RESTAURANT-PAYOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { data: businessProfile, error: profileError } = await supabaseClient
      .from('business_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
      .eq('user_id', user.id)
      .eq('account_type', 'restaurant')
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch business profile: ${profileError.message}`);
    }

    if (!businessProfile?.stripe_account_id) {
      logStep("No Stripe account found for restaurant");
      return new Response(JSON.stringify({ 
        hasAccount: false,
        onboardingComplete: false,
        pendingBalance: 0,
        chargesEnabled: false,
        payoutsEnabled: false,
        platformPendingBalance: businessProfile?.pending_balance || 0,
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const account = await stripe.accounts.retrieve(businessProfile.stripe_account_id);
    logStep("Retrieved Stripe account", { 
      accountId: account.id, 
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });

    const onboardingComplete = account.charges_enabled && account.payouts_enabled;

    if (onboardingComplete !== businessProfile.stripe_onboarding_complete) {
      const { error: updateError } = await supabaseClient
        .from('business_profiles')
        .update({ stripe_onboarding_complete: onboardingComplete })
        .eq('user_id', user.id)
        .eq('account_type', 'restaurant');

      if (updateError) {
        logStep("Warning: Failed to update onboarding status", { error: updateError.message });
      }
    }

    let availableBalance = 0;
    let pendingStripeBalance = 0;
    
    if (onboardingComplete) {
      try {
        const balance = await stripe.balance.retrieve({
          stripeAccount: businessProfile.stripe_account_id,
        });
        
        availableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;
        pendingStripeBalance = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100;
        logStep("Balance retrieved", { availableBalance, pendingStripeBalance });
      } catch (balanceError) {
        logStep("Could not retrieve balance", { error: balanceError });
      }
    }

    return new Response(JSON.stringify({ 
      hasAccount: true,
      accountId: businessProfile.stripe_account_id,
      onboardingComplete,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      availableBalance,
      pendingBalance: pendingStripeBalance,
      platformPendingBalance: businessProfile.pending_balance || 0,
    }), {
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
