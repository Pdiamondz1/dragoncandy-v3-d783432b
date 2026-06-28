# Dezzy AI — Weekly Operating Brief (Domain 5, report-only) — Design Spec

- **Date:** 2026-06-27
- **Status:** Draft (for review)
- **Branch/worktree:** `DC-Dezzy-AI-2` (branch `feat/aios-dezzy-weekly-brief`)
- **Source idea:** `docs/wiki/analyses/dragoncandy-dame-ai-the-business-growth-agent-system-spec.md` §Domain 5 (PR #190)
- **Predecessors (same suite):** `dezzy-outreach` (Domain 3, PR #193); `dezzy-content-calendar` +
  `dezzy-website-updates` (Domains 1+2, PR #194). Concept: `docs/wiki/concepts/dezzy-content-playbooks.md`,
  `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.

## 1. Context & problem

Dezzy AI is realized as a **branded suite of AIOS Founder Playbooks**, not a new runtime (the keystone
decision). Domains 1–3 ship as report-only playbooks. Domain 5 — the **Weekly Operating Brief** — is the
spec's "most important output": the Monday document that tells the founder *what happened, what it means,
and exactly what to do this week*. It is the **capstone** that only now makes sense, because the detail
playbooks it orchestrates (outreach / content / website) exist.

**Two confirmed forks (this design):**
1. **A new admin-only `dezzy-weekly-brief` Founder Playbook**, distinct from the existing stakeholder
   weekly brief (`weekly-brief-agent` → `/internal/briefings` → `aios_briefings`), which stays exactly
   as-is. Rationale: (a) `/internal/playbooks` runs are admin-only by construction, and (b) the Dezzy
   brief is an **action console** carrying genuinely founder-internal material it grounds in tools —
   candid "what didn't work," North Star / GTM context from `get_internal_doc`, and direct "do this
   now" directives — which must NOT reach the stakeholder-publishable surface. (It does **not** contain
   creator PII or draft text: per fork 2 it *points to* the detail playbooks that hold those — there is
   no tool to read their runs, so it cannot and must not reproduce them.) The Dezzy brief **reconciles**
   to the stakeholder brief's KPIs via `get_latest_briefing` rather than recomputing them.
2. **Orchestrate, not embed.** The brief synthesizes what it can from existing tools and **points the
   founder to** each detail playbook ("run `dezzy-outreach` for this week's drafts"); it does NOT embed
   their run outputs. Rationale: embedding would need a new `get_latest_playbook_run` read tool (edit +
   redeploy `aios-playbook-run`), depends on run-ordering (stale if the others weren't run first), and
   risks token bloat. Orchestrate ships as a **pure seed** and has no ordering dependency. (YAGNI; compose
   is a documented v2.)

**Invariant preserved:** report-only — the brief reports and directs; a human acts. Nothing is sent,
published, or auto-applied.

## 2. Verified constraint (why this is a pure seed)

`aios-playbook-run` already exposes the six aggregate read tools (`get_latest_briefing`,
`get_platform_stats`, `get_internal_doc`, `get_revenue_stats`, `get_cost_stats`,
`get_platform_weight_trend`), the mandatory `done_check`, and report-only mode (`allowed_proposals: []`)
(`index.ts:44-84,116-236`). The `/internal/playbooks` UI renders any playbook by slug. The brief grounds
entirely in `get_latest_briefing` + `get_platform_stats` + `get_internal_doc`, so it needs **only a seed
row** — no new tool, no edit to `aios-playbook-run`, no new table, no UI.

There is **no tool to read `aios_playbook_runs`** today — which is exactly why "orchestrate/point-to" (not
"embed") is the v1: the brief does not need to read the other playbooks' runs.

## 3. Goals / non-goals

**Goals (v1):** a report-only `dezzy-weekly-brief` Founder Playbook at
`/internal/playbooks/dezzy-weekly-brief` that, on demand, produces the founder's Monday action console
(six sections, §4.1), grounded and reconciled to the stakeholder brief, directing the founder to the
detail playbooks.

**Non-goals (deferred):**
- Embedding the other playbooks' run outputs (compose mode + a `get_latest_playbook_run` tool) → v2.
- The Events & Press section (Domain 4 isn't built; the runner has no web access) → the brief explicitly
  notes "not yet tracked," never invents it.
- Auto-scheduling the brief (a `/schedule` routine over `playbook-runner-agent`) → founder-run for v1.
- Any change to the existing `weekly-brief-agent`, `/internal/briefings`, or `aios_briefings`.

## 4. Design

One idempotent row in `aios_playbooks` (`allowed_proposals: '[]'`, report-only). Voice "Dezzy"; engine
identity stays "Donny".

### 4.1 `dezzy-weekly-brief` — "Dezzy — Weekly Operating Brief"

**task_md** — Produce the founder's Monday operating brief (the front page of the weekly review). Ground
in `get_latest_briefing` (this week's stakeholder brief: platform numbers, KPI statuses, wins/risks —
reconcile to these, don't recompute differently), `get_platform_stats` (live signups, active campaigns,
DragonShare boosts/posts, creator:restaurant ratio), and `get_internal_doc` (PROJECT_CONTEXT North Star,
GTM phase, active workstreams for context). Produce these sections:
1. **One-line summary** — the single most important growth thing this week and what it means.
2. **Platform numbers** — signups, active campaigns, DragonShare boosts, creator:restaurant ratio (and
   social following only if a tool returns it). Give an on-track / at-risk / off-track status **where the
   stakeholder brief's KPIs or the North Star give a basis; otherwise mark "no KPI basis"** — a status is
   itself a claim, so don't invent one.
3. **What worked / what didn't** — 1–3 each, grounded in the numbers, no spin.
4. **This week's top 3 actions** — specific + executable + why + estimated time ("send the 10 outreach
   drafts," not "do outreach").
5. **Your Dezzy queue (run these for detail)** — a directed checklist pointing to: `dezzy-outreach`
   (creator + restaurant reactivation drafts), `dezzy-content-calendar` (the 5-post Mon–Fri calendar),
   `dezzy-website-updates` (if a user-facing feature shipped per the brief). Point-to, not embed.
6. **System health** — anything worth flagging that's **derivable from the aggregate stats/brief** (e.g.,
   0 signups this week, active campaigns flat or declining, boosts dropped to 0). Don't cite per-item
   detail (e.g. a specific stalled campaign) the aggregate tools don't return.

Events & Press (Domain 4) is not built — note "not yet tracked," do not invent it. If a number isn't
available from a tool, say so rather than inventing.

**preferences_md** — Write as Dezzy, DragonCandy's growth agent (VOICE only; engine identity stays
"Donny"). Decisive, judgment-call tone — a "what to do this week" document, not a data dump. Reconcile
every number to `get_latest_briefing` / `get_platform_stats`; never invent a number a tool didn't return.
The top 3 actions must be specific and executable. Terse, labeled sections — no pipe tables. This brief is
admin-only, so it may reference internal specifics.

**done_criteria_md** — All six sections present (one-line summary; platform numbers, each with a status or
an explicit "no KPI basis"; what worked/didn't; 3 specific executable actions; the Dezzy-queue checklist
naming all three detail playbooks; system health). Numbers reconcile to `get_latest_briefing` /
`get_platform_stats`. TRACEABILITY: every
number and claim traces to a tool result or is explicitly marked unavailable/not-yet-tracked; nothing is
fabricated. Ends with the required JSON self-assessment.

**allowed_proposals** — `[]`.

### 4.2 Mechanism (v1 = pull)

The founder opens `/internal/playbooks/dezzy-weekly-brief`, clicks **Run now** during the Monday review,
reads the action console, executes the top 3 actions, then runs the detail playbooks the brief directs them
to. Reuses the run UI, `aios_playbook_runs` storage, the in-flight guard, the done-check chip — no new UI.

## 5. Scope of change

- **Create:** `supabase/migrations/20260627180000_aios_dezzy_weekly_brief_seed.sql` — one idempotent
  `INSERT ... ON CONFLICT (slug) DO NOTHING;`, mirroring the prior Dezzy seeds.
- **Create:** this spec.
- **Knowledge-sync:** extend `docs/wiki/concepts/dezzy-content-playbooks.md` (or
  `dezzy-agent-playbook-suite.md`) to note the brief; `index.md`/`log.md`; a PROJECT_CONTEXT bullet.
- **None of:** new table, new RPC/tool, edit to `aios-playbook-run` or any edge function, new secret,
  new UI, change to `weekly-brief-agent` / `/internal/briefings` / `aios_briefings`, schedule, or
  `donny-chat` change.

## 6. Verification

1. `npm run build` from the worktree cwd (no source change → expected green).
2. Apply the seed to prod (`zocahiffooqdybdhguqv`) via Supabase MCP `apply_migration`; confirm via
   `execute_sql`: `select slug, title, allowed_proposals, status from aios_playbooks where slug =
   'dezzy-weekly-brief';` (active, report-only).
3. As admin, open `/internal/playbooks/dezzy-weekly-brief` → **Run now**.
4. Eyeball the run: all six sections present, numbers reconcile to the latest stakeholder brief +
   `get_platform_stats`, top 3 actions are specific, the Dezzy-queue checklist names all three detail
   playbooks, Events/Press marked not-yet-tracked, no fabrication; done-check chip reads **Done**.
5. `codex-review` (`codex review --base main`); fix, re-run until clean; relay verdict.
6. `knowledge-sync`; after merge, sync Donny's RAG.

## 7. Risks

- **Stakeholder vs admin confusion** — mitigated: this is a `/internal/playbooks` run (admin-only),
  separate from the publishable `aios_briefings`; it cannot leak to stakeholders.
- **Number drift vs the stakeholder brief** — mitigated by instructing reconciliation to
  `get_latest_briefing` (single source for KPI statuses).
- **Stale stakeholder brief** — `get_latest_briefing` returns the most recent row; the daily
  `weekly-brief-agent` keeps it fresh. If absent, the brief says so (the tool returns a "no briefings"
  message) rather than inventing numbers.
- **Output token ceiling** — report-only runs at `max_tokens: 8192`; six terse sections fit comfortably.
- **No-fabrication** — enforced by `preferences_md` + the traceability `done_criteria` + the founder
  review gate.

## 8. Open questions for review

1. Six sections as specified, or drop "system health" into "what didn't work"? (Plan: keep all six —
   matches the spec's structure and the founder's documented Monday review.)
2. Should the Dezzy-queue checklist (§4.1 #5) hard-code the three current detail-playbook slugs, or
   describe them generically? (Plan: name them — they're stable and the founder needs the exact slugs.)
3. Seed via migration vs the `/internal/playbooks` UI? (Plan: migration, reproducible/in-repo.)
