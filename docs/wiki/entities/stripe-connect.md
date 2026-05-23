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

## Database Tables

- `payment_events` — payment lifecycle ledger
- `stripe_webhook_events` — raw webhook event log
- `rush_surcharge_log` — DragonDash surcharge records

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
