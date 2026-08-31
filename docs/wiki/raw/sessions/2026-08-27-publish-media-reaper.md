# Session — the staged-media reaper, and two gates that each looked like one

Date: 2026-08-27
Branch: `feat/publish-media-reaper` (worktree `social-media-integration2`)
Migrations: `20260826440000_reapable_publish_media`, `20260826450000_publish_media_reaper_cron`
Edge function: `publish-media-reaper` (new)
Also changed: `supabase/config.toml`

## What this closed

`PROJECT_CONTEXT` §5 listed "a storage reaper for three orphan paths" as pending on native
publishing, and the design spec
(`docs/superpowers/specs/2026-08-26-instagram-native-publishing-design.md` §"Open — a storage
reaper") enumerated exactly three. **There are four**, and the fourth is the one no enumeration
would have caught, because it is a deliberate design choice rather than a gap:

1. the deadline branch — `claim_publish_job`'s janitor gives up 48h past `scheduled_at`, in SQL,
   which cannot reach Storage;
2. `needs_review` — kept on purpose so a person can see what was about to go out, then never
   collected;
3. an enqueue whose RPC never committed — the catch deliberately does not delete, because past
   the RPC call the commit outcome is unknowable;
4. **a best-effort `discardStaged` delete that failed** — it logs and continues by design, since
   "a failed delete must never turn a published post into a reported failure". Deliberate litter,
   and nothing else collected it.

One rule covers all four: delete an object when nothing can need it again. That is why this is a
sweep and not four cleanups bolted onto four call sites — the shape the spec already rejected as
"the enumeration failure this repo has watched three times on `profiles` write grants".

## The design decisions worth keeping

**The decision is ONE SQL query, and that is not a style preference.** "Is this object referenced"
and "is this object old" must be answered of the same instant. Read the bucket, then read the
jobs, and a job inserted between the two reads makes a live object look like an orphan — and the
consequence is not a stale count, it is deleting the media out from under a scheduled post. The
residual gap between the query and the caller's DELETE is closed by construction rather than by a
lock: `plannedDestinations` mints a fresh random batch directory per invocation, so an object
unreferenced in this snapshot can never become referenced afterwards.

**The row is NOT deleted in SQL.** Deleting from `storage.objects` removes the bookkeeping and
leaves the file in the object store — an invisible leak replacing a visible one. So SQL decides
(one snapshot, exact ages, no recursive folder walk) and the edge function deletes through the
Storage API.

**Three retention classes, plus one age-independent absolute.** orphan 6h / terminal 72h (longer
than the 48h job deadline) / `needs_review` 30d. The absolute rule is that a `queued` or `claimed`
job's bytes are never touched **regardless of age** — a post scheduled a month out sits `queued`
for a month, and any "old enough" rule would delete exactly the posts a customer cared about most.

**The retention clock is `greatest(object.created_at, job.updated_at)`, never the job stamp
alone.** `publish_jobs` has no `handle_updated_at` trigger; its `updated_at` moves only because
every transition RPC assigns `now()` explicitly. If a future transition forgets, `updated_at`
falls back to row creation — far in the past for a job scheduled weeks out — and would reap on the
first tick after it failed. `greatest` makes that mistake cost retention rather than data.

**Count what Storage says it removed, never `group.length`.** `remove()` succeeds for a path that
no longer exists and omits it from the result, so trusting the request size reports deletions that
never happened — and on an empty bucket that number is the only evidence anyone will read.

## The two defects review found, both of which presented as already-handled

**1. `config.toml` had no entry for this function at all** (found by `edge-function-reviewer`).
All three sibling cron sweeps carry `verify_jwt = false`; the platform default is `true`, so the
gateway would have 401'd the cron before `isAuthorizedIngest` ever ran. This is worse than an
ordinary breakage: the healthy state of this reaper is **zero deletions on an empty bucket**, so a
permanently-401ing daily job is indistinguishable from a working one. A missing config entry is
not a missing line — it is a silently-inverted default.

**2. The RPC carried half the lockdown its own comment claimed** (found by
`data-exposure-reviewer`). The header said "same lockdown as every other function on this queue",
true of the GRANT half and false of the in-body `request.jwt.claims ->> 'role' = 'service_role'`
guard that `claim_publish_job`, `record_publish_container`, `confirm_publish_job` and
`fail_publish_job` all carry. Nothing leaked — the EXECUTE lockdown is the real gate and it was
correct — but the two gates fail independently, and one re-granting migration would hand every
staged object's name to any authenticated caller. Those names are `<user-id>/<batch>/<n>.<ext>`:
they enumerate user ids and how many posts each has pending.

Adding the guard moved the function from `language sql` to `plpgsql`, which required an explicit
`::text` on the CASE — under `return query` the row type must match the declared `RETURNS TABLE`
exactly, and a bare literal in a CASE resolves as `unknown`. As `language sql` this coerced
silently.

**Before adding that guard I checked it would not itself be a regression.** If the service-role
bearer did not populate `request.jwt.claims`, the guard would break a function that worked.
`instagram-publish-sweep` returns `"expired":0`, and that counter is read straight off
`claim_publish_job`'s result — which carries the identical guard. So the cron→bearer→service-role
path demonstrably populates the claim.

## Verification (prod, every write rolled back)

The bucket holds **0 objects** and `publish_jobs` holds **0 rows**, so no natural run can prove
this works — an empty bucket and a broken query produce the same zero. Hence:

- Both migrations applied; RPC confirmed by `pg_proc` (plpgsql, SECURITY DEFINER, four integer
  args) with an invented name as the control. EXECUTE reads back exactly `postgres` +
  `service_role`.
- **A planted five-object population inside a rolled-back transaction**: `orphan`,
  `review_expired` and `terminal` returned; the `queued` job's 40-day-old media and a too-fresh
  orphan both **withheld**. Two of five withheld is what makes it a control rather than a query
  that returns everything. Rollback left zero rows.
- The guard proven both directions: correct rows under a `service_role` claim, `P0001` under
  `authenticated`.
- Deployed with all five assets including the transitive `_shared/origins.ts`. Live `verify_jwt`
  read **false** from the Management API — not from `config.toml`, which is not ground truth.
- 401 with no bearer and with a wrong one; **404 on an invented function name**, so the 401s mean
  "exists and refused".
- A real **200** driven through `net.http_post` with the Vault bearer — the cron's exact path.
  `retained_for_review` came back `0` rather than `null`, proving the jobs count ran too.
- Vault secret `publish_media_reaper_url` created and verified **by content**, not existence.
- Cron `publish-media-reaper` active at `20 4 * * *`, deliberately clear of
  `instagram-refresh-sweep` at 04:00. Invented job name returned nothing as the control.

Prerequisite checks done before writing anything: `storage.objects.is_delete_marker` exists
(boolean, PG 17.6), `media_paths` is an array, the bucket exists and is private, and
`publish_jobs_status_check` allows exactly the six statuses the three-way split covers — so
nothing falls through to `terminal` while still in flight.

## Codex second review — one P1, refuted

Codex filed a P1 claiming `storage.objects` has no `is_delete_marker` column and that every cron
invocation would therefore fail. **Refuted by prod**: that predicate returns 287 non-marker
objects, and the live 200 above had already executed the query. Codex's sandbox has no prod
access, so it inferred the schema from the repo — the stale-context failure mode `CLAUDE.md`
warns about under the Codex section. No fix made, no re-run needed.

## Still open

- The **scheduled** trigger has never fired; first run 04:20 UTC.
- Nothing has ever been deleted, because nothing has ever been staged — the queue has no UI
  caller yet, so `deleted > 0` is unreachable until native publishing has a producer.
- `publish_jobs` is **absent from `docs/DATABASE_SCHEMA.md`** — it shipped without a table entry.
  Out of scope here; flagged rather than silently expanded.
