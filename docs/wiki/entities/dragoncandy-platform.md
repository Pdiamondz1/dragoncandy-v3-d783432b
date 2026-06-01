---
title: DragonCandy Platform
type: entity
created: 2026-05-23
updated: 2026-05-23
sources: [docs/PROJECT_CONTEXT.md, docs/DATABASE_SCHEMA.md]
tags: [platform, marketplace, identity]
---

# DragonCandy Platform

AI-powered creator-restaurant marketplace HQ'd in Hoboken, NJ. Connects
three roles — Restaurant/Business, Content Creator, and Brand/Sponsor —
through a hybrid marketplace model.

## Architecture

- Frontend: React 18 / TypeScript (strict), Vite, Tailwind CSS, shadcn/ui
- Backend: Supabase (70+ tables, 71 Deno Edge Functions, RLS, realtime)
- AI: Claude Sonnet 4 + Haiku (cost routing via edge functions)
- Social: Outstand.so (Instagram, TikTok, YouTube)
- Payments: [[Stripe Connect]] (test mode)
- Hosting: Lovable.dev → dragoncandy.io
- iOS: [[Capacitor Native Shell]] (Phase 1 foundation shipped)

## Scale (as of 2026-06-01)

- 60 pages, 184 hooks, 71 edge functions
- Pre-revenue: ~30 organic users, $0 paying, ~$295/mo operating cost
- Three user roles: business_client, content_creator, brand

## Key Integrations

- [[Stripe Connect]] — payments and subscriptions
- [[Supabase]] — database, auth, edge functions, realtime
- [[Donny AI]] — intelligence layer
- [[DragonDash]] — premium content delivery
- [[DragonShare]] — organic-content amplification engine
- [[Capacitor Native Shell]] — iOS delivery surface

## See Also

- [[Campaign Lifecycle]]
- [[Content Delivery State Machine]]
- [[Take-Rate Ladder]]
- [[Payments Split by Surface]]
