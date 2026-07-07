---
title: Validator Skills
type: concept
created: 2026-06-20
updated: 2026-07-07
sources: [2026-06-20-validator-skills-loops-design.md, 2026-07-07-make-validator-skill.md]
tags: [skills, loops, validators, aios, verification]
---
# Validator Skills

A **validator skill** is a skill that READS some state, JUDGES it against deterministic rules,
and ends its output with a machine-readable **verdict block** a loop can branch on. Validators
are the primitive that **closes a loop**: `generate → validate → (fail?) → fix → re-validate`.
This is condition #2 of the 4-Condition Test ("can a rule decide when it's done?") that the
Loop Scout routine uses (see [[Self-Improving App]]).

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
  consumes.** Empty when `done:true`. Advisory or subjective observations do **not** belong here —
  surface those in the prose summary; `missing[]` is strictly the fix-step input for `met:false`
  checks (a `done:true` verdict carrying "missing" work is ambiguous, and loops only read
  `missing[]` on `done:false`).

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
`verify-prod` and `verify-db-schema` were retrofitted this way (2026-07-07) — they had a prose
`## Done` section that Loop Scout already counted as a validator, but emitted no machine-readable
block; each now appends the contract with the gating checks explicit and the subjective parts
(visual/layout, "is this the right fix") kept advisory.

## Authoring & retrofitting validators — the `make-validator` skill

Don't hand-roll a validator from memory — use the **`make-validator`** meta-skill
(`.claude/skills/make-validator/`). It has two modes: **NEW** (scaffold a fresh `verify-<slug>`)
and **RETROFIT** (append the block to an existing judge skill). It encodes the rules that are easy
to get wrong: the verdict block must be the LAST fenced block; only a deterministic rule may flip
`met` (subjective judgment is advisory → `missing[]`); naming the dir `verify-<slug>` IS the Loop
Scout integration; and a validator never writes the state it judges. It ends with a self-check so a
validator-authoring run can't ship an unvalidated validator. When Loop Scout files a candidate
"blocked on: author a verify-* validator first", `make-validator` is the tool that unblocks it.

## Loops

A loop pairs a generator with a validator:
- the generator produces, then calls the validator;
- on `done:false` it applies `missing[]` and re-validates;
- it is **bounded** (a max-iteration cap) so a stuck loop stops instead of spinning — condition
  #3 of the 4-Condition Test (afford wasted runs).

First reference loop: the **Knowledge loop** — the `knowledge-sync` skill (generate) + the
`verify-knowledge` validator (validate). The Loop Scout routine scores a candidate higher on
condition #2 when a matching `verify-*` validator skill exists.

## See Also
- [[Self-Improving App]] — the 4-Condition Test, knowledge-freshness self-heal, and the Loop
  Scout routine that ranks loop candidates
- [[Founder Playbooks]] — origin of the `done_check` verdict shape
- [[Loop Memory Protocol]] — the optional co-located `MEMORY.md` a validator may keep (advisory-only)
- Skills/routines (not wiki pages): the `make-validator` authoring meta-skill; the `knowledge-sync`
  and `verify-knowledge` skills; the retrofitted `verify-prod` / `verify-db-schema` validators; and
  the `.claude/schedules/loop-scout-agent.md` routine
