---
title: Donny AI
type: entity
created: 2026-05-23
updated: 2026-06-08
sources: [docs/PROJECT_CONTEXT.md, docs/DATABASE_SCHEMA.md, docs/STRIPE_PRICES.md, raw/sessions/2026-06-07-core-docs-recent-updates-sync.md, raw/sessions/2026-06-08-weekly-sync.md]
tags: [ai, donny, intelligence-layer]
---

# Donny AI

The intelligence layer powering DragonCandy. Handles campaign generation,
creator matching, analytics, and scheduling. Not a standalone product —
Donny powers [[DragonDash]]; DragonDash sells.

## Architecture

- Backend-only via 74 Deno edge functions (one of them `dragonshare-notify`,
  which routes DragonShare notifications through Donny among other channels)
- Model routing: Claude Sonnet 4 + Haiku with cost routing matrix
- Shared utils: `_shared/model-routing`, `_shared/cost-ledger`,
  `_shared/anthropic-fetch`
- Credit system: invisible per-tier budgets with graceful degradation
- API spend hard-capped at 15% of revenue ($250/mo floor pre-revenue)

## Database Tables

- `donny_actions` — tracked actions and outcomes
- `donny_conversations` / `donny_messages` — conversation threads
- `donny_knowledge` — knowledge base entries (RAG)
- `donny_nudges` — proactive nudge definitions
- `donny_tool_executions` — tool call logs
- `donny_help_logs` — help requests and resolutions
- `donny_scheduled_posts` — cross-platform posting schedule (auto cross-scheduling);
  `ai_suggested_time`/`ai_reasoning`, `plan_group_id`/`plan_order` for grouped plans
- OAuth tables: `donny_oauth_clients`, `donny_oauth_codes`, `donny_oauth_tokens`

## Credit Budgets by Tier

| Tier | Monthly Actions |
|------|-----------------|
| Free | 50 |
| Starter | 500 |
| Growth | 2,000 |
| Pro | 10,000 |
| Enterprise | 50,000 |

## Content Strategist & Scheduling (2026-05)

- **Platform-aware generation** — Donny only suggests platforms the restaurant has connected
  (`business_outstand_accounts`); a `content_strategy` block is stored in
  `campaigns.ai_analysis` (one Anthropic call per plan).
- **Auto cross-scheduling** — restaurant posting preferences live on the campaign; after
  content approval Donny auto-generates a schedule into `donny_scheduled_posts`, grouped via
  `plan_group_id`, queued to Outstand. Static per-platform time rules avoid external API calls.
- **Lifecycle closed (2026-06-07)** — `donny_scheduled_posts` rows now advance from
  `scheduled` → `published`/`failed` in real time via the new `outstand-webhook` edge function
  (see [[Outstand]]). `published_at` is written on success; per-account results stored in
  `metadata.publish_result`. Before this, rows sat at `scheduled` indefinitely.

## Key Decisions

- Donny as service layer, not standalone AI tool (commoditization defense)
- Fine-tuning deferred until 1,000-5,000 campaigns accumulate (LoRA)
- Store AI strategy in existing JSONB (`ai_analysis`) — extensible, no migration

## See Also

- [[DragonDash]]
- [[DragonCandy Platform]]
- [[Pricing Architecture]]
- [[Donny Audit Phase 1 Session]]
- [[Donny Audit Phase 2 Session]]
- [[Campaign Delivery, Scheduling & Notifications Session]]
- [[Outstand]]
- [[Weekly Sync Session (2026-06-08)]]
