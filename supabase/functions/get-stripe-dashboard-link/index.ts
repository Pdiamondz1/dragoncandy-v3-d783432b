import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  console.log(`[GET-STRIPE-DASHBOARD-LINK] ${step}`, details ? JSON.stringify(details) : '');
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Starting dashboard link generation');

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      logStep('Authentication failed', { error: authError });
      throw new Error("Authentication failed");
    }

    logStep('User authenticated', { userId: user.id });

    // Get creator profile with Stripe account ID
    const { data: creatorProfile, error: profileError } = await supabaseClient
      .from('creator_profiles')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('user_id', user.id)
      .single();

    if (profileError || !creatorProfile) {
      logStep('Creator profile not found', { error: profileError });
      throw new Error("Creator profile not found");
    }

    if (!creatorProfile.stripe_account_id) {
      logStep('No Stripe account connected');
      throw new Error("No Stripe account connected. Please set up your payout account first.");
    }

    if (!creatorProfile.stripe_onboarding_complete) {
      logStep('Stripe onboarding not complete');
      throw new Error("Stripe onboarding not complete. Please complete your account setup first.");
    }

    logStep('Found Stripe account', { accountId: creatorProfile.stripe_account_id });

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Create login link for the Express account
    const loginLink = await stripe.accounts.createLoginLink(creatorProfile.stripe_account_id);

    logStep('Dashboard link created successfully');

    return new Response(
      JSON.stringify({ 
        url: loginLink.url,
        success: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    logStep('Error creating dashboard link', { error: error.message });
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
