---
title: Take-Rate Ladder
type: concept
created: 2026-05-23
updated: 2026-05-23
sources: [docs/STRIPE_PRICES.md, docs/PROJECT_CONTEXT.md]
tags: [pricing, revenue, take-rate]
---

# Take-Rate Ladder

DragonCandy's tiered platform fee structure — higher subscription tiers
get lower take rates, incentivizing upgrades. Campaign volume is unlimited on all paid tiers — upgrades are driven by take-rate savings, feature differentiation (DragonDash, multi-location, social accounts, Donny AI budgets, seats), not by campaign caps. Free tier remains capped at 1 (demo only).

## Rate Table

| Tier | Subscription | Take Rate | Max Campaigns |
|------|-------------|-----------|---------------|
| Free | $0/mo | 10% | 1 |
| Starter | $149/mo | 7% | Unlimited |
| Growth | $449/mo | 5% | Unlimited |
| Pro | $899/mo | 3% | Unlimited |
| Enterprise | Custom | 2% | Unlimited |

Default platform fee: 5% (in `supabase/functions/_shared/platform-fee.ts`).

## Revenue Stacking

All four streams stack on one customer:
1. Subscription (monthly/annual base tier)
2. Take-rate (percentage of campaign payments)
3. [[Donny AI]] credit overages ($0.10-0.25/call)
4. [[DragonDash]] rush surcharge ($25-50)

## See Also

- [[Pricing Architecture]]
- [[Stripe Connect]]
- [[DragonDash]]
