---
title: AIOS Kill-switch Playbook + Loop-callable Playbooks Session
type: source
created: 2026-06-20
updated: 2026-06-20
sources: [2026-06-20-aios-killswitch-playbook-loop.md]
tags: [aios, donny, playbooks, automation, loops, kill-switches, internal]
---

# AIOS Kill-switch Playbook + Loop-callable Playbooks Session

Session source for the `feat/aios-killswitch-playbook-loop` branch (2026-06-20).
Prompted by a founder "which repeated tasks deserve a saved skill file" idea, applied
to DragonCandy + DC AIOS. The audit found the idea was already the shipped
[[Founder Playbooks]] model, so the value was in two gaps — closed as one small,
report-only, no-schema-change slice.

## Key claims

- **A1 — `kill-switch-watch` seed playbook.** Turns [[North Star & KPI Scorecard]] §3's
  four kill-switches into a repeatable, report-only check
  (green/watch/breach/not-yet-measurable). Honestly scoped as an **armed-watch
  scaffold**: three of four switches (churn, CAC-payback, LTV:CAC) have no data source
  and stay not-yet-measurable until cohort/CAC instrumentation exists (out of scope). A
  spec-review catch retracted the false claim that it "auto-evaluates the day revenue
  starts." One idempotent seed migration; runs on the existing `aios-playbook-run`.
- **A4 — loop-callable playbooks (scheduling).** The prompt's literal *"so any loop can
  call it."* A new `playbook-runner-agent.md` cloud-routine loads any playbook from
  `aios_playbooks` and executes it via Supabase MCP `execute_sql` + repo reads (a
  capability map sidesteps the `auth.uid()`-gated stats RPCs that bind the on-demand
  runner to a user session — a sessionless cron can't call it). Output is a **deduped
  finding on breach/watch only** through `aios-report-ingest` (breach→critical,
  watch→medium; all-green posts nothing; no auto-resolve).
- **Scope discipline (YAGNI).** Donny-mid-chat `run_playbook` (would redeploy ~100KB
  `donny-chat`) and a service-bearer runner mode (would touch the stats-RPC auth model)
  were both deferred. "loop" = unattended, not conversational.
- **Contract precision (spec-review catches).** `aios-report-ingest` requires
  `severity ∈ {critical,high,medium,low}` and a non-empty `summary_md`; the finding
  payload was corrected to match. SQL seed written with no inner apostrophes to dodge
  the quote-doubling bug.
- **Invariants held.** No schema migration beyond a seed INSERT, no new edge function,
  no new secret, no auth/RPC change, no `donny-chat` redeploy. Donny never writes
  directly — a human triages/approves.
- **Process.** brainstorm → spec → spec-reviewer (1 fix round → approved) → user review
  → writing-plans → plan-reviewer (approved) → inline execution → **Codex second review:
  clean** (independently confirmed seed shape, constraints, and ingest payload match).

## Founder follow-ups (post-merge, run-mode)

Apply the seed migration to prod (MCP `apply_migration`); verify A1 once on-demand;
`/schedule` the runner pinning `slug='kill-switch-watch'`; sync Donny's RAG.

## See Also

- [[Founder Playbooks]]
- [[Self-Improving App]]
- [[North Star & KPI Scorecard]]
- [[AIOS]]
