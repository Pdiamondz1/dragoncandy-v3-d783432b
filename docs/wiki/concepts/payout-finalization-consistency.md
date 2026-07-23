---
title: Payout Finalization & Re-entrancy
type: concept
created: 2026-07-23
updated: 2026-07-23
sources: [docs/wiki/raw/sessions/2026-07-23-payout-finalize-retry.md, docs/wiki/raw/sessions/2026-07-23-payout-durable-reentrancy.md]
tags: [payments, payout, escrow, idempotency, money-path]
---
# Payout Finalization & Re-entrancy

`release-creator-payout` moves money (a Stripe Connect transfer, or a pending-balance wallet credit),
then runs a **finalize** step that marks the collaboration `completed` / `content_status='approved'`
and the campaign `escrow_status='released'`. This page captures why that finalize is hard to make
robust — learned across the four review passes of PR #328, then hardened into a **durable marker** in
the Complete follow-up (branch `feat/payout-durable-marker`).

## The two payout paths differ in retry-safety

- **Stripe-transfer path** (creator onboarded): `stripe.transfers.create` uses idempotency key
  `payout_${collaborationId}`, so a retry **within ~24h** is deduped by Stripe. But Stripe **prunes the
  key after ~24h** — a later retry creates a SECOND transfer (double-pay).
- **Pending-balance path** (creator not onboarded): `increment_pending_balance` just *adds* the amount —
  **not idempotent** — so any re-invocation double-credits the wallet.

## The escrow gate allows re-entry

The function admits `escrow_status IN ('held','releasing')` (so a mid-release retry can proceed). So
escrow status alone does **not** block re-invocation — only a terminal `'released'`/`'refunded'` does.
The pre-#329 code leaned on setting `escrow_status='released'` at finalize as a **crude re-entry
guard**: once released, a re-invocation is rejected by the gate. Crude because if the finalize update
itself fails, escrow may never reach `'released'`, leaving the door open. The Complete follow-up
replaced this crude guard with a **durable per-collaboration marker** (below); escrow is now just the
terminal business state, not the re-entry gate.

## The false-200 bug + the safe fix (PR #328)

Originally the finalize ran **once, fire-and-forget**: on failure it logged `CRITICAL` but returned
`200`, so money moved, the DB was left inconsistent (escrow stuck at `'releasing'`), and nothing
retried. PR #328 added a **retried** `finalizePayoutState()` (4 attempts, backoff) that self-heals the
common transient-DB-failure case.

It deliberately did **not** surface the failure for a client retry, because of the two idempotency facts
above — a client retry would double-credit (pending) or double-pay (transfer, >24h). It also kept the
unconditional `escrow='released'` re-entry guard. So the shipped safe subset is: **retry-on-transient +
never invite a client retry after money has moved** (both paths fall through to `200`). A rare
persistent finalize failure leaves the money moved + the collaboration un-finalized (escrow stuck),
recoverable by reconciliation. Note the frontend prompts a retry on any non-2xx
(`CampaignDetailsPage.tsx`) and `supabase.functions.invoke` hides the JSON body on non-2xx — which is
*why* an error response is unsafe here regardless of any "do not retry" message.

## The durable marker + atomic RPC (Complete follow-up — shipped)

`campaign_collaborations` gained two nullable columns (migration `20260723160000`): `payout_executed_at`
(set the instant money moves, both paths) and `stripe_transfer_id` (transfer path only). The design
principle is **"marker = money moved" — set AFTER money moves, never before** — so *"marker set ⇒ money
moved"* holds by construction and reconciliation is trivial. Deliberately **not** a pre-claim: a marker
set *before* the transfer would, on a crash between claim and transfer, make a later re-entry
finalize-only → collaboration marked paid, creator never paid. That marked-not-paid class is exactly
what this avoids.

- **Early re-entry guard** (before the escrow gate): if the marker is set → `finalizePayoutState` only,
  return. Handles sequential client retries AND the reconciliation sweep, and lets a reconciliation call
  whose escrow is already `'released'` finalize instead of throwing.
- **Transfer path:** set the marker (`payout_executed_at` + `stripe_transfer_id`) the instant
  `stripe.transfers.create` confirms. Finalize failure → `500 {needsRetry}` (re-entry is finalize-only,
  so this is now safe — replaces #328's fire-and-forget 200). A pre-transfer re-check narrows the
  cross-path window (below).
- **Pending path:** the non-idempotent `increment_pending_balance` is replaced by the atomic SECURITY
  DEFINER RPC **`credit_pending_balance_for_payout`** (migration `20260723170000`): row-locks the
  collaboration `FOR UPDATE`, checks the marker, credits `creator_profiles.pending_balance` and sets
  `payout_executed_at` in **one transaction** — so concurrent invocations can't double-credit (exactly
  one credits + marks, the rest return `'already'`). `RAISE`s if there's no wallet row (never
  mark-without-crediting) or if `p_user_id` ≠ the collaboration's `creator_id`. Service-role only
  (REVOKE public/anon/authenticated + in-body role guard; the `revoke-definer-from-anon` project rule).
- **Reconciliation sweep** (in `auto-approve-content`, every 15 min): re-invokes `release-creator-payout`
  (finalize-only, safe) for rows with the marker set but `status != 'completed'`, with a **5-min min-age
  guard** so it never contends with an in-flight same-request finalize.

Net: **strictly better than #328 on every axis** — closes sequential double-credit, finalize-without-pay,
fire-and-forget-200, and same-path concurrent double-pay (Stripe idempotency key / `FOR UPDATE` lock).

## Known residuals (narrowed, not eliminated — need the wallet-first redesign)

- **Transfer-vs-pending CROSS-path concurrent double-pay.** Two concurrent invocations for the same
  collaboration can diverge onto different paths only when the creator's cached
  `stripe_onboarding_complete` is false/null on **both** reads AND `stripe.accounts.retrieve` returns
  ready for one call but errors on the other (a transient Stripe error on one of two concurrent
  retrieves — the `verifyPayoutReady` "trust true, verify false" helper). Then the pending path credits +
  marks while the transfer path
  (already past its non-atomic read) transfers → paid twice. A pre-transfer re-check of the marker
  **narrows** the window to the in-flight-transfer span but can't fully close it — a fully-atomic fix is
  impossible here (can't hold a DB lock across the external Stripe call via PostgREST).
- **Marker-write-failure split-brain (Stripe up / DB down).** If the transfer confirms but the marker
  write fails after retries, nothing durable is recorded. This path is **non-retry / manual (or
  Stripe-verified) reconciliation** — it explicitly does NOT invite an automatic retry, because a
  >24h retry (past Stripe's idempotency-key retention) with no marker could double-pay. It is invisible
  to the auto reconciliation sweep (no marker to key on).
- **The clean fix for both:** make crediting the pending wallet the **single** atomic money step (one
  path, the RPC), and turn the Stripe payout into a separate **idempotent wallet→Stripe flush** (verified
  by a Stripe list/query, so it survives the >24h idempotency prune). That removes the transfer-vs-pending
  fork entirely. Bigger than this follow-up; tracked as the next payout hardening.

## See Also
- [[Content Delivery State Machine]]
- [[Stripe Webhook Delivery]]
- [[Test-Mode Stripe UX]]
