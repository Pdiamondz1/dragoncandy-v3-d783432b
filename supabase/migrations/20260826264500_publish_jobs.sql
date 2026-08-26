-- ---------------------------------------------------------------------------
-- publish_jobs -- the server-owned queue for native Instagram publishing.
--
-- Design: docs/superpowers/specs/2026-08-26-instagram-native-publishing-design.md
--
-- ===========================================================================
-- WHY THIS IS A NEW TABLE AND NOT `donny_scheduled_posts`
-- ===========================================================================
--
-- The obvious queue is `donny_scheduled_posts`. It must not be used, and the
-- reason is measured rather than assumed. On prod, 2026-08-26:
--
--   * `anon` AND `authenticated` hold INSERT, SELECT and UPDATE on ALL 19
--     columns of that table.
--   * Its UPDATE policy is `USING (user_id = auth.uid())` with NO `WITH CHECK`,
--     so Postgres defaults the check to the USING expression. That pins
--     `user_id` and constrains nothing else.
--
-- So a client may write or rewrite `media_urls`, `caption`, `status`,
-- `campaign_id` and `scheduled_at` at will. Today that is harmless: publishing
-- goes through Outstand carrying the user's own session, so the table is a
-- RECORD of a plan, not an instruction. The moment a cron publishes what it
-- finds there, a client-writable row becomes a real public post:
--
--   1. `media_urls` could name any host on the internet, and Instagram fetches
--      media from a URL we hand it -- so our credentials would publish content
--      we never stored and never saw.
--   2. `campaign_id` is unconstrained -- the same forgery shape as
--      `outstand_post_ownership`, where a client-asserted id let one tenant file
--      another tenant's metrics. There it cost a mis-filed measurement; here it
--      would attribute a real public post to someone else's campaign.
--   3. `status` is writable, so a published row can be moved back to
--      `scheduled` and published again.
--
-- Locking that table down with column grants was considered and REJECTED: it
-- has live client writers using runtime-computed partial updates, which the
-- identity slice already recorded as a silent-42501-in-production trap.
--
-- THE RULE, which this project has now paid for twice: the thing that
-- authorises an irreversible action is established by the SERVER, never
-- asserted by a client. `donny_scheduled_posts` stays the user's schedule and
-- is never read by the publisher; `source_schedule_id` below is audit only.
--
-- ===========================================================================
-- PUBLISHING IS LIKE PAYING
-- ===========================================================================
--
-- It is irreversible, public, and must happen exactly once. So this follows
-- `pending_balance_flushes` rather than anything in the read-only connectors:
-- claim under an advisory lock, and write the durable marker AFTER the side
-- effect, never before. `ig_media_id` is that marker -- it comes from Meta, so
-- "marker set => it published" holds by construction. A pre-claim would leave a
-- job marked published that never posted, or publish twice.
-- ---------------------------------------------------------------------------

create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),

  -- WHOSE account this publishes to.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- WHO enqueued it. v1 requires acting_user_id = user_id; this column is the
  -- delegation seam (`delegated_posting_permissions` exists for a business
  -- posting on a creator's behalf) so that adding delegation later changes one
  -- predicate instead of retrofitting the table. Deliberately NOT collapsed
  -- into user_id today -- cross-tenant authorization is where this codebase has
  -- found the most live holes (four in `outstand-proxy` alone), and publishing
  -- is the worst place to get that predicate wrong.
  acting_user_id uuid not null references auth.users(id) on delete cascade,

  connection_id uuid not null references public.instagram_account_connections(id) on delete cascade,

  -- Denormalised on purpose, and NOT redundant with connection_id.
  -- `instagram_account_connections` is upserted per user, so reconnecting to a
  -- DIFFERENT Instagram account reuses the row. A job queued for account A must
  -- refuse to publish to account B -- the same rule `cache_tiktok_insights`
  -- enforces by returning `account_changed`, and the same failure it prevents:
  -- a real post attributed to the wrong subject is a fabrication even though
  -- every byte of it is genuine.
  ig_user_id text not null,

  content_type text not null check (content_type in ('feed', 'reels', 'stories')),

  -- Null for stories. Instagram silently DISCARDS a caption on a STORIES
  -- container, so accepting one would let an owner believe their story carried
  -- text it never had. Enforced below rather than left to the caller.
  caption text,

  -- Paths in OUR storage bucket, never external URLs. `enqueue_publish_job`
  -- rejects anything containing '://' -- see the check there. The copy into our
  -- bucket happens in the edge function before enqueue, because SQL cannot
  -- fetch.
  media_paths text[] not null check (array_length(media_paths, 1) >= 1),

  -- NOT NULL, and "post now" writes now() rather than null. One predicate
  -- (`scheduled_at <= now()`) then serves both cases, so an immediate post is
  -- simply a schedule whose time has already arrived -- rather than a second
  -- code path through the sweep, which is how the common case ends up being the
  -- one with less coverage.
  scheduled_at timestamptz not null,

  status text not null default 'queued'
    check (status in ('queued', 'claimed', 'published', 'failed', 'stuck')),

  -- Meta's container id, from step 1 of the three-step publish. Persisted so a
  -- resumed job builds no SECOND container: publishing is
  -- create -> poll until FINISHED -> publish, and a sweep that lost its claim
  -- mid-poll must continue, not restart.
  ig_container_id text,

  -- Set ONLY after `media_publish` returns. This is the proof.
  ig_media_id text,
  published_at timestamptz,

  attempts integer not null default 0,
  last_error text,

  claimed_at timestamptz,
  claim_id uuid,

  -- Audit only. NEVER read for content -- see the header.
  source_schedule_id uuid references public.donny_scheduled_posts(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A story cannot carry a caption; everything else may.
  constraint publish_jobs_stories_have_no_caption
    check (content_type <> 'stories' or caption is null),

  -- The marker and its timestamp move together or not at all.
  constraint publish_jobs_media_id_pairs_with_time
    check ((ig_media_id is null) = (published_at is null)),

  -- `published` is the one status that requires the proof. Without this a bug
  -- could mark a job published with no media id, and the acceptance signal --
  -- "a row can be written without Meta ever being called; a media id cannot" --
  -- would stop meaning anything.
  constraint publish_jobs_published_has_media_id
    check (status <> 'published' or ig_media_id is not null)
);

-- The sweep's only hot path.
create index if not exists idx_publish_jobs_due
  on public.publish_jobs (scheduled_at)
  where status = 'queued';

-- Reclaiming stuck claims, and the per-account rate window.
create index if not exists idx_publish_jobs_claimed
  on public.publish_jobs (claimed_at)
  where status = 'claimed';

create index if not exists idx_publish_jobs_account_published
  on public.publish_jobs (ig_user_id, published_at)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- Lockdown. Identical posture to the five connector tables.
--
-- RLS enabled with ZERO policies for any role, PLUS table-level revocation.
-- Grants and RLS are independent gates, so a future migration that re-grants
-- the table still hits RLS-with-no-policy.
--
-- TABLE level, not column level: a column-level REVOKE is a documented no-op
-- against Supabase's ambient table-wide GRANT, and this repo has FOUR recorded
-- instances of that exact no-op (20260507130028, 20260523234847,
-- 20260804174854, 20260805163247).
-- ---------------------------------------------------------------------------
alter table public.publish_jobs enable row level security;

revoke all on public.publish_jobs from public, anon, authenticated;
grant all on public.publish_jobs to service_role;

-- ---------------------------------------------------------------------------
-- enqueue_publish_job -- the ONLY way a job is created.
--
-- Identity comes from auth.uid() and there is NO id parameter, so there is
-- nothing to point at another user (the `dre_my_standing` / `x_connection_status`
-- pattern). In v1 acting_user_id and user_id are therefore equal by
-- construction rather than by a check that could be edited out later.
--
-- Called from an edge function AFTER it has copied the media into our bucket.
-- SQL cannot fetch, so the copy cannot happen here -- but the rejection of
-- anything URL-shaped can, and does. That check is the whole reason a client
-- cannot make our credentials publish a stranger's file.
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

  -- The load-bearing check. A path, never a URL: Instagram fetches the media
  -- from whatever we hand it, so accepting a caller-supplied URL would let a
  -- client publish arbitrary remote content under our app's credentials.
  -- Checked by EXCLUSION (reject anything URL-shaped) rather than by matching
  -- an allowed prefix -- an allowlist silently admits a newly-added bucket,
  -- while this refuses anything that is not a plain path.
  foreach v_path in array p_media_paths loop
    if v_path is null or v_path = '' then
      return jsonb_build_object('enqueued', false, 'reason', 'empty media path');
    end if;
    if position('://' in v_path) > 0 or v_path like '//%' then
      return jsonb_build_object('enqueued', false, 'reason', 'media must be a storage path, not a URL');
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

-- ---------------------------------------------------------------------------
-- claim_publish_job -- hand exactly one due job to one sweep run.
--
-- The advisory lock is keyed on the INSTAGRAM ACCOUNT, not on the job and not
-- on the user: ordering and the rate window are both per-account, and a lock
-- that does not cover the thing being counted does not serialise the count.
-- One key for every operation on a grant is the X-connector round-7 lesson --
-- three different keys meant three operations on one grant serialised against
-- nothing.
--
-- THE RATE LIMIT IS COUNTED INSIDE THE LOCK, and that is the point of doing it
-- in SQL at all. Instagram allows 100 API-published posts per rolling 24 hours
-- per account, all content types combined. Counting in the edge function and
-- then acting on the count is check-then-act: N concurrent sweeps all read 99
-- and all publish. Same shape as `reserve_phone_verification_send`, which
-- exists because the TypeScript version of that check raced.
--
-- Claims are reclaimed by TTL rather than held: publishing is three HTTP calls
-- with an asynchronous transcode between them, so a claim held across the whole
-- sequence would be held across a slow poll -- and a lock only helps while it
-- is held. The sweep advances a job one step per tick.
-- ---------------------------------------------------------------------------
create or replace function public.claim_publish_job(
  p_claim_ttl_seconds integer,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_max_attempts integer
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
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'claim_publish_job is service-role only';
  end if;

  -- Pick a candidate WITHOUT the lock, only to learn which account to lock.
  -- The row is then re-read inside the lock below. Reading it once and acting
  -- on that read is the defect `20260825150000` shipped and `20260825160000`
  -- corrected on the Facebook disconnect: the lock serialised the count but not
  -- the row the count was about.
  select * into v_job
  from public.publish_jobs
  where status = 'queued'
    and scheduled_at <= now()
    and attempts < p_max_attempts
  order by scheduled_at
  limit 1;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'nothing due');
  end if;

  perform pg_advisory_xact_lock(hashtext('ig_publish:' || v_job.ig_user_id));

  -- Re-read inside the lock. Another sweep may have taken it.
  select * into v_job
  from public.publish_jobs
  where id = v_job.id
    and status = 'queued'
    and scheduled_at <= now()
    and attempts < p_max_attempts;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'taken');
  end if;

  select count(*) into v_recent
  from public.publish_jobs
  where ig_user_id = v_job.ig_user_id
    and status = 'published'
    and published_at > now() - make_interval(secs => p_rate_window_seconds);

  if v_recent >= p_rate_limit then
    -- Deliberately NOT a failure. The job is still good; the account is simply
    -- out of allowance, so it waits rather than burning an attempt.
    return jsonb_build_object('claimed', false, 'reason', 'rate_limited',
                              'recent', v_recent);
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
    'ig_container_id', v_job.ig_container_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_publish_container -- persist Meta's container id (step 1 -> step 2).
--
-- Separate from confirm because the transcode poll sits between them. Without
-- this, a job resumed after a lost claim would build a SECOND container and
-- eventually publish twice.
-- ---------------------------------------------------------------------------
create or replace function public.record_publish_container(
  p_job_id uuid,
  p_claim_id uuid,
  p_container_id text
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
    raise exception 'record_publish_container is service-role only';
  end if;

  update public.publish_jobs
  set ig_container_id = p_container_id,
      status = 'queued',
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

-- ---------------------------------------------------------------------------
-- confirm_publish_job -- the marker, written AFTER Meta returned a media id.
--
-- RETURNS BOOLEAN: did THIS call transition the row? An overlapping sweep whose
-- confirm is a no-op must not also write a `social_post_log` row. Exactly the
-- contract `confirm_pending_balance_flush` needed for the same reason
-- (20260723200000).
-- ---------------------------------------------------------------------------
create or replace function public.confirm_publish_job(
  p_job_id uuid,
  p_claim_id uuid,
  p_media_id text
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
    raise exception 'confirm_publish_job is service-role only';
  end if;

  if p_media_id is null or p_media_id = '' then
    raise exception 'confirm_publish_job requires a media id';
  end if;

  update public.publish_jobs
  set status = 'published',
      ig_media_id = p_media_id,
      published_at = now(),
      last_error = null,
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

-- ---------------------------------------------------------------------------
-- fail_publish_job -- release a claim and record why.
--
-- Returns the resulting status. A job that has burned its attempts becomes
-- `stuck` rather than `failed`, and the transition is reported EXACTLY once so
-- an alert fires once rather than on every subsequent sweep -- the
-- `bump_flush_attempt` contract.
-- ---------------------------------------------------------------------------
create or replace function public.fail_publish_job(
  p_job_id uuid,
  p_claim_id uuid,
  p_error text,
  p_max_attempts integer
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

revoke execute on function public.claim_publish_job(integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_publish_job(integer, integer, integer, integer)
  to service_role;

revoke execute on function public.record_publish_container(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_publish_container(uuid, uuid, text)
  to service_role;

revoke execute on function public.confirm_publish_job(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_publish_job(uuid, uuid, text)
  to service_role;

revoke execute on function public.fail_publish_job(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.fail_publish_job(uuid, uuid, text, integer)
  to service_role;
