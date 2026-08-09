import type Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
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

export const RECONCILE_CAP = 6;

export interface FlushRow {
  id: string;
  user_id: string;
  profile_type: "creator" | "business";
  stripe_account_id: string;
  amount_cents: number;
  source: "manual" | "autoflush";
}

/**
 * Build the Stripe transfer params for a claimed flush. Shared by the inline send and the
 * reconciliation replay so a re-drive is byte-identical to the original (Stripe replays the same
 * `flush_${id}` idempotency key to the SAME transfer instead of a 400 conflict).
 */
export function buildFlushTransferParams(row: FlushRow) {
  const isManual = row.source === "manual";
  return {
    amount: row.amount_cents,
    currency: "usd",
    destination: row.stripe_account_id,
    description: isManual ? "DragonCandy platform wallet withdrawal" : "DragonCandy pending balance auto-payout",
    metadata: {
      user_id: row.user_id,
      withdrawal_type: isManual ? "pending_balance" : "pending_balance_autoflush",
      flush_id: row.id,
    },
  };
}

// A definite failure means the transfer was NOT created (safe to restore). Anything ambiguous
// (connection/5xx/unknown/idempotency-conflict) MUST NOT restore — the transfer may exist.
// NOTE: consciously narrows the spec — every StripeInvalidRequestError is raised pre-creation, so
// restore-on-4xx cannot double-pay, and idempotency-conflict is caught as ambiguous above the 4xx check.
export function isDefiniteFailure(err: any): boolean {
  const type = err?.type ?? err?.raw?.type;
  if (type === "StripeIdempotencyError") return false;                 // conflict → ambiguous
  const msg = String(err?.message ?? "");
  if (msg.includes("idempotent requests can only be used with the same parameters")) return false;
  if (type !== "StripeInvalidRequestError") return false;               // connection/5xx/unknown → ambiguous
  const status = err?.statusCode ?? err?.raw?.statusCode ?? 0;
  return status >= 400 && status < 500;                                 // 4xx invalid request → definite
}

// Alert once when a flush goes terminal-stuck: its wallet balance is already zeroed at claim and is
// NEVER auto-restored, so a human must reconcile. bump_flush_attempt returns 'stuck' on exactly the
// claimed→stuck transition, giving us file-once for free. Fire-and-forget: never mask the transfer error.
async function fileStuckFinding(row: FlushRow, error: string): Promise<void> {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/aios-report-ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}` },
      body: JSON.stringify({
        type: "findings",
        payload: {
          findings: [{
            severity: "critical",
            title: `Pending-balance flush stuck: ${row.id}`,
            summary_md: `Flush \`${row.id}\` (user ${row.user_id}, ${row.amount_cents}¢, ${row.profile_type}) hit the retry cap; the wallet balance was zeroed at claim and is **not** auto-restored. Manual reconciliation required. Last error: ${error}`,
            source: "reconcile-pending-flushes",
            fingerprint: `payout:flush:stuck:${row.id}`,
          }],
        },
      }),
    });
  } catch (e) {
    console.error("[FLUSH-PENDING-BALANCE] failed to file stuck finding", { flushId: row.id, error: String((e as Error)?.message ?? e) });
  }
}

/**
 * Move the money for an already-claimed flush exactly-once. Shared by transferPendingBalance (inline)
 * AND reconcile-pending-flushes (replay). On a Stripe failure: restore only on a definite (pre-creation)
 * failure; on an ambiguous failure bump the attempt (and file a stuck alert at the cap) WITHOUT
 * restoring, since the transfer may exist. On success, confirm the row BEFORE the ledger write so a
 * confirm failure leaves the ledger unwritten for reconcile to re-drive (idempotent replay).
 * Replay avoids double-pay only WITHIN Stripe's ~24h idempotency-key window; the cap→stuck bound
 * (including the bump on a persistent confirm failure) is what keeps a 'claimed' row from ever being
 * re-driven past that window.
 */
export async function executeFlushTransfer(
  stripe: Stripe,
  supabase: SupabaseClient,
  row: FlushRow,
): Promise<{ transferId: string; amountCents: number }> {
  const params = buildFlushTransferParams(row);
  let transfer: { id: string };
  try {
    transfer = await stripe.transfers.create(params, { idempotencyKey: `flush_${row.id}` });
  } catch (err) {
    const errMsg = String((err as Error)?.message ?? err);
    if (isDefiniteFailure(err)) {
      // Balance was zeroed at claim; a definite (pre-creation) failure means no transfer exists, so restore it.
      const { error: failErr } = await supabase.rpc("fail_pending_balance_flush", { p_flush_id: row.id, p_restore: true, p_error: errMsg });
      if (failErr) console.error(`[FLUSH-PENDING-BALANCE] CRITICAL: fail_pending_balance_flush(restore) errored for flush ${row.id}; balance may be zeroed with no transfer`, failErr);
    } else {
      const { data: bumpedStatus, error: bumpErr } = await supabase.rpc("bump_flush_attempt", { p_flush_id: row.id, p_error: errMsg, p_cap: RECONCILE_CAP });
      if (bumpErr) console.error(`[FLUSH-PENDING-BALANCE] bump_flush_attempt errored for flush ${row.id}`, bumpErr);
      if (bumpedStatus === "stuck") await fileStuckFinding(row, errMsg);   // fires exactly once, at the transition
    }
    throw err;
  }
  const { data: transitioned, error: confirmErr } = await supabase.rpc("confirm_pending_balance_flush", { p_flush_id: row.id, p_transfer_id: transfer.id });
  if (confirmErr) {
    // Transfer succeeded but we couldn't mark the row. Bump so this path is bounded by the cap
    // (→ stuck → alert) instead of being re-driven forever; past Stripe's ~24h key TTL a re-drive
    // would create a SECOND transfer. Do NOT restore — the money already moved.
    const { data: bumpedStatus, error: bumpErr } = await supabase.rpc("bump_flush_attempt", { p_flush_id: row.id, p_error: `confirm failed: ${confirmErr.message}`, p_cap: RECONCILE_CAP });
    if (bumpErr) console.error(`[FLUSH-PENDING-BALANCE] bump_flush_attempt errored while bounding a confirm failure for flush ${row.id}`, bumpErr);
    if (bumpedStatus === "stuck") await fileStuckFinding(row, `confirm failed after transfer ${transfer.id}: ${confirmErr.message}`);
    throw new Error(`[FLUSH-PENDING-BALANCE] confirm_pending_balance_flush failed after transfer ${transfer.id}: ${confirmErr.message}`);
  }
  if (transitioned === false) {
    // Overlapping reconcile: `confirm` updated 0 rows because a concurrent invocation already moved this
    // flush out of 'claimed' (and wrote its ledger). Our transfer replayed the same flush_${id} key, so no
    // double-pay — but we must NOT write a second `transfer_created` row (payment_events is not unique on
    // stripe_id and its rows are summed for creator/business totals → would double-count the payout).
    console.warn(`[FLUSH-PENDING-BALANCE] flush ${row.id} was already confirmed by a concurrent run; skipping duplicate ledger write`);
    return { transferId: transfer.id, amountCents: row.amount_cents };
  }
  await writePaymentEvent(supabase, {
    event_type: "transfer_created",
    entity_type: row.profile_type === "creator" ? "collaboration" : "sponsorship",
    entity_id: row.user_id,
    campaign_id: null,
    actor_id: row.user_id,
    actor_role: row.profile_type === "creator" ? "creator" : "business",
    amount_cents: row.amount_cents,
    stripe_id: transfer.id,
    metadata: { type: row.source === "manual" ? "wallet_withdrawal" : "pending_balance_autoflush", flush_id: row.id },
  }, "[FLUSH-PENDING-BALANCE]");
  return { transferId: transfer.id, amountCents: row.amount_cents };
}

/**
 * Core money movement, shared by the manual withdraw endpoint and the auto-flush triggers.
 * Atomically claims the balance into a durable `pending_balance_flushes` row (via
 * `claim_pending_balance_flush`, which zeroes the balance only if it still equals what was read and
 * returns a per-flush uuid), then hands off to `executeFlushTransfer` keyed on `flush_${id}`.
 *
 * Throws BALANCE_CHANGED when the claim returned NULL (someone else won the race, or the balance
 * changed). Stripe-failure restore / ambiguous-bump / confirm / ledger semantics live in
 * `executeFlushTransfer`. The per-flush uuid key closes the identical-cents idempotency-key collision:
 * two separate balances of the same cents amount now claim DISTINCT rows → DISTINCT keys.
 */
export async function transferPendingBalance(
  stripe: Stripe,
  supabase: SupabaseClient,
  { table, userId, stripeAccountId, pendingBalance, source }: TransferPendingParams,
): Promise<{ transferId: string; amountCents: number }> {
  const amountCents = Math.round(pendingBalance * 100);
  const profileType = table === "creator_profiles" ? "creator" : "business";

  // Atomic claim: zero the balance (if unchanged) AND insert a 'claimed' flush row; returns its uuid.
  const { data: flushId, error } = await supabase.rpc("claim_pending_balance_flush", {
    p_user_id: userId,
    p_profile_type: profileType,
    p_stripe_account_id: stripeAccountId,
    p_amount_cents: amountCents,
    p_source: source,
  });
  if (error || !flushId) throw new Error(BALANCE_CHANGED);

  return executeFlushTransfer(stripe, supabase, {
    id: flushId,
    user_id: userId,
    profile_type: profileType,
    stripe_account_id: stripeAccountId,
    amount_cents: amountCents,
    source,
  });
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
  opts?: { assumeReady?: boolean },
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

  // assumeReady lets a caller that has ALREADY verified payout-readiness authoritatively (e.g.
  // release-creator-payout's verifyPayoutReady Stripe check) flush WITHOUT re-checking the CACHED
  // stripe_onboarding_complete flag — which can be stale-false (the account.updated webhook that sets it
  // isn't delivering) and whose caller-side self-heal write we can't guarantee is visible on this re-read.
  // Without it, a genuinely-ready payout could no-op the flush and leave the money parked in the wallet
  // while the payout reports success. Stripe still enforces real readiness at transfer time.
  const ready = opts?.assumeReady === true || row.stripe_onboarding_complete === true;
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
    throw err; // genuine failure. The core restores the balance ONLY on a definite failure; an ambiguous
    // failure leaves the balance claimed/zeroed for reconcile to re-drive. Caller must not fail its response.
  }
}
