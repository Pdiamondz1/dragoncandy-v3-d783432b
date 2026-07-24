# Wallet-first payout redesign — design

**Date:** 2026-07-23
**Status:** DEFERRED — sub-project 2. Staged **behind** the durable flush ledger
(`2026-07-23-durable-flush-ledger-design.md`, sub-project 1), which is a prerequisite.
**Area:** content-delivery / money path
**Follows:** PR #329 ([[Payout Finalization & Re-entrancy]]) — closes its two documented residuals.

> **Spec review (2026-07-23) surfaced two blockers that gate this reroute — do NOT implement as written:**
> 1. **Rerouting through the amount-keyed flush introduces an under-pay bug.** The onboarded path would use
>    `transferPendingBalance`'s `withdraw_${userId}_${cents}` idempotency key, which collides for two
>    separate identical-cents flushes (plausible in a standardized-pricing beachhead) → creator underpaid,
>    money stuck. **This is why sub-project 1 (the durable flush ledger) must land first** — it makes the
>    flush collision-free-and-ambiguity-safe, removing this exposure.
> 2. **Frontend money-math regression.** Wallet-first changes which ledger events fire and their keying;
>    four consumers (`PaymentSummaryCards.computeCreatorStats`/`computeBusinessStats`, `useCreatorEarnings`,
>    `PaymentsPage`) assume exactly one of `{transfer_created, payout_pending_wallet}` per payout keyed to
>    the collaboration, and a `payment_released` for the business in-escrow decrement. This reroute must
>    redesign the payout ledger-event contract and update all four, or it doubles "Total Earned" and
>    freezes business "In Escrow." Backend-plus-frontend, not backend-only.
>
> Revisit after sub-project 1 ships. §3–§9 below capture the reroute mechanics but must be re-specced with
> the explicit ledger-event contract + the four frontend updates before implementation.

## 1. Problem

`release-creator-payout` moves a creator's payout one of two ways, chosen at request time by
`verifyPayoutReady`:

- **Onboarded** → a direct `stripe.transfers.create` (the "transfer path").
- **Not onboarded** → credit `creator_profiles.pending_balance` (the "pending path", now via the atomic
  `credit_pending_balance_for_payout` RPC).

PR #329 made both paths durably re-entrant, but two residuals remain, both rooted in the **fork itself**:

1. **Cross-path concurrent double-pay.** Two concurrent invocations for the same collaboration can take
   *different* branches if `verifyPayoutReady` diverges between their reads (creator's cached
   `stripe_onboarding_complete` false/null on both, and `stripe.accounts.retrieve` returns ready for one
   call but errors on the other). One credits the wallet + marks; the other, already past its
   non-atomic read, transfers → the creator is paid **twice** (a real Stripe transfer *and* a wallet
   credit). Narrowed by a pre-transfer re-check, not eliminated (can't hold a DB lock across the external
   Stripe call via PostgREST).
2. **Stripe-up/DB-down marker-write split-brain.** On the transfer path, if the transfer confirms but the
   durable marker write fails, nothing durable records the payout. That path is non-retry / manual
   reconciliation (a retry past Stripe's ~24h idempotency window could double-pay).

Both are consequences of having a **second money path** (the direct transfer) that is idempotent only by
a time-limited Stripe key and whose "did it happen" state is written *after* the money moves.

## 2. Key finding — the flush infrastructure already exists

The wallet→Stripe flush is already built, tested (`_shared/flush-pending-balance.test.ts`), and in
production use:

- **`transferPendingBalance(stripe, supabase, {table, userId, stripeAccountId, pendingBalance, source})`**
  (`supabase/functions/_shared/flush-pending-balance.ts`) — the core money move: an **atomic claim**
  (`UPDATE ... SET pending_balance=0 WHERE user_id=$1 AND pending_balance=$read` — zero only if it still
  equals what was read, so exactly one caller can move a given balance), then `stripe.transfers.create`
  with idempotency key `withdraw_${userId}_${amountCents}`, **restore-on-Stripe-error** (atomic
  increment, not clobber), then the ledger event. Documented residual (accepted, out of scope here): two
  *separate* balances of the identical cents amount within Stripe's ~24h key window can collide on the
  key — the atomic claim still prevents same-balance double-pay.
- **`flushPendingBalance(stripe, supabase, stripeAccountId)`** — the idempotent, state-driven entry
  point: resolves the owning profile by connected-account id, and flushes the owed `pending_balance`
  **only when** `stripe_onboarding_complete === true` and `pending_balance > 0`. Never throws for the
  benign "lost the race" case; re-throws genuine failures (balance already restored). Already invoked
  from three triggers: `stripe-webhook` (`account.updated`), `check-creator-payout-status`
  (onboarding-return poll), and manual `withdraw-pending-balance` (via `transferPendingBalance`).

So this redesign is a **reroute, not a new build**: `release-creator-payout`'s onboarded path stops doing
its own transfer and instead credits the wallet then uses the existing flush.

## 3. Design — remove the fork

Every payout becomes a single shape:

```
approve
  → credit_pending_balance_for_payout(collab, creator, netAmount)   -- the ONE money-in-DB step
      (atomic: pending_balance += net AND payout_executed_at = now(), row-locked; returns credited|already)
  → if verifyPayoutReady(...): flushPendingBalance(stripe, supabase, stripeAccountId)   -- best-effort, idempotent
  → finalizePayoutState(...)   -- status=completed, escrow=released (retried; 500 {needsRetry} on failure)
  → 200
```

Because there is no longer a divergent money path:

- **Cross-path double-pay is impossible** — both concurrent invocations credit the *same* wallet (the RPC
  row-locks and dedupes via `payout_executed_at`), and the flush is idempotent (atomic claim). Worst case:
  one flushes, the other no-ops (or the atomic claim dedupes two flush attempts). No double transfer.
- **The split-brain disappears** — the only money write is the atomic credit RPC, which sets the marker
  *inside the same transaction*. "Credited but unmarked" cannot happen; there is no post-money marker
  write to fail.

### 3.1 `verifyPayoutReady` role (decision A, approved)

`verifyPayoutReady` (trust-true / verify-false-against-Stripe, with stale-flag self-heal) is retained,
but **only to decide whether to flush now** — never whether money moves. Money is always credited to the
wallet first. So even if two concurrent calls diverge on readiness, both already credited (atomic), and
the flush is idempotent → no double-pay. This preserves immediate payout for the stale-false-flag case
(the flush's own `stripe_onboarding_complete === true` check would otherwise defer it). The
`corrected`/self-heal write of `stripe_onboarding_complete = true` is kept.

### 3.2 Marker semantics

`campaign_collaborations.payout_executed_at` now means **"creator credited for this collaboration"**
(money is in their wallet — the correct completion semantic, independent of when the Stripe leg settles).
`stripe_transfer_id` becomes vestigial for new payouts (the transfer is wallet-level inside the flush,
keyed to `userId`, not per-collaboration). The column and the re-entry guard's `OR stripe_transfer_id`
check are kept so old rows (paid via the pre-redesign direct path) still short-circuit correctly.

### 3.3 Re-entry + reconciliation

The early re-entry guard (marker set → finalize-only) is unchanged. Addition: on **both** the fresh and
re-entry paths, after the wallet is credited/known-credited, attempt a **best-effort flush** if a
`stripe_account_id` is present. This makes the `auto-approve-content` reconciliation sweep (which
re-invokes `release-creator-payout` for marked-but-unfinalized rows) *also* drive the Stripe flush, on
top of the webhook/poll/manual triggers — so a credited-but-not-yet-flushed collaboration self-heals to
Stripe faster.

## 4. What is deleted (all specific to the removed direct path)

- The `if (creatorPayoutReady) { ...direct transfer... } else { ...credit wallet... }` fork.
- The direct `stripe.transfers.create` with `payout_${collaborationId}` and its rollback-escrow-to-held.
- The escrow `held → releasing` pre-commit (only the direct path needed it; escrow now goes straight to
  `released` at finalize).
- `markTransferExecuted` and the marker-write-failure (`manualReconciliation`) branch.
- The transfer-path `payment_released` / `transfer_created` ledger writes keyed to the collaboration —
  the transfer's ledger row now comes from `transferPendingBalance` (keyed to `userId`).

Retained: the `content_approved` / `payout_pending_wallet`-style intent events keyed to the collaboration
(so per-collaboration crediting is still traceable in the ledger — decision 2 trade-off accepted).

## 5. Data flow, error handling

| Failure | Behavior |
|---|---|
| Credit RPC error (no wallet row / lock / DB) | Whole RPC tx rolls back — no credit, no marker. `release-creator-payout` throws → `500`. Safe to retry (nothing moved). |
| Flush not ready / lost race | `flushPendingBalance` no-ops — money stays in wallet, flushed later by webhook/poll/manual/sweep. `release-creator-payout` returns success (creator IS paid — into the wallet). |
| Flush Stripe error | `transferPendingBalance` restores the balance atomically and re-throws; `release-creator-payout` catches it best-effort (money safe in wallet), logs, returns success. |
| Finalize error | `500 {needsRetry}` — re-entry is finalize-only (marker set), safe. |

## 6. Behavior changes (call out for reviewers)

- An **onboarded** creator's payout now briefly transits `pending_balance` (credit → immediate flush)
  instead of a direct transfer. Net effect identical (money in their Stripe account promptly); strictly
  more robust (a Stripe failure leaves the money in the wallet instead of erroring the payout).
- Per-collaboration **Stripe-transfer** traceability weakens: the transfer ledger row is wallet-level
  (`entity_id = userId`), not `collaborationId`. Per-collaboration **crediting** remains traceable.
- `stripe_transfer_id` is no longer populated for new payouts.

## 7. Residuals after this change

- **Closed:** cross-path concurrent double-pay; Stripe-up/DB-down marker split-brain.
- **Remaining (pre-existing, unchanged, out of scope):** `transferPendingBalance`'s
  `withdraw_${userId}_${cents}` idempotency-key collision — two *separate* wallet balances of the identical
  cents amount within Stripe's ~24h window. Narrower than what we close, already documented in the flush
  subsystem; robust fix needs a persisted balance-event id (distinct effort).
- **Out of scope:** `release-sponsorship-payout` (brand→creator) likely has a parallel direct-transfer
  shape; separate function, flagged as a follow-up candidate.

## 8. Testing

- **Unit** (`flush-pending-balance.test.ts` already strong): add coverage asserting `release-creator-payout`
  credits the wallet on both onboarded and not-onboarded, and flushes only when ready.
- **Rollback-wrapped prod tests:** onboarded payout → wallet credited + flushed + marker set; concurrent
  double-invoke → single credit (RPC lock) + single flush (atomic claim), no double-pay; flush-fails →
  money stays in wallet + collaboration still finalizes; re-entry → finalize-only + best-effort re-flush.
- **Reviews:** `edge-function-reviewer` + `data-exposure-reviewer` + Codex second pass (as #329).
- **Deploy ordering:** no new migration (columns + RPC already live from #329); this is edge-fn-only.
  Deploy `release-creator-payout` (+ `auto-approve-content` if the sweep tweak lands there), boot-check.

## 9. Rollout

Edge-function-only change (no schema). Deploy `release-creator-payout`, boot-check + rollback-wrapped
prod test, then PR + knowledge-sync (compound onto [[Payout Finalization & Re-entrancy]]).
