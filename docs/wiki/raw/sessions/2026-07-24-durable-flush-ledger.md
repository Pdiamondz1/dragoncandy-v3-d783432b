# Session — Durable pending-balance flush ledger (stage 1 of the wallet-first payout fix)

**Date:** 2026-07-24
**Branch:** `feat/wallet-first-payout`
**Follows:** PR #329 ([[Payout Finalization & Re-entrancy]]) — the durable-marker re-entrancy work.
**Spec:** `docs/superpowers/specs/2026-07-23-durable-flush-ledger-design.md`
**Plan:** `docs/superpowers/plans/2026-07-23-durable-flush-ledger.md`

## What shipped

A **durable per-flush ledger** that makes the shared wallet→Stripe flush
(`transferPendingBalance` in `supabase/functions/_shared/flush-pending-balance.ts`)
**exactly-once**: it fixes the identical-cents idempotency-key **under-pay** without
re-introducing an ambiguous-failure **over-pay**.

This is **stage 1** of the wallet-first payout redesign. Stage 2 — rerouting
`release-creator-payout`'s onboarded path through the wallet so there's a single money
path — is a separate, still-deferred spec
(`docs/superpowers/specs/2026-07-23-wallet-first-payout-redesign-design.md`), because it
also needs a frontend ledger-event contract change. Stage 1 is the prerequisite that
makes the shared flush safe enough for stage 2 to build on.

### The problem (the flush idempotency-key dilemma)

The old `transferPendingBalance` keyed its Stripe transfer on
`withdraw_${userId}_${amountCents}`. That key had to do two conflicting jobs:
- **Stable** across retries of the *same* balance movement (so an ambiguous failure
  replays the original transfer, not a second one).
- **Unique** across *distinct* movements (so two separate flushes of the same cents
  amount don't collide).

An amount-based key is ambiguity-safe but **collides** → a second identical-cents flush
within Stripe's ~24h key window is deduped to the first transfer → the creator is
**under-paid** (money stuck). A random key is collision-free but loses the ambiguity
guard → **over-pay**. The only resolution is a **durable per-flush record** whose id is
the idempotency key.

### The mechanism

- **Table `pending_balance_flushes`** (migration `20260723180000`): one row per flush,
  `status ∈ claimed/succeeded/failed/stuck`, storing `user_id`/`profile_type`/
  `stripe_account_id`/`amount_cents`/`source` — enough to rebuild the transfer params
  **byte-identically** for a reconciliation replay. Partial index on
  `(created_at) WHERE status='claimed'` (the only rows the reconcile scan reads).
  Internal-SELECT + service-role-FOR-ALL RLS; no client write path.
- **Four SECURITY DEFINER RPCs**, all service-role-only (in-body
  `request.jwt.claims->>'role'='service_role'` guard + `REVOKE public/anon/authenticated`
  + `GRANT service_role` — the [[Service-Role Data Exposure]] / revoke-definer-from-anon
  lockdown):
  - `claim_pending_balance_flush(user, profile_type, acct, cents, source) → uuid` —
    row-locks the profile `FOR UPDATE`, verifies `round(pending_balance*100)=cents`
    (NULL/mismatch/non-positive → returns NULL ⇒ caller throws `BALANCE_CHANGED`),
    zeroes the balance, inserts a `claimed` row, returns its id.
  - `confirm_pending_balance_flush(id, transfer_id)` — `claimed → succeeded` + records
    the transfer id.
  - `fail_pending_balance_flush(id, restore, error)` — `claimed → failed`; if `restore`,
    adds back **exactly** `amount_cents::numeric/100` (the `::numeric` cast matters — an
    integer division would floor to 0). Idempotent (`WHERE status='claimed'`, row-locked).
  - `bump_flush_attempt(id, error, cap) → text` — increments `attempts`; flips
    `claimed → stuck` at the cap; returns the resulting status. Because the UPDATE is
    guarded `WHERE status='claimed'`, it returns `'stuck'` on **exactly** the
    claimed→stuck transition (a re-call finds `status<>'claimed'` → NULL), giving a
    file-once alert for free.
- **`executeFlushTransfer(stripe, supabase, row)`** — shared by the inline
  `transferPendingBalance` AND the reconcile cron. Keys the transfer on `flush_${row.id}`
  (built from stored fields, so an inline send and a reconcile replay are byte-identical
  → real Stripe idempotent replay, never a 400 key-conflict). On error: `isDefiniteFailure`
  (a `StripeInvalidRequestError` 4xx, raised pre-creation) → `fail(restore)`; anything
  ambiguous (5xx / connection / **idempotency-conflict**) → `bump` (no restore, the
  transfer may exist). On success: `confirm` **then** the `transfer_created` ledger write —
  and if `confirm` errors, it **throws before the ledger write** so reconcile re-drives
  and the ledger is written exactly once (no duplicate).
- **`reconcile-pending-flushes` edge function + `*/15` pg_cron** (migration
  `20260723190000`): scans `claimed` rows older than 5 min (never contends with a first
  attempt), re-drives each through `executeFlushTransfer`. `verify_jwt=false` +
  `isAuthorizedIngest` (fleet pattern, mirrors `auto-approve-content`); URL + bearer from
  Vault (`reconcile_pending_flushes_url` + the shared `aios_ingest_key`).

## Key decisions & gotchas (durable)

- **Stage the fix.** The full wallet-first reroute would have introduced the under-pay
  bug *and* needed a frontend money-math change (four consumers assume exactly one of
  `{transfer_created, payout_pending_wallet}` per payout). Staging the flush ledger first
  makes the shared flush collision-free-and-ambiguity-safe, removing the exposure the
  reroute would otherwise have inherited.
- **The stuck alert closes a real safety gap.** A `claimed` row's wallet balance is
  already zeroed at claim and is **never** auto-restored, so a flush that hits the cap
  must alert a human. `bump_flush_attempt` returns `'stuck'` exactly once; the shared code
  files ONE `aios-report-ingest` CRITICAL finding on that transition.
- **The confirm-failure path was the one unbounded loop → double-pay past the TTL.**
  Code review caught that a transfer-succeeds-but-`confirm`-fails row stays `claimed`
  without incrementing `attempts`, so reconcile would re-drive it **forever** — and past
  Stripe's ~24h key TTL a re-drive creates a SECOND transfer. Fix: **bump on
  confirm-failure too** (no restore — money moved), funneling that path into the same
  cap→stuck bound (≤6 attempts ≈ 90 min, far under the TTL).
- **`aios-report-ingest` envelope is `{type:"findings", payload:{findings:[{title,
  summary_md, severity, fingerprint}]}}`** — a flat `{severity,title,detail}` 400s
  ("payload is required") and the fire-and-forget alert would silently never file. Read a
  real caller (`bug-sweep-agent`) for the exact contract; assert the envelope shape in the
  test, not just that `fetch` fired.
- **`isDefiniteFailure` narrows the spec deliberately** (4xx `StripeInvalidRequestError`
  only, idempotency-conflict caught as ambiguous *first*) — safe because every
  `StripeInvalidRequestError` is raised pre-creation, so restore-on-4xx can't double-pay.
- **Overlapping-reconcile duplicate ledger (Codex [P2] — fixed).** Two reconcile
  invocations on the same `claimed` row replay the same key (no double-*pay*), but the
  second `confirm` was a no-op returning no error → the code wrote a **second**
  `transfer_created` row, and `payment_events` isn't unique on `stripe_id` and its rows are
  summed for totals → double-count. Fix: `confirm_pending_balance_flush` now **`RETURNS
  boolean`** (did this call transition the row; migration `20260723200000`, a DROP+CREATE),
  and `executeFlushTransfer` **skips the ledger write when it returns `false`**.
- **Post-confirm ledger-write residual (accepted).** The *inverse* case remains: if
  `confirm` transitions the row (`true`) but the subsequent `writePaymentEvent` throws, the
  row is `succeeded` with no ledger row and reconcile (scans only `claimed`) won't re-drive
  it — same as the pre-existing old-code behavior, not a regression.

## Verification

- **26 Deno tests** on the refactored shared file (RED→GREEN): distinct-key-for-
  identical-cents, definite-400→fail(restore), ambiguous→bump-no-restore,
  idempotency-conflict→ambiguous, well-formed stuck envelope fires once, confirm-failure
  bounding, direct `isDefiniteFailure` edge cases, fractional `Math.round`.
- **Rollback-wrapped prod RPC test** (a `DO` block that RAISEs to force rollback):
  claim zeroes+inserts, mismatch→NULL, `fail(restore)` adds exactly 10.50 (proving
  `::numeric`), confirm→succeeded, bump-twice-at-cap→stuck, server-only guard rejects a
  non-service-role caller.
- **Real test-mode Stripe replay E2E on prod** (the central proof): inserted a synthetic
  backdated `claimed` row for a test-mode connected account, invoked the deployed
  reconcile → `{scanned:1,reconciled:1}`, row→`succeeded` + real transfer, 1 ledger row,
  creator balance untouched. Reset the row to `claimed` and re-invoked → **same**
  `stripe_transfer_id`, no second transfer (Stripe replayed the `flush_${id}` key → no
  double-pay). Cleaned up (row + both test ledger rows deleted, balance == snapshot).
- Reviews: `data-exposure-reviewer` (migration) PASS, `edge-function-reviewer` (reconcile
  fn + bundling) PASS, spec + code-quality subagent reviews per task, Codex second pass.

## Affected surface

- **Migrations:** `20260723180000_pending_balance_flushes.sql` (table + 4 RPCs),
  `20260723190000_reconcile_pending_flushes_cron.sql` (pg_cron).
- **Edge functions:** new `reconcile-pending-flushes`; redeployed `withdraw-pending-balance`,
  `stripe-webhook`, `check-creator-payout-status`, `check-restaurant-payout-status` (they
  bundle the refactored `_shared/flush-pending-balance.ts`).
- **Shared:** `_shared/flush-pending-balance.ts` (+ its `.test.ts`); `supabase/config.toml`
  (`[functions.reconcile-pending-flushes] verify_jwt=false`).
- **Vault (prod, out-of-band):** created `reconcile_pending_flushes_url`; reused the
  existing `aios_ingest_key`.

## Known follow-up

- **Stage 2 — the wallet-first reroute** (deferred spec): route
  `release-creator-payout`'s onboarded path through the wallet + this flush, removing the
  transfer-vs-pending fork entirely, which is what actually closes the two remaining
  `release-creator-payout` residuals (cross-path concurrent double-pay; marker split-brain).
  Needs the frontend ledger-event contract change described in that spec.
