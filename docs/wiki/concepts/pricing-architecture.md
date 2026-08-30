---
title: Pricing Architecture
type: concept
created: 2026-05-23
updated: 2026-05-24
sources: [docs/STRIPE_PRICES.md, docs/PROJECT_CONTEXT.md]
tags: [pricing, revenue, business-model]
---

# Pricing Architecture

DragonCandy stacks four revenue streams on one customer to maximize
LTV and reduce churn dependency on any single stream.

## Revenue Streams

1. **Subscription** — monthly/annual SaaS tier (Free through Enterprise)
2. **Take-rate** — percentage of campaign payments ([[Take-Rate Ladder]])
3. **Donny AI credit overages** — $0.10-0.25/call beyond monthly budget
4. **DragonDash rush surcharge** — $25-50 per rush delivery

## Tier Structure

> **Superseded 2026-08-28.** Prices, tier name, campaign limits, and DragonDash access have all changed. See `docs/DragonCandy_Pricing_Architecture_v3.md` as the single source of truth. Summary of changes: Growth renamed Standard ($449→$349/mo); Pro $899→$599/mo; campaign caps removed on all paid tiers; DragonDash opened to all tiers (Pro retains 20% surcharge discount). For Stripe Price IDs see `docs/STRIPE_PRICES.md` (pending approval of queued corrections).

5 tiers: Free → Starter ($149) → Standard ($349) → Pro ($599) → Enterprise.
Annual billing gives 20% discount. Per-seat add-ons available on paid tiers.

## Constraints

- AI API spend hard-capped at 15% of revenue ($250/mo floor pre-revenue)
- Kill-switches: churn >6%, CAC payback >12mo, LTV:CAC <2:1
- Default platform fee: 5%

## Implementation

- Tier features: `src/lib/pricing/tier-features.ts`
- Checkout: `supabase/functions/create-checkout-session/index.ts`
- Cost tracking: `supabase/functions/_shared/cost-ledger.ts`
- Full price IDs: `docs/STRIPE_PRICES.md`

## See Also

- [[Take-Rate Ladder]]
- [[Stripe Connect]]
- [[DragonDash]]
- [[Donny AI]]
- [[Donny Audit Phase 1 Session]]
- [[Donny Audit Phase 2 Session]]
