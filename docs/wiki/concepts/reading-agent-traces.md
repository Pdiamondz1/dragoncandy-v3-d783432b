---
title: Reading Agent Traces
type: concept
created: 2026-07-18
updated: 2026-07-18
sources: [2026-07-18-read-the-traces.md]
tags: [skills, loops, observability, agent-layer, self-improvement, aios]
---

# Reading Agent Traces

The agent layer produces a record of what it actually did. Reading that record — rather than
inferring health from outputs — is how skills, hooks, subagents, and permission rules get
tuned on evidence instead of impression.

This is the fourth layer of the loop stack, alongside discovery ([[Self-Improving App]]'s
4-Condition Test / Loop Scout), closure ([[Validator Skills]]), and memory
([[Loop Memory Protocol]]).

## Why it was missing

Every prior layer reasons about **outputs**. `/internal/loops` says so in its own source: there
is no central run-log, so each loop's health is inferred from the output it leaves, honestly
labelled *"last output ≠ last run"*. Every scheduled routine is instructed to file nothing on a
clean run, so **a routine that crashed at step 1 and one that ran perfectly are
indistinguishable** — both read as `quiet`.

Meanwhile Claude Code was writing a rich per-session trace that nothing had ever opened.

## The three trace surfaces

| Surface | Where | State |
|---|---|---|
| **Dev loop** | `~/.claude/projects/<slug>/*.jsonl` | Rich and complete; **read by the `read-the-traces` skill** |
| **Product agent** | `donny_tool_executions` | Exists; one consumer (`bug-sweep-agent`), and see the silent-write trap below |
| **AIOS cloud loops** | `aios_playbook_runs` (on-demand playbooks only) | Scheduled routines persist **no** per-run record — deliberately still deferred |

The dev-loop surface is the one worth reading first: it needs **no infrastructure**, and it is
project-agnostic, so the same skill works in any repo.

## The `read-the-traces` skill

**Project-local** (`.claude/skills/read-the-traces/`). A zero-dependency streamed scanner
extracts tool errors, permission/classifier denials, hook errors, repeat-failure clusters,
per-skill error rates, and dead skills, and the skill reports them as **evidence for a human**.

### It emits no verdict block — deliberately, after it failed as one

It shipped as a validator, emitting the `{done,checklist,missing}` block and installed globally.
Both were reverted within the day. On its first real run it produced **three misleading findings
out of five** (see below), so it was reduced to a read-only investigative tool: no verdict
contract, not named `verify-*`, never wired into `parseDoneCheck`, and not installed in projects
where it has not earned its place.

The reasoning is [[Musk's Algorithm]]'s *never automate a broken process*. The verdict block
exists precisely so a loop can branch without a human — and this tool's judgment layer is the
part demonstrated to be unreliable. A human caught all three misreads; a loop would have acted
on them. **Where a misclassifying judge is the failure mode, the safest change is to remove the
judgment, not to tune it.**

**What it counts** (observations, not gates): hook failures — kept strictly distinct from hook
*blocks*; permission/classifier events; per-skill error rates; repeat-failure clusters. Everything
else (dead-skill list, tool volumes, subagent mix) is **advisory** and never flips a gate.

**Privacy is load-bearing.** Session transcripts contain the operator's own prompts and can
contain secrets. The scanner emits aggregate counts plus short, redacted snippets — never
transcript content — and the durable artifact is always the summary.

## Extraction gotchas

- **Correlate `tool_use` → `tool_result` by `tool_use_id`.** The tool name is not on the result
  object; grouping off the result alone attributes every error to `"?"`.
- **A `tool_result` arrives on a USER turn**, which carries no `attributionSkill`, so errors must
  be attributed through the `tool_use_id` → the **assistant turn that issued the call**. A
  "last skill seen" carry-forward is not good enough and actively fabricates findings: it
  charged `refresh-main` (a git-only skill) with a **68% error rate** built almost entirely from
  Chrome screenshot timeouts it never issued. Exact id attribution put it at 4%. Unattributed
  errors must stay unattributed.
- **Selecting files by mtime does not honour a look-back window.** A long-lived or resumed
  session modified today holds events from months ago; filter per record by its own timestamp.
- **A git worktree has its own trace directory** — scanning the main checkout shows none of it.
- **Redact both GitHub token shapes:** classic (`ghp_`/`gho_`/…) and fine-grained
  (`github_pat_`) use different prefixes. This repo uses the fine-grained kind.

## The silent-write trap

The reason `donny_tool_executions` was empty for `donny-orchestrator` generalises well beyond
that one bug, and it is the most reusable lesson here:

> A supabase-js v2 query builder **resolves** on a Postgrest error — it does not reject. So
> `.insert({...}).then(() => {}, err => log(err))` discards `{data:null, error}` entirely. The
> code *looks* like it has error handling and reports nothing forever.

Combined with wrong column names (`tool_input`/`tool_output`/`is_error`, none of which exist)
and an omitted NOT NULL `message_id`, the orchestrator's audit insert had **never written a
row** — while `bug-sweep-agent`, which queries `status=eq.error`, read the empty table as a
clean sweep. **A trace surface that silently drops every write is worse than none, because it
reads as healthy.** Always destructure and check `error`.

This is the same class as the schema-drift-swallowed-to-`[]` bug in
[[Donny Data Visibility & Quick-Action Routing]], and the same "verify columns against prod,
not the migration file" rule from [[AI Creator Matching]].

## What the first run found — and what it got wrong

Survived verification:

- **six classifier denials** — real governance events, incl. a merge-without-review on PR #245
  and a fabricated-data submission against production
- **Chrome screenshot timeouts** as the largest single reliability drag
- **84 declared skills in the main checkout, 77 of which never fire**
- **`donny_tool_executions` never receiving a row from `donny-orchestrator`** — established
  directly against prod, independently of the scanner

Retracted, and the more instructive half — **two of the three headline findings were the
tool's own false positives**, reported before verification and withdrawn the same session:

- *"the git-push gate hook is failing open"* — it was **working**. The hook ran and blocked a
  push pending build/typecheck; Claude Code surfaces a hook *denial* with an "error" prefix.
  The classifier inverted a gate failing *closed* into one failing *open*.
- *"`refresh-main` fails 68% of turns"* — Chrome errors misattributed by a last-skill-seen
  heuristic to a git-only skill that never opens a browser. Exact attribution: **4%**.

**An observability tool that misclassifies is worse than none**, because it manufactures
alarming false positives that get acted on. Both would have been caught by one question: does
this subject even do the thing it is being blamed for? Verify a headline finding against what
the subject actually does before reporting it.

## Key Decisions

- **Audit an external best-practices source before adopting it.** Three of the four rules that
  prompted this work were already implemented past what the source described; only one was new.
- **Build the free read before the storage.** A central `aios_loop_runs` table for the scheduled
  routines stays deferred — building storage before the zero-infrastructure read exists inverts
  [[Musk's Algorithm]]'s "automate last". Let the skill say whether it is needed.
- **Reduced rather than tuned, after it misled.** When the failing component is the judgment
  layer of an observability tool, deleting that layer beats iterating on it — an unreliable
  judge that keeps a machine-readable verdict contract is one wiring change away from
  automating its own errors. The extraction layer, which was correct throughout, was kept.
- **Un-globalized.** It was installed to `~/.claude/skills/` before it had been run once, then
  pulled back to project-local. The standing skills-global-by-default rule assumes a skill that
  works; global scope is earned, not a default for something unproven.

## Known Issues

- The scheduled cloud routines still leave no per-run record; `/internal/loops` still infers.
- Errors from tool calls whose issuing turn carried no skill attribution are reported globally
  but attach to no skill. That is intended: under-attribution is recoverable, mis-attribution
  fabricates findings.
- The orchestrator audit insert only fires on a social/MCP tool call, so the end-to-end proof
  awaits real traffic. Baseline at ship: 125 rows, **0** with a null `message_id` — so the first
  null-`message_id` row is the proof.

## See Also
- [[Validator Skills]] — the verdict contract this reuses
- [[Loop Memory Protocol]] — the co-located two-zone MEMORY.md
- [[Self-Improving App]] — the 4-Condition Test and Loop Scout
- [[Founder Playbooks]] — `parseDoneCheck`, the verdict parser this skill deliberately avoids
- [[AIOS Internal Shell]] — where `/internal/loops` and `/internal/findings` live
