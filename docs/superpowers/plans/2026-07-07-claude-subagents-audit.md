# Claude Subagents Audit + Edge-Function Reviewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Claude Subagents audit (wiki analysis + `/internal/findings` backlog) and one project-scoped `edge-function-reviewer` subagent, on the same rails as the Skills audit (PR #216).

**Architecture:** Docs + knowledge only. One new markdown subagent definition (`.claude/agents/edge-function-reviewer.md`), one new wiki analysis page (wired into `index.md`, `log.md`, and the curated-sync `EXCLUDE` set), findings rows in `aios_findings`, one integration line in the `careful` skill, and a durable memory pointer. **No product code, schema, RLS, secret, or edge-function-code change.**

**Tech Stack:** Claude Code subagents (`.claude/agents/*.md` — YAML frontmatter + system-prompt body), the DragonCandy wiki (`docs/wiki/`), Supabase MCP (`execute_sql` against prod ref `zocahiffooqdybdhguqv`) for findings, git worktree `feat/claude-subagents-audit`.

**Spec:** `docs/superpowers/specs/2026-07-07-claude-subagents-audit-design.md`

**Note on TDD:** this change contains **no product code**, so there is no red-green-refactor. "Tests" here are verification steps: YAML frontmatter parses, a read-only dry-run dispatch returns a sensible verdict without mutating anything, and `npm run build` + `npm run typecheck` still pass (push-hook guard). Each task ends in a commit.

**Pinned DB contract (verified against prod 2026-07-07):**
`aios_findings` columns = `id, severity(NOT NULL), title(NOT NULL), summary_md(NOT NULL), evidence(jsonb NOT NULL default '{}'), source(NOT NULL), status(NOT NULL default 'open'), fingerprint(nullable), occurrences(default 1), last_seen_at, created_at, updated_at`. Skills-audit rows use `title='[skills-audit] <name>'`, `fingerprint='skills-audit:<slug>'`, `evidence` jsonb `{effort,target,category,related_skill?,criteria_failed?,see?}`. The fallback INSERT sets `severity, title, summary_md, evidence, source, fingerprint` (status/occurrences/timestamps default).

---

### Task 1: Author the `edge-function-reviewer` subagent

**Files:**
- Create: `.claude/agents/edge-function-reviewer.md`

- [ ] **Step 1: Create the subagent definition** with this EXACT content:

```markdown
---
name: edge-function-reviewer
description: >-
  Use BEFORE deploying any Supabase edge function (supabase functions deploy, or the MCP
  deploy_edge_function). Reviews the target function and its _shared/* dependencies in an
  isolated context and returns a structured PASS/ISSUES verdict against DragonCandy's documented
  edge-function deploy hazards: verify_jwt drift, _shared bundling (incl. the template-literal
  backtick break), auth-model mismatch, CORS preflight, and deploy ordering. Invoke after editing
  an edge function and before the deploy step. Read-only — it never edits, deploys, or migrates.
tools: Read, Grep, Glob, mcp__plugin_supabase_supabase__list_edge_functions, mcp__plugin_supabase_supabase__get_edge_function
model: sonnet
---

# Edge-Function Reviewer (DragonCandy)

You are a READ-ONLY reviewer. Your only job: given the name or path of a Supabase edge function
about to be deployed, read it and its `_shared/*` dependencies and return ONE structured verdict.
You never edit, deploy, or run migrations.

## Input
The dispatcher gives you an edge-function name or path (e.g. `donny-chat`,
`supabase/functions/capture-lead/index.ts`). Review only that function; do not fan out to
unrelated functions. If you cannot find the function folder, say so plainly — do not guess.

## How to review
1. Read `supabase/functions/<fn>/index.ts` and any sibling files in that folder.
2. Follow every `../_shared/*` import and read those files too — they bundle WITH the function.
3. Ground-truth `verify_jwt`: if the Supabase MCP read tools are available, call
   `list_edge_functions` and use the LIVE `verify_jwt` for this function (`config.toml` is NOT
   authoritative). If the MCP tools are not configured in your context, DEGRADE GRACEFULLY: read
   `supabase/config.toml`, note the declared value, and flag that the live value must be confirmed
   with `list_edge_functions` before deploy.

## Checklist (report every hit)
1. **verify_jwt** — per function. Browser-invoked functions (called from the frontend via
   `functions.invoke`/fetch) MUST run `verify_jwt=false` AND self-gate in-body (`auth.getUser()` +
   role check). A user-only function must NOT be exposed with a service-role key.
2. **Bundling** — every transitive `../_shared/*` import resolves and will bundle. Watch the
   Deno-bundle break: a backtick INSIDE a backtick-delimited template literal (e.g. inline code in
   a system-prompt string) terminates the string. `npm run build` will NOT catch it; only
   `functions deploy` does — so treat it as high severity.
3. **Auth model** — the credential matches the caller: service-role vs user-JWT vs Donny OAuth. A
   user-gated function called with the service-role key returns 401 (the anonymous-brief class).
   Cron/agent-invoked functions gate via `_shared/ingest-auth.ts`. Caller-profile reads on the
   internal surface use `.maybeSingle()` + synthesize (internal-only users have no `profiles` row),
   never `.single()` + throw.
4. **CORS** — OPTIONS preflight handled; the shared cors headers returned for browser callers.
5. **Deploy ordering** — a function reading/writing a NEW column requires the prod migration
   applied FIRST. New SECURITY DEFINER trigger functions must `revoke execute` from public/anon/
   authenticated.
6. **Query hygiene** — RLS-safe queries, explicit `.select()` field lists (no `select *`), error
   handling on every async Supabase call.

## Output — return EXACTLY this shape, nothing else
​```
VERDICT: PASS | ISSUES

verify_jwt: <live value if known, else "declared <x> in config.toml — confirm with list_edge_functions">
bundling: <ok | the specific risk>

Issues (omit the list if PASS):
- [high|med|low] <file:area> — <gotcha name>: <what's wrong> -> <fix>
​```
Keep all file-reading detail in your own context; return only the verdict block.

## Gotchas (your own judgment)
- A "successful" deploy that bundled wrong silently serves the OLD code — bundling issues are high severity.
- `config.toml` routinely disagrees with the live `verify_jwt`; never trust it as ground truth.
- Absence of a hit is not proof of safety — if you could not verify something (e.g. MCP unavailable),
  say so in the verdict rather than implying PASS.
```

> **Note for the executor:** in the real file, the fenced output block inside the body uses normal
> triple-backticks. They are shown above as `​``` ` (zero-width-space-prefixed) only to keep this
> plan's own code fence from closing early. Write real triple-backticks in the actual file, and make
> sure the file itself has no backtick-in-template-literal issue (it is plain markdown, so it does not).

- [ ] **Step 2: Verify the frontmatter parses.** Run from the worktree root:

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('.claude/agents/edge-function-reviewer.md','utf8');const m=s.match(/^---\r?\n([\s\S]*?)\r?\n---/);if(!m){console.error('NO FRONTMATTER');process.exit(1)};const fm=m[1];for(const k of ['name:','description:','tools:','model:']){if(!fm.includes(k)){console.error('MISSING '+k);process.exit(1)}};if(/\bWrite\b|\bEdit\b|deploy_edge_function|apply_migration/.test(fm.match(/tools:[\s\S]*?\nmodel:/)[0])){console.error('MUTATION TOOL IN SCOPE');process.exit(1)};console.log('OK: frontmatter valid, read-only tool scope')"
```
Expected: `OK: frontmatter valid, read-only tool scope`

- [ ] **Step 3: Confirm the file is not gitignored** (the `.gitignore` `skills/` footgun does not
  extend to `.claude/agents/`, but verify):

```bash
git check-ignore .claude/agents/edge-function-reviewer.md && echo "IGNORED — STOP" || echo "OK: trackable"
```
Expected: `OK: trackable`

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/edge-function-reviewer.md
git commit -m "feat(agents): edge-function-reviewer subagent (read-only pre-deploy review)"
```

---

### Task 2: Wire the reviewer into the `careful` skill

**Files:**
- Modify: `.claude/skills/careful/SKILL.md` (the "Edge-function deploy" pre-flight checklist)

> **Scope note (deviation from spec §6):** the spec mentioned integrating into
> `finishing-a-development-branch` too, but that is a **superpowers plugin** skill
> (`~/.claude/plugins/cache/…`), not a file in this repo — editing it is inappropriate (unversioned,
> overwritten on plugin update). The deterministic invocation backstop therefore lives in the
> `careful` skill (ours), which is already the human stop-and-confirm gate before an edge-fn deploy.
> This is the correct single home for the integration.

- [ ] **Step 1: Add a first bullet to the "Edge-function deploy" pre-flight checklist** in
  `.claude/skills/careful/SKILL.md`. The block currently begins:

```markdown
**Edge-function deploy**
- Re-fetch `origin/main` and check for a collision (the founder's Lovable AI may have shipped the same file) — [[project_concurrent_lovable_pr_collisions]].
```

Insert this as the new FIRST bullet under `**Edge-function deploy**`:

```markdown
- **Dispatch the `edge-function-reviewer` subagent** on the target function first — it reads the fn + its `_shared/*` deps in an isolated context and returns a PASS/ISSUES verdict against these hazards. Resolve every ISSUE before deploying.
```

- [ ] **Step 2: Verify the edit landed and is the first checklist bullet**

```bash
grep -n "edge-function-reviewer" .claude/skills/careful/SKILL.md
```
Expected: one line, positioned directly under the `**Edge-function deploy**` header.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/careful/SKILL.md
git commit -m "docs(careful): dispatch edge-function-reviewer before an edge-fn deploy"
```

---

### Task 3: Write the wiki analysis page

**Files:**
- Create: `docs/wiki/analyses/claude-subagents-audit.md`

Mirror the structure of `docs/wiki/analyses/claude-skills-framework-audit.md` (already in the repo —
read it as the template). Required sections and content:

- [ ] **Step 1: Frontmatter**

```markdown
---
title: Claude Subagents Audit
type: analysis
created: 2026-07-07
updated: 2026-07-07
sources: [https://youtu.be/e18sdZLwP7o]
tags: [subagents, claude-code, aios, audit, edge-functions]
---
```

- [ ] **Step 2: Body — write these sections:**

  1. **Intro** — one paragraph: applies the video's subagents playbook audit-first; the factual
     anchor is **zero custom `.claude/agents/`** (verified worktree + main + global); skills run
     inline, subagents run in their own context and return one result; this page is the map, ending
     in a value×effort backlog; only the #1 quick win (`edge-function-reviewer`) ships this cycle.
  2. **The framework (recap)** — the video's load-bearing ideas: own-context/own-tools/own-prompt,
     returns one result, auto-invoke via description, cheap specialists + one smart orchestrator,
     when-you-need-one (context-pollution / independent perspective / parallelism).
  3. **The 7-dimension rubric** — reproduce spec §3 verbatim (Single responsibility · Auto-invocation
     description · Tool scoping · Model selection · Context-isolation payoff · Structured single
     return · Non-redundant). State the honesty gate: name candidates that only partially qualify.
  4. **Current-usage assessment** — spec §4: built-ins (`Explore`/`Plan`/`general-purpose`/
     `code-simplifier`), plugin reviewers (`spec-`/`plan-document-reviewer`, subagent-driven-dev),
     fan-out skills (`roast`, `storm-research`), zero custom agents. Verdict: strong generic/plugin
     coverage; the gap is no recurring DC engineering-review need encoded as a reusable, auto-invoked,
     context-isolated subagent — so edge-fn/RLS reviews run inline.
  5. **Ranked custom-subagent backlog** — the candidates from spec §5, each scored against the rubric
     and the subagent-vs-skill test, with effort S/M/L. Mark `edge-function-reviewer` **⭐ #1 —
     shipped this cycle**. Honestly flag `rls-migration-reviewer` (partial — overlaps
     `verify-db-schema`), `dragoncandy-explorer` (partial — may not clear the isolation bar over
     generic `Explore`), `verify-prod` runner (partial — real isolation payoff but browser-heavy).
  6. **The shipped subagent** — short note on `.claude/agents/edge-function-reviewer.md`: project
     scope (encodes DC-specific gotchas, so not global), read-only tool scope, PASS/ISSUES return,
     `careful` integration as the deterministic backstop, graceful MCP degradation, and that
     auto-invocation is best-effort/not-test-verifiable.
  7. **See Also** — `[[Claude Skills Framework Audit]]` (sibling audit), `[[Loop Memory Protocol]]`,
     the `careful` safety skill, and the video source link.

- [ ] **Step 3: Commit**

```bash
git add docs/wiki/analyses/claude-subagents-audit.md
git commit -m "docs(wiki): Claude Subagents audit analysis page"
```

---

### Task 4: Wire the wiki page into index, log, and curated-sync EXCLUDE

**Files:**
- Modify: `docs/wiki/index.md` (Analyses section)
- Modify: `docs/wiki/log.md` (prepend entry)
- Modify: `supabase/scripts/sync-wiki-to-donny.mjs` (EXCLUDE set)

- [ ] **Step 1: Add to `index.md`** — insert `[[Claude Subagents Audit]]` into the Analyses list,
  alphabetically adjacent to `[[Claude Skills Framework Audit]]` (match the existing line format for
  Analyses entries — read the surrounding lines first).

- [ ] **Step 2: Prepend to `log.md`** a new top entry:

```markdown
## [2026-07-07] analysis | Claude Subagents audit
Applied the "How to Build Claude Subagents Better Than 99% of People" video's subagents playbook to DragonCandy audit-first. Factual anchor: zero custom `.claude/agents/`. Produced `analyses/claude-subagents-audit.md` (7-dimension rubric + current-usage assessment + ranked custom-subagent backlog), filed `subagents-audit` findings at `/internal/findings`, and shipped the #1 quick win: the read-only `edge-function-reviewer` subagent wired into the `careful` deploy checklist.
```

- [ ] **Step 3: Add to the curated-sync `EXCLUDE` set** in `supabase/scripts/sync-wiki-to-donny.mjs`.
  The set currently ends with `"content-engine-data-audit", "claude-skills-framework-audit",`.
  Change that line to also include the new slug:

```javascript
  "content-engine-data-audit", "claude-skills-framework-audit", "claude-subagents-audit",
```

- [ ] **Step 4: Verify all three edits**

```bash
grep -n "Claude Subagents Audit" docs/wiki/index.md
grep -n "Claude Subagents audit" docs/wiki/log.md
grep -n "claude-subagents-audit" supabase/scripts/sync-wiki-to-donny.mjs
```
Expected: one match each.

- [ ] **Step 5: Commit**

```bash
git add docs/wiki/index.md docs/wiki/log.md supabase/scripts/sync-wiki-to-donny.mjs
git commit -m "docs(wiki): index + log + curated-sync exclude for subagents audit"
```

---

### Task 5: File the findings

**Files:** none (writes to prod `aios_findings` via Supabase MCP `execute_sql`, project ref `zocahiffooqdybdhguqv`).

> **Delivery path:** the spec prefers the `aios-report-ingest` choke point when `AIOS_INGEST_SECRET`
> is present in session env. It was **absent** during the Skills audit, so that cycle used the
> documented fallback — a direct service-role `execute_sql` INSERT. Use the same fallback here
> (reliable, and byte-matched to the pinned contract above). If `AIOS_INGEST_SECRET` is available,
> the choke point is acceptable instead — same rows.

- [ ] **Step 1: Insert the 5 findings** via one `execute_sql` call (dollar-quoted bodies).
  `edge-function-reviewer` is `status='resolved'` because it shipped this cycle; the rest are `'open'`.

```sql
insert into public.aios_findings (source, severity, status, fingerprint, title, summary_md, evidence) values
('subagents-audit','medium','open','subagents-audit:zero-custom-agents',
 '[subagents-audit] Zero custom subagents (structural gap)',
 $m$DragonCandy authors **zero** custom `.claude/agents/` (verified: worktree, main checkout, global). All subagent work runs through generic built-ins (Explore/Plan/general-purpose/code-simplifier) + superpowers plugin reviewers. No recurring DC engineering-review need is encoded as a reusable, auto-invoked, context-isolated subagent, so heavy reviews (edge-fn, RLS) run inline and pollute main context. This cycle ships the first one (edge-function-reviewer); this finding tracks the broader pattern.$m$,
 $e${"effort":"S","target":"dev","category":"subagents-structural","see":"docs/wiki/analyses/claude-subagents-audit.md"}$e$::jsonb),
('subagents-audit','high','resolved','subagents-audit:edge-function-reviewer',
 '[subagents-audit] edge-function-reviewer subagent (shipped)',
 $m$**Shipped this cycle.** Read-only project-scoped subagent that reviews an edge fn + its _shared deps in isolation and returns a PASS/ISSUES verdict against our documented deploy hazards (verify_jwt drift, _shared bundling incl. the template-literal backtick break, auth-model mismatch, CORS, deploy ordering). Wired into the `careful` deploy checklist as the deterministic backstop. Maps to our #1 recurring incident class.$m$,
 $e${"effort":"S","target":"dev","category":"code-quality-review","file":".claude/agents/edge-function-reviewer.md"}$e$::jsonb),
('subagents-audit','medium','open','subagents-audit:rls-migration-reviewer',
 '[subagents-audit] rls-migration-reviewer subagent',
 $m$Proposed read-only subagent to review a migration before apply: definer-revoke-from-anon/authenticated (not just public), get_advisors-after-DDL, add-nullable-not-drop, FK-to-auth.users-for-internal-users. Security-critical. **Partial** on the subagent-vs-skill test — overlaps the existing `verify-db-schema` skill; a future cycle must decide whether it becomes a subagent or the skill is extended.$m$,
 $e${"effort":"M","target":"dev","category":"code-quality-review","related_skill":"verify-db-schema","subagent_test":"partial"}$e$::jsonb),
('subagents-audit','low','open','subagents-audit:dragoncandy-explorer',
 '[subagents-audit] dragoncandy-explorer subagent',
 $m$Proposed Explore variant seeded with DC conventions (dc-* tokens, src/features/ layout, RLS assumptions, worktree/stale-main gotcha). Convenience-tier. **Partial** — may not clear the context-isolation-payoff bar over the generic Explore agent; document before building.$m$,
 $e${"effort":"M","target":"dev","category":"data-fetching","subagent_test":"partial"}$e$::jsonb),
('subagents-audit','low','open','subagents-audit:verify-prod-runner',
 '[subagents-audit] verify-prod runner subagent',
 $m$Proposed subagent to isolate the voluminous browser/console-check output of the existing verify-prod skill. **Partial** — real isolation payoff, but the browser tooling makes it heavier than a v1 warrants; filed as a next-loop.$m$,
 $e${"effort":"M","target":"dev","category":"product-verification","related_skill":"verify-prod","subagent_test":"partial"}$e$::jsonb);
```

- [ ] **Step 2: Verify the rows landed**

```sql
select fingerprint, severity, status from public.aios_findings
where source='subagents-audit' order by severity, fingerprint;
```
Expected: 5 rows (1 high/resolved, 2 medium/open, 2 low/open).

---

### Task 6: Durable memory pointer

**Files (outside git — the user's memory dir, not committed):**
- Create: `C:\Users\dwill\.claude\projects\C--GIT-dragoncandy-v3-d783432b\memory\project_claude_subagents_audit.md`
- Modify: `C:\Users\dwill\.claude\projects\C--GIT-dragoncandy-v3-d783432b\memory\MEMORY.md` (one-line index entry)

- [ ] **Step 1: Write the memory file** with frontmatter (`type: project`) capturing: the audit
  (branch `feat/claude-subagents-audit`, PR #), the zero-custom-agents anchor, the shipped
  `edge-function-reviewer` (what it checks + read-only + careful integration), the deferred backlog
  (rls-migration-reviewer / dragoncandy-explorer / verify-prod-runner, all partial on the subagent
  test), findings `source='subagents-audit'`, and the curated-sync EXCLUDE add. Link
  `[[project_claude_skills_audit]]` and `[[feedback_skills_global_by_default]]` (why this subagent is
  project-scoped, not global).

- [ ] **Step 2: Add a one-line pointer to `MEMORY.md`** near the skills-audit entry.

---

### Task 7: Verification

- [ ] **Step 1: Build + typecheck** (push-hook guard; no product code changed, so both must stay green):

```bash
npm run build && npm run typecheck
```
Expected: build succeeds, typecheck clean.

- [ ] **Step 2: Read-only dry-run dispatch.** Dispatch the `edge-function-reviewer` subagent (via the
  Agent tool, `subagent_type` matching the new agent, or general-purpose seeded with the agent body if
  the custom type is not yet registered) on ONE recently-changed edge function — e.g. `capture-lead`
  or `generate-anonymous-brief`. Confirm it returns the structured `VERDICT:` block and that nothing
  was mutated (its tool scope makes writes impossible; confirm the return shape and sanity of findings).

- [ ] **Step 3: Confirm no stray working-tree changes** from the dry-run:

```bash
git status --porcelain
```
Expected: empty (clean).

---

### Task 8: Finish the branch

- [ ] **Step 1:** Invoke **superpowers:finishing-a-development-branch**. Tests: `npm run build` +
  `npm run typecheck` are the gate (no unit tests changed; vitest is unaffected — trust
  "Tests N passed" per the pre-existing-failures note in memory).
- [ ] **Step 2: Codex second review** (mandatory) — run `codex review --base main --title "Claude subagents audit + edge-function-reviewer"` from the worktree. Fix any real findings, re-run until clean, relay the verdict.
- [ ] **Step 3:** Push + open PR (user chose the finish path last cycle; ask/confirm). After merge, run `refresh-main` on the main checkout (the post-merge hook auto-syncs Donny RAG; the audit page is excluded from the *curated* sync only).

---

## File Structure Summary

| File | Responsibility | Task |
|------|----------------|------|
| `.claude/agents/edge-function-reviewer.md` | The shipped read-only pre-deploy reviewer subagent | 1 |
| `.claude/skills/careful/SKILL.md` | Deterministic invocation backstop (one bullet) | 2 |
| `docs/wiki/analyses/claude-subagents-audit.md` | The durable audit deliverable | 3 |
| `docs/wiki/index.md` | Catalog entry | 4 |
| `docs/wiki/log.md` | Operation record | 4 |
| `supabase/scripts/sync-wiki-to-donny.mjs` | Keep the internal audit page out of user-facing Donny RAG | 4 |
| `aios_findings` (prod) | Ranked backlog at `/internal/findings` | 5 |
| memory `project_claude_subagents_audit.md` + `MEMORY.md` | Durable pointer | 6 |
