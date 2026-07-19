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
- Joe Castelo — CEO, Sales & Partnerships
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
- Churn > 6% **monthly** (SMB SaaS benchmark is 3–5%/mo, so >6%/mo means worse than
  typical SMB; unit clarified 2026-06-10 — was previously unitless)
- CAC payback > 12 months
- LTV:CAC < 2:1
- Revenue per employee < $400K — **Y2–Y3 maturity gate, not a Y1 trigger.** The Y1
  plan ($300–600K ARR ÷ 5–6 staff ≈ $50–120K/employee) is structurally below this
  floor, so applying it early would false-trigger; the Y3 plan ($7–12M ÷ 10–11 ≈
  $636K–$1.2M/employee) clears it. (Scoped 2026-06-10.)

> Kill-switch thresholds validated against 2025 SMB-SaaS benchmarks and operationalized
> into a tracked metric set in `docs/wiki/analyses/north-star-kpi-scorecard.md`
> (produced by the `/autoresearch` loop).

## 4. Current State

Pre-revenue by choice. ~30 organic users, $0 paying customers, ~$390/mo
operating cost (as of 2026-06-07: Lovable $50, Anthropic $200, Outstand.so $67,
Supabase $45, OpenAI $25), Stripe in test mode. Production launch date TBD. The content
delivery system stabilization that gated launch landed in late May 2026;
remaining blockers are final bug resolution and payment-flow hardening.

**Codebase scale** (as of 2026-06-13): 73 pages, 206 hooks, 80 edge functions.
**Repo**: `C:\GIT\dragoncandy-v3-d783432b`
**Active integrations**: Toast POS, Stripe Connect, Outstand.so (social media —
Instagram, TikTok, YouTube), Google Maps (geocoding), Claude Sonnet 4 + Haiku
(cost routing via backend edge functions).

## 5. Active Workstreams

> Index only — one line per entry. Full prose for shipped work lives in
> `docs/SHIPPED_LOG.md`; durable synthesis lives in `docs/wiki/`. Keep this section
> short: it loads into every session.

### In flight

- **Content delivery system stabilization** — bug-fixing the creator→business content
  handoff and payment flow; gates production launch. → `docs/SHIPPED_LOG.md`
- **Outstand social media integration** — IG/TikTok/YouTube linking + delegated posting;
  phases 1–3 complete, phase 4 (analytics dashboard) still in scope. → `docs/SHIPPED_LOG.md`
- **Apple App Store (Capacitor)** — iOS shell over the web app. Phase 1 shipped, Phase 2
  (native camera capture) started; next push + share plugins, then TestFlight. Hard
  prerequisite: a macOS/cloud-Mac build + an Apple Developer account ($99/yr).
  → `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`

### Built — awaiting founder go-live

- **AIOS Google Workspace ("Connections")** — per-user Google OAuth, audited proxy, Drive
  hub, Donny exports, metrics→Sheet. The `google-chat-donny` bot ships dark (503).
  **Pending:** register the Chat app, set `GOOGLE_CHAT_PROJECT_NUMBER` +
  `GOOGLE_ALLOWED_DOMAIN` — all blocked on creating the DragonCandy Workspace org.
  → `docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`
- **Public landing — Dark-Luxe redesign + lead capture** — scoped-`.dark` rebuild + a
  closed-anon-DML `leads` table and throttled `capture-lead` fn; both live on prod.
  **Pending:** set the `LEADS_NOTIFY_EMAIL` edge secret — without it nobody is notified of a
  captured lead. → `docs/wiki/concepts/landing-lead-capture.md` · `feat/landing-luxe-redesign`

### Shipped

- **AIOS kill-switch playbook + loop-callable playbooks** — a report-only `kill-switch-watch`
  playbook over §3's four kill-switches (pre-revenue: an armed-watch scaffold) + a
  `playbook-runner-agent` template making any playbook loop-callable. Live weekly (Mon 12:00
  UTC) since 2026-06-21; posts a finding only on breach/watch.
  → `docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md`
- **AIOS agent-loop audit (3 gaps)** — the `make-validator` meta-skill, `/internal/loops`
  mission control, and the runtime-spend source of truth that makes `donny_cost_ledger` govern
  the AI kill-switch. The `ai-cost-vs-cap` verdict now runs unattended weekly (Mon 13:00 UTC).
  → `docs/wiki/concepts/aios-runtime-spend-source-of-truth.md` · #217, #218, #220
- **AIOS Strategy-library management** — `is_core` protection, reversible soft-archive, dedup
  RPCs, an archive-aware sync, and a monthly audit routine (live, 1st of month 09:00 UTC)
  filing dupe/conflict/orphan/bloat findings for the founder to action.
  → `docs/superpowers/specs/2026-06-29-aios-strategy-library-management-design.md`
- **Dezzy AI Press & Events scout (Domain 4)** — the one Dezzy domain shipping as a cloud
  routine, not a playbook (press discovery needs the open web the runner lacks). Live monthly
  (1st, 08:00 UTC), filing URL-required, deduped `[press]`/`[event]` findings.
  → `docs/wiki/concepts/dezzy-agent-playbook-suite.md`
- **Session context-tax reduction** — §5 split into this index + the non-auto-loaded
  `docs/SHIPPED_LOG.md`, and both generators amended so it cannot regrow; 176,620 → 73,742 B
  (−58% per-session load). Paired triage scheduled 3 report-only routines.
  → `docs/wiki/concepts/context-tax.md` · #294, #295
- **AIOS Reading agent traces (4th loop-stack layer)** — the `read-the-traces` skill reads Claude
  Code's own JSONL session traces (598 files, ~40MB nothing had ever read): tool errors,
  permission/classifier events, hook failures, repeat-failure clusters, per-skill error rates.
  **Project-local, and deliberately NOT a validator** — it shipped as one (global, emitting the
  `{done,checklist,missing}` block), and both were reverted the same day after it produced three
  misleading findings out of five. The judgment layer was **removed rather than tuned**: a
  misclassifying judge that keeps a machine-readable verdict contract is one wiring change from
  automating its own errors ("never automate a broken process"). The extraction layer, correct
  throughout, was kept — treat its output as leads to verify, never conclusions. Also repaired
  `donny-orchestrator`'s `donny_tool_executions` insert (columns that did not exist + a missing
  NOT NULL `message_id`) → deployed v69. → `docs/wiki/concepts/reading-agent-traces.md` · #292, #296
- **Public landing — "Human-driven. AI-assisted." redesign** — full visual + messaging rebuild
  to the founder mockup; landing rejoins the light app on its own additive `landing-*` tokens +
  fonts. The cinematic-video system is preserved but opt-in behind
  `LANDING_VIDEO_BACKDROP_ENABLED` (default off).
  → `docs/wiki/concepts/landing-human-driven-redesign.md` · #293
- **Auth session management** — loading guard, 3-hour inactivity timeout, session-hint
  cleanup. → `docs/SHIPPED_LOG.md`
- **Dashboard UX polish** — ongoing practice: badge sizing, avatar cache invalidation,
  relative timestamps, cross-role status sync. → `docs/SHIPPED_LOG.md`
- **RLS compliance & query optimization** — ongoing practice: no recursive policies, no
  RLS-blocked nested profile joins. → `docs/SHIPPED_LOG.md`
- **DragonShare amplification engine** — live (web): trust-then-flag uploads, watermarked
  preview, $5–$500 boosts on Stripe Connect (80/20), `dragonshare-notify` fanout.
  → `docs/SHIPPED_LOG.md`
- **GTM Capital & CAC Playbook** — standing plan: Phase 0–3 budget gates + kill-switches;
  creators before restaurants in each market. → `docs/SHIPPED_LOG.md`
- **QA staging & CI-CD gate** — CI gate, staging Supabase and an e2e smoke gate all in
  place; fixed the prod-hardwired-client split-brain. → `docs/SHIPPED_LOG.md`
- **Legal & compliance** — Privacy Policy + Terms of Service pages. → `docs/SHIPPED_LOG.md`
- **DragonCandy AIOS** — the `/internal` dashboard: live stats, revenue vs burn, strategy
  library, Internal Donny, two Monday routines, all writes via `aios-report-ingest`.
  → `docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md`
- **AIOS Donny gated corrections** — Donny *proposes*; a founder approves at
  `/internal/corrections`; "Open wiki PR" / "Save to knowledge" write back as PRs, never a
  push. → `docs/superpowers/specs/2026-06-17-donny-aios-corrections-design.md`
- **AIOS ingest-secret key rotation hardening** — `_shared/ingest-auth.ts` accepts the
  injected service-role key or `AIOS_INGEST_SECRET`, un-breaking the 3am routines.
  → `docs/SHIPPED_LOG.md` · #129
- **AIOS automation loops** — `knowledge-freshness-agent` upgraded detector→self-healer +
  monthly Loop Scout; both live, first run triaged (2 crons built).
  → `docs/superpowers/specs/2026-06-19-aios-loop-automation-design.md` · #130, #133, #134
- **AIOS Founder Playbooks** — saved repeatable internal tasks, report-only + propose through
  the corrections gate. Donny's conversational playbook tools deferred.
  → `docs/superpowers/specs/2026-06-19-aios-founder-playbooks-design.md` · #132
- **AIOS Workspace reading, Strategy-library import & in-UI knowledge merge** — Donny reads
  AIOS Drive docs; `wiki-merge-pr` + a "Pending knowledge" panel merge wiki PRs in-UI,
  deleting the GitHub trip from every knowledge capture. All three edge functions are
  deployed and live.
  → `docs/superpowers/specs/2026-06-20-aios-workspace-knowledge-merge-design.md` · `feat/aios-workspace-knowledge-merge`
- **AIOS Validator Skills → closeable loops** — one `{done,checklist,missing}` verdict
  contract; `verify-knowledge` + a bounded verify→fix loop in `knowledge-sync`.
  → `docs/superpowers/specs/2026-06-20-validator-skills-loops-design.md` · `validator-skills-loops`
- **AIOS Internal Donny reliability** — tool-pairing replay fix (400) + NDJSON keepalive
  streaming (150s idle-timeout 504). Server-side abort deferred.
  → `docs/wiki/concepts/edge-function-streaming.md` · #146, #148
- **AIOS patch-based strategy-doc corrections** — Donny proposes find/replace `edits`
  reconstructed server-side; heavy corrections drop from ~130s to seconds.
  → `docs/wiki/concepts/patch-based-corrections.md` · #151, #152
- **AIOS Loop Memory Protocol** — each loop skill keeps a two-zone `MEMORY.md`. Phase 2
  (DB-backed memory for cloud routines) designed but deferred.
  → `docs/wiki/concepts/loop-memory-protocol.md` · #161
- **AIOS security-advisor triage** — 149 prod advisors triaged read-only, then deliberately
  shelved pre-launch. No changes made.
  → `docs/wiki/concepts/security-definer-advisor-triage.md`
- **Test-mode Stripe UX** — one-tap payout onboarding + card-only checkout, gated on a test
  key so live mode is byte-unchanged. → `docs/wiki/concepts/test-mode-stripe-ux.md` · #168
- **Stripe webhook revival + payout-flag reliability** — trust-true/verify-false
  `verifyPayoutReady` at every payout gate + dual platform/Connect secrets. The
  `release-sponsorship-payout` deploy stays deferred (no live traffic).
  → `docs/wiki/concepts/stripe-webhook-delivery.md` · #173, #174
- **AIOS Stakeholder invites** — admin-only internal-account invites; `handle_new_user` skips
  consumer profiles for `account_scope='internal'`. Live — first user active.
  → `docs/superpowers/specs/2026-06-26-aios-stakeholder-invite-design.md` · `feat/aios-stakeholder-invite`
- **AIOS internal dashboard UI polish** — sidebar shell, mobile drawer, pinned "Ask Donny",
  shared page primitives. → `docs/wiki/concepts/aios-internal-shell.md` · #179
- **AIOS internal-only user FK fix** — three AIOS FKs repointed to `auth.users(id)` + a
  `describeError` normalizer. → `docs/wiki/concepts/internal-only-users.md` · #180
- **AIOS Internal Donny "Profile not found"** — `resolveDonnyProfile()` synthesizes a profile
  for internal-only users; `.maybeSingle()`, never `.single()`+throw.
  → `docs/wiki/concepts/internal-only-users.md` · #185, #180
- **Dezzy AI — Outreach Machine (Domain 3)** — report-only `dezzy-outreach` +
  `get_reactivation_targets` (public handles only, never emails). Auto-send deferred to v1.5+.
  → `docs/wiki/concepts/dezzy-agent-playbook-suite.md` · `worktree-DC-Dezzy-AI`
- **Dezzy AI content playbooks (Domains 1+2)** — draft-only `dezzy-content-calendar` +
  `dezzy-website-updates`, seeded on prod. → `docs/wiki/concepts/dezzy-content-playbooks.md` · #190
- **Dezzy AI Weekly Operating Brief (Domain 5)** — an admin-only action console orchestrating
  (not embedding) the detail playbooks; seeded on prod.
  → `docs/wiki/concepts/dezzy-agent-playbook-suite.md` · `feat/aios-dezzy-weekly-brief`
- **Dezzy AI SEO articles (Domain 6 slice)** — one publish-ready SEO article per run for $0
  organic acquisition; seeded on prod.
  → `docs/wiki/concepts/dezzy-agent-playbook-suite.md` · #196
- **Dragon Rewards Engine (DRE) v1** — points ledger, idempotent award engine, 5 tiers +
  badges; live since 2026-06-28, when both launch switches were thrown in one transaction
  (`go_live_at` set and `DRAGON_REWARDS_ENABLED` on). Later phases (referrals, streaks,
  redemption) deferred. → `docs/wiki/concepts/dragon-rewards-engine.md` · #191
- **Dragon Rewards UI launch gate** — rewards UI gated behind `DRAGON_REWARDS_ENABLED` (a
  public-read flag, since public profiles are anon-accessible); launch is two switches.
  → `docs/wiki/concepts/dragon-rewards-engine.md` · `feat/dre-ui-launch-gate`
- **DRE rewards rename to "Creator standing"** — display-only relabel (Rep;
  Rising→Icon); tier keys, tables and flag unchanged.
  → `docs/wiki/concepts/dragon-rewards-engine.md` · `feat/dre-rename-creator-standing`
- **Anonymous brief generator repair** — `generate-anonymous-brief` rewritten self-contained
  with a daily cap, honeypot and hardened SSRF guard.
  → `docs/wiki/concepts/anonymous-brief-generator.md` · #204
- **Dezzy AI milestone celebrations (Domain 6 core)** — `get_recent_milestones` + a
  #DragonDashed draft playbook; deployed, seeded, data-layer verified. Tier-up celebrations
  deferred. → `docs/wiki/concepts/dezzy-agent-playbook-suite.md` · `feat/dezzy-milestone-celebrations`
- **Landing brief-save + Business CTAs + nav** — a guest's saved brief now actually reloads
  into the campaign builder after signup; "Join as a Business" CTA; dead nav anchors fixed.
  → `docs/wiki/concepts/anonymous-brief-generator.md` · `feat/landing-fixes-brief-save`
- **Landing old-design flash fix + performance pass** — stale prerendered white shell replaced
  with a dark splash; route code-split, one shared `IntersectionObserver`.
  → `docs/wiki/concepts/landing-shell-and-performance.md` · `fix/landing-flash-and-perf`
- **Dev tooling — `roast` + `storm-research` ported** — installed global-primary; new generic
  skills default to global scope. AIOS port deferred.
  → `docs/superpowers/specs/2026-07-06-port-roast-storm-skills-design.md` · `feat/port-roast-storm-skills`
- **Find Creators "near me" search** — location + radius control (default near-me,
  nearest-first, "N mi away"), client-side over the existing geo stack.
  → `docs/wiki/concepts/creator-location-search.md` · `feat/find-creators-location-search`
- **Creator Groups + private group campaigns** — a business's crew is the only audience that
  sees and one-tap applies to a free private campaign; gates are DB-enforced.
  → `docs/wiki/concepts/creator-groups.md` · #226
- **Crews Phase 2 — activity & notifications** — `crew_activity` written only via the
  forge-proof RPC, asymmetric RLS, exactly one new notification.
  → `docs/wiki/concepts/creator-groups.md` · `feat/crews-phase2-activity`
- **Dev tooling — Claude capability audits** — shipped the `careful` skill + the read-only
  `edge-function-reviewer` subagent; other subagents deferred.
  → `docs/wiki/analyses/claude-skills-framework-audit.md` · #216, #219
- **Mobile screen-fit** — `PageTransition` is opacity-only by contract (its transform trapped
  every `position:fixed` child); sheets sized in `dvh` + safe-area.
  → `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` · #224
- **Schedule/Calendar agenda-first simplification** — one scrolling day-by-day agenda by
  default on both viewports; desktop grids kept as a toggle.
  → `docs/wiki/concepts/schedule-agenda-view.md` · `worktree-DC-20`
- **Donny chat → campaign builder reliability** — the mobile sheet closes before navigating,
  generation moved to an async job + own-row polling, and tools forward the caller's own
  credential. → `docs/wiki/concepts/edge-function-streaming.md` · #230, #232, #151, #234
- **Prod hosting → Vercel cutover** — `dragoncandy.io` serves from Vercel (env scopes
  verified, domains attached, DNS flipped); Lovable retained only as an AI-edit surface.
  → `docs/runbooks/vercel-prod-cutover.md` · `worktree-lovable-slow`
- **DragonFeed mobile vertical feed** — a single-column feed on mobile, JS-branched so only
  one media tree mounts; desktop grid unchanged. → `docs/wiki/concepts/dragon-feed.md` · #242
- **DragonFeed Instagram-style creator search** — one box, two modes: empty → media feed;
  name and/or location → a vertical creator list narrowed by radius.
  → `docs/wiki/concepts/dragon-feed.md` · `feat/dragonfeed-creator-search`
- **Donny desktop panel fixed-overlay** — the panel left the flex flow, so `<main>` keeps full
  width and pages stop squishing.
  → `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` · #236
- **AI creator matching fix** — "Found 0" was a swallowed `campaign_matches` INSERT (numeric
  overflow + a bad trigger branch), not scoring; geo scoring rewritten to real haversine.
  → `docs/wiki/concepts/ai-creator-matching.md` · `worktree-dc-issues-3`
- **Donny campaign-idea creativity** — the weak ideas were the prompt, not the model: freed
  prompt, a wildcard per batch, a premium 8192-token tier with a Sonnet floor.
  → `docs/wiki/concepts/campaign-generation-creativity.md` · #243
- **Donny web access** — `web_search` + `read_url` client tools on Tavily (server-side fetch,
  so no SSRF surface), live on both Donny surfaces and metered off `donny_cost_ledger` rows.
  Response caching + per-tier caps deferred.
  → `docs/wiki/concepts/donny-web-access.md` · `feat/donny-web-access`
- **Donny chat `match_creators` fix** — two ANDed hard `ilike` filters replaced by
  fetch-broad→score-soft→rank; service-role queries re-assert `profile_visibility='public'`.
  → `docs/wiki/concepts/ai-creator-matching.md` · #241
- **Web Donny "find creators near me"** — the consumer chat calls `donny-orchestrator`, not
  `donny-chat`: added a `find_creators` sub-agent over the shared scorer; live-verified.
  → `docs/wiki/concepts/ai-creator-matching.md` · #246, #249
- **Public landing cinematic AI-video redesign** — morphing per-role hero, the swappable
  `landingClips` seam (now populated), Lean-6 structure, honest empty proof slot.
  → `docs/wiki/concepts/landing-cinematic-video-redesign.md` · `worktree-dc-landing-page-upgrade`
- **Landing DragonFeed hero backdrop adapter** — real boosted DragonShare video feeds the hero
  behind the curated clips, with an error-skip and a max-dwell watchdog.
  → `docs/wiki/concepts/landing-cinematic-video-redesign.md` · #268, #273
- **Web Donny rich creator cards** — a deterministic card side-channel bypassing the LLM
  persists `donny_messages.rich_cards`; backend live and the frontend has landed.
  → `docs/wiki/concepts/ai-creator-matching.md` · `feat/donny-rich-creator-cards`
- **Donny data visibility + quick-action 404** — schema-drift SELECTs silently returning `[]`,
  plus an `isKnownRoute` allow-list killing LLM-invented routes; closed a service-role IDOR.
  → `docs/wiki/concepts/donny-data-and-quick-actions.md` · #260, #248, #251
- **Donny first-open UX** — a shared `DonnyPanelHeader` gives the tray a ✕ (users were trapped
  until they sent a message) + desktop close-on-outside-click.
  → `docs/wiki/concepts/donny-chat-ux.md` · #258
- **App theme — light app + dark marketing/entry** — the whole-app-dark experiment reverted;
  dark scoped to landing, auth and onboarding via `useDarkHtml()`, plus `/internal`.
  → `docs/wiki/concepts/dark-luxe-app-theme.md` · #275, #277, #269
- **Light-theme polish** — the shared light-app kit
  (`PageBody`/`AppCard`/`AppChip`/`AppStatusBadge`); all four surface groups plus a cross-app
  backgrounds/off-brand-accent pass are on the kit.
  → `docs/wiki/concepts/light-app-kit.md` · #280, #282, #285, #288, #289

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
Framer Motion, Vercel (prod hosting + per-PR staging previews), Lovable.dev (optional
AI-edit surface via GitHub sync; no longer the host), GitHub.
**Backend**: Supabase (70+ tables, 80 Deno Edge Functions, RLS, realtime),
Stripe Connect (test mode).
**AI**: Claude Sonnet 4 + Haiku for generation (cost routing via edge
functions, backend only); OpenAI for embeddings (RAG/matching). Model routing
and cost ledger in `_shared/`.
**Social**: Outstand.so (Instagram, TikTok, YouTube integration).
**Integrations**: Toast POS (restaurant discounts), Google Maps (geocoding).
**Knowledge management**: NotebookLM.

**Key project documents**:
- `CLAUDE.md` — developer guidance + design system import
- `docs/SHIPPED_LOG.md` — full prose changelog of shipped work (not auto-loaded; §5 indexes it)
- `docs/STRIPE_PRICES.md` — pricing source of truth
- `docs/DragonCandy_Strategy_Briefing.md` — competitive strategy
- `docs/DragonCandy_Moat_Playbook.md` — competitive defensibility
- `docs/DragonCandy_Engineering_Blueprint.md` — build guidance
- `docs/content-delivery-system-flows.md` — state machines and flows
- Outstand integration spec (`docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`)
