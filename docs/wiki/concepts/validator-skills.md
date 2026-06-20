---
title: Validator Skills
type: concept
created: 2026-06-20
updated: 2026-06-20
sources: [2026-06-20-validator-skills-loops-design.md]
tags: [skills, loops, validators, aios, verification]
---
# Validator Skills

A **validator skill** is a skill that READS some state, JUDGES it against deterministic rules,
and ends its output with a machine-readable **verdict block** a loop can branch on. Validators
are the primitive that **closes a loop**: `generate → validate → (fail?) → fix → re-validate`.
This is condition #2 of the [[Loop Scout]] 4-Condition Test ("can a rule decide when it's done?").

## The Verdict Contract

A validator ends its output with exactly one fenced JSON block — the **same shape** the
[[Founder Playbooks]] `done_check` uses, so `aios-playbook-run`'s parser reads it with **no new
code**:

```json
{"done": false,
 "checklist": [{"criterion": "wiki lint: 0 critical", "met": true},
               {"criterion": "RAG synced to wiki HEAD", "met": false}],
 "missing": ["RAG behind wiki ~2d — run sync-wiki-to-donny.mjs"]}
```

- `done` (boolean) — the verdict; `true` only when every check passed.
- `checklist` — one `{criterion, met}` per check.
- `missing` — remediation hints for the failed checks. **This is what the loop's fix step
  consumes.** Empty when `done:true`.

The parser (`supabase/functions/aios-playbook-run/index.ts` → `parseDoneCheck`) reads the LAST
fenced JSON block that has a boolean `done`, so the verdict block MUST be last in the output.

## The Validator Pattern

A validator skill:
- runs **deterministic checks** (a rule, so `done` is reproducible — no prose judgment in a
  gating check);
- is **read-and-judge only — it never writes** (no commits, DB writes, or file edits);
- prints **human prose first**, then the **fenced verdict block last**.

Retrofitting an existing judge skill into a validator is therefore **additive and
backward-compatible**: append the verdict block; change nothing a human currently reads.

## Loops

A loop pairs a generator with a validator:
- the generator produces, then calls the validator;
- on `done:false` it applies `missing[]` and re-validates;
- it is **bounded** (a max-iteration cap) so a stuck loop stops instead of spinning — condition
  #3 of the 4-Condition Test (afford wasted runs).

First reference loop: the **Knowledge loop** — [[Knowledge Sync]] (generate) + [[Verify
Knowledge]] (validate). [[Loop Scout]] scores a candidate higher on condition #2 when a matching
`verify-*` validator skill exists.

## See Also
- [[Loop Automation]] — the 4-Condition Test, knowledge-freshness self-heal, Loop Scout
- [[Founder Playbooks]] — origin of the `done_check` verdict shape
- [[Knowledge Sync]] · [[Verify Knowledge]] · [[Loop Scout]]
