---
title: AIOS Agent-Loop Audit — 3 gaps (make-validator, loops mission control, spend source-of-truth)
type: source
created: 2026-07-07
tags: [aios, loops, validators, cost, self-improvement, session]
---
# AIOS Agent-Loop Audit (2026-07-07)

## Origin

Prompted by a YouTube video — *"Finally. Agent Loops Clearly Explained."* (AI Automation Society's
*Build Your AI OS with Claude Code* course). Rather than "implement the tutorial", we **audited
DragonCandy's existing AIOS against the video's agent-loop framework** (reason→act→observe→repeat,
verification-first, orchestrator/memory/guardrails) and found the platform already implements it —
and is ahead on the "verification is the hard part" thesis via [[Validator Skills]] / Loop Scout /
Founder Playbooks / [[Loop Memory Protocol]]. The audit surfaced **three real gaps**, each built,
two-model-reviewed (Opus + Codex), and shipped as its own PR.

## Gap 1 — `make-validator` meta-skill (PR #217)

The deferred *automate-last* step of the 2026-06-20 validator-skills work: a project-scoped
`make-validator` skill that authors/retrofits validators to the one `{done, checklist, missing}`
verdict contract (NEW mode scaffolds `verify-<slug>`; RETROFIT appends the block to an existing
judge skill). Dogfooded by retrofitting `verify-prod` + `verify-db-schema` (Loop Scout *counted*
them as validators but they emitted only prose). Skills+docs only. Knowledge captured on that
branch ([[Validator Skills]] updated there). Codex-clean after 6 P2 rounds.

## Gap 2 — `/internal/loops` mission control (PR #218)

A read-only admin surface over all ~15 AIOS loops (7 scheduled routines + Founder Playbooks + skill
loops). **Keystone honesty:** there is **no central loop-runs table**, so each loop's activity is
*inferred from its output* (findings by `source`, playbook runs + `done_check` verdicts, the latest
briefing) — the page is explicit that **"last output" ≠ "last run"** (report-only routines file
nothing on a clean run, so "Quiet" ≠ "failed"). Pure, unit-tested model (`src/lib/internalLoops.ts`);
cap-safe **per-entity** queries (latest-per-source / latest-run+exact-count per-playbook) so it
survives past PostgREST's 1000-row cap. Codex-clean after 4 accuracy P2s: reap stale `running` runs
at `STALE_RUN_MS`; use `last_seen_at` (re-filed findings) and `updated_at` (upserted briefings), not
`created_at` — the recurring "upsert bumps the wrong timestamp" trap.

## Gap 3 — AIOS spend source-of-truth (PR #220, deployed + verified on prod)

The kill-switch-grade one. See the concept page [[AIOS Runtime Spend Source-of-Truth]] for the full
write-up. Headline: the ≤15%-of-revenue AI cap was **measuring the wrong number** — the ~$225/mo
bill is mostly founder **Claude Code dev usage** (opex), which no app table sees and which degrading
Donny can't control. Scoped the cap to **runtime serving cost** (the `donny_cost_ledger`).

Three slices:
- **A (the real fix):** user-less runtime AI calls never logged, so embeddings read **0 rows** and
  runtime spend read ~50× low. Root cause was **two** constraints: `user_id` NOT NULL + FK to
  `auth.users` (the cron sync's all-zeros `SYSTEM_USER_ID` failed the FK) **and** a `tier` CHECK that
  allowed only `T0–T3` (so `tier='embedding'` failed too). Fix: `user_id` → nullable + widen the CHECK
  to include `'embedding'` + a `normalizeUserId()` coercion in `_shared/cost-ledger.ts`; plus
  `generate-anonymous-brief` (which called Anthropic but never logged) now logs on a billed 200
  *before* parsing. **Deployed + proven live:** a real `sync:wiki` produced the first-ever embedding
  rows (`user_id null`, `tier='embedding'`, ~104k tokens ≈ $0.002).
- **B (alert loop):** the existing `ai-cost-vs-cap` Founder Playbook now emits a
  `{green|watch|breach|not-yet-measurable}` verdict `playbook-runner-agent` gates on (report-only
  finding on breach/watch). Founder go-live = `/schedule` the runner.
- **C (visibility):** the `/internal` Overview swaps the stale dead-cron "Cost alert" card for a live
  "Runtime vs cap" card (`max($250 floor, 15%×MTD revenue)`) + an honest runtime-scope label.

## Durable reframes / gotchas (the reusable part)

1. **Runtime AI spend ≠ the AI invoice.** The dev/Claude-Code bill dominates the invoice but is opex;
   a kill-switch that degrades Donny can only govern *runtime* serving cost (the ledger). Scope any
   AI-cost control to the ledger, never the total invoice, or it false-breaches.
2. **`donny_cost_ledger` had TWO silent constraints blocking user-less inserts:** the `auth.users` FK
   *and* the `tier` CHECK. A user-less/system AI call (cron embeddings, anonymous endpoints) must
   satisfy both — coerce the placeholder user to `NULL` (nullable column) AND allow its tier value.
3. **A validator-authoring meta-skill removes the recurring Loop-Scout blocker** ("blocked on: author
   a verify-* validator first"). Verification is the bottleneck to new loops; automate authoring it.

## Files / prod changes

- PR #217: `.claude/skills/make-validator/*`, retrofit `verify-prod`/`verify-db-schema`.
- PR #218: `src/lib/internalLoops.ts` (+test), `useLoops.ts`, `InternalLoops.tsx`, route + nav.
- PR #220: migrations `20260707120000` (user_id nullable) + `20260707120100` (tier CHECK 'embedding')
  + `20260707130000` (ai-cost-vs-cap seed); `_shared/cost-ledger.ts`, `generate-anonymous-brief`,
  `src/lib/aiCostCap.ts` (+test), `InternalOverview.tsx`. All 3 DDLs applied to prod; edge fns
  `donny-knowledge-sync` (v16) + `generate-anonymous-brief` (v59) deployed + verify_jwt preserved.
