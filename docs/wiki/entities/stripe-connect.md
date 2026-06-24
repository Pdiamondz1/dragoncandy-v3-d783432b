---
title: Stripe Connect
type: entity
created: 2026-05-23
updated: 2026-06-02
sources: [docs/STRIPE_PRICES.md, docs/content-delivery-system-flows.md, docs/DATABASE_SCHEMA.md, raw/sessions/2026-06-02-205607-qa-staging-supabase-planb.md]
tags: [stripe, payments, escrow]
---

# Stripe Connect

Payment infrastructure for DragonCandy. Currently in test mode —
never use live keys without explicit approval.

## Products (Test Mode)

| Product | ID |
|---------|------|
| DragonCandy Starter | prod_UTE1P0aFROjcxt |
| DragonCandy Growth | prod_UTE19WnohHufeK |
| DragonCandy Pro | prod_UTE1Uim58FQZHa |
| Seat add-ons | prod_UTE1xEjEulttop, prod_UTE18I4NQctZnS, prod_UTE17DJJML26kL |

## Escrow System

Campaign payments use escrow: pending → held → released. Fixed-price
campaigns require escrow before publishing. Payment released on content
approval or auto-approval timer expiry.

## DragonShare Boost Payments

Restaurants/brands pay creators for boosts via the [[Two-Path Boost Payment]] flow: hosted
checkout on the first boost (saves + sets a default card), one-tap off-session charge on
repeats, with a 3DS fallback to hosted checkout. An idempotent `fulfillBoost` helper handles
the transfer + payout (80/20 split). The org's `stripe_customer_id` (on `organizations`) is
reused across escrow, sponsorship, and boost flows. On iOS this coexists with
[[Payments Split by Surface]].

## Test-Mode UX

To keep pre-launch users from getting stuck in the sandbox, the [[Test-Mode Stripe UX]]
work (PR #168) makes both surfaces instinctive **in test mode only** (live unchanged):
payout onboarding is a one-tap bypass that auto-creates a fully-enabled **Custom**
connected account server-side (no hosted Express screens), and all Checkout sessions are
forced **card-only** (`payment_method_types:['card']`) so Link/Klarna/real-card temptations
disappear.

## Database Tables

- `payment_events` — payment lifecycle ledger
- `stripe_webhook_events` — raw webhook event log
- `rush_surcharge_log` — DragonDash surcharge records
- `dragonshare_boosts` / `dragonshare_payouts` — boost charges and creator payouts

## Implementation Files

- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/_shared/platform-fee.ts` (default 5%)
- `supabase/functions/_shared/cost-ledger.ts`

## Staging (QA Gate)

For the [[QA CI/CD Gate]], all Stripe keys on staging must stay on **one sandbox
account** (`acct_1SkFixJi7lqzzhdM`, the same account as CLAUDE.md's publishable key):
the publishable key (Vercel), `STRIPE_SECRET_KEY` (edge functions), and the webhook
endpoint (`we_1Te30V…` → `STRIPE_WEBHOOK_SECRET`). Stripe **Sandboxes are isolated
accounts with their own keys** — mixing a secret key from a different sandbox breaks
every payment call and webhook signature. The `stripe-webhook` function must have
`verify_jwt = false` (see [[Supabase]]) or Stripe's calls are rejected.

## Known Issues

- [2026-05-23] False "not connected" banner on Business Dashboard — fixed
  in 38cefc6 (Stripe detection was checking wrong field)

## See Also

- [[Stripe Payments Flow]] — visual money-movement diagrams across all surfaces
- [[Pricing Architecture]]
- [[Take-Rate Ladder]]
- [[DragonDash]]
- [[Campaign Lifecycle]]
- [[Two-Path Boost Payment]]
- [[Test-Mode Stripe UX]]
- [[Payments Split by Surface]]
- [[DragonShare]]
- [[QA Staging Supabase (Plan B) Session]]
- [[QA CI/CD Gate]]
