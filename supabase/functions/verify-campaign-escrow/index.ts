import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-CAMPAIGN-ESCROW] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
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
      .select('id, user_id, escrow_payment_intent_id, escrow_status, status, title, fixed_price, budget_max, pricing_type, delivery_fee, delivery_type, ai_analysis')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) throw new Error("Campaign not found");
    if (campaign.user_id !== user.id) throw new Error("You are not authorized to verify this campaign");

    logStep("Campaign found", { escrowStatus: campaign.escrow_status });

    if (campaign.escrow_status === 'held' || campaign.escrow_status === 'released') {
      // Ensure collaboration exists even if a prior call set escrow_status but failed before creating it
      const { data: acceptedAppForRecovery } = await supabaseClient
        .from('campaign_applications')
        .select('id, creator_id')
        .eq('campaign_id', campaignId)
        .eq('status', 'accepted')
        .limit(1)
        .maybeSingle();

      if (acceptedAppForRecovery) {
        const { data: existingCollabCheck } = await supabaseClient
          .from('campaign_collaborations')
          .select('id')
          .eq('campaign_id', campaignId)
          .eq('creator_id', acceptedAppForRecovery.creator_id)
          .maybeSingle();

        if (!existingCollabCheck) {
          logStep("Recovery: creating missing collaboration", { creatorId: acceptedAppForRecovery.creator_id });
          await supabaseClient
            .from('campaign_collaborations')
            .insert({
              campaign_id: campaignId,
              creator_id: acceptedAppForRecovery.creator_id,
              application_id: acceptedAppForRecovery.id,
              status: 'active',
            });
          await supabaseClient
            .from('campaigns')
            .update({ status: 'active' })
            .eq('id', campaignId)
            .in('status', ['published', 'draft']);
        }
      }

      return new Response(JSON.stringify({ success: true, message: "Escrow already verified", status: campaign.escrow_status }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    let paymentSucceeded = false;
    let actualPaymentIntentId: string | null = null;
    let chargedAmountCents: number | null = null;
    // The checkout session that actually PROVED this campaign was paid — not merely the one
    // the caller sent. These diverge now that an unbound session is rejected: the request can
    // carry session X (refused) while Priority 2 or 3 finds the real payment. Persisting the
    // caller's id in that case would overwrite the campaign's authoritative reference with one
    // we just declined to trust, poisoning later reconciliation and refunds. Only ever set
    // where a session is accepted.
    let verifiedSessionId: string | null = null;

    // Priority 1: sessionId from the request.
    //
    // `sessionId` is caller-supplied and, until this binding existed, the ONLY test was
    // `payment_status === 'paid'` — the session was never tied to THIS campaign. Campaign
    // ownership is checked above, so the caller owns the campaign; what they did not have to
    // own was the payment. A business could pay once for something cheap (their own $5
    // campaign, or a package order — the session id is handed to them in their own success
    // URL) and then POST that same `sessionId` against an expensive campaign. It would flip to
    // `escrow_status='held'`, publish→active, create the collaboration, and overwrite
    // `escrow_payment_intent_id` with the unrelated payment — so a later refund would refund
    // the wrong charge, and the platform would pay the creator out of its own balance for a
    // campaign nobody funded. One paid session, unlimited campaigns.
    //
    // `create-campaign-escrow` already stamps `metadata.campaign_id` + `metadata.type` on the
    // session, so the binding was available all along and simply never consulted. Priority 3
    // below was already correctly scoped by `metadata['campaign_id']` — this makes Priority 1
    // agree with it.
    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const sessionCampaignId = session.metadata?.campaign_id;
        const sessionType = session.metadata?.type;
        const boundToThisCampaign =
          sessionCampaignId === campaignId && sessionType === 'campaign_escrow';

        if (session.payment_status === 'paid' && boundToThisCampaign) {
          paymentSucceeded = true;
          actualPaymentIntentId = session.payment_intent as string;
          chargedAmountCents = session.amount_total ?? null;
          verifiedSessionId = sessionId;
        } else if (session.payment_status === 'paid') {
          // Paid, but for something else. Do NOT accept it — and say so loudly, because the
          // only way to reach here is to present a session that isn't this campaign's.
          logStep("REJECTED session: paid but not bound to this campaign", {
            campaignId,
            sessionCampaignId: sessionCampaignId ?? null,
            sessionType: sessionType ?? null,
            userId: user.id,
          });
        }
      } catch (e) {
        logStep("Session retrieval failed", { error: String(e) });
      }
    }

    // Priority 2: stored escrow_payment_intent_id
    //
    // This path needs the SAME campaign binding Priority 1 just gained, and for a reason that
    // is easy to miss: `campaigns.escrow_payment_intent_id` is written by the campaign owner's
    // own UPDATE (the policy is row-level, with no column GRANTs pinning escrow_* — the
    // `campaign_invitations` 20260808010000 lesson, not yet applied to this table). So the
    // stored id is CALLER-INFLUENCED, not a server-established fact.
    //
    // Without this check, closing Priority 1 would have moved the hole rather than shut it:
    // write a known-paid `cs_`/`pi_` id — another campaign's, or a package order's — into the
    // column, then verify, and an unfunded campaign flips to `held`. Binding here makes the
    // stored id merely a *hint* about where to look, never the authority for whether this
    // campaign was paid.
    if (!paymentSucceeded && campaign.escrow_payment_intent_id) {
      const storedId = campaign.escrow_payment_intent_id;
      if (storedId.startsWith('cs_')) {
        try {
          const session = await stripe.checkout.sessions.retrieve(storedId);
          const bound =
            session.metadata?.campaign_id === campaignId &&
            session.metadata?.type === 'campaign_escrow';
          if (session.payment_status === 'paid' && bound) {
            paymentSucceeded = true;
            actualPaymentIntentId = session.payment_intent as string;
            chargedAmountCents = session.amount_total ?? null;
            verifiedSessionId = storedId;
          } else if (session.payment_status === 'paid') {
            logStep("REJECTED stored session: paid but not bound to this campaign", {
              campaignId,
              sessionCampaignId: session.metadata?.campaign_id ?? null,
              sessionType: session.metadata?.type ?? null,
              userId: user.id,
            });
          }
        } catch (e) { /* skip */ }
      } else if (storedId.startsWith('pi_')) {
        try {
          const pi = await stripe.paymentIntents.retrieve(storedId);
          // The PI carries the same metadata (Priority 3 already searches on it), so the same
          // binding applies. `create-campaign-escrow` stamps it at session creation.
          const bound = pi.metadata?.campaign_id === campaignId;
          if (pi.status === 'succeeded' && bound) {
            paymentSucceeded = true;
            actualPaymentIntentId = storedId;
            chargedAmountCents = pi.amount ?? null;
          } else if (pi.status === 'succeeded') {
            logStep("REJECTED stored payment intent: succeeded but not bound to this campaign", {
              campaignId,
              piCampaignId: pi.metadata?.campaign_id ?? null,
              userId: user.id,
            });
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
          chargedAmountCents = pis.data[0].amount ?? null;
        }
      } catch (e) {
        logStep("Stripe search failed", { error: String(e) });
      }
    }

    if (!paymentSucceeded) {
      return new Response(JSON.stringify({ success: false, message: "Payment not yet completed.", status: 'pending' }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Payment succeeded! Update campaign
    const updateFields: Record<string, unknown> = {
      escrow_status: 'held',
      status: 'published',
      escrow_payment_intent_id: actualPaymentIntentId,
    };
    // `verifiedSessionId`, NOT the request's `sessionId`. Before rejection existed these were
    // always the same value, so writing the caller's was harmless; now a request can carry a
    // session we refused while the real payment is found by Priority 2 or 3, and writing the
    // refused id would replace a good reference with a bad one. Left null when no session
    // proved the payment (the PI-only paths), so the column is never overwritten with a guess.
    if (verifiedSessionId) {
      updateFields.escrow_checkout_session_id = verifiedSessionId;
    }
    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update(updateFields)
      .eq('id', campaignId);

    if (updateError) throw new Error("Failed to update campaign status");

    await writePaymentEvent(supabaseClient, {
      event_type: 'escrow_held',
      entity_type: 'collaboration',
      entity_id: campaignId,
      campaign_id: campaignId,
      actor_id: user.id,
      actor_role: 'business',
      amount_cents: chargedAmountCents ?? undefined,
      stripe_id: actualPaymentIntentId,
    }, '[VERIFY-CAMPAIGN-ESCROW]');

    // Creator count validation (prevent over-hiring)
    const ai = campaign.ai_analysis as Record<string, unknown> | null;
    const creatorCount = (ai?.creator_count as number) ?? null;
    if (creatorCount) {
      const { count } = await supabaseClient
        .from('campaign_collaborations')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'active');

      if ((count || 0) >= creatorCount) {
        logStep("Creator count full", { current: count, max: creatorCount });
        if (actualPaymentIntentId) {
          await stripe.refunds.create({ payment_intent: actualPaymentIntentId });
        }
        await supabaseClient.from('campaigns').update({ escrow_status: 'pending' }).eq('id', campaignId);
        return new Response(
          JSON.stringify({ error: `Campaign already has ${creatorCount} active creators` }),
          { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    // Create collaboration from accepted application
    const { data: acceptedApp } = await supabaseClient
      .from('campaign_applications')
      .select('id, creator_id, campaign_id, agreed_rate, proposed_rate')
      .eq('campaign_id', campaignId)
      .eq('status', 'accepted')
      .limit(1)
      .maybeSingle();

    const settledRate = acceptedApp?.agreed_rate ?? acceptedApp?.proposed_rate ?? 0;

    if (acceptedApp) {
      const { data: existingCollab } = await supabaseClient
        .from('campaign_collaborations')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('creator_id', acceptedApp.creator_id)
        .maybeSingle();

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

          await supabaseClient.from('campaigns').update({ status: 'active' }).eq('id', campaignId);

          if (settledRate > 0) {
            await supabaseClient.rpc('increment_budget_spent', {
              p_campaign_id: campaignId,
              p_amount: settledRate,
            });
            logStep("Budget incremented", { amount: settledRate });
          }
        }
      } else {
        logStep("Collaboration already exists");
      }
    } else {
      logStep("No accepted application found for collaboration creation");
    }

    logStep("Campaign escrow verified", { campaignId, paymentIntentId: actualPaymentIntentId });

    return new Response(JSON.stringify({ success: true, message: "Payment verified! Campaign is now active.", status: 'held' }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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
