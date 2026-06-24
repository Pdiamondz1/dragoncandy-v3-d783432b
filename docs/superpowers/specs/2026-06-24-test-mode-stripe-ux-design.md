# Simplify Test-Mode Stripe UX — Design

**Date:** 2026-06-24
**Status:** Approved design, pending spec review
**Author:** Claude + Dame

## Problem

New users on dragoncandy.io (running Stripe in **test mode**) get stuck on the
two Stripe surfaces they encounter. Three concrete failures, reported by the
CPO:

1. **They don't realize it's a test environment.** Unsure whether to type real
   personal/payment info.
2. **They face Stripe choices they don't understand** — e.g. the "Test mode"
   header and "skip / use test data" controls on Stripe's hosted Connect
   onboarding (the "OAuth Test mode" confusion).
3. **They reach for payment options that don't work in test** — their real
   credit card, Klarna, Link — because Stripe Checkout shows every method
   enabled on the account. Transactions halt.

The codebase already has the *ingredients* (`TestModeBanner`,
`StripeTestHelper`, `testModeCustomText`, an `isTestKey` helper) but nothing
**constrains users to the path that works**, and the payout-onboarding UI even
makes a false claim ("Test mode: creates a verified sandbox account instantly")
that the backend does not honor.

## Goal

In **test mode only**, make both Stripe flows instinctive and fast — aligned
with the North Star ("less typing = more margin"). **Production behavior must be
byte-for-byte unchanged.** No audience-specific branching: one simplified
test-mode flow serves real prospects and demos equally.

## Scope

Two surfaces:

- **Part A — Payouts onboarding (full bypass).** Eliminate Stripe's hosted
  onboarding in test mode by auto-provisioning a fully-enabled sandbox
  connected account server-side.
- **Part B — Paying (constrain to the working path).** Force card-only Checkout
  in test mode and surface the working test card where users need it.

**Out of scope:** any change to live-mode flows; embedded/custom Stripe Elements
payment forms (hosted Checkout stays); schema changes; new secrets; auth
changes.

## Test-mode detection

Reuse existing, consistent patterns — no new config:

- **Edge functions:** `isTestKey(stripeKey)` → `STRIPE_SECRET_KEY` starts with
  `sk_test_` (already in `_shared/test-mode-text.ts`).
- **Frontend:** `VITE_STRIPE_PUBLISHABLE_KEY` starts with `pk_test_` (already
  used in `StripeConnectSetup`, `TestModeBanner`, `StripeTestHelper`).

## Feasibility (verified against Stripe docs)

A connected account can be **instantly** `charges_enabled` + `payouts_enabled`
in test mode with no hosted onboarding, by creating it as a **Custom** account
with all `currently_due` requirements prefilled:

- prefilled `individual` identity (name, dob, address, phone, email, `ssn_last_4`),
- `external_account: 'btok_us'` (Stripe's test bank token),
- `tos_acceptance: { date, ip }`.

Stripe documents prefilled `tos_acceptance` for **Custom** accounts, **not**
Express. So the bypass uses **Custom in test mode**; **production keeps Express
+ hosted onboarding untouched**.
([Testing Connect](https://docs.stripe.com/connect/testing),
[Testing account verification](https://docs.stripe.com/connect/testing-verification))

Honesty constraint: Stripe-hosted **Checkout cannot pre-fill a card number**
(security). So "instinctive paying" means *removing the wrong options*
(card-only) and placing the copyable `4242` card next to the action — not
auto-typing the card.

## Design

### Part A — Payouts onboarding: full bypass

**New shared helper** `supabase/functions/_shared/test-mode-connect.ts`:

```ts
// createTestModeEnabledAccount(stripe, { email, businessName, productDescription, metadata, requestIp })
//   → creates a Custom connected account, prefilled with Stripe test values
//     + external_account 'btok_us' + tos_acceptance {date: now, ip},
//     capabilities { card_payments, transfers } requested.
//   → returns the created Stripe.Account (charges_enabled + payouts_enabled true in test mode)
```

- Identity prefill uses Stripe's published test values (e.g. dob `1901-01-01`,
  `ssn_last_4: '0000'`, a test address/phone). `requestIp` is read from the
  request's `x-forwarded-for` header, falling back to `127.0.0.1` (any IP is
  accepted in test mode).
- `business_type: 'individual'`.

**`create-creator-connect-account` / `create-restaurant-connect-account`** —
add a test-mode short-circuit:

- Keep the existing "already fully onboarded → `alreadyComplete`" early return
  for both modes (so a previously-created enabled account is respected).
- **In test mode, when no active account exists:** skip the
  previous-account/reconnect prompt and the Express + `accountLinks` path
  entirely. Call `createTestModeEnabledAccount`, persist the new
  `stripe_account_id` **and** `stripe_onboarding_complete: true` to the same
  tables the live path writes (`creator_profiles`; for restaurants
  `business_profiles` **and** `org_units` when `org_unit_id` is present), and
  return `{ alreadyComplete: true, accountId }`.
- **In live mode:** unchanged (Express + hosted onboarding, previous-account
  logic intact).

**Frontend impact is minimal** — `StripeConnectSetup` already handles the
`alreadyComplete` branch (success toast, `completeMission`, re-check status).
So "Connect Stripe Account" becomes **one tap → Connected**, zero Stripe
screens, nothing to type. The existing "creates a verified sandbox account
instantly" caption becomes true.

**Dashboard link guard.** `stripe.accounts.createLoginLink` works only for
Express/Standard, so it errors on a Custom test account. Two defensive changes:

- **Frontend:** hide the "View Stripe Dashboard" button when `pk_test_`
  (test mode) — it has no meaning for a disposable sandbox account.
- **Backend (`get-stripe-dashboard-link`):** catch the `createLoginLink`
  failure and return a clear `{ success: false, error: 'Dashboard link not
  available for test accounts' }` instead of a raw 400 — defense in depth.

### Part B — Paying: constrain to the path that works

**New shared helper** `supabase/functions/_shared/test-mode-payment-methods.ts`:

```ts
// testModePaymentMethodTypes(stripeKey): ['card'] | undefined
//   test mode  → ['card']  (disables Link / Klarna / bank / etc.)
//   live mode  → undefined (Stripe automatic payment methods, unchanged)
```

Apply `payment_method_types: testModePaymentMethodTypes(stripeKey)` to **every**
Checkout-session creator:

- `boost-payment` (DragonShare boost)
- `create-checkout-session` (subscriptions, `mode: 'subscription'`)
- `create-sponsorship-checkout`
- `create-campaign-escrow`

In live mode the field resolves to `undefined`, so Stripe's
dashboard-configured automatic methods continue exactly as today.

**Test-mode note parity.** `create-checkout-session` currently has **no**
`custom_text`; add `custom_text: testModeCustomText(stripeKey)` to match the
other three (test card guidance on the Stripe payment page).

**Surface the working card.** Render the existing `TestModeBanner` +
`StripeTestHelper` (copyable `4242 4242 4242 4242`) on the surfaces that
*launch* a payment, so the working card is adjacent at the moment of action:

- DragonShare boost confirmation sheet (`BoostConfirmationSheet`)
- Pricing / subscription checkout entry
- Sponsorship payment entry

(These components already render nothing in live mode via their internal
`pk_test_` check, so they're safe to mount unconditionally.)

## Design units (for isolation + testability)

| Unit | Responsibility | Depends on | Test |
|------|----------------|------------|------|
| `_shared/test-mode-payment-methods.ts` | mode → `['card']`/`undefined` | `isTestKey` | deno unit test |
| `_shared/test-mode-connect.ts` | build + create the enabled Custom test account | Stripe SDK, `isTestKey` | deno unit test for the param-builder (pure); account creation verified live in test mode |
| edge-fn diffs (6 functions) | wire the two helpers in, gated on `isTestKey` | the helpers | manual prod-test verification |
| frontend diffs | hide dashboard btn in test mode; mount banner/helper on payment surfaces | `pk_test_` check | `npm run build` + both-viewport prod-test |

Keep the account-param construction in `test-mode-connect.ts` as a **pure
function** (`buildTestAccountParams(...)`) separate from the `stripe.accounts.create`
call, so it is unit-testable without hitting Stripe.

## Error handling

- Test-mode account creation failures bubble up through the existing
  try/catch → `{ error }` 500, same as the live path.
- `get-stripe-dashboard-link` degrades gracefully on Custom accounts (above).
- Card-only restriction can't fail (static array); live mode unaffected.

## Testing

- **Unit (deno):** `testModePaymentMethodTypes` returns `['card']` for
  `sk_test_…`, `undefined` for `sk_live_…`; `buildTestAccountParams` emits
  required prefill fields + `external_account` + `tos_acceptance`.
- **Build:** `npm run build` (frontend) — note this does **not** parse edge
  functions; rely on `supabase functions deploy` as the real edge-fn parse
  check (known footgun: template-literal backticks).
- **Live test-mode verification (prod-test):**
  1. New creator + new restaurant → "Connect" → one tap → **Connected**, no
     Stripe screens.
  2. DragonShare boost (no card on file) → hosted Checkout shows **card only**
     (no Link/Klarna), test card visible adjacent → completes.
  3. Subscription + sponsorship + campaign-escrow checkout → card only.
  4. Both desktop + mobile viewports; console clean.

## Guardrails / invariants

- **All bypass logic gated strictly on `sk_test_` / `pk_test_`.** Live mode is
  byte-for-byte unchanged.
- No schema migration, no new secret, no auth change.
- Edge functions deploy separately from the frontend (Lovable deploys frontend
  only) — deploy the 6 touched functions via CLI/MCP, then verify in prod-test.
- Order edge-fn work **build → deploy → verify**, not build → merge → deploy.

## Known edge cases / accepted limitations

- A user who created a **test** Custom account and later flips to **live** keys
  will have a stored `stripe_account_id` invalid under the live account; the
  existing `accounts.retrieve` path will fail and the live flow re-creates via
  Express. Acceptable pre-launch.
- Hosted Checkout cannot prefill the card number; mitigated by card-only +
  adjacent copyable test card.
- Test-mode connected accounts have no Express dashboard (Custom); the
  dashboard button is hidden in test mode by design.

## What this deletes / simplifies / automates / keystrokes removed

- **Deletes:** the entire hosted Connect onboarding form in test mode;
  Link/Klarna/real-bank options from test Checkout; the "is this real?"
  ambiguity on payouts.
- **Simplifies:** "Connect" → one tap → Connected; Checkout → one obvious
  method.
- **Automates:** sandbox payout-account provisioning (prefilled + ToS-accepted
  server-side).
- **Keystrokes removed:** payout onboarding from a multi-screen Stripe form
  (dozens of fields) to **0**; checkout drops the method-selection misstep
  entirely.
