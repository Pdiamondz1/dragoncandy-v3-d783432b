# Payout finalize retry + safe failure handling (2026-07-23, PR #328)

Third increment from the content-delivery-stabilization backlog (after #325 drift repair + #326
posting-schedule). User picked the "Safe core" scope for the payout DB-consistency fix; the reviews
then descoped it further (see below).

## The bug

`release-creator-payout` moves money, then runs a finalize step (collab → `approved`/`completed`,
campaign → `escrow_status='released'`). It ran that finalize **once, fire-and-forget**: on failure it
logged `CRITICAL` but still returned `200`, so money moved, the DB was left inconsistent (escrow stuck
at `'releasing'`), the caller saw success, and nothing retried.

## What shipped (the safe subset)

A retried `finalizePayoutState()` helper (4 attempts, backoff) used by both payout paths — self-heals
the common transient-DB-failure case. Deliberately preserves the prior semantics otherwise
(unconditional `escrow='released'`; both paths fall through to `200`). One file
(`release-creator-payout/index.ts`), deployed to prod.

## Why it descoped — four review passes

The intended "safe core" was "retry + return an error on persistent failure so the caller retries." The
reviews showed that's unsafe without more infrastructure:

- **edge-function-reviewer [high]:** `increment_pending_balance` is not idempotent, and the frontend
  prompts a retry on any non-2xx (`CampaignDetailsPage.tsx`), so a pending-path error → double-credit.
- **Codex [P2]:** an ordering fix (release escrow only after the collab update) left escrow at `held`
  on the pending path → the gate re-admits → double-credit; the *original* unconditional
  `escrow='released'` was actually a crude re-entry guard.
- **Codex [P1] (transfer):** the Stripe idempotency key is only durable ~24h, so a client retry after
  that window double-pays — no persisted transfer marker to gate on.

Net: safely surfacing/retrying a finalize failure, or fully guarding re-entry, needs a **durable
per-collaboration payout marker** (schema change) + a reconciliation sweep — the **Complete-scope
follow-up**. So this PR ships only the zero-risk win (retry-on-transient) and documents the rest.

## Verification

Deployed (all 5 `_shared` bundled; clean-boot check returned the handled auth error, not a crash).
edge-function-reviewer [high] fixed; Codex clean after 4 rounds.

## Durable lesson

Captured on [[Payout Finalization & Re-entrancy]]: on a money path, "return an error so the caller
retries" is only safe if the money-moving op is durably idempotent — verify BOTH the credit mechanism
AND the caller's retry behavior before surfacing an error after money has moved.
