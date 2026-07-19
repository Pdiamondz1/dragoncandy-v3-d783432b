---
name: read-the-traces
description: "Audit the agent layer by reading Claude Code's own session traces — which tools error, where permission gates trip, which skills silently fail or never fire — and end with the {done,checklist,missing} verdict block a loop can branch on. Use when asked to 'read the traces', 'audit the agent layer', 'why does <skill> keep failing', 'which skills actually get used', or before tuning skills/hooks/subagents."
---

# Read the Traces — audit the agent layer from its own transcripts

Every Claude Code session writes a structured JSONL trace to `~/.claude/projects/<slug>/`.
Nothing reads them. That is the gap this skill closes: instead of guessing why a workflow
feels unreliable, read what the agent actually did — which tools errored, where the
permission classifier stopped it, which skills fail silently, which never fire at all.

**Scope: the agent layer, not the product.** Findings here are fixes to skills, hooks,
subagents, and permissions — not to application code.

> **Source of truth:** `~/.claude/skills/read-the-traces/` (global, project-agnostic), with a
> byte-identical committed copy in each project that wants it versioned. If you are reading
> the repo copy, fix the global one and re-copy, or they drift. (Same contract as
> `media-ingest`.)

## Why not `verify-*`

DragonCandy's Loop Scout discovers validators by globbing `.claude/skills/verify-*`. This
skill deliberately sits outside that convention because it is **global and project-agnostic**,
while that glob is a DragonCandy-local integration. It still emits the exact same verdict
block, so any loop — including `aios-playbook-run`'s `parseDoneCheck` — can branch on it.
It is an **auditor** (judges the agent layer) rather than a validator of a shipped change.

## Loop memory

This skill keeps a co-located **`MEMORY.md`** — two zones: curated **Lessons** (read first)
and an append-only **Run Log**. Contract: `docs/wiki/concepts/loop-memory-protocol.md`.

- **Start of every run:** read `MEMORY.md` and apply its **Lessons** — but only to sharpen
  prose, remediation hints, and what to look for. Lessons MUST NOT change the deterministic
  gate below.
- **End of every run:** prepend a **Run Log** entry (`Output:` a pointer to the verdict, then
  `Happened / Worked / Failed / Remember`), then promote durable takeaways into Lessons and
  prune what this run superseded.

## Steps

### 1. Scan

Call the script **by absolute path** — cwd varies by project, and a relative path silently
resolves against the wrong root:

```bash
node ~/.claude/skills/read-the-traces/scripts/scan-traces.mjs [--days 14] [--json]
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

### 2. Judge — the four deterministic gates

The script prints a `## Gate` block. Each is a pure count, so the same traces always yield
the same verdict:

1. **Hook errors = 0.** A hook that *fails to run* is config rot: the gate you believe
   protects you is failing open. **A hook that RAN and blocked is not this** — Claude Code
   surfaces a hook denial with an "error" prefix, and a prompt-type hook echoes its prompt
   as `hook error: [<prompt>]: <decision>`. Those are classified `hook-blocked` and are
   **advisory**: the gate working. Reading them as failures inverts the finding, reporting a
   gate that is correctly failing *closed* as one failing *open*.
2. **Permission / classifier denials = 0.** A denial is not a bug; it is autonomy meeting
   policy. Each one deserves a human read — it marks either a genuinely risky action that
   was correctly stopped, or a workflow that needs legitimate permission it does not have.
3. **No skill with ≥10 turns and >25% error rate.** Below 10 turns there is too little
   activity to judge. Errors attach to a skill **only** through the `tool_use_id` of the call
   its own assistant turn issued. Unattributed errors stay unattributed — never charge them
   to whichever skill happened to run most recently, or a clean skill acquires a fabricated
   rate from unrelated work.
4. **No repeat-failure cluster ≥5 in one session.** The same tool failing five times in one
   session is the "correcting over and over" antipattern; the fix is upstream, in the
   skill or the environment, not in retrying.

**Advisory — never flips a gate:** the dead-skill list, tool volumes, subagent mix, branch
spread. Advisory notes go in the prose summary and **never** in `missing[]`.

### 3. Report

Prose first: a ranked list of **agent-layer fixes**, each naming the evidence (tool, count,
error class) and a concrete next action. Rank by gate severity, then by frequency.

Then end with **exactly one** fenced JSON block, and it MUST be the last fenced block:

```json
{"done": false,
 "checklist": [{"criterion": "no hook errors", "met": false},
               {"criterion": "no unreviewed permission/classifier denials", "met": false},
               {"criterion": "no skill over 25% error rate (>=10 turns)", "met": false},
               {"criterion": "no repeat-failure cluster >=5 in a session", "met": true}],
 "missing": ["PreToolUse:Bash hook errored 5x — fix the git-push gate in .claude/settings.json",
             "6 classifier denials incl. a Merge-Without-Review on PR #245 — review each",
             "refresh-main fails 68% (17/25 turns) — repair or retire the skill"]}
```

`done` = every `met` true. `missing[]` carries one runnable remediation per failed check and
is `[]` when `done:true`.

If the scan cannot run (no trace directory, unreadable), report **BLOCKED** in prose and set
the affected criteria `met:false` with a note that it was unreachable — a blocked check is
never a silent pass.

## Rules

- **Read-and-judge only.** This skill never edits skills, hooks, settings, or application
  code. It reports; the fix is the caller's. The lone write is its own `MEMORY.md`.
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
