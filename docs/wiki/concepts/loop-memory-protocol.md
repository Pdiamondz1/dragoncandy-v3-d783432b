---
title: Loop Memory Protocol
type: concept
created: 2026-06-23
updated: 2026-06-23
sources: [2026-06-23-loop-memory-protocol-design.md]
tags: [skills, loops, memory, aios, self-improvement]
---
# Loop Memory Protocol

A **loop memory** gives an orchestration loop a persistent, two-zone `MEMORY.md` it reads
*before* a run and writes *after* — so the loop self-improves over time instead of the
operator re-explaining the same correction every run. It is the concrete realization of the
[[Self-Improving App]] direction at the *skill* level.

It comes from a simple prompt: *"write two files at the end of every run: (1) the actual
Output, and (2) a Memory file that logs what happened, what worked, what failed, and what to
remember next run."* In DragonCandy the **Output half already exists** — every loop already
persists its result (wiki pages, `docs/wiki/log.md`, `aios_playbook_runs.result_summary_md`,
findings). So this protocol adds only the **Memory half**, and the `Output:` line in memory
*points at* the existing artifact rather than duplicating it.

## The two-zone `MEMORY.md`

Each participating skill keeps one co-located file: `.claude/skills/<skill>/MEMORY.md`.
Co-location (not a central directory) version-controls the memory *with* the skill and needs
no registry. The file has exactly two zones:

```markdown
# <skill> — loop memory

> Read **Lessons** before every run; append a **Run Log** entry after every run.
> Full contract: docs/wiki/concepts/loop-memory-protocol.md

## Lessons (read FIRST every run; curated — rewrite/prune as they evolve)
- [<tag>] <durable, actionable guidance the loop should apply next time>

## Run log (newest first — add each new entry at the TOP; never edit/delete past entries)
### [YYYY-MM-DD HH:MM] <one-line run label>
- Output: <pointer to where the output landed — e.g. docs/wiki/concepts/foo.md + log.md>
- Happened: <what the run did>
- Worked: <what went well>
- Failed: <what went wrong / was discarded / rejected>
- Remember: <takeaway; note "→ promoted to Lessons" when durable>
```

- **Lessons** — curated and *small*. The loop reads it at the start and **acts on it**.
  Items are rewritten/pruned as they are superseded. This is the "what to remember next run"
  half — a memory nobody reads is just a diary, so reading-first is the load-bearing step.
- **Run log** — newest first: each run adds **one new entry at the top** and never edits or
  deletes past entries. This is the "logs what happened" half, kept for auditability.

## The per-run contract

1. **Before running:** read `MEMORY.md` Lessons and apply them.
2. **After running:** add a Run Log entry **at the top** (newest first) — `Output` pointer +
   Happened/Worked/Failed/Remember — then **promote durable takeaways into Lessons** and
   prune any Lessons the run superseded.

Each participating `SKILL.md` carries a short, identical **"Loop memory"** block stating
this contract and linking back here, so the contract lives in one place
(*compound, don't duplicate*).

## Reusing the verdict contract

For validator-backed loops the structured "what failed" signal already exists: the
[[Validator Skills]] verdict block `{done, checklist:[{criterion,met}], missing:[]}`. Its
`missing[]` items are the natural source for the Run Log **Failed / Remember** zone — no new
failure-capture format is invented.

## Rules & guardrails

- **Output is a pointer, not a duplicate.** Never write a second copy of the loop's output;
  the `Output:` line references the artifact the loop already produced.
- **Curate, don't just accumulate.** Lessons are rewritten/pruned; the Run Log is add-only
  (new entries at the top, past entries never edited). Stale Lessons are removed as part of
  the write step (mitigates memory rot).
- **Soft size cap: ~30 Run Log entries.** Past that, trim the *oldest Run Log* entries —
  never the Lessons zone — to keep the read-at-start context cost bounded.
- **Validators may write their own `MEMORY.md`.** A validator is read-only *for the state it
  judges*; its own memory file is the skill's bookkeeping, not a write to the state under
  test, so this does not break the read-and-judge-only rule.

## Phase 2 (designed, not yet built)

For the AIOS **cloud scheduled routines** the same two-zone contract goes DB-backed so the
report-only-autonomy invariant holds: a lightweight `aios_loop_memory(loop_key, lessons_md,
updated_at)` Lessons row per loop, written through the existing `aios-report-ingest` choke
point (agents never write tables directly) and read at the start of each scheduled run.
Deferred until the markdown version is proven.

## See Also
- [[Self-Improving App]] — the loop family this serves; the 4-Condition Test and Loop Scout
- [[Validator Skills]] — the verdict block reused as the failure feed
- [[Founder Playbooks]] — origin of the `done_check` verdict shape; the Phase-2 DB landing spot
