---
title: Payout Finalization & Re-entrancy
type: concept
created: 2026-07-23
updated: 2026-07-24
sources: [docs/wiki/raw/sessions/2026-07-23-payout-finalize-retry.md, docs/wiki/raw/sessions/2026-07-23-payout-durable-reentrancy.md, docs/wiki/raw/sessions/2026-07-24-durable-flush-ledger.md]
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

## Durable pending-balance flush ledger (stage 1 of the wallet-first fix — shipped 2026-07-24)

"The clean fix" below is a two-stage change. **Stage 1 (shipped)** makes the shared wallet→Stripe flush
(`transferPendingBalance` in `_shared/flush-pending-balance.ts`) **exactly-once**, which is the prerequisite
for stage 2. **Stage 2 (deferred)** is the reroute that removes the transfer-vs-pending fork.

**The flush idempotency-key dilemma (what stage 1 fixes).** The flush keyed its transfer on
`withdraw_${userId}_${amountCents}`, a key that had to be *both* stable across retries of the same movement
(replay, not a second transfer) *and* unique across distinct movements (no collision). Amount-based →
ambiguity-safe but **collides** (two identical-cents flushes in Stripe's ~24h window dedupe to one transfer →
creator **under-paid**). Random → collision-free but loses the ambiguity guard (**over-pay**). The only
resolution is a **durable per-flush record** whose id *is* the key.

**The ledger** (migrations `20260723180000` table + 4 RPCs, `20260723190000` cron):
- Table **`pending_balance_flushes`** — one row per flush (`status ∈ claimed/succeeded/failed/stuck`),
  storing enough to rebuild the transfer byte-identically for a replay. Service-role-only RLS
  (see [[Service-Role Data Exposure]]).
- Four service-role SECURITY DEFINER RPCs: `claim` (row-locks the profile `FOR UPDATE`, verifies
  `round(pending_balance*100)=cents`, zeroes the balance, inserts a `claimed` row → its id; NULL ⇒
  `BALANCE_CHANGED`), `confirm` (`claimed→succeeded`), `fail(restore)` (`claimed→failed`; restore adds back
  exactly `amount_cents::numeric/100`), `bump(cap)` (increments attempts; `claimed→stuck` at the cap; returns
  `'stuck'` on **exactly** the transition, giving file-once alerting for free).
- **`executeFlushTransfer`** (shared by the inline flush AND the reconcile cron) keys the transfer on
  `flush_${id}` — built from the stored row, so inline send and reconcile replay are **byte-identical** →
  real Stripe idempotent replay, never a 400 key-conflict. `isDefiniteFailure` (a 4xx
  `StripeInvalidRequestError`, raised pre-creation) → `fail(restore)`; anything ambiguous (5xx / connection /
  idempotency-conflict) → `bump` (no restore — the transfer may exist). Success → `confirm` **then** the
  `transfer_created` ledger; a `confirm` error **throws before the ledger write** so reconcile re-drives and
  the ledger is written exactly once.
- **`reconcile-pending-flushes` + `*/15` pg_cron** re-drives `claimed` rows >5 min old through the same
  `executeFlushTransfer` (`verify_jwt=false` + `isAuthorizedIngest`, Vault URL + `aios_ingest_key` bearer,
  mirroring `auto-approve-content`).

**Three safety points hardened in review:** (1) a `stuck` row is zeroed-but-unpaid and never auto-restored,
so it files ONE `aios-report-ingest` CRITICAL on the transition — a human must reconcile. (2) The
transfer-succeeds-but-`confirm`-fails path was the one place a row stayed `claimed` **without** bumping
`attempts`, so reconcile would re-drive it forever and past Stripe's ~24h TTL create a second transfer;
fix: **bump on confirm-failure too** (no restore), bounding it by the cap (≤6 attempts ≈ 90 min, far under
the TTL). (3) **Overlapping reconcile could double-count the payout in the ledger** (Codex): two invocations
replay the same key (no double-*pay*), but the second `confirm` was a no-op that returned no error, so the
code wrote a **second** `transfer_created` row — and `payment_events` is not unique on `stripe_id` and its
rows are summed for creator/business totals. Fix: `confirm_pending_balance_flush` now **`RETURNS boolean`**
(did *this* call transition the row); `executeFlushTransfer` **skips the ledger write when it returns
`false`** (a concurrent run already ledgered it).

**Proven** on prod by a real **test-mode** Stripe replay E2E: a synthetic `claimed` row reconciled to a real
transfer (`{scanned:1,reconciled:1}`, row→`succeeded`, one ledger row, balance untouched); reset to `claimed`
and re-driven → the **same** `stripe_transfer_id`, no second transfer.

## Known residuals (narrowed, not eliminated — need the wallet-first redesign)

> **Closed by stage 1 (the flush ledger, above):** the flush subsystem's identical-cents idempotency-key
> **collision / under-pay**. The remaining two residuals below are in `release-creator-payout` itself (the
> transfer-vs-pending fork) and need **stage 2** — the wallet-first reroute — to close.

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
- **The clean fix for both (staged):** make crediting the pending wallet the **single** atomic money step
  (one path, the RPC), and turn the Stripe payout into a separate **idempotent wallet→Stripe flush**. **Stage
  1 shipped** (the durable flush ledger above) — the flush is now idempotent via a durable per-flush
  `flush_${id}` key (which survives the >24h Stripe idempotency-prune because the row, not the key TTL, is the
  source of truth) rather than the amount-based key. **Stage 2 (deferred)** reroutes
  `release-creator-payout`'s onboarded path through that wallet+flush, removing the transfer-vs-pending fork
  entirely and closing the two residuals above; it also needs a frontend ledger-event contract change (four
  consumers assume exactly one of `{transfer_created, payout_pending_wallet}` per payout). Spec:
  `docs/superpowers/specs/2026-07-23-wallet-first-payout-redesign-design.md`.

## See Also
- [[Content Delivery State Machine]]
- [[Stripe Webhook Delivery]]
- [[Test-Mode Stripe UX]]
