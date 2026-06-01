---
title: Stripe Connect
type: entity
created: 2026-05-23
updated: 2026-06-01
sources: [docs/STRIPE_PRICES.md, docs/content-delivery-system-flows.md, docs/DATABASE_SCHEMA.md, docs/PROJECT_CONTEXT.md]
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

## Two-Path Boost Charge (DragonShare)

[[DragonShare]] boosts charge a restaurant via one of two paths:

- **Off-session** — reuse a saved card on file when present.
- **Hosted Checkout** — redirect to Stripe Checkout when no reusable card
  exists (`campaigns.escrow_checkout_session_id` tracks the session).

A per-org customer is anchored (`getOrCreateOrgCustomer()`-style) so cards are
reused across boosts, and fulfillment runs idempotently from the Stripe webhook
(`fulfillBoost()`-style transfer) on checkout-paid events. Test-mode
`custom_text` clarifies payout-account behavior.

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
- [[DragonShare]]
- [[Campaign Lifecycle]]
