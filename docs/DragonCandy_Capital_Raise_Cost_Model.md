# DragonCandy — Capital Raise Cost Model

**Confidential — For Internal Use & Investor Diligence**
*Prepared 2026-06-17. The defensible cost basis behind the `/pitch` deck's Ask, Use-of-Funds,
and Financials slides.*

> This is the working detail. Every figure in the investor deck traces back to a line here, and
> every line here traces to either a repo strategy doc (cited as `file`) or a sourced 2026
> external benchmark (cited inline + listed in §10). Where a number is forward-looking it is
> **labeled illustrative**.

---

## 1. Framing & Assumptions

- **Purpose:** size a seed raise that funds an **18-month runway** to Year-2 scale (multi-metro,
  paying customers, a fuller team than the company can self-fund pre-revenue).
- **Staffing basis:** **hybrid** — full-time for continuously-needed roles, fractional/contract
  for intermittent ones. Comp benchmarked to **NYC-metro 2026 market rates**, but **modeled
  below market** (seed-stage; equity closes the gap, per the staffing plan). FTE cash is shown
  **fully loaded** (base + ~30% employer taxes/benefits); contractors are billed at cash with no
  load.
- **Metros:** **sequenced** launch — **Hoboken (home base) → Manhattan → Palm Beach** — each
  gated on density before the next, per the "win one metro, then copy-paste" GTM
  (`docs/DragonCandy_Moat_Playbook.md`, deck SlideGTM).
- **Scale benchmarks:** infrastructure costed at **100 / 1K / 10K / 100K / 1M users**. The
  **100 and 1K tiers are grounded** in `docs/DragonCandy_Infrastructure_Capacity_Report.md`
  (live Supabase + Anthropic data, May 2026). **10K / 100K / 1M are illustrative** scaling
  extrapolations, governed by the 15%-of-revenue AI cost cap.
- **Donny "super-agent":** one **phased R&D program** with three sub-lines — proprietary
  fine-tuned model, public Donny API/platform, standalone Donny assistant.

### Reconciliation with the lean staffing plan (read this first)

The roster the founders asked to cost (front-end, back-end, security, PM, AI dev, app admin,
auto-improvement agents, **plus a salesperson**) is a **fuller, earlier** team than the repo's
`docs/superpowers/specs/2026-04-28-org-chart-staffing-design.md`, whose discipline rules are:
*"every hire must generate $500K+ in revenue per head," "no salesperson until paid ads are
profitable," "no second developer until the AI agents can't keep up," "every new hire starts as
a contractor."*

**This is not a contradiction — it is the reason to raise.** A priced round is precisely how a
company funds a team it cannot yet pay for out of revenue. This model therefore presents the
requested roster as **"what this raise buys over 18 months, phased,"** and keeps the lean rules
as **gates on the spend** (the salesperson is hired only after paid acquisition shows signal;
the auto-improvement "agents" are **compute, not a headcount**; contractors precede FTEs). Where
the bootstrapped plan said "do it with 10–11 people because AI does the work of 20–40," this
plan says "raise capital to pull that same lean team forward by ~18 months."

---

## 2. Infrastructure at Scale (100 → 1,000,000 users)

### 2.1 Today (grounded)

Current burn **~$390/mo**: Lovable $50, Anthropic $200, Outstand $67, Supabase $45, OpenAI $25
(`docs/PROJECT_CONTEXT.md` §4). The Capacity Report's baseline is **$295/mo** excluding Outstand
(`docs/DragonCandy_Infrastructure_Capacity_Report.md`). DB upgrade **MICRO→SMALL (+$49/mo)** is
required before 75 users.

### 2.2 The scaling curve

Cost components per tier: Supabase (compute tier + storage + egress + read replicas), **AI**
(Anthropic Donny inference, model-routed Haiku/Sonnet + OpenAI embeddings), hosting/CDN/bandwidth
(Lovable today → dedicated CDN at scale), Outstand + third-party APIs. Stripe is **not** an infra
line — it is a ~2.9% + $0.30 **pass-through on GMV**, recovered in the take-rate.

| Users | Monthly infra cost | Cost / user / mo | Status | Basis |
|------:|-------------------:|-----------------:|--------|-------|
| 100 | **$400–$500** | $4.00–$5.00 | grounded | Capacity Report §5 (SMALL compute; rev ~$40K; infra 1.0–1.3%) |
| 1,000 | **$1,300–$2,100** | $1.30–$2.10 | grounded | Capacity Report §5 (LARGE compute + replicas; Anthropic $800–$1,600; rev ~$350K; infra 0.4–0.6%) |
| 10,000 | **$12K–$25K** | $1.20–$2.50 | *illustrative* | Multi-replica/clustered Postgres; AI ~$8–16K; CDN material |
| 100,000 | **$90K–$200K** | $0.90–$2.00 | *illustrative* | Clustered DB + dedicated infra; AI ~$80–160K (cap-governed); CDN/egress ~$10–25K |
| 1,000,000 | **$700K–$1.6M** | $0.70–$1.60 | *illustrative* | Sharded/dedicated DB or self-managed; AI ~$0.7–1.6M (cap-governed, **lowered by the fine-tuned model**); CDN/egress ~$10–40K+ |

**The story investors care about:** **cost-per-user falls at every step** (operating leverage).
Infra shrinks from ~1.0–1.3% of revenue at 100 users to ~0.4–0.6% at 1,000
(Capacity Report §5: *"Infrastructure costs shrink as a percentage of revenue at every scale
point — this is the SaaS advantage"*), and the trend continues at the illustrative tiers.

### 2.3 The AI line is the governor — and it's controlled

AI is the only cost line that scales ~linearly with active use, so it is hard-capped at **15% of
revenue** (`docs/PROJECT_CONTEXT.md` §8) and held far below that by three levers already in
production (Capacity Report §4): **model routing** (cheapest capable model — Haiku for matching/
captions, Sonnet for generation), **tier credit budgets**, and **hourly rate limits**.

2026 API rates make this comfortable (per 1M tokens): **Claude Haiku 4.5 $1 in / $5 out, Sonnet
4.6 $3 / $15, Opus 4.8 $5 / $25**; **batch −50%, prompt caching −90% on cached input**
([Anthropic pricing 2026](https://www.cloudzero.com/blog/claude-api-pricing/)). OpenAI
embeddings: **text-embedding-3-small $0.02/M, 3-large $0.13/M**
([OpenAI pricing 2026](https://www.cloudzero.com/blog/openai-pricing/)). At 250 users Donny costs
**$0.80–$1.60/user/mo = 0.2–0.4% of revenue** (Capacity Report §4) — 1/30th of the cap. At the
100K/1M tiers the **proprietary fine-tuned model (§3.1)** drives per-call inference cost *down*,
widening the margin.

---

## 3. Donny Super-Agent — Phased R&D Program

"Value outside the app" = three sub-lines, phased across the 18 months. **The dominant cost is
the AI-developer FTE (counted in §5), not external compute** — in 2026, fine-tuning is
remarkably cheap, so this moat is built mostly with talent already on payroll.

### 3.1 Proprietary fine-tuned model (the data-flywheel moat, made tangible)

Trigger: once **1,000–5,000 campaigns** accumulate (`docs/PROJECT_CONTEXT.md` §6, "On the
Horizon"). LoRA/QLoRA on an open model trained on DragonCandy's proprietary brief→match→outcome
data. 2026 economics make this almost a rounding error:

- A LoRA training run: **$50–$300**; QLoRA on a single H100, 8–12 hrs: **$10–$16**; hosted LoRA
  fine-tune (Together/Fireworks) **$0.48–$0.75/M tokens** (Llama-70B on 30M tokens ≈ **$43.50**)
  ([fine-tuning cost 2026](https://www.spheron.network/blog/how-to-fine-tune-llm-2026/),
  [pricepertoken](https://pricepertoken.com/fine-tuning)). Open-route is **~25× cheaper** than
  GPT-class hosted fine-tune (~$25/M training tokens).
- **18-month budget:** ~**$15–35K** for many training/eval iterations + a held-out eval harness +
  inference-hosting experiments (GPU $0.44–$2.40/hr A100). Recurring inference folds into the §2
  AI line **and lowers it**.

### 3.2 Public Donny API / platform (a new revenue line)

Partners/developers build on Donny via a **metered API** (campaign-from-URL, matching, scheduling
as endpoints). Build cost is eng time (§5). Incremental external spend over 18 months —
gateway/rate-limiting infra, usage metering, docs/dev-rel, sandbox inference: ~**$30–60K**.

### 3.3 Standalone Donny assistant (value beyond the marketplace)

A separate Donny surface (web/app/chat) usable outside a campaign context. Incremental over 18
months beyond shared eng: separate product infra + light GTM: ~**$25–55K**.

**Donny R&D program — incremental external 18-month spend: ~$70–150K** (compute + platform infra
+ dev-rel). Everything else is the AI-developer FTE.

---

## 4. Mobile Apps — Apple App Store + Google Play

Capacitor **iOS Phase 1 is already shipped** (`docs/PROJECT_CONTEXT.md` §5), so the incremental
work is the **Android wrap** + store operations, not a rebuild.

| Item | Cost | Note |
|------|------|------|
| Apple Developer Program | **$99/yr** (indiv) / **$299/yr** (org) | [App Store fees 2026](https://splitmetrics.com/blog/google-play-apple-app-store-fees/) |
| Google Play Console | **$25 one-time** | [Play fee 2026](https://www.iconikai.com/blog/google-play-developer-account-fee-2026) |
| Cloud-Mac build (CI) | **$100–$250/mo** | GitHub macOS runners / MacStadium for iOS builds |
| Android Capacitor wrap | eng time (§5) | reuses the shipped web app + iOS scaffold |
| Store assets, QA, review cycles | ~$3–6K one-time | screenshots, listings, review iterations |
| **18-month incremental cash** | **~$5–10K** | excludes eng salary (in §5) |

**Commission note:** Apple/Google take **15–30%** of in-app purchases. DragonCandy's
**payments-split-by-surface** strategy (`docs/PROJECT_CONTEXT.md` §5) routes marketplace +
web subscriptions through Stripe to **avoid the 30% cut**, reserving the stores for native
value-adds (push/camera/share) that satisfy guideline 4.2.

---

## 5. Staffing (the requested roster, hybrid, phased over 18 months)

NYC-metro 2026 market context (base, for reference): front-end ~$140–209K, back-end ~$140–220K,
ML/AI ~$138–223K, security ~$160–225K, product ~$135–215K, DevOps/SRE ~$142–181K
([levels.fyi](https://www.levels.fyi/t/software-engineer/locations/new-york-city-area),
[Built In](https://builtin.com/salaries/us/new-york-city-ny/ai-engineer),
[ZipRecruiter](https://www.ziprecruiter.com/Salaries/Security-Engineer-Salary-in-New-York-City,NY),
[Glassdoor PM](https://www.glassdoor.com/Salaries/new-york-city-product-manager-salary-SRCH_IL.0,13_IM615_KO14,29.htm)).
We **model below median** (seed-stage; equity closes the gap, per the staffing plan).

| Role | Seed base modeled | FTE / contract | Loaded annual | Hired | Rationale / gate |
|------|------------------:|----------------|--------------:|-------|------------------|
| Back-End (DB/functionality) | $150K | FTE | ~$195K | Month 0–1 | Core build capacity beside Dame |
| Front-End (UX/UI) | $140K | FTE | ~$182K | Month 1–2 | Owns the <10-keystroke North Star surfaces |
| AI developer | $165K | FTE | ~$215K | Month 0–1 | Donny + the §3 super-agent program; highest leverage |
| App Administrator / DevOps | $135K | FTE (contract first) | ~$175K | Month 2–3 | Runs scaling, uptime, the auto-improvement agents |
| Security engineer | ~$150/hr | **fractional ~0.4 FTE** | ~$80–100K | Month 3 | Audits + ongoing review; ledger-first discipline |
| Product Manager | $90–120K | **contract → FTE** | ~$90–120K | Month 6 | Dame covers product early; formalize as surface area grows |
| Sales AE (under Joe) | $80K base | FTE, OTE ~$150–180K | ~$160K loaded OTE | Month 4–6 | **Gated:** hire only after paid acquisition shows signal |
| Auto-improvement agents | — | **compute, not headcount** | ~$1.5–3K/mo | Month 0 | Bug-find/fix, maintenance, auto-scaling, security/perf — runs under the AI dev + App Admin |
| Founders ×2 (Dame, Joe) | ~$90–110K ea | FTE | ~$120–140K ea | Month 0 | Modest during runway (staffing plan Stage 2) |
| Bookkeeper | — | part-time contract | ~$20–30K | Month 0 | per staffing plan Hire #3 |

**Why "auto-improvement agents" is a compute line, not a salary:** the staffing plan already
specifies AI agents that *"write routine code, run tests, scan for security problems 24/7, fix
simple bugs, handle updates and patches, monitor the app and alert if something breaks"* — the
work of *"4–6 developers"* done by *"2 developers + Damon"*. We fund that as **AI API/compute +
tooling (~$1.5–3K/mo)** owned by the AI developer and App Administrator. This is the lean plan's
core thesis turned into a budget line.

**Steady-state annual run-rate (fully ramped, loaded): ~$1.4M.**
**18-month people cost (phased ramp, ~80% average staffing): ~$1.6–1.8M.**

---

## 6. Sales

One **Account Executive** under Joe (CRO). 2026 SaaS AE benchmark: **base ~$60–100K (median
$75–82K), OTE 1.8–2.2× base**, commission ~11.5% of ACV, base/variable ≈ 53/47
([Everstage](https://www.everstage.com/sales-compensation/saas-sales-compensation-benchmarks),
[Founderpath](https://founderpath.com/salary-benchmarks/saas/account-executive)). Modeled:
**$80K base + commission, ~$150–180K OTE at quota, ~$104K loaded base.**

**Hire gate (lean rule #2):** *not* hired until founder-led selling + paid ads prove a repeatable
message — targeted **Month 4–6**. Reconciles with documented CAC
(`docs/DragonCandy_Pricing_Profitability_Briefing_v2.md` §5): restaurant CAC **$500–$1,500**
(4–6 mo payback), brand CAC **$1,500–$3,500** (3–5 mo) — both well under the **12-month** payback
kill-switch, and an AE carrying restaurants + brands clears the $500K-revenue-per-head rule at
quota.

---

## 7. Marketing — Sequenced 3-Metro Launch (Hoboken → Manhattan → Palm Beach)

Channel economics (`docs/DragonCandy_Pricing_Profitability_Briefing_v2.md` §5–6): cheapest first
— **creator referrals $50–200/restaurant (<1 mo payback)**, SEO $200–400, founder-led $300–600,
partnerships $500–1,000, **paid social $1,200–2,500 (9–12 mo payback)**. Documented launch-year
budget **$26–47K ($11–22K cash)**; Year-2 **$80–175K (~5% of revenue)**. 2026 paid-social rates:
**TikTok CPM $6–12 (F&B $6.33), CPC $0.50–1.50; Meta CPM ~$7–18, F&B CPC ~$0.52**; expect
**+40–60% in Q4**; NYC runs above national averages
([TikTok](https://benly.ai/learn/tiktok-ads/tiktok-ads-cost-benchmarks),
[Meta](https://sovran.ai/benchmarks/meta-ads-cost-by-industry-2026)).

**Strategy per metro (each gated on density before the next):**

| Metro | Phase | Why / character | Primary playbook | 18-mo budget |
|-------|-------|-----------------|------------------|-------------:|
| **Hoboken, NJ** | Launch (Mo 0–6) | Home turf; Joe's 70-yr hospitality family; lowest-CAC, founder-led | Hand-onboard 20–30 creators + 5–10 restaurants, referral bonuses, local launch events, PR | **$15–25K** |
| **Manhattan, NYC** | Scale (Mo 5–12) | Flagship; dense creator pool + high restaurant count; highest CPM | Density playbook + first real paid-social spend (TikTok/Meta) once Hoboken proves conversion; partnerships (Toast/Square) | **$60–120K** |
| **Palm Beach, FL** | Replicate (Mo 11–18) | Affluent, hospitality-heavy, **seasonal** (winter peak) — proves the copy-paste playbook in a new region | Documented playbook, creators-first, time paid spend to the season, events | **$30–60K** |
| Cross-metro | ongoing | SEO content engine (city landing pages), creator referral program, PR | AI-drafted, human-edited (Marketing agent) | **$25–45K** |

**18-month marketing total: ~$130–250K.** Sits between the documented launch-year and Year-2
budgets — appropriate for a *funded* three-metro push, still **~5–8% of forward revenue**
(industry-healthy is 10–20%). **Density gates** (3:1–5:1 creator:restaurant, 70%+ search-to-fill)
and **kill-switches** (CAC payback >12 mo, LTV:CAC <2:1) govern every escalation in spend.

---

## 8. 18-Month Consolidated Budget → Recommended Raise

| Category | 18-month cost | Source |
|----------|--------------:|--------|
| People (team + founders + bookkeeper, phased) | **$1.60–1.80M** | §5 |
| Infrastructure + dev tooling | **$50–75K** | §2 |
| Donny super-agent R&D (external) | **$70–150K** | §3 |
| Mobile apps (Apple + Google) | **$5–10K** | §4 |
| Marketing (3 metros, sequenced) | **$130–250K** | §7 |
| Legal / IP / fundraising (trademarks, provisional patents, corp) | **$40–75K** | Moat Playbook 90-day legal |
| G&A / ops / insurance / accounting (Hoboken office) | **$80–120K** | staffing plan |
| **Operating subtotal** | **~$2.0–2.5M** | |
| **Contingency + ~6-month buffer** | **~$0.6–0.9M** | de-risks the runway |
| **Recommended raise** | **$2.5M – $3.5M (target ~$3.0M)** | |

**Sanity checks:** (a) category lines sum to the operating subtotal; (b) the raise = operating
need + buffer; (c) AI spend stays **≤15% of revenue at every modeled user tier** (§2.3 — it sits
at 0.2–0.6% in the grounded tiers); (d) a ~$3M seed funding an 18-month, multi-metro, full-team
push against a Y1 $300–600K / Y2 $2–4.5M plan is standard and consistent with the staffing plan's
all-in cost ramp ($480–600K Y1 → $1.5–2M Y2).

### 8.1 Use of Funds (for the deck)

| Bucket | % | Amount (@ ~$3M) | Covers |
|--------|--:|----------------:|--------|
| **Engineering & Donny AI** | **50%** | ~$1.5M | Eng team (back/front/AI/app-admin/security), Donny super-agent R&D, infra + tooling, mobile apps |
| **GTM & metro expansion** | **30%** | ~$0.9M | Sales AE, 3-metro marketing, partnerships, founder/sales-led launch |
| **Working capital & G&A** | **20%** | ~$0.6M | Founder salaries, legal/IP, accounting, insurance, ops, runway buffer |

### 8.2 Valuation framing (founders finalize)

A ~$3M seed at **~$12–15M post-money** implies **~20–25% dilution** — the standard 2026 seed
band. The exact raise, valuation, and structure (priced round vs. SAFE) are a founder/market
decision; this model supplies the **defensible operating need**, not the term sheet.

---

## 9. What This Deletes / Simplifies / Automates *(per the operating playbook)*

- **Deletes:** ~15–25 roles a normal $7–12M-revenue org would carry — the auto-improvement agents
  and Donny do that work (staffing plan), so the raise funds a 9–11-person team, not 30.
- **Simplifies:** one capital plan reconciles infra, staffing, Donny R&D, mobile, sales, and a
  3-metro launch into a single 18-month number and a 50/30/20 split.
- **Automates:** the auto-improvement agents (bug-find/fix, maintenance, auto-scaling,
  security/perf) move from a 4–6-developer payroll line to a ~$1.5–3K/mo compute line.

---

## 10. Sources

**Repo (single sources of truth):** `docs/PROJECT_CONTEXT.md`,
`docs/DragonCandy_Infrastructure_Capacity_Report.md`,
`docs/DragonCandy_Pricing_Profitability_Briefing_v2.md`, `docs/STRIPE_PRICES.md`,
`docs/superpowers/specs/2026-04-28-org-chart-staffing-design.md`,
`docs/DragonCandy_Moat_Playbook.md`, `docs/wiki/analyses/north-star-kpi-scorecard.md`.

**External 2026 benchmarks:**
[levels.fyi NYC SWE](https://www.levels.fyi/t/software-engineer/locations/new-york-city-area) ·
[Built In AI engineer NYC](https://builtin.com/salaries/us/new-york-city-ny/ai-engineer) ·
[ZipRecruiter security engineer NYC](https://www.ziprecruiter.com/Salaries/Security-Engineer-Salary-in-New-York-City,NY) ·
[Glassdoor PM NYC](https://www.glassdoor.com/Salaries/new-york-city-product-manager-salary-SRCH_IL.0,13_IM615_KO14,29.htm) ·
[Everstage SaaS sales comp](https://www.everstage.com/sales-compensation/saas-sales-compensation-benchmarks) ·
[Founderpath AE benchmark](https://founderpath.com/salary-benchmarks/saas/account-executive) ·
[CloudZero Claude API pricing](https://www.cloudzero.com/blog/claude-api-pricing/) ·
[CloudZero OpenAI pricing](https://www.cloudzero.com/blog/openai-pricing/) ·
[SplitMetrics app-store fees](https://splitmetrics.com/blog/google-play-apple-app-store-fees/) ·
[Google Play fee 2026](https://www.iconikai.com/blog/google-play-developer-account-fee-2026) ·
[Spheron fine-tuning 2026](https://www.spheron.network/blog/how-to-fine-tune-llm-2026/) ·
[PricePerToken fine-tuning](https://pricepertoken.com/fine-tuning) ·
[Benly TikTok ad cost 2026](https://benly.ai/learn/tiktok-ads/tiktok-ads-cost-benchmarks) ·
[Sovran Meta CPM 2026](https://sovran.ai/benchmarks/meta-ads-cpm-by-industry).

*Confidential — For Internal Use & Investor Diligence · Prepared by the DragonCandy team, 2026-06-17.*
</content>
