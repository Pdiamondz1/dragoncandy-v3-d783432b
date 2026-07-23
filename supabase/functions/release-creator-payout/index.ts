import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { calculatePlatformFee, getOrgTakeRate } from "../_shared/platform-fee.ts";
import { resolvePayoutAmount } from "../_shared/pricing-utils.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyPayoutReady } from "../_shared/payout-ready.ts";
import { isTestKey } from "../_shared/stripe-mode.ts";
import { shouldRefuseSettlement } from "../_shared/synthetic-guard.ts";

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

    // Synthetic Weight Engine safety spine: never settle real money to/from a
    // synthetic (bot) creator. Test-mode Stripe keys are exempt (that's the
    // whole point of the bot harness); a live key + synthetic creator refuses.
    const isTestMode = isTestKey(stripeKey);
    const { data: synthRow, error: synthError } = await supabaseClient
      .from('synthetic_users')
      .select('user_id')
      .eq('user_id', collaboration.creator_id)
      .maybeSingle();
    if (synthError && !isTestMode) {
      // Money-safety: in LIVE mode, if we cannot verify the creator is non-synthetic, refuse.
      logStep("Synthetic-user lookup failed in live mode — refusing payout", { error: synthError.message });
      throw new Error("Refusing live-mode payout: could not verify creator is non-synthetic");
    }
    if (synthError) {
      logStep("Synthetic-user lookup failed (test mode — treated as not synthetic)", { error: synthError.message });
    }
    if (shouldRefuseSettlement({ isTestMode, isSynthetic: !!synthRow })) {
      throw new Error("Refusing live-mode payout to a synthetic user");
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

      // Phase 3: Finalize DB state
      const { error: collabUpdateError } = await supabaseClient
        .from('campaign_collaborations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          content_status: 'approved',
        })
        .eq('id', collaborationId);

      if (collabUpdateError) {
        console.error('CRITICAL: Transfer succeeded but collaboration update failed. Manual reconciliation needed.', {
          collaborationId, transferId: transfer.id, error: collabUpdateError.message
        });
      }

      const { error: campaignUpdateError } = await supabaseClient
        .from('campaigns')
        .update({ escrow_status: 'released' })
        .eq('id', campaign.id);

      if (campaignUpdateError) {
        console.error('CRITICAL: Transfer succeeded but campaign escrow update failed. Manual reconciliation needed.', {
          campaignId: campaign.id, transferId: transfer.id, error: campaignUpdateError.message
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
      // Creator hasn't completed onboarding - add to pending balance atomically
      const newBalance = await supabaseClient.rpc('increment_pending_balance', {
        p_user_id: collaboration.creator_id,
        p_amount: creatorPayout,
        p_profile_type: 'creator',
      });

      logStep("Added to pending balance", {
        previousBalance: creatorProfile?.pending_balance || 0,
        added: creatorPayout,
      });

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
