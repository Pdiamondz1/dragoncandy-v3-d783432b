# Session 2026-06-19/20 — AIOS Founder Playbooks v1 (+ verify-db-schema skill)

Source: development session. PR #132. Spec:
`docs/superpowers/specs/2026-06-19-aios-founder-playbooks-design.md`.

## Origin

A founder-supplied screenshot/tip: *"Look at the tasks I do repeatedly. Tell me
which would benefit from a saved skill file — one that documents the task, my
preferences, and what counts as 'done' so any loop can call it."* Applied at two
levels: a dev-workflow skill, and a product feature.

## Deliverable 1 — `verify-db-schema` dev skill (doc-only)

`.claude/skills/verify-db-schema/SKILL.md`. Codifies the recurring "verify the DB,
not just the UI" bug-fix gate: confirm every touched column exists in **prod** (not
just a migration file), RLS allows the **actual** actor (anon vs `auth.uid()`),
frontend field names match the schema, the migration is applied **before** any
edge-fn/frontend depends on it, and `get_advisors` is clean. Explicit done-criterion.
Folds in hard-won deploy-ordering / cross-user-definer-RPC / CGC-anon memories.

## Deliverable 2 — AIOS Founder Playbooks v1 (product)

A **Playbook** = a founder-authored saved repeatable internal task with four fields:
`task_md`, `preferences_md`, `done_criteria_md`, `allowed_proposals`. Running one
executes the definition **report-only + propose**: read internal data → compose a
report → self-assess against the done-criteria → (only if allowed) **propose**
corrections through the existing `aios-report-ingest` → `/internal/corrections`
approval gate. Nothing auto-applies. Preserves *Donny never writes directly; a human
approves*. It is the landing spot the monthly **Loop Scout** routine's ranked
`loop-candidate` findings were missing — surface → land → run — wired via a
"Promote to playbook" action on `source='loop-scout'` findings.

### Architecture / key decisions

- **Data model:** `aios_playbooks` + `aios_playbook_runs`, admin-only RLS, following
  `aios_*` conventions. Partial unique index `(playbook_id) WHERE status='running'`
  enforces one in-flight run. `allowed_proposals` validated to the two
  `aios_corrections` target-type enums via jsonb `<@` (CHECK can't hold a subquery).
- **Runner is self-contained** (`supabase/functions/aios-playbook-run`): `donny-chat`
  calls `serve()` at module load, so its internal tools (`INTERNAL_TOOL_DEFINITIONS`,
  `executeTool`, `buildInternalSystemPrompt`, `propose_correction`) can't be imported
  without starting its server. Rather than refactor the core endpoint, the runner
  carries a compact copy of just the internal READ tools + `propose_correction`. The
  user chose this over extraction to keep `donny-chat` untouched.
- **Runs under the caller's session JWT** (not service role): the live-stats RPCs
  (`aios_platform_stats`/`_revenue_stats`/`_cost_stats`) require `auth.uid()` and
  degrade to a stub without a session. The runner builds its tool client from the
  forwarded session and uses the service role only to read the playbook + write runs.
- **`verify_jwt=false`:** a browser-invoked function needs the unauthenticated CORS
  `OPTIONS` preflight to reach the handler; the function does its own session + admin
  checks. (Codex P1.)
- **Done-check:** prose `done_criteria_md`; the runner ends with a fenced JSON
  self-assessment (`done` bool + checklist + missing). Tolerant parse → `done_check`
  jsonb, with a 3rd "no self-assessment" UI state when null.
- **Concurrency/lifecycle:** `STALE_RUN_MS=15min` (> platform edge wall-clock ~400s)
  so a live run is never reaped; completion/failure writes filter `status='running'`;
  an empty-report run fails rather than completing; the UI chip shows "Timed out" for
  a stale running row.
- **Frontend:** `useRunPlaybook` uses `supabase.functions.invoke` (not raw
  `import.meta.env` fetch) so the prod-fallback URL/key apply in fallback-env builds.
- v1 omits `search_internal_knowledge` (embeddings) from the runner to keep the edge
  bundle all-`_shared` and the MCP deploy reliable; `get_internal_doc` covers it.

### Surfaces

UI `/internal/playbooks` (list + create/edit form + Run) and `/internal/playbooks/:slug`
(definition + run history + done chip), admin tier, dark ops-deck styling. 3
report-only seed playbooks: `weekly-kpi-variance`, `scaling-capacity-check`,
`ai-cost-vs-cap`.

### Deferred

Donny `list_playbooks`/`run_playbook` conversational tools (would edit + founder-redeploy
`donny-chat`). The runner already accepts `trigger:'donny'` for when they land.

## Verification

Migration + seeds applied to prod, `aios-playbook-run` deployed (v5) — all via MCP;
frontend ships on merge. `npm run build`/`typecheck`/`lint` green; runner boot-checked;
CORS preflight 200; advisors clean for the new tables. **Codex second review: clean**
(1 P1 + 5 P2 resolved across rounds). Live agentic run is post-merge founder
verification (needs an admin session — same pattern as donny-chat).
