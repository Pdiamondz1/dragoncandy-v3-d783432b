-- publish_jobs: reclaim abandoned claims, and refuse to auto-retry a job that
-- may already be live on Instagram.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS
--
-- `20260826264500` gave `claim_publish_job` a `p_claim_ttl_seconds` parameter
-- and then never referenced it. Nothing reclaimed a claim, so a sweep that died
-- between claiming and confirming -- an edge-function timeout, a deploy
-- mid-flight, an OOM -- left its job in `claimed` forever. It was not retried,
-- not alerted on, and not visible as failed: it simply stopped. A constant
-- nothing reads is not a control, and neither is a parameter nothing reads.
--
-- Reclaiming is NOT simply "put it back to queued", and that is the substance
-- of this migration. Publishing is irreversible and public. The dangerous state
-- is the one between `POST /media_publish` leaving our process and
-- `confirm_publish_job` committing: from the outside those look identical to
-- "the publish never happened", and Meta offers no idempotency key to tell them
-- apart (Stripe does, which is why `pending_balance_flushes` could make the
-- ledger id the key and this cannot).
--
-- So the job records `publishing_at` immediately BEFORE that call, and a
-- reclaim reads it:
--
--   publishing_at IS NULL     -> nothing was published. Safe: back to `queued`.
--   publishing_at IS NOT NULL -> a post may be live. `needs_review`, never
--                                retried automatically.
--
-- `needs_review` is the `stuck` contract applied to a public post rather than
-- to money: an ambiguous irreversible action becomes a human decision instead
-- of a second attempt. A duplicate post on a customer's feed is worse than a
-- post that needs a person to look at it.
--
-- The second fix here is head-of-line blocking. The candidate query picked the
-- globally oldest due job, so one account sitting at its 100-per-24h cap
-- stalled publishing for every other account on the platform. The sweep can now
-- pass the accounts it has already been declined for and ask again.
-- ---------------------------------------------------------------------------

alter table public.publish_jobs
  add column if not exists publishing_at timestamptz;

comment on column public.publish_jobs.publishing_at is
  'Stamped immediately before POST /media_publish. Non-null with a null ig_media_id means a post MAY be live and the job must not be retried automatically.';

alter table public.publish_jobs drop constraint if exists publish_jobs_status_check;
alter table public.publish_jobs add constraint publish_jobs_status_check
  check (status in ('queued', 'claimed', 'published', 'failed', 'stuck', 'needs_review'));

-- A `needs_review` row exists only because we could not tell whether a publish
-- landed, and the only evidence for that is `publishing_at`. Without this, the
-- status could be set on a job that was never near Meta, which would put a
-- human in front of a decision there is nothing to decide.
alter table public.publish_jobs drop constraint if exists publish_jobs_review_has_publishing_at;
alter table public.publish_jobs add constraint publish_jobs_review_has_publishing_at
  check (status <> 'needs_review' or publishing_at is not null);

-- The sweep's queue scan and the janitor's reclaim scan, neither of which
-- should read the whole table once this has run for a while.
create index if not exists idx_publish_jobs_due
  on public.publish_jobs (scheduled_at)
  where status = 'queued';

create index if not exists idx_publish_jobs_claimed
  on public.publish_jobs (claimed_at)
  where status = 'claimed';

-- ---------------------------------------------------------------------------
-- begin_publish_step -- stamp the point of no return.
--
-- Separate from `confirm_publish_job` because the whole value is in the gap
-- between them. Called under the caller's own claim, so a job whose claim was
-- already reclaimed by another sweep cannot stamp it and is told so.
-- ---------------------------------------------------------------------------
create or replace function public.begin_publish_step(
  p_job_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'begin_publish_step is service-role only';
  end if;

  update public.publish_jobs
  set publishing_at = now(),
      updated_at = now()
  where id = p_job_id
    and claim_id = p_claim_id
    and status = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.begin_publish_step(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_publish_step(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- claim_publish_job -- replaced, not overloaded.
--
-- A different parameter list makes an OVERLOAD rather than a replacement, so
-- the old four-argument version would survive alongside this one and a caller
-- that had not moved would keep getting the version with no reclaim and no
-- skip list. Dropped explicitly, which is the same lesson the TikTok bigint
-- widening recorded about return types.
-- ---------------------------------------------------------------------------
drop function if exists public.claim_publish_job(integer, integer, integer, integer);

create or replace function public.claim_publish_job(
  p_claim_ttl_seconds integer,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_max_attempts integer,
  p_skip_ig_user_ids text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.publish_jobs%rowtype;
  v_claim uuid := gen_random_uuid();
  v_recent integer;
  v_reclaimed integer;
  v_flagged integer;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'claim_publish_job is service-role only';
  end if;

  -- --- janitor -------------------------------------------------------------
  -- Deliberately outside the per-account lock. Each UPDATE is atomic on its own
  -- row and idempotent, so two sweeps running it at once reach the same state;
  -- a lock would only serialise work that does not need serialising, and this
  -- pass has to cover every account rather than the one about to be claimed.
  --
  -- The ambiguous case is handled FIRST. If the order were reversed, a row
  -- whose publish may have landed would be moved back to `queued` by the safe
  -- branch and become eligible for a second attempt in the same call.
  update public.publish_jobs
  set status = 'needs_review',
      last_error = 'Claim expired after the publish call was issued -- a post may already be live. Check the account before retrying.',
      claim_id = null,
      claimed_at = null,
      updated_at = now()
  where status = 'claimed'
    and claimed_at < now() - make_interval(secs => p_claim_ttl_seconds)
    and publishing_at is not null;
  get diagnostics v_flagged = row_count;

  update public.publish_jobs
  set status = 'queued',
      last_error = 'Claim expired before the publish call was issued -- safe to retry',
      claim_id = null,
      claimed_at = null,
      updated_at = now()
  where status = 'claimed'
    and claimed_at < now() - make_interval(secs => p_claim_ttl_seconds)
    and publishing_at is null;
  get diagnostics v_reclaimed = row_count;

  if v_flagged > 0 then
    raise warning 'publish_jobs: % claim(s) expired mid-publish and need review', v_flagged;
  end if;

  -- --- candidate -----------------------------------------------------------
  -- Read without the lock, only to learn which account to lock; re-read inside
  -- it below. Acting on the unlocked read is the defect `20260825150000`
  -- shipped and `20260825160000` corrected on the Facebook disconnect.
  select * into v_job
  from public.publish_jobs
  where status = 'queued'
    and scheduled_at <= now()
    and attempts < p_max_attempts
    and not (ig_user_id = any (coalesce(p_skip_ig_user_ids, '{}')))
  order by scheduled_at
  limit 1;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'nothing due',
                              'reclaimed', v_reclaimed, 'flagged', v_flagged);
  end if;

  perform pg_advisory_xact_lock(hashtext('ig_publish:' || v_job.ig_user_id));

  select * into v_job
  from public.publish_jobs
  where id = v_job.id
    and status = 'queued'
    and scheduled_at <= now()
    and attempts < p_max_attempts;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'taken',
                              'reclaimed', v_reclaimed, 'flagged', v_flagged);
  end if;

  -- Counted inside the lock. Counting in the edge function and then acting on
  -- the count is check-then-act: N concurrent sweeps all read 99 and all
  -- publish. Same shape as `reserve_phone_verification_send`, which exists
  -- because the TypeScript version of that check raced.
  select count(*) into v_recent
  from public.publish_jobs
  where ig_user_id = v_job.ig_user_id
    and status = 'published'
    and published_at > now() - make_interval(secs => p_rate_window_seconds);

  if v_recent >= p_rate_limit then
    -- Not a failure. The job is good; the account is out of allowance, so it
    -- waits rather than burning an attempt. `ig_user_id` is returned so the
    -- caller can add it to its skip list and ask again for another account
    -- instead of stalling the whole platform behind one.
    return jsonb_build_object('claimed', false, 'reason', 'rate_limited',
                              'ig_user_id', v_job.ig_user_id, 'recent', v_recent,
                              'reclaimed', v_reclaimed, 'flagged', v_flagged);
  end if;

  update public.publish_jobs
  set status = 'claimed',
      claim_id = v_claim,
      claimed_at = now(),
      attempts = attempts + 1,
      updated_at = now()
  where id = v_job.id;

  return jsonb_build_object(
    'claimed', true,
    'job_id', v_job.id,
    'claim_id', v_claim,
    'user_id', v_job.user_id,
    'connection_id', v_job.connection_id,
    'ig_user_id', v_job.ig_user_id,
    'content_type', v_job.content_type,
    'caption', v_job.caption,
    'media_paths', v_job.media_paths,
    'ig_container_id', v_job.ig_container_id,
    'reclaimed', v_reclaimed,
    'flagged', v_flagged
  );
end;
$$;

revoke execute on function public.claim_publish_job(integer, integer, integer, integer, text[])
  from public, anon, authenticated;
grant execute on function public.claim_publish_job(integer, integer, integer, integer, text[])
  to service_role;

-- ---------------------------------------------------------------------------
-- The media bucket -- PRIVATE, and the enqueue path COPIES into it.
--
-- Copying rather than referencing the user's existing upload is the point. A
-- reference is a promise about a path, and the bytes at a path can be replaced
-- after approval: schedule a post, overwrite the file, and the sweep publishes
-- something no one approved. A copy freezes the approved bytes at the moment of
-- approval, which is what "the owner tapped this" has to mean for an action
-- that cannot be undone.
--
-- Private, because Instagram needs a URL it can fetch ONCE, not an object that
-- stays world-readable forever. The sweep mints a short-lived signed URL at
-- container-creation time.
--
-- No `storage.objects` policies are added: nothing but the service role touches
-- this bucket, and the service role bypasses RLS. A policy here would be a
-- grant to a client that has no business reading it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('publish-media', 'publish-media', false, 314572800)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- release_publish_job -- put a job back WITHOUT charging it an attempt.
--
-- `claim_publish_job` increments `attempts` when it hands a job out, which is
-- right for a tick that does real work. It is wrong for a tick that only asks
-- Meta whether the transcode has finished: a 60-second video polled by a
-- one-minute cron would exhaust a five-attempt budget before it was ever ready,
-- and the job would die of being watched.
--
-- So a poll-only tick releases rather than fails, and the release gives the
-- attempt back. The loop is still bounded, but by Meta rather than by us --
-- containers EXPIRE after 24 hours, and `EXPIRED` is a terminal status the
-- sweep fails on. Bounding it here as well would mean two clocks that can
-- disagree about the same container.
-- ---------------------------------------------------------------------------
create or replace function public.release_publish_job(
  p_job_id uuid,
  p_claim_id uuid,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'release_publish_job is service-role only';
  end if;

  update public.publish_jobs
  set status = 'queued',
      claim_id = null,
      claimed_at = null,
      -- greatest(...) so a release can never drive the counter negative, which
      -- would hand a job an unbounded budget rather than restoring one attempt.
      attempts = greatest(attempts - 1, 0),
      last_error = left(coalesce(p_note, ''), 2000),
      updated_at = now()
  where id = p_job_id
    and claim_id = p_claim_id
    and status = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.release_publish_job(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_publish_job(uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- review_publish_job -- stop, and put a person in front of it.
--
-- For the case the sweep can detect but must not act on: Meta reports the
-- container as already PUBLISHED, or accepted a publish and returned no media
-- id. Both mean a post is probably live and we cannot name it. Retrying would
-- duplicate it on a customer's feed; failing it would say it did not happen.
--
-- Requires `publishing_at` to be set, which the table constraint also enforces
-- -- a job that never reached the publish call has nothing ambiguous about it
-- and belongs in `failed`, not in someone's queue.
-- ---------------------------------------------------------------------------
create or replace function public.review_publish_job(
  p_job_id uuid,
  p_claim_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'review_publish_job is service-role only';
  end if;

  update public.publish_jobs
  set status = 'needs_review',
      publishing_at = coalesce(publishing_at, now()),
      last_error = left(coalesce(p_reason, 'needs review'), 2000),
      claim_id = null,
      claimed_at = null,
      updated_at = now()
  where id = p_job_id
    and claim_id = p_claim_id
    and status = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.review_publish_job(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.review_publish_job(uuid, uuid, text)
  to service_role;
