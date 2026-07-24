# Session — Wallet-first payout reroute (stage 2 of the wallet-first fix)

**Date:** 2026-07-24
**Branch:** `feat/wallet-first-stage2` (worktree `dc-wallet-first-stage2`)
**Follows:** stage 1 (durable flush ledger, PR #334) and the durable re-entrancy work (#329).
**Spec/Plan:** `docs/superpowers/specs/2026-07-23-wallet-first-payout-redesign-design.md` ·
`docs/superpowers/plans/2026-07-24-wallet-first-payout-reroute.md`

## What shipped

Removed the transfer-vs-pending **fork** in `release-creator-payout`. Every payout is now ONE shape:
`credit_pending_balance_for_payout` (atomic wallet credit + durable marker) → best-effort exactly-once
`flushPendingBalance` when the creator is payout-ready → `finalizePayoutState`. No divergent money path,
so the two #329 residuals close **by construction**:

- **Cross-path concurrent double-pay** — both concurrent invocations now credit the SAME wallet (the RPC
  row-locks + dedupes via `payout_executed_at`; exactly one credits, the rest return `'already'`), and the
  flush is exactly-once (stage-1 `flush_${id}` durable key). No second transfer possible.
- **Stripe-up/DB-down marker split-brain** — the only money write is the atomic credit RPC, which sets the
  marker IN THE SAME TRANSACTION. "Credited but unmarked" cannot happen; there is no post-money marker write
  to fail.

## Backend (Task 1)

- Deleted the `if (creatorPayoutReady) { …stripe.transfers.create… } else { …credit wallet… }` fork,
  `markTransferExecuted`, the direct `payout_${collab}`-keyed transfer, and the escrow `held→releasing`
  pre-commit (escrow now goes straight to `released` at finalize).
- **Refinement vs the plan:** the plan said "extract `applyWalletFirstPayout` into `index.ts` and test via
  `index.test.ts`." But `index.ts` runs `serve()` at top level, so importing it into a Deno test would start
  a server (leaked-resource test failure). Guarding `serve()` with `import.meta.main` is UNTESTED in the
  Supabase edge runtime — a wrong guard would silently unregister the handler (outage). So the DI helper
  (`applyWalletFirstPayout`) + the moved `finalizePayoutState` live in a co-located pure module
  `release-creator-payout/wallet-first.ts` that `index.ts` imports; `index.ts` keeps its unguarded `serve()`.
  Same testability, zero runtime risk. Tested via `wallet-first.test.ts` (6 Deno tests, mirrors the
  `_shared/flush-pending-balance.test.ts` fake-supabase/fake-stripe style).
- **Ledger-event contract (Approach A).** Every payout writes four **collaboration-keyed** events (only when
  THIS call actually credited — the `!alreadyCredited` gate): `content_approved`, `payment_release_initiated`,
  `payment_released` (now fires on EVERY payout — the old pending path never wrote it, so pending payouts never
  decremented business In Escrow; a latent bug this fixes), `payout_pending_wallet` (the creator "earned"
  signal, `metadata.reason ∈ {flushing_to_stripe, creator_onboarding_incomplete}`). The wallet→Stripe flush
  keeps writing its **user-keyed** `transfer_created` (`metadata.type='pending_balance_autoflush'`) — a
  wallet-movement audit event, NOT counted as earnings.

## Frontend (Task 2)

Reconciled the three money readers to the "one Total-Earned rule":
`Σ payout_pending_wallet + Σ (collaboration transfer_created whose metadata.type is NOT a wallet transfer)`.

- `PaymentSummaryCards.computeCreatorStats` — Total Earned excludes wallet-level transfers by `metadata.type`
  (`{wallet_withdrawal, pending_balance_autoflush}`); In Wallet from a new `pendingBalanceCents` prop (source
  of truth), not event-derived. Exported `computeCreatorStats`/`computeBusinessStats` for unit tests.
- `useCreatorEarnings` — earned query changed to `['payout_pending_wallet','transfer_created']` scoped to
  `entity_id IN collabIds` (excludes the user-keyed flush transfer); dropped `payment_released` (now fires on
  every payout → double-count).
- `PaymentsPage` — plumbs `pendingBalanceCents` (from `useCreatorEarnings.available` × 100, creator-gated);
  added `payout_pending_wallet` to `terminalTypes` so a credited-to-wallet collaboration reads as **Completed**
  (fixes a reroute regression AND the pre-existing pending-path "Active" misclassification).

## Codex second review — 4 rounds of real fixes (each verified before acting)

1. **P2 In Wallet staleness.** `check-creator-payout-status` auto-flushes (zeroes `pending_balance`) but
   returned the PRE-flush snapshot; routing that into In Wallet showed already-flushed money as still pending.
2. **P2 the round-1 fix read a REVOKE-contested financial column directly.** `pending_balance` is `REVOKE`d
   from anon/authenticated by four migrations (design: financial columns via edge functions), though currently
   readable via an apparently-accidental table-level re-grant (verified: an authenticated role-switched read
   returns OK on prod). Building the money display on a contested grant is fragile. **Fix:** revert the direct
   read; fix `check-creator-payout-status` to return the accurate post-flush `platformPendingBalance` on BOTH
   paths (account path re-reads after the auto-flush; the no-account early return now includes the field — it
   was omitted, so a not-onboarded creator's wallet read $0). Redeployed.
3. **P2 phantom "Completed" timelines.** The flush's user-keyed `transfer_created` (entity_type='collaboration',
   entity_id=creatorUserId) made `PaymentsPage` render a phantom `collaboration:<creatorUserId>` timeline for
   every onboarded payout (previously only manual withdrawals). **Fix:** skip wallet-transfer events
   (`metadata.type ∈ WALLET_TRANSFER_TYPES`) when building the entity map.
4. **P2 flush no-op on a stale flag + P3 misleading copy.** (a) `applyWalletFirstPayout` only flushes when the
   handler's `verifyPayoutReady` (a live Stripe check) is true, but `flushPendingBalance` re-read the CACHED
   `stripe_onboarding_complete` and could no-op if the self-heal write wasn't visible — finalizing + reporting
   `wallet_flush` while money stayed parked. Added an `assumeReady` option to `flushPendingBalance`;
   `release-creator-payout` passes it (matches spec §3.1: verifyPayoutReady is the flush decision, not the
   flush's flag check). Backward-compatible for other callers. (b) `payout_pending_wallet` copy told creators
   to "complete Stripe setup" — wrong for an onboarded creator whose payout just flushed. `getPaymentMessage`
   is now reason-aware (`metadata.reason==='flushing_to_stripe'` → paid-to-Stripe copy); threaded
   `event.metadata` through `PaymentTimeline` + `usePaymentNotifications`.

Round 5: **clean.**

## Deploy + prod verify

- **No new migration** — all RPCs/columns live from #329/#334.
- Deployed `release-creator-payout` (twice — initial + the assumeReady fix) and `check-creator-payout-status`,
  both `--no-verify-jwt` (preserved), boot-checked (no-auth invoke returns the handler guard; deployed source
  confirmed byte-identical).
- **Rollback-wrapped prod test** (terminal `RAISE EXCEPTION` → guaranteed rollback, zero residue) proved the
  invariant the reroute newly relies on for EVERY payout: `credit_pending_balance_for_payout` credits exactly
  once (0→1.00), sets the marker atomically (NULL→timestamp), and a re-entry returns `'already'` with NO
  double-credit (still 1.00).

## Reviews

`edge-function-reviewer` PASS, `data-exposure-reviewer` PASS ("no path lets one actor reach money or data that
isn't theirs"), Codex clean after 4 fix rounds.

## Gotchas / decisions

- Edge-fn `index.ts` with a top-level `serve()` is NOT unit-testable by import (server-on-import / leaked
  resource). Factor the testable body into a co-located pure module; do NOT rely on `import.meta.main` (untested
  in the Supabase runtime).
- `has_column_privilege` said `pending_balance` is readable, but four REVOKE migrations show a tug-of-war —
  prefer routing financial columns through edge functions over depending on a contested grant.
- Rollback-wrapped prod tests: end the `DO` block with `RAISE EXCEPTION` so the transaction CANNOT commit and
  the assertions come back in the error message (MCP `execute_sql` returns only the last statement).

## Residuals after stage 2

- **Closed:** cross-path concurrent double-pay; Stripe-up/DB-down marker split-brain.
- **Out of scope:** `release-sponsorship-payout` (brand→creator) likely has a parallel direct-transfer shape —
  a separate follow-up.
- **Accepted:** per-collaboration Stripe-transfer traceability weakens (the transfer ledger row is wallet-level
  `entity_id=userId`, not `collaborationId`); per-collaboration crediting stays traceable via
  `payout_pending_wallet`. Historical pending-path collaborations never wrote `payment_released`, so their
  business In Escrow stays overstated until a future re-payout/refund (negligible pre-revenue; not backfilled).
