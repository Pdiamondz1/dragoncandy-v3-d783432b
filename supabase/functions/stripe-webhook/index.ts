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

  // Idempotency: attempt to claim this event via insert (PK prevents duplicates)
  const { error: lockError } = await supabase
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type, status: 'processing' });

  if (lockError?.code === '23505') { // unique_violation — already processing or processed
    logStep("Event already processing or processed, skipping", { eventId: event.id });
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

        // DragonShare boost payment failed
        if (metadata.type === "dragonshare_boost" && metadata.boost_id) {
          await supabase
            .from("dragonshare_boosts")
            .update({ status: "failed" })
            .eq("id", metadata.boost_id)
            .eq("status", "pending");

          await supabase.from("dragonshare_events").insert({
            event_type: "boost_failed",
            actor_org_id: metadata.boosting_org_id,
            post_id: metadata.post_id,
            boost_id: metadata.boost_id,
            payload: { failure_message: failureMessage },
          });

          logStep("DragonShare boost payment failed", { boostId: metadata.boost_id });
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
          const { error: refundError } = await supabase
            .from("campaigns")
            .update({ escrow_status: "refunded" })
            .eq("id", metadata.campaign_id);

          if (refundError) {
            logStep("ERROR: Failed to update campaign refund status", { campaignId: metadata.campaign_id, error: refundError.message });
            return new Response("DB update failed", { status: 500 });
          }

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
          const { error: spRefundError } = await supabase
            .from("campaign_sponsorships")
            .update({ payment_status: "refunded" })
            .eq("id", metadata.sponsorship_id);

          if (spRefundError) {
            logStep("ERROR: Failed to update sponsorship refund status", { sponsorshipId: metadata.sponsorship_id, error: spRefundError.message });
            return new Response("DB update failed", { status: 500 });
          }

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
        const metadata = dispute.metadata ?? {};

        logStep("Dispute created", { disputeId: dispute.id, chargeId: charge, amount: dispute.amount, reason: dispute.reason });

        const disputeEntityId = metadata.collaboration_id || metadata.sponsorship_id;
        if (disputeEntityId) {
          await writePaymentEvent(supabase, {
            event_type: 'dispute_created',
            entity_type: metadata.type === 'campaign_escrow' ? 'collaboration' : 'sponsorship',
            entity_id: disputeEntityId,
            campaign_id: metadata.campaign_id || null,
            actor_role: 'stripe',
            amount_cents: dispute.amount,
            stripe_id: dispute.id,
            metadata: { reason: dispute.reason, status: dispute.status, charge_id: charge },
          }, '[STRIPE-WEBHOOK]');
        } else {
          logStep("Dispute has no entity IDs in metadata — skipping ledger write", { disputeId: dispute.id });
        }

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

      // ── Transfer updated (handles failures — Stripe has no transfer.failed event) ──
      case "transfer.updated": {
        const transfer = event.data.object as Stripe.Transfer;
        if (!transfer.reversed) {
          // Not a failure/reversal — ignore routine updates
          break;
        }
        const metadata = transfer.metadata ?? {};

        logStep("Transfer reversed/failed", { transferId: transfer.id, amount: transfer.amount, reversed: transfer.reversed });

        const entityType = metadata.sponsorship_id ? 'sponsorship' : 'collaboration';
        const transferEntityId = metadata.collaboration_id || metadata.sponsorship_id;

        if (transferEntityId) {
          await writePaymentEvent(supabase, {
            event_type: 'transfer_failed',
            entity_type: entityType,
            entity_id: transferEntityId,
            campaign_id: metadata.campaign_id || null,
            actor_role: 'stripe',
            amount_cents: transfer.amount,
            stripe_id: transfer.id,
            metadata: { failure_message: (transfer as any).failure_message },
          }, '[STRIPE-WEBHOOK]');
        } else {
          logStep("Transfer has no entity IDs in metadata — skipping ledger write", { transferId: transfer.id });
        }

        if (metadata.collaboration_id) {
          const { data: collab } = await supabase
            .from('campaign_collaborations')
            .select('creator_id')
            .eq('id', metadata.collaboration_id)
            .single();
          if (collab) {
            const { error: rpcError } = await supabase.rpc('increment_pending_balance', {
              p_user_id: collab.creator_id,
              p_amount: transfer.amount / 100,
              p_profile_type: 'creator',
            });
            if (rpcError) {
              logStep("ERROR: Failed to restore pending balance after transfer failure", { error: rpcError.message, userId: collab.creator_id });
              return new Response("Balance restore failed", { status: 500 });
            }
          }
        }

        // DragonShare boost transfer failed
        if (metadata.type === "dragonshare_boost" && metadata.boost_id) {
          await supabase
            .from("dragonshare_boosts")
            .update({ status: "failed" })
            .eq("id", metadata.boost_id);

          await supabase
            .from("dragonshare_payouts")
            .update({ status: "reversed", failure_reason: "Transfer reversed" })
            .eq("boost_id", metadata.boost_id);

          await supabase.from("dragonshare_events").insert({
            event_type: "boost_failed",
            post_id: metadata.post_id,
            boost_id: metadata.boost_id,
            payload: { failure_message: (transfer as any).failure_message, reversed: true },
          });

          logStep("DragonShare boost transfer reversed", { boostId: metadata.boost_id });
        }
        break;
      }

      // ── Subscription created / updated ──────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const subscriptionId = subscription.id;

        const PRICE_TO_TIER: Record<string, string> = {
          'price_test_starter_monthly': 'starter',
          'price_test_starter_annual': 'starter',
          'price_test_growth_monthly': 'growth',
          'price_test_growth_annual': 'growth',
          'price_test_pro_monthly': 'pro',
          'price_test_pro_annual': 'pro',
        };
        const VALID_TIERS = new Set(['starter', 'growth', 'pro']);

        let tier = 'free';
        if (subscription.status === 'active' && subscription.items?.data?.length) {
          const basePriceId = subscription.items.data[0].price.id;
          const metaTier = subscription.metadata?.tier;
          tier = PRICE_TO_TIER[basePriceId] || (metaTier && VALID_TIERS.has(metaTier) ? metaTier : 'free');
        }

        logStep("Subscription upserted", { customerId, subscriptionId, status: subscription.status, tier });

        const { error: subError } = await supabase
          .from("organizations")
          .update({
            stripe_subscription_id: subscriptionId,
            subscription_tier: tier,
          })
          .eq("stripe_customer_id", customerId);

        if (subError) {
          logStep("ERROR: Failed to update org subscription", { customerId, error: subError.message });
          return new Response("DB update failed", { status: 500 });
        }
        break;
      }

      // ── Subscription deleted (cancelled) ─────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        logStep("Subscription deleted — resetting to free", { customerId, subscriptionId: subscription.id });

        const { error: deleteError } = await supabase
          .from("organizations")
          .update({
            stripe_subscription_id: null,
            subscription_tier: 'free',
          })
          .eq("stripe_customer_id", customerId);

        if (deleteError) {
          logStep("ERROR: Failed to reset org to free tier", { customerId, error: deleteError.message });
          return new Response("DB update failed", { status: 500 });
        }
        break;
      }

      // ── Invoice payment succeeded ─────────────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;

        logStep("Invoice payment succeeded", { invoiceId: invoice.id, subscriptionId, amountPaid: invoice.amount_paid });

        if (subscriptionId) {
          const { data: org, error: orgError } = await supabase
            .from("organizations")
            .select("id, subscription_tier")
            .eq("stripe_subscription_id", subscriptionId)
            .maybeSingle();

          if (orgError) {
            logStep("ERROR: Failed to look up org by subscription", { subscriptionId, error: orgError.message });
          } else if (org) {
            logStep("Invoice payment logged for org", { orgId: org.id, tier: org.subscription_tier });
          } else {
            logStep("No org found for subscription — invoice ignored", { subscriptionId });
          }
        }
        break;
      }

      // ── Invoice payment failed ────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;

        logStep("Invoice payment failed", { invoiceId: invoice.id, subscriptionId, attemptCount: invoice.attempt_count });

        if (subscriptionId) {
          const { data: org, error: orgError } = await supabase
            .from("organizations")
            .select("id, subscription_tier")
            .eq("stripe_subscription_id", subscriptionId)
            .maybeSingle();

          if (orgError) {
            logStep("ERROR: Failed to look up org by subscription for failed invoice", { subscriptionId, error: orgError.message });
          } else if (org) {
            logStep("Invoice payment failure logged for org", { orgId: org.id, tier: org.subscription_tier, attemptCount: invoice.attempt_count });
          } else {
            logStep("No org found for subscription — failed invoice ignored", { subscriptionId });
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
      .update({ status: 'failed', error_message: String(err) })
      .eq('event_id', event.id)
      .then(() => {}, () => {}); // Ignore update errors in error handler
    // Return 500 so Stripe retries
    return new Response(`Handler error: ${String(err)}`, { status: 500 });
  }

  // Record successful processing
  await supabase
    .from('stripe_webhook_events')
    .update({ status: 'processed' })
    .eq('event_id', event.id);

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
