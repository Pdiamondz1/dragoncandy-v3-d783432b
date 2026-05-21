# DragonCandy Pricing — Source of Truth

> All pricing data in this file reflects the current implementation.
> Other docs should reference this file rather than duplicating values.
> Last updated: 2026-05-20

## Subscription Tiers

### Monthly Base Prices
| Tier | Price ID | Amount |
|------|----------|--------|
| Free | — | $0/mo |
| Starter | price_1TUHaMJi7lqzzhdMW9vjJIpb | $149/mo |
| Growth | price_1TUHaSJi7lqzzhdMwmOKQnRa | $449/mo |
| Pro | price_1TUHaXJi7lqzzhdMDZPUOSFJ | $899/mo |
| Enterprise | — | Custom |

### Annual Base Prices (20% discount)
| Tier | Price ID | Amount |
|------|----------|--------|
| Starter | price_1TUHaPJi7lqzzhdM3IFf3Zqa | $119/mo ($1,428/yr) |
| Growth | price_1TUHaUJi7lqzzhdMWNiKolGJ | $359/mo ($4,308/yr) |
| Pro | price_1TUHaaJi7lqzzhdMjFiX0cJl | $719/mo ($8,628/yr) |

### Per-Seat Add-On Prices
| Tier | Included Seats | Max Additional | Price ID | Per-Seat Price |
|------|----------------|----------------|----------|----------------|
| Free | 1 | 0 | — | — |
| Starter | 1 | 3 | price_1TUHagJi7lqzzhdMmQzixpeE | $29/seat/mo |
| Growth | 5 | 15 | price_1TUHajJi7lqzzhdM2J8RXusW | $39/seat/mo |
| Pro | 15 | Unlimited | price_1TUHamJi7lqzzhdMZiv9kst7 | $49/seat/mo |
| Enterprise | 999 | Unlimited | — | $0 |

### Stripe Products
| Product | ID |
|---------|------|
| DragonCandy Starter | prod_UTE1P0aFROjcxt |
| DragonCandy Growth | prod_UTE19WnohHufeK |
| DragonCandy Pro | prod_UTE1Uim58FQZHa |
| Starter Seat Add-On | prod_UTE1xEjEulttop |
| Growth Seat Add-On | prod_UTE18I4NQctZnS |
| Pro Seat Add-On | prod_UTE17DJJML26kL |

> **All Stripe keys are test mode.** Never use live keys without explicit approval.

## Platform Take Rates

| Tier | Take Rate | Max Active Campaigns |
|------|-----------|----------------------|
| Free | 10% | 1 |
| Starter | 7% | 3 |
| Growth | 5% | 10 |
| Pro | 3% | Unlimited |
| Enterprise | 2% | Unlimited |

Default platform fee: 5% (see `supabase/functions/_shared/platform-fee.ts`).

## Donny AI Credit Budgets

| Tier | Monthly Actions |
|------|-----------------|
| Free | 50 |
| Starter | 500 |
| Growth | 2,000 |
| Pro | 10,000 |
| Enterprise | 50,000 |

### Donny AI Automation Levels
| Tier | Level |
|------|-------|
| Free | Manual (no AI assistance) |
| Starter | Assisted (Donny drafts, user reviews) |
| Growth | Auto-Pilot (Donny generates + schedules) |
| Pro | Auto-Pilot |
| Enterprise | Auto-Pilot |

## Content Delivery Premiums

| Delivery Tier | Timeframe | Fee | Max Deliverables |
|---------------|-----------|-----|------------------|
| Standard | 5–7 days | $0 | 10 |
| Express | 24–48 hours | $25 | 4 |
| DragonDash | 1–3 hours | $75 | 2 |

## DragonDash Rush Surcharges

| Platform Count | Base Surcharge | Pro Discount (20% off) |
|----------------|----------------|------------------------|
| 1–3 platforms | $25 | $20 |
| 4 platforms | $30 | $24 |
| 5+ platforms | $50 | $40 |

Surcharges stored in cents in `rush_surcharge_log` table, invoiced via `invoice-rush-surcharges` edge function.

## Revenue Streams (stacked per customer)

1. **Subscription** — monthly/annual base tier
2. **Take-rate** — percentage of campaign payments
3. **Donny AI credit overages** — usage beyond monthly budget
4. **DragonDash rush surcharge** — premium delivery fees

## Implementation Files

| Data | Source File |
|------|------------|
| Tier features & AI budgets | `src/lib/pricing/tier-features.ts` |
| Seat limits & org types | `src/types/org.ts` |
| Stripe checkout | `supabase/functions/create-checkout-session/index.ts` |
| Take rates & campaign limits | `supabase/migrations/20260507000001_add_take_rate_and_campaign_limit.sql` |
| Platform fee default | `supabase/functions/_shared/platform-fee.ts` |
| AI cost tracking | `supabase/functions/_shared/cost-ledger.ts` |
| Delivery tiers | `src/types/campaignMedia.ts` |
| Rush surcharges | `src/hooks/outstand/useRushSurchargeLog.ts` |
