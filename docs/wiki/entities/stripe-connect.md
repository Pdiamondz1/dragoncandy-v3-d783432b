---
title: Stripe Connect
type: entity
created: 2026-05-23
updated: 2026-05-23
sources: [docs/STRIPE_PRICES.md, docs/content-delivery-system-flows.md, docs/DATABASE_SCHEMA.md]
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

## Database Tables

- `payment_events` — payment lifecycle ledger
- `stripe_webhook_events` — raw webhook event log
- `rush_surcharge_log` — DragonDash surcharge records
- `dragonshare_boosts` / `dragonshare_payouts` — boost charges and creator payouts

## Implementation Files

- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/_shared/platform-fee.ts` (default 5%)
- `supabase/functions/_shared/cost-ledger.ts`

## Known Issues

- [2026-05-23] False "not connected" banner on Business Dashboard — fixed
  in 38cefc6 (Stripe detection was checking wrong field)

## See Also

- [[Pricing Architecture]]
- [[Take-Rate Ladder]]
- [[DragonDash]]
- [[Campaign Lifecycle]]
- [[Two-Path Boost Payment]]
- [[Payments Split by Surface]]
- [[DragonShare]]
