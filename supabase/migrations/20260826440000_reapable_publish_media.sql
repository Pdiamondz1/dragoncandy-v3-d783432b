-- ---------------------------------------------------------------------------
-- reapable_publish_media -- decide, in ONE snapshot, which staged bytes nobody
-- can need again.
--
-- `20260826370000` (the deadline) closed with: "A bucket sweep over long-dead
-- `stuck`/`needs_review` jobs is its own slice." This is that slice.
--
-- ===========================================================================
-- FOUR WAYS BYTES ARE LEFT BEHIND, NOT THREE
-- ===========================================================================
--
-- The sweeps already delete staged media on the two transitions they cause
-- themselves (`published`, and the `stuck` they raise). What survives:
--
--   1. THE DEADLINE BRANCH. `claim_publish_job`'s janitor gives up on a job
--      48h past `scheduled_at` -- in SQL, which cannot reach Storage. The job
--      ends `stuck` with its media intact.
--
--   2. `needs_review`. Kept ON PURPOSE: a person is about to look at a job that
--      may or may not have published, and what they were about to post is the
--      first thing they will want to see. This is not litter until it is old.
--
--   3. AN ENQUEUE WHOSE RPC NEVER COMMITTED. The enqueue stages first and
--      inserts second, and past the RPC call the commit outcome is unknown --
--      so its catch deliberately does NOT delete (`rpcAttempted`). Bytes with
--      no row.
--
--   4. A BEST-EFFORT DELETE THAT FAILED. `discardStaged` logs and continues by
--      design: "a failed delete must never turn a published post into a
--      reported failure". Deliberate litter, and nothing else collects it.
--
-- (3) also catches the narrow case where an idempotency replay loses the race
-- to the fast path: staging happens, the RPC dedupes, and the fresh copy is
-- referenced by nothing.
--
-- One rule covers all four, which is why this is a sweep and not four cleanups
-- bolted onto four call sites: DELETE AN OBJECT WHEN NOTHING CAN NEED IT AGAIN.
--
-- ===========================================================================
-- WHY THE DECISION IS ONE SQL QUERY
-- ===========================================================================
--
-- "Is this object referenced?" and "is this object old?" have to be answered of
-- the same instant. Read the bucket, then read the jobs, and a job inserted
-- between the two reads makes a live object look like an orphan -- and the
-- consequence is not a stale count, it is deleting the media out from under a
-- post somebody scheduled.
--
-- A single query answers both from one snapshot, so that window does not exist.
-- What remains is the gap between this query and the caller's DELETE, and that
-- one is closed by construction rather than by a lock: `plannedDestinations`
-- mints a FRESH random batch directory on every invocation, so a new job can
-- never come to reference an object that already existed. An object unreferenced
-- in this snapshot cannot become referenced afterwards.
--
-- ===========================================================================
-- WHY THE ROW IS NOT DELETED HERE
-- ===========================================================================
--
-- Deleting from `storage.objects` in SQL removes the BOOKKEEPING and leaves the
-- actual file in the object store -- a leak that is now invisible, which is
-- strictly worse than the visible one it replaces. So this function only
-- decides; the caller deletes through the Storage API. Read in SQL (one
-- snapshot, exact ages, no recursive folder walk), delete through Storage
-- (correct).
--
-- ===========================================================================
-- THE AGE THIS MEASURES
-- ===========================================================================
--
-- `publish_jobs` has NO `handle_updated_at` trigger -- checked against
-- `pg_trigger` on prod, with `profiles` as a control that returned one. Its
-- `updated_at` moves because every transition RPC assigns `now()` explicitly,
-- which is sturdier than the trigger this repo defaults to assuming (that
-- trigger was a no-op stub on prod for years -- see [[Updated-At Trigger
-- Drift]]).
--
-- Even so the retention clock is `greatest(object.created_at, job.updated_at)`,
-- never the job stamp alone. If a transition is ever added that forgets the
-- assignment, `updated_at` silently falls back to the row's creation -- which
-- for a job scheduled weeks out is far in the past, and would reap on the first
-- tick after it failed. `greatest` makes that mistake cost retention rather
-- than data.
-- ---------------------------------------------------------------------------

create or replace function public.reapable_publish_media(
  -- An object no job references. Only has to outlast the seconds between
  -- staging and the enqueue RPC committing; hours, because the failure mode of
  -- getting this wrong is deleting a live post's media.
  p_orphan_grace_seconds       integer default 21600,    -- 6 hours

  -- `published` / `failed` / `stuck`. Longer than the 48h job deadline, so a
  -- job the janitor gave up on is genuinely finished before its bytes go.
  p_terminal_retention_seconds integer default 259200,   -- 72 hours

  -- `needs_review`. Long, because a person may still want to see it -- but not
  -- unbounded: an ambiguous post nobody has looked at in a month is not going
  -- to be looked at, and the row records what happened either way.
  p_review_retention_seconds   integer default 2592000,  -- 30 days

  p_limit integer default 500
)
returns table (object_name text, reason text, age_seconds bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The EXECUTE lockdown below is the gate. This is the SECOND gate, and the
  -- point is that the two fail independently: one re-granting migration would
  -- otherwise hand every staged object's name to any authenticated caller, and
  -- those names are `<user-id>/<batch>/<n>.<ext>` -- they enumerate user ids and
  -- how many posts each has pending. Every other definer on this queue carries
  -- this check (`claim_publish_job`, `record_publish_container`,
  -- `confirm_publish_job`, `fail_publish_job`); this one claimed the same
  -- lockdown in a comment while carrying only half of it.
  --
  -- Consequence worth knowing before debugging it: `request.jwt.claims` is set
  -- by PostgREST, so a call from the SQL editor or pg_cron (role `postgres`)
  -- raises here. That is the same behaviour as the four siblings. To exercise
  -- it by hand, set the claim first:
  --   set local request.jwt.claims = '{"role":"service_role"}';
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'reapable_publish_media is service-role only';
  end if;

  return query
  with claim as (
    -- One row per referenced path, carrying the STRONGEST claim on it.
    -- Paths are minted per enqueue so exactly one job names any path today;
    -- aggregating anyway means a future shared path cannot be reaped because
    -- the weaker of its two claims happened to sort first.
    select
      p.path,
      bool_or(j.status in ('queued', 'claimed')) as live,
      bool_or(j.status = 'needs_review')         as under_review,
      max(j.updated_at)                          as last_touched
    from public.publish_jobs j
    cross join lateral unnest(j.media_paths) as p(path)
    group by p.path
  )
  select
    o.name,
    case
      when c.path is null   then 'orphan'
      when c.under_review   then 'review_expired'
      else                       'terminal'
    -- Explicit cast: under `return query` the row type must match the declared
    -- RETURNS TABLE exactly, and a bare literal in a CASE resolves as `unknown`.
    -- As `language sql` this coerced silently; plpgsql raises "structure of
    -- query does not match function result type".
    end::text,
    extract(epoch from now() - o.created_at)::bigint
  from storage.objects o
  left join claim c on c.path = o.name
  where o.bucket_id = 'publish-media'
    -- Versioning is off on this project, but a delete marker is not a file and
    -- asking the Storage API to remove one is a needless error in the log.
    and coalesce(o.is_delete_marker, false) = false

    -- THE ONE ABSOLUTE RULE, and it is age-independent on purpose. The deadline
    -- runs from `scheduled_at`, so a post scheduled a month out sits `queued`
    -- for a month with media that must survive the whole wait. Any rule that
    -- reaped a live job's bytes "once they were old enough" would delete
    -- exactly the posts a customer cared about most.
    and coalesce(c.live, false) = false

    and case
      when c.path is null then
        o.created_at < now() - make_interval(secs => p_orphan_grace_seconds)
      when c.under_review then
        greatest(o.created_at, c.last_touched)
          < now() - make_interval(secs => p_review_retention_seconds)
      else
        greatest(o.created_at, c.last_touched)
          < now() - make_interval(secs => p_terminal_retention_seconds)
    end
  order by o.created_at
  limit greatest(p_limit, 0);
end;
$$;

-- Same lockdown as every other function on this queue. A bare `revoke from
-- public` does not lock down a definer function against Supabase's default
-- privileges -- `anon` and `authenticated` must be named.
revoke execute on function public.reapable_publish_media(integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reapable_publish_media(integer, integer, integer, integer)
  to service_role;
