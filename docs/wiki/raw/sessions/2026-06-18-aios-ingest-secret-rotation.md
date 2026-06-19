# AIOS ingest-secret key rotation — session (2026-06-18)

## Problem

The three daily ~3am AIOS cloud routines (knowledge-freshness, bug-sweep, weekly-brief)
and the `content-performance-capture` pg_cron had been failing **every run since
2026-06-11**. The founder had created a new Supabase **secret API key** (`sb_secret_…`,
the new key system replacing the legacy `service_role`/`anon` JWTs), which changed what
prod treats as the service-role credential.

## Root cause

The AIOS ingest endpoints authenticate by an **exact-match** check against the
function's auto-injected `SUPABASE_SERVICE_ROLE_KEY`:
`req.headers.get("Authorization") !== \`Bearer ${SUPABASE_SERVICE_ROLE_KEY}\``. When the
credential changed, the **auto-injected** copy updated automatically, but every
**manually-stored copy** went stale → 401:

- the `Dame_git_claude` Claude Code cloud-routine env (the 3am agents), and
- the Supabase **Vault** `content_capture_key` (the content-capture pg_cron bearer).

Diagnosis tell, confirmed from prod logs: the *same* `aios-report-ingest` function
returned **200** to Internal Donny's `propose_correction` calls (Donny sources the bearer
from injection → always current) but **401** to the agents (stale stored copy). And
`aios_findings` / `aios_briefings` had no rows newer than 2026-06-11.

## Fix (PR #129, branch `fix/aios-ingest-secret-rotation`)

New shared gate `supabase/functions/_shared/ingest-auth.ts` — `isAuthorizedIngest(req)` —
accepts a bearer matching **either** the injected service-role key (so internal
`donny-chat → aios-report-ingest` calls are untouched) **or** a dedicated, stable
`AIOS_INGEST_SECRET`. Exact-match only (preserves the original no-substring-bypass
property). Applied to:

- `aios-report-ingest` (the 3 agents),
- `donny-knowledge-sync` (manual sync / freshness remedy),
- `content-performance-capture` (Vault pg_cron),
- the `google-workspace-proxy` service-bearer metrics path (weekly-brief step 7).

Additive and backward-compatible. The four schedule docs in `.claude/schedules/` were
updated to use `$AIOS_INGEST_SECRET`.

## Key decision — single credential, value = the sb_secret key

`AIOS_INGEST_SECRET`'s **value is the new `sb_secret_…` key itself**, not a random
string. Reason (caught by the Codex second review): the agents' direct **PostgREST**
reads (`/rest/v1/...`, `apikey` + Bearer) require a *real* Supabase API key — a random
secret would 401 there. Using the sb_secret value lets each agent hold **one** credential
that works as both the PostgREST `apikey` for reads AND the ingest POST bearer. The
decoupling that matters: the edge functions now accept this **user-managed** value
explicitly (via their own `AIOS_INGEST_SECRET` edge secret), so a Supabase-initiated
rotation of the auto-injected legacy key can no longer silently 401 the routines.

Set the same value in THREE places (all out-of-band; not committable):
1. edge secret `AIOS_INGEST_SECRET` (project `zocahiffooqdybdhguqv`),
2. the `Dame_git_claude` cloud-routine env (and point the 3 prompts at it), and
3. Vault `content_capture_key`.

Secret name can't start with `SUPABASE_` (Supabase reserves that prefix for injected vars).

## Verification

- Deployed all 4 functions via `npx supabase functions deploy … --no-verify-jwt` (CLI
  auto-bundles `_shared` from disk — no Docker; avoids the manual-bundle silent-no-op
  risk). Each upload listed its full transitive bundle.
- Boot-check: no-auth POST → 401 on all four (booted, not broken).
- Decisive behavioral test **without ever seeing the secret value**: fired `pg_net`
  POSTs from the DB using the Vault-stored copy. `aios-report-ingest` returned **400**
  "payload is required" (gate **passed** with the new secret — old code would have 401'd
  a non-injected bearer), and `content-performance-capture` returned **200**
  `{ok:true, posts:2, inserted:4}` (the cron actually ran). Read back from
  `net._http_response`.

## Gotchas / notes

- **Don't disable the legacy service_role JWT.** Every function's internal
  `createClient(URL, SUPABASE_SERVICE_ROLE_KEY)` (all ~80) still relies on the injected
  legacy key; disabling it is a separate, larger migration. This fix only insulates the
  ingest/cron **auth gate**.
- Deploy is independent of the Lovable frontend push; the source/docs land on `main` via
  PR #129 but the fix took effect at deploy time once the secrets were set.
- Files: `supabase/functions/_shared/ingest-auth.ts` (new), `aios-report-ingest`,
  `donny-knowledge-sync`, `content-performance-capture`, `google-workspace-proxy`,
  and `.claude/schedules/{knowledge-freshness,bug-sweep,weekly-brief}-agent.md`.
