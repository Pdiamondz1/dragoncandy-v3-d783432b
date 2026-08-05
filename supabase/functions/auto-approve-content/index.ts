import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";

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

// Buyer review window for PACKAGE orders before payment auto-releases. Protects the creator from a buyer who
// never returns to approve — without it, delivered work + held escrow would sit forever. Fixed + generous for
// v1 (packages have no delivery_type ladder); tune here if it proves too slow/fast.
const PACKAGE_AUTO_APPROVE_HOURS = 168; // 7 days

serve(async (req) => {
  // Accepts the injected service-role key OR AIOS_INGEST_SECRET (the sb_secret value
  // held in Vault as `aios_ingest_key`), so this can be driven by the same pg_cron +
  // net.http_post pattern as the rest of the scheduled fleet without a strict-key 401.
  if (!isAuthorizedIngest(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Scheduled check started");

    // Reconciliation sweep: heal collaborations where the payout already executed (money moved,
    // `payout_executed_at` set) but finalize didn't complete (`status != 'completed'`). release-creator-payout
    // is re-entrant — with the marker set it finalizes ONLY (no re-credit / re-transfer), so re-invoking it
    // is safe. Runs every tick regardless of whether there's submitted content to auto-approve. Non-blocking.
    try {
      // Only reconcile markers at least 5 min old, so we never contend with a still-in-flight
      // same-request finalize (the happy path sets the marker then finalizes within one invocation).
      // With the marker written only AFTER money moves, a match here means the money already moved and
      // only finalize is outstanding — the age guard is cheap belt-and-suspenders.
      const reconcileCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: stuckPayouts } = await supabaseClient
        .from('campaign_collaborations')
        .select('id')
        .not('payout_executed_at', 'is', null)
        .lt('payout_executed_at', reconcileCutoff)
        .neq('status', 'completed')
        .order('payout_executed_at', { ascending: true })
        .limit(50);

      if (stuckPayouts && stuckPayouts.length > 0) {
        logStep('Reconciling stuck payouts', { count: stuckPayouts.length });
        for (const row of stuckPayouts) {
          try {
            const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/release-creator-payout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ collaborationId: (row as { id: string }).id }),
            });
            const result = await resp.json();
            if (result.finalized || result.success) {
              logStep('Reconciled stuck payout', { collaborationId: (row as { id: string }).id });
            } else {
              logStep('Reconcile did not finalize (will retry next tick)', { collaborationId: (row as { id: string }).id, error: result.error });
            }
          } catch (reconErr) {
            logStep('Reconcile fetch failed', { collaborationId: (row as { id: string }).id, error: String(reconErr) });
          }
        }
      }
    } catch (sweepErr) {
      logStep('Reconciliation sweep failed (non-blocking)', { error: String(sweepErr) });
    }

    // Twin reconciliation sweep for the PACKAGE-ORDER money rail: heal orders whose payout already executed
    // (money moved, `payout_executed_at` set) but whose finalize didn't complete (`order_status != completed`).
    // release-package-payout is re-entrant — with the marker set it finalizes ONLY (no re-credit) — so
    // re-invoking is safe. Same 5-min age guard as the collaboration sweep. Non-blocking.
    // (The SLA-based auto-approval of submitted package content — deferred in v1a — now lives in the sweep
    // immediately below this one.)
    try {
      const pkgReconcileCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: stuckOrders } = await supabaseClient
        .from('package_orders')
        .select('id')
        .not('payout_executed_at', 'is', null)
        .lt('payout_executed_at', pkgReconcileCutoff)
        .neq('order_status', 'completed')
        .order('payout_executed_at', { ascending: true })
        .limit(50);

      if (stuckOrders && stuckOrders.length > 0) {
        logStep('Reconciling stuck package payouts', { count: stuckOrders.length });
        for (const row of stuckOrders) {
          try {
            const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/release-package-payout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ orderId: (row as { id: string }).id }),
            });
            const result = await resp.json();
            if (result.finalized || result.success) {
              logStep('Reconciled stuck package payout', { orderId: (row as { id: string }).id });
            } else {
              logStep('Package reconcile did not finalize (will retry next tick)', { orderId: (row as { id: string }).id, error: result.error });
            }
          } catch (reconErr) {
            logStep('Package reconcile fetch failed', { orderId: (row as { id: string }).id, error: String(reconErr) });
          }
        }
      }
    } catch (sweepErr) {
      logStep('Package reconciliation sweep failed (non-blocking)', { error: String(sweepErr) });
    }

    // SLA-based AUTO-APPROVAL for the PACKAGE-ORDER rail (the piece deferred in v1a). If a buyer never returns
    // to approve delivered work, release the creator's payment after the review window so escrowed funds are
    // never stranded. Packages have no delivery_type/extension — one fixed window keyed off content_submitted_at
    // (re-stamped on every (re)submission by submit_package_deliverables). Payout goes through
    // release-package-payout (service role), whose delivery gate + held→releasing CAS (now also predicated on
    // content_status) + credit-at-most-once marker mean a manual approve OR a just-requested revision racing
    // this can't double-pay or pay over a revision. Non-blocking.
    // Escrow filter is IN ('held','releasing'): 'held' is the normal claim path; 'releasing' RESUMES an order
    // whose payout CAS'd held→releasing then died before writing payout_executed_at (the neither-sweep-catches-it
    // gap — the reconcile sweep only handles rows WITH the marker). release-package-payout is re-entrant on a
    // 'releasing' row (finishes crediting), so re-invoking is safe; the 7-day window means we never contend with
    // a fresh in-flight claim.
    try {
      const pkgAutoApproveCutoff = new Date(Date.now() - PACKAGE_AUTO_APPROVE_HOURS * 60 * 60 * 1000).toISOString();
      const { data: overduePkgs, error: overduePkgErr } = await supabaseClient
        .from('package_orders')
        .select('id')
        .eq('content_status', 'submitted')
        .eq('order_status', 'submitted')
        .in('escrow_status', ['held', 'releasing'])
        .not('content_submitted_at', 'is', null)
        .lt('content_submitted_at', pkgAutoApproveCutoff)
        .order('content_submitted_at', { ascending: true })
        .limit(50);

      // Surface a query failure (e.g. the delivery migrations not yet applied → 42P01) instead of silently
      // no-opping every tick — a missing-migration deploy is otherwise near-invisible in the logs.
      if (overduePkgErr) {
        logStep('Package auto-approval query failed', { error: overduePkgErr.message });
      }

      if (overduePkgs && overduePkgs.length > 0) {
        logStep('Auto-approving overdue package orders', { count: overduePkgs.length });
        for (const row of overduePkgs) {
          const orderId = (row as { id: string }).id;
          try {
            const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/release-package-payout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ orderId }),
            });
            const result = await resp.json();
            if (result.error) {
              logStep('Package auto-approve payout failed (will retry next tick)', { orderId, error: result.error });
            } else {
              logStep('Auto-approved overdue package order', { orderId });
            }
          } catch (paErr) {
            logStep('Package auto-approve fetch failed', { orderId, error: String(paErr) });
          }
        }
      }
    } catch (sweepErr) {
      logStep('Package auto-approval sweep failed (non-blocking)', { error: String(sweepErr) });
    }

    // Find all collaborations with content_status='submitted' and their delivery type.
    // Time the review window off `content_submitted_at`, NOT `submitted_at`: the client
    // submit paths (SubmitForReviewButton / useProjectComplete) raw-update content_status
    // and never set `submitted_at` (only the transition_content_status RPC does, which the
    // client never calls) — but the `set_content_submitted_at` trigger reliably stamps
    // `content_submitted_at` on every entry to 'submitted' (incl. resubmits). Keying off
    // `submitted_at` meant this cron matched zero rows and auto-approval never fired.
    const { data: overdue, error: fetchError } = await supabaseClient
      .from('campaign_collaborations')
      .select(`
        id, campaign_id, creator_id, content_status, content_submitted_at, review_extended,
        campaign:campaigns(id, title, user_id, delivery_type, escrow_status, fixed_price, budget_max, delivery_fee, pricing_type)
      `)
      .eq('content_status', 'submitted')
      .eq('status', 'active')
      .not('content_submitted_at', 'is', null)
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

      const submittedAt = new Date(collab.content_submitted_at!).getTime();
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

          try {
            const { data: creatorProfile } = await supabaseClient
              .from('profiles')
              .select('email, full_name')
              .eq('id', collab.creator_id)
              .single();

            if (creatorProfile?.email) {
              const campaignTitle = campaign.title || 'your campaign';
              await fetch(
                `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({
                    to: creatorProfile.email,
                    recipientName: creatorProfile.full_name,
                    type: 'content_approved',
                    data: {
                      campaignId: campaign.id,
                      campaignTitle,
                    },
                  }),
                }
              );
              logStep("Content approval email sent", { collaborationId: collab.id });
            }
          } catch (emailErr) {
            logStep("Email notification failed (non-blocking)", { collaborationId: collab.id, error: String(emailErr) });
          }
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
