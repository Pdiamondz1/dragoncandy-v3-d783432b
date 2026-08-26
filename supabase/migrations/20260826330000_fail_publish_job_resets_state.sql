-- `fail_publish_job` requeued a job without resetting the state that made the
-- retry pointless, or worse, misleading (Codex round 5).
--
-- ===========================================================================
-- 1. A stale `publishing_at` turned a SAFE retry into a false ambiguity
-- ===========================================================================
--
-- `publishing_at` means "the publish call was issued, so a post may be live".
-- The janitor reads it: a claim that expires with the stamp set goes to
-- `needs_review` rather than back to the queue.
--
-- But a job can reach the publish call, be DEFINITIVELY rejected by Meta (a 4xx
-- carrying an error code -- understood, refused, nothing created), and be
-- correctly requeued. The stamp survived that requeue. So if the NEXT claim
-- expired for any reason -- a slow tick, a deploy -- the janitor would read a
-- marker left over from a call that provably created nothing and send the job
-- to a human as "a post may already be live".
--
-- The fix needs no new parameter, because requeueing and clearing the marker
-- are the SAME decision. `fail_publish_job` is only ever reached on a path the
-- caller has judged safe to retry; the ambiguous path calls `review_publish_job`
-- instead. So the requeue branch clears the stamp and the `stuck` branch keeps
-- it -- there, a person is going to look, and the stamp is evidence.
--
-- ===========================================================================
-- 2. A dead container was retried against itself
-- ===========================================================================
--
-- When Meta reports a container as `ERROR` or `EXPIRED`, the job was requeued
-- with `ig_container_id` still set. The next tick polled the same permanently
-- dead container, got the same answer, and burned an attempt -- five times,
-- arriving at `stuck` having done nothing but wait.
--
-- Resuming from a stored container is right in general: it is what stops a
-- retry building a SECOND container and publishing twice. It is wrong for a
-- container that can never finish, and those two cases were not distinguished.
--
-- `p_clear_container` distinguishes them, and the default is false so the
-- safe-by-default behaviour is the one a caller gets by saying nothing.
--
-- Clearing rather than failing terminally, deliberately. `EXPIRED` is a
-- genuinely recoverable state -- a container aged out after 24 hours and a
-- fresh one would work -- so a terminal failure there would throw away a post
-- that only needed rebuilding. `ERROR` is more often permanent, but not always
-- (Meta reports a transient media-download failure the same way), so it keeps
-- its retries and reaches `stuck` on its own if it really is permanent.
-- Clearing the container is what makes either retry able to do anything at all.
--
-- DROPPED, not replaced: a different parameter list makes an OVERLOAD, so the
-- four-argument version would survive alongside this one and a caller that had
-- not moved would keep getting the version that resets nothing.

drop function if exists public.fail_publish_job(uuid, uuid, text, integer);

create or replace function public.fail_publish_job(
  p_job_id uuid,
  p_claim_id uuid,
  p_error text,
  p_max_attempts integer,
  p_clear_container boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_status text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'fail_publish_job is service-role only';
  end if;

  update public.publish_jobs
  set last_error = left(coalesce(p_error, 'unknown'), 2000),
      claim_id = null,
      claimed_at = null,
      status = case when attempts >= p_max_attempts then 'stuck' else 'queued' end,
      -- Cleared only on the requeue branch. Reaching this function at all means
      -- the caller judged a retry safe, and a retry is safe only if nothing was
      -- published -- so the marker that says otherwise must not survive. On the
      -- `stuck` branch it is kept, because a person is about to read the row and
      -- "we got as far as issuing the publish call" is the most useful thing on
      -- it.
      publishing_at = case
                        when attempts >= p_max_attempts then publishing_at
                        else null
                      end,
      -- Only when the caller says the container is dead. Resuming from a stored
      -- container is what stops a retry building a second one and publishing
      -- twice; that protection has to stay on by default and be waived
      -- explicitly.
      ig_container_id = case
                          when p_clear_container and attempts < p_max_attempts then null
                          else ig_container_id
                        end,
      updated_at = now()
  where id = p_job_id
    and claim_id = p_claim_id
    and status = 'claimed'
  returning attempts, status into v_attempts, v_status;

  if v_status is null then
    return 'no_op';
  end if;

  return v_status;
end;
$$;

revoke execute on function public.fail_publish_job(uuid, uuid, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_publish_job(uuid, uuid, text, integer, boolean)
  to service_role;
