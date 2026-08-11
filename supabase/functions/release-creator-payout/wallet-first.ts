import type Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { applyWalletFirstPayoutCore } from "../_shared/wallet-first-payout.ts";

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

// Collaboration-bound adapter over the shared wallet-first payout engine (_shared/wallet-first-payout.ts).
// Keeps this function's signature stable for the handler and the unit tests; all the money mechanics (credit
// atomically-with-marker → ledger → best-effort exactly-once flush → finalize) live in the shared core so the
// package-order money rail can reuse them verbatim rather than fork (the sponsorship path forked and drifted).
export async function applyWalletFirstPayout(d: WalletFirstDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  return applyWalletFirstPayoutCore({
    supabase: d.supabase,
    stripe: d.stripe,
    creatorId: d.creatorId,
    callerId: d.callerId,
    creatorPayout: d.creatorPayout,
    stripeAccountId: d.stripeAccountId,
    creatorPayoutReady: d.creatorPayoutReady,
    logPrefix: "[RELEASE-CREATOR-PAYOUT]",
    entity: {
      entityType: "collaboration",
      entityId: d.collaborationId,
      campaignId: d.campaignId,
      creditRpc: "credit_pending_balance_for_payout",
      creditIdParam: "p_collaboration_id",
      finalize: (supabase) => finalizePayoutState(supabase, d.collaborationId, d.campaignId),
    },
  });
}
