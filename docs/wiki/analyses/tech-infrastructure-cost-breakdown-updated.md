---
title: Tech & Infrastructure Cost Breakdown *Updated*
type: analysis
created: 2026-06-20
updated: 2026-06-20
sources: [workspace]
tags: []
---

# Tech & Infrastructure Cost Breakdown *Updated*

> Imported from a Google Workspace doc (id `1RzQim_z3HG_tDm3g9b8tswHrjR0bXzu__vbjkYnW5QI`) on 2026-06-20.

**DragonCandy**

**Tech & Infrastructure Cost Breakdown**

Capital Raise Reference — NYC / Hoboken Median Market Rates

**Confidential — For Internal Use & Investor Diligence**

*Prepared June 2026\. Staffing reflects NYC/Hoboken median market rates (Option A). Infrastructure figures are sourced from live platform data and internal strategy docs. Forward-looking tiers (10K–1M users) are labeled illustrative.*

**How to read this document.**  Part 1 gives you the headline numbers — what we spend today, what we’re raising, and how cost behaves as we scale. Part 2 is the full line-by-line breakdown that supports every figure in Part 1\.

# **Part 1 — The Numbers at a Glance**

## **Snapshot**

| Current Monthly Burn \~$390/mo *39 users, pre-revenue* | Recommended Raise \~$3.5M *range $3.0M–$3.85M* | Post-Money Valuation $14–$18M *\~19–25% dilution* |
| :---: | :---: | :---: |
| 18-Month Operating Cost **$2.30–$2.84M** *before contingency* | Team at Full Ramp **9–11 people** *vs. 30+ normally staffed* | AI Cost Cap **15% of revenue** *today: effectively 0%* |

## **18-Month Consolidated Budget**

The full operating plan that drives the raise. People are the dominant line at every scenario — as expected for a seed-stage SaaS/marketplace.

| Category | 18-Month Cost |
| :---- | :---- |
| People — team \+ founders \+ bookkeeper (phased, NYC median) | $1.90–$2.10M |
| Infrastructure \+ dev tooling | $50–$75K |
| Donny super-agent R\&D (external compute \+ infra) | $70–$150K |
| Mobile apps (Apple \+ Google) | $5–$10K |
| Marketing \+ brand acquisition (3 metros \+ brand GTM) | $160–$300K |
| Legal / IP / fundraising | $40–$75K |
| G\&A / ops / insurance / accounting | $80–$120K |
| **Operating subtotal** | **\~$2.30–$2.84M** |
| Contingency \+ \~6-month buffer | \~$0.65–$1.00M |
| **Recommended raise (Option A)** | **\~$3.0M–$3.85M** |

*Target raise \~$3.5M. The 50/30/20 use-of-funds split (below) holds; the Engineering bucket absorbs the NYC-median staffing difference.*

## **Use of Funds (@ \~$3.5M)**

| Bucket | % | Amount | Covers |
| :---- | :---- | :---- | :---- |
| Engineering & Donny AI | 50% | \~$1.75M | Eng team (back/front/AI/app-admin/security), Donny R\&D, infra \+ tooling, mobile apps |
| GTM & Metro Expansion | 30% | \~$1.05M | Sales AE, 3-metro marketing, brand acquisition (founder \+ AE led), partnerships |
| Working Capital & G\&A | 20% | \~$0.70M | Founder salaries, legal/IP, accounting, insurance, ops, runway buffer |

## **Cost to Scale — 100 to 1,000,000 Users**

The operating-leverage story in one table: cost-per-user falls at every milestone. *The 100 and 1,000 tiers are grounded in live Supabase data; 10K–1M are illustrative extrapolations.*

| Users | Monthly Infra Cost | Cost / User / Mo | % of Revenue |
| :---- | :---- | :---- | :---- |
| Today (39) | \~$390/mo | — | \~0% |
| 100 | \~$400–500/mo | $4.00–$5.00 | 1.0–1.3% |
| 1,000 | \~$1,300–$2,100/mo | $1.30–$2.10 | 0.4–0.6% |
| 10,000 | \~$12K–$25K/mo | $1.20–$2.50 | illustrative |
| 100,000 | \~$90K–$200K/mo | $0.90–$2.00 | illustrative |
| 1,000,000 | \~$700K–$1.6M/mo | $0.70–$1.60 | illustrative |

**$4–$5/user** at 100 users  →  **$0.70–$1.60/user** at 1M users. Infrastructure is a shrinking percentage of revenue as the business scales.

## **What the Numbers Say**

* **People-led, not infra-led.** Staffing is the dominant cost at every scenario; infrastructure is 1.0–1.3% of revenue at 100 users, shrinking to 0.4–0.6% at 1,000.

* **AI stays capped.** AI spend is held ≤15% of revenue at every modeled tier — and sits at just 0.2–0.6% in the grounded 100–1K tiers.

* **Operating leverage is real.** Cost-per-user declines at every scale point; the proprietary fine-tuned Donny model lowers per-call inference cost exactly where AI spend is largest.

* **Lean by design.** Auto-improvement agents run as a \~$1.5–$3K/month compute line (not headcount), keeping the team at 9–11 people instead of 30+.

* **Funds an 18-month, multi-metro push** consistent with the Year-1 $300–600K / Year-2 $2–$4.5M ARR plan.

# **Part 2 — Detailed Cost Breakdown**

## **1\.  Current State (Today — 39 Users, Pre-Revenue)**

**Monthly operating burn: \~$390/month**

* Supabase Pro \+ SMALL compute: $74

* Lovable.dev hosting: $50

* Anthropic / Claude Max plan (development): $200

* Outstand.so (social media integration): $67

* OpenAI (embeddings / RAG): $25

* **Production AI API spend (June 2026 MTD): $2.28** *(separate from Max dev plan)*

**Platform snapshot (as of June 20, 2026):**

* Total registered users: 39 (17 restaurants, 16 creators, 6 brands)

* Active campaigns: 2  |  Published: 13

* Locations: 27 across 11 restaurants

* Social connections: 8 (Instagram, YouTube, Facebook)

* AI cost cap: 15% of revenue ($250/mo floor pre-revenue) — currently effectively 0%

## **2\.  Infrastructure Scaling — 100 to 1,000,000 Users**

*Per-tier line-item detail behind the cost-to-scale table in Part 1\. The 100 and 1,000 tiers are grounded in live Supabase data and the Infrastructure Capacity Report; 10K–1M are illustrative extrapolations.*

### **100 Users — \~$400–500/month  |  $4.00–$5.00/user/mo**

* Supabase Pro \+ SMALL compute: $74

* Lovable.dev hosting: $50

* Anthropic API (Donny production): \~$80–200

* OpenAI embeddings: $20–25

* Outstand.so: $67

* Infra as % of \~$40K projected monthly revenue: **1.0–1.3%**

### **1,000 Users — \~$1,300–$2,100/month  |  $1.30–$2.10/user/mo**

* Supabase LARGE compute \+ read replicas: \~$224

* Anthropic API: $800–$1,600

* OpenAI embeddings: $25–50

* CDN / hosting: $50–75

* Outstand \+ third-party APIs: $67–100

* Infra as % of \~$350K projected monthly revenue: **0.4–0.6%**

### **10,000 Users — \~$12,000–$25,000/month  |  $1.20–$2.50/user/mo  (illustrative)**

* Multi-replica / clustered Postgres

* Anthropic API: \~$8,000–$16,000

* CDN / egress becomes material

### **100,000 Users — \~$90,000–$200,000/month  |  $0.90–$2.00/user/mo  (illustrative)**

* Clustered DB \+ dedicated infrastructure

* Anthropic API: \~$80,000–$160,000 (hard-capped at 15% of revenue)

* CDN / egress: \~$10,000–$25,000

### **1,000,000 Users — \~$700,000–$1,600,000/month  |  $0.70–$1.60/user/mo  (illustrative)**

* Sharded / dedicated DB or self-managed Postgres

* Anthropic API: \~$700,000–$1,600,000 (cap-governed; lowered materially by proprietary fine-tuned Donny model)

* CDN / egress: $10,000–$40,000+

## **3\.  AI Spend — Controls & Cost Architecture**

AI is the only cost line that scales linearly with usage. Three hard controls are live in production today:

* **Model routing:** Haiku for cheap tasks (creator matching, social captions), Sonnet for generation and chat — always routes to the cheapest capable model.

* **Tier credit budgets:** Free \= 50 calls/mo, Starter \= 500, Growth \= 2,000, Pro \= 10,000 — gates AI spend to paying tiers only.

* **Hourly rate limits:** Per-user cap prevents runaway API costs from any single user.

**2026 API rates (Anthropic):**

* Claude Haiku 4.5: $1/M tokens in, $5/M out

* Claude Sonnet 4.6: $3/M tokens in, $15/M out

* Batch mode discount: −50%  |  Prompt caching: −90% on cached input

**2026 API rates (OpenAI):**

* text-embedding-3-small: $0.02/M tokens

* text-embedding-3-large: $0.13/M tokens

**AI cost hard cap: 15% of revenue** ($250/mo floor pre-revenue).

* Today (39 users): $2.28 MTD — effectively 0% of revenue

* At 250 users: projected $0.80–$1.60/user/mo \= 0.2–0.4% of revenue (1/30th of cap)

* At 100K–1M users: the proprietary fine-tuned Donny model lowers per-call inference cost, widening margin at the tiers where AI spend is largest

## **4\.  R\&D — Donny Super-Agent Program**

Three phased sub-lines over 18 months. The dominant cost is the AI Developer FTE (counted in staffing), not external compute. 2026 fine-tuning economics make this moat surprisingly cheap to build.

### **4.1  Proprietary Fine-Tuned Model  (trigger: 1,000–5,000 campaigns accumulated)**

* LoRA/QLoRA on an open model (Llama/Mistral) trained on DragonCandy’s proprietary brief → match → outcome data

* LoRA training run: $50–300  |  QLoRA on single H100 (8–12 hrs): $10–16

* Hosted LoRA fine-tune (Together/Fireworks): \~$0.48–$0.75/M tokens (Llama-70B on 30M tokens ≈ $43.50)

* Open-route is \~25× cheaper than GPT-class hosted fine-tune

* **18-month budget: \~$15–$35K** for training iterations, eval harness, inference-hosting experiments

* Recurring inference folds back into the §2 AI line and lowers it

### **4.2  Public Donny API / Platform  (new revenue line)**

* Partners and developers build on Donny via metered API (campaign-from-URL, matching, scheduling as endpoints)

* Incremental external spend: gateway/rate-limiting infra, usage metering, docs, dev-rel, sandbox inference

* **18-month budget: \~$30–$60K**

### **4.3  Standalone Donny Assistant  (value beyond the marketplace)**

* Separate Donny surface (web/app/chat) usable outside a campaign context

* Incremental over 18 months: separate product infra \+ light GTM

* **18-month budget: \~$25–$55K**

**Total Donny R\&D incremental external spend (18 months): \~$70–$150K**  *(everything else is the AI Developer FTE already counted in staffing)*

## **5\.  Mobile Apps — Apple App Store \+ Google Play**

iOS Capacitor Phase 1 is already shipped. Incremental spend covers the Android wrap and store operations only — not a rebuild.

* Apple Developer Program: $99–299/year

* Google Play Console: $25 one-time

* Cloud-Mac CI build (GitHub macOS runners / MacStadium): $100–250/month

* Android Capacitor wrap: engineering time (inside staffing)

* Store assets, QA, review cycles: \~$3–$6K one-time

* **18-month incremental cash: \~$5–$10K** (engineering salary excluded — counted in staffing)

**Note:** *Payments are routed through Stripe (not App Store billing) to avoid Apple’s 15–30% in-app purchase commission on subscriptions and marketplace transactions.*

## **6\.  Staffing — NYC/Hoboken Median Market Rates, Hybrid, Phased Over 18 Months**

**Compensation basis:** NYC/Hoboken 2026 median market rates (mid-point of documented range per role). FTE salaries shown fully loaded (+30% employer taxes/benefits). Contractors shown at cash cost, no load. Roles are phased — not all hired Month 0\.

**NYC 2026 market ranges (for reference):**

| Role | Role |
| :---- | :---- |
| Back-End: $140–220K | Security: $160–225K |
| Front-End: $140–209K | Product: $135–215K |
| ML/AI: $138–223K | DevOps/SRE: $142–181K |

### **Role-by-Role Breakdown (Option A — NYC Median)**

| Role | NYC Median Base | Loaded Annual Cost | Hire | Rationale |
| :---- | :---- | :---- | :---- | :---- |
| Back-End Engineer (DB / Functionality) | \~$180K | \~$234K | Mo 0–1 | Core build capacity alongside Dame (CTO) |
| AI Developer | \~$180K | \~$234K | Mo 0–1 | Highest-leverage hire — owns Donny, model routing, the §4 program, fine-tuned model roadmap |
| Front-End Engineer (UX/UI) | \~$175K | \~$228K | Mo 1–2 | Owns the \<10-keystroke North Star surfaces; “less typing \= more margin” UX thesis |
| App Administrator / DevOps | \~$162K | \~$211K | Mo 2–3 | Runs scaling, uptime, auto-improvement agent compute (contract first, then FTE) |
| Security Engineer (0.4 FTE) | \~$193K | \~$77K cash | Mo 3 | Audits \+ ongoing review; fractional because security work is episodic |
| Product Manager | \~$175K | \~$228K | Mo 6 | Dame covers product early; formalize as surface area grows (contract → FTE) |
| Sales AE (under Joe, CEO) | \~$80K base | \~$104K base / $150–180K OTE | Mo 4–6 | Gated: hired only after founder-led selling \+ paid ads prove a repeatable message |
| Auto-Improvement Agents | compute | \~$1.5–3K/mo | Mo 0 | Bug-fix, maintenance, auto-scaling, security/perf scans — work of 4–6 devs, funded as AI compute, NOT headcount |
| Founders — Dame (CTO) \+ Joe (CEO) | \~$90–110K ea | \~$120–140K ea | Mo 0 | Modest during runway per staffing plan Stage 2 |
| Bookkeeper | part-time | \~$20–30K/yr | Mo 0 | Part-time contract |

### **Staffing Summary (Option A — NYC Median)**

* **Steady-state fully ramped annual run-rate: \~$1.65M**

* **18-month people cost (phased \~80% average staffing): \~$1.90–$2.10M**

*Compared to the original below-market model (\~$1.60–$1.80M over 18 months), Option A adds approximately $300–350K to the people line over 18 months.*

## **7\.  Other Cost Lines (Complete Picture for Investors)**

### **Legal / IP / Fundraising**

* Trademark filings: DragonCandy, Donny AI, DragonDash (Classes 35 & 42\)

* Provisional patents: campaign-from-URL system, AI-scored matching pipeline

* Corporate legal, fundraising legal

* **18-month budget: \~$40–$75K**

### **G\&A / Ops / Insurance / Accounting**

* Hoboken office / co-working

* Business insurance, payroll admin, accounting software

* **18-month budget: \~$80–$120K**

### **Marketing — Sequenced 3-Metro Launch**

* **Hoboken, NJ (Mo 0–6):** hand-onboard creators \+ restaurants, referrals, local events — $15–$25K

* **Manhattan, NYC (Mo 5–12):** density playbook \+ paid social (TikTok/Meta) — $60–$120K

* **Palm Beach, FL (Mo 11–18):** copy-paste playbook, seasonal timing — $30–$60K

* **Cross-metro:** SEO, creator referral program, PR — $25–$45K

* **18-month marketing total: \~$130–$250K**

### **Brand Acquisition GTM  (incremental only — headcount rides Joe \+ AE)**

* Outreach collateral, industry events, pipeline tooling: **\~$30–$50K**

### **Stripe Transaction Fees**

* 2.9% \+ $0.30/transaction — pass-through on GMV, recovered via the take-rate

* Not an infrastructure line but appears in unit economics

## **8\.  Valuation Framing**

A \~$3.5M seed at $14–$18M post-money implies \~19–25% dilution — within the standard 2026 seed band. The exact raise, valuation, and structure (priced round vs. SAFE) are a founder/market decision. This model supplies the defensible operating need, not the term sheet.

## **9\.  Sanity Checks**

* People line is the dominant cost at every scenario — as expected for a seed-stage SaaS/marketplace

* AI spend stays ≤15% of revenue at every modeled user tier (sits at 0.2–0.6% in the grounded 100–1K tiers)

* Cost-per-user falls at every scale point (operating-leverage narrative is intact)

* Infrastructure is 1.0–1.3% of projected revenue at 100 users, shrinking to 0.4–0.6% at 1,000 users

* The raise at \~$3.5M funds an 18-month, multi-metro, full-team push consistent with the Y1 $300–600K / Y2 $2–$4.5M ARR plan

* Auto-improvement agents remain a compute line (\~$1.5–$3K/mo), not headcount — keeping the team lean at 9–11 people vs. the 30+ a normally-staffed org would require

## **10\.  Key Sources**

**Internal docs:** DragonCandy\_Capital\_Raise\_Cost\_Model.md · DragonCandy\_Infrastructure\_Capacity\_Report.md · PROJECT\_CONTEXT.md · DragonCandy\_Pricing\_Profitability\_Briefing\_v2.md · STRIPE\_PRICES.md · DragonCandy\_Moat\_Playbook.md · wiki/analyses/north-star-kpi-scorecard.md

**External 2026 benchmarks:** levels.fyi NYC SWE · Built In AI Engineer NYC · ZipRecruiter Security Engineer NYC · Glassdoor PM NYC · Everstage SaaS Sales Comp · Founderpath AE Benchmark · CloudZero Claude/OpenAI API Pricing · SplitMetrics App Store Fees · Spheron Fine-Tuning 2026 · Benly TikTok Ad Cost 2026 · Sovran Meta CPM 2026

*Confidential — For Internal Use & Investor Diligence*

*Prepared by Donny (DragonCandy AIOS) · June 2026*

*Staffing: NYC/Hoboken median market rates (Option A). Infrastructure: grounded on live Supabase \+ Anthropic data. 10K–1M user tiers are illustrative extrapolations.*
