---
title: Validator Skills → Closeable Loops
type: spec
created: 2026-06-20
status: design
sources: [IMG_8327 concept, 2026-06-19-aios-loop-automation-design.md, 2026-06-19-aios-founder-playbooks-design.md]
tags: [aios, loops, skills, validators, knowledge-sync, loop-scout]
---

# Validator Skills → Closeable Loops

## 1. Context & problem

A concept ("Convert a normal Skill to a Skill that can help with Verification… tweak some to
become validators to allow me to create loops") applied to DragonCandy / DC AIOS.

A loop is `generate → validate → (fail?) → fix → re-validate`. The primitive that **closes**
a loop is a **validator that emits a machine-readable pass/fail** — which is precisely
condition #2 of the existing Loop Scout **4-Condition Test** ("Can a deterministic rule decide
when a run is done/correct?", `.claude/schedules/loop-scout-agent.md`).

DragonCandy's skills already split into two kinds:

- **Generators** — `autoresearch`, `knowledge-sync`, `wiki-ops ingest`. They produce artifacts.
- **Judges** — `verify-prod` (console errors = 0), `verify-db-schema` (a binary "Done"
  checklist), `codex-review` (clean / has-issues), `wiki-ops lint` (numbered findings),
  `worktree-cleanup` (4 safety gates), `autoresearch`'s acceptance gate (`kept|discarded|flagged`).

The judges **already decide** pass/fail — but they emit **prose for a human**. A loop can't
branch on prose. Meanwhile the AIOS **already owns a machine-readable verdict contract**: the
Founder Playbooks `done_check` JSON, emitted by every playbook run and parsed by
`aios-playbook-run`'s `parseDoneCheck` (supabase/functions/aios-playbook-run/index.ts:155).

**The two halves exist; they are not wired together.** This spec standardizes one verdict
shape, retrofits the judge-capable skills the first loop needs, and wires ONE concrete loop —
the **Knowledge loop** — end to end as the reference implementation.

**Scope (confirmed):** contract + retrofit + one live loop. First loop = Knowledge loop.
Deferred (automate-last): a `make-validator` meta-skill that converts any skill into its
validator variant.

## 2. The Validator Verdict contract (keystone)

A **validator skill** ends its output with exactly one fenced JSON block — the same shape
`aios-playbook-run` already emits and parses, so **no new parser is introduced**:

```json
{"done": false,
 "checklist": [{"criterion": "wiki lint: 0 critical", "met": true},
               {"criterion": "RAG synced to wiki HEAD", "met": false}],
 "missing": ["RAG behind wiki ~2d — run sync-wiki-to-donny.mjs"]}
```

- `done` (boolean) — the verdict. `true` only when **every** check passed.
- `checklist` — one entry per check, each `{criterion, met}`.
- `missing` — human-and-loop-readable remediation hints for the failed checks. **This list is
  what the loop's fix step consumes.** Empty when `done:true`.

Why reuse `done_check` verbatim instead of inventing a `{verdict, checks, remediation}` shape:

1. `parseDoneCheck` (last fenced block, boolean `done`) already reads it — cloud playbooks AND
   skill loops share **one** contract with zero new code.
2. `missing[]` already carries the remediation semantics a loop needs.
3. The three rendered states the AIOS already supports (`done:true` ✅ / `done:false` ⚠️ /
   unparseable → neutral chip) carry straight over.

### The validator pattern (what makes a skill a validator)

A validator skill:

- runs **deterministic checks** (a rule, not a vibe — so `done` is reproducible);
- is **read-and-judge only — it never writes** (no commits, no DB writes, no file edits);
- prints its **human prose first** (unchanged for human readers), then the **fenced verdict
  block last** (so `parseDoneCheck`'s "last fenced block" rule picks it up).

Retrofitting an existing judge into a validator is therefore **purely additive and
backward-compatible**: append the verdict block; change nothing a human currently reads.

### Where the contract is documented

`docs/wiki/concepts/validator-skills.md` — the canonical block, the validator pattern, and the
generate→validate→fix→re-validate loop shape. As a wiki concept page it also flows into Donny's
RAG via the normal `knowledge-sync` path — so the knowledge *about* validators joins the
self-improving layer it describes. Cross-links: [[Loop Automation]], [[Founder Playbooks]],
[[Knowledge Sync]], [[Loop Scout]].

## 3. The proof — Knowledge loop

### 3a. New validator skill: `verify-knowledge`

`.claude/skills/verify-knowledge/SKILL.md` — naming consistent with `verify-prod` /
`verify-db-schema`. It composes three checks that already exist as prose elsewhere into one
verdict block:

| Check | Source of the rule | `met` when |
|-------|--------------------|-----------|
| (a) Wiki lint | `wiki-ops lint` critical findings | 0 critical findings — critical = contradictions OR index-incompleteness (page on disk not in `index.md`). Missing-page `[[wikilinks]]` are **advisory** (this wiki allows forward links per `KNOWLEDGE_WIKI.md`), so the validator never self-trips on intentional forward links |
| (b) RAG freshness | `knowledge-freshness-agent` git/RAG comparison | `donny_knowledge.max(updated_at)` not behind `LAST_WIKI_SYNC` (concepts/entities/analyses) by >24h, and table non-empty |
| (c) Index/log currency | `knowledge-sync` "Done when" gate | `index.md` lists the session's new/updated pages and `log.md` has the matching entry — both **deterministic** disk-vs-index checks |

**Why (c) is scoped to index/log, not "do the core docs reflect the work":** a validator's
`met` must be a reproducible rule (section 2). "Does `PROJECT_CONTEXT.md` adequately reflect
what shipped?" is prose judgment, not a rule — gating on it would make `done` non-reproducible.
So (c) **gates** only on the mechanical checks (every session page is in `index.md`; a `log.md`
entry exists). The substantive "core docs reflect the work" concern is still surfaced — as an
**advisory line in `missing[]` that does NOT by itself flip `met` to false** (it prompts the
human/driver to look, without making the verdict non-deterministic).

It reuses the **exact** freshness logic the `knowledge-freshness-agent` already encodes —
including its **non-obvious rule that the sync script's exit code, not a timestamp compare, is
the success authority** (a correct no-op sync can legitimately leave `RAG_LAST` short of
`LAST_WIKI_SYNC`). `verify-knowledge` therefore judges (b) on the same basis: behind-by->24h on
the in-scope dirs OR an empty table = `met:false`; otherwise `met:true`.

Output: human summary of each check, then the fenced verdict block. **No writes** — it reads
git state, runs lint read-only, and GETs `donny_knowledge`. The remediation for a failed (b) is
the blessed `node supabase/scripts/sync-wiki-to-donny.mjs`; for (a)/(c), the specific fix
(add the missing cross-ref, update the stale doc).

### 3b. Retrofit `knowledge-sync` to close the loop

`.claude/skills/knowledge-sync/SKILL.md` keeps its current generative steps 1–6, and its
"Done when" section becomes a **bounded loop close**:

```
After step 6, run the verify-knowledge validator.
- Parse its verdict block.
- If done:true → the loop is closed; report and finish.
- If done:false → apply the fixes named in missing[] (e.g. run sync-wiki-to-donny.mjs,
  add the missing wikilink, refresh the stale core doc), then re-run verify-knowledge.
- Cap at N=3 iterations. If still done:false after N, STOP and surface the residual
  missing[] to the user — never loop unbounded, never fabricate done:true.
```

This mirrors the self-loop `codex-review` already documents (fix → re-run until clean), now on a
machine-readable verdict rather than prose.

### 3c. Invariants preserved

- **Validators never write.** `verify-knowledge` only reads.
- The loop's **only** write stays the idempotent RAG sync through the existing audited
  `donny-knowledge-sync` choke point (the same single write the `knowledge-freshness-agent`
  is allowed). No new write surface.
- **A human merges wiki first.** The loop runs on a branch / at PR time; it propagates and
  validates, it does not auto-merge.
- Bounded iteration (N=3) bounds blast radius — condition #3 of the 4-Condition Test.

## 4. Loop Scout gets a real condition-#2 signal

`.claude/schedules/loop-scout-agent.md` condition #2 ("Rule judges done?") today is assessed by
the agent's judgment. Add a concrete signal: **a candidate scores higher on condition #2 when a
matching `verify-*` validator skill already exists** in `.claude/skills/` (or its checks map
cleanly onto one). A candidate *with* a validator is build-ready; one without is "blocked on:
author a validator skill". This closes the loop on Loop Scout itself — it now recommends
*building the validator* as the unlock for an otherwise-promising candidate.

The edit is additive: step 1 today inventories `.claude/schedules/` and pg_cron jobs but does
**not** enumerate `.claude/skills/` — so the edit **adds** a new `.claude/skills/verify-*`
enumeration to step 1, and step 4 (scoring) factors that presence into the condition-2
pass/partial/fail. Understand the diff as a new inventory line, not a reword of existing text.

## 5. Ranked analysis of judge-capable skills (the image's literal ask)

Implemented now: only the contract + the Knowledge loop. The rest are documented as ranked
next-loops so the map is complete without over-building.

| Skill | Verdict today | Validator tweak | Loop it unlocks | Priority |
|-------|---------------|-----------------|-----------------|----------|
| **wiki-ops lint** | numbered findings (prose) | emit verdict block: `done` = 0 critical | (feeds verify-knowledge) | **now** |
| **knowledge-freshness-agent** | files a finding / self-heals | already machine-judged via exit code; align its language to the contract | the Knowledge loop's cloud twin | **now (align)** |
| **verify-db-schema** | binary "Done" checklist (prose) | append verdict block from the 5 done-bullets | schema-fix → verify → fix loop | next |
| **codex-review** | Codex summary line (clean/dirty) | capture clean/dirty → verdict block | code fix → re-review loop (already self-loops) | next |
| **verify-prod** | "console errors = 0" report | append verdict block (errors==0 → done) | deploy → verify (fix-loop only where safe) | next |
| **autoresearch** | `kept\|discarded\|flagged` gate | map gate → verdict block | research → verify → re-research (already ~80% there) | next |
| **worktree-cleanup** | 4 safety gates | gates → verdict block | (cleanup is a one-shot, low loop value) | low |

**Deferred — automate last:** a `make-validator` meta-skill that takes any skill and emits its
validator variant + the loop it would close. Correct eventual move; premature before one
validator has closed one loop on the shared contract.

## 6. Components & boundaries

- **Contract doc** (`docs/wiki/concepts/validator-skills.md`) — the single definition; depends
  on nothing; consumed by every validator skill and by `aios-playbook-run`'s existing parser.
- **`verify-knowledge`** (validator) — input: repo + git + `donny_knowledge` read access;
  output: verdict block; depends on `wiki-ops lint` and the freshness rule; **no writes**.
- **`knowledge-sync`** (generator + loop driver) — drives generate→verify→fix→re-verify;
  the only unit allowed to write (RAG sync via `donny-knowledge-sync`).
- **Loop Scout** (scout) — reads `.claude/skills/verify-*` to score condition #2.

Each unit is independently understandable and testable; they communicate solely through the
verdict block and the existing sync choke point.

## 7. Error handling

- **Unparseable verdict** — if `verify-knowledge` produces no fenced block (crash, truncation),
  the loop driver treats it as **not done** and surfaces it (same tolerance as
  `parseDoneCheck` returning null → neutral state). Never assume done on absence.
- **Stuck loop** — N=3 cap; after that, stop and surface residual `missing[]`. No silent give-up,
  no fabricated `done:true`.
- **Sync failure during fix** — `sync-wiki-to-donny.mjs` non-zero exit is a failed (b); the
  verdict stays `done:false` with the error in `missing[]`, exactly as the freshness agent
  reports it. The loop surfaces it rather than retrying blindly.
- **Read-auth failure** (can't reach `donny_knowledge`) — verify-knowledge reports BLOCKED, not
  `done:false`; a blocked validator is not a failed check.

## 8. Testing / verification

1. **Happy path** — run `knowledge-sync` on a real session: it generates, then invokes
   `verify-knowledge`, which prints prose **and** a trailing fenced verdict block; `done:true`
   closes the loop.
2. **Injected gap** — skip the RAG sync deliberately: `verify-knowledge` returns `done:false`
   with a `missing[]` pointing at `sync-wiki-to-donny.mjs`.
3. **Loop closes** — let the driver apply the remediation and re-verify → `done:true`. Confirm
   the N=3 cap stops a deliberately unfixable gap.
4. **Shared contract** — paste a `verify-knowledge` verdict block into a playbook done-criteria
   smoke run; confirm `aios-playbook-run`'s `parseDoneCheck` parses it unchanged (proves one
   contract across cloud + skill loops).
5. **Loop Scout** — dry-read the edited prompt logic: a candidate with a `verify-*` skill scores
   higher on condition #2 than one without. (No live cron run needed.)

## 9. Constraints

- **Skills-layer + docs only.** No schema, no RLS, no new edge function, no secret. The contract
  deliberately reuses the existing `done_check` parser.
- No code touches auth, payments, or messaging/realtime patterns.
- Per-session `knowledge-sync` discipline still applies to this branch on finish — and this
  branch is itself a clean dog-fooding of the new loop.

## 10. Files

- New: `docs/superpowers/specs/2026-06-20-validator-skills-loops-design.md` (this file)
- New: `docs/wiki/concepts/validator-skills.md`
- New: `.claude/skills/verify-knowledge/SKILL.md`
- Edit: `.claude/skills/knowledge-sync/SKILL.md` (loop close)
- Edit: `.claude/schedules/loop-scout-agent.md` (condition-#2 validator-exists signal)
- Reference (reused, not modified): `.claude/schedules/knowledge-freshness-agent.md`,
  `.claude/skills/wiki-ops/SKILL.md`, `supabase/functions/aios-playbook-run/index.ts`
