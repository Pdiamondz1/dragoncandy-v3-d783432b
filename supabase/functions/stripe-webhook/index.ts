import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";

const logStep = (step: string, details?: any) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  // Webhooks must be POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    logStep("Missing stripe-signature header");
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    logStep("ERROR: STRIPE_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    logStep("ERROR: STRIPE_SECRET_KEY not configured");
    return new Response("Stripe key not configured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Read body as raw text for signature verification
  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    logStep("Webhook signature verification failed", { error: String(err) });
    return new Response(`Webhook Error: ${String(err)}`, { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  // Idempotency: check if this event was already processed
  const { data: existingEvent } = await supabase
    .from('stripe_webhook_events')
    .select('event_id, status')
    .eq('event_id', event.id)
    .single();

  if (existingEvent?.status === 'processed') {
    logStep("Event already processed, skipping", { eventId: event.id });
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }

  try {
    switch (event.type) {

      // ── Payment succeeded ────────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") {
          logStep("Session completed but not paid", { status: session.payment_status });
          break;
        }

        const metadata = session.metadata ?? {};
        const paymentIntentId = session.payment_intent as string | null;

        // Campaign escrow payment
        if (metadata.type === "campaign_escrow" && metadata.campaign_id) {
          const campaignId = metadata.campaign_id;

          // Idempotency: skip if already processed
          const { data: campaign } = await supabase
            .from("campaigns")
            .select("escrow_status")
            .eq("id", campaignId)
            .single();

          if (campaign?.escrow_status === "held" || campaign?.escrow_status === "released") {
            logStep("Campaign already processed, skipping", { campaignId });
            break;
          }

          const { error } = await supabase
            .from("campaigns")
            .update({
              escrow_status: "held",
              status: "published",
              escrow_payment_intent_id: paymentIntentId,
            })
            .eq("id", campaignId);

          if (error) {
            logStep("ERROR: Failed to update campaign", { campaignId, error: error.message });
            // Return 500 so Stripe retries the webhook
            return new Response("DB update failed", { status: 500 });
          }

          logStep("Campaign escrow confirmed via webhook", { campaignId, paymentIntentId });

          await writePaymentEvent(supabase, {
            event_type: 'escrow_held',
            entity_type: 'collaboration',
            entity_id: campaignId,
            campaign_id: campaignId,
            actor_role: 'stripe',
            amount_cents: session.amount_total ?? undefined,
            stripe_id: paymentIntentId ?? undefined,
          }, '[STRIPE-WEBHOOK]');
        }

        // Sponsorship payment
        if (metadata.sponsorship_id) {
          const sponsorshipId = metadata.sponsorship_id;

          // Idempotency: skip if already processed
          const { data: sponsorship } = await supabase
            .from("campaign_sponsorships")
            .select("payment_status")
            .eq("id", sponsorshipId)
            .single();

          if (sponsorship?.payment_status === "paid") {
            logStep("Sponsorship already processed, skipping", { sponsorshipId });
            break;
          }

          const { error } = await supabase
            .from("campaign_sponsorships")
            .update({
              payment_status: "paid",
              payment_date: new Date().toISOString(),
              payment_intent_id: paymentIntentId,
            })
            .eq("id", sponsorshipId);

          if (error) {
            logStep("ERROR: Failed to update sponsorship", { sponsorshipId, error: error.message });
            return new Response("DB update failed", { status: 500 });
          }

          logStep("Sponsorship payment confirmed via webhook", { sponsorshipId });

          await writePaymentEvent(supabase, {
            event_type: 'sponsorship_paid',
            entity_type: 'sponsorship',
            entity_id: sponsorshipId,
            campaign_id: metadata.campaign_id || null,
            actor_role: 'stripe',
            amount_cents: session.amount_total ?? undefined,
            stripe_id: paymentIntentId ?? undefined,
          }, '[STRIPE-WEBHOOK]');
        }
        break;
      }

      // ── Payment failed ───────────────────────────────────────────────────
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const metadata = pi.metadata ?? {};
        const failureMessage = pi.last_payment_error?.message ?? "Payment failed";

        logStep("Payment failed", { paymentIntentId: pi.id, reason: failureMessage });

        if (metadata.type === "campaign_escrow" && metadata.campaign_id) {
          await supabase
            .from("campaigns")
            .update({ escrow_status: "none" })
            .eq("id", metadata.campaign_id)
            .eq("escrow_status", "pending"); // Only reset if still pending — don't undo a held payment
          logStep("Campaign escrow reset after payment failure", { campaignId: metadata.campaign_id });

          await writePaymentEvent(supabase, {
            event_type: 'escrow_failed',
            entity_type: 'collaboration',
            entity_id: metadata.campaign_id,
            campaign_id: metadata.campaign_id,
            actor_role: 'stripe',
            stripe_id: pi.id,
            metadata: { failure_message: failureMessage },
          }, '[STRIPE-WEBHOOK]');
        }

        if (metadata.sponsorship_id) {
          await supabase
            .from("campaign_sponsorships")
            .update({ payment_status: "failed" })
            .eq("id", metadata.sponsorship_id)
            .eq("payment_status", "pending");
          logStep("Sponsorship marked failed", { sponsorshipId: metadata.sponsorship_id });
        }
        break;
      }

      // ── Checkout session expired (user abandoned) ────────────────────────
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata ?? {};

        if (metadata.type === "campaign_escrow" && metadata.campaign_id) {
          await supabase
            .from("campaigns")
            .update({ escrow_status: "none" })
            .eq("id", metadata.campaign_id)
            .eq("escrow_status", "pending");
          logStep("Campaign escrow reset after session expiry", { campaignId: metadata.campaign_id });

          await writePaymentEvent(supabase, {
            event_type: 'escrow_expired',
            entity_type: 'collaboration',
            entity_id: metadata.campaign_id,
            campaign_id: metadata.campaign_id,
            actor_role: 'stripe',
          }, '[STRIPE-WEBHOOK]');
        }

        if (metadata.sponsorship_id) {
          await supabase
            .from("campaign_sponsorships")
            .update({ payment_status: "failed" })
            .eq("id", metadata.sponsorship_id)
            .eq("payment_status", "pending");
          logStep("Sponsorship reset after session expiry", { sponsorshipId: metadata.sponsorship_id });
        }
        break;
      }

      // ── Connect account status changed ───────────────────────────────────
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const onboardingComplete = account.charges_enabled && account.payouts_enabled;

        // Update creator profile if this account belongs to one
        const { error: creatorError, count } = await supabase
          .from("creator_profiles")
          .update({ stripe_onboarding_complete: onboardingComplete })
          .eq("stripe_account_id", account.id)
          .select("id", { count: "exact", head: true });

        if (!creatorError && (count ?? 0) === 0) {
          // Not a creator — try business profile
          await supabase
            .from("business_profiles")
            .update({ stripe_onboarding_complete: onboardingComplete })
            .eq("stripe_account_id", account.id);
        }

        logStep("Account onboarding status updated", { accountId: account.id, onboardingComplete });
        break;
      }

      // ── Refund processed ─────────────────────────────────────────────────
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const metadata = charge.metadata ?? {};
        const refundAmount = charge.amount_refunded;

        logStep("Refund processed", { chargeId: charge.id, amount: refundAmount });

        if (metadata.type === "campaign_escrow" && metadata.campaign_id) {
          await supabase
            .from("campaigns")
            .update({ escrow_status: "refunded" })
            .eq("id", metadata.campaign_id);

          await writePaymentEvent(supabase, {
            event_type: 'refund_completed',
            entity_type: 'collaboration',
            entity_id: metadata.collaboration_id || metadata.campaign_id,
            campaign_id: metadata.campaign_id,
            actor_role: 'stripe',
            amount_cents: refundAmount,
            stripe_id: charge.id,
            metadata: { reason: charge.refunds?.data?.[0]?.reason },
          }, '[STRIPE-WEBHOOK]');
        }

        if (metadata.sponsorship_id) {
          await supabase
            .from("campaign_sponsorships")
            .update({ payment_status: "refunded" })
            .eq("id", metadata.sponsorship_id);

          await writePaymentEvent(supabase, {
            event_type: 'refund_completed',
            entity_type: 'sponsorship',
            entity_id: metadata.sponsorship_id,
            campaign_id: metadata.campaign_id || null,
            actor_role: 'stripe',
            amount_cents: refundAmount,
            stripe_id: charge.id,
          }, '[STRIPE-WEBHOOK]');
        }
        break;
      }

      // ── Dispute created ──────────────────────────────────────────────────
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const charge = dispute.charge as string;
        const metadata = (dispute as any).metadata ?? {};

        logStep("Dispute created", { disputeId: dispute.id, chargeId: charge, amount: dispute.amount, reason: dispute.reason });

        await writePaymentEvent(supabase, {
          event_type: 'dispute_created',
          entity_type: metadata.type === 'campaign_escrow' ? 'collaboration' : 'sponsorship',
          entity_id: metadata.collaboration_id || metadata.sponsorship_id || dispute.id,
          campaign_id: metadata.campaign_id || null,
          actor_role: 'stripe',
          amount_cents: dispute.amount,
          stripe_id: dispute.id,
          metadata: { reason: dispute.reason, status: dispute.status, charge_id: charge },
        }, '[STRIPE-WEBHOOK]');

        try {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              to: 'admin@dragoncandy.io',
              subject: `Payment Dispute Filed — $${(dispute.amount / 100).toFixed(2)}`,
              type: 'dispute_alert',
              data: { disputeId: dispute.id, amount: dispute.amount, reason: dispute.reason },
            },
          });
        } catch (emailErr) {
          logStep("Failed to send dispute admin email", { error: String(emailErr) });
        }
        break;
      }

      // ── Transfer failed ──────────────────────────────────────────────────
      case "transfer.failed": {
        const transfer = event.data.object as Stripe.Transfer;
        const metadata = transfer.metadata ?? {};

        logStep("Transfer failed", { transferId: transfer.id, amount: transfer.amount });

        const entityType = metadata.sponsorship_id ? 'sponsorship' : 'collaboration';
        const entityId = metadata.collaboration_id || metadata.sponsorship_id || transfer.id;

        await writePaymentEvent(supabase, {
          event_type: 'transfer_failed',
          entity_type: entityType,
          entity_id: entityId,
          campaign_id: metadata.campaign_id || null,
          actor_role: 'stripe',
          amount_cents: transfer.amount,
          stripe_id: transfer.id,
          metadata: { failure_message: (transfer as any).failure_message },
        }, '[STRIPE-WEBHOOK]');

        if (metadata.collaboration_id) {
          const { data: collab } = await supabase
            .from('campaign_collaborations')
            .select('creator_id')
            .eq('id', metadata.collaboration_id)
            .single();
          if (collab) {
            await supabase.rpc('increment_pending_balance', {
              p_user_id: collab.creator_id,
              p_amount: transfer.amount / 100,
              p_profile_type: 'creator',
            });
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type — ignored", { type: event.type });
    }
  } catch (err) {
    logStep("ERROR processing event", { type: event.type, error: String(err) });
    // Record failed processing (allows retry)
    await supabase
      .from('stripe_webhook_events')
      .upsert({ event_id: event.id, event_type: event.type, status: 'failed', error_message: String(err) })
      .then(() => {}, () => {}); // Ignore upsert errors in error handler
    // Return 500 so Stripe retries
    return new Response(`Handler error: ${String(err)}`, { status: 500 });
  }

  // Record successful processing
  await supabase
    .from('stripe_webhook_events')
    .upsert({ event_id: event.id, event_type: event.type, status: 'processed' });

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
