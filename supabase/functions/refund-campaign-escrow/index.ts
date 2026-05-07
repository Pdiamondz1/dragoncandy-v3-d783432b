import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REFUND-CAMPAIGN-ESCROW] ${step}${detailsStr}`);
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

    const { collaborationId, reason } = await req.json();
    if (!collaborationId) throw new Error("Missing required field: collaborationId");
    if (!reason?.trim()) throw new Error("A reason is required for content rejection");

    // Get collaboration with campaign
    const { data: collaboration, error: collabError } = await supabaseClient
      .from('campaign_collaborations')
      .select('*, campaign:campaigns(*)')
      .eq('id', collaborationId)
      .single();

    if (collabError || !collaboration) {
      throw new Error(`Collaboration not found: ${collabError?.message}`);
    }

    // Verify caller is campaign owner
    if (collaboration.campaign.user_id !== user.id) {
      throw new Error("Only the campaign owner can reject content and request a refund");
    }

    // Guard: only allow rejection from submitted or revision_requested states
    if (!['submitted', 'revision_requested'].includes(collaboration.content_status)) {
      throw new Error(`Cannot reject content in '${collaboration.content_status}' state`);
    }

    const campaign = collaboration.campaign;

    // Guard: campaign must have held escrow
    if (campaign.escrow_status !== 'held') {
      throw new Error(`Cannot refund: escrow status is '${campaign.escrow_status}', expected 'held'`);
    }

    logStep("Rejecting content and initiating refund", {
      collaborationId,
      campaignId: campaign.id,
      escrowStatus: campaign.escrow_status,
    });

    // Write rejection event BEFORE Stripe call
    await writePaymentEvent(supabaseClient, {
      event_type: 'content_rejected',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: campaign.id,
      actor_id: user.id,
      actor_role: 'business',
      metadata: { reason },
    }, '[REFUND-CAMPAIGN-ESCROW]');

    // Update collaboration status to rejected
    const { error: updateCollabError } = await supabaseClient
      .from('campaign_collaborations')
      .update({
        content_status: 'rejected',
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', collaborationId);

    if (updateCollabError) {
      throw new Error(`Failed to update collaboration: ${updateCollabError.message}`);
    }

    // Find the PaymentIntent to refund
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    let refundResult: Stripe.Refund | null = null;

    const paymentIntentId = campaign.escrow_payment_intent_id;
    if (paymentIntentId) {
      let resolvedPiId = paymentIntentId;

      // Resolve Checkout Session ID to PaymentIntent ID if needed
      if (resolvedPiId.startsWith('cs_')) {
        const session = await stripe.checkout.sessions.retrieve(resolvedPiId);
        resolvedPiId = session.payment_intent as string;
      }

      if (resolvedPiId?.startsWith('pi_')) {
        refundResult = await stripe.refunds.create({
          payment_intent: resolvedPiId,
          reason: 'requested_by_customer',
          metadata: {
            campaign_id: campaign.id,
            collaboration_id: collaborationId,
            type: 'campaign_escrow',
            rejection_reason: reason.substring(0, 500),
          },
        });

        logStep("Refund created", { refundId: refundResult.id, amount: refundResult.amount });
      }
    }

    // Update campaign escrow status
    const { error: updateCampaignError } = await supabaseClient
      .from('campaigns')
      .update({ escrow_status: 'refunded' })
      .eq('id', campaign.id);

    if (updateCampaignError) {
      logStep("WARNING: Refund succeeded but campaign status update failed", {
        error: updateCampaignError.message,
      });
    }

    await writePaymentEvent(supabaseClient, {
      event_type: 'refund_initiated',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: campaign.id,
      actor_id: user.id,
      actor_role: 'business',
      amount_cents: refundResult?.amount,
      stripe_id: refundResult?.id,
      metadata: { reason },
    }, '[REFUND-CAMPAIGN-ESCROW]');

    // Notify the creator via message (using service_role client — intentional, caller is authenticated above)
    await supabaseClient
      .from('messages')
      .insert({
        sender_id: user.id,
        recipient_id: collaboration.creator_id,
        campaign_id: campaign.id,
        content: `❌ **Content Rejected**\n\nReason: ${reason}\n\nThe project has been cancelled and a refund has been initiated.`,
        category: 'content_rejection',
      });

    return new Response(JSON.stringify({
      success: true,
      refundId: refundResult?.id,
      message: 'Content rejected and refund initiated.',
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
