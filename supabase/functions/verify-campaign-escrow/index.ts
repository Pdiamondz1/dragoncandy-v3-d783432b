import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { campaignId, sessionId } = await req.json();
    if (!campaignId) throw new Error("Missing required field: campaignId");
    logStep("Request payload", { campaignId, sessionId });

    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campaigns')
      .select('id, user_id, escrow_payment_intent_id, escrow_status, status, title, fixed_price, budget_max, pricing_type, delivery_fee, delivery_type, per_creator_cap, creator_count, budget_spent')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) throw new Error("Campaign not found");
    if (campaign.user_id !== user.id) throw new Error("You are not authorized to verify this campaign");

    logStep("Campaign found", { escrowStatus: campaign.escrow_status });

    if (campaign.escrow_status === 'held' || campaign.escrow_status === 'released') {
      return new Response(JSON.stringify({ success: true, message: "Escrow already verified", status: campaign.escrow_status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    let paymentSucceeded = false;
    let actualPaymentIntentId: string | null = null;

    // Priority 1: sessionId from URL
    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') {
          paymentSucceeded = true;
          actualPaymentIntentId = session.payment_intent as string;
        }
      } catch (e) {
        logStep("Session retrieval failed", { error: String(e) });
      }
    }

    // Priority 2: stored escrow_payment_intent_id
    if (!paymentSucceeded && campaign.escrow_payment_intent_id) {
      const storedId = campaign.escrow_payment_intent_id;
      if (storedId.startsWith('cs_')) {
        try {
          const session = await stripe.checkout.sessions.retrieve(storedId);
          if (session.payment_status === 'paid') {
            paymentSucceeded = true;
            actualPaymentIntentId = session.payment_intent as string;
          }
        } catch (e) { /* skip */ }
      } else if (storedId.startsWith('pi_')) {
        try {
          const pi = await stripe.paymentIntents.retrieve(storedId);
          if (pi.status === 'succeeded') {
            paymentSucceeded = true;
            actualPaymentIntentId = storedId;
          }
        } catch (e) { /* skip */ }
      }
    }

    // Priority 3: Stripe metadata search
    if (!paymentSucceeded) {
      try {
        const pis = await stripe.paymentIntents.search({
          query: `metadata['campaign_id']:'${campaignId}' AND status:'succeeded'`,
          limit: 1,
        });
        if (pis.data.length > 0) {
          paymentSucceeded = true;
          actualPaymentIntentId = pis.data[0].id;
        }
      } catch (e) {
        logStep("Stripe search failed", { error: String(e) });
      }
    }

    if (!paymentSucceeded) {
      return new Response(JSON.stringify({ success: false, message: "Payment not yet completed.", status: 'pending' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Payment succeeded! Update campaign
    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update({ escrow_status: 'held', status: 'published', escrow_payment_intent_id: actualPaymentIntentId })
      .eq('id', campaignId);

    if (updateError) throw new Error("Failed to update campaign status");

    await writePaymentEvent(supabaseClient, {
      event_type: 'escrow_held',
      entity_type: 'collaboration',
      entity_id: campaignId,
      campaign_id: campaignId,
      actor_id: user.id,
      actor_role: 'business',
      stripe_id: actualPaymentIntentId,
    }, '[VERIFY-CAMPAIGN-ESCROW]');

    // Budget validation
    const { data: application } = await supabaseClient
      .from('campaign_applications')
      .select('proposed_rate')
      .eq('campaign_id', campaignId)
      .eq('status', 'accepted')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (application && campaign.per_creator_cap && application.proposed_rate > campaign.per_creator_cap) {
      logStep("Per-creator cap exceeded", {
        proposed: application.proposed_rate,
        cap: campaign.per_creator_cap,
      });
      if (actualPaymentIntentId) {
        await stripe.refunds.create({ payment_intent: actualPaymentIntentId });
      }
      return new Response(
        JSON.stringify({ error: `Creator's rate ($${application.proposed_rate}) exceeds per-creator cap ($${campaign.per_creator_cap})` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const budgetMax = campaign.budget_max || campaign.fixed_price || 0;
    const budgetSpent = campaign.budget_spent || 0;
    const proposedRate = application?.proposed_rate || 0;

    if (budgetMax > 0 && budgetSpent + proposedRate > budgetMax) {
      logStep("Budget pool exceeded", {
        budgetSpent,
        proposedRate,
        budgetMax,
      });
      if (actualPaymentIntentId) {
        await stripe.refunds.create({ payment_intent: actualPaymentIntentId });
      }
      return new Response(
        JSON.stringify({ error: `Accepting at $${proposedRate} would exceed remaining budget ($${budgetMax - budgetSpent} remaining)` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (campaign.creator_count) {
      const { count } = await supabaseClient
        .from('campaign_collaborations')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'active');

      if ((count || 0) >= campaign.creator_count) {
        logStep("Creator count full", { current: count, max: campaign.creator_count });
        if (actualPaymentIntentId) {
          await stripe.refunds.create({ payment_intent: actualPaymentIntentId });
        }
        return new Response(
          JSON.stringify({ error: `Campaign already has ${campaign.creator_count} active creators` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    // Create collaboration from accepted application (using service role - no RLS issues)
    const { data: acceptedApp } = await supabaseClient
      .from('campaign_applications')
      .select('id, creator_id, campaign_id')
      .eq('campaign_id', campaignId)
      .eq('status', 'accepted')
      .limit(1)
      .single();

    if (acceptedApp) {
      // Check if collaboration already exists
      const { data: existingCollab } = await supabaseClient
        .from('campaign_collaborations')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('creator_id', acceptedApp.creator_id)
        .limit(1)
        .single();

      if (!existingCollab) {
        const { error: collabError } = await supabaseClient
          .from('campaign_collaborations')
          .insert({
            campaign_id: campaignId,
            creator_id: acceptedApp.creator_id,
            application_id: acceptedApp.id,
            status: 'active',
          });

        if (collabError) {
          logStep("WARNING: Failed to create collaboration", { error: collabError.message });
        } else {
          logStep("Collaboration created successfully", { creatorId: acceptedApp.creator_id });

          // Track budget spend
          if (proposedRate > 0) {
            await supabaseClient.rpc('increment_budget_spent', {
              p_campaign_id: campaignId,
              p_amount: proposedRate,
            });
            logStep("Budget incremented", { amount: proposedRate });
          }
        }
      } else {
        logStep("Collaboration already exists");
      }
    } else {
      logStep("No accepted application found for collaboration creation");
    }

    logStep("Campaign published successfully", { campaignId, paymentIntentId: actualPaymentIntentId });

    return new Response(JSON.stringify({ success: true, message: "Payment verified! Campaign is now published.", status: 'held' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
