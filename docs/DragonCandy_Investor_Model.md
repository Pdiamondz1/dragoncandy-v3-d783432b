# DragonCandy — Investor Model

> **Generated file — do not edit.** Produced by `npm run model:doc` from
> `src/pitch/model/`. Change a number there, not here.

> Public-safe: budget and raise omitted. Regenerate with `--confidential` to include them.

> **The live deck at `/pitch` is superseded by this model on the ask.** `src/pitch/slides/slides.tsx`
> still shows the earlier priced-seed framing — "~$3M seed", "Raising $2.5–3.5M · ~$12–15M
> post-money" — computed before this register existed. This model derives a materially smaller
> required raise (regenerate with `--confidential` for the figure). Rebuilding the deck is out of scope here (a later plan
> owns it); until then, treat this document as the current number and the deck as pending an
> update.

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
| Paying customers (`payingCustomers`) | 0 | accounts | MEASURED | `prod: select count(*) from organizations where take_rate is not null and stripe_subscription_id is not null` | 2026-08-24 |
| Registered users (`registeredUsers`) | 45 | accounts | MEASURED | `prod: select count(*) from profiles` | 2026-08-24 |
| Page components (`pageComponents`) | 96 | files | MEASURED | `find src/pages -name '*.tsx' \| wc -l` | 2026-08-24 |
| React hooks (`hooks`) | 277 | files | MEASURED | `find src/hooks -name 'use*.ts' -o -name 'use*.tsx' \| wc -l` | 2026-08-24 |
| Edge functions (`edgeFunctions`) | 111 | functions | MEASURED | `ls -d supabase/functions/*/ \| grep -v _shared \| wc -l` | 2026-08-24 |
| TypeScript source files (`sourceFiles`) | 1230 | files | MEASURED | `find src -type f \( -name '*.ts' -o -name '*.tsx' \) \| wc -l` | 2026-08-24 |
| Database migrations (`migrations`) | 406 | files | MEASURED | `ls supabase/migrations/*.sql \| wc -l` | 2026-08-24 |
| Passing tests (`tests`) | 3228 | tests | MEASURED | `npx vitest run` | 2026-08-24 |
| Test files (`testFiles`) | 291 | files | MEASURED | `npx vitest run` | 2026-08-24 |
| AI spend cap as share of revenue (`aiCostCapPctOfRevenue`) | 0.15 | fraction | MEASURED | `docs/PROJECT_CONTEXT.md (section 8)` | 2026-08-23 |
| The calendar year that is Year 1 (`year1CalendarYear`) | 2026 | calendar year | MODELED | `founder confirmation, Damon Williams (CTO), in session 2026-08-26` | — |
| Standard delivery, low band (`campaignPriceStandardLow`) | 75 | USD/deliverable | MEASURED | `src/lib/campaignPricing.ts (TIER_PRICE_BANDS)` | 2026-08-23 |
| Standard delivery, high band (`campaignPriceStandardHigh`) | 150 | USD/deliverable | MEASURED | `src/lib/campaignPricing.ts (TIER_PRICE_BANDS)` | 2026-08-23 |
| Deliverables per campaign (`deliverablesPerCampaign`) | 3 | deliverables | MODELED | `src/pitch/model/assumptions.ts` | — |
| Campaigns per restaurant per month (`campaignsPerRestaurantPerMonth`) | 2.5 | campaigns/month | MODELED | `src/pitch/model/assumptions.ts` | — |
| Creators needed per restaurant (`creatorsPerRestaurant`) | 4 | creators | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)` | — |
| Campaign applications per active creator per month (`applicationsPerCreatorPerMonth`) | 2 | applications/month | MODELED | `src/pitch/model/assumptions.ts` | — |
| Days a campaign stays open for applications (`campaignOpenDays`) | 14 | days | MODELED | `src/pitch/model/assumptions.ts` | — |
| Tier mix — Free (`tierMixFree`) | 0.3 | fraction | MODELED | `src/pitch/model/assumptions.ts` | — |
| Tier mix — Starter (`tierMixStarter`) | 0.4 | fraction | MODELED | `src/pitch/model/assumptions.ts` | — |
| Tier mix — Growth (`tierMixGrowth`) | 0.25 | fraction | MODELED | `src/pitch/model/assumptions.ts` | — |
| Tier mix — Pro (`tierMixPro`) | 0.05 | fraction | MODELED | `src/pitch/model/assumptions.ts` | — |
| Restaurant acquisition cost, low (`restaurantCacLow`) | 500 | USD | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)` | — |
| Restaurant acquisition cost, high (`restaurantCacHigh`) | 1500 | USD | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5)` | — |
| Monthly customer churn (`monthlyChurn`) | 0.04 | fraction/month | BENCHMARKED | `docs/PROJECT_CONTEXT.md (section 3, 2025 SMB SaaS benchmark 3-5%/month)` | — |
| Stripe percentage fee (`stripePctFee`) | 0.029 | fraction | BENCHMARKED | `https://stripe.com/pricing` | — |
| Stripe fixed fee (`stripeFixedFee`) | 0.3 | USD/transaction | BENCHMARKED | `https://stripe.com/pricing` | — |
| AI cost per customer per month (`aiCostPerCustomerMonth`) | 1.2 | USD/month | MODELED | `docs/DragonCandy_Infrastructure_Capacity_Report.md (section 4)` | — |
| Infrastructure cost per customer per month (`infraCostPerCustomerMonth`) | 0.2 | USD/month | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 5, "What One Customer Costs Us to Serve")` | — |
| Prior plan (superseded): Year 1 ARR, low (`year1RevenueLow`) | 300000 | USD/year | MODELED | `docs/archive/DragonCandy_Path_to_Multi-million_annual_profit.md (three-year plan, lines 57-61) — the top-down plan as published in PROJECT_CONTEXT.md section 3 before 2026-08-26` | — |
| Prior plan (superseded): Year 1 ARR, high (`year1RevenueHigh`) | 600000 | USD/year | MODELED | `docs/archive/DragonCandy_Path_to_Multi-million_annual_profit.md (three-year plan, lines 57-61) — the top-down plan as published in PROJECT_CONTEXT.md section 3 before 2026-08-26` | — |
| Prior plan (superseded): Year 2 ARR, low (`year2RevenueLow`) | 2000000 | USD/year | MODELED | `docs/archive/DragonCandy_Path_to_Multi-million_annual_profit.md (three-year plan, lines 57-61) — the top-down plan as published in PROJECT_CONTEXT.md section 3 before 2026-08-26` | — |
| Prior plan (superseded): Year 2 ARR, high (`year2RevenueHigh`) | 4500000 | USD/year | MODELED | `docs/archive/DragonCandy_Path_to_Multi-million_annual_profit.md (three-year plan, lines 57-61) — the top-down plan as published in PROJECT_CONTEXT.md section 3 before 2026-08-26` | — |
| Prior plan (superseded): Year 3 ARR, low (`year3RevenueLow`) | 7000000 | USD/year | MODELED | `docs/archive/DragonCandy_Path_to_Multi-million_annual_profit.md (three-year plan, lines 57-61) — the top-down plan as published in PROJECT_CONTEXT.md section 3 before 2026-08-26` | — |
| Prior plan (superseded): Year 3 ARR, high (`year3RevenueHigh`) | 12000000 | USD/year | MODELED | `docs/archive/DragonCandy_Path_to_Multi-million_annual_profit.md (three-year plan, lines 57-61) — the top-down plan as published in PROJECT_CONTEXT.md section 3 before 2026-08-26` | — |
| Year 1 cost, low (`year1CostLow`) | 590000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 1 cost, high (`year1CostHigh`) | 830000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 2 cost, low (`year2CostLow`) | 1100000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 2 cost, high (`year2CostHigh`) | 1800000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 3 cost, low (`year3CostLow`) | 2200000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |
| Year 3 cost, high (`year3CostHigh`) | 3800000 | USD/year | MODELED | `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md (section 7, "The Cost Breakdown" table, line 520)` | — |

## Marketplace liquidity — Hoboken

Liquidity means a posted campaign draws at least 3 applicants over its open window (14 days), and a creator opening the app sees at least 5 campaigns in range. Both are computable from our own schema the day we launch. A 48-hour responsiveness target is a separate, real goal — but it is not part of this liquidity test, because we have no arrival-curve data yet to compute it honestly; we'll start measuring it once real applicant timestamps exist post-launch.

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

### How much headroom the headline number has

At the target 4:1 creator-to-restaurant ratio, "applicants per campaign" (3.2) clears the 3.0 threshold by only 6.25% headroom — set entirely by two MODELED constants sourced to this same file (`applicationsPerCreatorPerMonth` and `campaignsPerRestaurantPerMonth`). The tipping points, moving one at a time and holding the other fixed:

- Applications per creator per month below **~1.88** (currently 2.0): Hoboken never becomes liquid, at any restaurant count.
- Campaigns per restaurant per month above **~2.67** (currently 2.5): same failure — more campaigns per restaurant dilutes applicants per campaign faster than restaurant count can compensate.

Both hold everything else fixed at the target ratio. This is a statement about how thin the
headline margin is, not a prediction that either constant will move.

## Scale — what 100 / 1,000 / 10,000 businesses mean

Paid-conversion mix (MODELED, registered as `tierMixFree/Starter/Growth/Pro`): 30.0% free, 40.0% starter, 25.0% growth, 5.0% pro. This asserts 70% paid conversion from a base of zero paying customers today — every revenue figure below is downstream of it.

Average campaign value is $338, derived from the app's own per-deliverable price bands.

This table answers a different question from the Three-year trajectory below. **Three
distinct quantities appear across this document and `PROJECT_CONTEXT.md` §3, and they get
confused because all three are called "revenue":**

1. **Booked revenue** — what a calendar year actually invoices, summed month by month while customers ramp. Year 3 (2028): **$3,341,424**.
2. **Exit ARR** — the run rate at year end: year-end customers at the registered mix, annualized. Always larger than (1), because it does not pay for the ramp. Year 3: **$4,739,444**. This is what "ARR" means in §3 and in every target this company has stated.
3. **Steady-state annualized revenue at a given size** — *this table*. One month at N businesses, annualized, with no calendar attached. At 10,000 businesses: **$33,306,000**.

They are not in tension: (1) and (2) answer "what do we expect by this date", (3) answers
"what does the business look like at this size". The 10,000-business row is not a Year 3
claim and never was. Separating (1) from (2) on 2026-08-26 also surfaced a live ambiguity in
the revenue-per-employee kill-switch, which never said which of them it measures — see §3.

| Businesses | Creators | Monthly GMV | Monthly revenue | Annual revenue | Gross margin |
|---:|---:|---:|---:|---:|---:|
| 100 | 400 | $84,375 | $27,755 | $333,060 | 90.4% |
| 1,000 | 4,000 | $843,750 | $277,550 | $3,330,600 | 90.4% |
| 10,000 | 40,000 | $8,437,500 | $2,775,500 | $33,306,000 | 90.4% |

**Monthly churn (4.0%, kill-switch at 6%/mo) is not modeled anywhere in this table.** `monthlyChurn` sits in the
assumptions register, but no formula in `project.ts` consumes it — this table and the liquidity
ramp above both assume zero attrition. That understates the real difficulty of reaching a given
business count, though it turns out not to move the headline liquidity date: applying 4%/month
churn to the 2-restaurants/month ramp (a continuous-decay model, stock(t) = (rate/churn) × (1 −
e^(−churn×t))) puts month-3 restaurant stock at about **5.65**, still comfortably above the
**4.29** restaurants the open-campaigns condition requires — "liquid in month 3" survives.

**The 90.4% gross margin at 100 businesses excludes any fixed platform cost** —
`costOfRevenue` in `project.ts` is purely variable (Stripe fees on GMV plus a per-business
serve cost). Layering in a fixed floor changes the picture at this scale: today's real vendor
floor (`OPERATING.burnMonthly`, $569/mo) brings the 100-business margin to
**88.4%**; the model's own budgeted platform line in `confidential.ts`
(`burnMonthly × 3` = $1,707/mo, sized for launch load) brings it to
**84.3%**. `costOfRevenue` itself is intentionally left unchanged —
folding a fixed cost into it would ripple through every other reviewed figure in this document.
This gap narrows fast with scale, since a fixed cost divided by more revenue shrinks toward zero.

## Unit economics — LTV:CAC and CAC payback

`src/pitch/slides/slides.tsx` asserts "LTV:CAC ≥ 2:1 · CAC payback ≤ 12 mo" as guardrails, and
`docs/PROJECT_CONTEXT.md` section 3 makes both kill-switches. Neither was computed anywhere in
this model until now.

**Restaurant CAC is a MODELED target, not an observed cost** — DragonCandy has never acquired a
paying customer, and the source line in the Pricing Briefing literally reads "Blended target CAC
for restaurants." So this section is a projection measured against a projection, not two
independent measurements.

Gross profit per business per month (at the mix above): **$251**.
Expected customer lifetime at 4.0%/mo churn (1 ÷ churn): **25.0 months**.
Lifetime value: **$6,273**.

| Restaurant CAC | LTV:CAC | CAC payback |
|---:|---:|---:|
| $500 (low) | 12.5:1 | 2.0 months |
| $1,500 (high) | 4.2:1 | 6.0 months |

Both ends of the CAC band clear both guardrails.

## Three-year trajectory

> **The bottom-up model is the current forecast. The band table below is the SUPERSEDED
> top-down plan**, kept because it is what the registered cross-check compares against.
> Restated 2026-08-26 — see `PROJECT_CONTEXT.md` §3.
>
> | Year | Exit ARR | Booked revenue | Metros live |
> |---:|---:|---:|---:|
> | 2026 | $99,918 | $35,804 | 2 |
> | 2027 | $879,278 | $517,631 | 10 |
> | 2028 | $4,739,444 | $3,341,424 | 21 |
>
> Exit ARR is the year-end run rate; booked revenue is what the year invoices while
> customers ramp. The band below is a REVENUE band, so compare it against booked.

Revenue and cost bands are our own forward projections — MODELED, not a measurement of
anything that exists yet. The cost figures are **all-in cost**, not operating expense
alone: they include Stripe fees, AI and infrastructure spend alongside payroll, marketing
and legal, so read the column as total cost, not "opex".

Low EBITDA pairs low revenue with high cost (the worst case); high EBITDA pairs high
revenue with low cost (the best case) — pairing low revenue with low cost would understate
the downside.

| Year | Revenue (superseded plan) | Total cost | EBITDA (superseded plan) |
|---:|---:|---:|---:|
| 1 | $300,000–$600,000 | $590,000–$830,000 | -$530,000–$10,000 |
| 2 | $2,000,000–$4,500,000 | $1,100,000–$1,800,000 | $200,000–$3,400,000 |
| 3 | $7,000,000–$12,000,000 | $2,200,000–$3,800,000 | $3,200,000–$9,800,000 |

**The cost column is current; the revenue and EBITDA columns are not.** Against BOOKED
revenue from the bottom-up model, the same registered cost bands give:

| Year | Booked revenue | Total cost | EBITDA |
|---:|---:|---:|---:|
| 2026 | $35,804 | $590,000–$830,000 | -$794,196 to -$554,196 |
| 2027 | $517,631 | $1,100,000–$1,800,000 | -$1,282,369 to -$582,369 |
| 2028 | $3,341,424 | $2,200,000–$3,800,000 | -$458,576 to $1,141,424 |

**Year 1 EBITDA is -$794,196 to -$554,196.** `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md`
section 7 describes Year 1 as "Breakeven to slight loss". That was already untrue of the
superseded plan, whose own low end was a $530,000 loss on $300,000 of revenue, and the
bottom-up model makes it further from true, not closer: it books $35,804 in the first
calendar year against the same cost base. State the real range, not the prose summary.

