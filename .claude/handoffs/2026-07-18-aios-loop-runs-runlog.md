# Handoff — AIOS central run-log (`aios_loop_runs`)

**Date:** 2026-07-18
**Status:** designed-and-deferred, nothing built
**Prereq shipped:** PR #292 (`read-the-traces`) — merged as `aff3fdb5`

## Why this exists

`/internal/loops` infers every loop's health from its **output**, and says so in its own source:
*"there is no central loop-runs table … a routine's timestamp here is 'last output', NOT a
guaranteed 'last run'."* Because every scheduled routine is instructed to file nothing on a clean
run, **a routine that crashed at step 1 and one that ran perfectly are indistinguishable** — both
render as `quiet`.

This was deliberately deferred in PR #292 on a [[Musk's Algorithm]] argument: build the free read
(local session traces) before paying for storage. That read now exists. The open question this
handoff exists to answer is whether the storage is still warranted.

## Start here — the deferral may still be correct

**Do not open by building the table.** Two things changed and both should be checked first:

1. **`read-the-traces` now exists** and covers the *dev* loop with zero infrastructure. It does
   **not** cover cloud routines (they run on claude.ai, not locally), so it does not close this gap
   — but it may have shifted how much the gap costs.
2. **The 7 scheduled routines are report-only and low-stakes.** A silently-dead routine costs a
   missed weekly finding, not money or data.

Ask plainly: has a routine actually died unnoticed since 2026-06? If the answer is no, the honest
move may be to defer again and say so. Re-deferring with evidence is a real outcome.

## What exists today (verified 2026-07-18)

| Surface | Coverage |
|---|---|
| `aios_playbook_runs` | **On-demand playbooks only.** Real run rows (`status` running/completed/failed, `done_check`, `started_at`/`finished_at`, `error_md`) written solely by `aios-playbook-run`. Summary + verdict, **no tool-call trace**. |
| The 7 `.claude/schedules/` routines | **Nothing.** Their only write is a conditional findings POST. |
| `playbook-runner-agent` | Bypasses the edge function entirely → writes no `aios_playbook_runs` row. Now *watched* on `/internal/loops` via its `playbook:<slug>` findings source (PR #292), but still leaves no run record. |
| `donny_tool_executions` | Product-agent tool calls. Repaired in PR #292 — `donny-orchestrator` had never written a row. |

Key files: `src/lib/internalLoops.ts` (health model, `STALE_RUN_MS = 15min` reaping,
`last_seen_at ?? created_at`), `src/hooks/internal/useLoops.ts`, `src/pages/internal/InternalLoops.tsx`,
`supabase/functions/aios-report-ingest/index.ts` (the audited write choke point),
`supabase/migrations/20260619140000_aios_playbooks.sql` (the shape to mirror).

## Design constraints (do not violate)

- **`aios-report-ingest` is the only write path** for scheduled agents. A run-log must ride it —
  it is the structural guarantee of report-only autonomy. Do not add a second write path.
- **Report-only invariant.** Routines already hard-STOP on 401 and are told their *only* write is
  the findings POST. A run-log adds a second write to that instruction; keep it unconditional and
  cheap, and make failure to log non-fatal.
- **The honest-labelling precedent.** `/internal/loops` currently tells the truth about what it
  cannot know. Whatever replaces it must not overstate: a routine that never reports is still
  unknowable unless it *starts* by logging.
- **Auth.** Routines authenticate with `AIOS_INGEST_SECRET` via `_shared/ingest-auth.ts`
  (**not yet configured** — see the open item below).

## Sketch (not a decision)

A `type:"run"` payload on `aios-report-ingest` writing `aios_loop_runs`
(`loop_key`, `started_at`, `finished_at`, `status`, `summary_md`, `error_md`), with each routine
posting once at start and once at end. `/internal/loops` then reads real rows and falls back to
output-inference only for loops with no run history. Reuse `STALE_RUN_MS` reaping from
`aios_playbook_runs` — a routine that posts a start and never an end is the exact signal this
whole thing exists to catch.

Open question worth resolving first: **start+end (two POSTs, catches crashes) vs end-only (one
POST, cheaper, misses the crash case)**. Catching crashes is the entire point, so start+end is
probably right — but it doubles the write volume on every routine, so decide deliberately.

## Also open (not blocking, from the same session)

- **`AIOS_INGEST_SECRET` is unset.** Needs the prod `sb_secret_…` value in **three** places: the
  Supabase **Edge Function Secrets** (not the Vault), the `Dame_git_claude` cloud-routine env, and
  Vault key `aios_ingest_key`. Gotcha: a **warm isolate holds a stale secret until a redeploy**.
  Blocks filing trace-audit findings to `/internal/findings`, and would block a run-log too.
- **Chrome screenshot timeouts** — addressed in `verify-prod` (settle-before-capture guidance) in
  the same commit as this handoff. Re-run `read-the-traces` in a few weeks to confirm the ~29%
  error share actually dropped; if it didn't, the cause is elsewhere.
- **Skill housekeeping** — 10 redundant local copies removed from the main checkout (85→75). The
  remaining 61 (`ce-*` 36, `firecrawl-*` 8, `caveman-*` 7, ~10 singletons) are untracked local
  installs that never fired in 400 days *even where they were loadable*. Left alone deliberately;
  globalizing them would tax every session in every project.

## Read before starting

- `docs/wiki/concepts/reading-agent-traces.md` — the layer this completes, **including its
  retraction section**: two of the first run's headline findings were the tool's own false
  positives. The lesson generalizes directly to a run-log: *an observability tool that
  misclassifies is worse than none.* A run-log that reports a healthy routine as dead, or vice
  versa, is worse than the honest "quiet" label it replaces.
- `docs/wiki/concepts/self-improving-app.md` — the 4-Condition Test. Score this candidate against
  it before building; that is exactly what the test is for.
- `docs/wiki/concepts/validator-skills.md` — the `{done,checklist,missing}` contract, already
  stored on `aios_playbook_runs.done_check`.
