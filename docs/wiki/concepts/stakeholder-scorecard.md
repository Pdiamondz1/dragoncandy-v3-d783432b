---
title: Stakeholder Scorecard
type: concept
created: 2026-07-26
updated: 2026-07-26
sources: [2026-07-26-stakeholder-scorecard.md]
tags: [aios, internal, metrics, stakeholder, investor, scorecard]
---
# Stakeholder Scorecard

`/internal/scorecard` — "How DragonCandy is doing" — a **plain-language** translation of the raw AIOS
metrics so non-technical stakeholders (co-founders, board, advisors on AIOS invite accounts) can grasp the
app's health and speak to investors about it. **Sub-project 4 of 4** in the AIOS scaling-dashboard effort;
compounds [[Internal Real-vs-Total Metrics]] and the [[Synthetic Weight Engine]] real-only exclusion.

## Shape

Four stories, each with a headline number, a "what it means" line, and an auto `green/amber/info` signal,
under a **founder-set headline** (admin-editable; stored as an `aios_dashboard_settings` KV row). Plus a
print-optimized **"Export snapshot"** one-pager (light theme, self-contained, no login — for handing to
investors). Framing is stage-appropriate: DragonCandy is **pre-revenue by design**, so the story is
*traction + capital efficiency + scale readiness + honest revenue framing*, not revenue.

- **Traction** — real people building (real-only `aios_platform_stats`); "+N in the last 30 days" from
  `platform_weight.users_total_real`.
- **Capital efficiency** — "~$X/month to run the whole platform"; green if net burn ≤ ceiling and AI under
  the 15% cap.
- **Scale headroom** — "~N× room before infrastructure costs rise" (`DISK_LIMIT_BYTES / db_bytes`).
- **Revenue readiness** — "pre-revenue by design; the money switch is built, not flipped" (static).

## Key decisions

- **Deterministic phrasing, never LLM.** A stakeholder-facing figure must be exact, reproducible, and free
  (no `donny_cost_ledger` cost, no hallucination). A pure `scorecardModel.ts` (`buildScorecard` +
  `growthLast30Days`) produces every card; unit-tested.
- **Aggregate-burn RPC.** The burn inputs (`operating_expenses`, `donny_cost_ledger`) are admin-only, but
  the page targets non-admin stakeholders. `aios_stakeholder_burn()` (SECURITY DEFINER, `is_internal_user()`
  gate, REVOKE anon/public) returns ONLY the aggregate `{opex, ai_spend, revenue, net_burn}` — no line
  items, no per-model breakdown. It reuses the internal-gated `aios_revenue_stats()` for revenue but
  **inlines** the ledger sum (never the admin-only `aios_cost_stats()`). data-exposure-reviewer: PASS.
- **Real-only vs physical.** User/traction/revenue are synthetic-excluded (a "real users only" stamp); the
  headroom card is intentionally physical `db_bytes` (no `db_bytes_real` exists) — the right basis for a
  tier question and **conservative** (real usage is far smaller), labeled "incl. test data" so it can't
  read as a real-user figure.

## Known Issues / gotchas

- **Load-bearing deploy:** apply migration `20260726173000` at the careful gate (seeds the KV rows +
  creates the RPC) before the page shows burn.
- **Honest degradation:** a failed/loading burn RPC renders an "unavailable" **info** card, never a false
  "~$0/month · green" (Codex P2). `growthLast30Days` always baselines off a prior snapshot, never the
  latest as its own baseline (Codex P3).
- `aios_dashboard_settings` has no client INSERT policy → the headline row is seeded in the migration;
  admins edit via a direct `.update()` under the existing admin-UPDATE RLS.

## See Also

- [[Internal Real-vs-Total Metrics]] — the real-vs-synthetic metric surfaces this reads from.
- [[Synthetic Weight Engine]] — the `is_synthetic` exclusion keeping the real counts honest.
- [[AIOS Internal Shell]] — how `/internal/*` is laid out (the Monitor nav group this joins).
