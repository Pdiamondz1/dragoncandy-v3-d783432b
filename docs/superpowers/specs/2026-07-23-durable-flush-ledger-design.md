# Durable pending-balance flush ledger — design

**Date:** 2026-07-23
**Status:** DESIGN (approved in brainstorming; pending spec review + implementation plan)
**Area:** content-delivery / money path
**Stage:** Sub-project 1 of the payout hardening. Prerequisite for the wallet-first reroute
(`2026-07-23-wallet-first-payout-redesign-design.md`, deferred as sub-project 2).
**Relates:** [[Payout Finalization & Re-entrancy]] (PR #329).

## 1. Problem

`transferPendingBalance` (`supabase/functions/_shared/flush-pending-balance.ts`) — the shared wallet→Stripe
money move used by manual withdraw, the `account.updated` webhook, and the onboarding-return status poll —
protects a single balance with `stripe.transfers.create({...}, { idempotencyKey: withdraw_${userId}_${amountCents} })`.
That key has to do **two conflicting jobs**:

1. **Be stable across retries of the same balance-movement**, so that after an *ambiguous* Stripe failure
   (a timeout/5xx where the transfer may actually have been created), a later re-flush of the
   restore-on-error'd balance **replays** the same transfer instead of creating a second one. (This is why
   the amount-based key exists — it is the current guard against ambiguous-failure double-pay.)
2. **Be unique across distinct balance-movements**, so two *separate* balances of the identical cents
   amount within Stripe's ~24h idempotency window don't collide.

The amount-based key does (1) but fails (2): two identical-cents flushes collide → the second replays the
first's transfer (no new money moves) while the atomic claim still zeroes the wallet → **creator underpaid,
money stuck**. A naive fix — a random per-flush key — does (2) but loses (1) → **ambiguous-failure over-pay**.
There is no single stateless key that does both; exactly-once payout requires a **durable per-flush record**
(the "persisted balance-event id" the flush's own comment defers). This design adds it.

Today the collision is low-probability (whole-balance flushes are usually one-at-a-time), but the deferred
**wallet-first reroute** would amplify it (a per-collaboration flush of each payout's exact net amount →
identical amounts are plausible in a standardized-pricing beachhead). Fixing it here is a standalone
correctness win **and** unblocks that reroute.

## 2. Current state (what exists)

- `transferPendingBalance(stripe, supabase, {table, userId, stripeAccountId, pendingBalance, source})`:
  atomic claim (`UPDATE {table} SET pending_balance=0 WHERE user_id=$1 AND pending_balance=$read RETURNING …`
  — zero only if unchanged), transfer with the amount-based key, **restore-on-Stripe-error** via
  `increment_pending_balance` (atomic add-back), then `writePaymentEvent('transfer_created', entity_id=userId)`.
- `flushPendingBalance(stripe, supabase, stripeAccountId)`: resolves the profile by connected-account id,
  flushes when `stripe_onboarding_complete === true` and `pending_balance > 0`; swallows the benign
  "lost the race" (`BALANCE_CHANGED`); re-throws genuine failures.
- Callers: `withdraw-pending-balance` (uses `transferPendingBalance` directly, expects `{transferId}`,
  throws → 500); `stripe-webhook` `account.updated` (~line 414), `check-creator-payout-status` (~line 93),
  and `check-restaurant-payout-status` (~line 177) — the latter three call `flushPendingBalance` in a
  best-effort try/catch and only log on error (**contracts unaffected**). All four bundle the shared file
  and must be redeployed (§5).
- Tests: `_shared/flush-pending-balance.test.ts`.

## 3. Design

### 3.1 New table — `pending_balance_flushes` (the durable record)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK (default `gen_random_uuid()`) | The idempotency seed: transfer key = `flush_${id}` |
| `user_id` | uuid → `auth.users(id)` | Owner of the flushed balance; also the transfer `metadata.user_id` |
| `profile_type` | text `creator`/`business` | Which profile table the balance came from |
| `stripe_account_id` | text | **Destination — stored so reconciliation can rebuild the transfer byte-identically without a re-lookup (see §3.4).** |
| `amount_cents` | int | The claimed amount → transfer `amount` + restore |
| `source` | text `manual`/`autoflush` | Drives `description` + `withdrawal_type` + `metadata.type` (so the replay is identical) |
| `status` | text `claimed`/`succeeded`/`failed`/`stuck` | Lifecycle; `stuck` = terminal (cap exceeded, held for a human) |
| `stripe_transfer_id` | text null | Set on `succeeded` |
| `attempts` | int default 0 | Reconciliation retry count |
| `last_error` | text null | Last Stripe error (audit) |
| `created_at` / `updated_at` | timestamptz default `now()` | `updated_at` set explicitly by every RPC (no dependence on a trigger) |

The row stores **everything needed to rebuild the exact transfer params** (`id`, `user_id`,
`stripe_account_id`, `amount_cents`, `source`) so the reconciliation replay is self-contained and
guaranteed param-identical to the original — see §3.3/§3.4.

RLS: **no client access** (internal plumbing) — internal-team `SELECT` via `is_internal_user()`, and a
service-role `FOR ALL` policy; all writes go through the SECURITY DEFINER RPCs below. Partial index on
`(created_at) WHERE status='claimed'` for the reconciliation scan (so terminal `succeeded`/`failed`/`stuck`
rows are never re-scanned).

### 3.2 Atomic claim + resolution RPCs (SECURITY DEFINER, service-role only)

Mirror the `credit_pending_balance_for_payout` lockdown pattern (REVOKE public/anon/authenticated +
in-body `request.jwt.claims->>'role'='service_role'` guard):

- **`claim_pending_balance_flush(p_user_id, p_profile_type, p_stripe_account_id, p_amount_cents, p_source) RETURNS uuid`**
  — the full **5-arg** signature; **`p_source` is load-bearing** (stored on the row so §3.4's replay derives
  the correct `description`/`withdrawal_type` for a *manual* flush — omit it and the replay params diverge →
  a 400 conflict → the row is stuck-safe but never reconciles). Locks the profile row `FOR UPDATE`; if
  `round(pending_balance*100) = p_amount_cents` and `> 0`, set `pending_balance = 0` **and** `INSERT INTO
  pending_balance_flushes (user_id, profile_type, stripe_account_id, amount_cents, source, status='claimed')
  RETURNING id`, all in one transaction; else return `NULL` (the caller treats NULL as `BALANCE_CHANGED`).
  Replaces the inline `UPDATE … WHERE pending_balance=$read` claim and makes claim-and-record atomic.
- **`confirm_pending_balance_flush(p_flush_id, p_transfer_id)`** — `status='succeeded'`,
  `stripe_transfer_id`, `updated_at=now()`. No balance change — money already left.
- **`fail_pending_balance_flush(p_flush_id, p_restore boolean, p_error text)`** — `status='failed'`,
  `last_error`, `updated_at=now()`; if `p_restore`, atomically add **`amount_cents::numeric / 100`** back
  to the profile's `pending_balance` (note the `::numeric` cast — `amount_cents` is an int and
  `pending_balance` is numeric dollars, so bare `amount_cents/100` would be integer division and lose
  cents on a money path). One RPC so restore + mark are atomic.
- **`bump_flush_attempt(p_flush_id, p_error text, p_cap int)`** — `attempts = attempts + 1`, `last_error`,
  `updated_at=now()`; if the incremented `attempts >= p_cap`, set `status='stuck'` (terminal — drops out of
  the reconciliation scan so escalation fires **once**, not every cycle). Returns the new status so the
  caller can escalate on the `claimed→stuck` transition. Does **not** restore (a capped row may have a
  delivered-but-unconfirmable transfer; restoring could double-pay — hold for a human).

Every RPC mirrors the `credit_pending_balance_for_payout` lockdown (SECURITY DEFINER, `SET
search_path=public`, REVOKE public/anon/authenticated + in-body `request.jwt.claims->>'role'='service_role'`
guard) and sets `updated_at=now()` explicitly.

### 3.3 Refactored `transferPendingBalance` + a shared param-builder

**The transfer params are built in ONE place, `buildFlushTransferParams(row)`, driven only by stored flush-row
fields** — used by both the initial send here and the reconciliation replay (§3.4). This is load-bearing:
Stripe replays an idempotency key **only when re-sent with byte-identical params**; a same-key call with
*different* params returns a 400 key-conflict (it does NOT return the original transfer). Building the params
from one helper off the stored row guarantees the replay matches.

```
buildFlushTransferParams(row) = {
  amount: row.amount_cents,
  currency: 'usd',
  destination: row.stripe_account_id,
  description: row.source==='manual' ? 'DragonCandy platform wallet withdrawal'
                                     : 'DragonCandy pending balance auto-payout',
  metadata: { user_id: row.user_id,
              withdrawal_type: row.source==='manual' ? 'pending_balance' : 'pending_balance_autoflush',
              flush_id: row.id },
}
// key is always `flush_${row.id}`

// transferPendingBalance:
id  = claim_pending_balance_flush(userId, profileType, stripeAccountId, amountCents)  // NULL → throw BALANCE_CHANGED
row = { id, user_id:userId, stripe_account_id:stripeAccountId, amount_cents, source }
try:
  transfer = stripe.transfers.create(buildFlushTransferParams(row), { idempotencyKey: `flush_${id}` })
  confirm_pending_balance_flush(id, transfer.id)
  writePaymentEvent('transfer_created', entity_id=userId, stripe_id=transfer.id, metadata:{ type: metadataType, flush_id:id })
  return { transferId: transfer.id, amountCents }
catch (stripeErr):
  if isDefiniteFailure(stripeErr):     // request definitively rejected → NO transfer created
     fail_pending_balance_flush(id, restore=true, msg)   // money returns to wallet
  else:                                // ambiguous → transfer MAY exist; never restore
     bump_flush_attempt(id, msg, CAP)  // leave 'claimed' (or 'stuck' at cap); reconciliation re-drives
  throw stripeErr
```

**`isDefiniteFailure` (conservative — misclassifying ambiguous-as-definite is the double-pay risk):** true
**only** for `err.type === 'StripeInvalidRequestError'` whose HTTP status is 400–404/422 **AND** whose
`code`/message is a genuine parameter rejection (e.g. invalid `destination`, insufficient available balance).
It is **false** — i.e. treated as ambiguous — for: any connection/timeout error, any 5xx, unknown errors, and
**specifically a Stripe idempotency-key-conflict 400** (`err.type==='StripeIdempotencyError'`, or the
`"Keys for idempotent requests can only be used with the same parameters"` message). The idempotency-conflict
case means a *prior* same-key request with different params exists — which for our single-builder design
should never happen, but if it does it signals a possible in-flight/delivered transfer, so it must NEVER
restore. Ambiguous ⇒ leave a re-drivable `claimed` row keyed on the stable `flush_${id}`.

### 3.4 Reconciliation — `reconcile-pending-flushes` (new cron function)

A dedicated edge function on the pg_cron + `net.http_post` fleet pattern (Vault URL + `aios_ingest_key`
bearer, `isAuthorizedIngest`), every 15 min, own logs (money reconciliation deserves isolation). For each
`status='claimed'` row older than ~5 min (min-age guard, like the payout sweep — never contend with an
in-flight first attempt):

- Rebuild the transfer with **`buildFlushTransferParams(row)`** (the same helper the initial send uses →
  byte-identical params) and re-call `stripe.transfers.create(params, { idempotencyKey: flush_${id} })` →
  Stripe **replays** the original if it went through (returns the same transfer) or **creates** it if it
  didn't → `confirm_pending_balance_flush(id, transfer.id)` **and write the `transfer_created` payment_event
  built entirely from the stored row** — same shape as the inline path: `entity_id=user_id`,
  `entity_type`/`actor_role` from `profile_type`, `amount_cents`, `stripe_id=transfer.id`, and
  `metadata:{ type: (source==='manual'?'wallet_withdrawal':'pending_balance_autoflush'), flush_id }`. The
  reconciliation path must emit the *same* ledger row the inline path does (incl. `metadata.type`), so a
  cron-delivered transfer is not missing from — or divergent in — the money-movement audit.
- If it now fails **definitely** (per `isDefiniteFailure`, §3.3) → `fail_pending_balance_flush(restore=true)`
  (return money to wallet + a CRITICAL log for a human).
- If it fails **ambiguously again** → `bump_flush_attempt(id, msg, CAP)`; the RPC flips the row to terminal
  `status='stuck'` once `attempts >= CAP` (e.g. 6), so it drops out of the scan and a CRITICAL /
  `aios-report-ingest` finding is filed **once**. A `stuck` row is **never** auto-restored (a
  maybe-delivered transfer could double-pay) — it waits for a human to reconcile against the Stripe dashboard.

This makes the flush **exactly-once even across ambiguous failures**: the money is never lost (tracked as
`claimed`/`stuck`, never silently zeroed) and never double-sent (the stable key + byte-identical params
replay). The single param-builder is what upgrades "same key" into a real replay rather than a 400 conflict.

### 3.5 Caller impact

- `withdraw-pending-balance`: unchanged call shape; on ambiguous failure it now throws (as today) but the
  money is tracked as `claimed` (not lost) and reconciliation resolves it. (Optional later UX: surface
  "withdrawal processing" instead of an error — out of scope here.)
- `flushPendingBalance` (webhook + poll): unchanged — still returns `{flushed, amount, transferId?}` and
  re-throws genuine errors, which those callers already catch + log. Its internal `transferPendingBalance`
  call now goes through the ledger.
- `increment_pending_balance`: still used elsewhere (the credit path); the flush restore now goes through
  `fail_pending_balance_flush` instead of a bare `increment_pending_balance`, so restore + status are atomic.

## 4. Error handling summary

| Failure | Behavior | Money |
|---|---|---|
| Claim loses race / balance changed | RPC returns NULL → `BALANCE_CHANGED` (benign for autoflush) | untouched |
| Definite Stripe failure (4xx) | `fail(restore=true)` inline | restored to wallet |
| Ambiguous Stripe failure (timeout/5xx) | leave `claimed`, `bump_attempt`, throw | held (claimed); reconciliation replays with same key |
| Reconciliation replay succeeds | `confirm` + write `transfer_created` event | delivered exactly once |
| Reconciliation definite-fail | `fail(restore=true)` + CRITICAL | restored |
| Reconciliation `attempts >= cap` | RPC sets terminal `status='stuck'`, finding filed once, do NOT restore | held pending human (avoids double-pay) |

## 5. Migration + deploy ordering

New migration: `pending_balance_flushes` table + RLS + the four RPCs (all additive; no drops). Apply to prod
**before** deploying the refactored `_shared/flush-pending-balance.ts` (which every flush caller bundles).
Then deploy `withdraw-pending-balance`, `stripe-webhook`, `check-creator-payout-status`,
`check-restaurant-payout-status` (all bundle the shared file) + the new `reconcile-pending-flushes`, and
schedule its cron. Boot-check each. Verify the RPC/table live via `pg_proc`/`information_schema` (not just
`schema_migrations`).

**Cutover note (negligible, money path — call out for the record):** the new scheme keys on the brand-new
`flush_${id}` namespace, so there is no cross-scheme key conflict with old `withdraw_*` transfers. The one
transient wrinkle: a flush that failed *ambiguously* under the OLD code immediately before cutover has its
balance restored by the old code; a post-deploy re-flush uses a new `flush_${id}` key and would not replay
the old transfer if it had actually gone through. This is the *same* risk profile as the pre-existing
always-restore-on-error baseline (not a regression) and requires an ambiguous Stripe failure landing exactly
across the deploy — accept it, or briefly quiesce flushes during the deploy. No action needed beyond
awareness.

## 6. Testing

- Extend `flush-pending-balance.test.ts`: claim returns an id + inserts `claimed`; success → `succeeded` +
  key `flush_${id}`; **two distinct identical-cents flushes get distinct keys → both move money** (the bug
  this closes); definite failure → restore + `failed`; ambiguous failure → `claimed` + no restore.
- Rollback-wrapped prod tests (fake `request.jwt.claims` service_role): `claim_pending_balance_flush` zeroes
  balance + inserts one `claimed` row and is a no-op on a changed balance; `fail(restore=true)` restores
  exactly; `confirm` marks succeeded. Reconciliation replay against a real Stripe test transfer id.
- Reviews: `edge-function-reviewer` (all flush-bundling callers) + `data-exposure-reviewer` (new RPCs +
  table RLS) + Codex second pass.

## 7. Residuals / scope

- **Closes:** the identical-cents idempotency-key collision (under-pay) **without** re-introducing
  ambiguous-failure over-pay — the durable record does both jobs.
- **Out of scope:** the wallet-first reroute of `release-creator-payout` (sub-project 2, deferred — needs
  this foundation + a frontend ledger-event reconciliation); `release-sponsorship-payout`.
- **Note:** `stripe.transfers.create` metadata now carries `flush_id`, enabling a future Stripe-list-based
  reconciliation that survives even the ~24h key-retention window (belt-and-suspenders; not required — the
  `claimed` record already prevents loss).
