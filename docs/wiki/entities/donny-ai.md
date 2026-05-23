---
title: Donny AI
type: entity
created: 2026-05-23
updated: 2026-05-23
sources: [docs/PROJECT_CONTEXT.md, docs/DATABASE_SCHEMA.md, docs/STRIPE_PRICES.md]
tags: [ai, donny, intelligence-layer]
---

# Donny AI

The intelligence layer powering DragonCandy. Handles campaign generation,
creator matching, analytics, and scheduling. Not a standalone product —
Donny powers [[DragonDash]]; DragonDash sells.

## Architecture

- Backend-only via 67 Deno edge functions
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
- OAuth tables: `donny_oauth_clients`, `donny_oauth_codes`, `donny_oauth_tokens`

## Credit Budgets by Tier

| Tier | Monthly Actions |
|------|-----------------|
| Free | 50 |
| Starter | 500 |
| Growth | 2,000 |
| Pro | 10,000 |
| Enterprise | 50,000 |

## Key Decisions

- Donny as service layer, not standalone AI tool (commoditization defense)
- Fine-tuning deferred until 1,000-5,000 campaigns accumulate (LoRA)

## See Also

- [[DragonDash]]
- [[DragonCandy Platform]]
- [[Pricing Architecture]]
