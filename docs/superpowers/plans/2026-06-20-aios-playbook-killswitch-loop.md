# AIOS Kill-switch Playbook + Loop-callable Playbooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a report-only `kill-switch-watch` Founder Playbook (A1) and a cloud-routine template that makes any playbook runnable unattended, surfacing breaches as deduped findings (A4).

**Architecture:** A1 is a single idempotent seed `INSERT` into the existing `aios_playbooks` table — no new code, runs on the existing `aios-playbook-run` runner. A4 is a `.claude/schedules/*.md` cloud-routine template (modeled on `weekly-brief-agent.md`) that loads a playbook from `aios_playbooks` via Supabase MCP `execute_sql`, executes it with plain SELECTs + repo reads, and writes **only** by POSTing to `aios-report-ingest`. No edge-function, schema (beyond the seed), secret, or auth change.

**Tech Stack:** Postgres (Supabase migration SQL), Markdown cloud-routine prompt, Supabase MCP `execute_sql`, the `aios-report-ingest` edge function.

**Spec:** `docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260620120000_aios_playbook_killswitch_seed.sql` | **new** — the A1 seed row (idempotent on slug) |
| `.claude/schedules/playbook-runner-agent.md` | **new** — the A4 unattended executor template + capability map + finding contract |
| `docs/PROJECT_CONTEXT.md` | **modify** — one AIOS workstream bullet |

This slice is intentionally small; each task produces a self-contained, independently sensible commit. There is no compilable unit-test target (the deliverables are a SQL seed, a prompt template, and a doc) — "verification" steps are structural/contract checks and a final build gate, not unit tests.

---

## Task 1: A1 — kill-switch-watch seed migration

**Files:**
- Create: `supabase/migrations/20260620120000_aios_playbook_killswitch_seed.sql`
- Reference (mirror its shape exactly): `supabase/migrations/20260619150000_aios_playbooks_seed.sql`

- [ ] **Step 1: Write the migration file**

Exact content:

```sql
-- Seed the report-only "Kill-switch guardrail watch" Founder Playbook (A1).
-- Mirrors 20260619150000_aios_playbooks_seed.sql. Idempotent on slug.
-- Report-only (allowed_proposals = []): it evaluates PROJECT_CONTEXT §3's four
-- kill-switches and reports each green / watch / breach / not-yet-measurable.
-- Pre-revenue it is an armed-watch scaffold — churn / CAC-payback / LTV:CAC have
-- no data source yet (no cohort/subscription/marketing-spend tables).

insert into public.aios_playbooks (slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals)
values
  (
    'kill-switch-watch',
    'Kill-switch guardrail watch',
    'Evaluate every kill-switch from the strategy library and report whether any is tripped. Find the canonical thresholds with get_internal_doc (PROJECT_CONTEXT §3 "Kill-switches" and the north-star KPI scorecard). The four kill-switches are: (1) churn > 6% MONTHLY, (2) CAC payback > 12 months, (3) LTV:CAC < 2:1, (4) revenue-per-employee floor ($400K), which is a Y2-Y3 maturity gate, NOT a Y1 trigger. Pull the live data you can with get_platform_stats, get_revenue_stats, and get_cost_stats. For EACH kill-switch report its current value (or status), its threshold, and a verdict: green / watch / breach / not-yet-measurable. Call out any breach first.',
    'Honor the §3 scoping notes verbatim: churn is measured per MONTH (>6%/mo is worse than the 3-5%/mo SMB benchmark); do NOT treat revenue-per-employee as a breach in Y1 — report it as "gate inactive (Y2-Y3 maturity gate)". Use aggregate dollars only and convert cents to dollars; never invent a number a tool did not return. Churn, CAC-payback, and LTV:CAC have NO data source today (no cohort, subscription, or marketing-spend tables) — report each as "not yet measurable — armed; needs cohort/CAC instrumentation", never as green or breach. Be terse: short labeled bullets, not tables.',
    'All four kill-switches are listed, each with a current value or explicit status, its threshold, and a green/watch/breach/not-yet-measurable verdict; any breach is called out first; no kill-switch is silently omitted.',
    '[]'::jsonb
  )
on conflict (slug) do nothing;
```

- [ ] **Step 2: Verify structural parity with the existing seed**

Run: `git diff --no-index supabase/migrations/20260619150000_aios_playbooks_seed.sql supabase/migrations/20260620120000_aios_playbook_killswitch_seed.sql` (visual check only).
Confirm: identical column list and order in the `insert ... (slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals)` clause; `'[]'::jsonb` for `allowed_proposals`; trailing `on conflict (slug) do nothing;`. No new columns referenced.

- [ ] **Step 3: Validate the SQL is well-formed (no apostrophe/escaping errors)**

The task/preferences/done text was written **without** inner apostrophes to avoid SQL single-quote escaping bugs (the existing seed uses `''` doubling; this seed sidesteps it). Confirm by scanning the file: there must be **no** un-doubled `'` inside any string literal. If any contraction slipped in, double the quote (`don''t`) or reword.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260620120000_aios_playbook_killswitch_seed.sql
git commit -m "feat(aios): seed report-only kill-switch-watch Founder Playbook"
```

> **Prod apply is a run-mode step, not part of the build** (this repo applies migrations deliberately via MCP/CLI, not on Lovable deploy). See Verification.

---

## Task 2: A4 — playbook-runner cloud-routine template

**Files:**
- Create: `.claude/schedules/playbook-runner-agent.md`
- Reference (mirror its structure): `.claude/schedules/weekly-brief-agent.md`

- [ ] **Step 1: Write the routine template**

Exact content:

```markdown
# AIOS Playbook Runner Agent (loop-callable playbooks)

> Scheduled via `/schedule`. **Report-only.** Runs ONE saved Founder Playbook
> unattended and surfaces guardrail breaches as a deduped `/internal/findings`
> entry. Pin the playbook slug + cron when you create the routine. Spec:
> `docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md`.
>
> Why this exists: the on-demand runner (`aios-playbook-run` edge function) is
> session-JWT-bound (it does `auth.uid()`-gated stats RPCs) and CANNOT be called by
> a sessionless cron. So this routine executes the playbook itself via Supabase MCP
> `execute_sql` (plain SELECTs) + repo reads, and writes ONLY by POSTing to
> `aios-report-ingest`. The playbook definition is the single source of truth; this
> routine is just an unattended executor of it.

## Configuration (edit per routine)
- **PLAYBOOK_SLUG:** `kill-switch-watch`
- **Project:** `zocahiffooqdybdhguqv`
- Suggested cron: weekly, Monday morning ET.

## Prompt

You are DragonCandy's report-only playbook runner. Run the saved Founder Playbook
`<PLAYBOOK_SLUG>` and surface any guardrail breach as a finding. You never modify a
file, branch, or database row directly — your ONLY write is the HTTP POST in step 5.

1. **Load the playbook** via Supabase MCP `execute_sql` on project `zocahiffooqdybdhguqv` (plain SELECT only):
   `select slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals, status from aios_playbooks where slug = '<PLAYBOOK_SLUG>';`
   If no row, or `status <> 'active'`, STOP: report "playbook not found or inactive" and post nothing.

2. **Gather inputs.** `task_md` references internal read-tools; fulfill each via `execute_sql` (plain SELECTs only — NEVER INSERT/UPDATE/DELETE/DDL) or repo reads, per this capability map:
   - `get_platform_stats` → SELECTs on `profiles` / `campaigns` / `dragonshare_posts` / `dragonshare_boosts` / `promotions`
   - `get_revenue_stats` → SUMs on `payment_events` + `dragonshare_boosts` (`platform_fee_cents`, `creator_payout_cents`)
   - `get_cost_stats` → SELECT on `donny_cost_ledger` (month-to-date by tier)
   - `get_platform_weight_trend` → SELECT recent rows from `platform_weight`
   - `get_latest_briefing` → latest row from `aios_briefings`
   - `get_internal_doc` → read `docs/wiki/**` and `docs/PROJECT_CONTEXT.md` from the repo
   The map is a **superset by design** — it covers every read-tool any playbook might name, so this one routine works for *any* playbook. A given playbook (e.g. `kill-switch-watch`) uses only a subset; unused map rows are expected, not dead code.
   Monetary columns are in cents — convert to dollars. Never invent a number a query did not return.

3. **Execute the task.** Follow `task_md`, honoring `preferences_md`. Assign each check a verdict ∈ `{green, watch, breach, not-yet-measurable}`. Anything with no data source, or pre-revenue, is `not-yet-measurable`; honor any "gate inactive in Y1" note.

4. **Self-assess (log legibility only).** End your analysis with a fenced JSON block:
   `{"done": <bool>, "checklist": [{"criterion":"...","met":<bool>}], "missing": [...]}`.
   Nothing consumes this on the scheduled path — it is for the run log only; do not wire it to a gate.

5. **Surface output (the ONLY write).**
   - Compute the **breach set** = checks whose verdict is `breach` or `watch`.
   - **If the breach set is empty** (all `green` / `not-yet-measurable`): POST nothing. Report "all clear — no finding filed" and finish.
   - **If non-empty:** `POST https://zocahiffooqdybdhguqv.supabase.co/functions/v1/aios-report-ingest`
     with header `Authorization: Bearer $AIOS_INGEST_SECRET` and body:
     ```json
     {"type":"finding","payload":{
       "severity":"<critical if any verdict is breach, else medium>",
       "title":"[playbook] <playbook title> — <n> guardrail(s) tripped",
       "summary_md":"<markdown: one line per tripped check — value, threshold, verdict; breaches first>",
       "evidence":{"checks":[{"name":"...","verdict":"...","value":"...","threshold":"..."}]},
       "source":"playbook:<PLAYBOOK_SLUG>",
       "fingerprint":"playbook-breach:<PLAYBOOK_SLUG>"
     }}
     ```
     `severity` MUST be one of `critical|high|medium|low` (ingest rejects anything else). The single `fingerprint` dedups: a repeat breach bumps the finding's occurrence count (and reopens it if it had been resolved). **No auto-resolve:** if a breach later clears, this routine posts nothing, so the open finding stays at `/internal/findings` until a human triages it — that is intentional.

6. **Corrections (only if `allowed_proposals` is non-empty).** `kill-switch-watch` is report-only, so skip. A future proposal-enabled scheduled playbook would POST `type:"correction"` here — deferred; not wired in this slice.

7. **Verify + report.** If you posted a finding, re-read it: `select id, severity, title, occurrences, status from aios_findings where fingerprint = 'playbook-breach:<PLAYBOOK_SLUG>';` and report the id. If the POST failed, report the error; do not retry more than twice, and NEVER fall back to a direct table write.
```

- [ ] **Step 2: Self-verify the template against the contract**

Confirm against the spec and `aios-report-ingest/index.ts`:
- severity values used are only from `critical|high|medium|low` ✅ (critical, medium)
- payload has required `summary_md` (non-empty) and `title`; `evidence` is an object ✅
- writes go ONLY to `aios-report-ingest` (no INSERT/UPDATE in any SQL step) ✅
- capability map covers every read-tool the `kill-switch-watch` `task_md` names (`get_internal_doc`, `get_platform_stats`, `get_revenue_stats`, `get_cost_stats`) ✅

- [ ] **Step 3: Commit**

```bash
git add .claude/schedules/playbook-runner-agent.md
git commit -m "feat(aios): add loop-callable playbook-runner cloud-routine template"
```

---

## Task 3: PROJECT_CONTEXT workstream bullet

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md` (the "Active Workstreams" → DragonCandy AIOS section)

- [ ] **Step 1: Append a new AIOS workstream bullet**

Add, after the most recent AIOS bullet (the "Founder Playbooks" entry), a concise bullet. Match the surrounding `- DragonCandy AIOS — …` style:

```markdown
- DragonCandy AIOS — Kill-switch playbook + loop-callable playbooks — **built
  (branch `feat/aios-killswitch-playbook-loop`, 2026-06-20; founder-run go-live).**
  Two small slices. **(A1)** a report-only `kill-switch-watch` Founder Playbook that
  turns PROJECT_CONTEXT §3's four kill-switches into a repeatable check
  (green/watch/breach/not-yet-measurable); pre-revenue it is an armed-watch scaffold
  (churn/CAC/LTV:CAC have no data source yet — out of scope). **(A4)** a
  `playbook-runner-agent` cloud-routine template that makes any playbook loop-callable:
  it loads the definition from `aios_playbooks`, executes it via `execute_sql` + repo
  reads (a capability map sidesteps the `auth.uid()`-gated stats RPCs the on-demand
  runner needs), and posts a **deduped finding on breach/watch only** through
  `aios-report-ingest` (all-green posts nothing). No edge-function, schema (beyond a
  seed INSERT), secret, or auth change; invariant held — Donny never writes directly, a
  human triages. Founder go-live: apply the seed migration, then `/schedule` the runner
  pinning `slug='kill-switch-watch'`. Spec:
  `docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/PROJECT_CONTEXT.md
git commit -m "docs(aios): note kill-switch playbook + loop-callable playbooks workstream"
```

---

## Task 4: Final gates (before PR)

- [ ] **Step 1: Build gate**

Run: `npm run build`
Expected: success. (No TS changed, so this is a regression check only.)

- [ ] **Step 2: Codex second review (mandatory)**

Run the `codex-review` skill / `codex review --base main --title "AIOS kill-switch playbook + loop-callable playbooks"` from the worktree. Fix any real findings; re-run until clean. Relay the verdict.

- [ ] **Step 3: Open PR** (after Codex clean)

---

## Verification (end-to-end)

**A1 (after the seed migration is applied to prod — a run-mode step via Supabase MCP `apply_migration`):**
- Confirm the row: `select slug, allowed_proposals, status from aios_playbooks where slug='kill-switch-watch';` → one row, `[]`, `active`.
- Run it once on the existing runner via `/internal/playbooks/kill-switch-watch` (or POST `aios-playbook-run {slug:'kill-switch-watch'}` with an admin session). Confirm: all four kill-switches appear; pre-revenue ones read "not yet measurable"; rev/employee reads "gate inactive (Y2-Y3)"; the `done_check` JSON persists on the run row; no fabricated numbers; no proposal attempted (report-only).

**A4 (the scheduled executor):**
- Dry-run the routine prompt against `slug='kill-switch-watch'`: it loads the definition, produces the report + JSON verdict, computes an empty breach set in the current pre-revenue state, and **posts no finding** ("all clear").
- Contract spot-check (no live breach to trigger pre-revenue): confirm the documented POST body validates against `aios-report-ingest` — `severity` ∈ `critical|high|medium|low`, non-empty `summary_md`, `fingerprint` set for dedup.
- Founder go-live: create the `/schedule` routine; confirm the first run files/withholds a finding as expected, and a second run with the same breach bumps occurrences rather than duplicating.

**Knowledge (branch finish):** run the `knowledge-sync` skill — wiki session source + ingest + `donny_knowledge` RAG sync.
