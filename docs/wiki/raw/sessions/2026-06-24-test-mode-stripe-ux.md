# Session: Simplify test-mode Stripe UX (PR #168) — 2026-06-24

## What shipped

Made the two Stripe surfaces new users hit instinctive **in test mode only**, with
**live-mode behavior byte-for-byte unchanged**. Branch `feat/test-mode-stripe-ux`,
PR #168 (squash `bd730114`), merged 2026-06-24.

The problem (reported by the CPO): new users on dragoncandy.io (Stripe in test mode)
got stuck because (1) they didn't know whether to type real info, (2) Stripe's hosted
Connect "Test mode" onboarding confused them, and (3) they reached for Klarna / Link /
their real card, which don't work in the sandbox, halting transactions.

### Part A — payout onboarding: full bypass
In test mode, `create-creator-connect-account` and `create-restaurant-connect-account`
now skip Stripe's hosted Express onboarding entirely. They auto-create a fully-enabled
**Custom** connected account server-side and return `{ alreadyComplete: true }`, which
the existing frontend already handles → "Connect Stripe Account" becomes **one tap →
Connected**, zero Stripe screens. Live mode keeps the unchanged Express + hosted
`accountLinks` path. This finally makes the UI's pre-existing "creates a verified
sandbox account instantly" caption true.

The enabled Custom account is built by a pure `buildTestAccountParams` helper with
Stripe's published test verification triggers: `type:'custom'`, `business_type:'individual'`,
prefilled individual identity (`dob 1901-01-01`, `ssn_last_4 '0000'`, `id_number
'000000000'`, `address.line1 'address_full_match'`), `external_account:'btok_us'` (test
bank token), and `tos_acceptance:{date,ip}` (ip from `x-forwarded-for`).

### Part B — paying: card-only
New `testModePaymentMethodTypes(stripeKey)` helper returns `['card']` in test mode and
`undefined` (Stripe automatic methods, unchanged) in live mode. Applied to all 4
Checkout-session creators: `boost-payment` (the hosted-checkout fallback only — the
off-session saved-card path is already card-only), `create-checkout-session`,
`create-sponsorship-checkout`, `create-campaign-escrow`. Added the missing `custom_text`
test-card note to `create-checkout-session`. Surfaced the existing `TestModeBanner` +
`StripeTestHelper` (copyable 4242) on the 4 payment-launch screens (BoostConfirmationSheet,
PricingPage, OrgBillingPage, BrandSponsorships). The dashboard button is hidden in test
mode (Custom accounts have no Express dashboard); `get-stripe-dashboard-link` also
degrades gracefully — but **only in test mode** (Codex P2 fix: live errors must still
surface to the original 400 path).

## Design / decisions

- **All mode logic in 3 pure, vitest-tested `_shared` helpers**: `stripe-mode.ts`
  (pure `isTestKey`, no imports), `test-mode-payment-methods.ts`, `test-mode-connect.ts`.
  Critical constraint: vitest (node env) can't load runtime `https://` imports, so these
  helpers avoid them — `test-mode-connect.ts` uses a **type-only** Stripe import (erased
  at runtime), and `isTestKey` was **extracted out of** `test-mode-text.ts` (which does a
  runtime Stripe URL import) into the dependency-free `stripe-mode.ts`. 9 unit tests.
- Detection reuses existing patterns: `sk_test_` (edge) / `pk_test_` (frontend). No new
  config, schema, secret, or auth change.

## Gotchas / learnings

- **MCP edge-function deploy — preserve `verify_jwt` per function.** `boost-payment` and
  `create-checkout-session` are deployed `verify_jwt:true`; the other 5 are `false`.
  `list_edge_functions` is ground truth — `config.toml` only lists 44 of 86 functions, so
  it's not a reliable source for the current value.
- **MCP `deploy_edge_function` file naming.** Name files by full repo path
  (`supabase/functions/<fn>/index.ts` + `supabase/functions/_shared/*.ts`) with a matching
  `entrypoint_path`, so the `../_shared/` relative imports resolve. Bundle the FULL
  transitive `_shared` closure or the deploy silently keeps the old version.
- **Transient "Verification Pending" → "Connected".** Right after the one-tap connect,
  Stripe takes a few seconds to move the requested capabilities from `pending` → `active`,
  so the very first status check can briefly read not-enabled. It self-resolves on the next
  status check. The prefill values DO flip `charges_enabled` + `payouts_enabled` — confirmed
  by live test (creator account), so the spec's tweak-fallback was not needed.
- **Frontend deploys only on PR merge (Lovable), edge functions deploy separately.** The
  edge-function changes were deployed via the Supabase MCP and verified before the PR
  merged; the frontend hide-button + banners go live only once Lovable redeploys from
  `origin/main`.

## Affected files

- New `_shared`: `stripe-mode.ts`, `test-mode-payment-methods.ts`, `test-mode-connect.ts`
  (+ `.test.ts` for each).
- Edge fns: `create-creator-connect-account`, `create-restaurant-connect-account`,
  `boost-payment`, `create-checkout-session`, `create-sponsorship-checkout`,
  `create-campaign-escrow`, `get-stripe-dashboard-link`, `_shared/test-mode-text.ts`.
- Frontend: `StripeConnectSetup.tsx`, `BoostConfirmationSheet.tsx`, `PricingPage.tsx`,
  `OrgBillingPage.tsx`, `BrandSponsorships.tsx`.
- No schema migration, no new secret.

Spec: `docs/superpowers/specs/2026-06-24-test-mode-stripe-ux-design.md`.
Plan: `docs/superpowers/plans/2026-06-24-test-mode-stripe-ux.md`.
