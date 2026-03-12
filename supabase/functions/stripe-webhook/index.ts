import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

      default:
        logStep("Unhandled event type — ignored", { type: event.type });
    }
  } catch (err) {
    logStep("ERROR processing event", { type: event.type, error: String(err) });
    // Return 500 so Stripe retries
    return new Response(`Handler error: ${String(err)}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
