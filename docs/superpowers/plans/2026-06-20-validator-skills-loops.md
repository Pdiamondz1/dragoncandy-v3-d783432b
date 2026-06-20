# Validator Skills → Closeable Loops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DragonCandy's "judge" skills emit a machine-readable verdict so a `generate → validate → fix → re-validate` loop can close without a human, and prove it with one live loop (the Knowledge loop).

**Architecture:** Reuse the existing Founder Playbooks `done_check` JSON block (`{done, checklist[], missing[]}`) as a universal "Validator Verdict" contract — `aios-playbook-run`'s `parseDoneCheck` already reads it, so no new code. Add one validator skill (`verify-knowledge`) that judges the knowledge layer and emits that block; retrofit `knowledge-sync` to loop on the verdict; teach Loop Scout to score "validator exists." Everything is skills + docs — no schema, RLS, edge function, or secret.

**Tech Stack:** Markdown skill files (`.claude/skills/`), Markdown agent prompts (`.claude/schedules/`), the wiki (`docs/wiki/`), the existing `supabase/scripts/sync-wiki-to-donny.mjs` and `donny-knowledge-sync` edge function (reused, not modified).

**Spec:** `docs/superpowers/specs/2026-06-20-validator-skills-loops-design.md`

---

## File Structure

- **Create** `docs/wiki/concepts/validator-skills.md` — the canonical contract + validator pattern + loop shape. One responsibility: define what a validator skill is. Feeds Donny RAG.
- **Create** `.claude/skills/verify-knowledge/SKILL.md` — the validator. One responsibility: judge the knowledge layer, emit the verdict block. Read-and-judge only.
- **Modify** `.claude/skills/knowledge-sync/SKILL.md` — add the loop close (generate → verify → fix → re-verify, capped).
- **Modify** `.claude/schedules/loop-scout-agent.md` — inventory `.claude/skills/verify-*` and factor it into condition-#2 scoring.
- **Modify** `docs/wiki/index.md` + `docs/wiki/log.md` — register the new concept page (also dog-foods check (c)).
- **Reused, not modified:** `.claude/schedules/knowledge-freshness-agent.md`, `.claude/skills/wiki-ops/SKILL.md`, `supabase/functions/aios-playbook-run/index.ts`.

All edits are in the worktree `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\DC-AIOS-Donny4\` (branch `wiki-donny-chat-ux`). `.claude/skills/` and `.claude/schedules/` are git-tracked.

---

## Task 1: The Validator Verdict contract doc (keystone)

**Files:**
- Create: `docs/wiki/concepts/validator-skills.md`
- Modify: `docs/wiki/index.md` (add the concept entry, alphabetical within Concepts)
- Modify: `docs/wiki/log.md` (append an ingest/update entry)

- [ ] **Step 1: Write the concept page.** Create `docs/wiki/concepts/validator-skills.md` with this exact content:

```markdown
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

​```json
{"done": false,
 "checklist": [{"criterion": "wiki lint: 0 critical", "met": true},
               {"criterion": "RAG synced to wiki HEAD", "met": false}],
 "missing": ["RAG behind wiki ~2d — run sync-wiki-to-donny.mjs"]}
​```

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
```

> NOTE to implementer: the `​```json` fences above contain a zero-width space to keep this plan's
> own code fence intact. When you create the real file, use plain ```` ```json ```` fences.

- [ ] **Step 2: Register in index.md.** Open `docs/wiki/index.md`, find the Concepts section, and add (alphabetical):

```
- [[Validator Skills]](concepts/validator-skills.md) — skills that emit a machine-readable verdict block to close generate→validate loops
```

- [ ] **Step 3: Append to log.md.** Add at the end of `docs/wiki/log.md`:

```
## [2026-06-20] update | Validator Skills concept
Added the Validator Skills concept page: the verdict-block contract (reusing the Founder
Playbooks done_check shape), the validator pattern (read-and-judge only, verdict block last),
and the bounded generate→validate→fix loop. Foundation for the Knowledge loop.
Pages created: [[Validator Skills]]
```

- [ ] **Step 4: Verify the wikilinks resolve.** Run:

```bash
grep -n "Validator Skills" docs/wiki/index.md docs/wiki/log.md docs/wiki/concepts/validator-skills.md
```
Expected: the title appears in `index.md` (entry), `log.md` (created line), and as the H1/title in the concept page. (`[[Verify Knowledge]]`, `[[Loop Scout]]`, `[[Loop Automation]]`, `[[Founder Playbooks]]`, `[[Knowledge Sync]]` may be unresolved until later tasks / existing pages — that's fine; wikilinks are allowed to point ahead.)

- [ ] **Step 5: Commit.**

```bash
git add docs/wiki/concepts/validator-skills.md docs/wiki/index.md docs/wiki/log.md
git commit -m "docs(wiki): add Validator Skills concept — verdict-block contract for loops"
```

---

## Task 2: The `verify-knowledge` validator skill

**Files:**
- Create: `.claude/skills/verify-knowledge/SKILL.md`

- [ ] **Step 1: Write the validator skill.** Create `.claude/skills/verify-knowledge/SKILL.md` with this exact content:

````markdown
---
name: verify-knowledge
description: "Validator for the knowledge layer — judges whether the wiki, Donny's RAG, and the index/log are current for a session's shipped work, and ends with a machine-readable verdict block a loop can branch on. Use as the validate half of the knowledge-sync loop, or when asked to 'verify knowledge', 'is the wiki/RAG current', 'check knowledge freshness'."
---

# Verify Knowledge (DragonCandy) — validator

A **validator skill**: it READS the knowledge layer, JUDGES it against deterministic rules, and
ends with a fenced JSON **verdict block** a loop (or a human) can branch on. It NEVER writes —
no commits, no DB writes, no file edits. It is the *validate* half of the [[knowledge-sync]]
loop; the *generate*/fix half belongs to that skill. See `docs/wiki/concepts/validator-skills.md`
for the contract, and the scheduled, self-healing cloud twin
`.claude/schedules/knowledge-freshness-agent.md` (same freshness rule).

## Checks (all deterministic — same state in, same verdict out)

1. **Wiki lint (a).** Run the [[wiki-ops]] lint checks (contradictions, broken/missing
   `[[wikilinks]]`, orphan pages, index completeness). `met` = **0 critical** findings.
   Advisory nits (thin coverage, style) do NOT flip `met`.

2. **RAG freshness (b).** Compare Donny's RAG to the in-scope wiki, exactly as
   `knowledge-freshness-agent` case (b):
   - `LAST_WIKI_SYNC = git log -1 --format=%cI origin/main -- docs/wiki/concepts docs/wiki/entities docs/wiki/analyses`
   - `RAG_LAST` = GET `/donny_knowledge?select=updated_at&order=updated_at.desc&limit=1`
     against prod (`https://zocahiffooqdybdhguqv.supabase.co/rest/v1`, headers `apikey` +
     `Authorization: Bearer`); an empty array `[]` → `RAG_LAST` is **null**.
   - `met` = **false** if `RAG_LAST` is null (empty table) OR older than `LAST_WIKI_SYNC` by
     more than 24h; otherwise **true**.
   - Do NOT fail on a small `RAG_LAST < LAST_WIKI_SYNC` gap alone — the sync script's exit code
     is the real success authority (a clean no-op sync legitimately leaves RAG_LAST short). The
     >24h window is the freshness rule; the remediation for a fail is to RUN the sync and trust
     its exit code.

3. **Index/log currency (c).** For each page created/updated this session under
   `docs/wiki/{concepts,entities,analyses}/`, confirm it is listed in `docs/wiki/index.md` AND
   has a matching `docs/wiki/log.md` entry. `met` = every session page is in index + log.
   The *substantive* "do the core docs reflect the work" judgment is NOT gated (it's prose, not
   a rule) — if a core doc looks stale, add an **advisory** line to `missing[]` but do NOT flip
   `met` on it.

## Output — human prose, then the verdict block

Print a short human summary of each check, THEN end with exactly one fenced JSON block (the
validator-skills contract — the same shape `aios-playbook-run` parses). The block MUST be the
LAST fenced block in the output:

```json
{"done": false,
 "checklist": [{"criterion": "wiki lint: 0 critical", "met": true},
               {"criterion": "RAG synced to wiki HEAD (<=24h)", "met": false},
               {"criterion": "session pages in index.md + log.md", "met": true}],
 "missing": ["RAG behind wiki ~2d — run: DONNY_SYNC_URL=https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-knowledge-sync SUPABASE_SECRET_KEY=<prod service-role key> node supabase/scripts/sync-wiki-to-donny.mjs"]}
```

- `done` = true only when ALL `met` are true.
- `missing[]` = the remediation for each failed check (what the loop's fix step runs).
- If a check can't run (e.g. can't reach `donny_knowledge`), report **BLOCKED** in prose and set
  that criterion `met:false` with a `missing[]` note that it was unreachable — a blocked check is
  not a silent pass, and it is distinct from a genuine `done:false` fail.

## Rules

- **Read-and-judge only — never write.** The fix (running the sync, editing the wiki) is the
  caller's job ([[knowledge-sync]]), not this skill's.
- The verdict block MUST be the LAST fenced block in the output (the parser reads the last one).
- Deterministic `met`: same repo + RAG state → same verdict. No prose judgment in a gating check.
````

- [ ] **Step 2: Verify frontmatter + verdict shape.** Run:

```bash
head -3 .claude/skills/verify-knowledge/SKILL.md
grep -c '"done"\|"checklist"\|"missing"' .claude/skills/verify-knowledge/SKILL.md
```
Expected: line 2 is `name: verify-knowledge`; the grep finds the verdict-block keys (≥1).

- [ ] **Step 3: Confirm the block parses like the real parser would.** The parser keys on a
boolean `done` in the last fenced block. Sanity-check the example block is valid JSON:

```bash
node -e "const m=require('fs').readFileSync('.claude/skills/verify-knowledge/SKILL.md','utf8').match(/\`\`\`json\s*([\s\S]*?)\`\`\`/g); const last=m[m.length-1].replace(/\`\`\`json|\`\`\`/g,'').trim(); const o=JSON.parse(last); if(typeof o.done!=='boolean') throw new Error('no boolean done'); console.log('PARSES, done=',o.done);"
```
Expected: `PARSES, done= false`

- [ ] **Step 4: Commit.**

```bash
git add .claude/skills/verify-knowledge/SKILL.md
git commit -m "feat(skills): add verify-knowledge validator emitting the verdict block"
```

---

## Task 3: Retrofit `knowledge-sync` to close the loop

**Files:**
- Modify: `.claude/skills/knowledge-sync/SKILL.md` (replace the `## Done when` section)

- [ ] **Step 1: Replace the `## Done when` section.** In `.claude/skills/knowledge-sync/SKILL.md`, replace the entire final section (from `## Done when` to end of file):

Old (current end of file):
```
## Done when

- New/updated wiki pages exist on `main` for the shipped work, `index.md`/`log.md` updated.
- Relevant core docs reflect the change.
- `donny_knowledge.max(updated_at)` is current with the merge.
```

New:
```
## Close the loop (verify → fix → re-verify)

This skill is the *generate*/fix half of the knowledge loop; [[verify-knowledge]] is the
*validate* half (contract: `docs/wiki/concepts/validator-skills.md`). After step 6, close the loop:

1. Run the [[verify-knowledge]] validator. Read its fenced verdict block (the LAST fenced JSON
   block in its output).
2. If `done:true` → the knowledge layer is current. Report and finish.
3. If `done:false` → apply the fixes named in `missing[]`:
   - RAG behind → run `node supabase/scripts/sync-wiki-to-donny.mjs` (the step-6 command).
   - Page missing from `index.md`/`log.md` → add it.
   - Wiki lint critical → fix the contradiction / broken wikilink.
   Then re-run [[verify-knowledge]].
4. **Cap at 3 iterations.** If still `done:false` after 3, STOP and surface the residual
   `missing[]` to the user. Never loop unbounded; never claim `done:true` the validator did not return.

The old "Done when" bullets — index/log updated, core docs current,
`donny_knowledge.max(updated_at)` current — are exactly the checks [[verify-knowledge]] now
judges mechanically and returns as the verdict block.
```

- [ ] **Step 2: Verify the edit.** Run:

```bash
grep -n "Close the loop\|verify-knowledge\|Cap at 3" .claude/skills/knowledge-sync/SKILL.md
```
Expected: the new heading, ≥2 `verify-knowledge` references, and the `Cap at 3` line are present; `## Done when` no longer appears.

- [ ] **Step 3: Commit.**

```bash
git add .claude/skills/knowledge-sync/SKILL.md
git commit -m "feat(skills): knowledge-sync closes a bounded verify→fix loop via verify-knowledge"
```

---

## Task 4: Loop Scout condition-#2 validator signal

**Files:**
- Modify: `.claude/schedules/loop-scout-agent.md` (step 1 inventory + step 4 scoring)

- [ ] **Step 1: Add a validator-skill inventory line to step 1.** In `.claude/schedules/loop-scout-agent.md`, find the end of step 1 (the line ending `...A candidate that is already covered here is OUT.`) and append a new sentence right after it:

Find:
```
   refresh. A candidate that is already covered here is OUT.
```
Replace with:
```
   refresh. A candidate that is already covered here is OUT.
   Also enumerate `.claude/skills/verify-*` — the existing VALIDATOR skills (e.g. verify-prod,
   verify-db-schema, verify-knowledge) that already emit a deterministic done-verdict. Record
   which exist; this feeds condition 2 below.
```

- [ ] **Step 2: Strengthen condition-#2 scoring in step 4.** Find the step-4 scoring block:

Find:
```
4. SCORE + RANK: for each candidate run the 4-Condition Test (pass/partial/fail per condition),
   then rank. Map the overall result to a build priority used as `severity`:
   - `high` = passes all 4 (build-first), `medium` = passes 3, `low` = passes ≤2 / blocked.
   Keep only the top ~5 candidates.
```
Replace with:
```
4. SCORE + RANK: for each candidate run the 4-Condition Test (pass/partial/fail per condition),
   then rank. For **condition 2 (rule judges done?)**, use the validator inventory from step 1
   as the concrete signal: a candidate whose done-check maps onto an existing `.claude/skills/verify-*`
   validator (or that has one purpose-built) passes condition 2; one with no validator and no
   deterministic rule is at most `partial` on condition 2 and its build recommendation should be
   "blocked on: author a verify-* validator skill first." Map the overall result to a build
   priority used as `severity`:
   - `high` = passes all 4 (build-first), `medium` = passes 3, `low` = passes ≤2 / blocked.
   Keep only the top ~5 candidates.
```

- [ ] **Step 3: Verify the edits.** Run:

```bash
grep -n "verify-\*\|author a verify-\* validator\|validator inventory" .claude/schedules/loop-scout-agent.md
```
Expected: the step-1 inventory line and the step-4 condition-2 signal are both present.

- [ ] **Step 4: Commit.**

```bash
git add .claude/schedules/loop-scout-agent.md
git commit -m "feat(aios): Loop Scout scores condition-2 by validator-skill presence"
```

---

## Task 5: End-to-end verification of the loop

No new files. This task proves the contract and the loop actually work. Do NOT skip — the spec's
value claim rests on it.

- [ ] **Step 1: Shared-contract parser check.** Confirm `aios-playbook-run`'s real parser logic
accepts a `verify-knowledge` verdict block unchanged. Extract the example block from the skill and
run it through the same "last fenced block with boolean done" rule:

```bash
node -e "
const fs=require('fs');
const t=fs.readFileSync('.claude/skills/verify-knowledge/SKILL.md','utf8');
const cands=[...t.matchAll(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/gi)].map(m=>m[1].trim());
let res=null; for(let i=cands.length-1;i>=0;i--){try{const p=JSON.parse(cands[i]); if(p&&typeof p.done==='boolean'){res=p;break;}}catch{}}
if(!res) throw new Error('parseDoneCheck would return null'); console.log('parseDoneCheck OK:', JSON.stringify(res));
"
```
Expected: `parseDoneCheck OK: {"done":false,...}` — proving cloud playbooks and skill loops share one contract.

- [ ] **Step 2: Run the validator for real (happy/observed path).** Invoke the `verify-knowledge`
skill in this session against the live repo + prod `donny_knowledge`. Confirm it: (1) prints human
prose for all three checks, and (2) ends with a fenced verdict block whose `done` reflects the real
state. Record the verdict.

- [ ] **Step 3: Injected-gap path.** If `verify-knowledge` reported `done:true` in step 2, create a
deliberate gap to confirm it detects failure: add a NEW wiki concept page stub under
`docs/wiki/concepts/` WITHOUT running the RAG sync, then re-run `verify-knowledge`. Expected:
`done:false` with a `missing[]` entry naming `sync-wiki-to-donny.mjs` (RAG behind) and/or the
missing index/log entry. (If step 2 already showed `done:false`, that IS the gap path — note it and
skip creating an artificial one.)

- [ ] **Step 4: Loop-closes path.** Run the `knowledge-sync` loop close: apply the `missing[]`
remediation (run the sync / add the index+log entry), re-run `verify-knowledge`, and confirm it now
returns `done:true`. Confirm the 3-iteration cap exists in the skill text (Task 3) so an unfixable
gap would stop rather than spin.

- [ ] **Step 5: Loop Scout dry-read.** Re-read `.claude/schedules/loop-scout-agent.md` and confirm
the logic: a candidate WITH a matching `verify-*` skill scores higher on condition 2 than one
WITHOUT. (No live cron run — this is a prompt-logic check.)

- [ ] **Step 6: Commit any verification artifacts** (e.g. if step 3 left a real stub page you chose
to keep, ensure index/log are updated and RAG synced; otherwise revert the artificial stub).

```bash
git status   # confirm no stray artificial test files remain
```

---

## Task 6: Finish the branch (knowledge-sync + Codex + PR)

- [ ] **Step 1: Dog-food knowledge-sync for THIS session.** Run the (now loop-closing)
`knowledge-sync` skill for this branch's work: write `docs/wiki/raw/sessions/2026-06-20-validator-skills-loops.md`,
`/wiki-ops ingest` it (the `validator-skills` concept page already exists from Task 1 — update/cross-link
rather than duplicate), refresh `docs/PROJECT_CONTEXT.md` Active Workstreams with a "Validator skills →
loops" entry, and let the loop's `verify-knowledge` close confirm the layer is current. This is the
plan validating itself.

- [ ] **Step 2: Codex second review.** Run the mandatory independent reviewer (see `codex-review` skill):

```bash
codex review --base main --title "Validator skills → closeable loops"
```
Fix any real findings; re-run until clean. Relay Codex's verdict to the user.

- [ ] **Step 3: Open the PR** via `finishing-a-development-branch`. Include the spec, plan, the new
skill, the edits, and the wiki/doc changes. After merge, sync Donny's RAG (the loop's own sync step).

---

## Notes / constraints
- **Run all verification commands via the Bash tool, not PowerShell** — the `grep`/`head`/`node -e`
  (single-quoted, escaped-backtick) snippets are POSIX and the host's primary shell is PowerShell.
- Skills + docs only: **no schema, no RLS, no new edge function, no secret, no auth/payment code.**
- The verdict block deliberately reuses the existing `done_check` parser — do not invent a new shape.
- Validators never write; the loop's only write is the idempotent RAG sync via `donny-knowledge-sync`.
- Bounded loop (N=3) — never unbounded, never fabricate `done:true`.
