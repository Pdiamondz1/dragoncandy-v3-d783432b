-- `claim_publish_job` gains a per-job skip list (Codex round 3, P2).
--
-- WHY
--
-- Advancing a job one step per tick is the whole scheduling model, and the
-- sweep could not actually honour it. `record_publish_container` and
-- `release_publish_job` both return a job to `queued` with its ORIGINAL
-- `scheduled_at`, so the moment it is released it is the oldest due job again
-- and the very next iteration of the same run claims it back. One cron
-- invocation would spend all ten of its iterations polling ONE container within
-- a few seconds -- Graph API traffic for nothing, and every other due job
-- starved behind it.
--
-- Fixed the same way the head-of-line problem was: the caller passes what it
-- has already handled and asks again. Two skip lists rather than one because
-- they mean different things -- `p_skip_ig_user_ids` is "this ACCOUNT is out of
-- allowance, do not offer me anything of its", `p_skip_job_ids` is "I have
-- already moved THIS job this tick, give me a different one, including another
-- of the same account's".
--
-- Rejected alternative: re-dating `scheduled_at` on release. That would make
-- the queue's ordering a function of how often it was polled rather than of
-- when the owner asked for the post -- a job released a few times would sink
-- behind everything, and `scheduled_at` would stop meaning "when this may be
-- released". The knowledge belongs to the run, so it lives in the run.
--
-- DROPPED, not overloaded: a different parameter list creates an OVERLOAD, so
-- the five-argument version would survive alongside this one and a caller that
-- had not moved would keep getting the version with no job skip list. Same
-- lesson the TikTok bigint widening recorded about return types.

drop function if exists public.claim_publish_job(integer, integer, integer, integer, text[]);

create or replace function public.claim_publish_job(
  p_claim_ttl_seconds integer,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_max_attempts integer,
  p_skip_ig_user_ids text[] default '{}',
  p_skip_job_ids uuid[] default '{}'
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
    and not (id = any (coalesce(p_skip_job_ids, '{}')))
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
  -- claim a different job, and both publish. See `20260826290000`.
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

revoke execute on function public.claim_publish_job(integer, integer, integer, integer, text[], uuid[])
  from public, anon, authenticated;
grant execute on function public.claim_publish_job(integer, integer, integer, integer, text[], uuid[])
  to service_role;
