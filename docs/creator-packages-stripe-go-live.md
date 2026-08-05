# Creator Packages — Stripe test → live go-live runbook

**Status as of 2026-08-05:** Creator Packages v1 is **LIVE in prod** (`PACKAGES_ENABLED = true`, PR #363),
but **prod Stripe runs in TEST mode**. The whole money rail works end-to-end; real cards are not charged.
That is intentional for the validation gate — recruit 1–3 creators and run warm leads through with the
Stripe test card `4242 4242 4242 4242` before accepting real money.

This runbook is the deliberate, separate step for accepting **real** money. It is **not** package-scoped —
see the scope warning below.

---

## ⚠️ Scope warning — this is a platform-wide cutover

`STRIPE_SECRET_KEY` is **one shared Supabase edge-function secret used by every Stripe function**
(packages, campaigns, sponsorships, boosts). Flipping it switches the entire platform's payment surface to
live at once. Stripe mode is auto-detected from the key **prefix** (`sk_test_` vs `sk_live_`) — there is no
separate mode flag.

## The two levers (flip together)

| Lever | Where | Controls | Go-live value |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Supabase edge secret, prod project `zocahiffooqdybdhguqv` | the **actual charge mode** (all Stripe fns) | `sk_live_…` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Vercel prod env → `src/lib/stripeMode.ts` | the **test-mode UI hints** only (`isStripeTestMode`) | `pk_live_…` |

`src/lib/stripeMode.ts` has a hardcoded `pk_test_` **fallback**, so a deploy with no
`VITE_STRIPE_PUBLISHABLE_KEY` runs the UI in test mode. Flip only the backend secret and you get **live
charges behind a "test mode" UI**; flip only the frontend var and you get **test charges behind a live UI**.
Always flip both in lockstep.

> Note: the package checkout does **not** depend on Stripe webhooks. `create-package-order-escrow` /
> `verify-package-order-escrow` confirm payment by calling `stripe.checkout.sessions.retrieve` directly, and
> payout readiness is trust-true/verify-false (see the stale-payout-flag fix). No live webhook wiring is on
> the package critical path.

---

## Checklist

### A. Stripe dashboard prerequisites *(a human does these — Claude cannot enter Stripe credentials)*
- [ ] **Activate the platform account for live** — business/representative details, statement descriptor,
      live payout bank account.
- [ ] **Enable Stripe Connect in live mode** matching the test config (Custom/Express + onboarding/branding).
      Test and live Connect are entirely separate environments.
- [ ] **Tax reporting** — Connect payouts to US creators trigger 1099-K/NEC; confirm the settings.

### B. The switch *(flip both together)*
- [ ] Set Supabase edge secret **`STRIPE_SECRET_KEY` → `sk_live_…`** on prod (`zocahiffooqdybdhguqv`).
      This flips real charges platform-wide; the test-only checkout UX (card-only, "TEST" banner) auto-off.
- [ ] Set Vercel prod env **`VITE_STRIPE_PUBLISHABLE_KEY` → `pk_live_…`** and redeploy, so `isStripeTestMode`
      reads false and the UI drops the test hints.

### C. Before recruiting real creators
- [ ] **Real creators re-onboard to live Connect** — their test `stripe_account_id` /
      `stripe_onboarding_complete` do **not** carry over. (The demo `roger-the-ruler` account is test-only.)
- [ ] **Run ONE real live transaction** end-to-end (small package, real card): escrow held → deliver →
      approve → payout lands in a real connected account. Verify wallet **+90%** and `payout_executed_at` set
      **once**. Refund it after, or keep it as the first real sale.
- [ ] **Smoke-test one campaign / sponsorship checkout** too — because the key is shared, confirm the flip
      didn't disturb the existing payment surfaces.

### D. Rollback
- [ ] Revert `STRIPE_SECRET_KEY` (and the Vercel var) to the `sk_test_` / `pk_test_` values → instant return
      to test mode.

---

## Related
- Flag: `src/lib/featureConfig.ts` → `PACKAGES_ENABLED`
- Mode detection: `src/lib/stripeMode.ts` (`STRIPE_PUBLISHABLE_KEY`, `isStripeTestMode`)
- Package money-rail edge fns: `create/verify/release/refund-package-order-escrow`,
  `create-creator-connect-account`, `check-creator-payout-status`
- Wallet-first payout primitive: `supabase/functions/_shared/wallet-first-payout.ts`
