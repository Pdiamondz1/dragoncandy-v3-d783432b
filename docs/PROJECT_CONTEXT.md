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

Pre-revenue by choice. Small organic user base, no paying customers yet,
lean operating cost, Stripe in test mode. Production launch date TBD — blocked
on content delivery system stability and bug resolution.

**Codebase scale** (as of 2026-06-01): 60 pages, 181 hooks, 71 edge functions.
**Repo**: `C:\GIT\dragoncandy-v3-d783432b`
**Active integrations**: Toast POS, Stripe Connect, Outstand.so (social media —
Instagram, TikTok, YouTube), Google Maps (geocoding), Claude Sonnet 4 + Haiku
(cost routing via backend edge functions).

## 5. Active Workstreams

- Content delivery system stabilization — fixing bugs in the
  creator-to-business content handoff and payment flow before launch.
- Stripe escrow payments — two-path boost charge (off-session saved card or
  hosted Stripe Checkout), idempotent webhook fulfillment, per-org customer
  anchoring with card reuse. Restaurant→creator payment reliability hardening.
- Notification system — `push_notifications` realtime feed with type/category/
  actor metadata, a `preferences_matrix` across 5 categories (campaigns,
  messages, transactions, content, account) × 3 channels (in-app, email, SMS),
  and a redesigned notification center with per-category clearing.
- Donny AI cost architecture — per-call `donny_cost_ledger` (token + cost
  tracking, T0–T3 tier classification) and monthly `donny_usage` action budget
  with graceful degradation stages (`full_power` → `conservation` →
  `essential`). Quota enforcement + SSE streaming live in the orchestrator.
- Multi-deliverable scheduling & auto cross-scheduling — per-deliverable
  captions and hooks, date-collision resolution, spread-aware post times,
  5-stage `campaign_social_hooks` and `triple_post_sessions` coordination
  across restaurant/creator/brand.
- CGC campaigns optimization — camera-first submission (email-only required),
  2-tab dashboard (active campaigns + content library), 3-field create modal,
  unified approve-and-post review flow, business posting preferences.
- DragonShare amplification engine (shipped) — creators upload organic content
  about restaurants, restaurants boost it to cross-post across connected
  channels via Outstand. Upload-first submit, trust-then-flag model (no admin
  verification), restaurant browse, real photo/video content thumbnails, and a
  Stripe Connect payment flow with an 80/20 creator/platform split.
- App freshness & session enforcement — version detection via
  `AppVersionContext`, soft update banner with force-reload on navigation,
  build-hash polling (`useAppVersion`), and timestamp-based 3-hour inactivity
  timeout (replacing the prior `setTimeout` approach).
- Outstand social media integration — Instagram, TikTok, YouTube account
  linking and delegated posting via Outstand.so API. Phases 1–3 complete;
  phase 4 (analytics dashboard) in scope.
- GTM Capital & CAC Playbook structured across Phase 0–3 with explicit
  budget gates and kill-switches. Creators onboarded before restaurants in
  each new market.

**Workflow discipline**: Single Claude Code agent, one prompt at a time
→ `npm run build` → verify → push. Session handoffs at plan-phase
boundaries (see `.claude/handoffs/`).

## 6. On the Horizon

- Production launch (date TBD — blocked on content delivery system
  stability). Social media integration handled via Outstand.so; direct
  platform API approvals (Meta, TikTok, YouTube, X) deferred.
- City-by-city density: one metro first (20–30 creators, 5–10 restaurants),
  then replication scorecard for metro 2.
- Fine-tuning Donny on proprietary data once 1,000–5,000 campaigns
  accumulate (LoRA on open-source models).
- Toast partnership application (6–12 month timeline).
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

**Session handoffs preserve multi-session continuity.** Work that spans
multiple sessions (plan execution, multi-task audits, staged rollouts)
produces a handoff document in `.claude/handoffs/` at natural breakpoints.
Fresh sessions check for active handoffs before starting. Handoffs carry
execution state (what's done, what's next, gotchas discovered); they
complement — not replace — memory (durable facts) and git log (change
history).

**Bulk changes break builds.** Surgical, one-change-at-a-time prompts with
`npm run build` verification after each. Recovery via `git reset --hard`
+ force push when needed.

**Protect desktop classes when fixing mobile.** Never touch working `lg:`
Tailwind classes when targeting mobile-only issues.

**Brand verbification is a distribution moat.** "#DragonDashed" seeded from
launch. "DragonDash" is significantly more verb-able than "DragonCandy."

**Setup disguised as action.** Every onboarding step should feel like
progress toward a goal, not homework. Show value first (what's possible),
then collect what you need (portfolio, preferences), then guide the action
(create, apply, sponsor). Never ask users to configure before they
understand why.

## 8. Pricing Architecture

Stack all four revenue streams on one customer:
1. Subscription
2. Take-rate
3. Donny AI credit overages
4. DragonDash rush surcharge

**Take-rate ladder**: Free 10% / Starter $149 → 7% / Growth $449 → 5% /
Pro $899 → 3% / Enterprise → 2%. See `docs/STRIPE_PRICES.md` for
current price IDs and full pricing breakdown.

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

**Frontend**: React 18 / TypeScript (strict), Vite, Tailwind CSS, shadcn/ui,
Framer Motion, Lovable.dev (hosting/preview), GitHub.
**Backend**: Supabase (70+ tables, 71 Deno Edge Functions, RLS, realtime),
Stripe Connect (test mode).
**AI**: Claude Sonnet 4 + Haiku (cost routing via edge functions, backend
only). Model routing and cost ledger in `_shared/`.
**Social**: Outstand.so (Instagram, TikTok, YouTube integration).
**Integrations**: Toast POS (restaurant discounts), Google Maps (geocoding).
**Knowledge management**: NotebookLM.

**Key project documents**:
- `CLAUDE.md` — developer guidance + design system import
- `docs/STRIPE_PRICES.md` — pricing source of truth
- `docs/DragonCandy_Strategy_Briefing.md` — competitive strategy
- `docs/DragonCandy_Moat_Playbook.md` — competitive defensibility
- `docs/DragonCandy_Engineering_Blueprint.md` — build guidance
- `docs/content-delivery-system-flows.md` — state machines and flows
- Outstand integration spec (`docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`)
