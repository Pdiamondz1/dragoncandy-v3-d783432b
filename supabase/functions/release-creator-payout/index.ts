import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { calculatePlatformFee, getOrgTakeRate } from "../_shared/platform-fee.ts";
import { resolvePayoutAmount } from "../_shared/pricing-utils.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyPayoutReady } from "../_shared/payout-ready.ts";
import { applyWalletFirstPayout, finalizePayoutState } from "./wallet-first.ts";

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
    // finalize state updates. The marker (`payout_executed_at` / `stripe_transfer_id`) is set ATOMICALLY
    // with the pending-balance credit (wallet-first path), or was set AFTER the Stripe transfer confirmed
    // on old (pre-redesign) rows, so "marker set ⇒ money moved" holds by construction. This handles
    // sequential client retries AND the auto-approve-content reconciliation sweep, and it runs BEFORE the
    // escrow gate so a reconciliation call (escrow already 'released') finalizes instead of throwing.
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

    // Escrow must be held (or releasing for idempotent retries on old in-flight rows) before releasing payout
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

    // ── Wallet-first payout (single money path) ───────────────────────────────────────────────────────
    // Credit the pending wallet atomically-with-the-durable-marker, then best-effort exactly-once flush to
    // Stripe if the creator can receive payouts now, then finalize. No divergent transfer path ⇒ the two
    // #329 residuals (cross-path concurrent double-pay; Stripe-up/DB-down marker split-brain) close by
    // construction. Body logic lives in the DI-testable applyWalletFirstPayout helper (wallet-first.ts).
    const result = await applyWalletFirstPayout({
      supabase: supabaseClient,
      stripe,
      collaborationId,
      campaignId: campaign.id,
      creatorId: collaboration.creator_id,
      callerId: callerId ?? null,
      creatorPayout,
      stripeAccountId: creatorProfile?.stripe_account_id ?? null,
      creatorPayoutReady,
    });

    if (result.status === 200) {
      // Auto Cross-Scheduling: generate posting schedule if preferences exist (non-blocking). Kept in the
      // handler because it needs the full campaign object.
      try {
        await generateAutoSchedule(supabaseClient, campaign, collaboration.creator_id);
      } catch (scheduleError) {
        logStep('Auto-schedule generation failed (non-blocking)', { error: scheduleError instanceof Error ? scheduleError.message : String(scheduleError) });
      }
    }

    return new Response(JSON.stringify(result.body), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: result.status,
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
