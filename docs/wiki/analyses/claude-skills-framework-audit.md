---
title: Claude Skills Framework Audit
type: analysis
created: 2026-07-07
updated: 2026-07-07
sources: [https://www.youtube.com/watch?v=3UWxMPUko1k, https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills]
tags: [skills, claude-code, aios, donny, audit]
---
# Claude Skills Framework Audit

Applies Anthropic's public playbook for building Claude Code **Skills** — the
[9-category framework talk](https://www.youtube.com/watch?v=3UWxMPUko1k) and the
[lessons-from-building-Claude-Code post](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills)
— to DragonCandy's own two "skill" surfaces: the dev/AIOS `.claude/skills/` library and **Donny**
(the product agent). Audit-first: this page is the **map**, ending in a value×effort-ranked backlog.
Each backlog item becomes its own brainstorm→spec→plan sub-project; only the single top quick win
ships in the same cycle as this audit.

## The framework (recap)

The talk's load-bearing ideas:

- **9 categories** — a good skill fits *exactly one*; straddling several is a smell and a gap-finder.
  Library/API reference · Product verification · Data fetching/analysis · Business process ·
  Code scaffolding · Code quality/review · CI-CD/deployment · Runbooks · Infrastructure ops.
- **Gotchas are the highest-signal content** — built from real failure points, not the happy path.
- **Progressive disclosure** — `SKILL.md` is a table-of-contents/signpost; detail lives in linked
  files loaded on demand.
- **Descriptions written for AI discovery** — say *when to trigger* (concrete phrases), not a human
  summary.
- **Bundled scripts**, **memory across runs**, **composition** (orchestrate, don't rebuild
  boilerplate), **non-redundancy** (teach novel project-specific info, not what Claude already knows),
  and on-demand **safety skills** (`/careful`-style) for dangerous ops.

## The rubric

Every skill / Donny surface is scored **pass / partial / fail** on 7 criteria (one-line reason each);
`N/A` where a criterion structurally cannot apply (never scored as `fail`):

1. **Single category** — fits exactly one of the 9.
2. **Gotchas** — explicit, failure-point-driven (not happy-path).
3. **Progressive disclosure** — `SKILL.md` is a signpost; detail in linked files/memory.
4. **AI-discovery description** — says *when to trigger*, with concrete phrases.
5. **Bundled scripts** — executables for deterministic steps vs prose to re-derive.
6. **Memory across runs** — Loop Memory Protocol / a log.
7. **Non-redundant** — novel project-specific info.

Honesty gate: an all-green scorecard across 12 surfaces is not credible. Every `partial`/`fail`
generates a backlog item; criterion-1 failure (straddling categories) is a decomposition signal.

## Dev-library scorecard

Nine first-party skills scored. Criteria order = **Category · Gotchas · Progressive-disclosure ·
Description · Scripts · Memory · Non-redundant**; `✓` pass · `~` partial · `✗` fail · `–` N/A.

- **`autoresearch`** — *Data fetching/analysis (+ orchestration).*
  Cat `~` (research loop **and** a `sync-donny` RAG-push that straddles into infra/business-process) ·
  Gotchas `✓` · ProgDisc `✓` · Desc `✓` · Scripts `✓` · Memory `✓` · Non-redundant `✓`.
  **Improve:** the `sync-donny` mode overlaps [[knowledge-sync]]; narrowing autoresearch to
  research-only would make it fit one category cleanly.
- **`codex-review`** — *Code quality/review.*
  Cat `✓` · Gotchas `✓` · ProgDisc `✓` · Desc `✓` · Scripts `–` (one CLI call) ·
  **Memory `✗`** (no `MEMORY.md`/log) · Non-redundant `✓`.
  **Improve:** add a `MEMORY.md` capturing recurring Codex finding-classes in this codebase so
  repeat findings are pre-empted — the clearest single miss in the library.
- **`knowledge-sync`** — *Business process.* All `✓`. Model skill; no gap.
- **`refresh-main`** — *CI-CD/deployment.*
  Cat `✓` · Gotchas `✓` · ProgDisc `✓` · Desc `✓` · Scripts `✓` (inline) · Memory `~` (low value
  for a mechanical git ff) · Non-redundant `✓`. No meaningful gap.
- **`verify-db-schema`** — *Product verification.*
  Cat `✓` · Gotchas `✓` (exemplary — the whole skill is failure-driven) · ProgDisc `✓` · Desc `✓` ·
  Scripts `–` (Supabase MCP tools) · Memory `~` (linked project memories substitute; no co-located
  log) · Non-redundant `✓`. Minor.
- **`verify-knowledge`** — *Product verification (validator).*
  Cat `✓` · Gotchas `✓` · ProgDisc `✓` · Desc `✓` · Scripts `–` (deterministic commands inline;
  emits a machine-readable verdict) · Memory `✓` (advisory-only, correctly) · Non-redundant `✓`.
  Model validator.
- **`verify-prod`** — *Product verification.*
  Cat `✓` · Gotchas `✓` · ProgDisc `✓` · Desc `✓` · Scripts `✓` · Memory `~` · Non-redundant `✓`.
  Minor.
- **`wiki-ops`** — *Business process / knowledge management.*
  Cat `~` (bundles **three** ops — ingest + query + lint) · Gotchas `✓` (the "Rules" block) ·
  ProgDisc `✓` · Desc `✓` · Scripts `–` (LLM synthesis, not scriptable) · Memory `✓` ·
  Non-redundant `✓`. **Improve:** a dedicated `## Gotchas` header; the 3-op bundling is a coherent
  domain and acceptable.
- **`worktree-cleanup`** — *Infrastructure ops.*
  Cat `✓` · Gotchas `✓` · ProgDisc `✓` · Desc `✓` · Scripts `~` (the merged/clean/live-session
  gates are scriptable and error-prone by hand) · Memory `~` · Non-redundant `✓`.
  **Improve:** a bundled safety-check helper for the four gates.

**Overall:** the library is genuinely strong — descriptions, progressive disclosure, and
failure-driven gotchas are consistently good (no skill is a happy-path stub). The two real weakness
patterns are **(1) no run-memory on the review/verify skills** — mostly defensible for validators,
but a clear miss on `codex-review` — and **(2) whole *missing categories*** (below), not weak
individual skills. No skill scored all-green *and* was actually flawless, so this is not grade
inflation: the perfect scores (`knowledge-sync`, `verify-knowledge`) are earned.

## 9-category coverage matrix

Where the library sits against the framework's 9 categories (this is the gap-finder):

| Category | Status | Covered by / the gap |
|---|---|---|
| Library/API reference | **Missing** | No skill for DragonCandy's own gotchas around Supabase-JS v2, React Query conventions, edge-fn `_shared/` patterns (cors, model-routing, ingest-auth), Outstand SDK, or Stripe Connect. `CLAUDE.md` documents conventions, but nothing is a *discoverable, gotcha-carrying* skill. |
| Product verification | **Covered** | `verify-prod`, `verify-db-schema`, `verify-knowledge` — strong. |
| Data fetching/analysis | **Partial** | `autoresearch` (web+repo), `wiki-ops query`. Gap: no skill to pull **live app telemetry** (`content_performance`, `analytics_events`, Supabase logs/advisors) into an analysis. |
| Business process | **Covered** | `knowledge-sync` (+ the AIOS playbook rails). |
| Code scaffolding | **Missing** | No new-edge-function / new-React-Query-hook / new-page+route-guard scaffold, despite 80 edge fns, 206 hooks, and repeated guard patterns. High repetition = high value. |
| Code quality/review | **Covered** | `codex-review` (+ built-in `/code-review`, `/simplify`). |
| CI-CD/deployment | **Partial** | `refresh-main`, `worktree-cleanup`. Gap: the edge-fn **deploy step itself** (MCP vs CLI, `verify_jwt` per fn, bundle-all-`_shared`, boot-check) lives in project memory, not a skill. |
| Runbooks | **Missing** | No symptom→diagnosis runbooks: prod edge-fn 401/500, Stripe webhook not delivering, RAG stale, opaque "internal error". The `verify-*` skills are *gates*, not incident runbooks. |
| Infrastructure ops | **Partial** | `worktree-cleanup`. Gap: edge-fn deploy, migration guardrails, secret/key rotation (the `AIOS_INGEST_SECRET` saga), cron management — all in memory, not skills. |

**Cross-cutting gap:** no on-demand **safety** skill (`/careful`) despite a documented
prod-overwrite incident ([[project_concurrent_lovable_pr_collisions]]) and many dangerous ops
(edge-fn deploy, `git reset --hard`, DROP/RENAME migrations, Stripe live keys).

## Donny audit

Donny is not a Claude-Code skill library, but it has three surfaces that map onto the framework.
Scored against the same rubric (`N/A` where a criterion structurally can't apply to a runtime agent).

**Surface 1 — Founder Playbooks** (`aios_playbooks`; `/internal/playbooks`; `aios-playbook-run`) ≈
*business-process skills.* Live inventory: **10 playbooks, all active** — 3 seed
(`weekly-kpi-variance`, `scaling-capacity-check`, `ai-cost-vs-cap`), `kill-switch-watch`, and the
6-domain Dezzy suite (`dezzy-outreach`, `-content-calendar`, `-website-updates`, `-weekly-brief`,
`-seo-articles`, `-milestone-celebrations`). **All 10 declare `allowed_proposals = []`** — every
playbook is currently *report-only*; the `propose_correction` → `/internal/corrections` write path
exists but no playbook uses it yet (the "a human approves" invariant holds trivially today).
- Cat `✓` (each is one task; the Dezzy split is well-decomposed) · Gotchas `~` (uneven — the Dezzy
  playbooks encode real disciplines like non-fabrication placeholders and false-recency warnings;
  the 3 terse seeds barely do) · ProgDisc `~` (a playbook is a **flat DB row** — task+preferences+
  done-criteria — with no signpost-to-detail) · Desc `–` (playbooks are selected by **pinned slug**,
  not description-matching, so AI-discovery descriptions don't yet apply; the deferred
  `list_playbooks`/`run_playbook` conversational tools would change that) · Scripts `✓` (they compose
  the runner's read tools) · **Memory `~`** (`aios_playbook_runs` logs every run, but playbooks do
  **not read prior runs** to self-improve — Loop Memory Protocol Phase 2 / `aios_loop_memory` is
  deferred) · Non-redundant `✓`.

**Surface 2 — Donny's tool set** (**38 tools** in `donny-chat`: 26 consumer + 12 internal/AIOS) ≈
*bundled scripts.*
- Cat `✓` (each tool single-purpose) · Gotchas `✓` (descriptions encode **failure-prevention
  boundaries** — `prepare_payment` "does NOT execute the payment", `compose_email_link` "you NEVER
  send email") · ProgDisc `–` (atomic function defs) · Desc `✓` (strong AI-selection discipline —
  most say "Use when…"; the `search_internal_knowledge` vs `get_internal_doc` pair is **explicitly
  disambiguated** in-description to prevent a wrong-tool straddle) · Scripts `✓` (the tools *are* the
  executables) · Memory `–` (atomic; `donny_tool_executions` logs calls) · Non-redundant `✓`.
  **Strongest surface** — this is what the video would call a well-built tool layer.

**Surface 3 — Donny RAG** (`donny_knowledge`, loaded by `sync-wiki-to-donny.mjs`) ≈
*progressive-disclosure reference.*
- Cat `✓` (single purpose: retrieval) · Gotchas `–` · **ProgDisc `~`** (each wiki page is embedded
  as **one whole-page vector** — retrieval returns whole pages, not sections; fine for short pages,
  coarse for a 2,000-word analysis; section-level chunking would sharpen retrieval) · Desc `–` (an
  optional `SYNC_CURATE` exclude-set keeps internal/eng pages out of the end-user store — a good
  curation control) · Scripts `–` · Memory `–` · Non-redundant `✓`.

**Strategic note (recorded, not decided here):** should playbooks adopt the video's explicit
*skill-folder* format (a folder = task + resources + **co-located gotchas** + **per-playbook
memory**) instead of a flat `aios_playbooks` row? It would close the Gotchas/ProgDisc/Memory gaps
above in one move and make the deferred conversational playbook-selection cleaner — but it's an
**L-effort** architecture change (schema + `aios-playbook-run` + `/internal/playbooks` UI), so it
belongs in the backlog as a sub-project, not this cycle. The cheaper interim win is the already-
designed **Loop Memory Protocol Phase 2** (`aios_loop_memory`), which gives playbooks run-memory
(criterion 6) without the full refactor.

## Ranked backlog

<!-- Task 4 -->

## See Also

<!-- Task 4 -->
