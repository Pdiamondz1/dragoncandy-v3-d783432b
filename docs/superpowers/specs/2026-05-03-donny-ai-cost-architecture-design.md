# Donny AI Cost Architecture & Token Efficiency Strategy

**Date:** May 3, 2026
**Audience:** Lead Developer, Engineering Team, Business Stakeholders
**Status:** Approved Design — Ready for Implementation Planning

---

## Executive Summary

Donny AI is DragonCandy's intelligence layer — powering campaign generation, creator matching, social media management, and conversational assistance across every surface. As Donny's capabilities expand (social media integration, Chrome extension, SMS, embeddable SDK), AI API costs scale with usage. This spec establishes the economic governance that keeps Donny viable at every stage of growth.

The core principle: **use the cheapest model that produces acceptable output for each task, make token budgets invisible to users, and tie AI spend to revenue so the economics improve as the business scales.**

### Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model selection strategy | Task-tier routing matrix (T0–T3) | Cheapest acceptable model per task; most Donny tasks are pattern-matching suited to Haiku |
| User-facing credit system | Invisible with graceful degradation | Visible credits create friction that works against "less typing" north star |
| Revenue cap enforcement | 15% of revenue, $250/mo floor | Hard dollar floor keeps Donny running pre-revenue; percentage takes over as revenue scales |
| Vendor strategy | Consolidate generative AI on Claude, keep OpenAI embeddings | One fewer billing relationship; embeddings too cheap to justify migration cost |
| Fine-tuning path | LoRA on open-source models at 1,000–5,000 campaigns | Data flywheel funds eventual escape from per-token API economics |

---

## 1. Model Routing Matrix

Every Donny AI call routes through a tier system. Model selection is a lookup, not a judgment call.

### Tier Definitions

| Tier | Model | Approx Cost (per MTok in/out) | Max Tokens | When to Use |
|------|-------|-------------------------------|------------|-------------|
| **T0: No AI** | None | $0 | N/A | OAuth flows, analytics fetching, media uploads, scheduled post dispatch, account connections |
| **T1: Haiku** | claude-haiku-4-5 | ~$0.25 / $1.25 | 256–512 | Pattern-matching tasks: caption/hashtag generation, reply drafting, nudge framing, scheduling decisions, quick chip generation, platform-specific formatting, simple knowledge base Q&A |
| **T2: Sonnet** | claude-sonnet-4 | ~$3 / $15 | 2048–4096 | Multi-step reasoning: campaign wizard conversations, multi-platform cross-posting orchestration, content calendar planning, sponsorship ROI analysis, creator matching/scoring, brand guidelines enforcement |
| **T3: Sonnet Extended** | claude-sonnet-4 | ~$3 / $15 | 8192 | Complex multi-tool conversations with full tool use (existing donny-chat pattern), campaign-from-URL generation |

### Current Edge Function Migration

| Edge Function | Current Model | Current Max Tokens | New Tier | Change |
|---------------|---------------|-------------------|----------|--------|
| `donny-chat` | Sonnet 4 | 8192 | T3 | No change — complex tool-use conversations justify Sonnet Extended |
| `donny-nudge-frame` | Haiku 4.5 | 200 | T1 | No change — already optimally routed |
| `donny-orchestrator` | Sonnet 4 | 1024 | T2 | No change — multi-agent routing needs Sonnet reasoning |
| `donny-campaign-preview` | Sonnet 4 | 4096 | T1/T2 split | Most preview tasks (mood descriptions, simple storyboards) drop to T1. Complex multi-constraint previews stay T2. Route based on input complexity. |
| `donny-schedule` | Sonnet 4 | 2048 | T1 | Drop to Haiku — scheduling optimization is pattern matching on time slots and engagement data |
| `donny-campaign-generate` | GPT-4o | N/A | T2 | Migrate to Sonnet with tool use for JSON structure. Campaign generation is high-value, justifies Sonnet. |
| `donny-creator-match` | GPT-4o | N/A | T1 | Migrate to Haiku with structured prompt and JSON tool output. Scoring against criteria is pattern matching. |

### Fallback Rule

If a Haiku response fails quality checks (malformed JSON, off-topic, truncated), retry once at Sonnet. Log the fallback to `donny_cost_ledger` with `fallback: true`. If a task category triggers fallback more than 15% of the time over a rolling 7-day window, promote it permanently to the next tier. Review promotions monthly.

---

## 2. Invisible Credit System & Graceful Degradation

### Design Principle

Users never see token counts, model names, tier labels, action balances, or a usage meter. The only visible moment is the Stage 3 upgrade prompt — and even that is framed as Donny talking to the user, not a system wall. Visible credits create "should I spend a credit on this?" hesitation that directly undermines the "less typing = more margin" north star.

### Unit of Measurement: Donny Actions

Every AI call has a token cost internally. Externally, the abstraction is "Donny actions" — a normalized unit that hides the variance between a cheap Haiku caption (~800 tokens) and an expensive Sonnet multi-tool turn (~6,000 tokens).

| Task Tier | Actions Cost |
|-----------|-------------|
| T0 (No AI) | 0 actions |
| T1 (Haiku) | 1 action |
| T2 (Sonnet) | 3 actions |
| T3 (Sonnet Extended) | 5 actions |
| Auto-Pilot daily cycle | 10 actions flat |

### Tier Allocations (Monthly)

| Subscription Tier | Monthly Donny Actions | Approx Token Budget | Auto-Pilot Eligible | DragonDash Rush |
|---|---|---|---|---|
| **Free** | 50 | ~500K tokens | No | No |
| **Starter ($149)** | 500 | ~5M tokens | No | Yes (surcharge) |
| **Growth ($499)** | 2,000 | ~20M tokens | Yes (standard frequency) | Yes (surcharge) |
| **Pro ($999)** | 10,000 | ~100M tokens | Yes (high frequency) | Yes (included) |
| **Enterprise** | Custom | Custom | Yes (custom) | Yes (included) |

### Graceful Degradation — Three Stages

**Stage 1: Full Power (0–80% of allocation)**
All features available at their designed model tier. Auto-Pilot runs at full frequency. Donny is proactive with suggestions and nudges. No notifications about usage.

**Stage 2: Conservation Mode (80–100% of allocation)**
Donny silently shifts T2 tasks to T1 where feasible (e.g., caption writing that was being handled by Sonnet drops to Haiku). Auto-Pilot frequency halves. Proactive suggestions reduce. The user experiences Donny as slightly less chatty but still fully functional for on-demand requests. No notification — the user should not feel metered.

**Stage 3: Essential Mode (100%+ of allocation)**
Donny handles only on-demand requests at T1 (Haiku). Auto-Pilot pauses. Proactive nudges stop. Donny surfaces a single, non-blocking message:

> "I've been working hard this month. Upgrade your plan to keep me running at full speed, or add credits to power through."

Overages available at $0.10–0.25/action depending on tier (lower tiers pay more per overage, creating upgrade incentive).

### Database: `donny_usage` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| user_id | uuid | FK to profiles |
| period_start | date | First day of billing period |
| actions_used | integer | Running total for period |
| actions_budget | integer | Allocation for user's current tier |
| current_stage | text | full_power / conservation / essential |
| updated_at | timestamptz | Last update timestamp |

RLS policy: users can only read their own usage. Edge functions update via service role.

The routing layer checks `donny_usage` before model selection. If `current_stage = 'conservation'`, the routing matrix shifts eligible T2 tasks down to T1.

---

## 3. Revenue Cap Governance

### The Rule

AI API spend hard-capped at 15% of revenue. Pre-revenue floor: $250/month.

### Pre-Revenue Floor Logic

At $0 revenue, 15% = $0, which is not functional. The $250/mo floor holds until monthly revenue exceeds $1,667 (at which point 15% × $1,667 = $250 and the percentage cap takes over naturally). At Haiku-dominant routing, $250 buys approximately 50–100 million tokens/month — far more than the current ~30 organic users could consume.

### Alert Thresholds

| Threshold | Action |
|-----------|--------|
| **60% of cap** | Internal alert logged to `analytics_events`, visible in admin dashboard |
| **80% of cap** | Conservation mode forced platform-wide — all users shift to Stage 2 degradation regardless of individual allocation |
| **95% of cap** | Essential mode forced platform-wide — only on-demand T1 requests served, all Auto-Pilot and proactive features paused |
| **100% of cap** | Hard stop on non-essential AI calls. Only mission-critical paths (campaign creation wizard, payment-related Donny actions) continue. Everything else returns a graceful "Donny is resting" message. |

### Cap Scaling with Revenue

| Monthly Revenue | AI Spend Cap (15%) | Per-User Budget (100 users) | Per-User Budget (1,000 users) |
|---|---|---|---|
| $0 (pre-revenue) | $250 floor | $2.50 | $0.25 |
| $5,000 | $750 | $7.50 | $0.75 |
| $25,000 | $3,750 | $37.50 | $3.75 |
| $50,000 | $7,500 | $75.00 | $7.50 |

As revenue grows, the per-user budget grows — enabling promotion of more tasks from Haiku to Sonnet, increased Auto-Pilot frequency, and premium features unlocked at lower tiers. The model routing matrix evolves with revenue.

### Kill-Switch Integration

If AI spend per user exceeds the revenue that user generates (LTV:AI-cost ratio < 2:1 at the individual level), that signals either tightening their tier allocation or promoting them to upgrade. Mirrors the portfolio-level kill-switches in PROJECT_CONTEXT (LTV:CAC < 2:1).

### Database: `donny_cost_ledger` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| user_id | uuid | FK to profiles |
| edge_function | text | Which function made the call |
| model | text | Model used (haiku-4-5, sonnet-4, etc.) |
| tier | text | T0 / T1 / T2 / T3 |
| input_tokens | integer | Tokens in the request |
| output_tokens | integer | Tokens in the response |
| estimated_cost_usd | numeric(10,6) | Calculated from per-token rates |
| fallback | boolean | Whether this was a tier-fallback retry |
| created_at | timestamptz | Timestamp |

RLS policy: admin-only read access. A daily rollup edge function sums month-to-date spend and compares against the cap. Follows ledger-first architecture principle from PROJECT_CONTEXT.

---

## 4. Vendor Consolidation Path

### Short-Term (Pre-Launch, 2–4 Weeks): Migrate GPT-4o to Claude

| Edge Function | Current | Target | Rationale |
|---------------|---------|--------|-----------|
| `donny-campaign-generate` | GPT-4o | Sonnet (T2) | Structured JSON via tool use. Campaign generation is high-value, justifies Sonnet. |
| `donny-creator-match` | GPT-4o | Haiku (T1) | Scoring against criteria is pattern matching. Well-structured prompt with JSON tool output. |

**Result:** One API key (Anthropic) for all generative AI. One API key (OpenAI) for embeddings only. Simpler secrets management, one fewer billing relationship for generative tasks.

### Medium-Term (Post-Launch, 3–6 Months): Keep OpenAI Embeddings

`text-embedding-3-small` at $0.02/MTok is essentially free. Re-embedding all knowledge chunks to switch providers costs engineering time with no meaningful savings. The `donny-orchestrator/rag.ts` module has a clean abstraction — the embedding call is isolated, so swapping later is a single-function change.

If Anthropic releases a standalone embedding model, evaluate at that point.

### Long-Term (1,000–5,000 Campaigns): Fine-Tuned Open-Source Models

The cost architecture creates the data to make this evidence-based:
- `donny_cost_ledger` tracks which task categories consume the most tokens
- `donny_messages.tokens_used` identifies which conversation patterns are most expensive
- Model routing fallback logs identify which Haiku tasks frequently need Sonnet rescue

When the data is sufficient, the highest-volume T1 tasks (caption writing, hashtag generation, reply drafting) are prime candidates for LoRA fine-tuning on a small open-source model (7B parameters). These tasks are repetitive, pattern-matchable, and domain-specific — exactly where fine-tuning pays off. A fine-tuned model on own infrastructure could reduce per-call cost by 90%+ for these tasks.

The cost architecture doesn't design for this now — it ensures the data is logged so the decision is evidence-based rather than speculative.

---

## 5. Social Media Integration Spec Alignment

The Outstand social media integration spec (`docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`) inherits this cost architecture. The following updates align the social media spec with the economic governance defined here.

### Update A: DragonDash Rush Posting

The campaign-integrated workflow gains economic differentiation. When a creator's deliverable is approved:

| Option | Tier | Action Cost | AI Work |
|--------|------|-------------|---------|
| **"Post now to all platforms"** | DragonDash rush ($25–50 surcharge) | 3 actions (T2) | Multi-platform simultaneous posting with AI-written platform-specific captions, optimized hashtags, cross-tagging |
| **"Schedule for optimal times"** | Standard | 1 action (T1) | Haiku picks best time per platform, queues posts |
| **"Post to one platform now"** | Standard | 1 action (T1) | Single-platform post with Haiku caption |
| **"Edit first" / "Skip"** | Free | 0 actions | No AI involved |

Same pattern applies in Creator cross-post flow and Brand amplification flow. Rush simultaneous multi-platform posting is always DragonDash; scheduled or single-platform is standard.

### Update B: Model Routing Per Social Media Feature

| Social Media Feature | Model Tier | Rationale |
|---|---|---|
| Caption/hashtag generation | T1 / Haiku | Pattern matching — templates + trending data |
| Engagement hub reply drafting | T1 / Haiku | Short-form responses from templates |
| Content calendar slot suggestions | T1 / Haiku | Time-slot optimization from engagement data |
| UGC detection & reshare prompts | T1 / Haiku | Tag/mention detection + templated prompt |
| Google Business sync posts | T1 / Haiku | Format adaptation for GBP |
| Cross-post caption rewriting | T1 / Haiku | Voice/tone adaptation — pattern matching |
| Growth insights & recommendations | T2 / Sonnet | Multi-signal analysis across platforms |
| Multi-platform simultaneous posting | T2 / Sonnet | Complex orchestration across platform APIs |
| Brand guidelines enforcement | T2 / Sonnet | Content review against multiple constraints |
| Sponsorship ROI report generation | T2 / Sonnet | Multi-party analytics synthesis |
| Auto-Pilot weekly planner | T2 / Sonnet | Multi-day content strategy generation |
| Sponsorship intelligence | T2 / Sonnet | Cross-campaign pattern analysis |
| Scheduled post dispatch | T0 / No AI | Already-written content, just API call |
| Analytics fetching from Outstand | T0 / No AI | Data retrieval, no generation |
| Account connection OAuth | T0 / No AI | Authentication flow, no AI |

6 of 15 capabilities are T1, 6 are T2, 3 are T0. Versus the current spec which implies Sonnet for everything — this cuts social media AI cost roughly in half.

### Update C: Automation Levels Tied to Subscription Tiers

| Automation Level | Available On | Action Cost | Behavior |
|---|---|---|---|
| **Manual** | All tiers | 0 actions (Donny helps only when asked) | User writes captions, picks times, publishes through UI |
| **Assisted** (default) | Starter+ | 1–3 actions per post | Donny drafts captions and suggests times, user reviews before publish |
| **Auto-Pilot** | Growth+ | 10 actions/day flat | Donny generates weekly content plan, schedules and publishes autonomously, sends daily summary |

Free-tier users still get social media features — manual mode through the UI with occasional Donny help up to their 50-action limit. This keeps the integration valuable at every tier while reserving expensive automation for paying customers.

### Document Cleanup

- **Delete:** `docs/DragonCandy — Social Media Integration Strategy & Implementation Guide.pdf`
- **Delete:** `docs/dragoncandy-outstand-integration-strategy.html`
- **Source of truth:** `docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`
- **Add reference:** Line at top of social media spec: "This spec inherits token budgets and model routing from the Donny AI Cost Architecture spec."

---

## 6. PROJECT_CONTEXT.md Updates

Three surgical additions. No restructuring.

**Section 4 (Current State) — Add vendor migration note:**
Update active integrations line to: "Active integrations: Toast POS, Stripe Connect, Claude Sonnet 4 + Haiku routing, OpenAI embeddings (RAG). GPT-4o tasks (campaign generation, creator matching) migrating to Claude per cost architecture."

**Section 8 (Pricing Architecture) — Sharpen AI cost line:**
Update from "AI API spend hard-capped at 15% of revenue" to: "AI API spend hard-capped at 15% of revenue ($250/mo floor pre-revenue). Governed by Donny AI Cost Architecture spec — model routing matrix, invisible per-tier credit system with graceful degradation, cost ledger tracking."

**Section 10 (Stack & Resources) — Add to key documents list:**
Add: `Donny AI Cost Architecture` — model routing, token budgets, revenue cap governance.
Update: "Social integration playbook" → `Social Media Integration spec (docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md)`.

---

## 7. Success Metrics

| Metric | Target | Measured By |
|--------|--------|-------------|
| AI spend as % of revenue | ≤ 15% (or ≤ $250/mo pre-revenue) | `donny_cost_ledger` monthly rollup |
| Haiku task ratio | ≥ 60% of all Donny actions route through T1 | `donny_cost_ledger` tier distribution |
| Fallback rate | < 15% per task category per week | `donny_cost_ledger` fallback flags |
| Stage 3 (essential mode) triggers | < 5% of active users per month | `donny_usage` stage tracking |
| Upgrade conversion from Stage 3 | > 20% of users hitting Stage 3 upgrade within 7 days | Subscription events correlated with Stage 3 timestamps |
| GPT-4o elimination | 0 GPT-4o calls within 4 weeks of implementation | `donny_cost_ledger` model distribution |
| Per-user AI cost | Decreasing trend month-over-month as Haiku routing expands | `donny_cost_ledger` per-user aggregation |

---

## 8. Guiding Principles

| Principle | Detail |
|-----------|--------|
| **Cheapest acceptable model** | Default to Haiku. Promote to Sonnet only when task complexity demands it. Never use Sonnet because it's "safer." |
| **Invisible economics** | Users experience Donny's intelligence, not his cost. No meters, no credit counts, no model names surfaced. |
| **Graceful over abrupt** | Degrade quality gradually rather than hitting a wall. Conservation mode before essential mode before hard stop. |
| **Ledger-first** | Every AI call logged with cost. Follows the payment_ledger discipline already in the codebase. Decisions are data-driven. |
| **DragonDash captures premium** | The most expensive AI actions (rush multi-platform posting, complex orchestration) generate the most revenue via DragonDash surcharges. High-cost features pay for themselves. |
| **Revenue-adaptive** | The model routing matrix, tier allocations, and feature availability evolve as revenue grows. What's T1/Haiku today might be T2/Sonnet at $50K MRR. |
| **Vendor-light** | Minimize API vendor dependencies. One vendor for generative AI, one for embeddings. Fine-tuning is the long-term exit from per-token economics. |
