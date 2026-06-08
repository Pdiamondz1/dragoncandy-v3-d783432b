import type Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "./payment-events.ts";

type ProfileTable = "creator_profiles" | "business_profiles";

export interface TransferPendingParams {
  table: ProfileTable;
  userId: string;
  stripeAccountId: string;
  pendingBalance: number; // dollars, the value just read
  source: "manual" | "autoflush";
}

export const BALANCE_CHANGED =
  "Withdrawal already in progress or balance has changed. Please try again.";

/**
 * Core money movement, shared by the manual withdraw endpoint and the auto-flush
 * triggers. Atomically claims the balance (so only one caller can move a given
 * balance), transfers it to the connected account, restores the balance on a
 * Stripe failure, then writes the ledger event.
 *
 * Throws BALANCE_CHANGED when the atomic claim matched 0 rows (someone else won
 * the race, or the balance changed). Throws the Stripe error (AFTER restoring the
 * balance) if the transfer fails. Lets a ledger-write failure propagate WITHOUT
 * restoring — the money already moved correctly; only the audit row is missing.
 *
 * Idempotency: `withdraw_${userId}_${cents}` makes a retry of THIS call safe.
 * Cross-caller single-transfer is guaranteed by the atomic DB claim, NOT the key.
 * Known limitation (spec §5.1, deferred): two SEPARATE balances of the identical
 * cents amount within Stripe's ~24h key window can collide on the key; the atomic
 * claim still prevents double-pay, but the second transfer may replay. The robust
 * fix needs a persisted balance-event id (out of scope).
 */
export async function transferPendingBalance(
  stripe: Stripe,
  supabase: SupabaseClient,
  { table, userId, stripeAccountId, pendingBalance, source }: TransferPendingParams,
): Promise<{ transferId: string; amountCents: number }> {
  const amountCents = Math.round(pendingBalance * 100);

  // Atomic claim: zero the balance only if it still equals what we read.
  const { data: claimed, error: claimError } = await supabase
    .from(table)
    .update({ pending_balance: 0 })
    .eq("user_id", userId)
    .eq("pending_balance", pendingBalance)
    .select("pending_balance");

  if (claimError || !claimed?.length) {
    throw new Error(BALANCE_CHANGED);
  }

  const isManual = source === "manual";
  const withdrawalType = isManual ? "pending_balance" : "pending_balance_autoflush";
  const description = isManual
    ? "DragonCandy platform wallet withdrawal"
    : "DragonCandy pending balance auto-payout";
  const metadataType = isManual ? "wallet_withdrawal" : "pending_balance_autoflush";

  let transfer: { id: string };
  try {
    transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "usd",
      destination: stripeAccountId,
      description,
      metadata: { user_id: userId, withdrawal_type: withdrawalType },
    }, { idempotencyKey: `withdraw_${userId}_${amountCents}` });
  } catch (stripeError) {
    // Restore so a later trigger / manual retry can move it again. If the restore
    // itself fails, surface it loudly — the balance is now zeroed with no transfer.
    const { error: restoreError } = await supabase
      .from(table)
      .update({ pending_balance: pendingBalance })
      .eq("user_id", userId);
    if (restoreError) {
      console.error(`[FLUSH-PENDING-BALANCE] CRITICAL: failed to restore pending_balance for ${userId} after transfer error`, restoreError);
    }
    throw stripeError;
  }

  // After a successful transfer: a ledger failure must NOT restore the balance.
  await writePaymentEvent(supabase, {
    event_type: "transfer_created",
    entity_type: table === "creator_profiles" ? "collaboration" : "sponsorship",
    entity_id: userId,
    campaign_id: null,
    actor_id: userId,
    actor_role: table === "creator_profiles" ? "creator" : "business",
    amount_cents: amountCents,
    stripe_id: transfer.id,
    metadata: { type: metadataType },
  }, "[FLUSH-PENDING-BALANCE]");

  return { transferId: transfer.id, amountCents };
}

/**
 * Auto-flush entry point: given a Stripe connected-account id (from the
 * account.updated webhook or an onboarding-return status poll), release any held
 * pending_balance to that account — but only when the account is payout-ready and
 * a balance is actually owed. State-driven and idempotent: safe to call any number
 * of times, in any order. Never throws for the benign "lost the race" case;
 * re-throws genuine failures (e.g. Stripe) so the caller can log them.
 */
export async function flushPendingBalance(
  stripe: Stripe,
  supabase: SupabaseClient,
  stripeAccountId: string,
): Promise<{ flushed: boolean; amount: number; transferId?: string }> {
  if (!stripeAccountId) return { flushed: false, amount: 0 };

  // Resolve the owning profile by connected-account id: creator first, then business.
  // (Mirrors how the existing account.updated webhook resolves — creator_profiles
  // then business_profiles, not org_units.)
  const tables: ProfileTable[] = ["creator_profiles", "business_profiles"];
  let table: ProfileTable | null = null;
  let row: { user_id: string; stripe_onboarding_complete: boolean | null; pending_balance: number | null } | null = null;

  for (const t of tables) {
    const { data } = await supabase
      .from(t)
      .select("user_id, stripe_onboarding_complete, pending_balance")
      .eq("stripe_account_id", stripeAccountId)
      .maybeSingle();
    if (data?.user_id) { table = t; row = data; break; }
  }

  if (!table || !row) return { flushed: false, amount: 0 };

  const ready = row.stripe_onboarding_complete === true;
  const pending = row.pending_balance ?? 0;
  if (!ready || pending <= 0) return { flushed: false, amount: 0 };

  try {
    const { transferId, amountCents } = await transferPendingBalance(stripe, supabase, {
      table, userId: row.user_id, stripeAccountId, pendingBalance: pending, source: "autoflush",
    });
    console.warn(`[FLUSH-PENDING-BALANCE] Flushed ${amountCents}c for ${row.user_id} (${table}) tr=${transferId}`);
    return { flushed: true, amount: pending, transferId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === BALANCE_CHANGED) return { flushed: false, amount: 0 }; // lost the race; benign
    throw err; // genuine failure; balance already restored by the core. Caller must not fail its response.
  }
}
