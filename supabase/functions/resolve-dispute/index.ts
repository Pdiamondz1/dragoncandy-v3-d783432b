// supabase/functions/resolve-dispute/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { calculatePlatformFee } from "../_shared/platform-fee.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

function logStep(step: string, details?: Record<string, unknown>) {
  console.log(`[RESOLVE-DISPUTE] ${step}`, details ? JSON.stringify(details) : "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Admin-only: verify service_role or admin user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!isServiceRole) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const { disputeId, outcome, notes, splitPercentage } = await req.json();
    if (!disputeId || !outcome) {
      return new Response(
        JSON.stringify({ error: "disputeId and outcome required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!['refund', 'partial_payment', 'approved'].includes(outcome)) {
      return new Response(
        JSON.stringify({ error: "outcome must be refund, partial_payment, or approved" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Resolving dispute", { disputeId, outcome });

    // Fetch dispute + collaboration + campaign
    const { data: dispute } = await supabaseClient
      .from('content_disputes')
      .select('id, collaboration_id, status')
      .eq('id', disputeId)
      .eq('status', 'open')
      .single();

    if (!dispute) {
      return new Response(
        JSON.stringify({ error: "Open dispute not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const { data: collab } = await supabaseClient
      .from('campaign_collaborations')
      .select('id, campaign_id, creator_id, campaigns!inner(user_id, escrow_payment_intent_id, fixed_price, budget_max, pricing_type, delivery_fee)')
      .eq('id', dispute.collaboration_id)
      .single();

    if (!collab) {
      return new Response(
        JSON.stringify({ error: "Collaboration not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const campaign = (collab as any).campaigns;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Resolve payment intent ID
    let paymentIntentId = campaign.escrow_payment_intent_id;
    if (paymentIntentId?.startsWith('cs_')) {
      const session = await stripe.checkout.sessions.retrieve(paymentIntentId);
      paymentIntentId = session.payment_intent as string;
    }

    // Calculate amounts
    const baseAmount = campaign.pricing_type === 'fixed' ? campaign.fixed_price : campaign.budget_max;
    const totalAmount = (baseAmount || 0) + (campaign.delivery_fee || 0);
    const totalAmountCents = Math.round(totalAmount * 100);

    // Execute outcome
    if (outcome === 'refund') {
      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: totalAmountCents,
      });

      await supabaseClient.rpc('decrement_budget_spent', {
        p_campaign_id: collab.campaign_id,
        p_amount: baseAmount || 0,
      });

      logStep("Full refund issued", { amount: totalAmountCents });
    } else if (outcome === 'partial_payment') {
      const creatorSplit = splitPercentage ? splitPercentage / 100 : 0.5;
      const creatorAmountCents = Math.round(totalAmountCents * creatorSplit);
      const refundAmountCents = totalAmountCents - creatorAmountCents;

      // Refund restaurant's portion
      if (refundAmountCents > 0) {
        await stripe.refunds.create({
          payment_intent: paymentIntentId,
          amount: refundAmountCents,
        });
      }

      // Pay creator's portion (minus platform fee)
      const creatorAmount = creatorAmountCents / 100;
      const { netPayoutDollars } = calculatePlatformFee(creatorAmount);

      const { data: creatorProfile } = await supabaseClient
        .from('creator_profiles')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('user_id', collab.creator_id)
        .single();

      if (creatorProfile?.stripe_account_id && creatorProfile?.stripe_onboarding_complete) {
        await stripe.transfers.create({
          amount: Math.round(netPayoutDollars * 100),
          currency: 'usd',
          destination: creatorProfile.stripe_account_id,
          metadata: { dispute_id: disputeId, type: 'dispute_partial_payment' },
        }, { idempotencyKey: `dispute_partial_${disputeId}` });
      } else {
        await supabaseClient.rpc('increment_pending_balance', {
          p_user_id: collab.creator_id,
          p_amount: netPayoutDollars,
          p_profile_type: 'creator',
        });
      }

      logStep("Partial payment", { creatorSplit, creatorAmountCents, refundAmountCents });
    } else if (outcome === 'approved') {
      // Approve content and release full payout
      const payoutResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/release-creator-payout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ collaborationId: dispute.collaboration_id }),
        }
      );
      logStep("Payout via release-creator-payout", { status: payoutResponse.status });
    }

    // Transition content_status to resolved
    await supabaseClient.rpc('transition_content_status', {
      p_collaboration_id: dispute.collaboration_id,
      p_new_status: 'resolved',
    });

    // Store dispute outcome on collaboration
    await supabaseClient
      .from('campaign_collaborations')
      .update({ dispute_outcome: outcome })
      .eq('id', dispute.collaboration_id);

    // Resolve the dispute record
    await supabaseClient
      .from('content_disputes')
      .update({
        status: 'resolved',
        outcome,
        resolved_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq('id', disputeId);

    // Write payment event
    await writePaymentEvent(supabaseClient, {
      event_type: 'dispute_resolved',
      entity_type: 'collaboration',
      entity_id: dispute.collaboration_id,
      campaign_id: collab.campaign_id,
      actor_role: 'system',
      metadata: { dispute_id: disputeId, outcome, notes },
    }, '[RESOLVE-DISPUTE]');

    logStep("Dispute resolved", { outcome });

    return new Response(
      JSON.stringify({ success: true, outcome }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    logStep("Error", { message: (error as Error).message });
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
