# Claude Subagents Audit + Edge-Function Reviewer — Design

> Status: approved design (brainstorming). Next: writing-plans.
> Author: Claude (with Dame). Date: 2026-07-07.
> Source idea: YouTube "How to Build Claude Subagents Better Than 99% of People"
> (AI Automation Society), https://youtu.be/e18sdZLwP7o — applied audit-first to DragonCandy.

## 1. Summary

Apply the video's Claude Code **subagents** playbook to DragonCandy the same proven way we
applied the Claude Skills playbook (PR #216): **audit-first**, produce a durable **wiki analysis
page** + a ranked **`/internal/findings`** backlog, and **ship the single highest-value quick win
this cycle** — a project-scoped **`edge-function-reviewer`** subagent.

The audit's factual anchor: DragonCandy authors **zero custom subagents** (`.claude/agents/` does
not exist in the worktree, the main checkout, or the global scope). All subagent work today runs
through generic built-ins (`Explore`, `Plan`, `general-purpose`, `code-simplifier`) and the
superpowers plugin's reviewers (`spec-document-reviewer`, `plan-document-reviewer`,
subagent-driven-development). We have 12 hand-authored **skills**, but skills run **inline in the
main context**, whereas a subagent runs in its **own** context and returns **one clean result** —
so our heaviest recurring reviews (edge-function pre-deploy, RLS/migration) currently pollute the
main context instead of being delegated.

## 2. Motivation & Context

The video's core teachings: a subagent is a separate Claude instance with its own ~200K context,
own system prompt, own tools/permissions; it returns **one result** and keeps intermediate work
out of the main context. Build custom agents that **auto-invoke** via a well-written description;
delegate to **cheap specialist agents orchestrated by one smart model** (saves money, better
results); and know **when you need one vs. when you don't** (context-pollution, independent
perspective, or parallelism are the triggers).

DragonCandy's single most recurring incident class is **Supabase edge-function deploys** — the
memory layer is full of them: `verify_jwt` per-function drift (config.toml is not ground truth),
transitive `_shared/*` bundling failures that silently keep the OLD version, service-role-vs-user
auth mismatches (the anonymous-brief 401), the template-literal-backtick Deno-bundle break, the
`ingest-auth` shared-gate, `.single()` vs `.maybeSingle()` for internal-only users. That review is
today done inline (via the `careful` checklist or ad hoc), which both pollutes context and is easy
to skip. It is the textbook case for a context-isolated, auto-invoked reviewer subagent.

This is the same **category** of work as the Skills audit (applying a Claude Code capability
framework to our repo), so it reuses those rails deliberately: the same rubric shape, the same
wiki-analysis + findings deliverables, the same curated-RAG-exclusion discipline, and the same
finish gates (Codex second review, refresh-main).

## 3. The Video's Teachings → 7-Dimension Rubric

The audit scores each subagent (existing or proposed) **pass / partial / fail / N-A** against:

1. **Single responsibility** — one clear job, not a kitchen sink.
2. **Auto-invocation description** — the `description:` frontmatter states *when* to delegate
   (trigger conditions), so the orchestrator picks it automatically. Highest-signal field
   (parallels skills' AI-discovery description).
3. **Tool scoping (least privilege)** — grant only the tools the job needs; a read-only reviewer
   gets no Write/Edit/deploy/migration tools.
4. **Model selection** — a cheap specialist for narrow work, reserving the smart orchestrator
   model. ("Cheap specialists, one smart model.")
5. **Context-isolation payoff** — it earns being a subagent only if it isolates voluminous output,
   provides an independent perspective, or enables parallelism. If none apply, it should be a
   skill or inline, not a subagent.
6. **Structured single-result return** — returns one clean, structured verdict/summary, not a
   transcript of its intermediate work.
7. **Non-redundant** — does not duplicate an existing skill/agent; where a skill and a subagent
   overlap, the choice is justified by which context model you want.

## 4. Audit Target 1 — How We Use Subagents Today

Assessed and written up honestly in the wiki page:

- **Built-in agent types:** `Explore` (read-only fan-out search), `Plan` (architecture),
  `general-purpose`, `code-simplifier`. Used generically; none seeded with DragonCandy conventions.
- **Superpowers plugin reviewers:** `spec-document-reviewer`, `plan-document-reviewer`, and
  subagent-driven-development (fresh subagent per plan task). These are strong and already part of
  every spec/plan cycle — the audit credits them.
- **Skills that fan out to subagents:** `roast` (5-persona council), `storm-research` (5-lens
  briefing). These use parallel subagents well.
- **Custom `.claude/agents/`:** none.

**Verdict:** the built-in + plugin coverage is genuinely good for *research, planning, and
document review*. The real gap is that **no recurring DragonCandy engineering-review need has ever
been encoded as a reusable, auto-invoked, context-isolated subagent** — so those reviews (edge-fn,
RLS) run inline. The gap is "missing custom agents for our specific hazards," not "weak use of the
generics."

## 5. Audit Target 2 — Candidate Custom Subagents (Ranked Backlog)

Each scored against §3's rubric and the "subagent vs. skill" test; ranked value × effort. Filed as
findings and listed in the wiki page. Initial set (final ranking produced during execution):

- **`edge-function-reviewer`** (Tier 1, build now) — reviews an edge fn + its `_shared` deps in
  isolation; returns a PASS/ISSUES verdict. Passes the subagent test (context isolation +
  independent perspective). Maps to our #1 incident class. Non-redundant.
- **`rls-migration-reviewer`** (Tier 2) — reviews a migration for the definer-revoke-from-anon
  gotcha, `get_advisors`-after-DDL, add-nullable-not-drop, FK-to-`auth.users`-for-internal-users.
  Security-critical; **partial** overlap with the existing `verify-db-schema` skill (the audit must
  resolve whether it becomes a subagent or stays a skill).
- **`dragoncandy-explorer`** (Tier 3) — an `Explore` variant seeded with our conventions (`dc-*`
  tokens, `src/features/` layout, RLS assumptions, worktree/stale-main gotcha). Convenience-tier;
  **partial** — may not clear the isolation-payoff bar over the generic `Explore`.
- **`verify-prod` runner** (Tier 3) — isolates the voluminous browser/console-check output of the
  existing `verify-prod` skill. **Partial** — real isolation payoff, but the browser tooling makes
  it heavier than v1 warrants; documented as a next-loop.

The honesty gate requires explicitly naming which candidates **fail or partially fail** the
subagent test rather than promoting all of them.

## 6. The Shipped Subagent — `.claude/agents/edge-function-reviewer.md`

**Scope decision:** **project-scoped** (`.claude/agents/`), not global. Unlike generic skills
(which we default to global), this subagent encodes DragonCandy-specific edge-function gotchas, so
it belongs to this repo. (Records the reasoning inline, referencing the skills-global-by-default
rule as the deliberate contrast.)

**Frontmatter:**
- `name: edge-function-reviewer`
- `description:` — auto-invocation trigger, e.g. *"Use BEFORE deploying any Supabase edge function
  (supabase functions deploy / MCP deploy_edge_function). Reviews the target function and its
  `_shared/*` dependencies in an isolated context and returns a structured PASS/ISSUES verdict
  against DragonCandy's edge-function deploy hazards. Invoke after code changes to an edge function
  and before the deploy step."* Written so the orchestrator (and the `careful` skill) delegate to
  it automatically.
- `tools:` — **read-only least privilege:** `Read, Grep, Glob` plus the Supabase MCP **read** tools
  it needs for ground-truth (`list_edge_functions`, `get_edge_function`). **Explicitly excluded:**
  `Write`, `Edit`, `apply_migration`, `deploy_edge_function`, and any mutation/deploy tool — a
  reviewer must never change or ship code.
- `model: sonnet` — a capable specialist tier (edge-fn review needs real judgment over auth/bundle
  subtleties, but not the orchestrator model). One-line tunable; the spec notes it can be raised if
  the reviewer misses subtle bugs in practice.

**Body (system prompt) = the review checklist**, derived verbatim from our documented incidents,
grouped so it reads as progressive disclosure:
1. **`verify_jwt` correctness** — per-function; `config.toml` is NOT ground truth (`list_edge_functions`
   is); browser-invoked functions need `verify_jwt=false` + in-body self-gating (auth.getUser +
   role check).
2. **Bundling** — every transitive `_shared/*` import resolves and will bundle; full-path file
   naming for MCP deploys; **no backticks inside a backtick-delimited template literal** (breaks the
   Deno bundle — `npm run build` won't catch it; only `functions deploy` does).
3. **Auth model** — the function's credential matches its caller: service-role vs user-JWT vs Donny
   OAuth (the anonymous-brief 401 class: a user-gated fn called with the service-role key 401s); the
   `_shared/ingest-auth.ts` gate for cron/agent-invoked fns; `.single()` → `.maybeSingle()` +
   synthesize for internal-only users (no `profiles` row).
4. **CORS** — OPTIONS preflight handled; correct headers for browser-invoked functions.
5. **Deploy ordering** — a fn reading/writing a NEW column requires the prod migration applied
   FIRST; revoke `EXECUTE` on new SECURITY DEFINER trigger fns.
6. **Query hygiene** — RLS-safe queries, explicit `.select()` field lists (no `select *`), error
   handling on every async Supabase call.

**Return contract:** one structured block to the main context —
`verdict: PASS | ISSUES`, then for each issue `{ severity, location (file:area), gotcha (short
name/ref), fix }`, and a one-line bundling/verify_jwt confirmation. All file-reading noise stays in
the subagent's context.

**Integration (light touch):** add one line to the `careful` skill's edge-fn deploy checklist and
to `finishing-a-development-branch`'s pre-deploy step: *"dispatch the `edge-function-reviewer`
subagent before deploying."* `careful` remains the human stop-and-confirm gate; the subagent is the
automated deep review that precedes it. No behavioral change to any edge function or the deploy
scripts themselves.

## 7. Deliverables

1. `docs/wiki/analyses/claude-subagents-audit.md` — `type: analysis`; sources = the video URL (+
   Anthropic subagents docs if cited). Sections: framework recap, 7-dimension rubric, current-usage
   assessment (§4), ranked custom-subagent backlog (§5), the shipped-agent note, See Also
   (cross-links to `[[Claude Skills Framework Audit]]` and the `careful` skill).
   - **Added to the curated-sync `EXCLUDE` set** in `supabase/scripts/sync-wiki-to-donny.mjs`
     (matching the `claude-skills-framework-audit` precedent) — it carries internal ops/security
     detail and must stay out of the user-facing Donny RAG. Internal Donny still retrieves it via
     the non-curated path.
   - `docs/wiki/index.md` — add `[[Claude Subagents Audit]]` alphabetically under Analyses.
   - `docs/wiki/log.md` — prepend a `## [2026-07-07] analysis | Claude Subagents audit` entry.
2. **Findings** at `/internal/findings` (see §8).
3. `.claude/agents/edge-function-reviewer.md` — the shipped subagent (§6).
4. Durable memory pointer (`project_claude_subagents_audit.md`) + a one-line `MEMORY.md` index
   entry.

## 8. Findings Contract

Match the Skills-audit contract exactly:
- `source = 'subagents-audit'`
- `fingerprint = 'subagents-audit:<slug>'` (application-level upsert key)
- `severity ∈ {high, medium, low}` — **never `critical`** (reserved for real bugs).
- `title`, `summary_md`, `evidence` (jsonb: rubric scores, subagent-vs-skill verdict), `status`
  defaults `'open'`.
- **Delivery:** through the `aios-report-ingest` choke point if `AIOS_INGEST_SECRET` is present in
  session env; otherwise the documented fallback — a direct service-role `execute_sql` INSERT into
  `aios_findings` replicating the exact column contract (dollar-quoted bodies to avoid escaping).
- One finding per proposed custom subagent (from §5) + one summarizing the "zero custom agents"
  structural gap. Each is a future brainstorm→spec→plan sub-project; filing them is not committing
  to build them.

## 9. Non-Redundancy / Honesty Gate

- No grade inflation: credit the strong generic/plugin coverage; do not invent weaknesses.
- Every proposed subagent is explicitly run through the **"subagent vs. skill vs. inline"** test;
  the write-up names which candidates only **partially** qualify (`rls-migration-reviewer` overlaps
  `verify-db-schema`; `dragoncandy-explorer` and the `verify-prod` runner may not clear the
  isolation-payoff bar) and why we still build `edge-function-reviewer` first.
- The shipped subagent itself must pass all 7 rubric dimensions; if it doesn't, fix the definition
  before shipping.

## 10. Testing & Verification

The subagent is a markdown definition, so "tests" are:
- **Frontmatter validity** — parses; `name`/`description`/`tools`/`model` present and well-formed;
  tool list contains no mutation/deploy tool.
- **Dry-run dispatch** — invoke `edge-function-reviewer` on one recently-changed real edge function
  and confirm it returns a sensible structured verdict **without mutating anything** (read-only tool
  scope makes mutation impossible, but confirm behavior).
- **`npm run build` + `npm run typecheck`** still pass (no product code changes; guards the push
  hook). No unit tests — there is no product code in this change.

## 11. Workflow & Out of Scope

**Workflow:** this spec → spec-review loop → writing-plans → plan-review loop → inline execution →
finishing-a-development-branch → **Codex second review** (mandatory) → PR → merge → refresh-main
(auto RAG sync via the post-merge hook; the audit page is excluded from the *curated* sync).

**In scope:** the audit (wiki + findings) and building exactly one subagent
(`edge-function-reviewer`) + its light `careful`/finishing-branch integration lines.

**Out of scope (deferred to their own cycles, filed as findings):** building
`rls-migration-reviewer`, `dragoncandy-explorer`, the `verify-prod` runner, or any other backlog
subagent; any change to edge-function code, deploy scripts, schema, RLS, or secrets; converting
existing skills to subagents. No product/user-facing change of any kind.
