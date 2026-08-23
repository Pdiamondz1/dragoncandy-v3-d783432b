# DragonCandy — Investor Model

> **Generated file — do not edit.** Produced by `npm run model:doc` from
> `src/pitch/model/`. Change a number there, not here.

> Public-safe: budget and raise omitted. Regenerate with `--confidential` to include them.

## Assumptions

| Input | Value | Unit | Provenance | Source | Read |
|---|---:|---|---|---|---|
| Free tier price (`price_free`) | 0 | USD/month | MEASURED | `docs/STRIPE_PRICES.md` | 2026-08-23 |
| Starter tier price (`price_starter`) | 149 | USD/month | MEASURED | `docs/STRIPE_PRICES.md` | 2026-08-23 |
| Growth tier price (`price_growth`) | 449 | USD/month | MEASURED | `docs/STRIPE_PRICES.md` | 2026-08-23 |
| Pro tier price (`price_pro`) | 899 | USD/month | MEASURED | `docs/STRIPE_PRICES.md` | 2026-08-23 |
| Free tier take rate (`takeRate_free`) | 0.1 | fraction | MEASURED | `supabase/functions/stripe-webhook/index.ts (TIER_TAKE_RATES) + supabase/functions/_shared/platform-fee.ts (PLATFORM_FEE_RATE)` | 2026-08-23 |
| Starter tier take rate (`takeRate_starter`) | 0.07 | fraction | MEASURED | `supabase/functions/stripe-webhook/index.ts (TIER_TAKE_RATES)` | 2026-08-23 |
| Growth tier take rate (`takeRate_growth`) | 0.05 | fraction | MEASURED | `supabase/functions/stripe-webhook/index.ts (TIER_TAKE_RATES)` | 2026-08-23 |
| Pro tier take rate (`takeRate_pro`) | 0.03 | fraction | MEASURED | `supabase/functions/stripe-webhook/index.ts (TIER_TAKE_RATES)` | 2026-08-23 |
| Monthly operating cost (`burnMonthly`) | 569 | USD/month | MEASURED | `vendor invoices \| Lovable 50 + Anthropic 200 + Outstand 249 + Supabase 45 + OpenAI 25` | 2026-08-23 |
| Paying customers (`payingCustomers`) | 0 | accounts | MEASURED | `docs/PROJECT_CONTEXT.md (section 4)` | 2026-08-23 |
| Registered users (`registeredUsers`) | 30 | accounts | MEASURED | `docs/PROJECT_CONTEXT.md (section 4)` | 2026-08-23 |
| Page components (`pageComponents`) | 95 | files | MEASURED | `find src/pages -name '*.tsx' \| wc -l` | 2026-08-23 |
| React hooks (`hooks`) | 272 | files | MEASURED | `find src/hooks -name 'use*.ts' -o -name 'use*.tsx' \| wc -l` | 2026-08-23 |
| Edge functions (`edgeFunctions`) | 104 | functions | MEASURED | `ls -d supabase/functions/*/ \| grep -v _shared \| wc -l` | 2026-08-23 |
| TypeScript source files (`sourceFiles`) | 1182 | files | MEASURED | `find src -type f \( -name '*.ts' -o -name '*.tsx' \) \| wc -l` | 2026-08-23 |
| Database migrations (`migrations`) | 402 | files | MEASURED | `ls supabase/migrations/*.sql \| wc -l` | 2026-08-23 |
| Passing tests (`tests`) | 2857 | tests | MEASURED | `npx vitest run` | 2026-08-23 |
| Test files (`testFiles`) | 262 | files | MEASURED | `npx vitest run` | 2026-08-23 |
| AI spend cap as share of revenue (`aiCostCapPctOfRevenue`) | 0.15 | fraction | MEASURED | `docs/PROJECT_CONTEXT.md (section 8)` | 2026-08-23 |
| Standard delivery, low band (`campaignPriceStandardLow`) | 75 | USD/deliverable | MEASURED | `src/lib/campaignPricing.ts (TIER_PRICE_BANDS)` | 2026-08-23 |
| Standard delivery, high band (`campaignPriceStandardHigh`) | 150 | USD/deliverable | MEASURED | `src/lib/campaignPricing.ts (TIER_PRICE_BANDS)` | 2026-08-23 |
| Deliverables per campaign (`deliverablesPerCampaign`) | 3 | deliverables | MODELED | `src/pitch/model/assumptions.ts` | — |
| Campaigns per restaurant per month (`campaignsPerRestaurantPerMonth`) | 2.5 | campaigns/month | MODELED | `src/pitch/model/assumptions.ts` | — |
| Creators needed per restaurant (`creatorsPerRestaurant`) | 4 | creators | BENCHMARKED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)` | — |
| Campaign applications per active creator per month (`applicationsPerCreatorPerMonth`) | 2 | applications/month | MODELED | `src/pitch/model/assumptions.ts` | — |
| Days a campaign stays open for applications (`campaignOpenDays`) | 14 | days | MODELED | `src/pitch/model/assumptions.ts` | — |
| Restaurant acquisition cost, low (`restaurantCacLow`) | 500 | USD | BENCHMARKED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)` | — |
| Restaurant acquisition cost, high (`restaurantCacHigh`) | 1500 | USD | BENCHMARKED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)` | — |
| Monthly customer churn (`monthlyChurn`) | 0.04 | fraction/month | BENCHMARKED | `docs/PROJECT_CONTEXT.md (section 3, 2025 SMB SaaS benchmark 3-5%/month)` | — |
| Stripe percentage fee (`stripePctFee`) | 0.029 | fraction | BENCHMARKED | `https://stripe.com/pricing` | — |
| Stripe fixed fee (`stripeFixedFee`) | 0.3 | USD/transaction | BENCHMARKED | `https://stripe.com/pricing` | — |
| AI cost per customer per month (`aiCostPerCustomerMonth`) | 1.2 | USD/month | BENCHMARKED | `docs/DragonCandy_Infrastructure_Capacity_Report.md (section 4)` | — |
| Infrastructure cost per customer per month (`infraCostPerCustomerMonth`) | 0.2 | USD/month | BENCHMARKED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5, "What One Customer Costs Us to Serve")` | — |
| Year 1 revenue, low (`year1RevenueLow`) | 300000 | USD/year | MODELED | `docs/PROJECT_CONTEXT.md (section 3)` | — |
| Year 1 revenue, high (`year1RevenueHigh`) | 600000 | USD/year | MODELED | `docs/PROJECT_CONTEXT.md (section 3)` | — |
| Year 2 revenue, low (`year2RevenueLow`) | 2000000 | USD/year | MODELED | `docs/PROJECT_CONTEXT.md (section 3)` | — |
| Year 2 revenue, high (`year2RevenueHigh`) | 4500000 | USD/year | MODELED | `docs/PROJECT_CONTEXT.md (section 3)` | — |
| Year 3 revenue, low (`year3RevenueLow`) | 7000000 | USD/year | MODELED | `docs/PROJECT_CONTEXT.md (section 3)` | — |
| Year 3 revenue, high (`year3RevenueHigh`) | 12000000 | USD/year | MODELED | `docs/PROJECT_CONTEXT.md (section 3)` | — |
| Year 1 cost, low (`year1CostLow`) | 590000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 1 cost, high (`year1CostHigh`) | 830000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 2 cost, low (`year2CostLow`) | 1100000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 2 cost, high (`year2CostHigh`) | 1800000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 3 cost, low (`year3CostLow`) | 2200000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 3 cost, high (`year3CostHigh`) | 3800000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |

## Marketplace liquidity — Hoboken

Liquidity means a posted campaign draws at least 3 qualified applicants over its open window (14 days), and a creator opening the app sees at least 5 campaigns in range. Both are computable from our own schema the day we launch. A 48-hour responsiveness target is a separate, real goal — but it is not part of this liquidity test, because we have no arrival-curve data yet to compute it honestly; we'll start measuring it once real applicant timestamps exist post-launch.

Creator supply is tracked separately from restaurant supply, because a shortage on
either side alone stops the market working.

| Restaurants | Creators | Campaigns open now | Applicants per campaign | Liquid |
|---:|---:|---:|---:|---|
| 1 | 4 | 1.2 | 3.2 | no |
| 5 | 20 | 5.8 | 3.2 | yes |
| 10 | 40 | 11.7 | 3.2 | yes |
| 25 | 100 | 29.2 | 3.2 | yes |
| 50 | 200 | 58.3 | 3.2 | yes |

"Applicants per campaign" is constant in this table (3.2 at every row) because every row here holds creators at the fixed 4:1 target ratio to restaurants — it depends on that ratio, not on scale. That is not a spreadsheet bug. The section below is where the ratio varies and the number actually moves.

At the target ratio of 4 creators per restaurant:

- 1 new restaurant(s) and 4 new creators per month: liquid in **month 5**.
- 2 new restaurant(s) and 8 new creators per month: liquid in **month 3**.
- 4 new restaurant(s) and 16 new creators per month: liquid in **month 2**.

If creator recruitment lags the target ratio, the market does not become liquid at any
restaurant count — more restaurants make the shortage worse, not better:

- 2 restaurants/month at 2 creators each: **never liquid within 36 months**.
- 2 restaurants/month at 3 creators each: **never liquid within 36 months**.
- 2 restaurants/month at 4 creators each: **liquid in month 3**.

## Scale — what 100 / 1,000 / 10,000 businesses mean

Average campaign value is $338, derived from the app's own per-deliverable price bands.

This table answers a different question from the Three-year trajectory below: it is
steady-state economics AT a given business count, computed for one month and annualized —
not a calendar-time projection of when we reach that count. The Year 3 trajectory band
($7–12M) and the 10,000-business annual figure here (~$33M) are not in tension; they answer
"what does the business look like at this size" versus "what do we expect by this date."

| Businesses | Creators | Monthly campaign volume | Monthly revenue | Annual revenue | Gross margin |
|---:|---:|---:|---:|---:|---:|
| 100 | 400 | $84,375 | $27,755 | $333,060 | 90.4% |
| 1,000 | 4,000 | $843,750 | $277,550 | $3,330,600 | 90.4% |
| 10,000 | 40,000 | $8,437,500 | $2,775,500 | $33,306,000 | 90.4% |

## Three-year trajectory

Revenue and cost bands are our own forward projections — MODELED, not a measurement of
anything that exists yet. The cost figures are **all-in cost**, not operating expense
alone: they include Stripe fees, AI and infrastructure spend alongside payroll, marketing
and legal, so read the column as total cost, not "opex".

Low EBITDA pairs low revenue with high cost (the worst case); high EBITDA pairs high
revenue with low cost (the best case) — pairing low revenue with low cost would understate
the downside.

| Year | Revenue | Total cost | EBITDA |
|---:|---:|---:|---:|
| 1 | $300,000–$600,000 | $590,000–$830,000 | -$530,000–$10,000 |
| 2 | $2,000,000–$4,500,000 | $1,100,000–$1,800,000 | $200,000–$3,400,000 |
| 3 | $7,000,000–$12,000,000 | $2,200,000–$3,800,000 | $3,200,000–$9,800,000 |

**Year 1 EBITDA runs from -$530,000 to +$10,000.** `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md`
section 7 describes Year 1 as "Breakeven to slight loss" — that is not true of a $530,000
loss on $300,000 of revenue at the low end of the band. State the real range, not the
prose summary.

