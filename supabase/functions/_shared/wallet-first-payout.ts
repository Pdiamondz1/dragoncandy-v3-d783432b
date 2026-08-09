import type Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { writePaymentEvent, type PaymentEvent } from "./payment-events.ts";
import { flushPendingBalance } from "./flush-pending-balance.ts";

// Entity-specific wiring for a wallet-first payout. The engine (below) is identical for every payout type;
// only these differ: which credit RPC + id-param names the money-in-DB step, how the payment_events are
// keyed, and how terminal state is finalized. Today's only instance is `collaboration` (campaigns); the
// package-order money rail plugs in a second instance without touching the engine.
export interface PayoutEntityConfig {
  entityType: PaymentEvent["entity_type"]; // payment_events.entity_type key, e.g. "collaboration"
  entityId: string;                        // the row id the ledger events are keyed to
  campaignId: string | null;               // payment_events.campaign_id (collaboration: campaign; order: null)
  creditRpc: string;                       // the atomic credit-with-durable-marker RPC name
  creditIdParam: string;                   // that RPC's id param name, e.g. "p_collaboration_id"
  // Set terminal state AFTER money has moved (the durable marker is already committed with the credit). Owns
  // its own retry; returns true only if fully finalized. Re-running re-sets the same terminal values, so it
  // is idempotent — a persistent false safely surfaces for retry.
  finalize: (supabase: SupabaseClient) => Promise<boolean>;
}

export interface WalletFirstPayoutInput {
  supabase: SupabaseClient;
  stripe: Stripe;
  creatorId: string;
  callerId: string | null;
  creatorPayout: number; // dollars
  stripeAccountId: string | null;
  creatorPayoutReady: boolean;
  entity: PayoutEntityConfig;
  logPrefix?: string;
}

// The single wallet-first payout body — dependency-injected and entity-agnostic, so it is unit-testable and
// shared across payout types. Every payout is ONE shape: credit the pending wallet ATOMICALLY with the
// durable marker, then (if the creator can receive payouts now) best-effort exactly-once flush to Stripe,
// then finalize. There is no second money path, so the two #329 residuals — cross-path concurrent double-pay
// and Stripe-up/DB-down marker split-brain — close by construction. Returns a plain { status, body } so the
// caller can wrap it in a Response (keeps req/CORS out of the testable unit).
// See docs/wiki/concepts/payout-finalization-consistency.md.
export async function applyWalletFirstPayoutCore(
  d: WalletFirstPayoutInput,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { supabase, stripe, creatorId, callerId, creatorPayout, stripeAccountId, creatorPayoutReady, entity } = d;
  const prefix = d.logPrefix ?? "[WALLET-FIRST-PAYOUT]";
  const logStep = (step: string, details?: unknown) => {
    const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
    console.log(`${prefix} ${step}${detailsStr}`);
  };

  // Credit the pending wallet ATOMICALLY with the durable marker (row-locked inside the RPC): concurrent
  // invocations cannot double-credit — exactly one credits + marks, the rest return 'already'. On error the
  // RPC's tx rolls back entirely (no partial credit, no marker) → safe to retry.
  const { data: creditResult, error: creditError } = await supabase.rpc(entity.creditRpc, {
    [entity.creditIdParam]: entity.entityId,
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
  // pending path did). Entity-keyed: `payment_released` decrements the business "In Escrow" (fires on EVERY
  // payout); `payout_pending_wallet` is the creator "earned" signal. The wallet→Stripe transfer_created is
  // written USER-keyed by the flush (a wallet-movement audit event, deliberately NOT counted as earnings).
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
        await writePaymentEvent(supabase, { entity_type: entity.entityType, entity_id: entity.entityId, campaign_id: entity.campaignId, ...ev }, prefix);
      } catch (auditErr) {
        console.error("Payment event logging failed (non-blocking):", auditErr);
      }
    }
  }

  // Best-effort exactly-once flush to Stripe if the creator can receive payouts NOW. The wallet credit is
  // already durable; a flush failure leaves the money SAFELY in the wallet (reconcile-pending-flushes + the
  // webhook/poll triggers heal it). assumeReady: the caller already verified readiness via a live Stripe
  // check, so don't let flushPendingBalance's re-read of the CACHED onboarding flag (possibly stale-false)
  // no-op a genuinely-ready payout into the wallet.
  if (creatorPayoutReady && stripeAccountId) {
    try {
      await flushPendingBalance(stripe, supabase, stripeAccountId, { assumeReady: true });
    } catch (flushErr) {
      console.error(`${prefix} flush failed (money safe in wallet; reconcile will retry):`, flushErr);
    }
  }

  // Finalize terminal state (entity-specific, self-retried). Wallet credit + marker are committed atomically
  // → re-invocation is finalize-only (handler re-entry guard), so a persistent finalize failure can safely
  // surface for retry.
  const finalized = await entity.finalize(supabase);
  if (!finalized) {
    console.error(`${prefix} Credited + marked but finalize failed after retries — surfacing for retry.`, { entityId: entity.entityId });
    return { status: 500, body: { success: false, needsRetry: true, error: "finalize_failed" } };
  }
  return { status: 200, body: { success: true, amount: creatorPayout, method: creatorPayoutReady ? "wallet_flush" : "pending_balance" } };
}
