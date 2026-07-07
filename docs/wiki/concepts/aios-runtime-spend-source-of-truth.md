---
title: AIOS Runtime Spend Source-of-Truth
type: concept
created: 2026-07-07
updated: 2026-07-07
sources: [2026-07-07-aios-agent-loop-audit.md, 2026-07-07-aios-spend-source-of-truth-design.md]
tags: [aios, cost, kill-switch, ledger, guardrails]
---
# AIOS Runtime Spend Source-of-Truth

Makes `donny_cost_ledger` a **complete, alerting, visible** record of the platform's **runtime** AI
spend, so the PROJECT_CONTEXT §8 kill-switch (*AI spend ≤ 15% of revenue, $250/mo floor pre-revenue*)
has an accurate number to gate on. Fixes the acknowledged dead control (`donny-cost-rollup` flapped)
by giving it a trustworthy input. Shipped as PR #220 (three slices). See also the
[[AIOS Agent-Loop Audit]] session that produced it.

## The reframe: runtime AI spend ≠ the AI invoice

The single most valuable finding. The ~$225/mo Anthropic+OpenAI bill in the docs is **dominated by
founder Claude Code *dev* usage** — writing the app, sessions like this one. That is **opex**, tracked
in `operating_expenses`; **no app table can see it**, and the only lever a cost kill-switch has
(degrade Donny to Haiku / conservation) touches only *runtime serving cost*. So:

- **Scope the cap to runtime serving cost = `donny_cost_ledger`** (Donny/Dezzy generation + RAG
  embeddings). Pre-revenue this is tiny (~$4 all-time when the audit ran) — but it is the number that
  *scales with users* and that the kill-switch can actually control.
- **Never compare the ledger against the total invoice**, or the check false-breaches on dev spend.

The `ai-cost-vs-cap` playbook and the `/internal` card both carry this scope note verbatim.

## The two-constraint ledger gotcha (Slice A)

User-less runtime AI calls (the cron RAG-embedding sync passing the all-zeros `SYSTEM_USER_ID`; the
anonymous landing-brief endpoint) **never logged** — so `donny_cost_ledger` had **0 embedding rows
ever** and read ~50× low. Root cause was **two** silent constraints, and the best-effort
`try/catch` in `logCost`/`logEmbeddingCost` swallowed both failures:

1. `user_id` was **`NOT NULL` + FK to `auth.users`** → the placeholder / absent user failed the FK.
2. `donny_cost_ledger_tier_check` allowed only **`T0–T3`** → `logEmbeddingCost`'s `tier='embedding'`
   failed the CHECK.

**Fix (both required):** `user_id` → nullable (`DROP NOT NULL`; FK kept — NULL is allowed) **and**
widen the tier CHECK to include `'embedding'` (drop + re-add is the Postgres idiom; both
non-destructive). Plus a `normalizeUserId()` in `_shared/cost-ledger.ts` that coerces the all-zeros
sentinel / empty string → `NULL`. `generate-anonymous-brief` (which called Anthropic but logged
nothing) now logs on a billed 200 **before parsing** — a 200 with unparseable JSON still cost money.

**Rule going forward:** a user-less / system AI call must satisfy *both* the FK (coerce user → NULL)
and any value CHECK on the row it writes. Fixing one and not the other logs nothing but *looks* fixed.

## The alert loop (Slice B) and the card (Slice C)

- **Alert:** the existing `ai-cost-vs-cap` Founder Playbook was refined (seed) to emit a
  `{green|watch|breach|not-yet-measurable}` verdict the `playbook-runner-agent` gates on — a
  report-only `/internal/findings` entry on breach (>100% of cap) or watch (≥80%). Nothing
  auto-degrades; a human triages. Cap = `max($250 floor, 15% × MTD revenue)`. This reuses the whole
  [[Founder Playbooks]] + [[Validator Skills]] verdict machinery — no new infra.
- **Visibility:** the `/internal` Overview swapped the **stale** "Cost alert" card (it read the dead
  `donny-cost-rollup` `latest_alert` from `analytics_events`) for a **live** "Runtime vs cap" card,
  computed from `aios_cost_stats` + `aios_revenue_stats` via a pure, tested `src/lib/aiCostCap.ts`.
  Withholds the cap if revenue stats are unavailable (don't show a misleading floor-only status).

## Key Decisions

- **Runtime scope, ledger as source-of-truth, alert-only enforcement** (auto-degrade deferred — it is
  the flapping behavior that broke `donny-cost-rollup`; report-only is the AIOS invariant).
- The compute layer already existed (`aios_cost_stats` sums the ledger MTD; the `ai-cost-vs-cap`
  playbook; `playbook-runner-agent`) — the fix was to make the **input** trustworthy + emit a
  gate-able verdict + surface it, not to build new infra.
- Migrations applied to prod pre-merge (non-destructive); edge-fn deploys are founder-gated go-live.

## Known Issues / Deferred

- **Founder go-live remaining:** `/schedule` `playbook-runner-agent` pinned to `ai-cost-vs-cap`
  (cloud routine under the founder's env; can't be provisioned by an agent).
- **Auto-degrade enforcement** (flip a platform switch model-routing reads) — deferred; needs
  hysteresis so it doesn't flap like the original.
- **Dev-spend inclusion** — out of scope by design; would need provider usage APIs, not app data.
- `donny-cost-rollup`'s stage-flipping is left untouched (not revived).

## See Also
- [[AIOS Agent-Loop Audit]] — the session; the sibling gaps (make-validator, loops mission control)
- [[Founder Playbooks]] — the `ai-cost-vs-cap` playbook + `playbook-runner-agent` rail
- [[Validator Skills]] — the `{done,checklist,missing}` / green-watch-breach verdict the runner gates on
- [[Self-Improving App]] — the loop family; the kill-switch guardrail this arms
