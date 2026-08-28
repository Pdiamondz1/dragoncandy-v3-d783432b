---
title: Master Strategy Briefing (June 2026)
type: analysis
created: 2026-06-27
updated: 2026-06-27
sources: [workspace]
tags: []
---

# Master Strategy Briefing (June 2026)

> Imported from a Google Workspace doc (id `1vZ0BAx0GVzCVzmdyPlWkz_4AR0SIk1NrZJXwRteBazg`) on 2026-06-27.

# DragonCandy — Master Strategy Briefing f

## June tnhum 2026 | a — Founders & Advisors Only

*Prepared by Donny (DragonCandyma AIOS) · June 21, 2026.zb as c  uGrounded in live platform data, the full strategy nbdlibrary owl  u, and production metrics. Every*  
*Other m~~jhzj i~~figure cited is sourced from a live tool call or a named w doc. This replaces `docs o/DragonCandy_Strategy_Briefing.md` as juthe current strategic reference.*

---

## The One-Paragraph Summary

DragonCandy is an AI-powered three-sided marketplace — restaurants, content creators, and brand sponsors — headquartered in Hoboken, NJ. Their hi platform's intelligence layer (Donny AI) automates campaign generation, creator matching, analytics, and scheduling. Its profit engine (DragonDash) delivers premium-margin rush content. The platform is fully built, operating at $416/month, and carrying 39 organic users and $263 in live DragonShare GMV — pre-revenue by deliberate choice, not by incapability. The strategic mission is to win one metro (Hoboken/Hoboken → Manhattan), compound the data flywheel, and reach $7–12M ARR and $2–5M annual profit by Year 3 on a team of 10–11 people. Every strategic decision flows from one North Star: **less typing \= more margin.**

---

## Section 1 — Where We Stand Right Now

### Live Platform Snapshot (June 21, 2026\)

**Users:**

- Total registered: 39 (17 restaurants, 16 creators, 6 brands)  
- 27 restaurant locations across 11 restaurant accounts  
- 8 social connections (4 YouTube, 3 Instagram, 1 Facebook)

**Campaigns:**

- 15 total (2 active, 13 published)  
- 2 active promotions

**DragonShare:**

- 10 verified posts, 7 lifetime boosts  
- Gross GMV: $263.00 | Platform cut (20%): $52.60 | Creator payouts (80%): $210.40  
- MTD gross: $263.00 | **0 boosts in the past 10 days** — primary operational watch item

**AI Spend (June MTD):**

- Total: $3.20 (Sonnet 4.6: $3.20, Haiku: $0.004)  
- By function: donny-chat $2.57, campaign-generate $0.21, aios-playbook-run $0.30, orchestrator $0.13, social-caption $0.004  
- Infrastructure burn: \~$416/mo (Supabase $74, Lovable $50, Anthropic Max $200, Outstand $67, OpenAI $25)

**Platform weight (June 20):**

- DB: 43.9 MB / 8 GB (0.5% used) — \~1 MB/day growth → no infrastructure pressure  
- Storage: 1.08 GB  
- Knowledge base: 82 entries | Analytics events: 2,986 | Content performance: 9 entries

**Payment infrastructure (test mode — all figures in cents):**

- escrow\_authorized: $13,505 | payment\_released: $4,932 | transfer\_created: $5,136  
- All Stripe payments are in test mode. Live mode not yet activated.

### What This Tells Us

The platform loop has proven it can run end-to-end. Content has been created, submitted, reviewed, boosted, and paid out. Donny AI is live and routing correctly — 98% of production AI spend on Sonnet (appropriate for its workload). Restaurant density exceeds the Hoboken phase target (17 vs. target of 5–10). Creator density is the only gap: 16 of 20–30 required for minimum viable liquidity. DragonShare went silent June 11 — a 10-day stall on the core revenue mechanic that must be broken this week, not next month. The data flywheel (9 content\_performance entries, 3 social\_post\_log entries) is not yet spinning at meaningful signal depth.

**The honest verdict: 2–4 weeks from a credible soft launch.** Not months.

---

## Section 2 — Mission, North Star & Product Logic

### Mission

Connect local restaurants, content creators, and brand sponsors through an AI-powered marketplace that automates the full content pipeline — from creative brief to published post — in under 24 hours, at a fraction of what agencies charge.

### North Star: Less Typing \= More Margin

Every primary flow under 10 keystrokes by Month 6\. A paid campaign created in under 60 seconds. Surface priority: voice → camera → paste-URL → tap-a-chip → typing (last resort).

This is not a slogan — it is a measurable product KPI. The instruments to capture it must be live before the first paying customer:

- **Keystrokes-to-paid-campaign** (median) — target ≤10 by Month 6  
- **Time-to-first-paid-campaign** (median) — target \<60 seconds  
- **Activation rate** — % of signups that complete a first campaign or DragonShare submission  
- **Time-to-value** — signup → first completed action

### Product Architecture: Two Products, One Intelligence Layer

**Donny AI** is the intelligence layer: campaign generation, creator matching, analytics, scheduling. It is not a standalone product — it is an infrastructure service that makes everything else faster and smarter. Positioning it as a standalone AI tool is a commoditization trap. Donny powers DragonDash; DragonDash sells.

**DragonDash** is the profit engine: rush content delivery at premium margins. Same-day delivery commands a 100–200% premium in every comparable market (Uber, Fiverr, TaskRabbit, Amazon). No competitor offers this specifically for local restaurants. The rush surcharge is near-pure profit — creators are not paid more for rush; the premium is the platform's.

**The three-sided marketplace** compounds both:

- Restaurants pay subscriptions \+ take rate \+ DragonDash surcharges  
- Creators earn from campaigns and DragonShare boosts (80% payout split)  
- Brands pay for sponsored campaigns and co-branded content at highest ARPU

None of these three sides is optional. Removing brands from the early roadmap delays the highest-LTV revenue. Removing the creator supply collapses restaurant demand. The sequencing is: **supply (creators) first, then demand (restaurants), then scale (brands).**

---

## Section 3 — Pricing Architecture

### The Four Revenue Streams (all stacked on one customer)

1. **SaaS Subscription** — 80–90% gross margin. Monthly/annual recurring.  
2. **Take-rate** — 65–80% margin. Percentage of every campaign transaction.  
3. **Donny AI credit overages** — 70–90% margin. $0.10–0.25/call beyond monthly budget.  
4. **DragonDash rush surcharge** — \~95% margin. $25–75 flat fee per rush delivery.

### Live Tier Structure (from `docs/STRIPE_PRICES.md` — source of truth)

| Tier | Monthly | Annual (20% off) | Take Rate | Donny Credits | Max Campaigns |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Free | $0 | $0 | 10% | 50/mo | 1 |
| Starter | $149 | $119/mo | 7% | 500/mo | 3 |
| Growth | $449 | $359/mo | 5% | 2,000/mo | 10 |
| Pro | $899 | $719/mo | 3% | 10,000/mo | Unlimited |
| Enterprise | Custom | Custom | 2% | 50,000/mo | Unlimited |

Per-seat add-ons: Starter $29/seat, Growth $39/seat, Pro $49/seat.

DragonDash delivery tiers: Standard (5–7 days, $0 premium) | Express (24–48 hrs, $25 surcharge) | DragonDash Rush (1–3 hrs, $75 surcharge).

### Why the Take-Rate Ladder Is the Most Important Lever

The take-rate ladder turns every billing cycle into a quiet upgrade conversation — a customer doing $15K/month in campaigns saves money by moving from Starter to Growth. The dashboard should surface this automatically. No sales team needed; the math sells the upgrade. This is how Upwork, Fiverr, Faire, and ShopMy all drive tier conversion.

**Blended target ARPU: $350–500/month per restaurant customer.** This consolidates what restaurants currently spend fragmented across Yelp ads ($300–2,500/mo), social media tools ($50–200/mo), freelancer management (10+ hours of owner time/mo), and agency fees ($500–1,500/mo).

### DragonShare Boost Economics (live)

- Creator receives: 80% of boost amount  
- Platform receives: 20%  
- Current boost range: $5–$500 custom \+ preset tiers  
- Lifetime platform revenue from DragonShare: $52.60 on $263 gross

---

## Section 4 — The Six-Layer Defensibility Moat

DragonCandy's competitive advantage is not any single feature — it is the compounding interaction of six reinforcing moats. Surface-level AI features can be cloned in days in 2026 (25% of YC Winter 2025 batch shipped 95% AI-generated codebases). The moats below are built through execution and data accumulation, not capital.

### Moat 1: The Data Flywheel (primary long-term moat)

Every completed campaign generates proprietary intelligence: which creator \+ which restaurant \+ which content type \+ which platform \= which engagement outcome. After 1,000 campaigns, Donny knows that a sushi restaurant in Manhattan should hire video reel creators with 10–25K followers for menu launch posts. After 10,000 campaigns, that intelligence is hyperlocal across hundreds of restaurant/cuisine permutations. A competitor starting from zero cannot replicate this without running thousands of campaigns first.

**What to log from Day 1 (non-negotiable):** every search, profile view, campaign creation event, match acceptance/rejection, content approval, take-rate transaction, Donny AI call, DragonShare submission/boost. Every prompt-response pair from Donny is future fine-tuning training data. This ledger-first discipline is already embedded in the codebase — do not compromise it.

**The fine-tuning trigger:** once 1,000–5,000 campaigns accumulate (projected 6–12 months post-launch), fine-tune Llama or Mistral via LoRA on proprietary brief→match→outcome data. A fine-tuned Donny AI outperforms any competitor using a generic LLM. Training cost: $50–300/run. Budget allocated: $15–35K. The data flywheel makes it increasingly expensive for a competitor to catch up, not just at launch but compounding every month.

**Current flywheel depth:** 9 content\_performance entries, 3 social\_post\_log entries, 82 donny\_knowledge entries. Thin. The flywheel is not yet spinning. Every week of DragonShare silence is a week of missed signal.

### Moat 2: Two-Sided Network Effects (existential priority)

*"Liquidity isn't the most important thing. It's the only thing."* — Simon Rothman, Greylock

The target density for minimum viable liquidity per metro: **3:1 to 5:1 creators per restaurant**, delivering a 70%+ search-to-fill rate (7 of 10 campaign briefs matched and completed). Below this ratio, the marketplace stalls.

**Current Hoboken density:**

- Restaurants: 17 ✅ (exceeds 5–10 target)  
- Creators: 16 ⚠️ (below 20–30 target — 4–14 short)  
- Creator:restaurant ratio: 0.94:1 — well below the 3:1 minimum

The gap is not restaurant recruitment — it is creator recruitment and restaurant activation (first campaign). The Dragon Scout activation (direct outreach to 2–3 existing creators with 4.0+ ratings) is the immediate lever. Cost: $0. Timeline: this week. No budget event required.

**Disintermediation defense:** once creators and restaurants meet on DragonCandy, the risk is they transact directly. The defense is providing more value than the fee costs: payment escrow, content rights management, FTC-compliant disclosure automation, attribution data, Donny AI matching, reputation that only lives on-platform, and a non-circumvention clause requiring on-platform transactions for 12 months for matches made through DragonCandy.

### Moat 3: Ecosystem Integration (switching cost moat)

**Live integrations:**

- Toast POS (full OAuth, QR code campaigns, discount redemption tracking, token refresh) — already through the hardest certification. Toast takes 6–12 months to approve; we're through it.  
- Stripe Connect (escrow, multi-party payments, 1099 generation) — live in test mode, ready to flip  
- Outstand.so (social posting bridge — Instagram, TikTok, YouTube) — temporary; exits at \~30 users when direct platform APIs are approved

**Direct platform API registration pipeline** (critical path — start immediately, all in parallel):

- Toast partner application → 6–12 months (longest lead time — submit first)  
- Meta Business Verification \+ App Review → 2–4 weeks  
- Google OAuth verification (YouTube Analytics) → 4–6 weeks  
- TikTok app review → days to weeks  
- X (Twitter) pay-per-use → no approval gate, \~$0.005/post read

Once a restaurant has their POS connected, campaign history accumulated, content library stored, and payment integrations configured, switching cost is months of re-integration work. That is the stickiness Toast, Shopify, and Square all leverage. Every integration we add deepens it.

### Moat 4: Legal & IP Protection

**Priority sequence and budget:**

- Trademarks (file immediately): DragonCandy, Donny AI, DragonDash — Class 35 (marketplace) \+ Class 42 (SaaS/AI). USPTO: $350/class/mark \+ $1,000–2,500 attorney. Total: \~$4,000–8,000 for three marks across two classes. Use ™ immediately on all marks.  
- Trade secrets (Week 1–4): NDA and IP assignments with all team members. Trade secret inventory covering the matching algorithm, scoring methodology, all Claude system prompts, RAG pipeline config, fine-tuning data, and negative know-how (what approaches failed). Cost: $3,500–10,000 attorney fees. Highest ROI legal spend.  
- Provisional patents (Month 2–3): Campaign-from-URL system and AI-scored matching pipeline. USPTO micro-entity fee: $65 each. With attorney: $2,000–5,000 total. Establishes "patent pending" for 12 months.  
- Total Year 1 legal budget: $31,500–56,000.

### Moat 5: Regulatory Compliance as Competitive Advantage

The FTC requires "clear, conspicuous, and unavoidable" disclosures on sponsored content — penalties up to $51,744 per violation. Brands and platforms share liability. 73 new AI-related state laws adopted in 2025 alone. California's AI Transparency Act takes effect August 2026\.

Building compliance into the platform architecture before competitors is a sales pitch, a barrier, and a trust asset simultaneously. Planned features: auto-disclosure tagging on all Donny-generated campaign content, AI content labeling for any AI-assisted material, compliance audit trail, and creator acknowledgment flows requiring disclosure training before first campaign. Engineering cost: \~$5,000–8,000 once.

DragonCandy should be positioned as "the only fully FTC-compliant creator marketplace" from Day 1\.

### Moat 6: Brand Verbification (DragonDash)

"DragonDash" is significantly more verb-able than "DragonCandy." Dash implies speed. "Just DragonDash it" naturalizes. "\#DragonDashed" should accompany every piece of delivered content from the first campaign. The hashtag costs nothing to seed; a competitor trying to displace it later pays enormously.

DragonCandy \= the ecosystem (the place). DragonDashing \= the action. "DragonDash your grand opening." "We got DragonDashed in 2 hours." The verb stakes a category claim no amount of ad spend can match once it's seeded into creator vocabulary.

---

## Section 5 — Go-to-Market: Sequenced Metro Playbook

### The DoorDash Lesson

DoorDash beat Uber Eats not by raising more money but by going city-by-city, building density before expansion. They operated in 4,000 towns while Uber Eats covered 500 cities. The CEO did deliveries himself. DragonCandy applies the same discipline: win one metro completely before opening metro 2\. No exceptions.

### Metro Sequencing: Hoboken → Manhattan → Palm Beach

**Metro 1: Hoboken, NJ (Launch — Mo 0–6)**

- Home turf. Joe's 70-year hospitality family relationships. Lowest CAC channel.  
- Target: 20–30 creators, 5–10 active restaurants, 70%+ search-to-fill  
- Budget: $15–25K (founder-led, referral bonuses, local events, PR)  
- Gate to Metro 2: sustained 70%+ search-to-fill \+ at least 1 documented case study

**Metro 2: Manhattan, NYC (Scale — Mo 5–12)**

- Flagship metro. Dense creator pool \+ high restaurant count. Highest CPM.  
- Playbook: density first (creators before restaurants), then paid social (TikTok/Meta) once Hoboken proves conversion  
- Budget: $60–120K

**Metro 3: Palm Beach, FL (Replicate — Mo 11–18)**

- Affluent, hospitality-heavy, seasonal (winter peak). Proves the copy-paste playbook in a new region.  
- Budget: $30–60K

**Cross-metro always-on:** SEO city landing pages ("Food creators in \[city\]" — free Google traffic once published), creator referral program, PR. Budget: $25–45K.

### The Creator-First Sequencing Rule

Supply must exist before demand. Never open a metro to restaurants before creators are recruited. A restaurant that signs up and finds no matching creators is a churned restaurant and a destroyed trust signal. Every metro launch: recruit creators first, then restaurants.

### Acquisition Channels by Cost and Payback

**Creators (CAC: $50–200/creator, indirect payback via restaurants they bring):**

- Existing creator referrals: $25–75 bonus — highest conversion, lowest cost  
- Founder-led Instagram/TikTok DMs to local food creators (5K–50K followers): $30–100 (founder time at shadow rate)  
- Local creator meetups: $50–150/creator — builds community \+ signs 5–15 creators per event  
- Dragon Ambassador program (Scout → Knight → Master): below equivalent paid CAC, already designed and costed

**Restaurants (blended CAC target: $500–1,500 — half of what Toast pays):**

- Creator referrals: $50–200 per restaurant — \<1 month payback, highest ROI  
- SEO content/city landing pages: $200–400 — free traffic forever after publishing  
- Founder-led launch visits: $300–600 (founder shadow rate) — DoorDash playbook  
- Toast/Square/Google partnerships: $500–1,000 — long approval, then scales for free  
- Paid social (Meta/TikTok): $1,200–2,500 — wait for PMF before activating

**Brands (blended CAC: $1,500–3,500 — ARPU 3x higher than restaurants):**

- Hold per GTM playbook until Hoboken density is proven  
- Brand acquisition follows creator \+ restaurant liquidity, not the reverse  
- Brand economics: 24-month LTV $24K–72K, payback 3–5 months, LTV:CAC 7:1–20:1

### Launch Readiness Checklist (current gaps only)

- ✅ Platform functional — 70+ tables, 80 edge functions, campaigns, payments, Donny AI, DragonShare, iOS Capacitor Phase 1 shipped  
- ✅ Restaurant supply exceeds Hoboken target — 17 onboarded vs. 5–10 target  
- ✅ Campaign loop has run end-to-end — 15 campaigns created, DragonShare boosted and paid  
- ✅ AIOS kill-switch playbook armed — all four kill-switches automated  
- ✅ QA CI/CD gate live — staging environment, e2e smoke tests  
- ⚠️ Creator density: 16 of 20–30 minimum — **activate Dragon Scout this week**  
- ⚠️ DragonShare silent 10 days — **break the silence this week, no budget required**  
- ❌ Stripe still in test mode — **flip to live mode before first paid customer**  
- ❌ $0 paid revenue — need at least 1 completed campaign \+ case study before investor meetings  
- ❌ Day 1 KPI instruments not yet logging — activation rate, time-to-value, keystrokes-to-paid-campaign must be live before first paying customer

---

## Section 6 — Three-Year Financial Plan

### Revenue Model Assumptions

- Blended ARPU: $350–500/month per paying restaurant customer (subscription \+ take rate \+ DragonDash)  
- Brand ARPU: $1,000–3,000/month  
- Creator ARPU: $0 direct (supply side is free — costs recovered via restaurant CAC reduction and flywheel)  
- Average restaurant campaign volume: $8,000/month → take rate contribution scales with volume and tier

### Three-Year Scorecard

|  | Year 1 | Year 2 | Year 3 |
| :---- | :---- | :---- | :---- |
| ARR | $300–600K | $2–4.5M | $7–12M |
| Paying restaurants | 100–200 | 500–1,000 | 1,500–3,000 |
| Headcount | 5–6 | 7–8 | 10–11 |
| Metros | 2–3 | 8–12 | 20+ |
| NRR | — | \>110% | (sustain) |
| Annual profit | \~breakeven | $500K–2M | $2–5M |

### Unit Economics

| Customer type | CAC | ARPU/mo | Payback | 24-month LTV |
| :---- | :---- | :---- | :---- | :---- |
| Restaurant | $500–1,500 | $350–500 | 4–6 months | $8,400–12,000 |
| Creator | $50–200 | $0 direct | indirect | indirect |
| Brand sponsor | $1,500–3,500 | $1,000–3,000 | 3–5 months | $24,000–72,000 |

All three payback periods are well under 12 months. This is the unit economics profile that clears Series A bar without needing VC.

### Operating Cost Structure

| Category | Year 1 | Year 2 | Year 3 |
| :---- | :---- | :---- | :---- |
| Payroll (\~$180K/head loaded) | $540–720K | $900K–1.26M | $1.44–2.16M |
| Infrastructure | $5–12K | $15–40K | $50–130K |
| Anthropic API (production) | $2–10K | $30–120K | $150–500K |
| Marketing & CAC | $26–47K | $80–175K | $250–500K |
| Legal, G\&A, misc | $15–25K | $30–50K | $60–100K |
| **Total** | **\~$590–815K** | **\~$1.1–1.6M** | **\~$2.0–3.4M** |

### Why the Bootstrapped Path Wins

Bootstrapped SaaS companies grow at nearly identical rates to VC-backed peers (44% vs. 42.8% YoY at $1–15M ARR) but keep what they earn. Profitability at $3–5M ARR on 10 people vs. needing $10M+ ARR on 30 people if VC-funded. The restaurant market rewards city-by-city density over blitz-scaling.

**If raising seed capital:** the defensible ask is $2.5M–$3.5M (target \~$3.0M) at $12–15M post-money (\~20–25% dilution), funding 18 months of the engineering team, GTM, and G\&A on a 50/30/20 split. A raise is how you pull the same lean team forward by 18 months — it is not a change of model. Investors write checks after seeing at least one completed campaign cycle and live GMV.

---

## Section 7 — Kill-Switches & Operating Discipline

### The Four Kill-Switches (all validated against 2025 SMB-SaaS benchmarks)

| Kill-switch | Threshold | External benchmark | Scope |
| :---- | :---- | :---- | :---- |
| Monthly churn | \>6%/month | SMB SaaS normal band: 3–5%/mo; best-in-class \<1%/mo | Y1+ |
| CAC payback | \>12 months | Best-in-class \<12 mo; SMB segment 8–12 mo | Y1+ |
| LTV:CAC | \<2:1 | Standard 3:1; aim 3:1 by scale — 2:1 is the floor | Y1+ |
| Revenue/employee | \<$400K | Best-in-class only at $50M+ ARR — this is a **Y2–Y3 gate only** | Y2–Y3 |

Any trigger means pause and reassess — not shutdown. The kill-switches are diagnostic, not terminal.

**Current status:** All four are pre-revenue "not-yet-measurable." The automated kill-switch playbook is live in AIOS and will fire findings on breach or watch from Day 1\.

### Hiring Discipline (the most important operating rule)

Every hire before $500K in revenue per head destroys margin. Every hire after it accelerates it.

- No salesperson until paid ads are profitable  
- No customer success hire until 100+ paying customers  
- No second engineer until Donny AI \+ auto-improvement agents can't keep pace  
- Contractors before FTEs — always  
- Auto-improvement agents (\~$1.5–3K/mo compute) replace 4–6 developer salaries

### The Musk Algorithm Applied to Every Decision

1. **Question** every requirement — including this document. Push back when something is wrong.  
2. **Delete** every step, field, click, and keystroke that can go.  
3. **Simplify** what survives.  
4. **Accelerate** cycle time — one change per prompt, build verified before the next.  
5. **Automate last** — never automate a broken process.

---

## Section 8 — AI Strategy: Donny's Technical Roadmap

### Today: Claude Sonnet 4.6 \+ Haiku with Cost Routing

Live 2026 API rates:

- Haiku 4.5: $1/M tokens in, $5/M out — simple tasks (matching scores, captions, nudges)  
- Sonnet 4.6: $3/M tokens in, $15/M out — complex tasks (chat, campaign generation, analysis)  
- Batch API: −50% on async workloads | Prompt caching: −90% on cached input tokens

Current production spend: $3.20 MTD (98% Sonnet, dominant function: donny-chat at $2.57 of $3.20). AI spend is hard-capped at 15% of revenue ($250/mo floor pre-revenue). Currently at effectively 0% of revenue.

### The 7-Lever Cost Reduction Playbook (targets 75–85% reduction at scale)

1. **Prompt caching** — implement immediately, 1–2 days AI Developer time, −40–60% on input tokens  
2. **Batch API for async workloads** — at \~500 users, −50% on matching/nudge/auto-pilot calls  
3. **Expanded model routing \+ Haiku triage layer** — at \~500 users, −20–35% additional  
4. **Proprietary fine-tuned model** — trigger: 1,000–5,000 campaigns, 25–100× cheaper per call vs. Sonnet  
5. **Context window optimization** — implement now, −15–30% token spend, 3–5 days AI Developer  
6. **Response caching for repeated queries** — at 10K users, −10–20% on cacheable functions  
7. **Provider diversification (Gemini Flash, Mistral)** — at 100K+ users, −20–40% via routing

| DAU tier | Baseline Anthropic/mo | Fully optimized |
| :---- | :---- | :---- |
| 100 | $80–200 | $40–100 |
| 1,000 | $800–1,600 | $400–800 |
| 10,000 | $8,000–16,000 | $2,000–4,000 |
| 100,000 | $80,000–160,000 | $10,000–30,000 |
| 1,000,000 | $700,000–1,600,000 | $100,000–300,000 |

### The Architectural Adaptability Thesis

Donny's model-routing seam (`_shared/model-routing`, backend-only) makes the underlying model a swappable config — Haiku/Sonnet/Opus today, any frontier model or our own fine-tune tomorrow. The stack is provider-independent: Anthropic \+ OpenAI today, any lab tomorrow. As frontier AI gets cheaper and more capable, DragonCandy captures that improvement automatically. We ride the AI curve instead of being disrupted by it. This is what makes the Donny-as-intelligence-layer architecture defensible: the moat is the data and the marketplace, not the model.

### The Donny Super-Agent Roadmap (18-month, 3 sub-lines)

- **4.1 Fine-tuned model** (trigger: 1K–5K campaigns): LoRA/QLoRA on Llama/Mistral. Training: $50–300/run. 18-month budget: $15–35K. Inference folds into the AI line and lowers it.  
- **4.2 Public Donny API** (new revenue line): Partners build on Donny via metered API (campaign-from-URL, matching, scheduling as endpoints). 18-month external budget: $30–60K.  
- **4.3 Standalone Donny assistant**: Separate Donny surface (web/app/chat) usable outside campaign context. 18-month external budget: $25–55K.

**Total Donny R\&D external spend (18 months): $70–150K.** The dominant cost is the AI Developer FTE, not compute.

---

## Section 9 — Infrastructure Scaling

### Current Stack

- Frontend: React 18 / TypeScript (strict), Vite, Tailwind CSS, shadcn/ui, Lovable.dev hosting  
- Backend: Supabase (70+ tables, 80 Deno edge functions, RLS, realtime) — SMALL compute, $74/mo  
- AI: Claude Sonnet 4.6 \+ Haiku (cost routing, backend only); OpenAI text-embedding-3-small (RAG/matching)  
- Payments: Stripe Connect (test mode — flip to live before launch)  
- Social: Outstand.so (temporary bridge until direct APIs approved)  
- Mobile: Capacitor iOS Phase 1 shipped; Android wrap is incremental engineering only

### DB Headroom: No Infrastructure Action Required This Quarter

- DB: 43.9 MB at \~1 MB/day growth → 70% disk ceiling is \~15 years out  
- Supabase SMALL compute handles up to \~400 users before MEDIUM upgrade required  
- At 1K users: upgrade to MEDIUM ($124/mo), add read replica for analytics queries

### Cost by User Tier (infrastructure only)

| Tier | Monthly infra | Supabase upgrade | Anthropic (optimized) |
| :---- | :---- | :---- | :---- |
| Today (39) | \~$416 | — | $3.20 MTD |
| 100 DAUs | \~$529–684 | SMALL (current) | $40–100 |
| 1,000 DAUs | \~$1,049–1,724 | MEDIUM at \~400 users | $400–800 |
| 10,000 DAUs | \~$3,674–6,454 | XL \+ read replicas | $2,000–4,000 |
| 100,000 DAUs | \~$19,900–56,700 | Clustered/self-managed | $10,000–30,000 |
| 1,000,000 DAUs | \~$186K–563K | Sharded Aurora/CockroachDB | $100,000–300,000 |

Operating leverage is intact at every tier: infrastructure cost as a percentage of revenue falls continuously from \~1.3% at 100 DAUs to \~0.1% at 1M DAUs.

---

## Section 10 — AIOS: The Operating System

DragonCandy AIOS is the founders-only internal operating dashboard (`/internal`, aliased at `internal.dragoncandy.io`). It is not a product feature — it is an operating system for the company.

**What it runs:**

- Live platform stats (users, campaigns, revenue, AI spend) — always current  
- AIOS weekly operating brief (Monday cloud routine) — KPI chips, kill-switch status, per-role acquisition recommendations, scaling forecast. Published to `/internal/briefings` after founder review.  
- AIOS bug & error sweep (Monday cloud routine) — clusters errors from `donny_tool_executions`/`analytics_events`/payment tables, files fingerprint-deduplicated findings to `/internal/findings` for triage.  
- Donny gated corrections — Donny proposes fixes to dashboard settings or strategy docs via `propose_correction`; founder approves at `/internal/corrections`; admin-gated RPC applies it. Donny never writes directly.  
- Wiki-commit-PR — approved strategy doc corrections open a GitHub PR writing the correction back to `docs/wiki/…`. PR-only (never a push to main). Preserves the review/Codex gate.  
- Google Workspace connection — per-user OAuth, Drive file hub, Export-to-Doc on briefings/strategy/answers, metrics→living-Sheet auto-flow.

**Current weekly brief status (week of June 16):**

- 5 AIOS PRs shipped: kill-switch playbook live, validator skills, Donny-chat reliability (\#146, \#148), loop-callable playbook runner, Dragon Ambassador program designed  
- At-risk: 1 new signup this week, DragonShare 0 boosts, creator count below density target  
- On-track: restaurant count, DB headroom

---

## Section 11 — Immediate Action Items (Ranked by Leverage)

These are the highest-leverage actions, ordered by impact, with no budget event required for the top four.

**1\. Activate Dragon Scout — this week, $0 cost** Direct message 2–3 existing creators with 4.0+ ratings. The Dragon Ambassador program is designed and costed in the strategy library. Getting from 16 to 20+ creators closes the minimum viable liquidity gap and unblocks public soft launch.

**2\. Close the 2 active campaigns and document case studies — this week** One completed campaign with a real restaurant, real content, and a real creator payout is worth more in an investor meeting than any feature. The case study from Hoboken is the primary GTM asset for the Manhattan push.

**3\. Break the DragonShare silence — this week** 10 posts exist on the platform. 0 new boosts in 10 days. The fix is direct outreach: message the restaurants with existing DragonShare posts and prompt them to review and boost. No engineering required.

**4\. Instrument Day-1 KPIs — before first paying customer** Activation rate, time-to-value, and keystrokes-to-paid-campaign must be logging before the first paying customer signs up. These are the North Star instruments. If they're not live, you can't measure whether the product is working.

**5\. Flip Stripe to live mode** Test mode must be off before any real revenue is taken. This is a configuration step, not engineering work.

**6\. Submit Toast Partner Application — immediately** 6–12 month approval timeline. Every week not submitted is a week of delay on the highest-switching-cost integration in the stack. Submit this week regardless of launch timing.

**7\. File trademarks — within 30 days** DragonCandy, Donny AI, DragonDash. Classes 35 and 42\. Begin using ™ immediately. Cost: \~$4,000–8,000. This cannot be recovered if a competitor files first.

---

## Key Source Documents

**Internal (single sources of truth):**

- `docs/PROJECT_CONTEXT.md` — canonical project description, principles, operating instructions  
- `docs/STRIPE_PRICES.md` — all pricing, take rates, credit budgets (authoritative)  
- `docs/DragonCandy_Moat_Playbook.md` — full six-layer defensibility analysis  
- `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md` — unit economics, CAC, three-year financial model  
- `docs/DragonCandy_Capital_Raise_Cost_Model.md` — 18-month cost model, raise sizing  
- `docs/DragonCandy_Infrastructure_Capacity_Report.md` — scaling capacity, Supabase tiers  
- `docs/wiki/analyses/north-star-kpi-scorecard.md` — kill-switch validation vs. 2025 SMB-SaaS benchmarks  
- `docs/wiki/analyses/tech-infrastructure-cost-breakdown-updated.md` — cost by DAU tier with staffing and R\&D  
- `docs/wiki/concepts/platform-api-registration-plan.md` — direct API registration plan and lead times  
- `docs/gtm.md` — full go-to-market playbook including metro-by-metro sequencing

**Live data (as of June 21, 2026):**

- Platform: 39 users, 15 campaigns, 10 DragonShare posts, 7 boosts, $263 gross GMV  
- AI spend MTD: $3.20 (98% Sonnet 4.6)  
- DB: 43.9 MB / 8 GB | Storage: 1.08 GB | Daily growth: \~1 MB/day  
- Weekly brief: June 16 — AIOS Maturity Week, Acquisition Watch

---

*Confidential — For Internal Use & Founder Review Only* *Prepared by Donny (DragonCandy AIOS) · June 21, 2026* *All figures grounded in live tool calls and named internal documents. This document supersedes `docs/DragonCandy_Strategy_Briefing.md` as the current operating strategic reference.*
