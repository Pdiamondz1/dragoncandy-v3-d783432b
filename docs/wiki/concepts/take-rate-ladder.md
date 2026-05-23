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
get lower take rates, incentivizing upgrades.

## Rate Table

| Tier | Subscription | Take Rate | Max Campaigns |
|------|-------------|-----------|---------------|
| Free | $0/mo | 10% | 1 |
| Starter | $149/mo | 7% | 3 |
| Growth | $449/mo | 5% | 10 |
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
