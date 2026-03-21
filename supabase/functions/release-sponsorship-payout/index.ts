import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RELEASE-SPONSORSHIP-PAYOUT] ${step}${detailsStr}`);
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

    const { sponsorshipId } = await req.json();
    if (!sponsorshipId) {
      throw new Error("Missing required field: sponsorshipId");
    }

    // Get sponsorship details
    const { data: sponsorship, error: sponsorshipError } = await supabaseClient
      .from('campaign_sponsorships')
      .select('*, campaigns(id, title, user_id)')
      .eq('id', sponsorshipId)
      .single();

    if (sponsorshipError || !sponsorship) {
      throw new Error(`Failed to fetch sponsorship: ${sponsorshipError?.message}`);
    }

    logStep("Sponsorship found", { 
      sponsorshipId,
      restaurantId: sponsorship.restaurant_id,
      amount: sponsorship.sponsorship_amount,
      status: sponsorship.status,
    });

    // Get restaurant's business profile with Stripe info
    const { data: restaurantProfile, error: restaurantError } = await supabaseClient
      .from('business_profiles')
      .select('id, user_id, business_name, stripe_account_id, stripe_onboarding_complete, pending_balance')
      .eq('id', sponsorship.restaurant_id)
      .single();

    if (restaurantError) {
      throw new Error(`Failed to fetch restaurant profile: ${restaurantError.message}`);
    }

    const sponsorshipAmount = sponsorship.sponsorship_amount || 0;
    if (sponsorshipAmount <= 0) {
      throw new Error("Sponsorship has no amount to pay out");
    }

    // Platform takes 5%
    const platformFee = sponsorshipAmount * 0.05;
    const restaurantPayout = sponsorshipAmount - platformFee;

    logStep("Payout calculation", { 
      sponsorshipAmount,
      platformFee,
      restaurantPayout,
    });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (restaurantProfile?.stripe_account_id && restaurantProfile?.stripe_onboarding_complete) {
      // Transfer funds to restaurant's connected account
      const transfer = await stripe.transfers.create({
        amount: Math.round(restaurantPayout * 100), // Convert to cents
        currency: 'usd',
        destination: restaurantProfile.stripe_account_id,
        metadata: {
          sponsorship_id: sponsorshipId,
          campaign_id: sponsorship.campaign_id,
          platform_fee: platformFee.toString(),
          type: 'sponsorship_payout',
        },
      });

      logStep("Transfer created", { transferId: transfer.id, amount: restaurantPayout });

      return new Response(JSON.stringify({ 
        success: true,
        transferId: transfer.id,
        amount: restaurantPayout,
        method: 'stripe_transfer',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      // Restaurant hasn't completed onboarding - add to pending balance
      const newPendingBalance = (restaurantProfile?.pending_balance || 0) + restaurantPayout;
      
      await supabaseClient
        .from('business_profiles')
        .update({ pending_balance: newPendingBalance })
        .eq('id', sponsorship.restaurant_id);

      logStep("Added to pending balance", { 
        previousBalance: restaurantProfile?.pending_balance || 0,
        added: restaurantPayout,
        newBalance: newPendingBalance,
      });

      return new Response(JSON.stringify({ 
        success: true,
        amount: restaurantPayout,
        method: 'pending_balance',
        message: 'Payment added to restaurant pending balance. Connect Stripe to withdraw.',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
