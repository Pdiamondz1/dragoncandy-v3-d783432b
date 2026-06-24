---
title: Test-Mode Stripe UX
type: concept
created: 2026-06-24
updated: 2026-06-24
sources: [raw/sessions/2026-06-24-test-mode-stripe-ux.md, docs/superpowers/specs/2026-06-24-test-mode-stripe-ux-design.md]
tags: [stripe, payments, test-mode, onboarding, ux]
---

# Test-Mode Stripe UX

How [[Stripe Connect]] flows are made instinctive **in test mode only**, so pre-launch
users aren't confused by Stripe's sandbox. The governing invariant: **live-mode behavior
is byte-for-byte unchanged** — every branch is gated on `sk_test_` (edge) / `pk_test_`
(frontend) and resolves to a no-op / `undefined` in live mode. Shipped PR #168
(2026-06-24).

## Two parts

1. **Payout onboarding — full bypass.** In test mode, `create-creator-connect-account` and
   `create-restaurant-connect-account` skip Stripe's hosted Express onboarding entirely:
   they auto-create a fully-enabled **Custom** connected account server-side and return
   `{ alreadyComplete: true }` (a branch the frontend already handled). Result: "Connect
   Stripe Account" is **one tap → Connected**, no Stripe screens, nothing to type. Live
   mode keeps the unchanged Express + hosted `accountLinks` path.
2. **Paying — card-only.** `testModePaymentMethodTypes(stripeKey)` returns `['card']` in
   test mode (removing Link / Klarna / bank that don't work in the sandbox) and `undefined`
   in live mode (Stripe automatic methods, unchanged). Applied to all four Checkout-session
   creators (`boost-payment` hosted-fallback, `create-checkout-session`,
   `create-sponsorship-checkout`, `create-campaign-escrow`). The copyable `4242` test card
   (`TestModeBanner` / `StripeTestHelper`) is surfaced on the payment-launch screens, and
   the "View Stripe Dashboard" button is hidden in test mode (Custom accounts have no
   Express dashboard).

## The enabled Custom account

`buildTestAccountParams` (a pure, unit-tested builder) uses Stripe's published test
verification triggers so the account becomes `charges_enabled` + `payouts_enabled` without
hosted onboarding: `type:'custom'`, `business_type:'individual'`, prefilled identity
(`dob 1901-01-01`, `ssn_last_4 '0000'`, `id_number '000000000'`, `address.line1
'address_full_match'`), `external_account:'btok_us'` (test bank token), and
`tos_acceptance:{date,ip}`. Stripe documents prefilled `tos_acceptance` for **Custom**
accounts, not Express — hence Custom in test mode while production stays Express.

## Gotchas

- **Transient "Verification Pending" → "Connected".** After the one-tap connect, Stripe
  takes a few seconds to move the requested capabilities from `pending` → `active`, so the
  first status check can briefly read not-enabled; it self-resolves on the next check. The
  prefill values *do* flip payouts (live-verified) — no tweak needed.
- **vitest can't load runtime `https://` imports.** The mode helpers avoid them so they
  stay unit-testable: `test-mode-connect.ts` uses a **type-only** Stripe import, and
  `isTestKey` lives in a dependency-free `stripe-mode.ts` (extracted out of
  `test-mode-text.ts`, which has a runtime Stripe URL import).
- **MCP edge-function deploy.** Preserve `verify_jwt` per function (`boost-payment` +
  `create-checkout-session` are `true`; the rest `false` — `list_edge_functions` is ground
  truth, not `config.toml`). Name deploy files by full repo path with a matching
  `entrypoint_path` and bundle the full transitive `_shared` closure, or the deploy
  silently keeps the old version. (Frontend deploys only on PR merge via Lovable; edge
  functions deploy separately.)
- **Dashboard-link degradation is test-mode-only** (Codex P2): `get-stripe-dashboard-link`
  swallows a `createLoginLink` failure only when `isTestKey`, so a real live error still
  surfaces to the original 400 path.

## See Also

- [[Stripe Connect]]
- [[Two-Path Boost Payment]]
- [[Payments Split by Surface]]
