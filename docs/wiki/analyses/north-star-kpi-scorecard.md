---
title: North Star & KPI Scorecard
type: analysis
created: 2026-06-10
updated: 2026-08-26
sources: [docs/PROJECT_CONTEXT.md, external-saas-benchmarks-2025]
tags: [strategy, kpi, metrics, kill-switches, investor, benchmarks]
---

# North Star & KPI Scorecard

Operationalizes DragonCandy's three-year targets (`PROJECT_CONTEXT.md` §3) and kill-switches into a
tracked metric set, and validates each kill-switch threshold against external SMB-SaaS / marketplace
benchmarks so the numbers are defensible to investors rather than arbitrary. Produced by the
[[Self-Improving App]] autoresearch loop as its first strategy/KPI artifact (Slice 1 demo).

**Internal grounding:** `docs/PROJECT_CONTEXT.md` §2 (North Star), §3 (targets + kill-switches), §8
(pricing). **External benchmarks:** 2025 SaaS benchmark reports cited inline and listed under Sources;
every external claim below is corroborated by ≥2 independent sources per the autoresearch acceptance gate.

## North Star → operational KPI

The North Star is **"less typing = more margin"**: every primary flow under 10 keystrokes by Month 6,
a paid campaign in under 60 seconds (`PROJECT_CONTEXT.md` §2). That is a measurable product KPI, not a
slogan. Instrument it now:

- **Keystrokes-to-paid-campaign** (median) — the literal North Star metric; target ≤10 by Month 6.
- **Time-to-first-paid-campaign** (median, seconds) — target <60s.
- **% of primary flows under 10 keystrokes** — coverage of the keystroke goal across surfaces.

These tie directly to [[Musk's Algorithm]] (delete keystrokes) and are the leading indicator that the
[[DragonDash]] "less typing = more margin" thesis is working before revenue exists to confirm it.

## Three-year scorecard

From `PROJECT_CONTEXT.md` §3 — track these as the headline board metrics:

**Restated 2026-08-26** from the bottom-up model (`src/pitch/model/`). "ARR" here means **exit ARR**
— the year-end run rate — which is what the targets have always meant; booked revenue is the lower
figure the same year invoices while customers ramp. Quoting one for the other is what made the
top-down band look like it disagreed with the model.

| Metric | Y1 (2026) | Y2 (2027) | Y3 (2028) |
|--------|----|----|----|
| Exit ARR | ~$100K | ~$879K | ~$4.7M |
| Booked revenue | $36K | $518K | $3.34M |
| Headcount | 5–6 | 7–8 | 10–11 |
| Metros | 2–3 (model: 2) | 8–12 (model: 10) | 20+ (model: 21) |
| Customers | — | ~264 | ~1,423 |
| NRR | — | >110% | (sustain) |
| Profit | — | — | see note |

**Superseded top-down band: $300–600K / $2–4.5M / $7–12M.** It stays registered in
`src/pitch/model/assumptions.ts` at those original values as the model's cross-check and must not
be updated to match this table. **The metro counts survived the restatement intact** — the plan and
the model do not disagree about reach, they disagree about price ($277.55 modeled ARPU against the
plan's $400–500), and the model books only two of the four revenue streams. The **Profit** row's
old "$2–5M" was computed against the old revenue and does not follow; against the registered
$2.2–3.8M Y3 cost band and booked revenue it is −$0.5M to +$1.1M, which straddles zero.

## Kill-switch validation (internal threshold vs. external benchmark)

Each kill-switch triggers a "pause and reassess." The benchmarks below show **three are well-calibrated
and two need a scope decision.**

| Kill-switch | DC threshold | 2025 external benchmark | Verdict |
|-------------|--------------|--------------------------|---------|
| **Churn** | > 6% | SMB SaaS **monthly 3–5%** (best-in-class <1%); annual ideal ≤5% | If monthly, 6% sits just above the normal SMB band — a sensible pause trigger. **Unit is unspecified — see Flag 1.** |
| **CAC payback** | > 12 mo | Best-in-class **<12 mo**; good 12–18; SMB segment **8–12 mo** | Well-calibrated. 12 mo is exactly the best-in-class / SMB norm. Keep. |
| **LTV:CAC** | < 2:1 | **3:1** standard; early-stage (<$2M ARR) ~**2.5:1**; B2B median ~3.2:1 | A 2:1 *floor* is a reasonable minimum; aim 3:1 by scale. Note the 3:1 rule "was never intended for pre-PMF/seed" — this gate is meaningful from Y1+, not pre-revenue. |
| **Revenue / employee** | < $400K | Median private SaaS **~$130K**; $1–3M ARR band **~$100K**; $400K = best-in-class only at **$50M+ ARR** | **Mis-scoped if applied early — see Flag 2.** $400K is a Y2–Y3 maturity gate, not a Y1 trigger. |

**NRR target (Y2 >110%):** SMB median NRR is **97%**; **110%+ is best-in-class for SMB**. The Y2 target is
ambitious-but-right — it explicitly aims DragonCandy at top-tier SMB retention, consistent with the
[[Data Flywheel]] thesis (expansion from accumulated match quality).

## Flags (contradictions / ambiguities — both resolved 2026-06-10)

> **Resolution:** both flags below were folded into `PROJECT_CONTEXT.md` §3 on 2026-06-10 — churn is now
> stated as **monthly**, and the revenue/employee gate is scoped to **Y2–Y3**. Kept here as the record of
> what the loop surfaced (flag-then-resolve, never silently overwritten).

**Flag 1 — Churn unit is unspecified.** `PROJECT_CONTEXT.md` lists "Churn > 6%" without a period. SMB SaaS
benchmarks are quoted *monthly* (3–5%) and *annually* (≤5% ideal) — and 6% means very different things in
each frame (6%/mo ≈ 52%/yr logo loss). Recommend stating the unit explicitly; at SMB scale a **monthly**
reading is the defensible interpretation.

**Flag 2 — Revenue/employee kill-switch reads as a maturity target, not an early-stage trigger.** At the
Y1 plan, DragonCandy is structurally far below its own $400K floor, so the gate would false-trigger from
day one. Recommend scoping this kill-switch to **Y2–Y3** (or restating the early-stage floor to a
stage-appropriate number).

**Restated 2026-08-26 — the recommendation stands, but the argument for it got stronger, and a new
ambiguity appeared.** This flag used to rest on the Y3 plan clearing comfortably ($7–12M ÷ 10–11 ≈
$636K–$1.2M). At the restated Y3 it no longer clears cleanly: **$431–474K on exit ARR (clears) but
$304–334K on booked revenue (fails)**, in both staffing cases. So the gate now depends on a question it
never answered — **which revenue does it measure?** That was not a live question while one number stood
for both.

**The benchmark row above already answers whether the floor itself is right, and it was written before
anyone connected it to this.** A private-SaaS median of **~$130K**, and **~$100K in the $1–3M ARR band**,
puts the restated Y3's $304–334K booked-revenue-per-employee at roughly **three times the benchmark for
its own ARR band** — a strong result, not a failure. $400K is a $50M+ ARR figure. The gate is not
failing; it is mis-scoped, which is what this flag said all along.

The decision is the founder's and has not been made — see `PROJECT_CONTEXT.md` §3, which lists four
candidate resolutions and notes that the "which revenue" question governs whether the other three are
even in play.

## What to instrument from Day 1 (pre-revenue)

Pre-revenue by choice (45 organic users read off prod 2026-08-24, $0 paying — this said "~30", the figure PROJECT_CONTEXT carried while tagged MEASURED), so the scorecard above is mostly forward-looking.
The capture-now metrics — feeding the [[Data Flywheel]] — are the leading indicators:

- **Activation rate** — % of signups that complete a first campaign / DragonShare submission.
- **Time-to-value** — signup → first completed action.
- **Keystrokes + time-to-paid-campaign** — the North Star instruments above.
- **Take-rate realized vs. tier** — validates the [[Take-Rate Ladder]] / [[Pricing Architecture]] as paying
  customers arrive.

Logging these from Day 1 is the same ledger-first discipline that makes the [[Data Flywheel]] defensible.

## Operationalized as a guardrail playbook (2026-06-20)

The §3 kill-switches are now an **executable, repeatable check**: the report-only
`kill-switch-watch` [[Founder Playbooks]] playbook evaluates all four
(green/watch/breach/not-yet-measurable) and, run on a schedule, files a finding only on
a breach. Pre-revenue it is an armed-watch scaffold — consistent with this scorecard's
finding that three thresholds are forward-looking and the rev/employee floor is a Y2–Y3
gate. The three financial switches stay *not-yet-measurable* until the Day-1
instrumentation above (cohort/activation/take-rate) matures into churn/CAC/LTV data.

## See Also

- [[Self-Improving App]]
- [[Founder Playbooks]]
- [[Data Flywheel]]
- [[Pricing Architecture]]
- [[Take-Rate Ladder]]
- [[Musk's Algorithm]]
- [[DragonCandy Platform]]

## Sources

External benchmarks (2025), each metric corroborated by ≥2 independent sources:

- Churn — [Optifai (939 B2B SaaS cos)](https://optif.ai/learn/questions/b2b-saas-churn-rate-benchmark/), [Vena](https://www.venasolutions.com/blog/saas-churn-rate), [Vitally](https://www.vitally.io/post/saas-churn-benchmarks)
- CAC payback — [First Page Sage](https://firstpagesage.com/reports/saas-cac-payback-benchmarks/), [ScaleXP](https://www.scalexp.com/blog-saas-benchmarks-cac-payback-2025/), [Optifai](https://optif.ai/learn/questions/cac-payback-period-benchmark/)
- LTV:CAC — [HiBob](https://www.hibob.com/financial-metrics/ltv-cac-ratio/), [The SaaS CFO](https://www.thesaascfo.com/ltv-to-cac-ratio-of-three/), [Vena](https://www.venasolutions.com/blog/ltv-cac-ratio)
- NRR — [SaaS Capital](https://www.saas-capital.com/blog-posts/what-is-a-good-retention-rate-for-a-private-saas-company/), [Optifai](https://optif.ai/learn/questions/b2b-saas-net-revenue-retention-benchmark/)
- Revenue/employee — [SaaS Capital](https://www.saas-capital.com/blog-posts/revenue-per-employee-benchmarks-for-private-saas-companies/), [Lighter Capital](https://www.lightercapital.com/blog/revenue-per-employee-benchmarks)
