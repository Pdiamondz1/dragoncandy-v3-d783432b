---
name: read-the-traces
description: "Investigate what actually happened in past Claude Code sessions by reading their local JSONL traces — tool errors, permission denials, per-skill activity. Emits EVIDENCE for a human to interpret, never a verdict: its interpretations have been wrong before, so every number is a lead to verify, not a conclusion. NOT a validator — no {done,checklist,missing} block; never wire it into a loop. Use for 'read the traces', 'what went wrong in those sessions', 'which tools keep failing'."
---

# Read the Traces — audit the agent layer from its own transcripts

Every Claude Code session writes a structured JSONL trace to `~/.claude/projects/<slug>/`.
Nothing reads them. That is the gap this skill closes: instead of guessing why a workflow
feels unreliable, read what the agent actually did — which tools errored, where the
permission classifier stopped it, which skills fail silently, which never fire at all.

**Scope: the agent layer, not the product.** Findings here are fixes to skills, hooks,
subagents, and permissions — not to application code.

> **Scope: project-local, deliberately.** This lived briefly in `~/.claude/skills/` (global).
> It was pulled back after its first real run, because it had not earned installation
> everywhere — see below.

## This is NOT a validator, and emits no verdict block

It was originally built as one. That was a mistake, and the mistake is worth stating so nobody
re-adds it.

On its first run this skill produced **three misleading findings out of five**: it reported a
`PreToolUse` hook as "failing open" when the hook had run and correctly *blocked* a push
(Claude Code surfaces a hook denial with an "error" prefix); it charged a git-only skill with a
68% error rate assembled from Chrome timeouts it never issued; and it called 77 never-fired
skills "bloat" when they were untracked local installs that had never been loadable. The
extraction was right every time. The **interpretation** was wrong every time.

So this skill deliberately does **not** emit the `{done,checklist,missing}` block, and must not
be given one. That block exists so a loop can branch automatically — and a misclassifying
judge wired into automation is precisely what [[Musk's Algorithm]]'s "never automate a broken
process" forbids. A human caught these; a loop would have acted on them.

Its output is **evidence for a person to interpret**, not a verdict. Treat every number it
prints as a lead to verify, not a conclusion. Do not name it `verify-*` (Loop Scout globs that
prefix to discover validators), and do not wire it into `parseDoneCheck`.

## Loop memory

This skill keeps a co-located **`MEMORY.md`** — two zones: curated **Lessons** (read first)
and an append-only **Run Log**. Contract: `docs/wiki/concepts/loop-memory-protocol.md`.

- **Start of every run:** read `MEMORY.md` and apply its **Lessons** — but only to sharpen
  prose and what to look for.
- **End of every run:** prepend a **Run Log** entry (`Output:` a pointer to the report this run
  produced, then `Happened / Worked / Failed / Remember`), then promote durable takeaways into
  Lessons and prune what this run superseded. **Record any observation that turned out to be
  misleading** — that list is the most valuable thing this skill accumulates.

## Steps

### 1. Scan

Call the script **by absolute path** — cwd varies by project, and a relative path silently
resolves against the wrong root:

```bash
node .claude/skills/read-the-traces/scripts/scan-traces.mjs [--days 14] [--json]
```

| Flag | Effect |
|---|---|
| `--project <dir>` | Project to analyse. Default: cwd. |
| `--days N` | Look-back window. Default 14. |
| `--dir <path>` | Trace directory override; skips slug resolution. |
| `--include-global` | Include global skills in the dead-skill check (default: project only). |
| `--json` | Machine-readable output. |

**A git worktree has its own trace directory.** Scanning the main checkout will not show a
worktree's sessions, and vice versa. Pass `--project` deliberately; if you want the whole
picture, scan each root separately.

Exit `2` = no trace directory resolved (pass `--dir`). Exit `3` = directory exists but no
session touched the window (widen `--days` before concluding anything).

### 2. Read the observations — then verify before repeating any of them

The script prints an `## Observations` block. These are **counts, not verdicts**. Each one below
carries the specific way it has already misled once, because that is the useful part:

1. **Hook failures.** A hook that *fails to run* is config rot — the gate you believe protects
   you is failing open. **A hook that ran and blocked is not that**, and is counted separately
   (`hook-blocked`). This exact distinction is what the skill got backwards once.
2. **Permission / classifier events.** Not bugs. A denial marks either a genuinely risky action
   correctly stopped, or a workflow lacking permission it legitimately needs. Worth a human
   read; never a defect count.
3. **Skill error rates.** Errors attach to a skill **only** via the `tool_use_id` of the call its
   own assistant turn issued. Unattributed errors stay unattributed. Before believing a high
   rate, check the skill actually issues the failing tool — a git-only skill once showed 68%
   from browser timeouts it never called.
4. **Repeat-failure clusters.** The same tool failing repeatedly in one session suggests the fix
   is upstream, in the skill or the environment, rather than in retrying.

**Weakest signal of all — the dead-skill list.** "Never fired" can simply mean "never loadable"
(untracked, or absent from this worktree). Establish that a skill *could* have run before
concluding anything from its absence. Tool volumes, subagent mix and branch spread are context,
not findings.

### 3. Report — as leads, with the check you ran

Prose only. No verdict block, no pass/fail. For each observation worth raising, state the
evidence (tool, count, sample error) **and the check you ran to confirm it means what it
appears to mean.** An unverified observation is reported as unverified, or not at all.

The verification is usually one question, and it is what would have caught all three past
misreads:

- *Does this subject even do the thing it is blamed for?* (`refresh-main` never opens a browser.)
- *Does this message describe a failure, or a decision?* (A hook printing a reasoned block
  message is working.)
- *Could this be zero for a boring reason?* (Never-fired can mean never-loadable.)

Rank by how confident you are, not by count. A verified small thing beats an unverified big one.

If the scan cannot run (no trace directory, unreadable), say so plainly and stop — do not
report a clean agent layer, which is a different claim entirely.

## Rules

- **Read-and-report only.** This skill never edits skills, hooks, settings, or application
  code, and never renders a verdict. It reports evidence; interpreting and fixing are the
  caller's. The lone write is its own `MEMORY.md`.
- **Privacy is load-bearing.** Session transcripts contain the operator's own prompts and can
  contain secrets. The script emits aggregate counts plus short, redacted error snippets, and
  it redacts JWTs, `sk-`/`sb_secret_`/`gh*_` tokens, and Bearer headers. **Never paste raw
  transcript content into a report, a commit, a wiki page, or a RAG index.** The durable
  artifact is the summary. If you widen what the script emits, re-check this rule first.
- **Don't over-read a small window.** A 3-file scan of a fresh worktree says almost nothing.
  Widen `--days`, or scan the main checkout, before drawing conclusions.

## DragonCandy only — file the findings

In this repo, route confirmed findings to the existing rail rather than inventing a surface:
POST to the `aios-report-ingest` edge function with `source: "trace-audit"`, a stable
`fingerprint` per issue so re-runs dedupe (`occurrences` bumps instead of duplicating), and
`severity` as fix priority. They surface at `/internal/findings` for triage. Exactly the
pattern `.claude/schedules/loop-scout-agent.md` uses. **No new table, no UI, no RLS change.**
The global copy of this skill stops at the report.

## See Also
- `docs/wiki/concepts/validator-skills.md` — the verdict contract
- `docs/wiki/concepts/loop-memory-protocol.md` — the two-zone MEMORY.md
- `.claude/schedules/loop-scout-agent.md` — the 4-Condition Test; findings POST + fingerprint
- `~/.claude/skills/media-ingest/SKILL.md` — the global+repo-copy pattern this follows
