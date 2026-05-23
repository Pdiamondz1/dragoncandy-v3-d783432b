---
title: DragonDash
type: entity
created: 2026-05-23
updated: 2026-05-23
sources: [docs/PROJECT_CONTEXT.md, docs/STRIPE_PRICES.md, docs/content-delivery-system-flows.md]
tags: [dragondash, rush, premium-delivery]
---

# DragonDash

The profit engine — rush content delivery at premium margins. Powered
by [[Donny AI]]. "#DragonDashed" is the brand verb seeded from launch.

## Pricing

| Delivery Tier | Timeframe | Fee | Max Deliverables |
|---------------|-----------|-----|------------------|
| Standard | 5-7 days | $0 | 10 |
| Express | 24-48 hours | $25 | 4 |
| DragonDash | 1-3 hours | $75 | 2 |

### Rush Surcharges

| Platform Count | Base | Pro Discount (20% off) |
|----------------|------|------------------------|
| 1-3 platforms | $25 | $20 |
| 4 platforms | $30 | $24 |
| 5+ platforms | $50 | $40 |

## Auto-Approval Windows

| Delivery Type | Review Window | Extension |
|---------------|--------------|-----------|
| Standard | 48 hours | +24 hours |
| Expedited | 24 hours | +24 hours |
| DragonRush | 4 hours | +2 hours |

## Implementation

- Surcharges stored in cents in `rush_surcharge_log` table
- Invoiced via `invoice-rush-surcharges` edge function
- Delivery tier types in `src/types/campaignMedia.ts`
- Surcharge hooks: `src/hooks/outstand/useRushSurchargeLog.ts`

## See Also

- [[Donny AI]]
- [[Content Delivery State Machine]]
- [[Stripe Connect]]
- [[Pricing Architecture]]
