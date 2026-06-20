---
title: Founder Playbooks
type: concept
created: 2026-06-20
updated: 2026-06-20
sources: [docs/superpowers/specs/2026-06-19-aios-founder-playbooks-design.md, 2026-06-19-aios-founder-playbooks.md, docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md, 2026-06-20-aios-killswitch-playbook-loop.md]
tags: [aios, donny, automation, internal, architecture]
---

# Founder Playbooks

A **Playbook** is a founder-authored, saved repeatable internal task that internal
[[Donny AI]] runs **on demand or unattended on a schedule** (see *Loop-callable*
below). It has four documented fields — `task`, `preferences`, `done-criteria`, and
`allowed-proposals` — the literal embodiment of *"document the task, your preferences,
and what counts as 'done' so any loop can call it."* Shipped in AIOS v1, PR #132
(2026-06-19/20), at `/internal/playbooks` (admin tier); made loop-callable 2026-06-20.

**Status (closed out 2026-06-20):** shipped, merged, and **prod-verified** — the first
real run of the *Weekly KPI variance check* seed completed in ~44s reporting **live**
platform stats (proving the session-JWT path, not the no-session stub), `done_check`
parsed to done, and zero corrections (report-only honored). Knowledge synced: this page
is in [[Donny AI]]'s RAG (`donny_knowledge`).

It is the **landing spot the [[Self-Improving App]]'s Loop Scout was missing**. Loop
Scout *proposes and ranks* recurring-work candidates (`source:"loop-scout"` findings)
but explicitly does **not** build loops; a Playbook is where a ranked candidate
*lands and runs*. A "Promote to playbook" action on a loop-scout finding pre-fills
the create form, closing the loop: **surface → land → run.**

## Report-only + propose — the power boundary

Running a Playbook is **report-only + propose**, never auto-apply. A run reads
internal data, composes a report, self-assesses against its done-criteria, and —
only if the playbook's `allowed_proposals` permits — **proposes** a correction
through the existing `aios-report-ingest` → `/internal/corrections` approval gate.
Nothing a Playbook does takes effect on its own; a founder approves every proposal.
This preserves the AIOS invariant **Donny never writes directly — a human approves
first**, and reuses the [[Self-Improving App]]'s gated-corrections machinery rather
than adding a new write path. `allowed_proposals = []` (the default for all v1
seeds) removes the `propose_correction` tool entirely, making the playbook
pure-report.

## The "done" mechanism

`done_criteria_md` is human-readable prose (no rules engine). The runner appends a
standing instruction to end with a fenced JSON self-assessment —
`{ done, checklist:[{criterion,met}], missing:[] }` — which it parses (tolerantly:
last fenced block, with a bare-object fallback) into `aios_playbook_runs.done_check`.
The UI renders **three** outcome states, not two: ✅ done, ⚠️ incomplete, and a
neutral **"no self-assessment"** chip when the model emitted no parseable block (a
missing assessment never fails the run — the report is still useful). A genuinely
failed/timed-out run is its own state. This makes "done" explicit and loop-checkable
— the heart of the originating idea.

## Architecture & gotchas

- **Self-contained runner** (`aios-playbook-run` edge function). The internal Donny
  tools, `executeTool`, and `buildInternalSystemPrompt` live in `donny-chat`, which
  calls `serve()` at module load — so they **can't be imported** without starting
  its server. Rather than refactor the core endpoint, the runner carries its own
  compact copy of just the internal READ tools + `propose_correction`. Keeps the
  live chat endpoint untouched (a deliberate blast-radius choice).
- **Runs under the caller's session JWT**, not the service role. The live-stats RPCs
  (`aios_platform_stats` / `_revenue_stats` / `_cost_stats`) require `auth.uid()` and
  degrade to a "stats unavailable" stub without a session ([[Supabase]]). The runner
  builds its tool client from the forwarded session so they return real data, and
  uses the service role only to read the playbook + write run rows. *(Verified in
  prod: the first run reported real live user counts, not the stub.)*
- **`verify_jwt=false`** at the gateway (config.toml). A browser-invoked function
  needs the unauthenticated CORS `OPTIONS` preflight to reach the handler; the
  function does its own session + admin checks. (A Codex P1 catch — the same
  failure class as the Loop Scout crons.)
- **Concurrency & lifecycle.** A partial unique index on
  `(playbook_id) WHERE status='running'` enforces one in-flight run. `STALE_RUN_MS`
  is set **above** the platform's hard edge-function wall-clock limit (~400s) so a
  live run is never reaped mid-flight; completion/failure writes filter
  `status='running'` so a reaped row can't be resurrected; an empty-report run fails
  rather than completing; the UI shows a "Timed out" chip for a stale running row.
- **Frontend** uses `supabase.functions.invoke` (not a raw `import.meta.env` fetch)
  so the prod-fallback URL/key apply in fallback-env builds (see the QA staging
  split-brain class).

## Data model

- `aios_playbooks` — `slug`, `title`, `task_md`, `preferences_md`, `done_criteria_md`,
  `allowed_proposals` (jsonb, validated via `<@` to the two `aios_corrections` enums),
  `status`, `source_finding_id` (link to a promoted loop-scout finding). Admin CRUD RLS.
- `aios_playbook_runs` — `status`, `result_summary_md`, `done_check`, `correction_ids`,
  `error_md`, timestamps. Admin SELECT; the runner writes via service role.

Seed report-only playbooks: *Weekly KPI variance check*, *Scaling & capacity check*,
*AI cost vs 15% cap* (PR #132), and *Kill-switch guardrail watch* (2026-06-20) — each
chosen to exercise the runner's available read tools.

### Kill-switch guardrail watch (seed, 2026-06-20)

`kill-switch-watch` turns [[North Star & KPI Scorecard]] §3's four kill-switches
(churn >6%/mo, CAC payback >12mo, LTV:CAC <2:1, revenue-per-employee floor — a Y2–Y3
gate, not a Y1 trigger) into a repeatable check reporting each **green / watch / breach
/ not-yet-measurable**. Honestly scoped as an **armed-watch scaffold**: pre-revenue all
four resolve to *not-yet-measurable* / *gate-inactive*, and three (churn, CAC-payback,
LTV:CAC) have **no data source** — and won't even post-revenue until cohort /
subscription / marketing-spend instrumentation exists (out of scope). Its value now is
arming the guardrails and encoding the thresholds executably; switches light up *as
their data sources are later built* (it does **not** auto-go-live the day revenue
starts — a claim explicitly retracted in spec review).

## Loop-callable (scheduling) — *"so any loop can call it"*

The originating idea's final clause — *so any loop can call it* — shipped 2026-06-20 as
**scheduling**, the prompt's literal "loop." A playbook can now run **unattended on a
cron** via a new cloud-routine template `playbook-runner-agent.md` (modeled on the
[[AIOS]] weekly-brief routine).

- **Why a routine, not the runner:** the on-demand `aios-playbook-run` is **session-JWT
  bound** (see Architecture below) — a **sessionless cron can't call it**. So the routine
  *itself* executes the playbook: it loads the definition from `aios_playbooks` via
  [[Supabase]] MCP `execute_sql`, and fulfills each read-tool the task names via a
  **capability map** to direct table SELECTs (the same trick weekly-brief uses to
  sidestep the `auth.uid()`-gated RPCs). The **playbook definition is the portable spec;
  the loop is just another executor of it.**
- **Output via `aios-report-ingest` only:** a **deduped finding on breach/watch only**
  (`fingerprint:"playbook-breach:<slug>"`, `source:"playbook:<slug>"`; verdict→severity
  map **breach→critical, watch→medium**); all-green posts nothing (lowest-noise, like the
  bug-sweep routine). **No auto-resolve** — a cleared breach leaves the open finding
  until a human triages it (matches bug-sweep / Loop Scout). The same invariant holds:
  the only write is an informational finding (or, for a proposal-enabled playbook, a
  gated correction) — **Donny never writes directly**.
- The self-assessment JSON is **log-legibility only** on the scheduled path (no run row
  is written). Founder go-live: `/schedule` a routine pinning `slug` + cron.

## Deferred

Donny `list_playbooks` / `run_playbook` **conversational** tools (running a playbook by
name mid-chat) remain deferred to keep `donny-chat` untouched (it would redeploy the
~100KB core); the runner already accepts `trigger:'donny'` for when they land. A
**service-bearer mode** on the runner (so a cron could reuse the *runner* rather than the
parallel routine executor) was also rejected — it would touch the `auth.uid()`-gated
stats-RPC auth model.

## See Also

- [[Self-Improving App]]
- [[Donny AI]]
- [[AIOS]]
- [[Loop Scout First Run]]
- [[Musk's Algorithm]]
