# Session — AIOS Kill-switch Playbook + Loop-callable Playbooks (2026-06-20)

**Branch:** `feat/aios-killswitch-playbook-loop`
**Spec:** `docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md`
**Plan:** `docs/superpowers/plans/2026-06-20-aios-playbook-killswitch-loop.md`

## Origin

A founder prompt (an "Identify which Skills make sense for your Workspace" idea):
*"Look at my workspace and the tasks I do repeatedly. Tell me which ones would benefit
from a saved skill file. For each one, suggest a SKILL.md that documents the task, my
preferences, and what counts as 'done' so any loop can call it."*

Applied to DragonCandy + DC AIOS. Key realization: that pattern is **already** the
shipped AIOS **Founder Playbook** (`task_md` / `preferences_md` / `done_criteria_md` /
`allowed_proposals`), and the dev-side skill library is already deep. So the value was
in the *gaps*. A workspace audit (git-log repetition signal, handoffs, memory) across
three "repeatable task" surfaces — dev skills, AIOS cloud loops, Founder Playbooks —
picked two highest-leverage, lowest-risk gaps to close as one small slice.

## What shipped (built — founder-run go-live)

### A1 — `kill-switch-watch` Founder Playbook (report-only)
- One idempotent seed migration `supabase/migrations/20260620120000_aios_playbook_killswitch_seed.sql`,
  mirroring `20260619150000_aios_playbooks_seed.sql` (same columns, `on conflict (slug)
  do nothing`, `allowed_proposals = '[]'::jsonb`).
- Turns `PROJECT_CONTEXT §3`'s four kill-switches (churn >6%/mo, CAC payback >12mo,
  LTV:CAC <2:1, revenue-per-employee floor — a Y2–Y3 gate, not a Y1 trigger) into a
  repeatable check reporting each **green / watch / breach / not-yet-measurable**.
- **Honest scoping (a real catch from spec review):** pre-revenue it is an
  **armed-watch scaffold**. Three of four switches (churn, CAC-payback, LTV:CAC) have
  **no data source** — and won't even after revenue starts, because no cohort /
  subscription / marketing-spend tables exist (out of scope). The earlier draft's claim
  that it "auto-evaluates the day revenue starts" was retracted as untrue. Value now:
  guardrails armed + thresholds encoded executably; switches light up *as data sources
  are later built*.
- Runs immediately on the existing `aios-playbook-run` runner — no new code.

### A4 — loop-callable playbooks (scheduling) — the prompt's literal "so any loop can call it"
- One new cloud-routine template `.claude/schedules/playbook-runner-agent.md`, modeled
  on `weekly-brief-agent.md`.
- **Why a routine and not the runner:** the on-demand `aios-playbook-run` edge function
  authenticates from the **caller's user-session JWT** (`userClient.auth.getUser()` +
  admin check) because the live-stats RPCs are `auth.uid()`-gated. A **sessionless cron
  cannot call it**. So the routine *itself* executes the playbook via Supabase MCP
  `execute_sql` (plain SELECTs) + repo reads — using a **capability map** that translates
  the runner's read-tools to direct table SELECTs (the same trick `weekly-brief-agent`
  uses to sidestep the gated RPCs). The playbook definition is the portable spec; the
  loop is just another executor.
- **Output via `aios-report-ingest` only:** a **deduped finding on breach/watch only**
  (`fingerprint:"playbook-breach:<slug>"`, `source:"playbook:<slug>"`); all-green posts
  nothing (lowest-noise, like bug-sweep). **No auto-resolve** — a cleared breach leaves
  the open finding until a human triages it (intentional, matches bug-sweep/loop-scout).

## Key decisions & gotchas

- **Scoping locked early:** A4 = scheduling only. Donny-mid-chat `run_playbook`
  (interactive, would redeploy the ~100KB `donny-chat` core) and a service-bearer mode
  on the runner (would touch the `auth.uid()`-gated stats-RPC auth model) were both
  deliberately deferred (YAGNI). "loop" means unattended, not conversational.
- **Finding contract is strict (spec-review catch):** `aios-report-ingest` requires
  `severity ∈ {critical, high, medium, low}` (400 otherwise) and a non-empty
  `summary_md`; `evidence` is an optional object. The draft used "breach"/"at-risk" as
  severity and folded the body into `evidence` — fixed with an explicit verdict→severity
  map (**breach→critical, watch→medium**) and the correct payload shape.
- **SQL escaping:** the seed text was written with **no inner apostrophes** to avoid the
  single-quote-doubling bug; verified by a per-line quote-balance check (literals all
  even; only a `--` comment had an apostrophe, since reworded).
- **Self-assessment JSON** (`{done, checklist, missing}`) is **log-legibility only** on
  the scheduled path — nothing consumes it (no run row is written, per non-goals).
- **Invariants held:** Donny never writes directly — a human triages/approves; **no
  schema migration beyond a seed INSERT, no new edge function, no new secret, no auth/RPC
  change, no `donny-chat` redeploy.**

## Process

Brainstorm → spec → spec-document-reviewer loop (1 round of ISSUES FOUND → fixed →
APPROVED) → user spec review → writing-plans → plan-document-reviewer (APPROVED, one
advisory folded in) → inline execution (3 commits) → **Codex second review: clean**
(it independently read `aios-report-ingest` and confirmed the seed shape, table
constraints, and ingest payload all match).

## Founder follow-ups (run-mode, post-merge)

1. Apply the seed migration to prod via Supabase MCP `apply_migration` (it is not
   auto-applied on Lovable deploy).
2. Verify A1 once on-demand at `/internal/playbooks/kill-switch-watch`.
3. Create the `/schedule` routine from `playbook-runner-agent.md`, pinning
   `slug='kill-switch-watch'` + a weekly cron.
4. Sync Donny RAG (`donny_knowledge`) from the merged wiki.

## Affected files
- `supabase/migrations/20260620120000_aios_playbook_killswitch_seed.sql` (new)
- `.claude/schedules/playbook-runner-agent.md` (new)
- `docs/PROJECT_CONTEXT.md` (AIOS workstream bullet)
- spec + plan docs (new)
