# Wiki Index

## Sources

- [[Apple App Store Capacitor Phase 1 Session]](sources/apple-app-store-capacitor-phase1-session.md) — Capacitor iOS foundation: one codebase for web + iPhone, payments split by surface (2026-06-01)
- [[CI Quality Gate Plan A Session]](sources/ci-quality-gate-plan-a-session.md) — GitHub Actions CI gate: build/typecheck/lint/test on PRs; Vitest e2e exclusion; timezone-hermetic tests (2026-06-01)
- [[Karpathy LLM Wiki Schema]](sources/karpathy-llm-wiki-schema.md) — Karpathy's LLM-as-wiki-OS schema: raw/wiki layering, ingest/query/lint operations, wikilink cross-references (2026-05-24)
- [[Campaign Delivery, Scheduling & Notifications Session]](sources/campaign-delivery-scheduling-notifications-session.md) — Content-delivery stabilization, notification system, auto cross-scheduling, Donny strategist, revision sync (2026-06-01)
- [[Code Architecture Audit Remediation]](sources/code-architecture-audit.md) — TypeScript strict mode, type safety, and codebase cleanup (2026-05-04)
- [[Code Architecture Audit Session]](sources/code-architecture-audit-session.md) — Strict mode enablement, 158 unused imports, 34 type errors, Supabase type regeneration (2026-05-04)
- [[Content Delivery System Flows]](sources/content-delivery-system-flows.md) — Complete content delivery lifecycle across all three roles (2026-05-23)
- [[Counter-Offer Enum Fix Session]](sources/counter-offer-enum-fix-session.md) — Postgres enum cast bug, PL/pgSQL variable typing, missing campaign_status value (2026-05-21)
- [[Database Schema]](sources/database-schema.md) — Supabase Postgres schema overview (2026-05-23)
- [[Donny Audit Phase 1 Session]](sources/donny-audit-phase1-session.md) — Role-based tool filtering, prompt injection defense, tier-based token clamping (2026-05-06)
- [[Donny Audit Phase 2 Session]](sources/donny-audit-phase2-session.md) — Quota enforcement, SSE streaming, dual auth, upgrade CTAs (2026-05-06)
- [[DragonShare Amplification Engine Session]](sources/dragonshare-amplification-engine-session.md) — Upload-first submit, trust-then-flag, watermark, two-path boost payment, 80/20 split (2026-06-01)
- [[Project Context]](sources/project-context.md) — Project identity, strategy, and operating instructions (2026-05-23)
- [[Realtime Edge Cases Session]](sources/realtime-edge-cases-session.md) — Race conditions, presence ghost state, keepalive, single-slot triggers (2026-05-06)
- [[Second Brain Phase 1.5B Session]](sources/second-brain-phase-1-5b-session.md) — docs:scale script, weekly wiki-sync agent design, branch+PR output pattern (2026-06-01)
- [[SEO Audit Session]](sources/seo-audit-session.md) — react-helmet-async, JSON-LD, sitemap, h1 hierarchy, a11y fixes (2026-05-05)
- [[Stripe Prices]](sources/stripe-prices.md) — Definitive pricing reference, all test mode (2026-05-23)

## Entities

- [[Capacitor Native Shell]](entities/capacitor-native-shell.md) — iOS delivery surface; wraps the web build in a native shell (Phase 1 shipped)
- [[Donny AI]](entities/donny-ai.md) — Intelligence layer: campaign generation, creator matching, analytics, scheduling
- [[DragonCandy Platform]](entities/dragoncandy-platform.md) — AI-powered creator-restaurant marketplace
- [[DragonDash]](entities/dragondash.md) — Premium rush content delivery, the profit engine
- [[DragonShare]](entities/dragonshare.md) — Organic-content amplification engine, 80/20 boost payments
- [[Stripe Connect]](entities/stripe-connect.md) — Payment infrastructure, escrow, subscriptions, boosts (test mode)
- [[Supabase]](entities/supabase.md) — Backend: Postgres, Auth, Edge Functions, Realtime, RLS

## Concepts

- [[Campaign Lifecycle]](concepts/campaign-lifecycle.md) — Draft through completion, applications, sponsorship
- [[CI/CD Quality Gate]](concepts/ci-cd-quality-gate.md) — GitHub Actions gate: build/typecheck/lint/unit tests on every PR; Plan A shipped, Plans B/C pending (2026-06-01)
- [[Content Delivery State Machine]](concepts/content-delivery-state-machine.md) — 9-status flow from pending through resolved
- [[Data Flywheel]](concepts/data-flywheel.md) — Primary competitive moat via accumulated match data
- [[Error Handling Patterns]](concepts/error-handling-patterns.md) — ErrorBoundary levels, QueryClient throwOnError, async patterns
- [[Musk's Algorithm]](concepts/musks-algorithm.md) — Question → Delete → Simplify → Accelerate → Automate
- [[Payments Split by Surface]](concepts/payments-split-by-surface.md) — Stripe for marketplace on all surfaces; subscriptions web-only to avoid Apple's 30%
- [[Pricing Architecture]](concepts/pricing-architecture.md) — Four stacked revenue streams per customer
- [[Take-Rate Ladder]](concepts/take-rate-ladder.md) — Tiered platform fees from 10% (Free) to 2% (Enterprise)
- [[Trust-Then-Flag Model]](concepts/trust-then-flag-model.md) — DragonShare moderation: post live immediately, flag post-hoc (no admin queue)
- [[Two-Path Boost Payment]](concepts/boost-payment-two-path.md) — Hosted checkout first, off-session repeat, idempotent fulfillment
- [[TypeScript Patterns]](concepts/typescript-patterns.md) — Strict mode, type safety, export conventions
- [[Wiki Automation]](concepts/wiki-automation.md) — Weekly wiki-sync agent + docs:scale script: hybrid safety net for doc drift (2026-06-01)

## Analyses
