# AIOS Kill-switch Playbook + Loop-callable Playbooks — Design

- **Date:** 2026-06-20
- **Status:** Draft (brainstormed)
- **Branch:** `feat/aios-killswitch-playbook-loop`
- **Related:** `docs/superpowers/specs/2026-06-19-aios-founder-playbooks-design.md`,
  `docs/superpowers/specs/2026-06-19-aios-loop-automation-design.md`,
  `docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md`

## Problem & motivation

A founder prompt (IMG_8325) framed the value of saved skill files: *"document the
task, my preferences, and what counts as 'done' so any loop can call it."* That is
almost exactly the shipped AIOS **Founder Playbook** model (`task_md` /
`preferences_md` / `done_criteria_md` / `allowed_proposals`). A workspace audit of
the three "repeatable task" systems (dev skills, AIOS cloud loops, Founder Playbooks)
found two high-leverage, low-risk gaps:

1. **The kill-switches are written but not executable.** `PROJECT_CONTEXT.md §3`
   defines four pause-the-business triggers with exact thresholds and careful scoping
   notes — but nothing evaluates them on a repeatable basis.
2. **Playbooks are on-demand only.** The prompt's literal ask — *"so any loop can call
   it"* — is a documented deferral in the playbooks spec: there is no way to run a
   playbook unattended on a schedule.

This design closes both as one small slice.

## Goals

- **A1:** A report-only **kill-switch guardrail-watch** playbook that evaluates all
  four `§3` kill-switches, honoring their scoping notes, and reports each as
  green / watch / breach / not-yet-measurable.
- **A4:** Make any playbook **loop-callable** — runnable unattended on a cron — with
  breaches surfaced where founders already look (`/internal/findings`).

## Non-goals (explicitly deferred — YAGNI)

- Donny conversational `list_playbooks` / `run_playbook` tools (would touch the
  ~100KB `donny-chat` core endpoint). Interactive, not a "loop."
- A service-bearer auth mode on the `aios-playbook-run` edge function (would touch the
  `auth.uid()`-gated stats-RPC security model — violates "never modify auth without
  confirming" and ledger-first discipline).
- Writing scheduled runs into `aios_playbook_runs` history (a new write path).
- Auto-creating the cron job (the founder runs `/schedule`, same as every existing
  AIOS routine).
- Per-run parameters; Donny-authored playbooks.

## Invariants preserved

- **Donny never writes directly — a human approves.** A1 is report-only; A4's only
  output is a finding (informational, triaged by a human) or a correction proposal
  (lands in the `/internal/corrections` queue). No auto-apply.
- **No schema migration** beyond a seed `INSERT` into the existing `aios_playbooks`.
- **No new edge function, no new secret, no auth/RPC change, no `donny-chat`
  redeploy.** A1 runs on the existing runner; A4 reuses the proven cloud-routine +
  `aios-report-ingest` pattern and the existing `$AIOS_INGEST_SECRET`.

---

## A1 — Kill-switch guardrail-watch playbook

### Deliverable

One idempotent seed migration,
`supabase/migrations/<ts>_aios_playbook_killswitch_seed.sql`, inserting a single row
into `public.aios_playbooks`, mirroring `20260619150000_aios_playbooks_seed.sql`
(identical column set, `on conflict (slug) do nothing`).

### Row

| Field | Value |
|---|---|
| `slug` | `kill-switch-watch` |
| `title` | `Kill-switch guardrail watch` |
| `allowed_proposals` | `[]` (report-only) |

**`task_md`** — Evaluate each kill-switch from the strategy library (find the source
via `get_internal_doc`; canonical is `PROJECT_CONTEXT §3` and
`north-star-kpi-scorecard.md`):
1. Churn > 6% **monthly**
2. CAC payback > 12 months
3. LTV:CAC < 2:1
4. Revenue-per-employee floor ($400K) — **a Y2–Y3 maturity gate, not a Y1 trigger**

Pull live data with `get_platform_stats`, `get_revenue_stats`, `get_cost_stats`. For
each kill-switch report **green / watch / breach / not-yet-measurable**, citing the
threshold and its scoping note. Call out any breach first.

**`preferences_md`** — Honor the §3 scoping notes verbatim: churn unit is **%/month**;
do **not** trigger revenue/employee in Y1 (the Y1 plan is structurally below the floor
by design). Aggregate dollars only; convert cents→dollars; never invent a number a
tool didn't return. Pre-revenue ($0 paying customers), churn / CAC-payback / LTV:CAC
have **no data source** — report them as *"not yet measurable (pre-revenue) — armed;
activates at first paying cohort"*, never as green or breach.

**`done_criteria_md`** — All four kill-switches are listed, each with a value-or-status,
its threshold, and a verdict; any breach is called out first; no kill-switch is
silently omitted.

### Rationale

Distinct from the existing `weekly-kpi-variance` playbook (which tracks KPIs against
targets) — A1 is strictly the *pause-the-business* trigger set with binary breach
semantics. Pre-revenue it confirms the guardrails are armed and encodes the thresholds
+ scoping notes in executable form; it auto-evaluates the day revenue starts. It is
**immediately runnable** on the existing `aios-playbook-run` runner once seeded — no
new code for on-demand use.

---

## A4 — Loop-callable playbooks (scheduling)

### Deliverable

One new scheduled-routine template, `.claude/schedules/playbook-runner-agent.md`,
modeled on `weekly-brief-agent.md`. It is a prompt; the founder creates a `/schedule`
routine from it, pinning a `<slug>` and a cron.

### Execution contract

1. **Load the definition** via Supabase MCP `execute_sql` on project
   `zocahiffooqdybdhguqv`:
   `select task_md, preferences_md, done_criteria_md, allowed_proposals, status from
   aios_playbooks where slug = '<slug>' and status = 'active'`. If missing/archived,
   stop and report — no finding.
2. **Execute the task** with `execute_sql` (plain `SELECT`s only — never
   INSERT/UPDATE/DELETE/DDL) + repo file reads. The playbook task references the
   runner's read-tools; fulfill each via this **capability map** (the same
   direct-table approach `weekly-brief-agent` already uses, which sidesteps the
   `auth.uid()`-gated RPCs that a sessionless routine can't satisfy):

   | Playbook read-tool | Scheduled-routine equivalent |
   |---|---|
   | `get_platform_stats` | direct `SELECT`s on `profiles` / `campaigns` / `dragonshare_*` / `promotions` |
   | `get_revenue_stats` | `SELECT` sums on `payment_events` + `dragonshare_boosts` |
   | `get_cost_stats` | `SELECT` on `donny_cost_ledger` |
   | `get_platform_weight_trend` | `SELECT` on `platform_weight` |
   | `get_latest_briefing` | `SELECT` on `aios_briefings` |
   | `get_internal_doc` | read `docs/wiki/**` / `docs/PROJECT_CONTEXT.md` from the repo |

3. **Self-assess** — end with the same fenced JSON the runner mandates:
   `{"done": <bool>, "checklist": [{"criterion": "...", "met": <bool>}], "missing": [...]}`
   so the loop has a machine verdict.
4. **Surface output via `aios-report-ingest` only** (`Authorization: Bearer
   $AIOS_INGEST_SECRET` — the env-secret service-bearer path the other routines use):
   - **On breach / at-risk:** POST `type:"finding"`, deduped on
     `fingerprint:"playbook-breach:<slug>"`, with `source:"playbook:<slug>"`, title
     `[playbook] <playbook title> — <n> guardrail(s) tripped`, `severity` = the worst
     verdict, evidence = the per-check results + the report body. A repeat run bumps
     the finding's occurrence count rather than duplicating (existing ingest dedup).
   - **All-green:** post nothing (lowest-noise; matches the bug-sweep routine).
   - **Corrections:** only if the playbook's `allowed_proposals` is non-empty → POST
     `type:"correction"`. A1 is report-only, so this path is **dormant** in this slice;
     full `acting_user_id` wiring for unattended proposals is deferred until a
     proposal-enabled playbook is actually scheduled.
5. **No writes** other than the ingest POST. Never write `aios_playbooks`,
   `aios_playbook_runs`, or any target table directly.

### Founder go-live (run-mode)

Create a `/schedule` routine from `playbook-runner-agent.md`, pinning
`slug='kill-switch-watch'` and a weekly cron (e.g. Monday morning ET). Same pattern as
the brief / bug-sweep / loop-scout routines.

---

## Files

| File | Change |
|---|---|
| `supabase/migrations/<ts>_aios_playbook_killswitch_seed.sql` | **new** — A1 seed row (idempotent) |
| `.claude/schedules/playbook-runner-agent.md` | **new** — A4 scheduled executor template + capability map |
| `docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md` | **new** — this spec |
| `docs/PROJECT_CONTEXT.md` | update — AIOS workstream bullet |
| Wiki + Donny RAG | via `knowledge-sync` at branch finish |

No TypeScript / edge-function / schema-DDL / secret changes.

## Verification

**A1 (immediately, on the existing runner):**
- Apply the seed migration to prod; confirm:
  `select slug, allowed_proposals from aios_playbooks where slug='kill-switch-watch'`.
- Run once via `/internal/playbooks/kill-switch-watch` (or POST `aios-playbook-run
  {slug:'kill-switch-watch'}` with an admin session). Confirm: all four kill-switches
  appear; pre-revenue ones read "not yet measurable"; `done_check` parses; no
  fabricated numbers; report-only (no proposal attempted).

**A4 (scheduled executor):**
- Dry-run the routine prompt against `slug='kill-switch-watch'`: it loads the
  definition, produces the report + JSON verdict, and **correctly posts no finding**
  when all-green (current pre-revenue state → no breach).
- Verify the finding-POST shape against a simulated breach: a single deduped finding
  lands on `/internal/findings` with `source:"playbook:kill-switch-watch"`; a second
  run bumps occurrences, not duplicates.
- Founder go-live: create the `/schedule` routine; confirm first run files/withholds a
  finding as expected.

**Process gate:** Codex second review before PR; `knowledge-sync` at branch finish.

## Rollout

1. Merge PR (migration + routine template + spec + PROJECT_CONTEXT).
2. Founder applies the seed migration to prod (or it rides the normal migration path).
3. Founder verifies A1 on-demand once.
4. Founder creates the `/schedule` routine for `kill-switch-watch`.
5. `knowledge-sync` → wiki + Donny RAG.
