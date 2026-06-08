# Auto-Flush Stranded `pending_balance` on Payout-Readiness — Design

> Status: approved design, ready for implementation planning
> Created: 2026-06-08
> Author: Claude Code (brainstorming skill) + Dame

## 1. Problem

When a campaign collaboration or sponsorship is approved but the creator (or
restaurant, for sponsorships) has **not finished Stripe Connect onboarding**, the
payout cannot be transferred. Instead the amount is accrued into
`creator_profiles.pending_balance` / `business_profiles.pending_balance` via the
`increment_pending_balance()` RPC (see `release-creator-payout` PATH B,
`release-sponsorship-payout` PATH B, `resolve-dispute`).

This money has **already been collected** from the payer and is genuinely owed to
the creator — it is simply held until they can receive it. But nothing ever
releases it automatically. The only way out today is the **manual "Withdraw"
button** (`withdraw-pending-balance`), which the user must remember to click
*after* completing onboarding. Many never will, so earned money sits stranded in
the platform's `pending_balance` column indefinitely.

The moment the money *becomes* releasable is well-defined: it is exactly when the
connected account turns payout-ready (`charges_enabled && payouts_enabled`). That
transition is **already observed** by the system but not acted upon for payouts.

### Explicitly out of scope

- **Parked DragonShare boosts** (`dragonshare_boosts.status = 'pending'`). These
  are *not* pre-paid: `boost-payment` parks the boost row and returns `202`
  **before charging the restaurant** (`boost-payment/index.ts:118-125`).
  "Releasing" one requires charging the restaurant's card off-session, which is
  consent-sensitive and cannot recover from an SCA / `authentication_required`
  challenge inside a webhook (no interactive checkout fallback). The correct
  behavior there is a **re-engagement notification** to the restaurant, which is
  a separate feature with its own spec. This spec does **not** touch boosts.
- A `pg_cron` backstop sweep (see §8 — deferred; the event path is idempotent so
  it can be added later without rework).
- Any new push/email notification on auto-payout (the manual withdraw path
  doesn't notify either; we record a ledger event for parity, nothing more).
- The unrelated "`auto-approve-content` is not scheduled" gap.

## 2. Goal

When a creator/restaurant's Stripe account becomes payout-ready, automatically
transfer any held `pending_balance` to their connected account — with no manual
action — using the existing, already-wired payout-readiness signals.

## 3. Existing system (verified)

| Fact | Evidence |
|------|----------|
| `stripe-webhook` exists, verifies signature (`constructEventAsync`), `verify_jwt = false` | `stripe-webhook/index.ts:34-67`; `config.toml:91-92` |
| It already handles `account.updated` and flips `stripe_onboarding_complete` for the creator **or** business profile matching `stripe_account_id` | `stripe-webhook/index.ts:370-391` |
| That handler currently does **nothing** with the money — only updates the boolean | `stripe-webhook/index.ts:370-391` |
| `check-creator-payout-status` re-checks the account on the onboarding-return redirect and flips `stripe_onboarding_complete` | `check-creator-payout-status/index.ts:74-86` |
| `check-restaurant-payout-status` is the restaurant equivalent | (same pattern) |
| Manual withdraw: atomic conditional zero-out + `stripe.transfers.create` with idempotency key `withdraw_${user}_${cents}`, restores balance on Stripe error, writes a `transfer_created` payment event | `withdraw-pending-balance/index.ts:104-158` |
| `pending_balance` lives on both `creator_profiles` and `business_profiles` (NUMERIC, dollars) | migration `20260115150705` |
| Stripe env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` already configured | edge functions |
| Connect accounts are Express with Stripe's default automatic payout schedule (so once funds land in the account they auto-pay to the bank) | `create-creator-connect-account/index.ts:138-152` |

The pending-balance transfer logic is currently **inline** in
`withdraw-pending-balance`. This is the only existing money-path we will touch
(to extract it for reuse — see §4).

## 4. Design

### 4.1 New shared routine — `_shared/flush-pending-balance.ts`

A single idempotent function, reused by every trigger:

```ts
flushPendingBalance(
  stripe: Stripe,
  supabase: SupabaseClient,          // service-role client
  stripeAccountId: string,
): Promise<{ flushed: boolean; amount: number; transferId?: string }>
```

Behavior (state-driven, **not** edge-driven — safe to call any number of times,
in any order):

1. **Resolve the profile by `stripe_account_id`** — try `creator_profiles`, then
   `business_profiles`. Select `user_id, stripe_onboarding_complete,
   pending_balance`. If no row matches, return `{ flushed: false, amount: 0 }`.
2. **Guard:** if `!stripe_onboarding_complete` or `pending_balance <= 0`, return
   `{ flushed: false, amount: 0 }`. (No-op — nothing owed or not ready yet.)
3. **Atomic zero-out** (the existing concurrency guard, re-keyed on the account):
   `UPDATE <table> SET pending_balance = 0 WHERE stripe_account_id = ? AND
   pending_balance = <read value>` returning the row. If 0 rows updated, another
   caller already claimed it → return `{ flushed: false, amount: 0 }`.
4. **Transfer:** `stripe.transfers.create({ amount: round(pending*100), currency:
   'usd', destination: stripeAccountId, description: 'DragonCandy pending balance
   auto-payout', metadata: { user_id, withdrawal_type: 'pending_balance_autoflush'
   } }, { idempotencyKey: 'withdraw_${user_id}_${cents}' })`.
   - The idempotency key is **identical** to the manual withdraw's key for the
     same user+amount, so a manual click and an auto-flush racing on the same
     balance cannot double-pay at Stripe.
5. **On Stripe error:** restore `pending_balance` to the read value (matches the
   manual path) and re-throw to the caller.
6. **On success:** `writePaymentEvent(..., { event_type: 'transfer_created',
   entity_type: creator ? 'collaboration' : 'sponsorship', entity_id: user_id,
   actor_role: creator ? 'creator' : 'business', amount_cents, stripe_id:
   transfer.id, metadata: { type: 'pending_balance_autoflush' } })`. Return
   `{ flushed: true, amount, transferId }`.

**DRY:** extract the steps 3–6 core into this shared module and refactor
`withdraw-pending-balance` to delegate to it (keyed by the user's resolved
`stripe_account_id`). The manual function keeps its own auth, its own
`payouts_enabled` re-check via `accounts.retrieve`, and its existing HTTP
responses/messages — only the zero-out→transfer→restore→ledger core is shared, so
its observable behavior is unchanged. The plan must verify this with a
before/after read of the manual flow.

### 4.2 Wiring — two idempotent triggers, no new infra

- **`stripe-webhook` `account.updated`** (`index.ts:370-391`): after the existing
  `stripe_onboarding_complete` update, if `onboardingComplete === true`, call
  `await flushPendingBalance(stripe, supabase, account.id)` inside a `try/catch`.
  On any error: `logStep` it and **continue** — the handler still returns `200`,
  so Stripe does not retry-storm and the redirect-poll trigger remains the
  backstop. (A `stripe` client must be instantiated in this handler if one isn't
  already in scope — verify during planning.)
- **`check-creator-payout-status`** (`index.ts:74-86`) and
  **`check-restaurant-payout-status`**: after they flip
  `stripe_onboarding_complete`, if the account is payout-ready call
  `flushPendingBalance(stripe, supabaseClient, <accountId>)` (best-effort,
  wrapped so a flush failure never breaks the status response the frontend
  depends on). These run on the Stripe onboarding-return redirect, covering the
  case where the webhook is delayed or missed.

Two independent triggers hit one idempotent routine; whichever fires first moves
the money, the other no-ops.

### 4.3 Data flow

```
Creator finishes Stripe onboarding
        │
        ├─(a) Stripe sends account.updated ─► stripe-webhook ─► set onboarding_complete
        │                                                       └─► flushPendingBalance(account.id)
        │
        └─(b) Browser redirected to /settings?stripe_onboarding=complete
                 └─► check-(creator|restaurant)-payout-status ─► set onboarding_complete
                       └─► flushPendingBalance(account.id)

flushPendingBalance: resolve profile → guard (ready & owed) → atomic zero-out
                     → stripe.transfers.create (idempotent) → ledger event
                     (restore balance on Stripe error)
```

## 5. Idempotency & safety

- **Atomic conditional zero-out** ensures only one caller claims a given balance.
- **Stripe idempotency key** `withdraw_${user}_${cents}` (shared with manual
  withdraw) prevents double-transfer even if two callers both believe they won.
- **State-driven, not edge-driven:** the routine reads current
  `stripe_onboarding_complete` + `pending_balance`, so it is correct regardless of
  whether the DB boolean was already flipped by another trigger first.
- **Failure isolation:** the webhook never 500s on a flush error; the
  status-poll never fails its response on a flush error.
- **Balance restore on Stripe failure** mirrors the manual path, so a transient
  Stripe error leaves the balance intact for the next trigger to retry.

## 6. Error handling

| Failure | Handling |
|---------|----------|
| Stripe `transfers.create` throws | Restore `pending_balance`, re-throw to caller; caller logs and continues (no double-charge risk — funds restored, idempotency key unused) |
| Two triggers race | Atomic zero-out gives the balance to exactly one; loser no-ops |
| Account resolves to neither profile | No-op `{ flushed: false }` |
| `writePaymentEvent` throws after a successful transfer | Caller logs; the transfer already happened and is idempotent — ledger gap is logged, money is correct (acceptable; matches existing tolerance) |

## 7. Testing

Deno unit tests on `_shared/flush-pending-balance.ts` with injected `supabase`
and `stripe` test doubles (same pattern/runner as
`outstand-webhook-lib.test.ts`; edge functions are Deno and excluded from
vitest via `vite.config.ts`). Cases:

1. Ready + `pending_balance > 0` → exactly one `transfers.create`, balance zeroed,
   `flushed: true`, ledger event written.
2. `pending_balance = 0` → no transfer, `flushed: false`.
3. `stripe_onboarding_complete = false` → no transfer, `flushed: false`.
4. Atomic zero-out reports 0 rows (lost the race) → no transfer, `flushed: false`.
5. `transfers.create` throws → balance restored to original, error propagates, no
   ledger event.
6. Idempotent second call after a successful flush (balance now 0) → no-op.
7. Resolves a `business_profiles` account (not a creator) → uses sponsorship
   entity/actor_role in the ledger event.

A focused regression check (manual, in the plan) that `withdraw-pending-balance`
still returns its existing success/error JSON after delegating to the shared
core.

## 8. Deferred / future

- **`pg_cron` backstop sweep** (Approach C): a low-frequency job that flushes any
  ready account with `pending_balance > 0` the event path somehow missed. Easy to
  add later precisely because `flushPendingBalance` is idempotent. Add only if
  production monitoring shows leakage.
- **Parked-boost re-engagement notification** (separate spec).

## 9. Deploy notes

- No new edge function, no new secret, no migration, no `config.toml` change.
- Touched functions to redeploy via Supabase MCP: `stripe-webhook`,
  `check-creator-payout-status`, `check-restaurant-payout-status`,
  `withdraw-pending-balance` (refactor). New shared module ships with them.
- Frontend push to `main` is unaffected (no frontend changes).
- Validate on staging first, then prod (the project's standard edge-function
  deploy path — separate from the Lovable frontend deploy).
