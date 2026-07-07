# Claude Skills Framework Audit — Design

> Spec date: 2026-07-07
> Status: proposed (brainstorm complete, spec-review pending)
> Source prompt: "Can we implement what's in this YouTube video for DragonCandy?" —
> [How Anthropic Employees ACTUALLY Use Claude Skills](https://www.youtube.com/watch?v=3UWxMPUko1k)

## 1. Context & motivation

The video is Anthropic's playbook for building Claude Code **Skills** (the `.claude/skills/`
folders). Its load-bearing ideas:

- A **9-category framework** — good skills fit *exactly one* category; straddling several is a
  smell and a gap-finder. Categories: **Library/API reference · Product verification · Data
  fetching/analysis · Business process · Code scaffolding · Code quality/review · CI-CD/deployment ·
  Runbooks · Infrastructure ops.**
- **Gotchas sections** are the highest-signal content — built from real failure points Claude hits.
- **Progressive disclosure** — `SKILL.md` is a table-of-contents/signpost; detail lives in linked
  files loaded on demand.
- **Descriptions written for AI discovery** — say *when to trigger* (concrete phrases), not a human
  summary.
- **Bundled executable scripts**, **memory across runs** (logs/JSON), **composition** (orchestrate,
  don't reconstruct boilerplate), **non-redundancy** (teach novel project-specific info, not what
  Claude already knows), and on-demand **safety skills** (`/careful`-style) for dangerous ops.

DragonCandy already has **9 first-party dev skills** (`autoresearch`, `codex-review`,
`knowledge-sync`, `refresh-main`, `verify-db-schema`, `verify-knowledge`, `verify-prod`, `wiki-ops`,
`worktree-cleanup`) with strong AI-discovery descriptions, `[[wikilinks]]` progressive disclosure,
and a Loop Memory Protocol (`MEMORY.md`). So the interesting question is not "adopt skills" — it's
**where does DragonCandy's actual skill library (and Donny) diverge from this playbook, and which
gaps are worth closing.**

"Implement it for DragonCandy" therefore = an **audit-first** application of the playbook to two
targets:
1. the dev/AIOS **`.claude/skills/` library**, and
2. **Donny** — the product agent, treated through the same lens (Founder-Playbook suite ≈
   business-process skills, Donny's tool set ≈ bundled scripts, Donny RAG ≈ progressive-disclosure
   reference).

This cycle produces **the map, not the buildings**: a durable audit + a ranked backlog + one
shipped quick win. Each remaining backlog item becomes its own brainstorm→spec→plan sub-project.

## 2. Goals / non-goals

**Goals**
- Score both targets against a fixed rubric derived from the video, honestly (no grade inflation).
- Produce a **9-category coverage matrix** for the dev library (covered / partial / missing).
- Produce a **value×effort-ranked backlog** of concrete skills/fixes to build.
- Persist the reasoning as a **wiki analysis page** (syncs into Donny's RAG) **and** file each
  backlog item as a **triageable `/internal/findings` finding**.
- Ship the **single highest-value quick win** in this same cycle (working hypothesis: a `/careful`
  on-demand safety skill — §9).

**Non-goals**
- Building every recommended skill (those are downstream sub-projects).
- Changing Donny's runtime, schema, RLS, edge functions, or the consumer app.
- Refactoring existing skills beyond the one quick win (the audit *recommends* improvements; it does
  not apply them, except the single quick win).

## 3. The rubric (per skill / per surface)

Each skill or Donny surface is scored on 7 criteria, each **pass / partial / fail** with a one-line
reason:

1. **Single category** — fits exactly one of the 9 categories.
2. **Gotchas** — has explicit, failure-point-driven guidance (DragonCandy uses "Notes" + `MEMORY.md`
   — does it actually surface the real failure modes, or just describe the happy path?).
3. **Progressive disclosure** — `SKILL.md` is a signpost; detail is in linked files/memory, not a
   monolith.
4. **AI-discovery description** — the `description:` frontmatter says *when to trigger*, with
   concrete trigger phrases.
5. **Bundled scripts** — ships executables for deterministic steps rather than prose the agent must
   re-derive each run.
6. **Memory across runs** — Loop Memory Protocol / a log so it improves run-over-run.
7. **Non-redundant** — teaches novel project-specific info, not defaults Claude already knows.

A skill scoring `partial`/`fail` on a criterion generates a **candidate improvement** (feeds the
backlog). Criterion 1 failing (straddles categories) is a decomposition signal.

## 4. Phase 1a — Dev-library audit

**Method (inline, no fan-out — 9 skills is small enough):**
1. Read all 9 `SKILL.md` files + their `MEMORY.md` where present.
2. Score each against the §3 rubric → a per-skill scorecard.
3. Build the **9-category coverage matrix**. Pre-read hypothesis (to be confirmed, not assumed):
   - **Library/API reference** — *likely MISSING.* No skill teaching the project's own gotchas for
     Supabase-JS v2, React Query conventions, edge-function `_shared` patterns, Outstand SDK, Stripe
     Connect. (CLAUDE.md documents conventions but nothing is a discoverable, gotcha-carrying skill.)
   - **Product verification** — *COVERED* (verify-prod, verify-db-schema, verify-knowledge).
   - **Data fetching/analysis** — *PARTIAL* (autoresearch, wiki-ops).
   - **Business process** — *PARTIAL* (knowledge-sync; the AIOS loop skills).
   - **Code scaffolding** — *likely MISSING.* No new-edge-function / new-React-Query-hook /
     new-page+route-guard scaffold, despite highly repetitive patterns.
   - **Code quality/review** — *COVERED* (codex-review).
   - **CI-CD/deployment** — *COVERED* (refresh-main, worktree-cleanup).
   - **Runbooks** — *likely MISSING/PARTIAL.* No symptom→diagnosis runbooks (e.g. "prod edge fn
     401/500", "Stripe webhook not delivering", "RAG stale"); the verify-* skills are adjacent.
   - **Infrastructure ops** — *PARTIAL.* Edge-fn deploy + migration guardrails live in memory, not a
     skill.
4. Note the cross-cutting gap: **no `/careful` on-demand safety skill**, despite a documented
   prod-overwrite incident ([[project_concurrent_lovable_pr_collisions]]) and many dangerous ops.

**Output:** the per-skill scorecard + coverage matrix (both go into the wiki page, §7).

## 5. Phase 1b — Donny audit (the product lens)

Score Donny's three skill-analogs against the same §3 rubric, adapted:
- **Founder Playbooks** (`aios_playbooks`; `/internal/playbooks`; `aios-playbook-run`) ≈
  **business-process skills.** Single-purpose? Do they carry gotchas/failure-handling? Is each
  playbook's `task`/`done-criteria` a good "AI-discovery" description so the runner picks the right
  one?
- **Donny's tool set** (donny-chat tools: `get_platform_stats`, `get_latest_briefing`,
  `propose_correction`, `workspace_read_file`, `get_reactivation_targets`, `get_recent_milestones`,
  …) ≈ **bundled scripts.** Are tool descriptions written for correct AI selection? Any that straddle
  purposes?
- **Donny RAG** (`donny_knowledge`) ≈ **progressive-disclosure reference.** Chunking/retrieval
  quality; is the wiki→RAG sync scope right (concepts/entities/analyses only)?

For each surface, criteria that structurally cannot apply are marked **N/A**, not `fail` — e.g.
"bundled scripts" and "memory across runs" against Donny RAG (a knowledge store, not an executable),
so a non-applicable criterion is never scored as a gap.

Plus one **strategic recommendation** (not a build in this cycle): should Donny's playbooks adopt the
video's explicit *skill-folder* format (folder = task + resources + gotchas + memory) rather than a
single `aios_playbooks` row? Recorded as a backlog item with a value/effort estimate, not decided
here.

**Output:** a Donny-surface scorecard + the strategic note (wiki page, §7).

## 6. The ranked backlog

From every `partial`/`fail` and every missing category, assemble a single **value×effort-ranked
backlog**. Each item: title, which target, which category/criterion it closes, a one-line value
rationale, a rough effort (S/M/L), and a build recommendation. This is the artifact that seeds future
sub-projects and is the body of the findings (§8).

Ranking heuristic: **value** = (frequency of the pain × blast-radius it prevents); **effort** = S/M/L.
Quick wins = high value × S effort. The top quick win is built in Phase 2 (§9).

## 7. Deliverable A — wiki analysis page

`docs/wiki/analyses/claude-skills-framework-audit.md`, following `docs/KNOWLEDGE_WIKI.md` conventions:
- Frontmatter: `title`, `type: analysis`, `created: 2026-07-07`, `updated`, `sources:
  [https://www.youtube.com/watch?v=3UWxMPUko1k,
  https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills]`,
  `tags: [skills, claude-code, aios, donny, audit]`.
- Body: §1 framework recap → §3 rubric → Phase 1a scorecard + coverage matrix → Phase 1b Donny
  scorecard + strategic note → the ranked backlog → `## See Also` with `[[wikilinks]]` to
  [[Loop Memory Protocol]], [[AIOS Founder Playbooks]], [[Self-Improving App]], and the relevant
  memory pages.
- Update `docs/wiki/index.md` (alphabetical) and append to `docs/wiki/log.md`
  (`## [2026-07-07] analysis | Claude Skills framework audit`).
- On merge to main, the existing post-merge hook / `knowledge-sync` syncs it into `donny_knowledge`
  (it's an `analyses/` page, in RAG scope) — so Donny can reason over its own audit.

## 8. Deliverable B — findings to /internal/findings

File each backlog item as a finding through the **`aios-report-ingest` choke point** (never a direct
table write when the secret is available), mirroring the Loop Scout contract:

- POST `https://zocahiffooqdybdhguqv.supabase.co/functions/v1/aios-report-ingest`,
  `Authorization: Bearer $AIOS_INGEST_SECRET`, body
  `{"type":"findings","payload":{"findings":[{severity,title,summary_md,evidence,source,fingerprint}]}}`.
- `source: "skills-audit"`; `title: "[skills-audit] <item name>"`; `fingerprint:
  "skills-audit:<kebab-slug>"` (prefix matches `source`/`title`; stable → dedupe/occurrence-bump
  if ever re-run).
- `severity` = build priority (`high` = top quick wins / high-value, `medium`, `low`).
- `summary_md`: markdown bullets (no pipe tables) — the value rationale + build recommendation.
- `evidence` (JSON): `{target, category, criteria_failed:[...], effort, related_skill?}`.
- **Fallback:** if `$AIOS_INGEST_SECRET` is not present in the local session, file via a direct
  `execute_sql` INSERT into `aios_findings` (Supabase MCP, service-role), replicating the identical
  column/fingerprint/severity contract. This is an explicit, one-time, human-run operation — noted so
  the choke-point invariant is consciously, not accidentally, bypassed. (Decision surfaced to the user
  in the plan.)

## 9. Phase 2 — ship the single highest-value quick win

Working hypothesis (strong prior): a **`careful` on-demand safety skill** — a DragonCandy-specific
`/careful`-style skill that gates the dangerous operations this project actually has, codifying
hard-won gotchas already scattered across memory into one on-demand safety gate. It triggers before:

- **edge-function deploy** (can silently overwrite prod — the #207/#206 incident;
  [[project_concurrent_lovable_pr_collisions]], [[project_lovable_edge_function_deploy_gap]]),
- **`git reset --hard` / `git push --force`**,
- **Supabase migrations that DROP/RENAME** a column/table (forbidden by CLAUDE.md),
- **any Stripe live-key** operation,
- **direct writes to `donny_knowledge` or other prod tables** outside the gated sync path.

Behavior: stop, state exactly what is about to happen + blast radius, require explicit confirmation,
and run the operation's **pre-flight checklist** (e.g. edge-fn deploy → re-fetch `origin/main` +
check collisions + confirm `verify_jwt` per fn + boot-check after). Single category (Runbooks /
safety), a real Gotchas section (the incidents), non-redundant (project-specific), progressive
disclosure (per-op checklists in the skill). Ships with `SKILL.md` + a `MEMORY.md` seed.

**Guard:** Phase 2 builds whatever the Phase-1 backlog ranks **#1 among S-effort items**. If that is
*not* the `careful` skill — if the audit surfaces a strictly higher value×low-effort item — **stop and
confirm with the user before building.** The prior is `careful`; the audit is the authority.

The quick win follows the project's build discipline: `npm run build`, self-review, `/simplify`, then
the **Codex second review** ([[feedback_codex_second_review]]) before the branch is finished. (A
docs-only audit page may skip Codex; the new skill is docs/markdown but ships as first-party
`.claude/skills/` — treat like a change, run Codex.)

## 10. Risks, gotchas, open decisions

- **`.gitignore` footgun** — the broad `skills/` ignore pattern silently drops new first-party
  `.claude/skills/` files; the `careful` skill's files need the narrow negation, not `git add -f`
  ([[project_loop_memory_protocol]]).
- **Shell cwd is the MAIN checkout** — all writes/commits use the explicit DC-3 worktree path; verify
  the branch, not bare `C:\GIT\...` ([[project_shell_cwd_is_main_checkout]]).
- **Honest grading** — the audit must be willing to score existing skills `partial`/`fail`; a
  scorecard that rates everything green is worthless. The reviewer loop checks for grade inflation.
- **Open decision (plan-time):** findings via `aios-report-ingest` vs direct `execute_sql` insert,
  depending on secret availability in the session (§8).
- **Open decision (audit-time):** whether the Donny skill-folder refactor is worth a sub-project or a
  wontfix — recorded, not decided here.

## 11. Success criteria

- Wiki page committed, in `index.md` + `log.md`, RAG-sync-eligible.
- Every existing skill + Donny surface has a rubric scorecard with honest pass/partial/fail.
- 9-category coverage matrix complete; every "missing/partial" has a backlog item.
- Backlog value×effort-ranked; each item filed as a `skills-audit` finding (or documented fallback).
- The #1 quick win is built, builds clean, passes Codex, and ships behind the standard branch-finish
  flow.
- Remaining backlog items are clearly enumerated as future brainstorm→spec→plan sub-projects.
