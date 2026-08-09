import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Confirm a package-order payment and flip escrow to held. DEPLOY WITH verify_jwt=false (a guest returning
// from Stripe Checkout has no JWT). Safe to call unauthenticated: it flips escrow to 'held' ONLY when Stripe
// reports a PAID payment whose metadata.order_id equals the claimed order — so a caller can neither fabricate
// a held state nor bind a stranger's payment to their order. It returns order STATE only, never order data.
// Beyond confirming payment, this is the MONEY-TRUTH backstop for duplicate charges: because a Stripe checkout
// session mint can never be atomic with a DB claim, an order can end up with more than one payable session
// (concurrent checkouts, two tabs, a stale session after a price edit). Whichever paid session holds the order
// wins; any OTHER paid payment presented here is refunded. That closes the whole multi-session class at the
// one place the actual payments are known. Unlike the campaign verifier there is no collaboration to create.

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-PACKAGE-ORDER-ESCROW] ${step}${detailsStr}`);
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

    const { orderId, sessionId } = await req.json();
    if (!orderId) throw new Error("Missing required field: orderId");
    logStep("Request payload", { orderId, sessionId });

    const { data: order, error: orderErr } = await supabaseClient
      .from("package_orders")
      .select("id, escrow_status, escrow_payment_intent_id, order_status, price_snapshot")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) throw new Error("Order not found");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // The session/PI must carry metadata.order_id === this order — binds a confirmed payment to THIS order so
    // nobody can point a foreign (real) payment at someone else's order to force it 'held'.
    const belongsToOrder = (meta: Stripe.Metadata | null | undefined) => (meta?.order_id ?? null) === orderId;

    // Refund a payment that must NOT hold the order — a stale/price-mismatched charge, or a duplicate for an
    // order another payment already holds — and be HONEST about whether the refund actually succeeded. The
    // idempotency key is keyed on the PI so a retry never double-refunds.
    const refundExtraAndRespond = async (
      piId: string | null,
      opts: { status: string; reason: string; okMsg: string; failMsg: string; logNote: string },
    ) => {
      logStep(opts.logNote, { orderId, piId });
      let refunded = false;
      if (piId) {
        try {
          await stripe.refunds.create(
            {
              payment_intent: piId,
              reason: "requested_by_customer",
              metadata: { order_id: orderId, type: "package_order", refund_reason: opts.reason },
            },
            { idempotencyKey: `refund_${opts.reason}_${piId}` },
          );
          refunded = true;
        } catch (refundErr) {
          logStep("Auto-refund failed (manual reconcile needed)", { orderId, piId, error: String(refundErr) });
        }
      }
      return new Response(JSON.stringify({
        success: false,
        status: opts.status,
        refunded,
        message: refunded ? opts.okMsg : opts.failMsg,
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    };
    const MISMATCH = {
      status: "amount_mismatch",
      reason: "price_changed_before_payment",
      okMsg: "This package's price changed before your payment completed. Your payment was refunded — please check out again.",
      failMsg: "This package's price changed before your payment completed, and we could not auto-refund. Please contact support with your order id.",
    };
    const DUPLICATE = {
      status: "duplicate_refunded",
      reason: "duplicate_payment",
      okMsg: "This order was already paid; the extra payment was refunded.",
      failMsg: "This order was already paid and we detected an extra payment we could not auto-refund. Please contact support with your order id.",
    };

    // ── Resolve the payment this request is about ─────────────────────────────────────────────────────
    // requestPi (from the request's own sessionId) is the authoritative "what the buyer just paid", used for
    // duplicate detection. foundPi additionally falls back to the stored id / a metadata search so a still-
    // pending order can be held even when the client omitted sessionId.
    let requestPi: string | null = null;
    let requestAmount: number | null = null;
    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid" && belongsToOrder(session.metadata)) {
          requestPi = session.payment_intent as string;
          requestAmount = session.amount_total ?? null;
        }
      } catch (e) {
        logStep("Session retrieval failed", { error: String(e) });
      }
    }

    let foundPi = requestPi;
    let foundAmount = requestAmount;
    if (!foundPi && order.escrow_payment_intent_id) {
      const storedId = order.escrow_payment_intent_id;
      try {
        if (storedId.startsWith("cs_")) {
          const session = await stripe.checkout.sessions.retrieve(storedId);
          if (session.payment_status === "paid" && belongsToOrder(session.metadata)) {
            foundPi = session.payment_intent as string;
            foundAmount = session.amount_total ?? null;
          }
        } else if (storedId.startsWith("pi_")) {
          const pi = await stripe.paymentIntents.retrieve(storedId);
          if (pi.status === "succeeded" && belongsToOrder(pi.metadata)) {
            foundPi = storedId;
            foundAmount = pi.amount ?? null;
          }
        }
      } catch (e) {
        logStep("Stored id retrieval failed", { error: String(e) });
      }
    }
    if (!foundPi) {
      try {
        const pis = await stripe.paymentIntents.search({
          query: `metadata['order_id']:'${orderId}' AND status:'succeeded'`,
          limit: 1,
        });
        if (pis.data.length > 0) {
          foundPi = pis.data[0].id;
          foundAmount = pis.data[0].amount ?? null;
        }
      } catch (e) {
        logStep("Stripe search failed", { error: String(e) });
      }
    }
    const paymentSucceeded = !!foundPi;

    // A recorded PI (pi_...) is the marker we compare against for duplicates; only when the order already
    // carries a real PI can we safely say "a different paid PI is a duplicate".
    const recordedPi = order.escrow_payment_intent_id;
    const recordedIsPi = !!recordedPi && recordedPi.startsWith("pi_");

    // ── Already-processed order: reconcile a possible DUPLICATE charge ────────────────────────────────
    if (order.escrow_status !== "pending") {
      if (requestPi && recordedIsPi && requestPi !== recordedPi) {
        return await refundExtraAndRespond(requestPi, { ...DUPLICATE, logNote: "Duplicate payment for an already-processed order — refunding" });
      }
      const ok = order.escrow_status === "held" || order.escrow_status === "released";
      return new Response(JSON.stringify({ success: ok, status: order.escrow_status, message: ok ? "Escrow already verified" : "Order is not awaiting payment" }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (!paymentSucceeded) {
      return new Response(JSON.stringify({ success: false, message: "Payment not yet completed.", status: "pending" }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Bind the paid amount to the order's CURRENT locked snapshot. On a reused pending order,
    // create_package_order refreshes price_snapshot (ON CONFLICT DO UPDATE), but a stale session minted at the
    // old price stays payable with the same order_id metadata. release-package-payout pays against the current
    // snapshot, so accepting a differently-priced charge is a direct over/under-payout — refund it instead.
    const expectedCents = Math.round(Number(order.price_snapshot) * 100);
    if (foundAmount !== null && foundAmount !== expectedCents) {
      return await refundExtraAndRespond(foundPi, { ...MISMATCH, logNote: "Amount mismatch — refusing to hold; refunding stray payment" });
    }

    // Hold via a CONDITIONAL CAS: flip only if the order is STILL 'pending' AND still carries the exact
    // price_snapshot the charge was validated against. A concurrent re-checkout can refresh price_snapshot, and
    // a concurrent verify can hold first — both make this CAS match 0 rows, and we must NOT hold at an
    // unvalidated price or double-record a payment.
    const { data: heldRows, error: updateError } = await supabaseClient
      .from("package_orders")
      .update({
        escrow_status: "held",
        order_status: "in_progress",
        escrow_payment_intent_id: foundPi,
        ...(sessionId ? { escrow_checkout_session_id: sessionId } : {}),
      })
      .eq("id", orderId)
      .eq("escrow_status", "pending")
      .eq("price_snapshot", order.price_snapshot)
      .select("id");
    if (updateError) throw new Error("Failed to update order status");
    if (!heldRows || heldRows.length === 0) {
      // CAS didn't hold — re-read to learn WHY before touching money.
      const { data: fresh } = await supabaseClient
        .from("package_orders")
        .select("escrow_status, escrow_payment_intent_id")
        .eq("id", orderId)
        .single();
      const s = fresh?.escrow_status;
      if (s === "held" || s === "released") {
        // Another verify won. If it recorded a DIFFERENT payment, THIS request's payment is a duplicate → refund.
        const winnerPi = fresh?.escrow_payment_intent_id;
        if (foundPi && winnerPi && winnerPi.startsWith("pi_") && foundPi !== winnerPi) {
          return await refundExtraAndRespond(foundPi, { ...DUPLICATE, logNote: "Concurrent verify held a different payment — refunding this duplicate" });
        }
        return new Response(JSON.stringify({ success: true, status: s, message: "Escrow already verified" }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (s === "pending") {
        // Still pending ⇒ the CAS failed on price_snapshot: a re-checkout refreshed it under us. The charge no
        // longer matches the live price — refund and ask the buyer to retry.
        return await refundExtraAndRespond(foundPi, { ...MISMATCH, logNote: "Snapshot changed under verify — refusing to hold" });
      }
      return new Response(JSON.stringify({ success: false, status: s ?? "unknown", message: "Order is not awaiting payment" }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    await writePaymentEvent(supabaseClient, {
      event_type: "escrow_held",
      entity_type: "package_order",
      entity_id: orderId,
      campaign_id: null,
      actor_role: "business",
      amount_cents: foundAmount ?? undefined,
      stripe_id: foundPi ?? undefined,
    }, "[VERIFY-PACKAGE-ORDER-ESCROW]");

    logStep("Order escrow verified", { orderId, paymentIntentId: foundPi });

    return new Response(JSON.stringify({ success: true, message: "Payment verified! Your order is now in progress.", status: "held" }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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
