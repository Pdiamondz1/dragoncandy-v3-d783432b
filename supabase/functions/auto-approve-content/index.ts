import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[AUTO-APPROVE-CONTENT] ${step}${detailsStr}`);
};

// Auto-approval windows by delivery type
const AUTO_APPROVE_HOURS: Record<string, number> = {
  standard: 48,
  expedited: 24,
  dragonrush: 4,
};

// Extra hours granted when brand requests a review extension
const EXTENSION_HOURS: Record<string, number> = {
  standard: 24,
  expedited: 24,
  dragonrush: 2,
};

serve(async (req) => {
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`;
  if (req.headers.get("Authorization") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Scheduled check started");

    // Find all collaborations with content_status='submitted' and their delivery type
    const { data: overdue, error: fetchError } = await supabaseClient
      .from('campaign_collaborations')
      .select(`
        id, campaign_id, creator_id, content_status, submitted_at, review_extended,
        campaign:campaigns(id, user_id, delivery_type, escrow_status, fixed_price, budget_max, delivery_fee, pricing_type)
      `)
      .eq('content_status', 'submitted')
      .eq('status', 'active')
      .not('submitted_at', 'is', null)
      .not('content_status', 'in', '("approved","auto_approved","rejected","disputed")');

    if (fetchError) {
      logStep("ERROR fetching collaborations", { error: fetchError.message });
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
    }

    if (!overdue || overdue.length === 0) {
      logStep("No submitted content found");
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
    }

    const now = Date.now();
    let processed = 0;

    for (const collab of overdue) {
      const campaign = collab.campaign as any;
      if (!campaign) continue;

      if (campaign.escrow_status !== 'held') {
        logStep('Skipping — escrow not held', {
          collaborationId: collab.id,
          escrowStatus: campaign.escrow_status,
        });
        continue;
      }

      const deliveryType = campaign.delivery_type || 'standard';
      const baseHours = AUTO_APPROVE_HOURS[deliveryType] ?? AUTO_APPROVE_HOURS.standard;
      const extensionHours = collab.review_extended
        ? (EXTENSION_HOURS[deliveryType] ?? 24)
        : 0;
      const approveAfterHours = baseHours + extensionHours;

      const submittedAt = new Date(collab.submitted_at!).getTime();
      const hoursElapsed = (now - submittedAt) / (1000 * 60 * 60);

      if (hoursElapsed < approveAfterHours) continue;

      logStep("Auto-approving overdue content", {
        collaborationId: collab.id,
        deliveryType,
        hoursElapsed: Math.round(hoursElapsed),
        threshold: approveAfterHours,
      });

      // Re-check content_status before transitioning — a business may have approved/rejected between fetch and now
      const { data: freshCollab } = await supabaseClient
        .from('campaign_collaborations')
        .select('content_status, status')
        .eq('id', collab.id)
        .single();

      if (!freshCollab || freshCollab.content_status !== 'submitted' || freshCollab.status !== 'active') {
        logStep("Skipping — status changed since fetch", { collaborationId: collab.id, content_status: freshCollab?.content_status });
        continue;
      }

      // Transition via state machine before triggering payout
      const { error: transitionError } = await supabaseClient
        .rpc('transition_content_status', {
          p_collaboration_id: collab.id,
          p_new_status: 'auto_approved',
        });

      if (transitionError) {
        logStep("Transition failed", { collaborationId: collab.id, error: transitionError.message });
        continue;
      }

      // Guard: if a business manually approved between fetch and transition,
      // content_status will be 'approved' (not 'auto_approved'). Skip payout —
      // the manual approval path already handled it.
      const { data: postTransition } = await supabaseClient
        .from('campaign_collaborations')
        .select('content_status')
        .eq('id', collab.id)
        .single();

      if (postTransition?.content_status === 'approved') {
        logStep('Skipping payout — manually approved during transition', { collaborationId: collab.id });
        continue;
      }

      // Write auto-approval event
      await writePaymentEvent(supabaseClient, {
        event_type: 'content_auto_approved',
        entity_type: 'collaboration',
        entity_id: collab.id,
        campaign_id: campaign.id,
        actor_role: 'system',
        metadata: { auto_approved: true, hours_elapsed: Math.round(hoursElapsed), delivery_type: deliveryType },
      }, '[AUTO-APPROVE-CONTENT]');

      // Invoke release-creator-payout internally via fetch (service-role auth)
      try {
        const payoutResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/release-creator-payout`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ collaborationId: collab.id }),
          }
        );

        const payoutResult = await payoutResponse.json();
        if (payoutResult.error) {
          logStep("Payout failed for auto-approval", { collaborationId: collab.id, error: payoutResult.error });
        } else {
          logStep("Auto-approval payout succeeded", { collaborationId: collab.id });
          processed++;
        }
      } catch (payoutErr) {
        logStep("ERROR calling release-creator-payout", { collaborationId: collab.id, error: String(payoutErr) });
      }
    }

    logStep("Scheduled check complete", { total: overdue.length, processed });
    return new Response(JSON.stringify({ total: overdue.length, processed }), { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});
