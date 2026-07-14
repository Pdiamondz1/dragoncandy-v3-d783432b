# Campaign Generation Async Jobs — Design

**Date:** 2026-07-14
**Status:** Approved (founder: "build it" — follow-up to PR #230)
**Branch:** `feat/campaign-generate-async-jobs`

## Problem

`donny-campaign-generate` (new "Donny-First" format) is a single ~40–60s non-streaming
HTTP call (Sonnet, ~3k output tokens). Mobile browsers drop long fetches — proven on
2026-07-14: the founder's generation **completed server-side** (`donny_cost_ledger` row
at the exact minute of the client's "Failed to send a request to the Edge Function"
toast) while the client fetch died, because the tab backgrounded during a video call.
The cost was billed; the result was thrown away.

**Why not streaming/keepalive (the PR #148 pattern):** PR #151 already proved a
*streamed* fetch still dies on mobile Safari when the tab suspends ("Load failed").
Heartbeats fix idle timeouts, not backgrounding. The generation's output can't be
shortened (the #151 remedy) — it inherently produces a full business context + 3
campaign ideas. The only transport that survives *any* client interruption is one where
the result lands somewhere the client can come back for.

## Design: async job + own-row polling

### Flow

1. Client invokes `donny-campaign-generate` with the existing new-format body plus
   `async: true`.
2. The function (after the existing auth + hourly-rate-limit gates) inserts a
   `campaign_generation_jobs` row (`status='processing'`), schedules the actual
   pipeline via `EdgeRuntime.waitUntil(...)`, and returns `{ job_id }` in <1s.
3. The background task runs the **unchanged** pipeline (fetchAndExtract → Anthropic →
   `logCost` + `incrementUsage`), updating the row's `progress` text at each phase,
   then writes `status='done'` + `result` (the exact JSON the sync path returns), or
   `status='error'` + a safe `error` message.
4. The client polls its own row (RLS `auth.uid() = user_id`) every 2.5s for up to
   3 minutes. Poll network errors are **ignored** (keep polling — that's the point);
   the extraction feed shows the row's `progress` as it changes. On `done` the existing
   `donnyGenerateResponseSchema.parse` path consumes `result`; on `error`/timeout the
   existing catch (`describeGenerationError`) handles it.

Backgrounding, connection drops, or radio sleep now cost at most one missed poll tick.
When the tab wakes, the next poll finds the finished row.

### What does NOT change

- The **sync path** (no `async` flag) is byte-identical — old frontend bundles during
  the deploy-skew window, donny-chat's `generate_campaign` tool (unchanged; note its
  service-role bearer plausibly matches neither auth branch today — pre-existing,
  out of scope), and the legacy Chrome-extension format.
- **Async is session-JWT-only.** An OAuth-authenticated caller
  (`validateDonnyToken` path) has no `auth.uid()` and could never poll the row, so
  `async: true` from an OAuth caller falls through to the sync path.
- The generation pipeline, prompts, model routing, cost ledger, and usage increments
  are unchanged (they move inside the background task on the async path only).
- `verify_jwt = false` (config.toml; confirm against prod `list_edge_functions` at
  deploy — the fn does its own dual auth: user JWT or Donny OAuth).

### Schema (one migration, additive only)

```sql
create table public.campaign_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing','done','error')),
  progress text,
  request jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_generation_jobs_user_created_idx
  on public.campaign_generation_jobs (user_id, created_at desc);
alter table public.campaign_generation_jobs enable row level security;
create policy "Users read own generation jobs"
  on public.campaign_generation_jobs for select
  to authenticated using (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies: writes are service-role only (bypass RLS).
```

- FK → `profiles(id)`: consumer feature (Donny OAuth users are consumer users with
  profiles). The `auth.users` FK rule is AIOS/internal-only tables.
- `request` is a **debugging/support artifact** (what did the user ask for when a job
  failed) — nothing consumes it at runtime; no resume feature.
- `updated_at` has **no trigger**; the service-role writer sets it explicitly on every
  UPDATE (this project's `handle_updated_at` triggers are known-unreliable).
- Retention: after each async run the function deletes the caller's jobs older than
  7 days — **fire-and-forget** (a delete failure never blocks anything). Partial by
  design: dormant users' rows persist until their next async start.

### Edge function changes (`donny-campaign-generate/index.ts`, new-format branch only)

- `if (body.async === true && isNewFormat)`: insert row → `EdgeRuntime.waitUntil(run())`
  → respond `{ job_id }`. If `EdgeRuntime.waitUntil` is unavailable (old runtime), fall
  back to firing the promise unawaited and log a warning.
- The background `run()` wraps the existing new-format pipeline verbatim (extracted
  into a shared `runNewFormatGeneration` used by both paths); progress strings:
  `Reading your link…` (URL fetch), `Generating campaign ideas…`. Errors write a
  truncated safe message. The task is **fully self-catching** — `scheduleBackground`
  also attaches a final `.catch`, so an unhandled rejection inside `waitUntil` is
  impossible.
- **Stuck-`processing` failure mode:** if the isolate dies mid-task (deploy, crash —
  `waitUntil` does not survive those), the row stays `processing` forever. The
  client's 3-minute poll timeout is the recovery path, and the 7-day cleanup removes
  the row later. The Pro-plan 400s wall clock still bounds the background task —
  ample for a ~60s generation. The no-`waitUntil` fallback (unawaited promise) is
  best-effort only and degrades to this same recovery path.
- Rate-limiting happens **before** job creation (unchanged position). Validation
  splits: a request with no `source_url`/`photo_url`/`manual_text` at all gets the
  same sync 400 before any job is created; the narrow "URL fetch succeeded but
  extracted nothing and there was no other input" edge becomes a job `error` —
  an accepted minor behavior change on the async path only.

### Client changes (`useCampaignCreator`)

- A shared `generateViaAsyncJob(request, onProgress)` helper is used by **both**
  `submitInput` and `regenerateIdeas` (regeneration is the same 40–60s call with the
  same mobile-drop exposure). It sends `async: true`; a `job_id` response → poll; a
  full-payload response (old fn version — skew window) → used directly as today.
- While here: `describeGenerationError` also maps a 429 `FunctionsHttpError` to the
  friendly rate-limit copy — `functions.invoke` exposes bodies only on 2xx, so the
  old `data?.error === 'rate_limited'` branch could never fire on a real 429.
- New pure, unit-tested `src/lib/campaignGenerationJob.ts`:
  `pollCampaignJob(fetchRow, {intervalMs, timeoutMs, onProgress})` — injectable fetch
  + timers, resilient to per-poll errors, resolves the terminal row or throws
  `job_timeout`.
- Extraction feed messages update from `progress` changes; error copy flows through
  the existing `describeGenerationError` (add a `job_timeout` mapping: "This is taking
  longer than usual — your ideas may still arrive; try again in a minute.").

### Types

Surgical `campaign_generation_jobs` addition to `src/integrations/supabase/types.ts`
(Row/Insert/Update), matching the generated shape.

### Deploy ordering (per the deploy-ordering rule)

1. Migration to prod (MCP `apply_migration`).
2. Edge fn deploy via Supabase CLI (`--no-verify-jwt` per prod ground truth), after
   `edge-function-reviewer` subagent + `careful` gate; boot-check.
3. Frontend merges via PR (Lovable auto-deploy). Old fn + new frontend and new fn +
   old frontend are both safe (see "What does NOT change").

### Testing

- `campaignGenerationJob.test.ts` (fake timers): done, error, poll-blip resilience,
  timeout.
- `useCampaignCreator.test.ts`: extend `describeGenerationError` cases.
- Live verify: curl the async start (401 unauthenticated), then an authenticated
  end-to-end run on prod (job row transitions + result parse) post-deploy.

### Risks / trade-offs

- **Double cost on start-retry:** if the <1s start call itself fails and the user
  retries, two jobs run. Accepted — the hourly rate limit already bounds this; the
  start call is short enough that drops are rare.
- **Job rows accumulate:** mitigated by the 7-day self-cleanup on the hot path.
- **`EdgeRuntime.waitUntil` availability:** supported on Supabase's edge runtime
  (background tasks); fallback documented above.
- **Result never read** (user closes app entirely): row persists 7 days; a future
  "resume last generation" could consume it (deliberately out of scope — YAGNI).

## Out of scope

- Realtime subscription instead of polling (adds channel/RLS complexity for a ≤3-min
  window; polling at 2.5s is 72 cheap reads worst-case).
- Resuming a pending job across a full page reload.
- The legacy format and donny-chat tool path (unchanged).
- Progressive/partial rendering of ideas as they stream from the model.
