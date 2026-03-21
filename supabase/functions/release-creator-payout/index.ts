import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RELEASE-CREATOR-PAYOUT] ${step}${detailsStr}`);
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

    const { collaborationId } = await req.json();
    if (!collaborationId) {
      throw new Error("Missing required field: collaborationId");
    }

    // Get collaboration details with campaign and creator info
    const { data: collaboration, error: collabError } = await supabaseClient
      .from('campaign_collaborations')
      .select(`
        *,
        campaign:campaigns(*),
        creator:profiles(id, email)
      `)
      .eq('id', collaborationId)
      .single();

    if (collabError || !collaboration) {
      throw new Error(`Failed to fetch collaboration: ${collabError?.message}`);
    }

    // Verify the user is the campaign owner
    if (collaboration.campaign.user_id !== user.id) {
      throw new Error("Only the campaign owner can release payments");
    }

    logStep("Collaboration found", { 
      campaignId: collaboration.campaign_id, 
      creatorId: collaboration.creator_id,
      status: collaboration.status,
    });

    // Get creator's Stripe account
    const { data: creatorProfile, error: creatorError } = await supabaseClient
      .from('creator_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
      .eq('user_id', collaboration.creator_id)
      .single();

    if (creatorError) {
      throw new Error(`Failed to fetch creator profile: ${creatorError.message}`);
    }

    const campaign = collaboration.campaign;
    
    // Calculate payout amount
    let payoutAmount = 0;
    if (campaign.pricing_type === 'fixed' && campaign.fixed_price) {
      payoutAmount = campaign.fixed_price;
    } else if (campaign.budget_max) {
      // For bid range, use the accepted bid amount or budget_max
      payoutAmount = campaign.budget_max;
    }

    // Add delivery fee if applicable (goes to creator)
    const deliveryFee = campaign.delivery_fee || 0;
    payoutAmount += deliveryFee;

    // Platform takes 5%
    const platformFee = payoutAmount * 0.05;
    const creatorPayout = payoutAmount - platformFee;

    logStep("Payout calculation", { 
      baseAmount: payoutAmount - deliveryFee,
      deliveryFee,
      payoutAmount,
      platformFee,
      creatorPayout,
    });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if creator has completed Stripe onboarding
    if (creatorProfile?.stripe_account_id && creatorProfile?.stripe_onboarding_complete) {
      // Transfer funds to creator's connected account.
      // Idempotency key prevents duplicate transfers on retry.
      const transfer = await stripe.transfers.create({
        amount: Math.round(creatorPayout * 100), // Convert to cents
        currency: 'usd',
        destination: creatorProfile.stripe_account_id,
        metadata: {
          collaboration_id: collaborationId,
          campaign_id: campaign.id,
          platform_fee: platformFee.toString(),
        },
      }, { idempotencyKey: `payout_${collaborationId}` });

      logStep("Transfer created", { transferId: transfer.id, amount: creatorPayout });

      // Update collaboration status
      const { error: collabUpdateError } = await supabaseClient
        .from('campaign_collaborations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          content_status: 'approved',
        })
        .eq('id', collaborationId);

      if (collabUpdateError) {
        throw new Error(`Transfer succeeded but failed to update collaboration status: ${collabUpdateError.message}`);
      }

      // Update campaign escrow status
      const { error: campaignUpdateError } = await supabaseClient
        .from('campaigns')
        .update({ escrow_status: 'released' })
        .eq('id', campaign.id);

      if (campaignUpdateError) {
        throw new Error(`Transfer succeeded but failed to update campaign escrow status: ${campaignUpdateError.message}`);
      }

      return new Response(JSON.stringify({ 
        success: true,
        transferId: transfer.id,
        amount: creatorPayout,
        method: 'stripe_transfer',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      // Creator hasn't completed onboarding - add to pending balance
      const newPendingBalance = (creatorProfile?.pending_balance || 0) + creatorPayout;
      
      await supabaseClient
        .from('creator_profiles')
        .update({ pending_balance: newPendingBalance })
        .eq('user_id', collaboration.creator_id);

      logStep("Added to pending balance", { 
        previousBalance: creatorProfile?.pending_balance || 0,
        added: creatorPayout,
        newBalance: newPendingBalance,
      });

      // Update collaboration status
      await supabaseClient
        .from('campaign_collaborations')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          content_status: 'approved',
        })
        .eq('id', collaborationId);

      // Update campaign escrow status
      await supabaseClient
        .from('campaigns')
        .update({ escrow_status: 'released' })
        .eq('id', campaign.id);

      return new Response(JSON.stringify({ 
        success: true,
        amount: creatorPayout,
        method: 'pending_balance',
        message: 'Payment added to creator pending balance. Creator needs to complete Stripe onboarding to withdraw.',
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
