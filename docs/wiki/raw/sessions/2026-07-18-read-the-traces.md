# Session — Read the Traces (PR #292)

**Date:** 2026-07-18
**Branch:** `feat/read-the-traces` (worktree `dc-improvements`)
**Trigger:** founder asked whether the contents of a YouTube video — "How Anthropic Engineers
ACTUALLY Automate Their Work" (Austin Marchese, 2026-07-15) — could be incorporated into this
and future projects.

## The framing question, answered honestly

The video names four rules (taken from its chapter list, which is the only part captured —
YouTube's caption API is now token-gated, so the narration was never transcribed; the detail
under each rule was grounded in Anthropic's published Claude Code best-practices doc instead):

1. Match the bottleneck to a solution
2. Proactive frameworks — Claude comes to you
3. **Read the traces**
4. Hand it objectives, not just tasks

A read-only audit of the repo found **three of the four already implemented**, in most cases
past what the video describes:

| Rule | Already here |
|---|---|
| 1 | Loop Scout's 4-Condition Test; Musk's Algorithm "automate last" |
| 2 | 7 report-only scheduled routines, `/internal/findings`, the self-healing knowledge-freshness agent, the post-merge RAG hook |
| 4 | Founder Playbooks `done_criteria`; the `{done,checklist,missing}` verdict contract; `make-validator` |
| 3 | **nothing** |

So the durable decision was to **build only rule 3** rather than re-buy three capabilities the
project already owns. That scoping call is the most reusable part of the session: an external
"best practices" source is worth auditing against before adopting.

## The gap, measured

Claude Code writes a structured JSONL trace of every session to `~/.claude/projects/<slug>/`.
Nothing had ever read them. Measured during planning: **598 session files, ~40 MB** for
DragonCandy alone; per-line fields include `attributionSkill`, `attributionAgent`,
`toolUseResult`, `gitBranch`, `sessionId`, `timestamp`, `isSidechain`.

Separately, `/internal/loops` already admits in its own source that it infers each loop's
health from **output** because there is no central run-log ("last output ≠ last run"), and a
scheduled routine that ran, succeeded, and found nothing leaves **zero durable trace**.

## What shipped

**`read-the-traces` skill** — global at `~/.claude/skills/read-the-traces/` with a
byte-identical committed repo copy (the `media-ingest` global+copy pattern). A zero-dependency
streamed Node scanner plus a SKILL.md that judges four deterministic gates and ends with the
standard verdict block. No schema, no edge function, no cron for this part.

Deliberately **not** named `verify-*`: that prefix is DragonCandy's Loop Scout discovery glob,
and this skill is global/project-agnostic. It is an *auditor* of the agent layer rather than a
validator of a shipped change, but it emits the same verdict block so any loop can branch on it.

**Two broken trace writes repaired** (they *are* the gap on the product side):

- `donny-orchestrator`'s `donny_tool_executions` insert used columns that do not exist
  (`tool_input`/`tool_output`/`is_error`) and omitted the NOT NULL `message_id`. It had never
  written a row. Verified against **prod**, not the migration file. `message_id` made nullable
  (non-destructive; also fixes a latent null-id failure in `donny-chat`), insert mapped to the
  real columns, deployed v69 with `verify_jwt=true` preserved.
- `playbook-runner-agent` posts findings under `playbook:<slug>`, which no `RoutineDef`
  watched, and writes no `aios_playbook_runs` row — invisible in **both** sections of
  `/internal/loops`. Now watched.

## What the first run found — and the two findings it got wrong

Survived verification:

- **six classifier denials**, incl. a merge-without-review on PR #245, two production-deploy
  blocks, and a fabricated-data submission against prod
- Chrome screenshot timeouts as the largest single reliability drag
- the main checkout declares **84 skills, 77 of which never fire**
- `donny_tool_executions` never receiving a row from `donny-orchestrator` — established
  directly against prod, independently of the scanner

**Retracted the same session — two of three headline findings were the tool's own false
positives**, and they were reported to the founder before being verified:

- *"the `PreToolUse` git-push gate hook is failing open"* — it was **working**. The hook ran,
  correctly identified a `git push`, and blocked it pending build/typecheck. Claude Code
  surfaces a hook *denial* with an "error" prefix, and a prompt-type hook echoes its own prompt
  as `hook error: [<prompt>]: <decision>`. The scanner read a gate failing *closed* as one
  failing *open* — the exact inversion of the truth.
- *"`refresh-main` fails 68% of turns"* — its 17 "errors" were Chrome screenshot timeouts and
  stale element refs, attributed by a last-skill-seen heuristic to a git-only skill that never
  opens a browser. Exact `tool_use_id` attribution puts it at **4%** (1 error / 25 turns).

Fixed by replacing the carry-forward heuristic with exact id-based attribution and by splitting
`hook-blocked` / `policy-blocked` (advisory) from genuine `hook-error`. The durable lesson is
about the tool, not the findings: **an observability tool that misclassifies is worse than
none**, because it manufactures alarming false positives that get acted on.

## Gotchas worth keeping

- **Correlate `tool_use` → `tool_result` by `tool_use_id`.** The tool name is not on the result
  object; grouping off `toolUseResult` alone attributes 100% of errors to `"?"`.
- **A `tool_result` arrives on a USER turn**, which carries no `attributionSkill`. Attribute
  through the `tool_use_id` → the assistant turn that ISSUED the call. A "last skill seen"
  carry-forward fabricates findings (it produced the retracted 68% above). Unattributed errors
  must stay unattributed: under-attribution is recoverable, mis-attribution is not.
- **A hook that blocks is not a hook that failed**, and a blocked tool call is a policy event,
  not a malfunction. Both must be classified separately from genuine faults.
- **Selecting files by mtime does not honour `--days`.** A resumed session modified today holds
  events from months ago; filter per record by its own timestamp.
- **A git worktree has its own trace directory.** Scanning the main checkout shows nothing from
  a worktree.
- **A supabase-js `.then(ok, fail)` on a query hides Postgrest errors** — the builder *resolves*
  with `{data:null,error}` rather than rejecting, so the fulfilled handler silently discards it.
  This was the root cause of the orchestrator bug surviving undetected while *looking* like it
  had error handling. Destructure and check `error`.
- **`types.ts` regeneration is risky here** (it imports the live prod schema and has previously
  red-lined main with unrelated drift) — hand-edit the affected nullability instead.

## Review

`edge-function-reviewer` PASS on all deploy-gating checks (it also identified the silent-resolve
handler as the real root cause). **Codex second review clean after 4 rounds**, every finding
real: fine-grained `github_pat_` redaction (the classic `gh*_` pattern misses it), per-record
`--days` filtering, cross-boundary skill attribution, and generated-type nullability.

## Deliberately deferred

A central `aios_loop_runs` run-log for the 7 scheduled routines. Real, but it is schema + edge
function + UI work, and building storage before the free read exists inverts "automate last".
Let the trace skill run first and say whether it is needed.
