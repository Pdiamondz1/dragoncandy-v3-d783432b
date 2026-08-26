-- Two holes the Codex second review found in the two migrations above, both
-- real, both closed here rather than by editing an applied file.
--
-- ===========================================================================
-- 1. `enqueue_publish_job` accepted ANY plain path, including someone else's
-- ===========================================================================
--
-- The RPC is granted to `authenticated` -- it has to be, because it takes its
-- identity from `auth.uid()` and there is no id parameter to point elsewhere.
-- But the only rule it applied to `p_media_paths` was "not URL-shaped", and the
-- ownership check lived one layer up, in the edge function, where the caller's
-- own credential signs the source object before the service role copies it.
--
-- A caller who skips the edge function and calls the RPC directly skips that
-- check with it. Handed `<someone-else-uuid>/<batch>/0.jpg` -- a path already
-- staged in `publish-media` by another user -- it would queue THAT file for
-- publication to the CALLER'S Instagram account. Another tenant's approved,
-- unpublished content, posted on someone else's feed.
--
-- The batch uuid makes the path hard to guess, and hard to guess is not
-- authorization. That is the `outstand_post_ownership` lesson verbatim:
-- provider ids there were five low-entropy characters, so guessing beat
-- knowing, and the fix was to make the binding server-established rather than
-- to rely on the id being obscure.
--
-- The fix is exact rather than heuristic, because the staging path is chosen by
-- us: `instagram-publish-enqueue` writes `<user-id>/<batch>/<n>.<ext>`, so a
-- path belongs to the caller if and only if it begins with their own
-- `auth.uid()`. Nothing in that predicate comes from the request.
--
-- Note what is NOT done: revoking the grant and moving the call to the service
-- role. That would delete the one property this RPC exists for -- identity from
-- `auth.uid()`, with no id parameter that could ever be pointed at someone
-- else. A service-role caller would have to assert the user id in a parameter,
-- which is exactly the shape every cross-tenant hole in this repo has had.
--
-- ===========================================================================
-- 2. The rate limit counted published posts, and nothing in flight
-- ===========================================================================
--
-- `pg_advisory_xact_lock` is released when its transaction ends, and the claim
-- transaction ends long before Meta is called. So with 99 posts published in
-- the window, two overlapping sweeps take the lock in turn, each counts 99,
-- each claims a DIFFERENT job, and both publish: 101 against Instagram's 100.
--
-- The lock was serialising the count but not reserving anything -- the same
-- shape as the Facebook disconnect defect (`20260825150000` -> `160000`), where
-- the lock covered the count and not the row the count was about.
--
-- So the claim now counts what is IN FLIGHT as well as what is published:
--
--   * `claimed`     -- a claim in hand may become a publish before it is given
--                      back. Granted only under this same lock, so a claim
--                      taken by sweep A is visible to sweep B's count.
--   * `needs_review` -- means "a post may already be live". If it may have
--                      published, it may have spent allowance.
--
-- This deliberately OVER-counts a job that is only polling a transcode, since
-- such a job also holds `claimed` for the length of its tick. That is the safe
-- direction and the direction this project has chosen before: an exclusion
-- predicate over-throttles and annoys one user, an inclusion predicate
-- under-throttles and costs money -- here, a duplicate public post and a
-- tripped platform limit. The over-count also lasts only as long as the tick,
-- because a polling job is released back to `queued`.
--
-- It is still not a hard reservation held to confirmation, and saying so
-- matters: a job that is claimed, counted, and then fails still consumed a slot
-- in this arithmetic until it is released. The alternative -- a durable
-- per-account quota row carried through confirmation -- is a bigger mechanism
-- than the 100/day cap warrants for a platform with one connected account, and
-- it would need its own reconciliation for the case it exists to guard. Written
-- down rather than left as an implied guarantee.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_publish_job(
  p_content_type text,
  p_media_paths text[],
  p_scheduled_at timestamptz default null,
  p_caption text default null,
  p_source_schedule_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_conn public.instagram_account_connections%rowtype;
  v_path text;
  v_job_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('enqueued', false, 'reason', 'authentication required');
  end if;

  if p_content_type not in ('feed', 'reels', 'stories') then
    return jsonb_build_object('enqueued', false, 'reason', 'unsupported content_type');
  end if;

  -- Instagram DISCARDS a caption on a stories container. Refusing here is the
  -- difference between an owner knowing their story has no text and believing
  -- it has some.
  if p_content_type = 'stories' and p_caption is not null then
    return jsonb_build_object('enqueued', false, 'reason', 'stories cannot carry a caption');
  end if;

  if p_media_paths is null or array_length(p_media_paths, 1) is null then
    return jsonb_build_object('enqueued', false, 'reason', 'no media');
  end if;

  foreach v_path in array p_media_paths loop
    if v_path is null or v_path = '' then
      return jsonb_build_object('enqueued', false, 'reason', 'empty media path');
    end if;

    -- A path, never a URL. Instagram fetches the media from whatever we hand
    -- it, so a caller-supplied URL would publish arbitrary remote content under
    -- our app's credentials. Checked by EXCLUSION -- reject anything URL-shaped
    -- -- rather than by matching an allowed prefix, because an allowlist
    -- silently admits a newly-added scheme.
    if position('://' in v_path) > 0 or v_path like '//%' then
      return jsonb_build_object('enqueued', false, 'reason', 'media must be a storage path, not a URL');
    end if;

    -- THE OWNERSHIP CHECK. Staged media is written as `<user-id>/<batch>/<n>`,
    -- so a path is the caller's if and only if it starts with their own
    -- `auth.uid()`. Nothing in this predicate comes from the request, which is
    -- what makes it unforgeable rather than merely hard to guess.
    if v_path not like v_user::text || '/%' then
      return jsonb_build_object('enqueued', false, 'reason', 'media does not belong to you');
    end if;

    -- Storage keys are literal and do not normalise, so `..` is only ever a
    -- directory name and cannot escape the prefix above. Refused anyway: a path
    -- containing it is not something this product ever writes, so it is a
    -- caller doing something the prefix check is the last line against.
    if position('..' in v_path) > 0 then
      return jsonb_build_object('enqueued', false, 'reason', 'invalid media path');
    end if;
  end loop;

  select * into v_conn
  from public.instagram_account_connections
  where user_id = v_user;

  if not found then
    return jsonb_build_object('enqueued', false, 'reason', 'no Instagram account connected');
  end if;

  if v_conn.status <> 'active' then
    return jsonb_build_object('enqueued', false, 'reason', 'connection is not active');
  end if;

  insert into public.publish_jobs (
    user_id, acting_user_id, connection_id, ig_user_id,
    content_type, caption, media_paths, scheduled_at, source_schedule_id
  )
  values (
    v_user, v_user, v_conn.id, v_conn.ig_user_id,
    p_content_type, p_caption, p_media_paths,
    -- "post now" is a schedule whose time has already arrived.
    coalesce(p_scheduled_at, now()),
    p_source_schedule_id
  )
  returning id into v_job_id;

  return jsonb_build_object('enqueued', true, 'job_id', v_job_id);
end;
$$;

revoke execute on function public.enqueue_publish_job(text, text[], timestamptz, text, uuid)
  from public, anon;
grant execute on function public.enqueue_publish_job(text, text[], timestamptz, text, uuid)
  to authenticated, service_role;

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
  -- Outside the per-account lock: each UPDATE is atomic on its own row and
  -- idempotent, so two sweeps running it at once reach the same state, and this
  -- pass has to cover every account rather than the one about to be claimed.
  --
  -- The ambiguous case runs FIRST. Reversed, a row whose publish may have
  -- landed would be moved back to `queued` by the safe branch and become
  -- eligible for a second attempt in the same call.
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

  -- Re-read inside the lock. Acting on the unlocked read is the defect
  -- `20260825150000` shipped and `20260825160000` corrected.
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

  -- Counted inside the lock, and counting IN-FLIGHT work as well as published
  -- work. The lock ends with this transaction, long before Meta is called, so
  -- counting only `published` lets two overlapping sweeps each see 99, each
  -- claim a different job, and both publish. See this file's header.
  select count(*) into v_recent
  from public.publish_jobs
  where ig_user_id = v_job.ig_user_id
    and (
      (status = 'published' and published_at > now() - make_interval(secs => p_rate_window_seconds))
      or status = 'claimed'
      or (status = 'needs_review'
          and publishing_at > now() - make_interval(secs => p_rate_window_seconds))
    );

  if v_recent >= p_rate_limit then
    -- Not a failure. The job is good; the account is out of allowance, so it
    -- waits rather than burning an attempt. `ig_user_id` is returned so the
    -- caller can skip this account and ask again instead of stalling the whole
    -- platform behind one.
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
