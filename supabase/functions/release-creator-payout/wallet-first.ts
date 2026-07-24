import type Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { flushPendingBalance } from "../_shared/flush-pending-balance.ts";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[RELEASE-CREATOR-PAYOUT] ${step}${detailsStr}`);
};

// Finalize the collaboration + campaign state after money has moved (credited to the wallet). Retried so a
// transient DB blip doesn't leave the payout half-applied (money credited, state not finalized). Returns true
// only if BOTH updates succeed; re-running just re-sets the same terminal values (idempotent). Escrow goes
// straight to 'released' here — the wallet-first path has no intermediate 'releasing' pre-commit.
export async function finalizePayoutState(
  supabaseClient: SupabaseClient,
  collaborationId: string,
  campaignId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    // Re-entry is guarded by the durable payout marker (`payout_executed_at`, set ATOMICALLY with the wallet
    // credit) — NOT by this escrow flip: a re-invocation short-circuits to finalize-only via the early
    // re-entry guard in the handler. Retrying re-sets the same terminal values (idempotent).
    const { error: collabErr } = await supabaseClient
      .from("campaign_collaborations")
      .update({ status: "completed", completed_at: new Date().toISOString(), content_status: "approved" })
      .eq("id", collaborationId);

    const { error: campaignErr } = await supabaseClient
      .from("campaigns")
      .update({ escrow_status: "released" })
      .eq("id", campaignId);

    if (!collabErr && !campaignErr) return true;

    logStep("Finalize attempt failed", {
      attempt,
      collaboration: collabErr?.message,
      campaign: campaignErr?.message,
    });
    if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  return false;
}

export interface WalletFirstDeps {
  supabase: SupabaseClient;
  stripe: Stripe;
  collaborationId: string;
  campaignId: string;
  creatorId: string;
  callerId: string | null;
  creatorPayout: number; // dollars
  stripeAccountId: string | null;
  creatorPayoutReady: boolean;
}

// The single wallet-first payout body, shared by no one but factored out of the `serve` handler so it is
// dependency-injected and unit-testable (the handler builds its own supabase/stripe from env). Returns a plain
// { status, body } — the handler wraps it in a Response (keeps req/CORS out of the testable unit).
//
// Every payout is ONE shape: credit the pending wallet atomically-with-the-durable-marker, then (if the
// creator can receive payouts now) best-effort exactly-once flush to Stripe, then finalize. There is no
// second money path, so the two #329 residuals — cross-path concurrent double-pay and Stripe-up/DB-down
// marker split-brain — close by construction. See docs/wiki/concepts/payout-finalization-consistency.md.
export async function applyWalletFirstPayout(d: WalletFirstDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  const { supabase, stripe, collaborationId, campaignId, creatorId, callerId, creatorPayout, stripeAccountId, creatorPayoutReady } = d;

  // Credit the pending wallet ATOMICALLY with the durable marker (row-locked inside the RPC): concurrent
  // invocations cannot double-credit — exactly one credits + marks, the rest return 'already'. On error the
  // RPC's tx rolls back entirely (no partial credit, no marker) → safe to retry.
  const { data: creditResult, error: creditError } = await supabase.rpc("credit_pending_balance_for_payout", {
    p_collaboration_id: collaborationId,
    p_user_id: creatorId,
    p_amount: creatorPayout,
  });
  if (creditError) throw new Error(`Failed to credit pending balance: ${creditError.message}`);
  const alreadyCredited = creditResult === "already";

  logStep(alreadyCredited ? "Pending balance already credited (concurrent re-entry)" : "Credited creator wallet", {
    added: alreadyCredited ? 0 : creatorPayout,
    ready: creatorPayoutReady,
  });

  // Ledger — only when THIS call actually credited (skip on a concurrent-race 'already', exactly as the old
  // pending path did). Collaboration-keyed: `payment_released` decrements business In Escrow (now fires on
  // EVERY payout — the old pending path never wrote it); `payout_pending_wallet` is the creator "earned"
  // signal. The wallet→Stripe transfer_created is written USER-keyed by the flush (a wallet-movement audit
  // event, deliberately NOT counted as earnings).
  if (!alreadyCredited) {
    const amountCents = Math.round(creatorPayout * 100);
    const events = [
      { event_type: "content_approved", actor_id: callerId ?? undefined, actor_role: "business" as const },
      { event_type: "payment_release_initiated", actor_role: "system" as const, amount_cents: amountCents, metadata: { destination: stripeAccountId } },
      { event_type: "payment_released", actor_id: creatorId, actor_role: "creator" as const, amount_cents: amountCents },
      { event_type: "payout_pending_wallet", actor_id: creatorId, actor_role: "creator" as const, amount_cents: amountCents, metadata: { reason: creatorPayoutReady ? "flushing_to_stripe" : "creator_onboarding_incomplete" } },
    ];
    for (const ev of events) {
      try {
        await writePaymentEvent(supabase, { entity_type: "collaboration", entity_id: collaborationId, campaign_id: campaignId, ...ev }, "[RELEASE-CREATOR-PAYOUT]");
      } catch (auditErr) {
        console.error("Payment event logging failed (non-blocking):", auditErr);
      }
    }
  }

  // Best-effort exactly-once flush to Stripe if the creator can receive payouts NOW. The wallet credit is
  // already durable; a flush failure leaves the money SAFELY in the wallet (reconcile-pending-flushes + the
  // webhook/poll triggers heal it). verifyPayoutReady (decided by the handler, not the flush's own
  // onboarding-flag check) is the "flush now?" decision, so a stale-false flag doesn't wrongly hold the
  // money — the handler's stale-flag self-heal set stripe_onboarding_complete=true before this, so the
  // flush's internal check now passes too.
  if (creatorPayoutReady && stripeAccountId) {
    try {
      // assumeReady: the handler already verified readiness via verifyPayoutReady (a live Stripe check), so
      // don't let flushPendingBalance's re-read of the CACHED stripe_onboarding_complete flag (possibly
      // stale-false, self-heal not guaranteed visible) no-op a genuinely-ready payout into the wallet.
      await flushPendingBalance(stripe, supabase, stripeAccountId, { assumeReady: true });
    } catch (flushErr) {
      console.error("[RELEASE-CREATOR-PAYOUT] flush failed (money safe in wallet; reconcile will retry):", flushErr);
    }
  }

  // Finalize DB state (retried). Wallet credit + marker are committed atomically → re-invocation is
  // finalize-only (early re-entry guard), so a persistent finalize failure can safely surface for retry.
  const finalized = await finalizePayoutState(supabase, collaborationId, campaignId);
  if (!finalized) {
    console.error("Credited + marked but finalize failed after retries — surfacing for retry.", { collaborationId });
    return { status: 500, body: { success: false, needsRetry: true, error: "finalize_failed" } };
  }
  return { status: 200, body: { success: true, amount: creatorPayout, method: creatorPayoutReady ? "wallet_flush" : "pending_balance" } };
}
