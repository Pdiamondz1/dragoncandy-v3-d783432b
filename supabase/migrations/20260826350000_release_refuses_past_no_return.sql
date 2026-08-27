-- `release_publish_job` now REFUSES a job that is past the point of no return.
--
-- ===========================================================================
-- WHAT CODEX FOUND, AND WHAT IS ACTUALLY TRUE
-- ===========================================================================
--
-- The finding: a rate-limit response from `media_publish` would reach the
-- sweep's `release` branch with `publishing_at` already stamped, requeue the
-- job carrying a stale marker, and have the janitor later escalate a
-- definitively-unpublished job to `needs_review`.
--
-- **That path is not reachable today**, and the trace is worth recording so the
-- next reader does not re-derive it. After `begin_publish_step`, the publish
-- call has its own catch, and the only error it rethrows to the outer handler
-- is one that PROVES nothing was published. `rate_limited` is deliberately not
-- on that list -- it was excluded, with a test pinning the exclusion -- so a
-- throttled publish goes to `review_publish_job`, never to `release`. The two
-- `release` call sites are the transcode poll, which runs BEFORE the marker is
-- stamped, and the outer rate-limit branch, which the inner catch prevents
-- reaching after it.
--
-- So the bug as described does not exist. The FRAGILITY does: nothing stops the
-- next person wiring a release into a post-marker path, and `release_publish_job`
-- would silently do exactly what the finding describes.
--
-- ===========================================================================
-- REFUSING RATHER THAN CLEARING
-- ===========================================================================
--
-- The obvious fix is to clear `publishing_at` on release, mirroring what
-- `fail_publish_job` does. It is the wrong one. Clearing makes a misuse pass
-- QUIETLY -- the caller gets `true`, the job goes back on the queue, and if the
-- publish really had gone out it is now eligible to go out again. That is
-- trading a detectable problem for an undetectable one, on the single action in
-- this product that cannot be undone.
--
-- Release means "give the attempt back, nothing happened". A job whose
-- `publishing_at` is set is a job for which that sentence is not known to be
-- true. So the function returns false and changes nothing: the row stays
-- `claimed`, the janitor reclaims it by TTL, reads the marker, and routes it to
-- `needs_review` -- which is the conservative answer the design already has for
-- exactly this uncertainty.
--
-- The wrong call site then shows up as a job that stops rather than as a
-- duplicate post, which is the right way round.

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
    and status = 'claimed'
    -- THE NEW CONDITION. Past the point of no return, "nothing happened" is not
    -- a claim anyone can make, so this refuses instead of normalising it. The
    -- row stays `claimed` and the janitor sends it to `needs_review`.
    and publishing_at is null;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.release_publish_job(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_publish_job(uuid, uuid, text)
  to service_role;
