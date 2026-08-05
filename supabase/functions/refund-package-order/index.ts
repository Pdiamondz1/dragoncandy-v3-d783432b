import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Refund a package order's held escrow to the buyer (powers the F4 "refunded if they don't deliver" promise).
// DEPLOY WITH verify_jwt=false: a guest buyer (no JWT) can cancel via their order token. Authorized to either
// participant — the buyer (JWT / guest token) OR the creator declining the job — or the platform (service
// role). Refund is only possible while escrow is 'held' and BEFORE payout has executed; once the creator has
// been credited (payout_executed_at set) the money is theirs and this refuses.

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[REFUND-PACKAGE-ORDER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // Don't hard-fail on a missing Authorization header: a guest cancel carries its credential in the body
    // (guestToken), so a bare guest surface that never attaches the anon key still reaches the guest-token
    // branch. An empty token simply can't match the service-role key or a valid JWT.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServiceRole = !!token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const { orderId, guestToken, reason } = await req.json();
    if (!orderId) throw new Error("Missing required field: orderId");

    const { data: order, error: orderErr } = await supabaseClient
      .from("package_orders")
      .select("id, creator_id, buyer_user_id, buyer_guest_token, escrow_status, escrow_payment_intent_id, payout_executed_at, content_submitted_at")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) throw new Error(`Order not found: ${orderErr?.message}`);

    // ── Authorize: service-role, OR a participant (buyer via JWT/guest-token, or the creator declining) ──
    let actorId: string | null = null;
    let actorRole: "business" | "creator" | "system" = "system";
    if (isServiceRole) {
      logStep("Service-role call");
    } else if (guestToken && order.buyer_guest_token && guestToken === order.buyer_guest_token) {
      actorRole = "business";
      logStep("Guest buyer refund", { orderId });
    } else {
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      if (userError || !userData?.user) throw new Error("User not authenticated");
      const uid = userData.user.id;
      if (uid === order.buyer_user_id) {
        actorId = uid;
        actorRole = "business";
      } else if (uid === order.creator_id) {
        actorId = uid;
        actorRole = "creator";
      } else {
        throw new Error("Not authorized to refund this order");
      }
      logStep("Participant authenticated", { userId: uid, role: actorRole });
    }

    // Guards: never refund after the creator was paid; act only from 'held' (fresh) or 'refunding'
    // (resuming a prior attempt that claimed the order but died before Stripe/finalize completed).
    if (order.payout_executed_at) {
      throw new Error("Cannot refund: payout already released to the creator");
    }
    if (order.escrow_status !== "held" && order.escrow_status !== "refunding") {
      throw new Error(`Cannot refund: escrow status is '${order.escrow_status}', expected 'held'`);
    }
    // Once the creator has DELIVERED (content_submitted_at set), a buyer/guest/creator can no longer self-serve
    // a refund — otherwise a buyer holding the guest token could POST here after receiving the deliverables and
    // keep the work for free. Post-delivery, the buyer's only self-serve path is Approve or Request-a-revision;
    // a genuine dispute is resolved by the PLATFORM (service role), which is deliberately exempt here. Mirrors
    // the UI, which hides Cancel once content_submitted_at is set (content_submitted_at is never nulled, so a
    // revision-in-progress order stays protected too).
    if (!isServiceRole && order.content_submitted_at) {
      throw new Error("Cannot refund: the creator has already delivered. Approve the work, request a revision, or contact support.");
    }

    const refundReason = (typeof reason === "string" && reason.trim()) ? reason.trim() : "Order cancelled";

    // ── Durable claim BEFORE any money moves ──────────────────────────────────────────────────────────
    // Atomically flip 'held' → 'refunding'. This is the marker that closes the payout gate
    // (release-package-payout accepts only 'held'/'releasing'), so a refund can NEVER coexist with a payout
    // even if the Stripe call or the finalize below fails partway. If the CAS matches 0 rows, another actor
    // moved the order (concurrent release/refund) between our read and here — abort rather than double-act.
    if (order.escrow_status === "held") {
      let claimQuery = supabaseClient
        .from("package_orders")
        .update({ escrow_status: "refunding" })
        .eq("id", orderId)
        .eq("escrow_status", "held");
      // Fold the post-delivery guard INTO the CAS for non-service callers: the content_submitted_at check above
      // is a non-locked read, so a submit_package_deliverables that commits between that read and this claim
      // would otherwise let a buyer/guest refund delivered work. Requiring content_submitted_at IS NULL in the
      // claim makes check-and-claim atomic — a delivery that raced in flips this to 0 matched rows and aborts.
      // Service role (platform dispute resolution) is deliberately exempt and can still refund delivered work.
      if (!isServiceRole) {
        claimQuery = claimQuery.is("content_submitted_at", null);
      }
      const { data: claimed, error: claimErr } = await claimQuery.select("id");
      if (claimErr) throw new Error(`Failed to claim order for refund: ${claimErr.message}`);
      if (!claimed || claimed.length === 0) {
        throw new Error("Order is no longer in a refundable state (concurrent delivery or operation)");
      }
    }

    // Issue the refund. The idempotency key is keyed on the order, so a resumed attempt (escrow already
    // 'refunding') re-requests the SAME refund from Stripe instead of double-refunding.
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    let refundResult: Stripe.Refund | null = null;
    const storedId = order.escrow_payment_intent_id;
    if (storedId) {
      let resolvedPiId = storedId;
      if (resolvedPiId.startsWith("cs_")) {
        const session = await stripe.checkout.sessions.retrieve(resolvedPiId);
        resolvedPiId = session.payment_intent as string;
      }
      if (resolvedPiId?.startsWith("pi_")) {
        refundResult = await stripe.refunds.create(
          {
            payment_intent: resolvedPiId,
            reason: "requested_by_customer",
            metadata: { order_id: orderId, type: "package_order", refund_reason: refundReason.substring(0, 500) },
          },
          { idempotencyKey: `refund_package_order_${orderId}` },
        );
        logStep("Refund created", { refundId: refundResult.id, amount: refundResult.amount });
      }
    }

    // Finalize the terminal state with retries. Until this lands the order stays 'refunding' (payout still
    // blocked). On persistent failure we surface needsRetry rather than falsely reporting success — the money
    // is already refunded and payout is impossible, so a re-invocation (escrow='refunding' resume path)
    // simply re-requests the idempotent refund and re-finalizes.
    let finalized = false;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const { error: updateErr } = await supabaseClient
        .from("package_orders")
        .update({ escrow_status: "refunded", order_status: "refunded" })
        .eq("id", orderId);
      if (!updateErr) { finalized = true; break; }
      logStep("Refund finalize attempt failed", { attempt, error: updateErr.message });
      if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * attempt));
    }

    await writePaymentEvent(supabaseClient, {
      event_type: "refund_initiated",
      entity_type: "package_order",
      entity_id: orderId,
      campaign_id: null,
      actor_id: actorId ?? undefined,
      actor_role: actorRole,
      amount_cents: refundResult?.amount,
      stripe_id: refundResult?.id,
      metadata: { reason: refundReason },
    }, "[REFUND-PACKAGE-ORDER]");

    if (!finalized) {
      return new Response(JSON.stringify({
        success: false,
        needsRetry: true,
        refundId: refundResult?.id,
        message: "Refund issued to the buyer but the order state could not be finalized; it will reconcile on retry.",
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ success: true, refundId: refundResult?.id, message: "Refund initiated." }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 200,
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
