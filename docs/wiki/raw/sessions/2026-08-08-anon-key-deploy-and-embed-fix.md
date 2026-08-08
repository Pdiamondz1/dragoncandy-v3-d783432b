# Session — deploying the anon-key authorization fixes, and the two things found doing it

Date: 2026-08-08
Branch: `deploy-from-main` → `fix/campaign-hook-sponsor-embed` (PR #404)
Prior work: #399 (undeploy + `landing-clips` hardening), #402 (6 functions authorized)

## What this session was for

#402 and #399 were merged but **inert**. Both PR bodies said so explicitly: edge functions do not
auto-deploy here, so merging closed nothing. This session ran the `careful` pre-deploy gate and
performed the deploy.

## What shipped

7 edge functions deployed to prod (`zocahiffooqdybdhguqv`), each boot-verified with the public anon
key against a baseline captured before the deploy.

| Function | Before | After | Version |
|---|---|---|---|
| `dragonshare-notify` | 200 | 401 | 19 → 20 |
| `fire-dragonshare-social-hook` | `Boost not found` | 401 | 44 → 45 |
| `fire-promotion-social-hook` | reached lookup | 401 | 43 → 44 |
| `social-caption` | 400 | 401 | 44 → 45 |
| `toast-discount-push` | reached lookup | 401 | 60 → 61 |
| `fire-campaign-social-hook` | 404 `Campaign not found` | 401 | 50 → 51 |
| `landing-clips` | 200, unpinned | 200, own-bucket only | 6 → 7 |

Baselines used side-effect-free payloads (an event string matching no branch; zeroed uuids that fail
their lookup). `fire-campaign-social-hook` was additionally probed with a real published campaign id
— identical 401, so the existence oracle is closed, not merely narrowed.

Also verified: `donny-dragonshare-score` is absent from `list_edge_functions`, so the #399 undeploy
held.

## Finding 1 — an ambiguous PostgREST embed made an authorization arm dead code (PR #404)

`edge-function-reviewer` returned ISSUES pre-deploy. Confirmed live:

- `pg_constraint` shows `campaign_sponsorships` has TWO FKs to `business_profiles`:
  `campaign_sponsorships_brand_id_fkey` and `campaign_sponsorships_restaurant_id_fkey`.
- `business_profiles!inner(user_id)` → **HTTP 300 `PGRST201`**, "Could not embed because more than
  one relationship was found".
- `business_profiles!brand_id(user_id)` → 200. `business_profiles!brand_id!inner(user_id)` → 200.

supabase-js surfaces a 300 as `{ data: null }` rather than throwing; the call site read
`sponsorRes.data ?? []`, so `isActiveSponsorBrand` was permanently false — the brand arm of the
authorization gate never evaluated.

Fails **closed**: it denies a party the gate meant to allow, so it never weakened security, and it is
inert today (`BRAND_ROLE_ENABLED` off; the live caller path uses the `owner` basis). Fixed anyway
because that arm exists precisely because its future caller swallows errors with
`.catch(console.error)` — the silent-absence failure it guards against is the one it would cause.

`brand_id` is `NOT NULL`, so `!inner` is redundant; kept to state intent.

**Two independent close reads missed this.** #403's session found four other defects in the same file
and not this one; neither did my own re-read. `verify-sponsorship-payment` already used the
disambiguated form. A two-FK table is invisible in query text and visible only in the schema.

## Finding 2 — a parallel session edited the same file (PR #403)

The #404 merge was rejected: "head branch is not up to date". `git log HEAD..origin/main` showed
`a87914e2` — PR #403, authored by the founder's account from a different Claude session, hardening
the same function:

- `stage` range-validated, deliberately AFTER the authz gate
- `campaignError` bound and logged (fail-closed 403 unchanged; only the log improves)
- `donny_scheduled_posts` insert made idempotent via an existing-draft lookup
- raw `error.message` no longer returned
- function claimed OFF `.typecheck-ignore` (65 → 66 checked)

It did NOT touch the embed — main still carried the ambiguous form. Rebased cleanly as one hunk.

Consequence for the gate: the artifact about to be deployed was a version **no review had seen as a
whole**. Re-dispatched `edge-function-reviewer` on the merged file → PASS, with explicit checks that
#403's `campaignError` binding does not race the `Promise.all` #404 touched (it is a plain `await`
that completes first) and that the `stage` check sits after both authorization exits.

`deno check` on the merged file: **clean, 0 errors** — the 4 `TS18046`s measured pre-rebase were the
ones #403's `errMessage()` helper resolved.

## Verification performed

- Live prod probes before AND after, all 7 functions
- `pg_constraint` FK enumeration; `information_schema` nullability check on `brand_id`
- 42 unit tests (26 authz + 16 landing-clips); 12 after rebase
- `deno check` clean on the now-CI-gated `fire-campaign-social-hook`
- `npm run typecheck` + `npm run build` via pre-push hook
- `codex review --base main` — clean
- `edge-function-reviewer` — PASS on the final merged artifact
- CLI deploy output confirming every transitive `_shared/*` bundled and every `*.test.ts` excluded

## Gotchas recorded

- **supabase-js does not throw on HTTP error statuses** — a 300/400/500 is `{ data: null, error }`, so
  a `?? []` fallback converts a broken query into a confident empty answer. Fatal when an
  authorization decision reads it.
- **PostgREST requires an FK hint when a table has two FKs to the same target.** Check `pg_constraint`
  before writing an embed; probe the query rather than re-reading it.
- **Re-fetch origin before assuming your branch owns a file.** Two sessions edited one function within
  hours; only the out-of-date merge rejection surfaced it.
- **A pre-deploy review binds to a specific commit.** If the branch moves, the gate must run again.
- The `Supabase Preview` CI check fails on a three-month-old migration
  (`20260509051132`, `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` → *must be owner of
  table messages*) on any fresh preview branch. Pre-existing; unrelated to migration-free PRs.

## Left open

- `toast-token-refresh` browser caller refreshes every tenant's tokens (product decision; inert — zero
  Toast tables on prod)
- `fire-campaign-social-hook` `file_uploads` scoped by `campaign_id` only
- `dragonshare-notify`: no replay bound on `submission`; `declined` accepts any active org member
- `donny-oauth-token:50-55` module-scope `req` → every OAuth 4xx becomes a 500
- `PROJECT_CONTEXT.md` §10 still lists Toast POS as an active integration
