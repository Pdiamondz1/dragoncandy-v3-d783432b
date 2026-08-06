import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyPayoutReady } from "../_shared/payout-ready.ts";
import { applyWalletFirstPayoutCore } from "../_shared/wallet-first-payout.ts";

// Release a package order's held escrow to the creator's wallet. DEPLOY WITH verify_jwt=false: the release
// is triggered by the BUYER approving the work (a logged-in buyer via JWT, OR a guest via their order token)
// or by the auto-approve/reconcile cron (service role). The creator can NOT release their own payout — only
// the payer or the platform. Money mechanics (credit-atomically-with-marker → best-effort exactly-once flush
// → finalize) are the SHARED wallet-first core, identical to the campaign path, keyed here on package_order.

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[RELEASE-PACKAGE-PAYOUT] ${step}${detailsStr}`);
};

// Terminal state for a completed package order, set AFTER money has moved (durable marker already committed
// with the wallet credit). Retried so a transient DB blip can't leave the payout half-applied. Idempotent —
// re-running re-sets the same terminal values — so a re-invocation (client retry or reconcile sweep) is
// finalize-only and safe. Mirrors release-creator-payout's finalizePayoutState, but a package order is a
// single row (no separate campaign row to flip).
export async function finalizePackageOrderState(
  supabase: SupabaseClient,
  orderId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { error } = await supabase
      .from("package_orders")
      .update({
        order_status: "completed",
        content_status: "approved",
        escrow_status: "released",
        completed_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (!error) return true;
    logStep("Finalize attempt failed", { attempt, error: error.message });
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
    { auth: { persistSession: false } },
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // Don't hard-fail on a missing Authorization header: a guest approval carries its credential in the
    // body (guestToken), so a bare guest surface that never attaches the anon key still reaches the
    // guest-token branch. An empty token simply can't match the service-role key or a valid JWT.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServiceRole = !!token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const { orderId, guestToken } = await req.json();
    if (!orderId) throw new Error("Missing required field: orderId");

    // Load the order first — its buyer_user_id / buyer_guest_token are what we authorize against.
    const { data: order, error: orderErr } = await supabaseClient
      .from("package_orders")
      .select("id, creator_id, buyer_user_id, buyer_guest_token, escrow_status, order_status, content_status, price_snapshot, platform_fee_snapshot, payout_executed_at, stripe_transfer_id")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) throw new Error(`Order not found: ${orderErr?.message}`);

    // ── Authorize: service-role (cron), OR the buyer approving (logged-in JWT / guest token). NOT the creator ──
    let callerId: string | null = null;
    if (isServiceRole) {
      logStep("Service-role call (auto-approve / reconcile)");
    } else if (guestToken && order.buyer_guest_token && guestToken === order.buyer_guest_token) {
      logStep("Guest buyer approval", { orderId });
    } else {
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      if (userError || !userData?.user) throw new Error("User not authenticated");
      if (userData.user.id !== order.buyer_user_id) {
        throw new Error("Only the buyer can release this payout");
      }
      callerId = userData.user.id;
      logStep("Buyer authenticated", { userId: callerId });
    }

    // ── Durable re-entry guard ──────────────────────────────────────────────────────────────────────
    // Marker set ⇒ money already moved (marker is committed ATOMICALLY with the wallet credit). Re-invocation
    // finalizes ONLY — never re-credits. Handles client retries AND the reconcile sweep. Runs BEFORE the
    // escrow gate so a reconcile call (escrow already 'released') finalizes instead of throwing.
    if (order.payout_executed_at || order.stripe_transfer_id) {
      logStep("Payout already executed — finalize-only re-entry", { orderId });
      const finalized = await finalizePackageOrderState(supabaseClient, orderId);
      return new Response(JSON.stringify({ success: finalized, finalized, alreadyPaid: true, ...(finalized ? {} : { needsRetry: true }) }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: finalized ? 200 : 500,
      });
    }

    // ── Delivery gate: the creator must have DELIVERED before any payout (the core escrow guarantee) ──────
    // Releasing represents buyer approval of submitted work (or the v1c auto-approve cron after the SLA);
    // either way content must be at least 'submitted'. This blocks a buyer/guest from paying the creator
    // immediately after checkout — right after verify the order is 'in_progress' with content_status null, so
    // there is nothing to approve. (The v1c delivery layer sets 'submitted' on creator upload and
    // 'approved'/'auto_approved' at approval time.) Reconcile re-entry short-circuits at the guard above, so
    // this never blocks the self-heal sweep.
    if (!["submitted", "approved", "auto_approved"].includes(order.content_status ?? "")) {
      throw new Error(`Cannot release payout: content is not delivered (content_status='${order.content_status ?? "none"}')`);
    }

    // ── Durable claim BEFORE any money moves (symmetric with refund's 'held' → 'refunding') ──────────────
    // Atomically CAS 'held' → 'releasing'. This is what closes the release-vs-refund race: both functions CAS
    // the same escrow_status column on the same row, so Postgres serializes them — whichever flips out of
    // 'held' first wins, and the loser's `WHERE escrow_status='held'` matches 0 rows and aborts. An order can
    // therefore never be both refunded and paid out. A prior release that already claimed 'releasing' but died
    // before crediting (payout_executed_at still null — the marker-set case returned at the re-entry guard
    // above) is RESUMED here, not re-raced; the credit RPC is itself row-locked + credit-at-most-once.
    if (order.escrow_status === "held") {
      // Fold the delivery gate INTO the CAS predicate. The content_status read above is a non-locked snapshot,
      // so a request_package_revision (which sets content_status='rejected' while leaving escrow 'held') could
      // commit between that read and this claim; guarding the CAS on content_status too makes claim-and-gate
      // atomic — a revised order matches 0 rows here and this payout aborts instead of paying over the buyer's
      // revision request. Keeps the escrow-column CAS as the single serialization point vs. refund.
      const { data: claimed, error: claimErr } = await supabaseClient
        .from("package_orders")
        .update({ escrow_status: "releasing" })
        .eq("id", orderId)
        .eq("escrow_status", "held")
        .in("content_status", ["submitted", "approved", "auto_approved"])
        .select("id");
      if (claimErr) throw new Error(`Failed to claim order for payout: ${claimErr.message}`);
      if (!claimed || claimed.length === 0) {
        throw new Error("Order is no longer releasable (concurrent refund, or a revision was requested)");
      }
    } else if (order.escrow_status !== "releasing") {
      throw new Error(`Cannot release payout: escrow status is '${order.escrow_status}', expected 'held' or 'releasing'`);
    }

    // Creator net = the LOCKED snapshots (price − platform fee), captured at purchase. The fee was computed
    // once with PACKAGE_FEE_RATE in create_package_order; using the snapshot keeps the payout correct even if
    // the rate later changes. Never recompute against getOrgTakeRate — the package fee is flat, buyer-agnostic.
    const creatorPayout = Number(order.price_snapshot) - Number(order.platform_fee_snapshot ?? 0);
    if (!(creatorPayout > 0)) throw new Error("Computed creator payout is not positive");

    const { data: creatorProfile } = await supabaseClient
      .from("creator_profiles")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("user_id", order.creator_id)
      .maybeSingle();

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // "Trust true, verify false" so a stale cached flag can't wrongly park the payout in the wallet.
    const { ready: creatorPayoutReady, corrected: flagWasStale } = await verifyPayoutReady(
      stripe, creatorProfile?.stripe_account_id, creatorProfile?.stripe_onboarding_complete,
    );
    if (flagWasStale) {
      await supabaseClient.from("creator_profiles")
        .update({ stripe_onboarding_complete: true })
        .eq("user_id", order.creator_id);
    }

    logStep("Payout calculation", { orderId, creatorPayout, ready: creatorPayoutReady });

    const result = await applyWalletFirstPayoutCore({
      supabase: supabaseClient,
      stripe,
      creatorId: order.creator_id,
      callerId,
      creatorPayout,
      stripeAccountId: creatorProfile?.stripe_account_id ?? null,
      creatorPayoutReady,
      logPrefix: "[RELEASE-PACKAGE-PAYOUT]",
      entity: {
        entityType: "package_order",
        entityId: orderId,
        campaignId: null,
        creditRpc: "credit_pending_balance_for_order",
        creditIdParam: "p_order_id",
        finalize: (supabase) => finalizePackageOrderState(supabase, orderId),
      },
    });

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
