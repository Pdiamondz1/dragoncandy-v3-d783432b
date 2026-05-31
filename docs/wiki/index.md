# Wiki Index

## Sources

- [[Code Architecture Audit Remediation]](sources/code-architecture-audit.md) — TypeScript strict mode, type safety, and codebase cleanup (2026-05-04)
- [[Code Architecture Audit Session]](sources/code-architecture-audit-session.md) — Strict mode enablement, 158 unused imports, 34 type errors, Supabase type regeneration (2026-05-04)
- [[Content Delivery System Flows]](sources/content-delivery-system-flows.md) — Complete content delivery lifecycle across all three roles (2026-05-23)
- [[Counter-Offer Enum Fix Session]](sources/counter-offer-enum-fix-session.md) — Postgres enum cast bug, PL/pgSQL variable typing, missing campaign_status value (2026-05-21)
- [[Database Schema]](sources/database-schema.md) — Supabase Postgres schema overview (2026-05-23)
- [[Donny Audit Phase 1 Session]](sources/donny-audit-phase1-session.md) — Role-based tool filtering, prompt injection defense, tier-based token clamping (2026-05-06)
- [[Donny Audit Phase 2 Session]](sources/donny-audit-phase2-session.md) — Quota enforcement, SSE streaming, dual auth, upgrade CTAs (2026-05-06)
- [[Project Context]](sources/project-context.md) — Project identity, strategy, and operating instructions (2026-05-23)
- [[Realtime Edge Cases Session]](sources/realtime-edge-cases-session.md) — Race conditions, presence ghost state, keepalive, single-slot triggers (2026-05-06)
- [[SEO Audit Session]](sources/seo-audit-session.md) — react-helmet-async, JSON-LD, sitemap, h1 hierarchy, a11y fixes (2026-05-05)
- [[Stripe Prices]](sources/stripe-prices.md) — Definitive pricing reference, all test mode (2026-05-23)

## Entities

- [[Donny AI]](entities/donny-ai.md) — Intelligence layer: campaign generation, creator matching, analytics
- [[DragonCandy Platform]](entities/dragoncandy-platform.md) — AI-powered creator-restaurant marketplace
- [[DragonDash]](entities/dragondash.md) — Premium rush content delivery, the profit engine
- [[Stripe Connect]](entities/stripe-connect.md) — Payment infrastructure, escrow, subscriptions (test mode)
- [[Supabase]](entities/supabase.md) — Backend: Postgres, Auth, Edge Functions, Realtime, RLS

## Concepts

- [[Campaign Lifecycle]](concepts/campaign-lifecycle.md) — Draft through completion, applications, sponsorship
- [[Content Delivery State Machine]](concepts/content-delivery-state-machine.md) — 9-status flow from pending through resolved
- [[Data Flywheel]](concepts/data-flywheel.md) — Primary competitive moat via accumulated match data
- [[Error Handling Patterns]](concepts/error-handling-patterns.md) — ErrorBoundary levels, QueryClient throwOnError, async patterns
- [[Migration Deployment Process]](concepts/migration-deployment-process.md) — How schema changes reach prod; the Lovable frontend-only gap; drift prevention
- [[Musk's Algorithm]](concepts/musks-algorithm.md) — Question → Delete → Simplify → Accelerate → Automate
- [[Pricing Architecture]](concepts/pricing-architecture.md) — Four stacked revenue streams per customer
- [[Take-Rate Ladder]](concepts/take-rate-ladder.md) — Tiered platform fees from 10% (Free) to 2% (Enterprise)
- [[TypeScript Patterns]](concepts/typescript-patterns.md) — Strict mode, type safety, export conventions

## Analyses

- [[Migration Drift Audit 2026-05]](../migration-drift-audit-2026-05-31.md) — Repo vs production ledger + object verification; 1 true drift (`campaign_skips`), 51 prod-only entries, two parallel histories (2026-05-31)
