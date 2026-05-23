---
title: Stripe Prices
type: source
created: 2026-05-23
updated: 2026-05-23
sources: [docs/STRIPE_PRICES.md]
tags: [stripe, pricing, revenue]
---

# Stripe Prices

Definitive pricing reference for DragonCandy. All Stripe keys are test
mode. Last updated 2026-05-20.

## Key Claims

- 5 subscription tiers: Free ($0) → Starter ($149) → Growth ($449) →
  Pro ($899) → Enterprise (custom)
- Annual billing gives 20% discount
- Per-seat add-ons: Starter $29, Growth $39, Pro $49 per seat/month
- Four revenue streams stacked per customer: subscription, take-rate,
  Donny AI credit overages, DragonDash rush surcharge
- Default platform fee: 5% (in `_shared/platform-fee.ts`)
- DragonDash rush surcharges: $25-50 depending on platform count,
  Pro gets 20% discount

## Data Points

- Donny AI credit budgets: Free 50 → Starter 500 → Growth 2K → Pro 10K
  → Enterprise 50K monthly actions
- Content delivery premiums: Standard $0, Express $25, DragonDash $75
- Implementation files: tier-features.ts, org.ts, create-checkout-session,
  platform-fee.ts, cost-ledger.ts

## See Also

- [[Stripe Connect]]
- [[Take-Rate Ladder]]
- [[Pricing Architecture]]
- [[DragonDash]]
