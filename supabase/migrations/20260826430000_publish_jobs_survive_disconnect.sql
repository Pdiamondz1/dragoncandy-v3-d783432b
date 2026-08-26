-- Disconnecting an account must not DELETE the posts queued for it.
--
-- ===========================================================================
-- WHAT CODEX FOUND, AND WHY IT IS WORSE THAN THE VERSION I FILED AS A SLICE
-- ===========================================================================
--
-- The connection foreign keys were `ON DELETE CASCADE`, so disconnecting a Page
-- or an Instagram account deleted every job queued for it. I had already
-- recorded the consequence I could see -- staged media orphaned in the bucket
-- with nothing referencing it -- and filed it as storage cost, to be swept up
-- later by a reaper.
--
-- That reading was too narrow, and the part I under-weighted is the one that
-- matters:
--
--   THE ROW CAN GO WHILE THE PUBLISH IS IN FLIGHT.
--
--   The sweep loads the connection, stamps `publishing_at`, and calls Meta. The
--   user disconnects in another tab. The cascade removes the row. Meta then
--   publishes -- the post is LIVE -- and `confirm_publish_job` updates zero
--   rows because there is nothing left to update. So does `review_publish_job`,
--   which is the branch written for exactly that failure. The only trace of a
--   public post is a console line.
--
-- That is not storage cost. It is the one outcome this entire design exists to
-- prevent: something published with no durable record that it was.
--
-- The quieter half is bad too. A queued post vanishes with NO terminal status,
-- so nothing ever tells its owner it will not go out. A cancellation that
-- leaves no evidence is indistinguishable from a bug.
--
-- ===========================================================================
-- SET NULL, AND LET THE STATE MACHINE DO ITS JOB
-- ===========================================================================
--
-- The sweep already handles a connection that has gone: `loadConnection`
-- returns null, and it fails the job terminally with "the account this post was
-- queued for is no longer connected". That is the right answer and it was
-- simply unreachable, because the row was deleted before anything could reach
-- it.
--
-- So the FKs become `ON DELETE SET NULL`. The job survives, reaches `stuck`
-- with a sentence naming what happened, and -- because `stuck` is the branch
-- that discards staged media -- takes its bytes with it. One orphan path
-- closed, and it closes the storage half as a side effect rather than needing
-- the reaper for it.
--
-- ===========================================================================
-- THE CHECK HAS TO RELAX; A TRIGGER TAKES OVER WHAT IT USED TO GUARANTEE
-- ===========================================================================
--
-- `publish_jobs_one_connection` demanded exactly one connection matching the
-- platform, which `SET NULL` would violate the instant it fired. Relaxing it to
-- "at most one" loses the real guarantee: a NEW job could be created with none.
--
-- A CHECK cannot tell an INSERT from an UPDATE, so the two rules split. The
-- constraint keeps what is true forever -- a job never carries a connection
-- belonging to the wrong platform, and never two at once -- and a BEFORE INSERT
-- trigger keeps what is only true at creation: a new job names exactly one.
-- Same shape as the `guard_*_verification_columns` triggers, and for the same
-- reason: the rule is about a transition, not about a row.
--
-- `connection_id` (superseded, never written since 20260826340000) keeps its
-- cascade. It is null on every row this code can create, so the cascade cannot
-- fire; changing it would edit a column the no-rename rule already froze, for
-- no behavioural difference.

alter table public.publish_jobs
  drop constraint publish_jobs_instagram_connection_id_fkey,
  add constraint publish_jobs_instagram_connection_id_fkey
    foreign key (instagram_connection_id)
    references public.instagram_account_connections(id) on delete set null;

alter table public.publish_jobs
  drop constraint publish_jobs_facebook_connection_id_fkey,
  add constraint publish_jobs_facebook_connection_id_fkey
    foreign key (facebook_connection_id)
    references public.facebook_page_connections(id) on delete set null;

-- What stays true for the life of a row.
alter table public.publish_jobs drop constraint if exists publish_jobs_one_connection;
alter table public.publish_jobs add constraint publish_jobs_one_connection
  check (
    -- Never a connection from the wrong platform...
    (instagram_connection_id is null or platform = 'instagram')
    and (facebook_connection_id is null or platform = 'facebook')
    -- ...and never two at once. Both null is now legal, and means the account
    -- was disconnected while this job was queued.
    and not (instagram_connection_id is not null and facebook_connection_id is not null)
  );

-- What is only true at creation.
create or replace function public.enforce_publish_job_has_connection()
returns trigger
language plpgsql
as $$
begin
  if NEW.platform = 'instagram' and NEW.instagram_connection_id is null then
    raise exception 'a new instagram publish job must name a connection';
  end if;
  if NEW.platform = 'facebook' and NEW.facebook_connection_id is null then
    raise exception 'a new facebook publish job must name a Page connection';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_publish_jobs_require_connection on public.publish_jobs;
create trigger trg_publish_jobs_require_connection
  before insert on public.publish_jobs
  for each row execute function public.enforce_publish_job_has_connection();

comment on constraint publish_jobs_one_connection on public.publish_jobs is
  'At most one connection, and never one from the wrong platform. Both null means the account was disconnected while this job was queued — see trg_publish_jobs_require_connection for the at-creation rule.';
