---
name: make-validator
description: "Author or retrofit a validator skill — a read-and-judge-only skill that ends with the machine-readable {done,checklist,missing} verdict block a loop (or aios-playbook-run) can branch on. Use when asked to 'make a validator', 'author a verify-* skill', 'turn this judge skill into a validator', 'close a loop with a validator', or after Loop Scout files a 'blocked on: author a verify-* validator' finding."
---

# Make Validator (DragonCandy) — the validator authoring meta-skill

A **validator** is the primitive that closes a loop: `generate → validate → (fail?) → fix →
re-validate`. It READS some state, JUDGES it against **deterministic rules**, and ends its
output with one fenced JSON **verdict block** a loop can branch on. It is condition #2 of the
[[4-Condition Test]] the Loop Scout routine scores — *"can a rule decide when it's done?"* —
so authoring one is often the single thing that unblocks a new automation loop.

This skill produces validators that match the project's ONE verdict contract, so
`supabase/functions/aios-playbook-run/index.ts` → `parseDoneCheck` reads them with **no new
code** and Loop Scout auto-discovers them (it enumerates `.claude/skills/verify-*`). Full
contract: `docs/wiki/concepts/validator-skills.md`.

> **Scope note.** This meta-skill is intentionally **project-scoped** (not global): it hardcodes
> DragonCandy's verdict contract, the `parseDoneCheck` parser, and Loop Scout's `verify-*`
> discovery. It is a project-coupled skill by the [[feedback_skills_global_by_default]] carve-out.

## Two modes

**NEW** — scaffold a fresh `verify-<slug>` from a described target.
**RETROFIT** — append the verdict block to an existing *judge* skill (one with a prose "Done"
section but no machine-readable block). This is the common case and is **additive and
backward-compatible**: you append the block and change nothing a human currently reads
(validator-skills.md blesses this explicitly). `verify-prod` and `verify-db-schema` were
retrofitted this way.

Pick the mode, then follow the steps.

## The verdict contract (never deviate)

The validator's output ends with **exactly one** fenced JSON block, and it MUST be the **LAST**
fenced block in the output (the parser reads the last one):

```json
{"done": false,
 "checklist": [{"criterion": "wiki lint: 0 critical", "met": true},
               {"criterion": "RAG synced to wiki HEAD (<=24h)", "met": false}],
 "missing": ["RAG behind wiki ~2d — run: node supabase/scripts/sync-wiki-to-donny.mjs"]}
```

- `done` (boolean) — `true` **only when every** `checklist[].met` is true.
- `checklist` — one `{criterion, met}` per check; `criterion` is a short human label.
- `missing` — the remediation hint for each **failed** check. **This is what the loop's fix step
  consumes.** Empty `[]` when `done:true`.

## Steps

1. **Name it `verify-<slug>`** (kebab-case). The `verify-` prefix is load-bearing: Loop Scout
   discovers validators by globbing `.claude/skills/verify-*`, so a correctly-named directory IS
   the entire integration — no registry, no wiring. Create `.claude/skills/verify-<slug>/SKILL.md`.

2. **State the target and the actor.** One or two sentences: what state does it judge, and does
   any check need prod/DB/web access (note it — an unreachable check is a BLOCKED result, step 6,
   not a silent pass).

3. **Write the checks — one deterministic rule each.** For every check, spell out the exact `met`
   rule so the verdict is reproducible: **same state in → same verdict out**. This is the whole
   point of a validator; a check whose `met` depends on prose judgment is not a gating check.
   - **Gating vs. advisory (the load-bearing distinction).** Only a deterministic rule may flip
     `met`. Anything subjective ("do the docs read well", "is the layout clean") is **advisory**:
     add it to `missing[]` as a note but **do not** let it change a `met`. (This is the lesson
     `verify-knowledge` encodes — gating only on the deterministic set keeps `met` reproducible
     and stops the validator tripping on judgment calls or intentional forward-links.)

4. **Write the remediation.** For each check, the `missing[]` entry on failure is a concrete,
   runnable hint (a command, a file to fix) — this is the fix step's input, so vagueness here
   breaks the loop.

5. **Enforce read-and-judge only.** A validator **never writes the state it judges** — no commits,
   DB writes, or file edits. The lone allowed write is appending to its own `MEMORY.md`
   (bookkeeping; never alters a `met`). If the skill would need to *fix* something, that belongs
   to the paired generator skill, not here.

6. **Handle BLOCKED.** If a check can't run (endpoint unreachable, missing secret), report
   **BLOCKED** in prose and set that criterion `met:false` with a `missing[]` note that it was
   unreachable. A blocked check is not a silent pass, and it is distinct from a genuine `done:false`.

7. **Emit the output shape:** human prose first (a short line per check), THEN the single fenced
   verdict block **last**. `done = every met is true`.

8. **(Optional) Loop memory.** Add a co-located `MEMORY.md` (two zones, per
   `docs/wiki/concepts/loop-memory-protocol.md`) only if the validator will run repeatedly and
   accumulate advisory lessons. For a validator, memory is **advisory-only** — its Lessons may
   sharpen prose or `missing[]` hints but MUST NOT change a deterministic `met` check.

## Self-check before finishing (this skill's own done-check)

Run this checklist against the validator you just produced:

- [ ] Directory is `.claude/skills/verify-<slug>/` (kebab, `verify-` prefix) so Loop Scout finds it.
- [ ] Frontmatter `description` includes trigger phrases (`'verify <x>'`, `'is <x> current/correct'`).
- [ ] Every gating check is a **deterministic rule**; every subjective judgment is marked **advisory**.
- [ ] The output ends with **exactly one** fenced JSON block and it is the **LAST** fenced block.
- [ ] `done` is defined as "all `met` true"; `missing[]` carries a runnable remediation per fail.
- [ ] A "read-and-judge only — never writes the state under test" rule is stated.
- [ ] BLOCKED handling is described (unreachable check → `met:false` + note, not a silent pass).
- [ ] `git check-ignore .claude/skills/verify-<slug>/SKILL.md` returns nothing (not gitignored).

If any box is unchecked, fix the validator before you finish. (Yes — a validator-authoring skill
that ships an unvalidated validator would be missing its own point.)

## Where the validator plugs in

- **A skill loop.** Pair it with a generator (e.g. `verify-knowledge` ↔ `knowledge-sync`); the
  generator produces, calls the validator, applies `missing[]` on `done:false`, re-validates, and
  is **bounded** by a max-iteration cap (`knowledge-sync` caps at N=3) so a stuck loop stops.
- **A Founder Playbook / cloud routine.** `aios-playbook-run` parses the same block via
  `parseDoneCheck`; the playbook-runner cloud routine posts a finding on a `done:false`.
- **Loop Scout.** The mere existence of `verify-<slug>` makes any candidate whose done-check maps
  onto it pass condition #2 — which is often what turns a "blocked" candidate into "build-first".

## See Also
- `docs/wiki/concepts/validator-skills.md` — the verdict contract + the validator pattern
- `docs/wiki/concepts/loop-memory-protocol.md` — the optional co-located MEMORY.md
- `.claude/schedules/loop-scout-agent.md` — the 4-Condition Test + `verify-*` discovery
- Reference validators: `verify-knowledge` (deterministic freshness), `verify-prod` /
  `verify-db-schema` (retrofitted judge skills)
