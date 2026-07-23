# Session — Payout durable re-entrancy (Complete follow-up to #328)

**Date:** 2026-07-23
**Branch:** `feat/payout-durable-marker`
**Area:** content-delivery stabilization / money path

## What shipped

Made `release-creator-payout` **durably re-entrant** so retries and reconciliation can't double-pay,
completing the follow-up that #328 could only ship a "safe subset" of.

Design principle: **marker = "money moved", set AFTER money moves (never a pre-claim)**, so
"marker set ⇒ money moved" holds by construction and reconciliation is trivial. A pre-claim was
explicitly rejected — it would make a crash between claim and transfer look "paid" while the creator
was never paid (marked-not-paid).

### Changes
- **Migration `20260723160000`** (already applied last session): two nullable columns on
  `campaign_collaborations` — `payout_executed_at timestamptz`, `stripe_transfer_id text`.
- **Migration `20260723170000`** (new): atomic SECURITY DEFINER RPC
  `credit_pending_balance_for_payout(p_collaboration_id, p_user_id, p_amount)` — row-locks the
  collaboration `FOR UPDATE`, checks the marker, credits `creator_profiles.pending_balance` and sets
  `payout_executed_at` in ONE transaction; returns `'credited'`/`'already'`; `RAISE`s if no wallet row
  (never mark-without-crediting) or if `p_user_id` ≠ the row's `creator_id`. Service-role only
  (REVOKE public/anon/authenticated + in-body `request.jwt.claims->>'role' = 'service_role'` guard),
  mirroring `increment_pending_balance` / `transition_content_status`. Verified live on prod, ACL
  `{postgres=X/postgres, service_role=X/postgres}`.
- **`release-creator-payout/index.ts`:**
  - Early re-entry guard (before the escrow gate): marker set → finalize-only, return.
  - Transfer path: `markTransferExecuted` writes the marker the instant the transfer confirms; a
    pre-transfer re-check narrows the cross-path race; finalize failure → `500 {needsRetry}` (was the
    #328 fire-and-forget 200).
  - Pending path: calls the atomic RPC instead of the non-idempotent `increment_pending_balance`;
    ledger events guarded on `!alreadyCredited`; finalize failure → `500 {needsRetry}`.
  - **Marker-write-failure path is non-retry / manual-reconciliation** (`manualReconciliation:true`,
    NO `needsRetry`) — a Codex P1 fix: inviting a retry there could double-pay past Stripe's ~24h
    idempotency window since nothing durable was recorded.
- **`auto-approve-content/index.ts`:** reconciliation sweep (re-invokes finalize-only for
  marked-but-unfinalized rows) gained a 5-min min-age guard.

## Reviews
- **data-exposure-reviewer:** PASS. Added its optional hardening (`p_user_id` must match the locked
  row's `creator_id`).
- **edge-function-reviewer:** ISSUES → deploy-ordering (satisfied: both migrations live before deploy),
  and a [med] transfer-vs-pending cross-path double-pay. Verified real; the reviewer's suggested atomic
  pre-claim would reintroduce marked-not-paid, so shipped a window-narrowing re-check + documented the
  residual instead.
- **Codex:** one [P1] — marker-write-failure invited a retry that could double-pay after 24h. Fixed
  (non-retry / manual-reconciliation on that branch only). Re-run to clean.

## Known residuals (documented, need the wallet-first redesign)
- Transfer-vs-pending cross-path concurrent double-pay (narrowed, not eliminated; fully-atomic fix
  impossible — can't hold a DB lock across the external Stripe call via PostgREST).
- Marker-write-failure split-brain (Stripe up / DB down): non-retry, manual/Stripe-verified
  reconciliation; invisible to the auto sweep.
- **Clean fix for both:** make the pending-wallet credit the single atomic money step, and turn the
  Stripe payout into a separate idempotent (Stripe-list-verified) wallet→Stripe flush. Removes the
  transfer-vs-pending fork. Tracked as the next payout hardening.

## Gotchas
- `apply_migration` returned success; verified the actual function via `pg_proc`/ACL, not
  `schema_migrations` (recorded≠actual precedent on this exact area, #325).
- Both target edge fns are `verify_jwt=false` (release-creator-payout v183, auto-approve-content v60) —
  deploy must preserve.
