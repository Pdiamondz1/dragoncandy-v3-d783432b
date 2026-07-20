# Session — apply_to_campaign overload → PGRST203 (2026-07-20)

## Trigger

Founder relayed: creator **PalmDom** got **"Failed to submit application. Please
try again later."** applying to a $400 campaign, and no application row was
created.

## Root cause

`apply_to_campaign` had **two overloads**: the original 6-arg
`(uuid,uuid,numeric,text,text,boolean)` and a 7-arg superset that added
`p_portfolio_url` (2026-05-25) plus the crew group guard (2026-07-09).
**PostgREST resolves RPC calls by argument NAME**, so any call omitting
`p_portfolio_url` (a 6-key body) matched **both** overloads →
**`PGRST203` "Could not choose the best candidate function"** (HTTP 300). That
message contains neither `row-level security` nor `violates row`, so
`useCreateApplication`'s `onError` fell through to its generic default toast,
and the transaction never inserted.

## How it was proven (against prod)

- **DB layer works:** ran `apply_to_campaign(...7 args...)` *as PalmDom* inside a
  `DO` block after `set_config('request.jwt.claims', '{"sub":"…","role":"authenticated"}', true)`,
  then `RAISE EXCEPTION` to roll back — it returned a valid `pending` row. So the
  INSERT, `ON CONFLICT`, the `notify_donny_nudge`/`trg_applications_auto_org`
  triggers, and the partial unique index are all fine.
- **PostgREST layer is where it breaks:** `curl` to `/rest/v1/rpc/apply_to_campaign`
  with the anon key — a **6-key** body returned `PGRST203`; a **7-key** body
  resolved and ran (returned the function's own `P0001 Unauthorized`, since the
  anon probe has `auth.uid()` = null). `execute_sql`/`apply_migration` run SQL
  *directly* and bypass PostgREST, so they cannot reproduce a resolution error —
  the HTTP probe is what pinned it.
- Ruled out first (each by evidence, not assumption): the `ON CONFLICT` partial
  unique index (exists, matches), both INSERT triggers (defensively coded —
  `notify_donny_nudge` reads its GUC with `missing_ok` and wraps `http_post` in
  `EXCEPTION`), a missing NOT-NULL column (none), and constraints.

## Fix (PR #321, prod-applied)

- `DROP FUNCTION public.apply_to_campaign(uuid,uuid,numeric,text,text,boolean)` —
  keep only the 7-arg, whose `p_portfolio_url` `DEFAULT NULL` covers 6-key callers
  too. Applied to prod via MCP `apply_migration` (migration file
  `20260720120000_…` is the tracked record); verified the 6-key call now resolves.
- `useCreateApplication.onError` now logs the structured `{code,message,details,hint}`
  and, for unknown errors, shows a support-actionable `(code: …)` instead of the
  opaque "try again later".
- `types.ts` synced to the single 7-arg overload.

## Honest caveat

The deployed web bundle sends **7 keys** (works in all tests), so PalmDom's exact
trigger could not be reproduced on current code, and prod `api` request logs
(24h window) no longer held their attempt. The fix removes the one concrete,
reproducible defect in the apply path — a landmine producing exactly this symptom
for any 6-key caller — and makes the next failure diagnosable.

## Durable lesson

Two RPC overloads where one is a **superset-via-DEFAULT** is a latent PostgREST
landmine: a call with the *smaller* key-set is ambiguous. Prefer **one** function
with optional/defaulted params over two overloads.
