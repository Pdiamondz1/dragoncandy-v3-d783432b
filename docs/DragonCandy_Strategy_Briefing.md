# DragonCandy Strategic Briefing: Defensibility, Profitability, and Operational Execution

## Executive Summary
DragonCandy is an AI-powered marketplace designed to connect local restaurants with content creators, utilizing a high-efficiency, bootstrapped model to achieve significant market defensibility and profitability. The platform's core value proposition lies in its "Donny AI" integration, which automates creator matching and campaign management, providing a "command center" for restaurant marketing. 

The strategic roadmap targets profitability within three years by maintaining a lean team and stacking multiple high-margin revenue streams, including SaaS subscriptions, marketplace take rates, and AI-driven "rush" services. Defensibility is established through a six-layer "moat" strategy focusing on proprietary data flywheels, hyperlocal network effects, and deep restaurant workflow integrations (POS systems). This document outlines the path from a 90-day production launch to long-term market dominance.

---

## Detailed Analysis of Key Themes

### 1. The Six-Layer Defensibility Moat
DragonCandy’s competitive advantage is built on compounding interactions rather than a single feature. Because surface-level AI features are easily cloned—evidenced by the fact that 25% of YC Winter 2025 startups used 95% AI-generated code—DragonCandy prioritizes moats built through execution and data accumulation.

| Moat Dimension | Strategic Focus |
| :--- | :--- |
| **Data Flywheel** | Utilizing restaurant-creator matching data to improve Donny AI. Incremental data (cuisine type, content format, performance) makes the platform harder to replicate. |
| **Network Effects** | Achieving "minimum viable liquidity" (3:1 to 5:1 creator-to-restaurant ratio) in specific metro areas to ensure a 70%+ search-to-fill rate. |
| **Ecosystem Integration** | Becoming the "connective tissue" for restaurants by integrating with Google Business, Meta, TikTok, and eventually POS systems like Square and Toast. |
| **Legal Protections** | A sequenced strategy: Trademarks (immediate), Trade Secrets (algorithm weights/prompts), and Provisional Patents (technical data flows). |
| **Regulatory Advantage** | Building automated FTC disclosure compliance and AI transparency into the architecture to attract risk-averse brands. |
| **Brand Verbification** | Establishing "DragonDash" as the verb for rapid content delivery, creating a high-speed value proposition separate from the "DragonCandy" ecosystem brand. |

### 2. Profitability and Financial Architecture
The strategy emphasizes high revenue per employee to remain "default alive" without venture capital.

> **Corrected 2026-08-26 — this paragraph carried a THIRD three-year number.** It said DragonCandy
> "aims for $5–8M ARR with a net profit margin of 20–40%" and "$1M+ per head", while §"Profitability
> Milestones" below said $7–12M and `PROJECT_CONTEXT.md` §3 said $7–12M — three figures in two
> places in one document, none of them derived from anything. All are now superseded by the
> bottom-up model: **Year 3 exit ARR ~$4.7M, $3.34M booked** (`src/pitch/model/`). Against the
> registered $2.2–3.8M Year 3 cost band, net margin runs **−14% to +34%**, so the old 20–40% was the
> optimistic edge of a range that includes losses. Revenue per employee is **$431–474K on exit ARR,
> $304–334K on booked**, not $1M+ — though note the benchmark that matters: the private-SaaS median
> is ~$130K and ~$100K in the $1–3M ARR band ([[North Star & KPI Scorecard]]), so the real figure is
> roughly 3× the norm for this size, and $1M+ per head was never a stage-appropriate target.

*   **Four Revenue Streams:**
    1.  **SaaS Subscriptions:** Free / $149 / $449 / $899 / Enterprise tiers with 80–90% gross margins. See `docs/STRIPE_PRICES.md` for current pricing.
    2.  **Marketplace Take Rates:** 2–10% tiered take rate on creator deals (65–80% margins).
    3.  **AI Premium Features:** Credit-based pricing for Donny AI interactions (70–90% margins).
    4.  **DragonDash Rush Premiums:** $25–$75 delivery premiums plus platform-count-based rush surcharges.
*   **The Restaurant Wedge:** Average restaurants spend $2,000–$4,000 monthly on marketing. DragonCandy seeks a blended ARPU of $350–$500 by consolidating disparate costs (social media management, photography, and outreach) into one platform.

### 3. Product Strategy and "Elon’s Algorithm"
To accelerate launch and improve user experience (UX), the platform applies a simplification framework to its current 8-screen architecture:
*   **Question Requirements:** Eliminate features like in-app phone calls and redundant landing page cards.
*   **Delete Steps:** Move from a 9-step manual browsing flow to a 6-step AI-driven flow where Donny AI handles matching automatically.
*   **Simplify:** Adopt professional dashboard patterns optimized for the 5-minute windows available to busy restaurant owners.

### 4. Technical Evolution: From Prompt Engineering to Fine-Tuning
The platform's AI strategy follows a phased technical progression:
*   **Launch Phase:** Using Claude Sonnet 4 with prompt engineering and RAG (Retrieval-Augmented Generation).
*   **6–12 Months:** Transitioning to fine-tuned small models (Llama or Mistral via LoRA) once the platform accumulates 1,000–5,000 high-quality campaign records.
*   **Cost Efficiency:** AI agent costs are currently $0.006–$0.018 per interaction. With prompt caching, this represents a feature with 90%+ margins, making AI a "feature, not a bug."

---

## Important Quotes and Context

### On Competitive Defensibility
> "DragonCandy's most powerful moat won't come from any single strategy — it will emerge from the compounding interaction of proprietary campaign data, two-sided network effects, and deep restaurant workflow integration."
*   **Context:** Explains why a holistic strategy is necessary in an era where AI-generated code allows competitors to clone surface-level features in days.

### On Marketplace Liquidity
> "Liquidity isn't the most important thing. It's the only thing." (Quoting Simon Rothman, Greylock)
*   **Context:** Emphasizes that achieving density in a single metro area (Austin, Nashville, or Portland) is more critical than patents or trademarks for an early-stage marketplace.

### On Strategic AI Integration
> "A fine-tuned Donny AI that predicts 'this creator type + this restaurant type + this content format = high performance' will outperform any competitor using generic LLMs."
*   **Context:** Highlights the goal of moving beyond simple AI wrappers to a proprietary intelligence engine based on vertical-specific performance data.

### On Financial Discipline
> "Every employee added before $500K in revenue per head is generated destroys margin. The goal is $1M+ revenue per employee, not headcount growth."
*   **Context:** Outlines the core philosophy of "lean" bootstrapping that allows the platform to outperform VC-backed peers on profitability.

---

## Actionable Insights and Implementation Timeline

### The 90-Day Battle Plan
To activate all six moats simultaneously, the following execution sequence is prioritized:

| Period | Key Actions | Budget Focus |
| :--- | :--- | :--- |
| **Weeks 1–2** | File "DragonCandy," "Donny AI," and "DragonDash" trademarks. Execute team NDAs and IP assignments. Implement Supabase event logging. | $7,500–$13,000 |
| **Weeks 2–4** | Launch in one city with 20–30 creators and 5–10 restaurants. Activate creator referral program. Build FTC auto-disclosure compliance. | $5,000–$15,000 |
| **Month 2** | File provisional patents for "campaign-from-URL" system and AI matching. Launch "Dragon Scout" certification. Begin Square POS integration. | $9,000–$17,000 |
| **Month 3** | Launch MVP Chrome extension. Submit Toast partnership application. Publish first AI Transparency Report. Document 10 ROI case studies. | Marketing/Engineering |

### Operational Strategy for Launch
*   **Sequential Development:** Use Claude Code with a one-change-at-a-time rule to overhaul the design system and landing pages within 5 days (approx. 6 hours of work).
*   **Post-Launch Automation:** Single Claude Code agent workflow with session handoffs at plan-phase boundaries.
*   **Brand Seeding:** Explicitly use the term "DragonDashing" in all marketing to encourage verbification of the high-speed delivery service.

### Profitability Milestones

**Restated 2026-08-26 from the bottom-up model** (`src/pitch/model/`; see `PROJECT_CONTEXT.md` §3).
ARR here is **exit ARR** — the year-end run rate, which is what "ARR" has always meant in this
company's targets. Booked revenue is the lower figure the same year actually invoices, because
customers ramp through it. The market counts below barely moved, because the model reproduced them;
the revenue figures fell.

*   **Year 1 (2026, The Wedge):** 2 markets, ~30 restaurants. Exit ARR ~$100K ($36K booked).
    Original plan: 2–3 markets, 100–200 restaurants — the market count holds, the restaurant count
    does not.
*   **Year 2 (2027, Inflection):** 10 markets, ~264 restaurants. Exit ARR ~$879K ($518K booked).
    Original: 8–12 markets, 500–1,000 restaurants — markets inside the band, restaurants about half.
*   **Year 3 (2028, Scale):** 21 markets, ~1,423 restaurants. Exit ARR ~$4.7M ($3.3M booked).
    Original: 20+ markets, 1,500–3,000 restaurants — **both hold**; only the revenue moved.

**The Year 3 gap is price, not reach.** The model books $277.55 per restaurant per month; the plan
assumed $400–500. At $400 the model's own 1,423 restaurants produce **$6.8M** — 97.6% of the old
band's low end. The difference is that the model bills **two of the four revenue streams**,
subscription and take rate, and books Donny credit overages and DragonDash rush surcharges at zero
because neither has ever been charged to anyone (`src/pitch/model/project.ts`). So the old band is
not refuted; it is **unproven**, and what would prove it is billing history on those two streams.

**The profit figures are removed rather than restated.** "$500K–$2M" (Y2) and "$2–5M annual profit"
(Y3) were computed against the old revenue band and do not follow at the restated revenue. The
model does compute EBITDA, but net of shared costs that is a confidential-build figure — read it
off the workbook's Totals sheet (`npm run model:xlsx`), never from this document.

### Why Staying Lean Beats Raising Capital

Bootstrapped SaaS companies grow at nearly identical rates to VC-backed peers (44% vs 42.8% YoY for $1–15M ARR) but keep what they earn. Raising $5–10M would demand 20–30 people ($4–5M in salary costs), pushing profitability to $10M+ ARR. Staying lean with 5–10 people means profitability at $3–5M ARR — achievable within 24 months. The restaurant market rewards city-by-city density over blitz-scaling. Each metro creates a local network effect that deepens with time, not capital.

See `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md` for detailed financial projections and AI cost analysis.