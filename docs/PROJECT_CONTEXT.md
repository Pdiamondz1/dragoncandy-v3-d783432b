# DragonCandy — Project Context

> Single source of truth for project description, current state, and
> operating instructions. Auto-loaded by Claude Code via CLAUDE.md import.
> Update when revenue targets, workstreams, or working style materially
> change. Do not let this file drift from reality.

## 1. What We're Building

DragonCandy (dragoncandy.io) is an AI-powered creator-restaurant marketplace
HQ'd in Hoboken, NJ. The platform connects three roles — Restaurant/Business,
Content Creator, and Brand/Sponsor — through a hybrid marketplace model.

**Co-founders**
- Damon "Dame" Williams — co-founder, CPO
- Joe Castelo — CRO, Sales & Partnerships
- Juwan Robinson — Shareholder & Advisor

**Core product logic**
- **Donny AI** is the intelligence layer: campaign generation, creator
  matching, analytics, scheduling.
- **DragonDash** is the profit engine: rush content delivery at premium
  margins.
- These are not separate products. Donny powers DragonDash; DragonDash sells.

## 2. North Star

**Less typing = more margin.**

Every primary flow under 10 keystrokes by Month 6. Surface priority order:
voice → camera → paste-URL → tap-a-chip → typing (last resort). Target:
paid campaign in under 60 seconds.

## 3. Three-Year Targets

| Year | ARR        | Headcount | Metros | Notes        |
|------|------------|-----------|--------|--------------|
| Y1   | $300–600K  | 5–6       | 2–3    |              |
| Y2   | $2–4.5M    | 7–8       | 8–12   | NRR > 110%   |
| Y3   | $7–12M     | 10–11     | 20+    | $2–5M profit |

**Kill-switches** (any trigger ≥ pause and reassess):
- Churn > 6%
- CAC payback > 12 months
- LTV:CAC < 2:1
- Revenue per employee < $400K

## 4. Current State

Pre-revenue by choice. ~30 organic users, $0 paying customers, ~$295/mo
operating cost, Stripe in test mode. Production launch targeted next month.

**Codebase scale**: 63 pages, 140+ hooks, 42 edge functions.
**Repo**: `C:\GIT\dragoncandy-v3-d783432b`
**Active integrations**: Toast POS, Stripe Connect, Claude Sonnet 4 + Haiku
routing, OpenAI embeddings (RAG). GPT-4o tasks (campaign generation, creator
matching) migrating to Claude per cost architecture.

## 5. Active Workstreams

- Pre-launch improvement playbook (9-prompt Claude Code sequence): Campaign
  Wizard restructuring, branding fixes, Creator/Brand role UX parity.
- Social media auto-posting integration playbook staged. "Download & Post"
  manual flow ships at launch; social APIs (Meta, TikTok, YouTube, X)
  layered in post-launch.
- GTM Capital & CAC Playbook structured across Phase 0–3 with explicit
  budget gates and kill-switches. Creators onboarded before restaurants in
  each new market.
- Donny AI multi-surface architecture (Chrome Extension, Safari iOS, mobile
  widget, SMS, embeddable SDK). Single-agent workflow during launch week.

**Workflow discipline**: Single Claude Code agent, one prompt at a time
→ `npm run build` → verify → push. OpenClaw multi-agent (Scout/Forge/
Athena/Guardian) deferred to post-launch.

## 6. On the Horizon

- Production launch (next month). Social API approvals running in parallel
  (Meta App Review 2–6 weeks, TikTok Content Posting API, YouTube sensitive
  scope, X paid tier).
- OpenClaw multi-agent deployment post-launch.
- City-by-city density: one metro first (20–30 creators, 5–10 restaurants),
  then replication scorecard for metro 2.
- Fine-tuning Donny on proprietary data once 1,000–5,000 campaigns
  accumulate (LoRA on open-source models).
- Toast partnership application (6–12 month timeline — should already be
  in motion).
- Trademark filings: DragonCandy, Donny AI, DragonDash (Classes 35 & 42).
- Provisional patents: campaign-from-URL system, AI-scored matching pipeline.

## 7. Key Principles & Learnings

**DragonDash over standalone Donny AI.** Standalone AI content tools face
rapid commoditization and high SMB churn. Donny as an intelligence layer
powering a service (DragonDash) is the defensible position.

**Data flywheel is the primary moat.** Log every brief, match, and campaign
completion from Day 1. Network effects and proprietary training data compound
in ways features alone cannot.

**Ledger-first architecture.** Schema and RLS migrations must be reviewed
before any OAuth or publishing code is written. Mirrors the `payment_ledger`
discipline already embedded in the codebase.

**Never block launch on API approvals.** Ship manual "Download & Post" flow
first; layer automated social APIs after.

**Parallel agents = merge conflict risk during launch week.** Sequential
single-agent workflow until post-launch stabilization.

**Bulk changes break builds.** Surgical, one-change-at-a-time prompts with
`npm run build` verification after each. Recovery via `git reset --hard`
+ force push when needed.

**Protect desktop classes when fixing mobile.** Never touch working `lg:`
Tailwind classes when targeting mobile-only issues.

**Brand verbification is a distribution moat.** "#DragonDashed" seeded from
launch. "DragonDash" is significantly more verb-able than "DragonCandy."

## 8. Pricing Architecture

Stack all four revenue streams on one customer:
1. Subscription
2. Take-rate
3. Donny AI credit overages
4. DragonDash rush surcharge

**Take-rate ladder**: Free 10% / Starter $149 → 7% / Growth $499 → 5% /
Pro $999 → 3% / Enterprise → 2%.

**Variable**: Donny credit overage $0.10–0.25/call; DragonDash rush
surcharge $25–50. AI API spend hard-capped at 15% of revenue ($250/mo floor
pre-revenue). Governed by Donny AI Cost Architecture spec — model routing
matrix, invisible per-tier credit system with graceful degradation, cost
ledger tracking.

## 9. Operating Instructions for Claude Code

### Governing Philosophy — Musk's Algorithm

Apply to every recommendation, every prompt, every PR:
1. **Question** every requirement (including the user's — push back when wrong).
2. **Delete** every step, field, click, and keystroke that can go.
3. **Simplify** what survives.
4. **Accelerate** cycle time.
5. **Automate** last. Never automate a broken process.

### Working Style

- Reference project playbooks first (pricing v2, staffing v2, agent ops,
  super agent roadmap, moat playbook) before answering. Numbers must
  reconcile across docs.
- One change per prompt. Always: audit → plan → diff → verify with
  `npm run build`.
- Protect working `lg:` desktop Tailwind classes; only target base mobile
  styles when fixing mobile.
- Never propose batch changes.
- Never break the ledger-first rule (schema + RLS reviewed before any
  OAuth or publishing code).
- Never block launch on third-party API approvals.

### Output Defaults

- Prose over bullets unless a list is genuinely the clearest format.
- Cite which playbook a recommendation comes from when relevant.
- If a request would dilute DragonDash as the profit engine or position
  Donny AI as a standalone product, push back.
- For every recommendation, end with: what it deletes, what it simplifies,
  what it automates, and the keystroke count it removes.

## 10. Stack & Resources

**Frontend**: React/TypeScript, Tailwind CSS, Lovable.dev (hosting/preview),
GitHub.
**Backend**: Supabase (35+ tables, Deno Edge Functions, RLS, realtime),
Stripe Connect.
**AI**: Claude Sonnet 4 + Haiku (cost routing), OpenAI embeddings (RAG for
Donny).
**Post-launch automation**: OpenClaw (WSL-based, self-hosted agent gateway).
**Knowledge management**: NotebookLM.

**Key project documents**:
- `CLAUDE.md` — design system spec
- `dragoncandy-prelaunch-fixes.md`
- `prompt-delivery-payment-audit.md`
- `DragonCandy_Engineering_Blueprint.md`
- `DragonCandy_GTM_Capital_CAC_Playbook.md`
- `Donny AI Cost Architecture` — model routing, token budgets, revenue cap governance
- Social Media Integration spec (`docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`)
