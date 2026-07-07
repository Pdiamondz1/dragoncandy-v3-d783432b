---
title: Claude Subagents Audit
type: analysis
created: 2026-07-07
updated: 2026-07-07
sources: [https://youtu.be/e18sdZLwP7o]
tags: [subagents, claude-code, aios, audit, edge-functions]
---
# Claude Subagents Audit

Applies the video's Claude Code **subagents** playbook to DragonCandy the same way we applied the
Skills framework (see [[Claude Skills Framework Audit]]): **audit-first**, ending in a
value×effort-ranked backlog and exactly one shipped quick win this cycle. The factual anchor for
this audit is stark: DragonCandy authors **zero custom `.claude/agents/`** — verified in the active
worktree, the main checkout (`C:\GIT\dragoncandy-v3-d783432b`), and the global `~/.claude/agents/`
scope. The distinction that makes this matter: **skills run inline in the main context**, while a
subagent runs in its **own** context with its own system prompt and tools and returns **one clean
result** back to the orchestrator. All heavy recurring reviews (edge-function pre-deploy,
RLS/migration) currently run inline — they accumulate context, are easy to skip, and provide no
independent perspective. This page maps where we stand, reproduces the 7-dimension rubric, assesses
current usage, and ranks the proposed custom-subagent backlog. Only the top quick win —
**`edge-function-reviewer`** — ships in this cycle.

## The framework (recap)

The video's load-bearing ideas:

- **Own context, own tools, own system prompt** — a subagent is a separate Claude instance with its
  own ~200K context window; intermediate reasoning stays there and never pollutes the orchestrator.
- **Returns one result** — not a transcript of its work. The orchestrator receives a structured
  verdict or summary and continues; it never sees the subagent's file-reading noise.
- **Auto-invocation via description** — the `description:` frontmatter field is the highest-signal
  field: written well, it causes the orchestrator to delegate automatically when the right conditions
  are met. This parallels skills' AI-discovery descriptions.
- **Cheap specialists + one smart orchestrator** — narrow subagents can run on smaller/cheaper models
  while the orchestrator (Sonnet / the session model) handles synthesis. Saves cost, often improves
  focus.
- **When you need one vs. when you don't** — three legitimate triggers: **(1) context pollution**
  (voluminous intermediate output you don't want in the main context), **(2) independent perspective**
  (the orchestrator wrote the code; a fresh model with no priors reviews it), and **(3) parallelism**
  (fan-out to simultaneous specialists). If none apply, a skill or inline call is simpler.

## The 7-dimension rubric

Each existing or proposed subagent is scored **pass / partial / fail / N-A** on:

1. **Single responsibility** — one clear job, not a kitchen sink.
2. **Auto-invocation description** — the `description:` states *when* to delegate with concrete
   trigger conditions, so the orchestrator picks it automatically.
3. **Tool scoping (least privilege)** — granted only the tools the job actually needs; a read-only
   reviewer must carry no Write / Edit / deploy / migration tool.
4. **Model selection** — a cheap specialist for narrow work, reserving the smart orchestrator model
   where judgment requires it.
5. **Context-isolation payoff** — earns being a subagent by isolating voluminous output, providing
   an independent perspective, or enabling parallelism. If none apply, it should be a skill or inline.
6. **Structured single-result return** — returns one clean, structured verdict/summary, not a
   running log of steps.
7. **Non-redundant** — does not duplicate an existing skill or agent; where overlap exists, the
   choice (subagent vs. skill vs. inline) is explicitly justified.

Honesty gate: any candidate that only partially clears the subagent-vs-skill test is named as such
— not promoted to a full proposal on enthusiasm alone. The point of the audit is the map, not the
count.

## Current-usage assessment

### What runs today

**Built-in agent types** — `Explore` (read-only fan-out search), `Plan` (architecture), the
`general-purpose` catch-all, and `code-simplifier`. These are used generically across sessions;
none are seeded with DragonCandy conventions (our `dc-*` tokens, `src/features/` layout, edge-fn
`_shared/` contracts, the stale-main worktree gotcha). They do the job but apply no project-specific
judgment.

**Superpowers plugin reviewers** — `spec-document-reviewer`, `plan-document-reviewer`, and the
`subagent-driven-development` pattern (a fresh subagent per plan task). These are strong and already
embedded in every spec/plan cycle — the audit credits them. They are effectively subagents, properly
scoped and independently perspectived.

**Skills that fan out to subagents** — `roast` (5-persona idea council, 5 parallel subagents) and
`storm-research` (5-lens STORM briefing). Both use parallelism correctly; both are among the
stronger patterns in the library.

**Custom `.claude/agents/`** — none, until this cycle.

### Verdict

The built-in and plugin coverage is genuinely good for *research, planning, and document review* —
no need to rebuild what already works well. The real gap is narrower: **no recurring DragonCandy
engineering-review need has ever been encoded as a reusable, auto-invoked, context-isolated
subagent**. Edge-function pre-deploy review and RLS/migration review both run inline today — inside
the same context as the code that wrote them, with no independent perspective, and with the
voluminous intermediate output (file reads, grep results, logic traces) accumulating in the main
session. That is the textbook case for a context-isolated reviewer. The gap is "missing custom
agents for our specific hazards," not "weak use of the generics."

## Ranked custom-subagent backlog

Candidates sorted by value×effort (effort **S/M/L**), each scored against the 7-dimension rubric
and explicitly run through the subagent-vs-skill test. Partially-qualifying candidates are named as
such.

### Tier 1 — build this cycle

**`edge-function-reviewer`** ⭐ **#1 — shipped this cycle.**

DragonCandy's most documented incident class is a Supabase edge-function deploy that keeps the old
version silently, or ships with the wrong `verify_jwt`, or breaks at bundle time from a
backtick-in-a-backtick template literal — none of which `npm run build` catches (it builds the
frontend only). This review is today done inline via the `careful` checklist or ad hoc, which
pollutes context and is easy to skip.

Rubric: Single-responsibility `✓` (reviews one edge fn + its `_shared` deps, returns a verdict) ·
Auto-invocation `✓` (description triggers on any edge-fn deploy step) · Tool scoping `✓` (Read /
Grep / Glob only; explicitly no Write/Edit/deploy tool) · Model selection `✓` (Sonnet — capable
specialist; not the full orchestrator, but judgment is needed for auth/bundle subtleties) ·
Context-isolation payoff `✓` (voluminous file-reading noise stays in the subagent context +
independent perspective on code the main session wrote) · Single-result return `✓` (PASS/ISSUES
verdict block) · Non-redundant `✓` (the `careful` skill gates the deploy step; this subagent is the
automated deep review that feeds it — deliberate complementarity, not replacement).

Subagent-vs-skill test: **passes clearly** — context isolation and independent perspective both
apply, and the isolation payoff is non-trivial (a thorough edge-fn review touches many files).
Value **high** (prevents the documented prod-overwrite/silent-version-keep/401 class). Effort **S**.

### Tier 2 — next cycles

**`rls-migration-reviewer`** — reviews a migration for the definer-revoke-from-anon gotcha,
`get_advisors` after DDL, add-nullable-not-drop, FK-to-`auth.users` for internal-only users.
Security-critical.

Rubric: Single-responsibility `✓` · Auto-invocation `✓` · Tool scoping `✓` · Model `✓` ·
Context-isolation `✓` · Single-result `✓` · Non-redundant **`~` partial** — the existing
`verify-db-schema` skill covers meaningful overlap; the backlog item is to resolve whether this
becomes a fully distinct subagent or its most acute gotchas are absorbed into the skill. The
subagent-vs-skill test only partly clears: the isolation payoff is real but the redundancy check
fails until the boundary is drawn. Value **high**, effort **M**. Deferred.

### Tier 3 — convenience / future loops

**`dragoncandy-explorer`** — an `Explore` variant seeded with DC conventions: `dc-*` tokens,
`src/features/` layout, RLS assumptions, the worktree/stale-main gotcha. Would speed up codebase
searches.

Rubric: Non-redundant **`~` partial** · Context-isolation **`~` partial** — the payoff here is
*speed and convention-awareness*, not isolation of voluminous output or independent perspective.
Generic `Explore` with a well-framed prompt achieves nearly the same result. The subagent-vs-skill
test does not clearly pass: a seeded description in a skill or a well-named memory file may serve
equally well with less overhead. Value **low-med**, effort **S-M**. Deferred; document the
conventions in a Library/API-reference skill first (see [[Claude Skills Framework Audit]] Tier-2
backlog) and re-evaluate.

**`verify-prod` runner** — wraps the existing `verify-prod` skill as a subagent to isolate the
voluminous browser/console-check output from the main context.

Rubric: Context-isolation **`~` partial** — the isolation payoff is real (the skill produces
substantial output), but the `verify-prod` skill is already browser-heavy and the browser MCP tools
behave differently across contexts; the complexity cost of making this a subagent in v1 likely
exceeds the isolation benefit. Single-result `~` (a pass/fail summary is achievable but the
skill's value is partly the full output for the operator to read). Value **med**, effort **L** (the
browser tooling weight). Deferred; the skill form is correct for now — revisit when the browser
automation path is more stable.

## The shipped subagent

`.claude/agents/edge-function-reviewer.md` is **project-scoped** (checked into this repo's
`.claude/agents/`, not the global `~/.claude/agents/`). The scope choice is deliberate: unlike
generic skills (which we default to global), this subagent encodes DragonCandy-specific edge-function
gotchas — `verify_jwt` drift between `config.toml` and `list_edge_functions`, the `ingest-auth`
shared-gate pattern, `.single()` vs `.maybeSingle()` for internal-only users — that would misfire
or be meaningless in an unrelated project.

**Tool scope — read-only least privilege.** The subagent carries `Read`, `Grep`, `Glob`, and the
Supabase MCP read tools (`list_edge_functions`, `get_edge_function`) needed for ground-truth lookup.
`Write`, `Edit`, `apply_migration`, `deploy_edge_function`, and all mutation/deploy tools are
explicitly excluded. A reviewer must not be able to change or ship the code it reviews. The MCP
reads are ground-truth enhancers — the body instructs the subagent to **degrade gracefully** to
file-based review (reading `supabase/functions/<fn>/` + `_shared/` + `config.toml` with a caveat
that `config.toml` is not authoritative for live `verify_jwt`) when the MCP server is not available,
so a missing MCP config never renders the subagent unusable.

**Return contract.** One structured block: `verdict: PASS | ISSUES`, then for each issue
`{ severity, location (file:area), gotcha (short name), fix }`, and a one-line
bundling/verify_jwt confirmation. Intermediate file-reading noise stays in the subagent's context.

**`careful` integration.** The `careful` safety skill's edge-fn deploy checklist carries one added
line: dispatch `edge-function-reviewer` before the deploy step. `careful` remains the human
stop-and-confirm gate; the subagent is the automated deep review that precedes it. The
`finishing-a-development-branch` skill similarly notes the subagent in its pre-deploy step. This
combination is the **deterministic backstop** — since auto-invocation via `description:` is
best-effort and not test-verifiable (a dry-run passing does not prove the orchestrator will
auto-delegate in every session), the explicit integration lines in `careful` and the finishing
checklist ensure the reviewer is actually invoked before high-stakes deploys.

**Model.** Sonnet — capable specialist tier. Edge-fn review requires real judgment over auth and
bundle subtleties, but the orchestrator model is not needed. One-line tunable in frontmatter if
practice shows the reviewer misses subtle bugs.

## See Also

- [[Claude Skills Framework Audit]] — sibling audit applying the Claude Code Skills framework to
  the same two surfaces (dev library + Donny). Same rails, same rubric shape, same
  wiki-analysis + findings deliverables. Read alongside for the full capability-framework picture.
- [[Loop Memory Protocol]] — the run-memory pattern; relevant to the deferred playbook-memory work
  and to future subagents that should self-improve across invocations.
- The `careful` on-demand safety skill (`.claude/skills/careful/`) — the human confirmation gate
  that pairs with `edge-function-reviewer` as the deterministic deploy backstop.
- Video source: [How to Build Claude Subagents Better Than 99% of People](https://youtu.be/e18sdZLwP7o)
  (AI Automation Society) — the framework this audit applies.
