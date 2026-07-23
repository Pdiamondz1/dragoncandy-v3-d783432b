import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { calculatePlatformFee, getOrgTakeRate } from "../_shared/platform-fee.ts";
import { resolvePayoutAmount } from "../_shared/pricing-utils.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyPayoutReady } from "../_shared/payout-ready.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RELEASE-CREATOR-PAYOUT] ${step}${detailsStr}`);
};

// Auto Cross-Scheduling: generate posting schedule if campaign preferences enable it.
// This is non-blocking — any failure is caught and logged without affecting the payout response.
async function generateAutoSchedule(
  supabaseClient: ReturnType<typeof createClient>,
  campaign: Record<string, unknown>,
  collaborationCreatorId: string,
): Promise<void> {
  const postingPrefs = campaign.posting_preferences as Record<string, unknown> | null | undefined;
  if (!postingPrefs?.auto_schedule_on_approval) return;

  const { data: deliverables } = await supabaseClient
    .from('file_uploads')
    .select('id, file_path, mime_type, original_filename, metadata')
    .eq('campaign_id', campaign.id)
    .eq('uploaded_by', collaborationCreatorId)
    .eq('file_category', 'deliverable')
    .eq('upload_status', 'completed');

  if (!deliverables || deliverables.length === 0) return;

  const { data: accounts } = await supabaseClient
    .from('business_outstand_accounts')
    .select('platform, platform_handle')
    .eq('user_id', campaign.user_id);

  const connectedPlatforms = (accounts ?? []).map((a: Record<string, unknown>) => ({
    platform: a.platform,
    platform_handle: a.platform_handle,
  }));

  if (connectedPlatforms.length === 0) return;

  const deliverableInputs = await Promise.all(
    deliverables.map(async (d: Record<string, unknown>) => {
      const { data: signedUrl } = await supabaseClient.storage
        .from('campaign-deliverables')
        .createSignedUrl(d.file_path as string, 3600);
      return {
        url: signedUrl?.signedUrl ?? '',
        mime_type: d.mime_type,
        filename: d.original_filename,
        deliverable_id: (d.metadata as Record<string, unknown>)?.deliverable_id as string ?? d.id,
      };
    }),
  );

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  const planResponse = await fetch(`${supabaseUrl}/functions/v1/content-posting-plan`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deliverables: deliverableInputs,
      posting_preferences: postingPrefs,
      connected_platforms: connectedPlatforms,
      campaign: { id: campaign.id, title: campaign.title },
      user_id: campaign.user_id,
    }),
  });

  if (!planResponse.ok) {
    const errText = await planResponse.text();
    logStep('Auto-schedule plan generation failed', { status: planResponse.status, error: errText.slice(0, 200) });
    return;
  }

  const planData = await planResponse.json();
  const planGroupId = crypto.randomUUID();

  const draftRows = (planData.posts ?? []).map((post: Record<string, unknown>, i: number) => ({
    id: crypto.randomUUID(),
    user_id: campaign.user_id,
    campaign_id: campaign.id,
    platform: post.platform,
    content_type: post.content_type,
    caption: post.caption,
    media_urls: post.media_urls,
    hashtags: post.hashtags,
    scheduled_at: post.scheduled_at,
    status: 'draft',
    ai_suggested_time: true,
    ai_reasoning: post.ai_reasoning,
    metadata: { source: 'auto_cross_schedule', strategy_summary: planData.strategy_summary },
    plan_group_id: planGroupId,
    plan_order: i,
    deliverable_id: post.deliverable_id ?? null,
  }));

  if (draftRows.length > 0) {
    await supabaseClient.from('donny_scheduled_posts').insert(draftRows);
    await supabaseClient
      .from('campaigns')
      .update({ posting_schedule_status: 'pending_review' })
      .eq('id', campaign.id);
    logStep('Auto-schedule generated', { postCount: draftRows.length, planGroupId });
  }
}

// Finalize the collaboration + campaign state after money has moved. Retried so a transient DB blip
// doesn't leave the payout half-applied (money moved, state not finalized). Returns true only if BOTH
// updates succeed; re-running just re-sets the same terminal values (idempotent).
async function finalizePayoutState(
  supabaseClient: ReturnType<typeof createClient>,
  collaborationId: string,
  campaignId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    // Attempt BOTH terminal updates each try. Re-entry is now guarded by the durable payout marker
    // (`payout_executed_at` / `stripe_transfer_id`, set the instant money moves) — NOT by this escrow
    // flip: a re-invocation short-circuits to finalize-only via the early re-entry guard in the handler.
    // Moving escrow to 'released' is just the terminal business state. Retrying re-sets the same terminal
    // values (idempotent).
    const { error: collabErr } = await supabaseClient
      .from('campaign_collaborations')
      .update({ status: 'completed', completed_at: new Date().toISOString(), content_status: 'approved' })
      .eq('id', collaborationId);

    const { error: campaignErr } = await supabaseClient
      .from('campaigns')
      .update({ escrow_status: 'released' })
      .eq('id', campaignId);

    if (!collabErr && !campaignErr) return true;

    logStep('Finalize attempt failed', {
      attempt,
      collaboration: collabErr?.message,
      campaign: campaignErr?.message,
    });
    if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  return false;
}

// Set the durable "paid" marker for the transfer path the instant the Stripe transfer confirms, BEFORE
// finalize. `.is('payout_executed_at', null)` makes it set-once: a concurrent winner (the SAME idempotent
// transfer) that already marked is not overwritten, and a match-of-0-rows (already marked) is treated as
// success. Retried so a transient blip doesn't force a needless client retry. Returns true once the
// marker is durably set.
async function markTransferExecuted(
  supabaseClient: ReturnType<typeof createClient>,
  collaborationId: string,
  transferId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { error } = await supabaseClient
      .from('campaign_collaborations')
      .update({ payout_executed_at: new Date().toISOString(), stripe_transfer_id: transferId })
      .eq('id', collaborationId)
      .is('payout_executed_at', null);
    if (!error) return true;
    logStep('Marker write attempt failed', { attempt, error: error.message });
    if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  return false;
}

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

    // Allow service-role calls (from auto-approve-content cron)
    const token = authHeader!.replace("Bearer ", "");
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let callerId: string | null = null;
    if (isServiceRole) {
      logStep("Service-role call (auto-approve)");
    } else {
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      if (userError) throw new Error(`Authentication error: ${userError.message}`);
      const user = userData.user;
      if (!user) throw new Error("User not authenticated");
      callerId = user.id;
      logStep("User authenticated", { userId: user.id });
    }

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

    // Verify the user is the campaign owner (skip for service-role auto-approve)
    if (callerId && collaboration.campaign.user_id !== callerId) {
      throw new Error("Only the campaign owner can release payments");
    }

    logStep("Collaboration found", {
      campaignId: collaboration.campaign_id,
      creatorId: collaboration.creator_id,
      status: collaboration.status,
    });

    // ── Durable re-entry guard ──────────────────────────────────────────────────────────────────────
    // If the payout already executed for this collaboration, NEVER move money again — only (re)run the
    // finalize state updates. The marker (`payout_executed_at` / `stripe_transfer_id`) is written AFTER
    // the Stripe transfer confirms, or ATOMICALLY with the pending-balance credit, so "marker set ⇒ money
    // moved" holds by construction. This handles sequential client retries AND the auto-approve-content
    // reconciliation sweep, and it runs BEFORE the escrow gate so a reconciliation call (escrow already
    // 'released') finalizes instead of throwing.
    if (collaboration.payout_executed_at || collaboration.stripe_transfer_id) {
      logStep("Payout already executed — finalize-only re-entry", {
        collaborationId,
        payoutExecutedAt: collaboration.payout_executed_at,
        transferId: collaboration.stripe_transfer_id,
      });
      const finalized = await finalizePayoutState(supabaseClient, collaborationId, collaboration.campaign_id);
      return new Response(JSON.stringify({
        success: finalized,
        finalized,
        alreadyPaid: true,
        ...(finalized ? {} : { needsRetry: true }),
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: finalized ? 200 : 500,
      });
    }

    // Get creator's Stripe account
    const { data: creatorProfile } = await supabaseClient
      .from('creator_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
      .eq('user_id', collaboration.creator_id)
      .maybeSingle();

    const campaign = collaboration.campaign;

    // Escrow must be held (or releasing for idempotent retries) before releasing payout
    if (campaign.escrow_status !== 'held' && campaign.escrow_status !== 'releasing') {
      throw new Error(`Cannot release payout: escrow status is '${campaign.escrow_status}', expected 'held' or 'releasing'`);
    }

    // Resolve pricing from negotiated agreement (counter-offer → application → campaign)
    const pricing = await resolvePayoutAmount(supabaseClient, campaign.id);
    if (!pricing) {
      throw new Error('Cannot determine payout amount: no pricing found for campaign');
    }
    logStep("Pricing resolved", { amount: pricing.amount, source: pricing.source });

    const deliveryFee = Number(campaign.delivery_fee) || 0;
    const payoutAmount = pricing.amount + deliveryFee;

    const takeRate = await getOrgTakeRate(supabaseClient, collaboration.campaign.user_id);
    const { feeDollars: platformFee, netPayoutDollars: creatorPayout } = calculatePlatformFee(payoutAmount, takeRate);

    logStep("Payout calculation", {
      baseAmount: payoutAmount - deliveryFee,
      deliveryFee,
      payoutAmount,
      takeRate,
      platformFee,
      creatorPayout,
    });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if creator can receive payouts — "trust true, verify false" so a stale
    // cached flag doesn't wrongly hold the payout in the wallet.
    const { ready: creatorPayoutReady, corrected: creatorFlagWasStale } = await verifyPayoutReady(
      stripe, creatorProfile?.stripe_account_id, creatorProfile?.stripe_onboarding_complete,
    );
    if (creatorFlagWasStale) {
      await supabaseClient.from('creator_profiles')
        .update({ stripe_onboarding_complete: true })
        .eq('user_id', collaboration.creator_id);
    }
    if (creatorPayoutReady) {
      // Cross-path race guard: a concurrent PENDING-path invocation for the same collaboration can credit
      // the wallet + set the marker (atomically, under its FOR UPDATE lock) between our initial read and
      // here. Re-check right before moving money on the transfer path; if it's already claimed, do NOT
      // also transfer — finalize-only. This NARROWS (does not fully eliminate — the residual is the
      // in-flight transfer window) the transfer-vs-pending double-pay, and stays crash-safe: we never set
      // the marker before the transfer, so this can't mark-paid-without-paying. Fully closing it needs the
      // wallet-first-then-idempotent-flush redesign. See docs/wiki/concepts/payout-finalization-consistency.md.
      {
        const { data: recheck } = await supabaseClient
          .from('campaign_collaborations')
          .select('payout_executed_at, stripe_transfer_id')
          .eq('id', collaborationId)
          .single();
        if (recheck?.payout_executed_at || recheck?.stripe_transfer_id) {
          logStep('Payout claimed by a concurrent invocation — finalize-only', { collaborationId });
          const finalized = await finalizePayoutState(supabaseClient, collaborationId, campaign.id);
          return new Response(JSON.stringify({
            success: finalized,
            finalized,
            alreadyPaid: true,
            ...(finalized ? {} : { needsRetry: true }),
          }), {
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
            status: finalized ? 200 : 500,
          });
        }
      }

      // Ledger: record intent BEFORE moving money
      try {
        await writePaymentEvent(supabaseClient, {
          event_type: 'content_approved',
          entity_type: 'collaboration',
          entity_id: collaborationId,
          campaign_id: campaign.id,
          actor_id: callerId ?? undefined,
          actor_role: 'business',
        }, '[RELEASE-CREATOR-PAYOUT]');
      } catch (auditErr) {
        console.error('Payment event logging failed (non-blocking):', auditErr);
      }

      try {
        await writePaymentEvent(supabaseClient, {
          event_type: 'payment_release_initiated',
          entity_type: 'collaboration',
          entity_id: collaborationId,
          campaign_id: campaign.id,
          actor_role: 'system',
          amount_cents: Math.round(creatorPayout * 100),
          metadata: { destination: creatorProfile.stripe_account_id },
        }, '[RELEASE-CREATOR-PAYOUT]');
      } catch (auditErr) {
        console.error('Payment event logging failed (non-blocking):', auditErr);
      }

      // Phase 1: Mark escrow as releasing (before moving money)
      if (campaign.escrow_status === 'held') {
        const { error: preCommitError } = await supabaseClient
          .from('campaigns')
          .update({ escrow_status: 'releasing' })
          .eq('id', campaign.id)
          .eq('escrow_status', 'held');

        if (preCommitError) {
          throw new Error(`Failed to set releasing state: ${preCommitError.message}`);
        }
      }

      // Phase 2: Transfer funds to creator's connected account.
      // Idempotency key prevents duplicate transfers on retry.
      let transfer;
      try {
        transfer = await stripe.transfers.create({
          amount: Math.round(creatorPayout * 100),
          currency: 'usd',
          destination: creatorProfile.stripe_account_id,
          metadata: {
            collaboration_id: collaborationId,
            campaign_id: campaign.id,
            platform_fee: platformFee.toString(),
          },
        }, { idempotencyKey: `payout_${collaborationId}` });
      } catch (stripeErr) {
        // Rollback: revert escrow to held
        await supabaseClient
          .from('campaigns')
          .update({ escrow_status: 'held' })
          .eq('id', campaign.id);
        throw stripeErr;
      }

      logStep("Transfer created", { transferId: transfer.id, amount: creatorPayout });

      // Durable "paid" marker — set the INSTANT the transfer confirms, before anything else. Every later
      // invocation now gates on this (re-entry guard above) and never re-transfers. If we cannot persist
      // it, surface for retry: the Stripe idempotency key (`payout_${collaborationId}`) still de-dupes a
      // retry within ~24h (returns the SAME transfer — no double-pay). Do NOT revert escrow: money moved.
      const marked = await markTransferExecuted(supabaseClient, collaborationId, transfer.id);
      if (!marked) {
        // Money MOVED but we could not persist the durable marker (DB write failing). We must NOT invite a
        // retry here: with no marker AND escrow still 'releasing' (retryable), a later retry — past Stripe's
        // ~24h idempotency-key retention — would re-enter past the guard and create a SECOND transfer
        // (double-pay). Unlike the finalize-failure path below (where the marker IS persisted, so retry is
        // safely finalize-only), this is a MANUAL / Stripe-verified reconciliation case: a human (or a
        // Stripe-list-vs-DB job) must confirm the transfer before re-driving. This rare Stripe-up/DB-down
        // split-brain is invisible to the auto reconciliation sweep (no marker to key on); fully
        // self-healing it needs the Stripe-query guard. See payout-finalization-consistency.md.
        console.error('CRITICAL: transfer succeeded but durable marker write failed after retries — MANUAL RECONCILIATION NEEDED (money moved; marker + escrow unrecorded). NOT inviting a retry: a >24h retry with no marker could double-pay.', {
          collaborationId, transferId: transfer.id,
        });
        return new Response(JSON.stringify({ success: false, manualReconciliation: true, error: 'payout_marker_write_failed' }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 500,
        });
      }

      try {
        await writePaymentEvent(supabaseClient, {
          event_type: 'payment_released',
          entity_type: 'collaboration',
          entity_id: collaborationId,
          campaign_id: campaign.id,
          actor_id: collaboration.creator_id,
          actor_role: 'creator',
          amount_cents: Math.round(creatorPayout * 100),
          stripe_id: transfer.id,
        }, '[RELEASE-CREATOR-PAYOUT]');
      } catch (auditErr) {
        console.error('Payment event logging failed (non-blocking):', auditErr);
      }

      try {
        await writePaymentEvent(supabaseClient, {
          event_type: 'transfer_created',
          entity_type: 'collaboration',
          entity_id: collaborationId,
          campaign_id: campaign.id,
          actor_role: 'system',
          amount_cents: Math.round(creatorPayout * 100),
          stripe_id: transfer.id,
          metadata: { destination: creatorProfile.stripe_account_id },
        }, '[RELEASE-CREATOR-PAYOUT]');
      } catch (auditErr) {
        console.error('Payment event logging failed (non-blocking):', auditErr);
      }

      // Phase 3: Finalize DB state (retried). The durable marker is set (money moved + recorded), so a
      // re-invocation is finalize-only — we can now SAFELY surface a persistent finalize failure for
      // retry (500 {needsRetry}) instead of #328's fire-and-forget 200. The auto-approve-content
      // reconciliation sweep also re-drives finalize for any marked-but-unfinalized row.
      const finalized = await finalizePayoutState(supabaseClient, collaborationId, campaign.id);
      if (!finalized) {
        console.error('Transfer + marker done but finalize failed after retries — surfacing for retry (re-entry is finalize-only; reconciliation will also heal).', {
          collaborationId, transferId: transfer.id,
        });
        return new Response(JSON.stringify({ success: false, needsRetry: true, transferId: transfer.id, error: 'finalize_failed' }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 500,
        });
      }

      // Auto Cross-Scheduling: generate posting schedule if preferences exist (non-blocking)
      try {
        await generateAutoSchedule(supabaseClient, campaign, collaboration.creator_id);
      } catch (scheduleError) {
        logStep('Auto-schedule generation failed (non-blocking)', { error: scheduleError instanceof Error ? scheduleError.message : String(scheduleError) });
      }

      return new Response(JSON.stringify({
        success: true,
        transferId: transfer.id,
        amount: creatorPayout,
        method: 'stripe_transfer',
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      // Creator hasn't completed onboarding — credit the pending wallet ATOMICALLY with the durable
      // marker via one SECURITY DEFINER RPC. Row-locked inside the RPC, so concurrent invocations cannot
      // double-credit the (non-idempotent) wallet: exactly one credits + marks, the rest return 'already'.
      // On error the RPC's transaction rolls back entirely (no partial credit, no marker) — safe to retry.
      const { data: creditResult, error: creditError } = await supabaseClient.rpc('credit_pending_balance_for_payout', {
        p_collaboration_id: collaborationId,
        p_user_id: collaboration.creator_id,
        p_amount: creatorPayout,
      });
      if (creditError) {
        throw new Error(`Failed to credit pending balance: ${creditError.message}`);
      }
      const alreadyCredited = creditResult === 'already';

      logStep(alreadyCredited ? "Pending balance already credited (re-entry)" : "Added to pending balance", {
        added: alreadyCredited ? 0 : creatorPayout,
      });

      // Ledger events only when we actually credited this time (skip on a concurrent-race 'already').
      if (!alreadyCredited) {
        try {
          await writePaymentEvent(supabaseClient, {
            event_type: 'content_approved',
            entity_type: 'collaboration',
            entity_id: collaborationId,
            campaign_id: campaign.id,
            actor_id: callerId ?? undefined,
            actor_role: 'business',
          }, '[RELEASE-CREATOR-PAYOUT]');
        } catch (auditErr) {
          console.error('Payment event logging failed (non-blocking):', auditErr);
        }

        try {
          await writePaymentEvent(supabaseClient, {
            event_type: 'payout_pending_wallet',
            entity_type: 'collaboration',
            entity_id: collaborationId,
            campaign_id: campaign.id,
            actor_id: collaboration.creator_id,
            actor_role: 'creator',
            amount_cents: Math.round(creatorPayout * 100),
            metadata: { reason: 'Creator Stripe onboarding incomplete' },
          }, '[RELEASE-CREATOR-PAYOUT]');
        } catch (auditErr) {
          console.error('Payment event logging failed (non-blocking):', auditErr);
        }
      }

      // Finalize DB state (retried). The wallet credit + marker are already committed atomically, so a
      // re-invocation is finalize-only (re-entry guard) — we can SAFELY surface a persistent finalize
      // failure for retry (500 {needsRetry}) without risking a double-credit. Reconciliation also heals.
      const finalized = await finalizePayoutState(supabaseClient, collaborationId, campaign.id);
      if (!finalized) {
        console.error('Pending-balance credited + marked but finalize failed after retries — surfacing for retry (re-entry is finalize-only; reconciliation will also heal).', {
          collaborationId,
        });
        return new Response(JSON.stringify({ success: false, needsRetry: true, error: 'finalize_failed' }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 500,
        });
      }

      // Auto Cross-Scheduling: generate posting schedule if preferences exist (non-blocking)
      try {
        await generateAutoSchedule(supabaseClient, campaign, collaboration.creator_id);
      } catch (scheduleError) {
        logStep('Auto-schedule generation failed (non-blocking)', { error: scheduleError instanceof Error ? scheduleError.message : String(scheduleError) });
      }

      return new Response(JSON.stringify({
        success: true,
        amount: creatorPayout,
        method: 'pending_balance',
        message: 'Payment added to creator pending balance. Creator needs to complete Stripe onboarding to withdraw.',
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 500,
    });
  }
});
