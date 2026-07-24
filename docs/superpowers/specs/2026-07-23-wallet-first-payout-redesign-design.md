# Wallet-first payout redesign — design

**Date:** 2026-07-23 (design approved 2026-07-24)
**Status:** APPROVED — ready for implementation. Sub-project 2 of the wallet-first payout follow-up;
its prerequisite (sub-project 1, the durable flush ledger) **shipped** (PR #334).
**Area:** content-delivery / money path
**Follows:** PR #329 ([[Payout Finalization & Re-entrancy]]) — closes its two documented residuals.

> **The two spec-review blockers that gated this reroute are now both resolved:**
> 1. **Amount-keyed-flush under-pay — CLOSED by sub-project 1.** The durable flush ledger (PR #334) keys
>    each transfer on a per-flush `flush_${id}` instead of the colliding `withdraw_${user}_${cents}`, so the
>    shared flush is exactly-once. Rerouting through it no longer risks the identical-cents under-pay.
> 2. **Frontend money-math regression — RESOLVED by the Approach-A ledger-event contract in §4–§5.** This
>    spec now defines the explicit payout ledger-event contract + the four consumer updates.

## 1. Problem

`release-creator-payout` moves a creator's payout one of two ways, chosen at request time by
`verifyPayoutReady`:

- **Onboarded** → a direct `stripe.transfers.create` (the "transfer path").
- **Not onboarded** → credit `creator_profiles.pending_balance` (the "pending path", via the atomic
  `credit_pending_balance_for_payout` RPC).

PR #329 made both paths durably re-entrant, but two residuals remain — both rooted in the **fork itself**:

1. **Cross-path concurrent double-pay.** Two concurrent invocations for the same collaboration can take
   *different* branches if `verifyPayoutReady` diverges between their reads (the creator's cached
   `stripe_onboarding_complete` is false/null on both, and `stripe.accounts.retrieve` returns ready for one
   call but errors on the other). One credits the wallet + marks; the other, already past its non-atomic
   read, transfers → the creator is paid **twice**. A pre-transfer re-check narrows but cannot close the
   window (can't hold a DB lock across the external Stripe call via PostgREST).
2. **Stripe-up / DB-down marker split-brain.** On the transfer path, if the transfer confirms but the
   durable marker write fails, nothing durable records the payout. That path is non-retry / manual
   reconciliation (a retry past Stripe's ~24h idempotency window could double-pay).

Both are consequences of a **second money path** (the direct transfer) that is idempotent only by a
time-limited Stripe key and whose "did it happen" state is written *after* the money moves.

## 2. What sub-project 1 gave us (the enabling change)

The wallet→Stripe flush (`_shared/flush-pending-balance.ts`) is now **exactly-once**: `transferPendingBalance`
claims a durable `pending_balance_flushes` row, and the shared `executeFlushTransfer` keys the Stripe transfer
on `flush_${id}` (byte-identical inline vs. reconcile replay → real Stripe idempotent replay). `confirm`
returns whether it transitioned, so overlapping reconcile never double-writes the ledger. The `*/15`
`reconcile-pending-flushes` cron re-drives any `claimed` row. So the wallet→Stripe leg is now safe to be the
**single** payout mechanism.

## 3. Design — remove the fork

Every payout becomes one shape:

```
approve
  → credit_pending_balance_for_payout(collab, creator, netPayout)   -- the ONE money-in-DB step
      (atomic: pending_balance += net AND payout_executed_at = now(), row-locked; returns credited|already)
  → if verifyPayoutReady(...): flushPendingBalance(stripe, supabase, stripeAccountId)   -- best-effort, exactly-once
  → finalizePayoutState(...)   -- escrow=released, status=completed (retried; 500 {needsRetry} on failure)
  → 200
```

Because there is no longer a divergent money path:

- **Cross-path double-pay is impossible** — both concurrent invocations credit the *same* wallet (the RPC
  row-locks and dedupes via `payout_executed_at`; exactly one credits, the rest return `'already'`), and the
  flush is exactly-once (durable per-flush key). No double transfer.
- **The split-brain disappears** — the only money write is the atomic credit RPC, which sets the marker
  *inside the same transaction*. "Credited but unmarked" cannot happen; there is no post-money marker write
  to fail.

### 3.1 `verifyPayoutReady` role
Retained, but **only to decide whether to flush now** — never whether money moves. Money is always credited
to the wallet first. So even if two concurrent calls diverge on readiness, both already credited (atomic),
and the flush is idempotent → no double-pay. This preserves immediate payout for the stale-false-flag case
(the flush's own `stripe_onboarding_complete === true` check would otherwise defer it); the `corrected`
self-heal write of `stripe_onboarding_complete = true` is kept.

### 3.2 Marker semantics
`campaign_collaborations.payout_executed_at` now means **"creator credited for this collaboration"** (money
is in their wallet — the correct completion semantic, independent of when the Stripe leg settles).
`stripe_transfer_id` becomes vestigial for new payouts (the transfer is wallet-level inside the flush, keyed
to `userId`, not per-collaboration). The column and the re-entry guard's `OR stripe_transfer_id` check are
kept so old rows (paid via the pre-redesign direct path) still short-circuit correctly.

### 3.3 Re-entry + reconciliation
The early re-entry guard (marker set → finalize-only) is unchanged. The `auto-approve-content` reconciliation
sweep (finalize-only for marked-but-unfinalized rows) is unchanged.

## 4. Ledger-event contract (Approach A — approved)

Every payout writes, **collaboration-keyed** (all four already exist; only *when* they fire changes):
- `content_approved`
- `payment_release_initiated`
- **`payment_released`** — the business **In Escrow ↓** signal. **Now fires on every payout** (the old
  pending path never wrote it, so pending payouts never decremented business In Escrow — a latent bug this
  fixes).
- **`payout_pending_wallet`** — the creator **earned + wallet-credit** signal (fires on every payout, since
  every payout now transits the wallet).

The wallet→Stripe flush keeps writing its **user-keyed** `transfer_created` with `metadata.flush_id` — a
**wallet-movement audit event**, deliberately NOT counted as earnings.

### 4.1 The one reconciled "Total Earned" rule (both creator readers converge on this)

> **Total Earned** = `Σ payout_pending_wallet` + `Σ (transfer_created WHERE entity_type='collaboration' AND
> metadata has no flush_id)`

Counts each payout **exactly once**, across historical and new:
- **New payout** → `payout_pending_wallet` (counted); its flush `transfer_created` is user-keyed **and** has
  `flush_id` → excluded. = 1×.
- **Historical transfer-path payout** → collaboration-keyed `transfer_created` with no `flush_id` (counted);
  no `payout_pending_wallet`. = 1×.
- **Historical pending-path payout** → `payout_pending_wallet` (counted). = 1×.

`payment_released` is **never** summed into earnings (it is the escrow-decrement signal only). This is the
single rule both creator readers must use.

## 5. Frontend consumer changes

1. **`PaymentSummaryCards.computeCreatorStats` (`src/components/payments/PaymentSummaryCards.tsx`).**
   - `totalEarned`: add the `metadata?.flush_id == null` filter to the `transfer_created` term (keeps
     historical collaboration transfers; excludes the new wallet-level flush events). `payout_pending_wallet`
     term unchanged.
   - `inWallet`: **replace** the event-matching derivation (which matches on `entity_id === collaboration`
     and breaks against the user-keyed flush event) with the **source of truth** — `creator_profiles.pending_balance`.
     Plumb `pendingBalanceCents` into the component (from `useCreatorEarnings`/a small fetch); the prop is
     authoritative, the events are not.
2. **`computeBusinessStats.inEscrow`** — logic unchanged (decrements on `payment_released`/`refund_completed`).
   Now correct for *all* payouts because `payment_released` fires on every one.
3. **`useCreatorEarnings` (`src/hooks/useCreatorEarnings.ts`).** Its `totalEarned` currently sums
   `['payment_released','payout_pending_wallet']`, which relied on the old "exactly one of the pair per
   payout" invariant — broken now that every payout writes **both**. Change it to the §4.1 rule: query
   `payout_pending_wallet` + `transfer_created` (filtering `flush_id`-less, collaboration-keyed), and **drop
   `payment_released` from the earned sum**. Keep `inEscrow` (escrow_held minus released) and `available`
   (= `pending_balance` from `check-creator-payout-status`) as-is; `available`/`inWallet` are the same wallet
   number.
4. **`PaymentsPage`** — **audit its reads first** (this spec has not yet inspected it) and align any
   Total-Earned / In-Escrow / In-Wallet computation to the §4.1 rule and the `pending_balance`-for-wallet
   source. The plan's first step reads it.

## 6. What is deleted (all specific to the removed direct path)

- The `if (creatorPayoutReady) { …direct transfer… } else { …credit wallet… }` fork.
- `stripe.transfers.create({ … }, { idempotencyKey: 'payout_${collaborationId}' })` + its escrow-rollback catch.
- `markTransferExecuted` and the marker-write-failure (`manualReconciliation`) 500 branch.
- The escrow `held → releasing` pre-commit (only the direct path needed it; escrow now goes straight to
  `released` at finalize).
- The transfer-path `payment_released` / `transfer_created` writes keyed to the collaboration — replaced by
  the single per-payout `payment_released` + `payout_pending_wallet` (§4) plus the flush's own user-keyed
  `transfer_created`.

## 7. Backward compatibility

Historical `payment_events` are untouched and keep rendering: the §4.1 rule counts historical transfer-path
(`transfer_created` no-`flush_id`) and pending-path (`payout_pending_wallet`) payouts each once, and the
business In-Escrow rule is unchanged. No migration of past events. `stripe_transfer_id` on old collaboration
rows still short-circuits the re-entry guard.

## 8. Data flow & error handling

| Failure | Behavior |
|---|---|
| Credit RPC error (no wallet row / lock / DB) | Whole RPC tx rolls back — no credit, no marker; `release-creator-payout` throws → `500`. Safe to retry (nothing moved). |
| Flush not ready / lost race | `flushPendingBalance` no-ops — money stays in wallet, flushed later by webhook/poll/manual/`reconcile-pending-flushes`. Payout returns success (creator IS paid — into the wallet). |
| Flush Stripe error | `executeFlushTransfer` restores (definite) or bumps (ambiguous) per the stage-1 ledger; `release-creator-payout` catches best-effort (money safe in wallet), returns success. |
| Finalize error | `500 {needsRetry}` — re-entry is finalize-only (marker set), safe; the sweep also heals. |

## 9. Testing

- **Deno unit tests** for the rerouted `release-creator-payout`: asserts every payout writes `payment_released`
  + `payout_pending_wallet` (collaboration-keyed), calls `credit_pending_balance_for_payout`, and flushes only
  when ready; no `stripe.transfers.create` on the collaboration path.
- **Frontend unit tests** for the §4.1 rule: Total Earned counts once across a mix of historical transfer-path,
  historical pending-path, and new events (incl. a user-keyed flush `transfer_created` that must NOT count);
  In Wallet reads `pending_balance`; business In Escrow decrements on every payout.
- **Rollback-wrapped prod tests**: onboarded payout → wallet credited + flushed + marker; concurrent
  double-invoke → single credit (RPC lock) + single flush (ledger), no double-pay; flush-fails → money stays
  in wallet + collaboration still finalizes; re-entry → finalize-only.
- **Real test-mode Stripe E2E** on prod (as sub-project 1): a rerouted payout credits + flushes to a test
  connected account exactly once.
- **Reviews**: `data-exposure-reviewer` + `edge-function-reviewer` + Codex second pass.

## 10. Rollout

- **No new migration** — columns + RPC already live from #329/#334; this is edge-fn + frontend.
- Deploy `release-creator-payout` (careful-gated, boot-checked); ship the frontend reader changes; verify
  both readers agree on Total Earned for a known account. Then PR + knowledge-sync (compound onto
  [[Payout Finalization & Re-entrancy]]).

## 11. Residuals after this change

- **Closed:** cross-path concurrent double-pay; Stripe-up/DB-down marker split-brain.
- **Out of scope:** `release-sponsorship-payout` (brand→creator) likely has a parallel direct-transfer shape;
  separate function, flagged as a follow-up candidate.
- **Accepted (pre-existing):** per-collaboration **Stripe-transfer** traceability weakens — the transfer
  ledger row is wallet-level (`entity_id = userId`), not `collaborationId`; per-collaboration **crediting**
  remains traceable via `payout_pending_wallet`. `stripe_transfer_id` is no longer populated on the
  collaboration for new payouts.
