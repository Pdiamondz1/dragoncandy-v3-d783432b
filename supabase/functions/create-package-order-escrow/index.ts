import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  APP_ORIGINS,
  DEFAULT_ORIGIN,
  INTERNAL_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
  WWW_APP_ORIGINS,
} from "../_shared/origins.ts";
import { testModeCustomText } from "../_shared/test-mode-text.ts";
import { testModePaymentMethodTypes } from "../_shared/test-mode-payment-methods.ts";

// Guest-capable package checkout. DEPLOY WITH verify_jwt=false: the hero buyer is a restaurant with NO
// DragonCandy account who arrived via a shareable link, so there is no JWT to verify. Auth is resolved
// INSIDE: a logged-in buyer sends their user JWT (→ buyer_user_id); a guest sends the anon key + a
// buyer_email (→ guest order with an opaque bearer token). Order creation + snapshotting is done by the
// SECURITY DEFINER create_package_order RPC (service-role only), which is the sole authority on whether the
// package is purchasable (published + public creator) — this function never trusts client-supplied pricing.

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-PACKAGE-ORDER-ESCROW] ${step}${detailsStr}`);
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

    const { packageId, intake, buyerEmail: guestEmail } = await req.json();
    if (!packageId) throw new Error("Missing required field: packageId");

    // ── Resolve the buyer principal ────────────────────────────────────────────────────────────────
    // A logged-in buyer's supabase-js client sends their user JWT; a guest's client sends the anon key
    // (getUser rejects it) → we fall through to the guest path, which requires an email. Never trust the
    // client to assert "I am user X"; the JWT (validated here) or the guest email is the only principal.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    let buyerUserId: string | null = null;
    let buyerEmail: string | null = null;
    let resolvedOrgId: string | null = null;

    if (token && token !== anonKey && token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: userData } = await supabaseClient.auth.getUser(token);
      if (userData?.user) {
        buyerUserId = userData.user.id;
        buyerEmail = userData.user.email ?? null;
        // SERVER-DERIVE the buyer's org from their own profile — never accept a client-supplied org id.
        // A buyer must not be able to stamp their order with an org they don't belong to; this keeps the
        // money rail's tenant id honest as consolidated billing (saved cards / org customer) grows onto it.
        const { data: prof } = await supabaseClient
          .from("profiles").select("org_id").eq("id", buyerUserId).maybeSingle();
        resolvedOrgId = (prof?.org_id as string | null) ?? null;
      }
    }

    if (!buyerUserId) {
      // Guest checkout.
      if (!guestEmail || !/.+@.+\..+/.test(String(guestEmail))) {
        throw new Error("A valid buyer email is required for guest checkout");
      }
      buyerEmail = String(guestEmail).trim();
      resolvedOrgId = null; // guests have no org
    }
    logStep("Buyer resolved", { buyerUserId, isGuest: !buyerUserId, orgId: resolvedOrgId });

    // ── Create the order (authoritative: RPC validates purchasability + snapshots price/scope/intake) ──
    const { data: created, error: rpcError } = await supabaseClient.rpc("create_package_order", {
      p_package_id: packageId,
      p_intake: intake ?? {},
      p_buyer_user_id: buyerUserId,
      p_buyer_org_id: resolvedOrgId,
      p_buyer_email: buyerEmail,
    });
    if (rpcError) throw new Error(`Could not create order: ${rpcError.message}`);

    const orderId = created?.order_id as string | undefined;
    const guestToken = (created?.guest_token as string | null) ?? null;
    if (!orderId) throw new Error("Order creation returned no order id");
    logStep("Order created", { orderId, guest: !!guestToken });

    // Read back the locked snapshot for the charge amount + package title (never trust a client amount).
    const { data: order, error: orderErr } = await supabaseClient
      .from("package_orders")
      .select("price_snapshot, escrow_status, escrow_checkout_session_id, package:creator_packages(title)")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) throw new Error("Could not load created order");

    // A reused pending order may already be paid (idempotent re-checkout). Don't mint a second session.
    if (order.escrow_status === "held" || order.escrow_status === "released") {
      logStep("Order already paid", { orderId, escrowStatus: order.escrow_status });
      return new Response(JSON.stringify({ orderId, guestToken, alreadyPaid: true }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    const amountCents = Math.round(Number(order.price_snapshot) * 100);
    if (!amountCents || amountCents < 50) throw new Error("Order has no valid price");
    const packageTitle = (order.package as { title?: string } | null)?.title || "Creator Package";

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // ── Single-flight lock: only ONE concurrent checkout may mint a session for this pending order ──────
    // Two near-simultaneous checkouts (same buyer, two tabs) would otherwise both reach sessions.create before
    // either stored escrow_checkout_session_id, leaving two payable sessions. Atomically claim checkout_locked_at
    // (a conditional UPDATE Postgres serializes on the row); the loser matches 0 rows and returns a soft retry
    // instead of minting. The lock is released when the session is stored below; a short TTL frees a lock
    // orphaned by a crash/error so checkout can never wedge permanently. Millis stripped from the cutoff so the
    // value carries no '.' that PostgREST's or() filter parser could mis-split.
    const lockCutoff = new Date(Date.now() - 90 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const { data: lockRows, error: lockErr } = await supabaseClient
      .from("package_orders")
      .update({ checkout_locked_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("escrow_status", "pending")
      .or(`checkout_locked_at.is.null,checkout_locked_at.lt.${lockCutoff}`)
      .select("id");
    if (lockErr) throw new Error(`Could not acquire checkout lock: ${lockErr.message}`);
    if (!lockRows || lockRows.length === 0) {
      logStep("Checkout already in progress for this order — asking client to retry", { orderId });
      return new Response(JSON.stringify({
        retry: true,
        orderId,
        guestToken,
        message: "Checkout is already being prepared for this order; please try again in a moment.",
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    // At most ONE payable checkout session per order. On a reused pending order, EXPIRE the prior session
    // before minting a new one — otherwise a buyer who opens two checkout tabs could pay both, and only the
    // first would hold the order while the second stays captured-but-unrefunded (double charge). If the prior
    // session turns out already PAID, don't mint a second at all — treat the order as paid and let verify hold it.
    if (order.escrow_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(order.escrow_checkout_session_id);
        if (existing.payment_status === "paid") {
          logStep("Prior session already paid — not minting a second", { orderId, sessionId: existing.id });
          return new Response(JSON.stringify({ orderId, guestToken, alreadyPaid: true, sessionId: existing.id }), {
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
            status: 200,
          });
        }
        if (existing.status === "open") {
          await stripe.checkout.sessions.expire(order.escrow_checkout_session_id);
          logStep("Expired prior pending session", { orderId, sessionId: existing.id });
        }
        // else: status 'expired'/'complete' — already unpayable, safe to mint a fresh one.
      } catch (expireErr) {
        // We could NOT confirm the prior session is unpayable. Minting now risks two payable sessions for one
        // order (double charge), so ABORT — the buyer's retry re-enters here and expires it cleanly.
        logStep("Could not neutralize prior session — aborting to avoid a second payable session", { orderId, error: String(expireErr) });
        throw new Error("Could not prepare checkout; please try again.");
      }
    }

    // Resolve the redirect host from an ALLOWLIST (mirrors _shared/cors.ts) — NEVER the raw Origin header: for
    // guests the success URL embeds the opaque order token, so a spoofed Origin must not be able to send
    // Stripe's post-payment redirect (token and all) to an attacker-controlled domain.
    const ALLOWED_ORIGINS = new Set<string>([
      ...APP_ORIGINS,
      ...WWW_APP_ORIGINS,
      ...INTERNAL_APP_ORIGINS,
      LOVABLE_PREVIEW_ORIGIN,
    ]);
    const reqOrigin = req.headers.get("origin") ?? "";
    const origin = ALLOWED_ORIGINS.has(reqOrigin)
      ? reqOrigin
      : (Deno.env.get("PUBLIC_SITE_URL") || DEFAULT_ORIGIN);

    // Guests land on their tokenized order page; logged-in buyers on the dashboard order. Both carry the
    // session id so the return page can call verify-package-order-escrow.
    const successBase = guestToken
      ? `${origin}/order/${guestToken}`
      : `${origin}/dashboard/orders/${orderId}`;

    const session = await stripe.checkout.sessions.create({
      customer_email: buyerEmail ?? undefined,
      custom_text: testModeCustomText(stripeKey),
      payment_method_types: testModePaymentMethodTypes(stripeKey),
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Package: ${packageTitle}`,
              // F4 — plain-English "your money is held safely", not "escrow".
              description: "Your payment is held safely and only released to the creator once you approve the work.",
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${successBase}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successBase}?payment=cancelled`,
      metadata: { order_id: orderId, type: "package_order_escrow" },
      payment_intent_data: {
        metadata: { order_id: orderId, type: "package_order_escrow" },
      },
    });
    logStep("Checkout session created", { sessionId: session.id });

    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as { id?: string } | null)?.id;

    const { error: updateError } = await supabaseClient
      .from("package_orders")
      .update({
        escrow_status: "pending",
        escrow_payment_intent_id: paymentIntentId || session.id,
        escrow_checkout_session_id: session.id,
        checkout_locked_at: null, // release the single-flight lock now that this order's one session exists
      })
      .eq("id", orderId);
    if (updateError) {
      logStep("Warning: failed to store session id on order", { error: updateError.message });
    } else {
      await writePaymentEvent(supabaseClient, {
        event_type: "escrow_authorized",
        entity_type: "package_order",
        entity_id: orderId,
        campaign_id: null,
        actor_id: buyerUserId ?? undefined,
        actor_role: "business",
        amount_cents: amountCents,
        stripe_id: session.id,
      }, "[CREATE-PACKAGE-ORDER-ESCROW]");
    }

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id, orderId, guestToken }), {
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
