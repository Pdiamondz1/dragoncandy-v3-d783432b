---
title: Donny AI Cost Architecture
type: concept
created: 2026-06-01
updated: 2026-06-01
sources: [docs/DATABASE_SCHEMA.md, docs/PROJECT_CONTEXT.md]
tags: [donny, cost, ledger, quota, model-routing]
---

# Donny AI Cost Architecture

How [[Donny AI]] keeps AI spend bounded: a per-call cost ledger, a monthly
action budget with graceful degradation, and tier-based model routing.
Shipped May 2026.

## Cost Ledger

`donny_cost_ledger` logs every AI API call: `edge_function`, `model`, tier
(T0–T3), `input_tokens`, `output_tokens`, `estimated_cost_usd`, and a
`fallback` flag. Indexed on `(user_id, created_at)` and `(created_at)`.

## Usage Budget & Degradation Stages

`donny_usage` tracks a per-user monthly action budget (`actions_used` vs
`actions_budget`, keyed by `period_start`) and a `current_stage`:

| Stage | Meaning |
|-------|---------|
| `full_power` | Full model access, normal budget |
| `conservation` | Reduced/cheaper routing as budget depletes |
| `essential` | Minimal allowance near the cap |

Quota enforcement is wired into the orchestrator via a
`checkQuotaOrBlock()`-style gate; Donny responses also stream via SSE.

## Tier Routing

T0–T3 tiers classify each call so the model-routing matrix (Claude Sonnet 4 +
Haiku) can pick the cheapest model that satisfies the task. API spend is
hard-capped at 15% of revenue ($250/mo floor pre-revenue).

## Key Decisions

- Invisible per-tier credit system with graceful degradation — users never
  hit a hard wall; routing quietly conserves.
- Every call logged from day one feeds the [[Data Flywheel]] and reconciles
  against the [[Pricing Architecture]] cost cap.

## See Also

- [[Donny AI]]
- [[Pricing Architecture]]
- [[Data Flywheel]]
- [[Donny Audit Phase 2 Session]]
