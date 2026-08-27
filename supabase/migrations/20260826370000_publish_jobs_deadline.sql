-- A job that is only ever POLLED can never run out of attempts.
--
-- ===========================================================================
-- THE GAP, AND WHY IT WAS INVISIBLE
-- ===========================================================================
--
-- `MAX_ATTEMPTS` bounds failures, and a poll is not a failure. Both sweeps
-- release a job that is still transcoding WITHOUT charging an attempt -- on
-- purpose, since a 60-second video polled by a one-minute cron would otherwise
-- die of being watched -- and `release_publish_job` gives the attempt back. So
-- a job whose media never leaves `processing` is claimed, polled and released
-- for ever: `attempts` oscillates between 0 and 1 and `attempts < p_max_attempts`
-- is true on every tick.
--
-- Nothing caught it because in practice META ends it: an Instagram container
-- EXPIRES after 24 hours and a Facebook upload session reports `expired`, and
-- both sweeps treat those as terminal. The loop is bounded by a third party's
-- behaviour that neither sweep can verify and neither controls.
--
-- FOUND WHILE BUILDING THE FACEBOOK STEP MACHINE, which makes it more
-- reachable rather than newly true. `uploadVideoFromUrl` hands Meta a URL and
-- Meta fetches it on its own schedule; a fetch that never completes leaves a
-- video sitting at `uploading` with no error to report. Instagram's equivalent
-- is Meta failing to download the media, which it does report. Same gap, one
-- platform more likely to reach it.
--
-- This is a PRE-EXISTING gap in the shared machine, not one the Facebook work
-- introduced. It is fixed in the shared machine for the same reason the machine
-- is shared at all.
--
-- ===========================================================================
-- A DEADLINE, NOT A SMARTER ATTEMPT COUNTER
-- ===========================================================================
--
-- Charging an attempt for a poll was the alternative and is wrong: it makes the
-- bound depend on the cron interval, so speeding the sweep up to make posts
-- more punctual would start killing long transcodes. Wall-clock is the thing an
-- owner actually cares about -- "this was due on Tuesday and it is Thursday" --
-- and it is independent of how often we look.
--
-- Measured against `scheduled_at`, which is when the job became DUE. A post
-- scheduled for next week is not late; it has not started.
--
-- 48 hours, deliberately longer than the ~24 Meta takes to expire its own
-- handles. Meta's terminal status stays the PRIMARY mechanism, because it
-- carries a real reason a person can act on; this only catches the case where
-- Meta never says anything at all. A shorter deadline would race Meta and
-- replace good error messages with a generic one.
--
-- ===========================================================================
-- DEFAULTS ON, BECAUSE THE FAILURE MODE OF "OFF" IS THE BUG ITSELF
-- ===========================================================================
--
-- `p_max_age_seconds` could have defaulted to null meaning "no deadline". It
-- does not. This project has already shipped a parameter that was declared and
-- never read (`p_claim_ttl_seconds`, fixed in 20260826270000), where the effect
-- was orphaned claims for ever and nothing looked wrong. A deadline that a
-- future caller silently omits is that defect again with a worse blast radius,
-- so omitting it turns the deadline ON at 48 hours rather than off.
--
-- Both sweeps pass it explicitly anyway, and `publishSweeps.test.ts` asserts
-- they do -- a constant nothing reads is not a control.

drop function if exists public.claim_publish_job(integer, integer, integer, integer, text[], uuid[], text);

create or replace function public.claim_publish_job(
  p_claim_ttl_seconds integer,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_max_attempts integer,
  p_skip_account_keys text[] default '{}',
  p_skip_job_ids uuid[] default '{}',
  p_platform text default null,
  p_max_age_seconds integer default 172800   -- 48h; see the header for why not null
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
  v_expired integer;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'claim_publish_job is service-role only';
  end if;

  -- --- janitor -------------------------------------------------------------
  -- Outside the per-account lock: each UPDATE is atomic on its own row and
  -- idempotent, and this pass has to cover every account rather than the one
  -- about to be claimed. Deliberately NOT scoped to p_platform either -- an
  -- abandoned claim is abandoned whichever queue the caller happens to be
  -- draining, and scoping it would leave the other platform's wreckage until
  -- something else happened to run.
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

  -- --- deadline ------------------------------------------------------------
  -- LAST, and `queued` only. Anything still `claimed` at this age is also past
  -- the claim TTL and has just been routed by the two branches above, so this
  -- never has to reason about a live claim. (If a deadline shorter than the TTL
  -- is ever configured, a claimed job simply waits one TTL longer before this
  -- sees it -- late, never wrong.)
  --
  -- `publishing_at` is routed on rather than assumed: a `queued` row should
  -- never carry one (`fail_publish_job` clears it on the requeue branch,
  -- `release_publish_job` refuses a job that has one, and the safe branch above
  -- requires it to be null), but "should never" is exactly where this project
  -- has been wrong three times. If one exists, it is ambiguous and goes to a
  -- person rather than to the graveyard.
  update public.publish_jobs
  set status = case when publishing_at is not null then 'needs_review' else 'stuck' end,
      last_error = case
        when publishing_at is not null
          then 'Gave up after ' || p_max_age_seconds || 's, with a publish call already issued -- a post may be live. Check the account.'
        else 'Gave up after ' || p_max_age_seconds || 's without the platform ever reporting the media as ready or failed.'
      end,
      claim_id = null,
      claimed_at = null,
      updated_at = now()
  where status = 'queued'
    and scheduled_at < now() - make_interval(secs => p_max_age_seconds);
  get diagnostics v_expired = row_count;

  if v_flagged > 0 then
    raise warning 'publish_jobs: % claim(s) expired mid-publish and need review', v_flagged;
  end if;
  if v_expired > 0 then
    raise warning 'publish_jobs: % job(s) passed the % second deadline and were given up on', v_expired, p_max_age_seconds;
  end if;

  -- --- candidate -----------------------------------------------------------
  select * into v_job
  from public.publish_jobs
  where status = 'queued'
    and scheduled_at <= now()
    and attempts < p_max_attempts
    and (p_platform is null or platform = p_platform)
    and not (account_key = any (coalesce(p_skip_account_keys, '{}')))
    and not (id = any (coalesce(p_skip_job_ids, '{}')))
  order by scheduled_at
  limit 1;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'nothing due',
                              'reclaimed', v_reclaimed, 'flagged', v_flagged,
                              'expired', v_expired);
  end if;

  perform pg_advisory_xact_lock(hashtext(v_job.platform || ':' || v_job.account_key));

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
                              'reclaimed', v_reclaimed, 'flagged', v_flagged,
                              'expired', v_expired);
  end if;

  -- Counted inside the lock, and counting IN-FLIGHT work as well as published
  -- work. The lock ends with this transaction, long before the platform is
  -- called, so counting only `published` lets two overlapping sweeps each see
  -- the limit minus one and both publish. Scoped to the account AND the
  -- platform: an allowance is per account on one platform, never shared.
  select count(*) into v_recent
  from public.publish_jobs
  where platform = v_job.platform
    and account_key = v_job.account_key
    and (
      (status = 'published' and published_at > now() - make_interval(secs => p_rate_window_seconds))
      or status = 'claimed'
      or (status = 'needs_review'
          and publishing_at > now() - make_interval(secs => p_rate_window_seconds))
    );

  if v_recent >= p_rate_limit then
    return jsonb_build_object('claimed', false, 'reason', 'rate_limited',
                              'platform', v_job.platform, 'account_key', v_job.account_key,
                              'recent', v_recent,
                              'reclaimed', v_reclaimed, 'flagged', v_flagged,
                              'expired', v_expired);
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
    'platform', v_job.platform,
    'account_key', v_job.account_key,
    'instagram_connection_id', v_job.instagram_connection_id,
    'facebook_connection_id', v_job.facebook_connection_id,
    'content_type', v_job.content_type,
    'caption', v_job.caption,
    'media_paths', v_job.media_paths,
    'provider_ref', v_job.provider_ref,
    'reclaimed', v_reclaimed,
    'flagged', v_flagged,
    'expired', v_expired
  );
end;
$$;

revoke execute on function public.claim_publish_job(integer, integer, integer, integer, text[], uuid[], text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_publish_job(integer, integer, integer, integer, text[], uuid[], text, integer)
  to service_role;

-- KNOWN AND ACCEPTED: a job given up on by THIS branch keeps its staged media.
-- The sweeps discard staged bytes on the `stuck` transition they themselves
-- cause, and SQL cannot reach Storage. So a deadline expiry leaves a copy in
-- `publish-media` with no reader. That is litter with a storage bill, not a
-- correctness problem, and it is the right way round: a person is about to look
-- at this job, and what they were about to publish is the first thing they will
-- want to see. A bucket sweep over long-dead `stuck`/`needs_review` jobs is its
-- own slice.
