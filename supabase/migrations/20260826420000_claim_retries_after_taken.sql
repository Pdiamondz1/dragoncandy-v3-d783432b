-- Losing a race for ONE job must not abandon the whole due backlog.
--
-- ===========================================================================
-- WHAT CODEX FOUND
-- ===========================================================================
--
-- Two sweep invocations overlap. Both select the same oldest queued job on the
-- unlocked read; the loser blocks on the advisory lock, re-reads inside it,
-- finds the row already `claimed`, and returns `reason = 'taken'`. Both sweeps
-- end their run on any reason other than `rate_limited` -- so the loser stops,
-- leaving every other due job for the next tick even though nothing was
-- contended but the one row it happened to pick first.
--
-- THIS IS THE NORMAL CASE, NOT AN EXOTIC ONE. The cron runs every minute and
-- the claim TTL is fifteen, so a tick that takes longer than sixty seconds --
-- which any Meta call can -- overlaps the next by construction. The queue would
-- quietly drain at a fraction of its intended rate, and the symptom is "posts
-- are going out late" with nothing in any log to explain it.
--
-- ===========================================================================
-- RETRY INSIDE THE RPC, NOT IN THE CALLERS
-- ===========================================================================
--
-- The alternative was to return the taken job's id so each sweep could add it
-- to its skip list and continue. That works and is worse: "the job I picked was
-- taken" is an internal detail of "give me a claimable job", and putting the
-- recovery in the callers means two copies of it, which is the drift #540
-- recorded. It also spends a round trip per contended row.
--
-- The bound is five, and it is generous rather than arbitrary. The window is
-- only between the unlocked select and the locked re-read: once the winner
-- commits, the loser's NEXT select sees `status = 'claimed'` and the row is
-- excluded by the filter, so one retry almost always suffices. `v_tried` exists
-- for the residual case where a row is claimed and released between two
-- iterations -- without it, that row could be picked repeatedly.
--
-- Exhausting all five means contention heavy enough that stopping is the right
-- answer: the other sweep is doing the work, and the next tick is sixty seconds
-- away. So `taken` survives as a return value; it just stops meaning "the first
-- row I looked at was busy".
--
-- KNOWN AND ACCEPTED: a contended iteration leaves its advisory lock held for
-- the rest of this (short) transaction, so up to five account locks can be held
-- rather than one. They are per platform+account and released at commit, and
-- the alternative -- releasing early -- would need session-level locks, which
-- do not release on rollback and would strand an account after any error.

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
  v_tried uuid[] := '{}';
  v_candidate uuid;
  v_attempt integer;
  v_got boolean := false;
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
  -- Bounded retry, because losing a race for ONE job says nothing about the
  -- rest of the queue. Both sweeps end their run on any reason other than
  -- `rate_limited`, so a single `taken` used to abandon the whole due backlog
  -- -- and with a one-minute cron and a fifteen-minute claim TTL, overlapping
  -- invocations are the normal case rather than an exotic one.
  --
  -- Retrying here rather than in the callers, because "the job I picked was
  -- taken" is an internal detail of "give me a claimable job", and putting it
  -- in the callers means two copies that drift.
  --
  -- Five is generous rather than arbitrary. The window is only between the
  -- unlocked select and the locked re-read: once the winner commits, the loser's
  -- NEXT select sees `status = 'claimed'` and skips that row on the filter, so
  -- one retry almost always suffices. Exhausting five means contention heavy
  -- enough that stopping is the right answer -- the other sweep is doing the
  -- work, and the next tick is sixty seconds away.
  for v_attempt in 1..5 loop
    select * into v_job
    from public.publish_jobs
    where status = 'queued'
      and scheduled_at <= now()
      and attempts < p_max_attempts
      and (p_platform is null or platform = p_platform)
      and not (account_key = any (coalesce(p_skip_account_keys, '{}')))
      and not (id = any (coalesce(p_skip_job_ids, '{}')))
      and not (id = any (v_tried))
    order by scheduled_at
    limit 1;

    if not found then
      return jsonb_build_object('claimed', false, 'reason', 'nothing due',
                                'reclaimed', v_reclaimed, 'flagged', v_flagged,
                                'expired', v_expired);
    end if;

    -- Captured BEFORE the re-read: a `select into` that finds nothing leaves
    -- every field of `v_job` null, so reading `v_job.id` afterwards to record
    -- what was tried would record nothing and loop on the same row five times.
    v_candidate := v_job.id;
    v_tried := v_tried || v_candidate;

    perform pg_advisory_xact_lock(hashtext(v_job.platform || ':' || v_job.account_key));

    -- Re-read inside the lock. Acting on the unlocked read is the defect
    -- `20260825150000` shipped and `20260825160000` corrected.
    select * into v_job
    from public.publish_jobs
    where id = v_candidate
      and status = 'queued'
      and scheduled_at <= now()
      and attempts < p_max_attempts;

    if found then
      v_got := true;
      exit;
    end if;
  end loop;

  if not v_got then
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
