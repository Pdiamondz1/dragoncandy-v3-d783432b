# AIOS Founder Playbooks v1 — Design

**Status:** Design · **Date:** 2026-06-19 · **Author:** Claude (brainstorm with Dame)

## 1. Context & Motivation

A founder-supplied tip prompts: *"Look at the tasks I do repeatedly. Tell me which
would benefit from a saved skill file — one that documents the task, my
preferences, and what counts as 'done' so any loop can call it."*

Applied to DC AIOS, the platform already has every primitive that idea needs
**except the saved-task abstraction itself**:

- Report-only cloud routines (weekly brief, daily bug sweep, knowledge-freshness)
  that read live data and file output through one audited choke point.
- A **propose → approve → apply** correction flow (`aios_corrections` +
  `aios-report-ingest` + the `aios_corrections_apply` RPC) where Donny *proposes*
  and a founder *approves* — Donny never writes directly.
- A brand-new monthly **Loop Scout** routine (shipped 2026-06-19) that runs the
  4-Condition Test over repeated work and files ranked `loop-candidate:<slug>`
  findings on `/internal/findings` — but **explicitly does not build loops.**

Loop Scout *surfaces and ranks* candidate repeatable tasks; today they have
nowhere to land. **Founder Playbooks is that destination**: a saved, documented,
"done"-gated repeatable task that a founder or internal Donny can run on demand.
A run is **report-only + propose** — it produces a report and may propose
corrections, but every write still routes through the existing human-approval
gate. This is the screenshot's pattern made into product, and it closes the
Loop-Scout loop (surface → land → run).

### Invariant preserved

*Donny never writes knowledge or settings directly — a human approves first.* A
playbook run's only non-report write is a `propose_correction`, which goes
through the existing `aios-report-ingest` choke point and lands in
`/internal/corrections` for founder approval. Nothing a playbook does
auto-applies.

## 2. Goals / Non-Goals

**Goals**
- Let a founder define a repeatable internal task once — `task`, `preferences`,
  `done criteria`, `allowed proposals` — and run it on demand.
- Reuse the internal-Donny agent machinery and the corrections gate verbatim; add
  no new approval path and no new write surface.
- Make "done" explicit and machine-checkable per run (the heart of the prompt).
- Give Loop-Scout candidates a one-click destination.

**Non-Goals (v1 — each a clean later increment)**
- **No scheduling/cron.** On-demand only (Run button + Donny invoke).
- **No auto-apply / risk tiers.** Report-only + propose; humans approve.
- **No Donny-authored playbooks.** Founders author in v1; Donny can *run*.
- **No per-run parameters.** A playbook runs its saved definition as-is.

## 3. Data Model

Two additive tables, internal-only RLS, following `aios_*` conventions. Migration
applied to prod **before** the edge-fn deploy + frontend merge (deploy-ordering
rule); any new SECURITY DEFINER fn has `EXECUTE` revoked from `anon`.

### `aios_playbooks`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `slug` | text unique | kebab-case; stable handle for Donny `run_playbook(slug)` |
| `title` | text | |
| `task_md` | text | what the playbook does (the instruction) |
| `preferences_md` | text | constraints/preferences (tone, what to ignore, e.g. "no $ except aggregate revenue") |
| `done_criteria_md` | text | explicit definition of done |
| `allowed_proposals` | jsonb | array; **only** `"dashboard_setting"` / `"strategy_doc"` valid (the corrections CHECK enum); empty `[]` ⇒ report-only. Validate server-side against exactly those two strings so an authoring typo can't silently disable proposals |
| `status` | text | `active` \| `archived` |
| `source_finding_id` | uuid null | if promoted from a Loop-Scout finding |
| `created_by` | uuid | founder user id |
| `created_at` / `updated_at` | timestamptz | |

### `aios_playbook_runs`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `playbook_id` | uuid fk → `aios_playbooks` | |
| `triggered_by` | uuid | founder user id |
| `trigger` | text | `manual` \| `donny` |
| `status` | text | `running` \| `completed` \| `failed` |
| `result_summary_md` | text null | the report |
| `done_check` | jsonb null | `{ done: bool, checklist: [{criterion, met}], missing: [] }` |
| `correction_ids` | jsonb null | ids of corrections this run proposed |
| `error_md` | text null | failure detail when `status = failed` |
| `started_at` / `finished_at` | timestamptz | |

**RLS:** both tables readable/writable only by internal admins
(`is_internal_user()` / `has_role('admin')`, matching existing `aios_*` tables).
The runner writes runs via the service role (see §4). Reuse the existing internal
RLS helper functions — do not invent new ones.

**Index:** partial unique index on `aios_playbook_runs (playbook_id) WHERE status
= 'running'` enforces the one-in-flight-run concurrency guard (§4.2).

## 4. Execution Flow (report-only + propose, on-demand)

1. Founder clicks **Run** at `/internal/playbooks/<slug>`, or asks internal Donny
   *"run the `<slug>` playbook"* (Donny calls the `run_playbook` tool — §6).
2. The **runner** loads the playbook and executes one bounded tool-use loop
   (reuse `donny-chat`'s `MAX_TOOL_ROUNDS = 10`) with internal Donny's existing
   read tools + `propose_correction`. The system prompt is assembled from:
   - base = `buildInternalSystemPrompt` — note this returns
     `{ stable, volatile }` (two system blocks, prompt-cache breakpoint on
     `stable`), **not** a string; the runner emits both blocks and appends the
     playbook fields to `volatile`,
   - + `task_md` as the task (wrapped as data — see §9),
   - + `preferences_md` as constraints,
   - + `done_criteria_md` with a standing instruction to **end with a fenced
     JSON self-assessment** (`{ done, checklist:[{criterion,met}], missing:[] }`).
   `propose_correction` is offered only if `allowed_proposals` is non-empty.

   **Auth / session (resolves the stats-RPC `serviceMode` trap).** The live-stats
   RPCs (`aios_platform_stats` / `aios_revenue_stats` / `aios_cost_stats`) hard-fail
   when `auth.uid()` is null and `executeTool` degrades them to a "not available"
   stub in `serviceMode` (donny-chat lines 882–900). A report-only playbook that
   reads stats (e.g. the "Weekly KPI variance check" seed) would otherwise return
   "stats unavailable." **The runner therefore runs under the acting admin's
   session JWT**, exactly like `donny-orchestrator`/`donny-chat`: it builds
   `internalCtx.userClient` from the caller's `Authorization` header so
   `auth.uid()` is set and the stats RPCs work (NOT `serviceMode`). The service
   role is used only to write the `aios_playbook_runs` rows. **UI Run button** →
   the founder's session token is sent as the `Authorization` header. **Donny
   path** (§6) → `run_playbook` runs inside `donny-chat`, which already holds the
   admin's `Authorization` header; it forwards that same header to the runner so
   the nested run keeps the caller's `auth.uid()`.
3. The loop reads live data/strategy (`get_platform_stats`,
   `search_internal_knowledge`, `get_latest_briefing`, …), composes the report,
   self-checks against `done_criteria_md`, and proposes corrections if permitted.
   Proposals flow through `aios-report-ingest` exactly as today → land in
   `/internal/corrections`.
4. The runner persists an `aios_playbook_runs` row (`result_summary_md`,
   parsed `done_check`, `correction_ids`, status).
5. Founder reviews the run (report + done chip + linked proposals) and
   approves/rejects each proposal via the existing corrections queue + apply RPC.

### 4.1 Runner seam — OPEN DECISION (corrected facts; recommend B)

The internal tools (`INTERNAL_TOOL_DEFINITIONS`), `buildInternalSystemPrompt`, and
`executeTool` (with admin `internalCtx` gating and the `propose_correction` →
ingest path) **all live in `supabase/functions/donny-chat/index.ts`** — a
2366-line *streaming, session/quota/rate-limit-bound* chat endpoint.
`donny-orchestrator` is **consumer** Donny (campaign/dragonshare/billing agents +
Outstand) and has none of the internal tools. The earlier brainstorm answer
"reuse donny-orchestrator" was made on the wrong premise; the substance the user
chose — *reuse the internal-Donny machinery rather than reimplement it* — is what
governs. Three honest ways to honor that:

- **(A) Add a "playbook mode" branch inside `donny-chat`.** Maximal in-place
  reuse, but bloats an already-huge endpoint and forces a non-interactive,
  server-triggered run through SSE + per-user session/quota/rate-limit machinery
  built for interactive chat. Poor fit.
- **(B, recommended) New thin `aios-playbook-run` edge function that *imports*
  the shared internal pieces from `donny-chat`.** Requires a small, low-risk
  change to `donny-chat`: `export` `INTERNAL_TOOL_DEFINITIONS`,
  `buildInternalSystemPrompt`, and `executeTool` (no behavior change — pure
  extraction of already-existing symbols). The new function runs a clean bounded
  loop, assembles the playbook system prompt, persists the run, and is the single
  thing the UI Run button and the Donny `run_playbook` tool both call. Clean
  separation of batch vs interactive; reuses the *actual* tool logic and the
  corrections gate; easiest to schedule later.
- **(C) Extract the internal loop into `_shared/internal-donny.ts`** used by both.
  Cleanest long-term, but a real refactor of a large shared component — CLAUDE.md
  requires explicit approval before refactoring shared Donny/auth code, and it's
  more than v1 needs.

**Recommendation: B.** It is the faithful reading of "reuse, don't reimplement"
given where the code actually lives, keeps the streaming chat path untouched, and
adds only an `export` to `donny-chat` plus a small new function. The new function
is admin-gated the same way the internal surface is, and runs with the same
`internalCtx` contract so the SQL gates re-verify. **This is the one item that
needs the user's explicit sign-off at spec review**, because the earlier answer
named a different function and because it touches `donny-chat`.

### 4.2 Run lifecycle — concurrency, bound, failure

- **Concurrency guard.** A playbook may have at most one in-flight run. The runner
  rejects a new Run if an `aios_playbook_runs` row for that `playbook_id` is
  `running` (prevents the §7 Run button and a Donny `run_playbook` from
  overlapping). Enforced with a partial unique index on
  `(playbook_id) WHERE status = 'running'`.
- **Loop bound.** The tool-use loop is capped at `MAX_TOOL_ROUNDS` (10, reused).
  Hitting the cap ends the run normally (`completed`, with whatever `done_check`
  was emitted — possibly null per §5).
- **Failure.** The whole run is wrapped so any exception/Anthropic error/timeout
  sets `status = 'failed'` with detail in `error_md`. **Known limitation:** if the
  edge function is hard-killed mid-run, its row can be stranded in `running`; the
  UI treats a `running` row with `started_at` older than 5 min as stale and shows
  a "timed out" state (and the concurrency guard ignores stale rows so the
  playbook isn't permanently locked). v1 does not add a reaper job.
- **`correction_ids` capture.** During the loop, each `propose_correction`
  tool-result returns `{ proposed: true, id }` on success or `{ error }` on
  failure; the runner collects the `id`s of successful proposals into
  `correction_ids` (skipping error results, which carry no id).

## 5. "Done" Representation

`done_criteria_md` is human-readable prose (no rules engine). The runner appends a
standing instruction: *finish by emitting a fenced JSON self-assessment* — `done`
boolean, a checklist mapping each stated criterion to met/unmet, and a `missing`
list. Simple, explicit, and loop-checkable — exactly "what counts as 'done' so
any loop can call it."

**Parsing & absence (must be tolerant).** The runner extracts the **last fenced
JSON block** from the final assistant text and validates it has a boolean `done`.
On success → store it in `done_check`. If the model finishes (or hits the round
cap) with **no parseable block** → `done_check = null`. The UI therefore renders
**three** states, not two: ✅ done (`done:true`), ⚠️ incomplete (`done:false`),
and a neutral **"no self-assessment"** chip (`done_check = null`). A missing
assessment does **not** fail the run — `status` stays `completed` (the report is
still useful); only an exception/timeout yields `failed` (§4.2).

## 6. Donny Integration

Add two admin-only tools to `INTERNAL_TOOL_DEFINITIONS` in `donny-chat`:
- `list_playbooks` — returns `{slug, title, status}` for active playbooks.
- `run_playbook` — args `{ slug }`; invokes the `aios-playbook-run` function,
  **forwarding the caller's `Authorization` header** (§4 auth) so the nested run
  keeps the admin's `auth.uid()`, and returns `result_summary_md` + `done_check`.
  Realizes "any loop can call it" conversationally with no scheduling infra.
  **Latency note:** this nests a full agent loop (up to 10 Anthropic rounds)
  inside one of donny-chat's own tool rounds, so the chat turn blocks on the whole
  run. Acceptable for v1 (founder-initiated, infrequent); a future fire-and-return
  variant (kick off + report a run id) is a clean later change.

Donny redeploy is founder-run (same pattern as the gated-corrections /
knowledge-freshness routine updates).

## 7. UI — `/internal/playbooks` (admin-only)

Dark "ops-deck" styling, wired into the `<InternalRoute>` admin tier in
`src/App.tsx` and `InternalLayout` nav. New pages under `src/pages/internal/`,
hooks under `src/hooks/internal/` (`usePlaybooks`, `usePlaybookRuns`,
`useRunPlaybook`) following React Query conventions (`enabled: !!`, invalidate on
success).

- **List:** title · last-run · last done chip · Run.
- **Create/Edit form:** the 4 markdown fields + `allowed_proposals` toggles
  (dashboard_setting / strategy_doc).
- **Detail:** definition + run history; each run shows `result_summary_md`, the
  done chip + checklist, and linked proposals (deep-link to `/internal/corrections`).
- **Promote-from-Loop-Scout (nicety that closes the loop):** on a finding whose
  `source = "loop-scout"` (the Loop-Scout routine's contract: `source="loop-scout"`,
  `fingerprint="loop-candidate:<slug>"`, `[loop]`-prefixed title), a **"Promote to
  playbook"** action pre-fills the create form (`title` from the finding,
  `source_finding_id` set). Small, high-leverage — gives Loop-Scout candidates
  their destination. **Dependency:** this keys on Loop Scout actually filing
  findings in that shape. Loop Scout is a cloud-routine prompt
  (`.claude/schedules/loop-scout-agent.md`) the founder runs, not repo code; the
  promote action degrades gracefully (it simply doesn't appear) on findings
  lacking `source="loop-scout"`, so it is safe to ship before any loop-scout
  finding exists.

## 8. Seed Playbooks

Insert 2–3 real, currently-ad-hoc tasks so v1 proves value on day one:
- **Weekly KPI variance check** — read live stats + KPI targets, report variance
  vs the scorecard; report-only.
- **RLS / schema-drift audit** — product-side mirror of the `verify-db-schema`
  dev skill; report-only.
- **Stale-finding sweep** — re-examine open `/internal/findings`, flag
  likely-resolved ones; report-only.

(Seeded `active`, `allowed_proposals = []` so the first runs are pure report-only;
proposals can be enabled per-playbook later.)

## 9. Security & Invariants

- Both tables internal-admin RLS only; runner writes via service role with an
  admin-verified `userId`.
- `run_playbook` / the runner re-use `executeTool`'s `internalCtx` gating — the
  same admin verification the internal chat surface uses; no new trust path.
- `propose_correction` is unchanged: server captures the before-value, the agent
  never writes the target. `allowed_proposals = []` removes the tool entirely for
  report-only playbooks.
- **Stored-task replay threat model.** Unlike interactive chat (an admin types the
  task live), a playbook replays **stored** founder-authored markdown unattended
  into a loop that can call `propose_correction` — a stale or maliciously-edited
  playbook runs with no human in the turn. The real mitigation is **not** a prompt
  guard: it is that `propose_correction` only ever lands a *proposal* in the
  human-approved `/internal/corrections` queue (server captures the before-value;
  the agent never writes the target). Blast radius is bounded to proposals a
  founder must still approve — and `allowed_proposals = []` removes the tool
  entirely. `task_md` is additionally embedded as data in the `volatile` block;
  donny-chat's `sanitizeUserInput` injection-pattern filter is applied to it (do
  not over-rely on it — the corrections gate is the guarantee). Authoring a
  playbook is itself an admin-only, RLS-gated action.

## 10. Verification

- Migration applied to prod first; `generate_typescript_types` surgical add for
  the two tables.
- `npm run build` + `npm run typecheck` + `npm run lint` green.
- **End-to-end (manual, `/internal/playbooks`):** create a seed playbook → Run →
  assert a `running`→`completed` run row, `result_summary_md` rendered, `done_check`
  chip populated. Enable an `allowed_proposals` type, author a playbook whose task
  finds a wrong setting → Run → assert a correction lands in `/internal/corrections`
  and applies through the existing RPC.
- **Stats via session (Blocker 1):** the "Weekly KPI variance check" seed Run
  returns **real** platform/revenue numbers (not the "not available" stub) —
  confirms the runner carries the admin's `auth.uid()` and is not in `serviceMode`.
- **Done-check absence (Blocker 2):** a run whose model omits the JSON block
  yields `done_check = null` and the neutral "no self-assessment" chip, with
  `status = completed`.
- **Concurrency:** a second Run while one is `running` for the same playbook is
  rejected (partial unique index); a `running` row older than 5 min is treated as
  stale and does not lock the playbook.
- **Donny path:** `run_playbook(<slug>)` from `/internal/donny` returns report +
  done-check; `list_playbooks` lists active ones.
- **Promote flow:** a `loop-scout` finding's "Promote to playbook" pre-fills the
  form with `source_finding_id` set.
- **Negative:** a non-admin session cannot read `aios_playbooks` / call the runner
  (RLS + internal gate). Report-only playbook (`allowed_proposals = []`) is not
  offered `propose_correction`.
- Codex second-review pass clean; then run `knowledge-sync` to capture the session.

## 11. Build Order (slices)

1. This spec → `spec-document-reviewer` loop → **user sign-off (incl. §4.1 runner
   seam decision).**
2. Migration: `aios_playbooks` + `aios_playbook_runs` + RLS; apply to prod; types.
3. Runner: `export` the internal pieces from `donny-chat`; new `aios-playbook-run`
   edge function; deploy.
4. Donny tools: `list_playbooks` + `run_playbook` in `donny-chat`; founder redeploy.
5. UI: `/internal/playbooks` list + form + detail + nav; hooks.
6. Promote-from-Loop-Scout action on `/internal/findings`.
7. Seed playbooks.
8. Codex second review; fix + re-run until clean. PR. On merge: `verify-prod` both
   viewports + `knowledge-sync` (wiki session source + ingest + core-doc refresh +
   Donny RAG).
