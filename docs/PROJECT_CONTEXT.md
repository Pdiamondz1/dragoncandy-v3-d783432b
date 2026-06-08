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

Pre-revenue by choice. ~30 organic users, $0 paying customers, ~$390/mo
operating cost (as of 2026-06-07: Lovable $50, Anthropic $200, Outstand.so $67,
Supabase $45, OpenAI $25), Stripe in test mode. Production launch date TBD. The content
delivery system stabilization that gated launch landed in late May 2026;
remaining blockers are final bug resolution and payment-flow hardening.

**Codebase scale** (as of 2026-06-08): 63 pages, 185 hooks, 74 edge functions.
**Repo**: `C:\GIT\dragoncandy-v3-d783432b`
**Active integrations**: Toast POS, Stripe Connect, Outstand.so (social media —
Instagram, TikTok, YouTube), Google Maps (geocoding), Claude Sonnet 4 + Haiku
(cost routing via backend edge functions).

## 5. Active Workstreams

- Content delivery system stabilization — fixing bugs in the
  creator-to-business content handoff and payment flow before launch.
- Auth session management — app-level loading guard, 3-hour global
  inactivity timeout, session hint cleanup (completed May 2026).
- Outstand social media integration — Instagram, TikTok, YouTube account
  linking and delegated posting via Outstand.so API. Phases 1–3 complete;
  phase 4 (analytics dashboard) in scope. Account recovery shipped:
  reconcile + reconnect-needed prompt for accounts wiped by an Outstand
  billing event, so users are guided to re-link rather than hitting silent
  failures. Real profile photos now surface for connected accounts.
  **Publish webhook shipped (2026-06-07):** new `outstand-webhook` edge function
  receives `post.published`, `post.error`, and `account.token_expired` events from
  Outstand, advancing `donny_scheduled_posts` from `scheduled` → `published`/`failed`
  in real time. Previously rows sat at `scheduled` indefinitely — publish failures
  were invisible. Auth via HMAC-SHA256 signature; idempotent via `outstand_webhook_events`
  audit table. Closes the scheduled-post lifecycle end-to-end.
- Dashboard UX polish — pill badge sizing, avatar cache invalidation,
  relative timestamps, status synchronization across roles.
- RLS compliance and query optimization — resolving infinite recursion in
  Supabase RLS policies, removing nested profile joins blocked by RLS.
- DragonShare amplification engine — **live (web).** Creators upload organic
  content about restaurants; restaurants boost it to cross-post across all
  connected social channels via Outstand. Shipped: upload-first single-screen
  submit with URL-to-platform auto-detection, trust-then-flag model (no admin
  verification — admin queue/scoring removed), in-app education per role,
  real photo/video-frame thumbnails across all surfaces, watermarked content
  preview before payment, custom boost amount ($5–$500), boost-or-pass
  decision with post-payment download, success confirmation dialog,
  side-by-side desktop layout + restaurant browse/typeahead. Payments run on
  Stripe Connect with a two-path charge (off-session saved card or hosted
  checkout), idempotent fulfillment, and an 80/20 creator/platform split.
  **Notifications pipeline shipped:** a single `dragonshare-notify` fanout
  edge function owns delivery across bell + email + Donny (raw push inserts
  retired), driven by a dedicated DragonShare notification category with four
  email templates, fired on submit, decline, and boost fulfillment. Both the
  creator and business dashboards carry a dedicated DragonShare activity card
  (events folded into each role's recent-activity feed). Customer-generated
  content submissions were also unblocked (storage upload RLS + a missing
  `social_handles` column).
- GTM Capital & CAC Playbook structured across Phase 0–3 with explicit
  budget gates and kill-switches. Creators onboarded before restaurants in
  each new market.
- Apple App Store (Capacitor) — wrap the existing web app in a Capacitor
  iOS shell so one codebase serves both dragoncandy.io (unchanged) and a
  downloadable iPhone app. Payments split by surface (Stripe for marketplace
  + web-only subscriptions to avoid Apple's 30%), native value-adds
  (push/camera/share) for guideline 4.2, then TestFlight → review → live.
  **Status: Phase 1 (Capacitor foundation) shipped.** Landed: Capacitor 6
  core/cli/ios packages, `capacitor.config.ts` (appId `io.dragoncandy.app`),
  iOS native project scaffold, `useNativePlatform` hook + platform-detection
  utility, CSP allowance for the `capacitor://` WebView scheme, and
  `cap:sync`/`cap:open`/`cap:copy` npm scripts (see iOS build & sync runbook).
  **Phase 2 started:** native camera / photo-library capture for DragonShare
  uploads is the first native value-add — capture UI, iOS permission strings
  (camera + photo library), and a `captureFromCamera` helper feeding the
  shared upload area. Next: push + share plugins, then TestFlight.
  Spec: `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`.
  Hard prerequisite: macOS/cloud-Mac build + Apple Developer account ($99/yr).
- QA staging & CI-CD gate — a three-plan effort to stop prod-only testing.
  Plan A (CI gate) and Plan B (a dedicated staging Supabase, ref
  `mhffqrawgizhprbobcta`, stood up via a 213-migration replay) are complete;
  Plan C (a curated e2e smoke gate on staging previews) is in place. A
  split-brain bug was fixed along the way: the frontend was hardwired to prod
  Supabase, so the client and three callers now read `VITE_SUPABASE_URL` with
  a prod fallback — note `src/integrations/supabase/client.ts` is
  Lovable-autogenerated, so watch for regen reversions. Runbook +
  feature-change workflow doc + preview-url helper shipped.
- Legal & compliance — Privacy Policy and Terms of Service pages shipped.

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
- Schema triage (resolved 2026-06-07): the `campaign_status` enum lacks
  `in_progress`, but a code + DB audit confirmed **no code or trigger writes
  `in_progress` to either enum column** (`campaigns.status` /
  `campaign_collaborations.status`); every `in_progress` reference targets the
  `text` columns `content_status` / `posting_schedule_status`. Prod logs no
  longer show the `invalid input value for enum campaign_status` error — the
  original offending write was already re-routed to `content_status`. No enum
  change needed.

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
surcharge $25–50. AI API spend — Claude/Anthropic (generation, routed Sonnet 4
+ Haiku) plus OpenAI (embeddings for RAG/matching) — is hard-capped at 15% of
revenue ($250/mo floor pre-revenue; currently ~$225/mo = Anthropic $200 +
OpenAI $25). Governed by Donny AI Cost Architecture spec — model routing
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
**Backend**: Supabase (70+ tables, 74 Deno Edge Functions, RLS, realtime),
Stripe Connect (test mode).
**AI**: Claude Sonnet 4 + Haiku for generation (cost routing via edge
functions, backend only); OpenAI for embeddings (RAG/matching). Model routing
and cost ledger in `_shared/`.
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
