import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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

serve(async (_req) => {
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Scheduled check started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // Find all collaborations with content_status='submitted' and their delivery type
    const { data: overdue, error: fetchError } = await supabaseClient
      .from('campaign_collaborations')
      .select(`
        id, campaign_id, creator_id, content_status, updated_at,
        campaign:campaigns(id, user_id, delivery_type, escrow_status, fixed_price, budget_max, delivery_fee, pricing_type)
      `)
      .eq('content_status', 'submitted')
      .eq('status', 'active');

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

      const deliveryType = campaign.delivery_type || 'standard';
      const approveAfterHours = AUTO_APPROVE_HOURS[deliveryType] ?? AUTO_APPROVE_HOURS.standard;
      const submittedAt = new Date(collab.updated_at).getTime();
      const hoursElapsed = (now - submittedAt) / (1000 * 60 * 60);

      if (hoursElapsed < approveAfterHours) continue;

      logStep("Auto-approving overdue content", {
        collaborationId: collab.id,
        deliveryType,
        hoursElapsed: Math.round(hoursElapsed),
        threshold: approveAfterHours,
      });

      // Write auto-approval event
      await writePaymentEvent(supabaseClient, {
        event_type: 'content_approved',
        entity_type: 'collaboration',
        entity_id: collab.id,
        campaign_id: campaign.id,
        actor_role: 'system',
        metadata: { auto_approved: true, hours_elapsed: Math.round(hoursElapsed) },
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
