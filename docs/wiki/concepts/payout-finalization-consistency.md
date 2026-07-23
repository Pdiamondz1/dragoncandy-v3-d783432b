---
title: Payout Finalization & Re-entrancy
type: concept
created: 2026-07-23
updated: 2026-07-23
sources: [docs/wiki/raw/sessions/2026-07-23-payout-finalize-retry.md]
tags: [payments, payout, escrow, idempotency, money-path]
---
# Payout Finalization & Re-entrancy

`release-creator-payout` moves money (a Stripe Connect transfer, or a pending-balance wallet credit),
then runs a **finalize** step that marks the collaboration `completed` / `content_status='approved'`
and the campaign `escrow_status='released'`. This page captures why that finalize is hard to make
robust — learned across the four review passes of PR #328.

## The two payout paths differ in retry-safety

- **Stripe-transfer path** (creator onboarded): `stripe.transfers.create` uses idempotency key
  `payout_${collaborationId}`, so a retry **within ~24h** is deduped by Stripe. But Stripe **prunes the
  key after ~24h** — a later retry creates a SECOND transfer (double-pay).
- **Pending-balance path** (creator not onboarded): `increment_pending_balance` just *adds* the amount —
  **not idempotent** — so any re-invocation double-credits the wallet.

## The escrow gate allows re-entry

The function admits `escrow_status IN ('held','releasing')` (so a mid-release retry can proceed). So
escrow status alone does **not** block re-invocation — only a terminal `'released'`/`'refunded'` does.
The pre-existing code leaned on setting `escrow_status='released'` at finalize as a **crude re-entry
guard**: once released, a re-invocation is rejected by the gate. Crude because if the finalize update
itself fails, escrow may never reach `'released'`, leaving the door open.

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

## Known Issues / Follow-ups (Complete scope)

- **No durable payout marker.** Reliably guarding re-entry (incl. the rare both-updates-fail case) and
  safely surfacing/retrying finalize failures needs a durable **per-collaboration payout record**
  (a column/table, e.g. persisting the transfer id) checked *before* crediting — independent of the two
  updates that can both fail.
- **No reconciliation sweep.** Collaborations stuck at `escrow='releasing'`/`'held'` after a persistent
  finalize failure need an ops-visible reconciliation (cron/query), not just a `console.error` line.
- `auto-approve-content` flips `content_status` to `auto_approved` before calling payout and its scan
  excludes `auto_approved`, so it does not auto-retry a stuck auto-approval (avoids the double-credit,
  but also means no auto-recovery).

## See Also
- [[Content Delivery State Machine]]
- [[Stripe Webhook Delivery]]
- [[Test-Mode Stripe UX]]
