# Claude Skills Framework Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit DragonCandy's dev `.claude/skills/` library and Donny (playbooks/tools/RAG) against Anthropic's 9-category Claude Skills framework, publish a durable wiki analysis page + `/internal/findings` backlog, and ship the single highest-value quick win (prior: a `careful` safety skill).

**Architecture:** Analysis-first. Tasks 1–4 build one wiki analysis page section-by-section (framework → rubric → dev scorecard → Donny scorecard → ranked backlog), committing after each. Task 5 files each backlog item as an `aios_findings` row via the `aios-report-ingest` choke point. A human checkpoint confirms the #1 quick win, then Tasks 6–8 build the `careful` skill and run the branch-finish gates. The audit itself builds no product code, schema, or runtime.

**Tech Stack:** Markdown (wiki + skills), Supabase MCP (`execute_sql`, `list_tables`, `get_advisors` against prod ref `zocahiffooqdybdhguqv`), `aios-report-ingest` edge function, git worktree `feat/claude-skills-audit`.

**Spec:** `docs/superpowers/specs/2026-07-07-claude-skills-framework-audit-design.md`

---

## Pre-flight (read before starting)

- **Worktree/branch:** all work is on branch `feat/claude-skills-audit` in the DC-3 worktree. The shell cwd may resolve to the MAIN checkout — **always `cd` to `C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-3` first**, and write with the explicit worktree path. Verify with `git branch --show-current` → `feat/claude-skills-audit` ([[project_shell_cwd_is_main_checkout]]).
- **Shell/tooling:** the shell snippets below are bash (`head`, `grep`, `curl`, `&&`) — run them through the **Bash tool** (Git Bash), not PowerShell. Prefer the dedicated **Grep** tool over `grep` for the Task 3 tool-name sweep and the **Read** tool over `head`/`cat`. Supabase reads/writes go through the Supabase MCP tools.
- **The rubric (7 criteria)** — score each skill/surface **pass / partial / fail** with a one-line reason. `N/A` where a criterion structurally cannot apply (never `fail`):
  1. Single category (fits exactly one of the 9)
  2. Gotchas (failure-point-driven, not happy-path)
  3. Progressive disclosure (SKILL.md is a signpost)
  4. AI-discovery description (says *when to trigger*)
  5. Bundled scripts (executables for deterministic steps)
  6. Memory across runs (Loop Memory Protocol / log)
  7. Non-redundant (novel project-specific info)
- **The 9 categories:** Library/API reference · Product verification · Data fetching/analysis · Business process · Code scaffolding · Code quality/review · CI-CD/deployment · Runbooks · Infrastructure ops.
- **The 9 dev skills to audit:** `autoresearch`, `codex-review`, `knowledge-sync`, `refresh-main`, `verify-db-schema`, `verify-knowledge`, `verify-prod`, `wiki-ops`, `worktree-cleanup` (each at `.claude/skills/<name>/SKILL.md`; four also have `MEMORY.md`).
- **Honesty gate:** an all-green scorecard is a failed audit. Score `partial`/`fail` where earned; each becomes a backlog item.

---

## Task 1: Wiki page skeleton + framework & rubric sections

**Files:**
- Create: `docs/wiki/analyses/claude-skills-framework-audit.md`

- [ ] **Step 1: Create the page with frontmatter + framework recap + rubric**

Write the file with this exact frontmatter and the §1/§2 content (framework recap from the spec §1, and the 7-criterion rubric verbatim from the Pre-flight above). Leave placeholder headings `## Dev-library scorecard`, `## 9-category coverage matrix`, `## Donny audit`, `## Ranked backlog`, `## See Also` for later tasks.

```markdown
---
title: Claude Skills Framework Audit
type: analysis
created: 2026-07-07
updated: 2026-07-07
sources: [https://www.youtube.com/watch?v=3UWxMPUko1k, https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills]
tags: [skills, claude-code, aios, donny, audit]
---
# Claude Skills Framework Audit
```

- [ ] **Step 2: Verify the file parses as valid frontmatter**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-3" && head -8 docs/wiki/analyses/claude-skills-framework-audit.md`
Expected: the `---`-delimited frontmatter block prints intact.

- [ ] **Step 3: Commit**

```bash
git add docs/wiki/analyses/claude-skills-framework-audit.md
git commit -m "docs(wiki): skills-audit page skeleton + framework/rubric"
```

---

## Task 2: Dev-library audit — scorecard + coverage matrix

**Files:**
- Modify: `docs/wiki/analyses/claude-skills-framework-audit.md` (fill `## Dev-library scorecard` + `## 9-category coverage matrix`)

- [ ] **Step 1: Read all 9 skills**

Read each `.claude/skills/<name>/SKILL.md` (and `MEMORY.md` where it exists) for: `autoresearch`, `codex-review`, `knowledge-sync`, `refresh-main`, `verify-db-schema`, `verify-knowledge`, `verify-prod`, `wiki-ops`, `worktree-cleanup`.

- [ ] **Step 2: Score each skill against the 7-criterion rubric**

For each skill, write one row: skill name, then criteria 1–7 each `pass/partial/fail/N-A` with a ≤10-word reason, then a one-line "biggest improvement". Use markdown bullets or a compact per-skill block — **no giant pipe table** (keeps it readable + RAG-friendly). Every `partial`/`fail` is a candidate backlog item (carry to Task 4).

- [ ] **Step 3: Build the 9-category coverage matrix**

For each of the 9 categories, mark **Covered / Partial / Missing** and name the skill(s) that cover it. Confirm (do not assume) the spec's hypotheses by what you actually read:
- Library/API reference, Code scaffolding, Runbooks → expected Missing/Partial — verify.
- Product verification, Code quality/review, CI-CD → expected Covered — verify.
- Note the cross-cutting absence of a `careful` safety skill.

- [ ] **Step 4: Verify completeness**

Check: all 9 skills have a scorecard row; all 9 categories have a matrix verdict. If any skill scored all-green on all 7, re-examine — that is a red flag for grade inflation, not a clean skill.

- [ ] **Step 5: Commit**

```bash
git add docs/wiki/analyses/claude-skills-framework-audit.md
git commit -m "docs(wiki): skills-audit dev-library scorecard + coverage matrix"
```

---

## Task 3: Donny audit — the product lens

**Files:**
- Modify: `docs/wiki/analyses/claude-skills-framework-audit.md` (fill `## Donny audit`)

- [ ] **Step 1: Inventory Founder Playbooks**

Run via Supabase MCP `execute_sql` against prod (`zocahiffooqdybdhguqv`), read-only:

```sql
select slug, title, allowed_proposals is not null as can_propose,
       length(task_md) as task_len, length(done_criteria_md) as done_len
from aios_playbooks order by created_at;
```

(If a column name differs, first run `list_tables` filtered to `aios_playbooks` to get the real columns — verify-db-schema discipline. Adjust the select.)

- [ ] **Step 2: Inventory Donny's tool set**

Grep the donny-chat tool definitions for tool names + descriptions:

Run: `grep -nE '(name:\s*"|"name":\s*")' supabase/functions/donny-chat/*.ts | head -80`
Also read the tool-description strings near each. Goal: list each tool, its purpose, and whether its description is written for correct AI selection (criterion 4) or straddles purposes (criterion 1).

- [ ] **Step 3: Inventory the RAG sync scope**

Confirm the wiki→`donny_knowledge` sync scope from `supabase/scripts/sync-wiki-to-donny.mjs` (should be `concepts/`, `entities/`, `analyses/` only). Optionally spot-check retrieval quality: `execute_sql` → `select count(*), max(updated_at) from donny_knowledge;`.

- [ ] **Step 4: Score the three surfaces**

Score **Founder Playbooks**, **Donny tool set**, **Donny RAG** against the 7-criterion rubric, marking `N/A` where a criterion cannot apply (e.g. bundled-scripts / memory-across-runs vs RAG). Add the one **strategic note**: is the Donny "skill-folder" format worth a sub-project or a wontfix? Record value/effort; do not decide here.

- [ ] **Step 5: Commit**

```bash
git add docs/wiki/analyses/claude-skills-framework-audit.md
git commit -m "docs(wiki): skills-audit Donny surface scorecard + strategic note"
```

---

## Task 4: Ranked backlog + index/log

**Files:**
- Modify: `docs/wiki/analyses/claude-skills-framework-audit.md` (fill `## Ranked backlog` + `## See Also`)
- Modify: `docs/wiki/index.md`
- Modify: `docs/wiki/log.md`

- [ ] **Step 1: Assemble the ranked backlog**

Collect every `partial`/`fail` (Tasks 2–3) + every Missing/Partial category into one list. For each item: title, target (dev / Donny), category+criterion it closes, one-line value rationale, effort **S/M/L**, and a build recommendation. Sort by **value×effort** (high-value × S = top). Mark the **#1 S-effort item** explicitly — this is the Phase-2 quick-win candidate.

- [ ] **Step 2: Fill `## See Also`**

Add `[[wikilinks]]`: `[[Loop Memory Protocol]]`, `[[AIOS Founder Playbooks]]`, `[[Self-Improving App]]`, and the framework sources. (Wikilinks resolve via `index.md`; an unresolved link is acceptable per wiki rules but prefer existing display names — check `docs/wiki/index.md`.)

- [ ] **Step 3: Update index.md (alphabetical) + log.md**

Add the page to `docs/wiki/index.md` in alphabetical order. Append to `docs/wiki/log.md`:

```markdown
## [2026-07-07] analysis | Claude Skills framework audit
Scored the 9 dev skills + Donny (playbooks/tools/RAG) against Anthropic's 9-category
Skills framework; produced a value×effort-ranked backlog + /internal/findings entries.
Pages created: [[Claude Skills Framework Audit]]
```

- [ ] **Step 4: Verify**

Check: backlog has ≥1 item per Missing/Partial finding; a single #1 quick-win is marked; page appears in `index.md`; `log.md` has the new entry.

- [ ] **Step 5: Commit**

```bash
git add docs/wiki/analyses/claude-skills-framework-audit.md docs/wiki/index.md docs/wiki/log.md
git commit -m "docs(wiki): skills-audit ranked backlog + index/log"
```

---

## Task 5: File the backlog as /internal/findings

**Files:** none (network write to prod AIOS).

- [ ] **Step 1: Confirm the `aios_findings` shape AND the ingest body**

Run `list_tables` (Supabase MCP) filtered to `aios_findings`; note the real columns (expected: `severity, title, summary_md, evidence jsonb, source, fingerprint, status, occurrences, created_at`). This governs the fallback insert. **Also** read `supabase/functions/aios-report-ingest/index.ts` (the handler normalizes the POST body, so the table shape alone doesn't guarantee the request shape) — or confirm the body against the already-read `.claude/schedules/loop-scout-agent.md` caller — so the Step-2 payload matches what the function actually parses, not just the Loop Scout convention.

- [ ] **Step 2: File via the choke point (preferred)**

If `AIOS_INGEST_SECRET` is available in the session env, POST one request with all backlog items:

```bash
curl -sS -X POST "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/aios-report-ingest" \
  -H "Authorization: Bearer $AIOS_INGEST_SECRET" -H "Content-Type: application/json" \
  -d '{"type":"findings","payload":{"findings":[
    {"severity":"high","title":"[skills-audit] <item>","summary_md":"- value…\n- build rec…",
     "evidence":{"target":"dev","category":"…","criteria_failed":["…"],"effort":"S"},
     "source":"skills-audit","fingerprint":"skills-audit:<kebab-slug>"}
  ]}}'
```

One finding per backlog item. `severity` = build priority (`high` = top quick wins / high value, `medium`, `low`); **never `critical`** (reserved for real bugs). `summary_md` = markdown bullets, **no pipe tables**.

- [ ] **Step 3: Fallback if the secret is absent**

If `$AIOS_INGEST_SECRET` is not set locally, file via Supabase MCP `execute_sql` — a direct service-role INSERT into `aios_findings` replicating the same columns/`fingerprint`/`severity` values, `status='open'`. This consciously bypasses the ingest normalizer for a one-time human-run audit (note it in the run summary). Do **not** invent columns — use exactly what Step 1 returned.

- [ ] **Step 4: Verify what landed**

```sql
select severity, title, status from aios_findings
where source = 'skills-audit' order by created_at desc;
```

Expected: one row per backlog item. Report inserted count.

- [ ] **Step 5: (no commit — this task writes to prod, not the repo)**

---

## CHECKPOINT: confirm the #1 quick win

**Stop and surface to the human.** State the #1 S-effort backlog item from Task 4.

- If it **is** the `careful` safety skill → proceed to Task 6.
- If it is **something else** with strictly higher value×low-effort → present it to the user and get an explicit go/no-go before building (spec §9 guard). Do not build past this checkpoint without confirmation.

---

## Task 6: Build the `careful` safety skill (the quick win)

> Assumes the checkpoint confirmed `careful` as #1. If a different skill was confirmed, adapt this task to that skill's content while keeping the same structure (SKILL.md + MEMORY.md + .gitignore negation + Task 7/8 gates).

**Files:**
- Create: `.claude/skills/careful/SKILL.md`
- Create: `.claude/skills/careful/MEMORY.md`
- Modify: `.gitignore` (narrow negation so the new skill files are tracked)

- [ ] **Step 1: Fix the `.gitignore` footgun FIRST**

The broad `skills/` ignore pattern silently drops new first-party `.claude/skills/` files ([[project_loop_memory_protocol]]). Add a narrow negation (mirror the existing `MEMORY.md` negation pattern) so `.claude/skills/careful/**` is tracked. Verify: `git check-ignore -v .claude/skills/careful/SKILL.md` returns **nothing** (not ignored).

- [ ] **Step 2: Write `.claude/skills/careful/SKILL.md`**

```markdown
---
name: careful
description: "On-demand safety gate for DragonCandy's dangerous operations. Use BEFORE deploying a Supabase edge function, running git reset --hard or git push --force, applying a migration that DROPs/RENAMEs a column or table, any Stripe LIVE-key operation, or a direct write to donny_knowledge / a prod table outside the gated sync path. Also invoked as '/careful'. State the blast radius, require explicit confirmation, and run the operation's pre-flight checklist first."
---

# Careful (DragonCandy safety gate)

Some operations on this project can silently break prod and are hard to reverse. This skill is
the stop-and-confirm gate in front of them. It codifies hard-won incidents
([[project_concurrent_lovable_pr_collisions]], [[project_lovable_edge_function_deploy_gap]],
[[project_stale_payout_flag_fix]]) into one on-demand checklist. Trigger it BEFORE the op, not after.

## When this fires

Any of these dangerous ops:
- **Edge-function deploy** (`supabase functions deploy …` / MCP `deploy_edge_function`) — can overwrite a newer prod version.
- **`git reset --hard` / `git push --force`** — discards or overwrites history.
- **Migration that DROPs or RENAMEs** a column/table — forbidden by CLAUDE.md (add nullable columns instead).
- **Any Stripe LIVE-key op** — test mode only without explicit approval.
- **Direct write to `donny_knowledge` or another prod table** outside the gated sync/ingest path.

## The gate (do this every time)

1. **Name the action + blast radius** in one line: what runs, what it touches, who is affected if wrong.
2. **Run the op's pre-flight checklist** (below).
3. **Require explicit confirmation** — quote the exact command and wait for the user's go. Never proceed on assumption.
4. **Boot/verify after** — confirm the op did what was intended (bundle hash, `verify_jwt`, row count).

## Pre-flight checklists (progressive disclosure — read the one that applies)

**Edge-function deploy**
- Re-fetch `origin/main` and check for a collision (the founder's Lovable AI may have shipped the same file) — [[project_concurrent_lovable_pr_collisions]].
- Confirm `verify_jwt` per function via `list_edge_functions` (config.toml is not ground truth) — [[project_mcp_edge_function_bundling]].
- Bundle ALL transitive `_shared/*`; a failed bundle keeps the OLD version. Boot-check via a guard response after.

**git reset --hard / push --force**
- Confirm the branch (`git branch --show-current`) and that nothing unpushed/uncommitted will be lost.
- Prefer a safer alternative (new commit / `git revert`) if it achieves the same goal.

**DROP/RENAME migration**
- Stop — CLAUDE.md forbids it. Add a new nullable column instead; leave the old one.

**Stripe live-key op**
- Confirm the key is `sk_test_`/`pk_test_`. A live key requires explicit founder approval.

**Direct prod-table write**
- Prefer the gated path (edge fn / RPC / `aios-report-ingest`). A direct write must be a conscious, one-time, human-confirmed exception.

## Gotchas

- A "successful" edge-fn deploy that bundled wrong silently serves the OLD code — always boot-check.
- `config.toml` can disagree with the live `verify_jwt`; trust `list_edge_functions`.
- The shell cwd may be the MAIN checkout, so a "safe" git op can hit the wrong tree — verify the branch first ([[project_shell_cwd_is_main_checkout]]).
```

- [ ] **Step 3: Write `.claude/skills/careful/MEMORY.md` (Loop Memory Protocol seed)**

```markdown
# careful — memory

Two zones per `docs/wiki/concepts/loop-memory-protocol.md`: **Lessons** (read first, act on) and
an append-only **Run Log** (newest at top).

## Lessons
- Edge-fn deploy is the highest-risk op here: a prod-overwrite incident already happened (#207 over #206).
  Always re-fetch origin/main + check collisions before deploying.
- `config.toml` is not ground truth for `verify_jwt`; `list_edge_functions` is.

## Run Log
<!-- newest first; each run: Output pointer, Happened / Worked / Failed / Remember -->
```

- [ ] **Step 4: Verify the files are tracked and readable**

Run: `git check-ignore -v .claude/skills/careful/SKILL.md` → expect no output; `git status --porcelain .claude/skills/careful/` → expect both files as untracked/added.

- [ ] **Step 5: Commit**

```bash
git add .gitignore .claude/skills/careful/SKILL.md .claude/skills/careful/MEMORY.md
git commit -m "feat(skills): add careful on-demand safety gate for dangerous ops"
```

---

## Task 7: Build verification + Codex second review

**Files:** none (verification only).

- [ ] **Step 1: Frontend build sanity**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-3" && npm run build`
Expected: build succeeds. (No app code changed, so this is a regression sanity check only.)

- [ ] **Step 2: Confirm no product code / schema was touched**

Run: `git diff --name-only main...feat/claude-skills-audit`
Expected: only `docs/**` and `.claude/skills/careful/**` and `.gitignore`. If anything under `src/` or `supabase/` appears, stop — the audit must not change runtime.

- [ ] **Step 3: Codex second review**

Invoke the `codex-review` skill: `codex review --base main --title "skills audit + careful skill"`. Act on any real findings, re-run until clean, relay the verdict ([[feedback_codex_second_review]]). (Pure-markdown diff may be light; run it anyway per spec §9.)

- [ ] **Step 4: (no commit unless Codex fixes were needed)**

---

## Task 8: Finish-branch handoff

**Files:** none (handoff + knowledge sync).

- [ ] **Step 1: Close the quick-win's own finding**

The `careful` skill shipped in Task 6, but its `skills-audit` finding from Task 5 is still `open`. Mark just that one row `resolved` so the founder's triage queue reflects it was already built this cycle:

```sql
update aios_findings set status = 'resolved'
where source = 'skills-audit' and fingerprint = 'skills-audit:careful-safety-skill';
```

(Use the actual fingerprint slug you filed for the quick win; leave all other `skills-audit` findings `open` for triage.)

- [ ] **Step 2: Knowledge-sync note**

The wiki page is an `analyses/` page → RAG-eligible. On merge to main, the post-merge hook / `knowledge-sync` syncs it into `donny_knowledge` ([[project_knowledge_sync_automation]]). No manual RAG push needed pre-merge; note it in the PR body.

- [ ] **Step 3: Invoke `superpowers:finishing-a-development-branch`**

Present the merge/PR options. Open a PR from `feat/claude-skills-audit` → `main` with a body summarizing: the audit deliverables (wiki page + N findings), the shipped `careful` skill, and the deferred backlog (future sub-projects). Include the 🤖 Generated-with footer.

- [ ] **Step 4: Report to the user**

Summarize: coverage-matrix gaps found, backlog size + top 3 items, findings filed count, the quick win shipped, and the ranked list of future sub-projects.

---

## Notes for the executor

- **DRY/YAGNI:** the `careful` skill is markdown-only — do **not** add a bundled script (no deterministic step needs one yet). The audit builds nothing beyond the one quick win.
- **Do not** loosen RLS, deploy anything, or write product tables during the audit — the only prod write is the findings insert (Task 5), and the only repo changes are docs + the one skill.
- **Honesty:** if the audit finds the library is genuinely strong, say so — but a scorecard with zero `partial`/`fail` across 12 surfaces is not credible; re-examine before publishing.
