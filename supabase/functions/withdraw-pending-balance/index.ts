import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[WITHDRAW-PENDING-BALANCE] ${step}${detailsStr}`);
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Try creator profile first
    let profileTable = 'creator_profiles';
    let stripeAccountId: string | null = null;
    let onboardingComplete = false;
    let pendingBalanceValue = 0;

    const { data: creatorProfile } = await supabaseClient
      .from('creator_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
      .eq('user_id', user.id)
      .maybeSingle();

    if (creatorProfile?.stripe_account_id) {
      stripeAccountId = creatorProfile.stripe_account_id;
      onboardingComplete = creatorProfile.stripe_onboarding_complete ?? false;
      pendingBalanceValue = creatorProfile.pending_balance ?? 0;
      profileTable = 'creator_profiles';
    } else {
      // Fallback: check business_profiles (restaurant)
      const { data: businessProfile } = await supabaseClient
        .from('business_profiles')
        .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (businessProfile?.stripe_account_id) {
        stripeAccountId = businessProfile.stripe_account_id;
        onboardingComplete = businessProfile.stripe_onboarding_complete ?? false;
        pendingBalanceValue = businessProfile.pending_balance ?? 0;
        profileTable = 'business_profiles';
      }
    }

    logStep("Profile fetched", { 
      profileTable,
      hasStripeAccount: !!stripeAccountId,
      onboardingComplete,
      pendingBalance: pendingBalanceValue
    });

    if (!stripeAccountId || !onboardingComplete) {
      throw new Error("Please complete Stripe setup before withdrawing funds");
    }

    // Validate there's money to withdraw
    const pendingBalance = pendingBalanceValue;
    if (pendingBalance <= 0) {
      throw new Error("No funds available to withdraw");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Verify the Stripe account is still valid and can receive funds
    const account = await stripe.accounts.retrieve(stripeAccountId);
    logStep("Retrieved Stripe account", { 
      accountId: account.id, 
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });

    if (!account.payouts_enabled) {
      throw new Error("Your Stripe account cannot receive payouts. Please complete Stripe verification.");
    }

    // Convert to cents for Stripe
    const amountInCents = Math.round(pendingBalance * 100);

    // Create a transfer to the connected account
    logStep("Creating transfer", { 
      amount: amountInCents, 
      destination: stripeAccountId 
    });

    const transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency: 'usd',
      destination: stripeAccountId,
      description: `DragonCandy platform wallet withdrawal`,
      metadata: {
        user_id: user.id,
        withdrawal_type: 'pending_balance',
      },
    });

    logStep("Transfer created", { transferId: transfer.id, amount: transfer.amount });

    // Reset the pending balance to 0
    const { error: updateError } = await supabaseClient
      .from(profileTable)
      .update({ pending_balance: 0 })
      .eq('user_id', user.id);

    if (updateError) {
      logStep("WARNING: Failed to reset pending_balance", { error: updateError.message });
      // Don't throw - the transfer already happened
    }

    logStep("Withdrawal complete", { 
      transferId: transfer.id, 
      amountWithdrawn: pendingBalance 
    });

    return new Response(JSON.stringify({ 
      success: true,
      transferId: transfer.id,
      amount: pendingBalance,
      message: `Successfully transferred $${pendingBalance.toFixed(2)} to your Stripe account`,
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
