# Wiki Index

## Sources

- [[Apple App Store Capacitor Phase 1 Session]](sources/apple-app-store-capacitor-phase1-session.md) — Capacitor iOS foundation: one codebase for web + iPhone, payments split by surface (2026-06-01)
- [[Campaign Delivery, Scheduling & Notifications Session]](sources/campaign-delivery-scheduling-notifications-session.md) — Content-delivery stabilization, notification system, auto cross-scheduling, Donny strategist, revision sync (2026-06-01)
- [[Code Architecture Audit Remediation]](sources/code-architecture-audit.md) — TypeScript strict mode, type safety, and codebase cleanup (2026-05-04)
- [[Karpathy LLM Wiki Schema]](sources/karpathy-llm-wiki-schema.md) — Operating schema for LLM-maintained knowledge bases; inspiration for this wiki's two-layer architecture (2026-05-24)
- [[Code Architecture Audit Session]](sources/code-architecture-audit-session.md) — Strict mode enablement, 158 unused imports, 34 type errors, Supabase type regeneration (2026-05-04)
- [[Content Delivery System Flows]](sources/content-delivery-system-flows.md) — Complete content delivery lifecycle across all three roles (2026-05-23)
- [[Content Engine Phase B Session]](sources/content-engine-phase-b-session.md) — Brief → DragonShare action shipped + verified (3 slices); deep-link race fix; Phase C next (2026-06-11)
- [[Content Engine Phase C Session]](sources/content-engine-phase-c-session.md) — Return-half link: dragonshare_post_id + first-wins triggers bridge published post → brief → performance; PR #73; spec-anchored (2026-06-11)
- [[Content Engine Phase D Session]](sources/content-engine-phase-d-session.md) — Creator "Your content briefs" card shipped; ownership-gated definer RPC bridges the cross-user RLS gap; verified prod (2026-06-11)
- [[Core Docs Recent Updates Sync Session]](sources/core-docs-recent-updates-sync-session.md) — Post–June-2 sync: DragonShare notifications, iOS camera, legal pages, Outstand recovery, QA Plan C, scale → 73 functions (2026-06-07)
- [[Google Workspace Connections Session]](sources/google-workspace-connections-session.md) — AIOS Connections pillar: per-user OAuth, Drive hub, ops-deck restyle, Donny export, Gmail compose deep-link, metrics Sheet, Chat scaffold; 6 PRs (2026-06-13)
- [[Wiki-Commit-PR Session]](raw/sessions/2026-06-18-wiki-commit-pr.md) — admin-gated "Open wiki PR" button: applied strategy-doc correction → GitHub PR back to docs/wiki/ so it survives the next donny-knowledge-sync; PR-only, idempotent, GITHUB_WIKI_TOKEN gate (2026-06-18)
- [[Donny Answer to Wiki Session]](raw/sessions/2026-06-18-donny-answer-to-wiki.md) — admin-gated "Save to knowledge" button: a fresh internal Donny answer → GitHub PR creating a NEW docs/wiki/<concepts|analyses> page → Donny RAG on merge; sibling of wiki-commit-pr with a stricter client-input guard, PR-only (2026-06-18)
- [[AIOS Ingest-Secret Rotation Session]](raw/sessions/2026-06-18-aios-ingest-secret-rotation.md) — new Supabase sb_secret key rotated prod's service-role credential → AIOS 3am routines + content cron 401'd for a week; fixed with a shared ingest-auth gate accepting injected key OR a stable AIOS_INGEST_SECRET; PR #129, deployed + verified (2026-06-18)
- [[Counter-Offer Enum Fix Session]](sources/counter-offer-enum-fix-session.md) — Postgres enum cast bug, PL/pgSQL variable typing, missing campaign_status value (2026-05-21)
- [[Database Schema]](sources/database-schema.md) — Supabase Postgres schema overview (2026-05-23)
- [[Donny Audit Phase 1 Session]](sources/donny-audit-phase1-session.md) — Role-based tool filtering, prompt injection defense, tier-based token clamping (2026-05-06)
- [[Donny Audit Phase 2 Session]](sources/donny-audit-phase2-session.md) — Quota enforcement, SSE streaming, dual auth, upgrade CTAs (2026-05-06)
- [[Donny Campaign Pre-fill Session]](raw/sessions/2026-06-18-donny-campaign-prefill.md) — Donny chat hands a brief to the Create-a-Campaign builder via ?brief= → opens pre-filled on the Launchpad; new prepare_campaign tool; broken /campaigns/new route fixed; PR #124 (2026-06-18)
- [[Donny Chat Input & Timestamps Session]](sources/donny-chat-input-timestamps-session.md) — expanding `<textarea>` prompt (was single-line, scrolled text off-screen) + per-message timestamps & teal date dividers; shared across consumer + internal Donny; light-vs-dark forced time-inside-bubble; Codex caught a tool-row day-grouping bug; PR #140 (2026-06-20)
- [[Investor Pitch Deck & Cost Model Session]](sources/investor-pitch-deck-cost-model-session.md) — /pitch deck (15 slides) + sourced ~$3M capital-raise cost model; brands woven in; Donny super-agent Vision slide (2026-06-17)
- [[DragonShare Amplification Engine Session]](sources/dragonshare-amplification-engine-session.md) — Upload-first submit, trust-then-flag, watermark, two-path boost payment, 80/20 split (2026-06-01)
- [[Loop Scout First Run]](raw/sessions/2026-06-20-loop-scout-first-run-builds.md) — AIOS Loop Scout's first batch triaged 2 built / 2 wontfix / 1 acknowledged; shipped expire-social-hooks + expire-email-verification-tokens crons; Codex caught a verify_jwt P1; aios_ingest_key Vault landmine fixed (2026-06-20)
- [[Founder Playbooks Session]](raw/sessions/2026-06-19-aios-founder-playbooks.md) — AIOS Founder Playbooks v1: saved repeatable internal tasks Donny runs on demand (report-only + propose); self-contained aios-playbook-run under the caller session JWT; the landing spot for Loop Scout candidates; + the verify-db-schema dev skill; PR #132 (2026-06-19/20)
- [[AIOS Workspace Knowledge-Merge Session]](raw/sessions/2026-06-20-aios-workspace-knowledge-merge.md) — Donny reads AIOS docs (read_file/workspace_read_file), import a Workspace doc → Strategy library, and in-UI approve+merge of wiki PRs (wiki-merge-pr) into RAG + library — no GitHub/Lovable trip; 3 slices, Codex-clean after 4 fix waves (2026-06-20)
- [[Validator Skills → Loops Session]](raw/sessions/2026-06-20-validator-skills-loops.md) — standardized one verdict-block contract (reuses Founder Playbooks done_check), added the verify-knowledge validator + a bounded knowledge-sync loop, taught Loop Scout to score condition-2 by validator presence; the validator caught 2 real pre-existing wiki orphans on its first run (2026-06-20)
- [[AIOS Kill-switch Playbook + Loop-callable Playbooks Session]](sources/aios-killswitch-playbook-loop-session.md) — A1: report-only kill-switch-watch Founder Playbook (PROJECT_CONTEXT §3 guardrails as an executable check, armed-watch scaffold); A4: made playbooks loop-callable via a playbook-runner cloud-routine (execute_sql + capability map, deduped finding on breach only) — no schema/edge-fn/secret/auth change; Codex-clean (2026-06-20)
- [[Patch-Based Corrections Session]](sources/patch-based-corrections-session.md) — internal Donny corrects a strategy doc via small find/replace edits (server reconstructs the full doc, downstream unchanged), cutting the ~130s correction turn to seconds + ending the mobile streamed-fetch "Load failed"; backtick-in-template-literal deploy gotcha; PRs #151/#152 (2026-06-21)
- [[Loop Memory & Security Triage Session]](raw/sessions/2026-06-24-loop-memory-and-security-triage.md) — shipped the [[Loop Memory Protocol]] (Phase 1, PR #161); the #161 conflation/merge/edge-deploy + verify-prod lazy-chunk blind spot; and a full read-only [[SECURITY DEFINER Advisor Triage]] (149 advisors) that was DELIBERATELY DEFERRED pre-launch (2026-06-24)
- [[Notification Email Audit Session]](sources/notification-email-audit-session.md) — a dead invitation-email button cascaded into auditing every notification email; found the self-only auth gate was 403-dropping 9 transactional emails sent frontend→counterparty; rerouted via create-notification + added 3 missing templates; PR #161 (2026-06-23)
- [[Origin Story & Knowledge-Sync Automation Session]](sources/origin-story-sync-automation-session.md) — Authored the canonical DragonCandy origin story into the strategy library (one story, three-sided vision woven in; Joe Castelo=CEO corrections) + built the [[Knowledge-Sync Automation]] (npm aliases + auto post-merge hook + installer); 9 PRs #154–#162 (2026-06-21/22)
- [[Project Context]](sources/project-context.md) — Project identity, strategy, and operating instructions (2026-05-23)
- [[QA Staging Supabase (Plan B) Session]](sources/qa-staging-supabase-planb-session.md) — Isolated staging Supabase for the CI/CD gate; 213-migration replay, secrets, Stripe sandbox alignment (2026-06-02)
- [[Realtime Edge Cases Session]](sources/realtime-edge-cases-session.md) — Race conditions, presence ghost state, keepalive, single-slot triggers (2026-05-06)
- [[SEO Audit Session]](sources/seo-audit-session.md) — react-helmet-async, JSON-LD, sitemap, h1 hierarchy, a11y fixes (2026-05-05)
- [[Stripe Prices]](sources/stripe-prices.md) — Definitive pricing reference, all test mode (2026-05-23)

## Entities

- [[Capacitor Native Shell]](entities/capacitor-native-shell.md) — iOS delivery surface; wraps the web build in a native shell (Phase 1 shipped)
- [[Donny AI]](entities/donny-ai.md) — Intelligence layer: campaign generation, creator matching, analytics, scheduling
- [[DragonCandy Platform]](entities/dragoncandy-platform.md) — AI-powered creator-restaurant marketplace
- [[DragonDash]](entities/dragondash.md) — Premium rush content delivery, the profit engine
- [[DragonShare]](entities/dragonshare.md) — Organic-content amplification engine, 80/20 boost payments
- [[File Management]](entities/file-management.md) — Content-deliverable system: file_uploads + versions/permissions/comments/tags, private buckets + signed URLs
- [[Google Workspace]](entities/google-workspace.md) — AIOS Connections: per-user OAuth, Drive hub, Donny export, Gmail deep-link, metrics Sheet, Chat scaffold (dark)
- [[Organizations]](entities/organizations.md) — Team accounts: parent org → org units (locations/products) → members; multi-unit, seat billing, RLS
- [[Outstand]](entities/outstand.md) — Social-posting bridge (Instagram, TikTok, YouTube); delegated posting, account recovery
- [[Stripe Connect]](entities/stripe-connect.md) — Payment infrastructure, escrow, subscriptions, boosts (test mode)
- [[Supabase]](entities/supabase.md) — Backend: Postgres, Auth, Edge Functions, Realtime, RLS

## Concepts

- [[Campaign Lifecycle]](concepts/campaign-lifecycle.md) — Draft through completion, applications, sponsorship
- [[Content Delivery State Machine]](concepts/content-delivery-state-machine.md) — 9-status flow from pending through resolved
- [[Content Engine]](concepts/content-engine.md) — Live-signal loop: brief → DragonShare action → performance; Phases A+B+C+D built (loop closed + surfaced to creators, verified prod)
- [[Data Flywheel]](concepts/data-flywheel.md) — Primary competitive moat via accumulated match data
- [[Deep-Link Param Query Race]](concepts/deep-link-param-query-race.md) — Capture deep-link URL params at mount; URL-cleanup tears down queries mid-flight
- [[Donny Chat UX]](concepts/donny-chat-ux.md) — Shared chat components on two opposite-theme surfaces (light consumer / dark internal); the light-vs-dark rule (time inside bubbles, teal divider chip), expanding-textarea input, hidden-tool-row day-grouping, tray-vs-chat input split
- [[Edge Function Streaming]](concepts/edge-function-streaming.md) — Keepalive NDJSON streaming to beat Supabase's 150s request idle timeout (Pro = 400s wall-clock); early first byte, pure SSE accumulator, unified callModel/runTurn, client-cancel handling, graceful version skew
- [[Error Handling Patterns]](concepts/error-handling-patterns.md) — ErrorBoundary levels, QueryClient throwOnError, async patterns
- [[Founder Playbooks]](concepts/founder-playbooks.md) — Saved repeatable internal tasks Donny runs on demand (report-only + propose); the landing spot for Loop Scout candidates; self-contained runner under the caller session JWT
- [[In-UI Knowledge Merge]](concepts/in-ui-knowledge-merge.md) — Review + merge wiki knowledge PRs inside /internal (wiki-merge-pr), syncing into Donny's RAG + Strategy library — no GitHub visit, no Lovable deploy; preserves the human-merge gate; unifies Save-to-knowledge, corrections, and Workspace-doc import
- [[Investor Pitch Deck & Capital Raise]](concepts/investor-pitch-deck.md) — Brand-faithful /pitch deck + ~$3M cost model (50/30/20); fixed 1280×720 canvas, gitignored PDF, prod-build-only; Donny super-agent Vision
- [[Knowledge-Sync Automation]](concepts/knowledge-sync-automation.md) — npm run sync:internal/sync:wiki (no key pasted, via with-env.mjs + gitignored .env.sync.local) + auto post-merge git hook + committed installer; keeps Donny's RAG/strategy library current on docs/ merges; Windows pathToFileURL + verify-by-content gotchas
- [[Loop Memory Protocol]](concepts/loop-memory-protocol.md) — Two-zone MEMORY.md (curated Lessons read-first + append-only Run Log) co-located per loop skill; the loop self-improves across runs; Output is a pointer to existing artifacts, not a duplicate; reuses the validator verdict block as the failure feed
- [[Migration Replay Drift]](concepts/migration-replay-drift.md) — Prod schema diverged from migration files; 7 defect classes when replaying onto a clean DB
- [[Musk's Algorithm]](concepts/musks-algorithm.md) — Question → Delete → Simplify → Accelerate → Automate
- [[Notification Delivery]](concepts/notification-delivery.md) — create-notification is the choke point for cross-user notices (bell + service-key email); send-notification-email's self-only gate 403s frontend cross-user sends; category drives default email; template/button conventions
- [[Patch-Based Corrections]](concepts/patch-based-corrections.md) — Donny corrects a strategy doc via small find/replace edits; the server reconstructs the full doc (downstream unchanged), cutting the ~130s correction turn to seconds; PRs #151/#152
- [[Payments Split by Surface]](concepts/payments-split-by-surface.md) — Stripe for marketplace on all surfaces; subscriptions web-only to avoid Apple's 30%
- [[Pricing Architecture]](concepts/pricing-architecture.md) — Four stacked revenue streams per customer
- [[QA CI/CD Gate]](concepts/qa-cicd-gate.md) — Automated quality gate + staging env between code and prod; human ship gate; Plans A/B/C
- [[SECURITY DEFINER Advisor Triage]](concepts/security-definer-advisor-triage.md) — 3-signal method (frontend .rpc? / referenced in an RLS policy? / returns trigger?) to classify Supabase definer-function security advisors into keep-by-design vs safe-to-revoke; 2026-06-24 snapshot 43 keep / 32 revoke-safe; DELIBERATELY DEFERRED pre-launch (too risky), no changes made
- [[Self-Improving App]](concepts/self-improving-app.md) — Autoresearch loop (Karpathy pattern, domain-swapped) that grows the wiki + Donny; 5-phase smart-app roadmap; the 4-Condition Test, knowledge-freshness self-heal, and the monthly Loop Scout
- [[Take-Rate Ladder]](concepts/take-rate-ladder.md) — Tiered platform fees from 10% (Free) to 2% (Enterprise)
- [[Trust-Then-Flag Model]](concepts/trust-then-flag-model.md) — DragonShare moderation: post live immediately, flag post-hoc (no admin queue)
- [[Two-Path Boost Payment]](concepts/boost-payment-two-path.md) — Hosted checkout first, off-session repeat, idempotent fulfillment
- [[TypeScript Patterns]](concepts/typescript-patterns.md) — Strict mode, type safety, export conventions
- [[Validator Skills]](concepts/validator-skills.md) — skills that emit a machine-readable verdict block to close generate→validate loops

## Flow Diagrams

- [[Feature Flows]](../flows/README.md) — Index + system map for all visual feature-flow docs
- [[Campaign Lifecycle Flow]](../flows/campaign-lifecycle.md) — Create → apply → deliver → approve → download → auto-post (Mermaid)
- [[DragonShare Flow]](../flows/dragonshare.md) — Upload → boost-or-pass → two-path payment → fulfillment → notify
- [[Promotions / CGC Flow]](../flows/promotions-cgc.md) — Promotion → anonymous submission → approve → discount code → cross-post
- [[Onboarding Flow]](../flows/onboarding.md) — Signup → role selection → wizard → first-run missions
- [[Stripe Payments Flow]](../flows/stripe-payments.md) — Escrow, payout, sponsorship, boost, Connect, take-rate ladder
- [[Creator Journey]](../flows/creator-journey.md) — Creator's cross-feature path
- [[Restaurant Journey]](../flows/restaurant-journey.md) — Restaurant's cross-feature path

## Analyses

- [[18-Month Tech Engineering & Donny AI]](analyses/18-month-tech-engineering-donny-ai-1m-users.md) — Donny-captured analysis: 18-month tech engineering & Donny AI plan toward 1M users
- [[Content Engine Data Audit]](analyses/content-engine-data-audit.md) — what signal data exists in prod for the Donny content engine; context live, performance dark, Toast/social-cache tables missing from prod; foundation-first plan
- [[DragonCandy Tech & Infrastructure Cost Breakdown]](analyses/here-s-the-exported-doc-dragoncandy-tech-infrastructure-cost-breakdown-nyc-media.md) — Donny-captured analysis: NYC-median tech & infrastructure cost breakdown for the capital raise
- [[Human Marketing Team (Part 1)]](analyses/part-1-the-human-marketing-team.md) — Donny-captured analysis: the human marketing team (part 1)
- [[North Star & KPI Scorecard]](analyses/north-star-kpi-scorecard.md) — Three-year targets + kill-switches operationalized and validated against 2025 SMB-SaaS benchmarks; flags churn-unit ambiguity and a mis-scoped rev/employee gate
- [[PART 1 — Engineering & AIOS Operations]](analyses/part-1-engineering-aios-operations.md) — Donny-captured analysis: engineering & AIOS operations (part 1)
- [[Platform API Registration Plan]](analyses/platform-api-registration-plan.md) — running checklist to swap Outstand for direct Meta/X/TikTok/YouTube + Toast access; per-platform requirements, lead times, Meta deep-dive; unblocks the dark Content Engine signal
- [[Tech & Infrastructure Cost Breakdown (Updated)]](analyses/tech-infrastructure-cost-breakdown-updated.md) — Donny-captured analysis: updated tech & infrastructure cost breakdown for the capital raise
